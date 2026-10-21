import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { getConfig } from "../config";
import { appIconId, normalizeListedApps } from "../rea-apps";

const pexec = promisify(execFile);
const TTL_MS = 10 * 60 * 1000;
const CACHE_VERSION = 3;

export interface DesktopApp {
  id: string;
  name: string;
  exe: string;
  /** Public icon URL, when a PNG was extracted. */
  icon: string | null;
}

interface CacheFile {
  version: number;
  scannedAt: number;
  apps: { id: string; name: string; exe: string }[];
}

const LIST_SCRIPT = `
param([Parameter(Mandatory = $true)][string]$OutFile)
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
$apps = New-Object System.Collections.Generic.List[object]
$seen = @{}

function Add-Name([string]$name) {
  if ([string]::IsNullOrWhiteSpace($name)) { return }
  $name = $name.Trim()
  $key = 'name:' + $name.ToLowerInvariant()
  if ($seen.ContainsKey($key)) { return }
  $seen[$key] = $true
  $apps.Add([pscustomobject]@{ name = $name; exe = '' })
}

function Add-App([string]$name, [string]$exe) {
  if ([string]::IsNullOrWhiteSpace($exe)) { return }
  $exe = $exe.Trim().Trim('"')
  $m = [regex]::Match($exe, '(?i)^(.*\\.exe)')
  if ($m.Success) { $exe = $m.Groups[1].Value }
  if (-not (Test-Path -LiteralPath $exe)) { return }
  try { $item = Get-Item -LiteralPath $exe -ErrorAction Stop } catch { return }
  if ($item.PSIsContainer) { return }
  if ($item.Extension -ne '.exe') { return }
  $full = $item.FullName
  $key = $full.ToLowerInvariant()
  if ($seen.ContainsKey($key)) { return }
  if ($key -match '\\\\windows\\\\|\\\\winsxs\\\\|\\\\system32\\\\|\\\\syswow64\\\\|\\\\node_modules\\\\|\\\\windowsapps\\\\') { return }
  $seen[$key] = $true
  if ([string]::IsNullOrWhiteSpace($name)) { $name = [IO.Path]::GetFileNameWithoutExtension($full) }
  $apps.Add([pscustomobject]@{ name = $name.Trim(); exe = $full })
}

function Resolve-ExeToken([string]$raw) {
  if ([string]::IsNullOrWhiteSpace($raw)) { return $null }
  $raw = $raw.Trim()
  if ($raw.StartsWith('"')) {
    $end = $raw.IndexOf('"', 1)
    if ($end -gt 1) { return $raw.Substring(1, $end - 1) }
  }
  $m = [regex]::Match($raw, '(?i)^(.*\\.exe)')
  if ($m.Success) { return $m.Groups[1].Value }
  return $null
}

$reg = @(
  'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
)
foreach ($pattern in $reg) {
  foreach ($row in @(Get-ItemProperty -Path $pattern -ErrorAction SilentlyContinue)) {
    $display = [string]$row.DisplayName
    if ([string]::IsNullOrWhiteSpace($display)) { continue }
    if ($row.SystemComponent -eq 1) { continue }
    if ($display -like 'Security Update*' -or $display -like 'Update for*' -or $display -like 'Hotfix*') { continue }
    $exe = Resolve-ExeToken ([string]$row.DisplayIcon)
    if (-not $exe) {
      $loc = ([string]$row.InstallLocation).Trim().Trim('"')
      if ($loc -and (Test-Path -LiteralPath $loc)) {
        $cands = @(Get-ChildItem -LiteralPath $loc -Filter *.exe -File -ErrorAction SilentlyContinue)
        if ($cands.Count -eq 0) {
          $cands = @(Get-ChildItem -LiteralPath $loc -Filter *.exe -Recurse -Depth 2 -File -ErrorAction SilentlyContinue)
        }
        $best = $cands | Where-Object { $_.Name -notmatch '(?i)unins|setup|update|crash|helper' } | Sort-Object Length -Descending | Select-Object -First 1
        if ($best) { $exe = $best.FullName }
      }
    }
    if ($exe) { Add-App $display $exe }
    Add-Name $display
  }
}

$shell = $null
try { $shell = New-Object -ComObject WScript.Shell } catch {}
if ($shell) {
  $menus = @(
    (Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs'),
    (Join-Path $env:ProgramData 'Microsoft\\Windows\\Start Menu\\Programs')
  )
  foreach ($menu in $menus) {
    if (-not $menu -or -not (Test-Path -LiteralPath $menu)) { continue }
    Get-ChildItem -LiteralPath $menu -Filter *.lnk -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
      try {
        $sc = $shell.CreateShortcut($_.FullName)
        $target = [string]$sc.TargetPath
        if ($target -and $target.ToLowerInvariant().EndsWith('.exe')) { Add-App $_.BaseName $target }
        Add-Name $_.BaseName
      } catch {}
    }
  }
}

function Add-ElectronRoot([string]$root, [int]$depth) {
  if ([string]::IsNullOrWhiteSpace($root)) { return }
  if (-not (Test-Path -LiteralPath $root)) { return }
  Get-ChildItem -LiteralPath $root -Filter *.exe -Recurse -Depth $depth -File -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.Name -match '(?i)^(unins|uninstall|setup|update|crashpad|notification_helper|squirrel)') { return }
    $dir = $_.DirectoryName
    $asar = Join-Path $dir 'resources\\app.asar'
    $folder = Join-Path $dir 'resources\\app'
    if ((Test-Path -LiteralPath $asar) -or (Test-Path -LiteralPath $folder)) { Add-App $_.BaseName $_.FullName }
  }
}

$skipTop = '(?i)^(microsoft|google|mozilla|packages|temp|tmp|npm|npm-cache|pnpm|yarn|pip|nuget|package cache|crashdumps|d3dscache|fontconfig)$'
if ($env:LOCALAPPDATA -and (Test-Path -LiteralPath $env:LOCALAPPDATA)) {
  Get-ChildItem -LiteralPath $env:LOCALAPPDATA -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.Name -match $skipTop) { return }
    Add-ElectronRoot $_.FullName 3
  }
}
Add-ElectronRoot $env:ProgramFiles 3
$pf86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
if ($pf86) { Add-ElectronRoot $pf86 2 }
$desks = @(
  [Environment]::GetFolderPath('Desktop'),
  [Environment]::GetFolderPath('CommonDesktopDirectory')
)
foreach ($desk in $desks) {
  if (-not $desk -or -not (Test-Path -LiteralPath $desk)) { continue }
  Get-ChildItem -LiteralPath $desk -Filter *.exe -File -ErrorAction SilentlyContinue | ForEach-Object {
    Add-App $_.BaseName $_.FullName
  }
  if ($shell) {
    Get-ChildItem -LiteralPath $desk -Filter *.lnk -File -ErrorAction SilentlyContinue | ForEach-Object {
      try {
        $sc = $shell.CreateShortcut($_.FullName)
        $target = [string]$sc.TargetPath
        if ($target -and $target.ToLowerInvariant().EndsWith('.exe')) { Add-App $_.BaseName $target }
        Add-Name $_.BaseName
      } catch {}
    }
  }
}

try {
  Get-StartApps | ForEach-Object { Add-Name ([string]$_.Name) }
} catch {}

$utf8 = New-Object System.Text.UTF8Encoding $false
$writer = New-Object System.IO.StreamWriter($OutFile, $false, $utf8)
try {
  foreach ($app in $apps) { $writer.WriteLine(($app | ConvertTo-Json -Compress -Depth 3)) }
} finally { $writer.Dispose() }
`;

const ICON_SCRIPT = `
param(
  [Parameter(Mandatory = $true)][string]$ListFile,
  [Parameter(Mandatory = $true)][string]$IconDir
)
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force -Path $IconDir | Out-Null
Get-Content -LiteralPath $ListFile -Encoding UTF8 | ForEach-Object {
  $line = $_.Trim()
  if (-not $line) { return }
  try { $row = $line | ConvertFrom-Json } catch { return }
  $id = [string]$row.id
  $exe = [string]$row.exe
  if ($id -notmatch '^[a-f0-9]{16}$') { return }
  if (-not (Test-Path -LiteralPath $exe)) { return }
  $out = Join-Path $IconDir ($id + '.png')
  if (Test-Path -LiteralPath $out) { return }
  try {
    $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($exe)
    if ($null -eq $icon) { return }
    $bmp = $icon.ToBitmap()
    $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    $icon.Dispose()
  } catch {}
}
`;

let memory: { at: number; apps: DesktopApp[] } | null = null;
let inflight: Promise<DesktopApp[]> | null = null;

function cachePath(): string {
  return path.join(getConfig().dataDir, "rea-apps.json");
}

function iconDir(): string {
  return path.join(getConfig().dataDir, "rea-icons");
}

function iconFile(id: string): string {
  return path.join(iconDir(), `${id}.png`);
}

export function reaIconPath(id: string): string | null {
  if (!/^[a-f0-9]{16}$/.test(id)) return null;
  const file = iconFile(id);
  return fs.existsSync(file) ? file : null;
}

function withIcons(apps: { id: string; name: string; exe: string }[]): DesktopApp[] {
  return apps.map((app) => ({
    ...app,
    icon: fs.existsSync(iconFile(app.id)) ? `/api/rea/icon?id=${app.id}` : null,
  }));
}

function readDiskCache(): CacheFile | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(cachePath(), "utf8")) as CacheFile;
    if (!parsed || parsed.version !== CACHE_VERSION || !Array.isArray(parsed.apps) || typeof parsed.scannedAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function runPowerShell(script: string, args: string[], timeout: number): Promise<void> {
  const file = path.join(os.tmpdir(), `jarvis-rea-${process.pid}-${Date.now()}.ps1`);
  await fs.promises.writeFile(file, script.replace(/^\n/, ""), "utf8");
  try {
    await pexec(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", file, ...args],
      { timeout, windowsHide: true, maxBuffer: 1024 * 1024 },
    );
  } finally {
    await fs.promises.rm(file, { force: true }).catch(() => {});
  }
}

async function extractIcons(apps: { id: string; name: string; exe: string }[]): Promise<void> {
  const dir = iconDir();
  await fs.promises.mkdir(dir, { recursive: true });
  const missing = apps.filter((app) => app.exe && !fs.existsSync(iconFile(app.id)));
  if (missing.length === 0) return;
  const listFile = path.join(os.tmpdir(), `jarvis-rea-icons-${process.pid}.jsonl`);
  const body = missing.map((app) => JSON.stringify({ id: app.id, exe: app.exe })).join("\n");
  await fs.promises.writeFile(listFile, body, "utf8");
  try {
    await runPowerShell(ICON_SCRIPT, ["-ListFile", listFile, "-IconDir", dir], 90_000);
  } finally {
    await fs.promises.rm(listFile, { force: true }).catch(() => {});
  }
}

async function scanDesktopApps(): Promise<DesktopApp[]> {
  if (process.platform !== "win32") return [];
  const outFile = path.join(os.tmpdir(), `jarvis-rea-apps-${process.pid}.jsonl`);
  await fs.promises.rm(outFile, { force: true }).catch(() => {});
  try {
    await runPowerShell(LIST_SCRIPT, ["-OutFile", outFile], 120_000);
  } catch (err) {
    throw new Error(`Programs could not be read: ${(err as Error).message}`);
  }
  let text = "";
  try {
    text = await fs.promises.readFile(outFile, "utf8");
  } catch {
    text = "";
  } finally {
    await fs.promises.rm(outFile, { force: true }).catch(() => {});
  }
  const raw: { name?: string; exe?: string }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      raw.push(JSON.parse(trimmed) as { name?: string; exe?: string });
    } catch {
      /* skip a broken line */
    }
  }
  const apps = normalizeListedApps(raw).map((app) => ({
    id: appIconId(app.exe, app.name),
    name: app.name,
    exe: app.exe,
  }));
  await extractIcons(apps).catch(() => {});
  const cache: CacheFile = { version: CACHE_VERSION, scannedAt: Date.now(), apps };
  await fs.promises.mkdir(getConfig().dataDir, { recursive: true });
  await fs.promises.writeFile(cachePath(), JSON.stringify(cache), "utf8");
  return withIcons(apps);
}

/** Installed programs, Start menu apps, Store apps, and Electron apps on this PC. */
export async function listDesktopApps(refresh = false): Promise<DesktopApp[]> {
  if (!refresh && memory && Date.now() - memory.at < TTL_MS) return memory.apps;
  if (!refresh) {
    const disk = readDiskCache();
    if (disk && Date.now() - disk.scannedAt < TTL_MS) {
      memory = { at: disk.scannedAt, apps: withIcons(disk.apps) };
      return memory.apps;
    }
  }
  if (!refresh && inflight) return inflight;
  inflight = scanDesktopApps().finally(() => {
    inflight = null;
  });
  const apps = await inflight;
  memory = { at: Date.now(), apps };
  return apps;
}
