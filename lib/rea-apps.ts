import { createHash } from "node:crypto";

export interface ListedExe {
  name: string;
  exe: string;
}

const SKIP_PATH = /\\windows\\|\\winsxs\\|\\system32\\|\\syswow64\\|\\node_modules\\|\\windowsapps\\/i;
const SKIP_STEM = /^(unins\d*|uninstall|setup|installer|update|updater|elevate|squirrel)$/i;
const SKIP_HELPER = /crashpad|notification_helper|vc_redist|vcredist/i;

/** Stable icon file id for an executable path. */
export function appIconId(exe: string): string {
  return createHash("sha1").update(exe.trim().toLowerCase()).digest("hex").slice(0, 16);
}

export function keepDesktopApp(app: ListedExe): boolean {
  const exe = app.exe.trim();
  const name = app.name.trim();
  if (!exe || !name) return false;
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
  const byExe = new Map<string, ListedExe>();
  for (const row of raw) {
    const exe = (row.exe ?? "").trim();
    const name = (row.name ?? "").trim();
    const app = { name, exe };
    if (!keepDesktopApp(app)) continue;
    const key = exe.toLowerCase();
    const prev = byExe.get(key);
    if (!prev) {
      byExe.set(key, app);
      continue;
    }
    const stem = exe.split(/[/\\]/).pop()?.replace(/\.exe$/i, "") ?? "";
    if (prev.name.toLowerCase() === stem.toLowerCase() && name.toLowerCase() !== stem.toLowerCase()) {
      byExe.set(key, app);
    }
  }
  return [...byExe.values()].sort((a, b) => a.name.localeCompare(b.name, "de"));
}
