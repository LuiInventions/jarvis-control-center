import type { UiSectionId } from "../ui-commands";

/**
 * Names an AI should pass to app_navigate. They match the sidebar labels.
 * Internal ids (`launcher`, `github-launch`) are accepted as aliases.
 */
export const SECTION_ARG = [
  "remote",
  "github",
  "local",
  "rea",
  "repos",
  "sessions",
  "settings",
] as const;

export type SectionArg = (typeof SECTION_ARG)[number];

const ALIAS: Record<string, UiSectionId> = {
  remote: "remote",
  github: "github-launch",
  "github-launch": "github-launch",
  local: "launcher",
  launcher: "launcher",
  rea: "rea",
  repos: "github",
  sessions: "sessions",
  settings: "settings",
};

export const SECTION_LABEL: Record<UiSectionId, string> = {
  remote: "Remote",
  "github-launch": "GitHub",
  launcher: "Local",
  rea: "REA",
  github: "Repos",
  sessions: "Sessions",
  jarvis: "Jarvis",
  settings: "Settings",
};

export function resolveSection(raw: string): UiSectionId | null {
  return ALIAS[raw.trim()] ?? null;
}

/** Launcher tab that should show a session. */
export function sectionForOrigin(opts: { where?: string; origin?: string }): UiSectionId {
  if (opts.where === "remote") return "remote";
  if (opts.origin === "github") return "github-launch";
  if (opts.origin === "rea") return "rea";
  return "launcher";
}

export function sectionGuide(): { arg: string; label: string; does: string }[] {
  return [
    { arg: "remote", label: "Remote", does: "SSH login, remote files, and a code CLI on the server." },
    { arg: "github", label: "GitHub", does: "Start a code CLI in a cloned GitHub repo." },
    { arg: "local", label: "Local", does: "Start a code CLI in a folder on this PC." },
    { arg: "rea", label: "REA", does: "Reverse Engineer Anything in its own folder, then trace a program." },
    { arg: "repos", label: "Repos", does: "GitHub token, clone list, create repo, commit and push." },
    { arg: "sessions", label: "Sessions", does: "Pixel office of every live code-CLI session." },
    { arg: "settings", label: "Settings", does: "Provider, model, code CLI, theme, project folder." },
  ];
}
