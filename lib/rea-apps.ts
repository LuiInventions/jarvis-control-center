import { createHash } from "node:crypto";

export interface ListedExe {
  name: string;
  exe: string;
}

const SKIP_PATH = /\\windows\\|\\winsxs\\|\\system32\\|\\syswow64\\|\\node_modules\\|\\windowsapps\\/i;
const SKIP_STEM = /^(unins\d*|uninstall|setup|installer|update|updater|elevate|squirrel)$/i;
const SKIP_HELPER = /crashpad|notification_helper|vc_redist|vcredist/i;
const SKIP_UPDATE_NAME = /^(security update|update for|hotfix)\b/i;

/** Stable icon file id. A name-only program is keyed by its name. */
export function appIconId(exe: string, name = ""): string {
  const basis = exe.trim() ? exe.trim().toLowerCase() : `name:${name.trim().toLowerCase()}`;
  return createHash("sha1").update(basis).digest("hex").slice(0, 16);
}

/** Same program under a start-menu label and an uninstall label. */
function looseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\((?:user|64-bit(?: x64)?|32-bit|x64 de|x86 de)\)/g, " ")
    .replace(/[^a-z0-9]+/g, "");
}

export function keepDesktopApp(app: ListedExe): boolean {
  const exe = app.exe.trim();
  const name = app.name.trim();
  if (!name) return false;
  if (!exe) {
    if (SKIP_STEM.test(name) || SKIP_HELPER.test(name) || SKIP_UPDATE_NAME.test(name)) return false;
    return true;
  }
  if (!exe.toLowerCase().endsWith(".exe")) return false;
  if (SKIP_PATH.test(exe)) return false;
  const base = exe.split(/[/\\]/).pop() ?? "";
  const stem = base.replace(/\.exe$/i, "");
  if (SKIP_STEM.test(stem) || SKIP_HELPER.test(stem)) return false;
  return true;
}

/**
 * Drop system helpers, collapse the same exe, prefer a display name over the
 * file stem, and sort by name.
 */
export function normalizeListedApps(raw: { name?: string; exe?: string }[]): ListedExe[] {
  const exeApps: ListedExe[] = [];
  const nameApps: ListedExe[] = [];
  for (const row of raw) {
    const exe = (row.exe ?? "").trim();
    const name = (row.name ?? "").trim();
    const app = { name, exe };
    if (!keepDesktopApp(app)) continue;
    if (exe) exeApps.push(app);
    else nameApps.push(app);
  }
  const byExe = new Map<string, ListedExe>();
  for (const app of exeApps) {
    const key = app.exe.toLowerCase();
    const prev = byExe.get(key);
    if (!prev) {
      byExe.set(key, app);
      continue;
    }
    const stem = app.exe.split(/[/\\]/).pop()?.replace(/\.exe$/i, "") ?? "";
    if (prev.name.toLowerCase() === stem.toLowerCase() && app.name.toLowerCase() !== stem.toLowerCase()) {
      byExe.set(key, app);
    }
  }
  const taken = new Set([...byExe.values()].map((app) => looseName(app.name)).filter(Boolean));
  const byName = new Map<string, ListedExe>();
  for (const app of nameApps) {
    const key = looseName(app.name);
    if (!key || taken.has(key) || byName.has(key)) continue;
    byName.set(key, { name: app.name, exe: "" });
  }
  return [...byExe.values(), ...byName.values()].sort((a, b) => a.name.localeCompare(b.name, "de"));
}
