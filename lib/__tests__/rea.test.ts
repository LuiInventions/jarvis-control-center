import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { appIconId, normalizeListedApps } from "../rea-apps";
import { instanceDir, validateInstanceName } from "../rea-instance";
import {
  CLONE_PROMPT,
  FEATURE_PROMPT,
  REA_SETUP_PROMPT,
  fillClonePrompt,
  fillFeaturePrompt,
} from "../rea-prompts";
import { sessionInLauncher, sessionPlace } from "../session-names";
import { resolveSection } from "../server/mcp/sections";

describe("rea prompts", () => {
  it("keeps the install request and asks to check MCP or the plugin", () => {
    expect(REA_SETUP_PROMPT).toContain("https://github.com/morluto/rea");
    expect(REA_SETUP_PROMPT).toContain("REA MCP server");
    expect(REA_SETUP_PROMPT).toContain("Hopper, Ghidra or IDA");
    expect(REA_SETUP_PROMPT).toContain("JavaScript/Electron apps and .NET assemblies");
    expect(REA_SETUP_PROMPT).toContain("ob der mcp server oder das plugin schon installiert ist");
    expect(REA_SETUP_PROMPT.toLowerCase()).not.toContain("grok");
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
});

describe("rea instance folders", () => {
  const root = path.join(os.tmpdir(), "jarvis-rea-root");

  it("accepts a display name and keeps the folder inside the root", () => {
    expect(validateInstanceName("  Mein REA  ")).toBe("Mein REA");
    expect(instanceDir(root, "Mein REA")).toBe(path.resolve(root, "Mein REA"));
  });

  it("rejects path pieces and reserved device names", () => {
    expect(() => validateInstanceName("")).toThrow(/Name fehlt/);
    expect(() => validateInstanceName("a/b")).toThrow(/Buchstaben/);
    expect(() => validateInstanceName("..")).toThrow(/Buchstaben/);
    expect(() => validateInstanceName("CON")).toThrow(/reserviert/);
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
