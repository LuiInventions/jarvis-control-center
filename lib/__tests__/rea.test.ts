import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { appIconId, normalizeListedApps } from "../rea-apps";
import { instanceDir, validateInstanceName } from "../rea-instance";
import {
  CLONE_PROMPT,
  FEATURE_PROMPT,
  OWN_PROMPT,
  REA_SETUP_PROMPT,
  fillClonePrompt,
  fillFeaturePrompt,
  fillOwnPrompt,
} from "../rea-prompts";
import { sessionInLauncher, sessionPlace } from "../session-names";
import { resolveSection } from "../server/mcp/sections";

describe("rea prompts", () => {
  it("keeps the install request and asks to check MCP or the plugin", () => {
    expect(REA_SETUP_PROMPT).toContain("https://github.com/morluto/rea");
    expect(REA_SETUP_PROMPT).toContain("REA MCP server");
    expect(REA_SETUP_PROMPT).toContain("Hopper, Ghidra or IDA");
    expect(REA_SETUP_PROMPT).toContain("JavaScript/Electron apps and .NET assemblies");
    expect(REA_SETUP_PROMPT).toContain("whether the MCP server or the plugin is already installed");
    expect(REA_SETUP_PROMPT.toLowerCase()).not.toContain("grok");
    expect(REA_SETUP_PROMPT.toLowerCase()).not.toContain("already installed locally");
    expect(REA_SETUP_PROMPT.toLowerCase()).not.toContain("schon lokal");
  });

  it("fills the program name and where the feature is built", () => {
    expect(FEATURE_PROMPT).toContain("{program name}");
    expect(FEATURE_PROMPT).toContain("{name}");
    expect(FEATURE_PROMPT).toContain("[feature]");
    const filled = fillFeaturePrompt("Notion", "My Notes");
    expect(filled).not.toContain("{program name}");
    expect(filled).not.toContain("{name}");
    expect(filled).toContain("Target program: Notion");
    expect(filled).toContain("Build the feature in My Notes");
    expect(filled).toContain("Understand how [feature] works in Notion");
    expect(filled).toContain("build a similar feature in My Notes");
    expect(filled).toContain("Never bypass licensing, DRM, auth or paywalls");
  });

  it("fills the target and the clone name", () => {
    expect(CLONE_PROMPT).toContain("{name}");
    expect(CLONE_PROMPT).not.toContain("{own project name}");
    const filled = fillClonePrompt("Notion", "My Notes");
    expect(filled).not.toContain("{program name}");
    expect(filled).not.toContain("{name}");
    expect(filled).toContain("Own project: My Notes");
    expect(filled).toContain("rebuild all of them as original code in My Notes");
    expect(filled).toContain("Do not copy decompiled code, assets, text, logos or branding");
  });

  it("fills only the role and the chosen program for a self-written prompt", () => {
    expect(OWN_PROMPT).toContain("<role>");
    expect(OWN_PROMPT).toContain("{program name}");
    expect(OWN_PROMPT).not.toContain("{name}");
    expect(OWN_PROMPT).not.toContain("<research_process>");
    const filled = fillOwnPrompt("Discord");
    expect(filled).toContain("You are an elite AI reverse engineering analyst");
    expect(filled).toContain("Target program: Discord");
    expect(filled).not.toContain("{program name}");
    expect(filled).not.toContain("{name}");
    expect(filled).not.toContain("[feature]");
    expect(filled).not.toContain("<research_process>");
    expect(filled.startsWith("<prompt>")).toBe(true);
    expect(filled.trimEnd().endsWith("</prompt>")).toBe(true);
  });
});

describe("rea instance folders", () => {
  const root = path.join(os.tmpdir(), "jarvis-rea-root");

  it("accepts a display name and keeps the folder inside the root", () => {
    expect(validateInstanceName("  Mein REA  ")).toBe("Mein REA");
    expect(instanceDir(root, "Mein REA")).toBe(path.resolve(root, "Mein REA"));
  });

  it("rejects path pieces and reserved device names", () => {
    expect(() => validateInstanceName("")).toThrow(/Name is missing/);
    expect(() => validateInstanceName("a/b")).toThrow(/letters/);
    expect(() => validateInstanceName("..")).toThrow(/letters/);
    expect(() => validateInstanceName("CON")).toThrow(/reserved/);
  });
});

describe("rea app list", () => {
  it("drops system and helper exes and prefers a display name", () => {
    const apps = normalizeListedApps([
      { name: "Notion", exe: "C:\\Apps\\Notion.exe" },
      { name: "Notion Desktop", exe: "C:\\Apps\\Notion.exe" },
      { name: "unins000", exe: "C:\\Apps\\unins000.exe" },
      { name: "notepad", exe: "C:\\Windows\\System32\\notepad.exe" },
      { name: "helper", exe: "C:\\Apps\\chrome_crashpad_handler.exe" },
    ]);
    expect(apps).toEqual([{ name: "Notion Desktop", exe: "C:\\Apps\\Notion.exe" }]);
  });

  it("uses one icon id for the same path", () => {
    const id = appIconId("C:\\Apps\\Notion.exe");
    expect(id).toMatch(/^[a-f0-9]{16}$/);
    expect(appIconId("c:\\apps\\notion.exe")).toBe(id);
  });

  it("keeps programs that have a name but no executable", () => {
    const apps = normalizeListedApps([
      { name: "Counter-Strike 2", exe: "" },
      { name: "Spotify" },
      { name: "WhatsApp", exe: "   " },
      { name: "Security Update KB999", exe: "" },
      { name: "unins000", exe: "" },
    ]);
    expect(apps.map((app) => app.name)).toEqual(["Counter-Strike 2", "Spotify", "WhatsApp"]);
  });

  it("prefers the installed exe over a start-menu name for the same program", () => {
    const apps = normalizeListedApps([
      { name: "Cursor", exe: "" },
      { name: "Cursor (User)", exe: "C:\\Apps\\Cursor.exe" },
      { name: "ARK Survival Ascended", exe: "" },
      { name: "ARK: Survival Ascended", exe: "" },
    ]);
    expect(apps).toEqual([
      { name: "ARK Survival Ascended", exe: "" },
      { name: "Cursor (User)", exe: "C:\\Apps\\Cursor.exe" },
    ]);
  });

  it("keeps x64 and x86 installs apart", () => {
    const apps = normalizeListedApps([
      { name: "Microsoft Visual C++ 2012 Redistributable (x64) - 11.0.61030", exe: "" },
      { name: "Microsoft Visual C++ 2012 Redistributable (x86) - 11.0.61030", exe: "" },
    ]);
    expect(apps.map((app) => app.name)).toEqual([
      "Microsoft Visual C++ 2012 Redistributable (x64) - 11.0.61030",
      "Microsoft Visual C++ 2012 Redistributable (x86) - 11.0.61030",
    ]);
  });

  it("gives name-only programs distinct icon ids", () => {
    const spotify = appIconId("", "Spotify");
    const whatsapp = appIconId("", "WhatsApp");
    expect(spotify).toMatch(/^[a-f0-9]{16}$/);
    expect(whatsapp).toMatch(/^[a-f0-9]{16}$/);
    expect(spotify).not.toBe(whatsapp);
  });
});

describe("rea desktop scan", () => {
  const scan = fs.readFileSync(path.join(__dirname, "../server/rea-scan.ts"), "utf8");

  it("lists start-menu and store apps by name and does not stop at 2000", () => {
    expect(scan).toContain("Get-StartApps");
    expect(scan).toContain("Add-Name");
    expect(scan).not.toContain("$apps.Count -ge");
    expect(scan).toContain("CACHE_VERSION");
  });
});

describe("rea sessions", () => {
  it("keeps REA sessions off the Local and GitHub tabs", () => {
    expect(sessionInLauncher("rea", "rea")).toBe(true);
    expect(sessionInLauncher("local", "rea")).toBe(false);
    expect(sessionInLauncher("github", "rea")).toBe(false);
    expect(sessionInLauncher("local", undefined)).toBe(true);
    expect(sessionPlace({ origin: "rea" })).toBe("rea");
    expect(resolveSection("rea")).toBe("rea");
  });
});
