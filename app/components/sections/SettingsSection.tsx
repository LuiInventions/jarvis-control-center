"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, FolderOpen, Save, Server, Sparkles, Terminal } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge, Button, Card, Input, Spinner } from "../ui";
import { THEMES } from "@/lib/themes";

interface CodeCliOpt {
  id: string;
  label: string;
  bin: string;
  hint: string;
  installed: boolean;
}

interface PublicConfig {
  projectsDir: string;
  codeCli: string;
  codeClis: CodeCliOpt[];
  host: string;
  port: number;
  theme?: string;
}

export default function SettingsSection() {
  const [cfg, setCfg] = useState<PublicConfig | null>(null);
  const [projectsDir, setProjectsDir] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConfig = useCallback(
    () =>
      fetch("/api/settings")
        .then((r) => r.json())
        .then((c: PublicConfig) => {
          setCfg(c);
          setProjectsDir(c.projectsDir);
        }),
    [],
  );

  useEffect(() => {
    loadConfig().catch(() => {});
  }, [loadConfig]);

  const flashSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const saveSettings = async (patch: Record<string, unknown>) => {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setCfg(d);
      setProjectsDir(d.projectsDir);
      flashSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const changeCodeCli = async (id: string) => {
    await saveSettings({ codeCli: id });
  };

  if (!cfg)
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <Card className="space-y-3 p-5">
          <Label
            icon={Sparkles}
            title="Theme"
            hint="Six calm palettes. The choice stays on this PC."
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {THEMES.map((theme) => {
              const on = (cfg.theme || "dusk") === theme.id;
              return (
                <button
                  key={theme.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    document.documentElement.dataset.theme = theme.id;
                    void saveSettings({ theme: theme.id });
                  }}
                  className={
                    "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors " +
                    (on ? "bg-[color-mix(in_oklab,var(--accent)_16%,transparent)]" : "bg-white/5 hover:bg-white/10")
                  }
                >
                  <span className="flex shrink-0 -space-x-1">
                    {theme.swatch.map((color) => (
                      <span
                        key={color}
                        className="size-4 rounded-full border border-black/30"
                        style={{ background: color }}
                      />
                    ))}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">{theme.label}</span>
                    <span className="block truncate text-[11px] text-faint">{theme.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="space-y-3 p-5">
          <Label
            icon={Terminal}
            title="Code CLI"
            hint="Which CLI the launcher starts. Claude Code, Grok, or ChatGPT Codex."
          />
          <select
            value={cfg.codeCli}
            onChange={(e) => changeCodeCli(e.target.value)}
            className="h-9 w-full cursor-pointer rounded-md border border-line bg-raised px-2.5 text-sm text-ink outline-none focus:border-accent"
          >
            {cfg.codeClis.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
                {c.installed ? "" : " (not installed)"}
              </option>
            ))}
          </select>
          {cfg.codeClis.find((c) => c.id === cfg.codeCli)?.hint && (
            <p className="text-xs text-faint">
              {cfg.codeClis.find((c) => c.id === cfg.codeCli)?.hint}
            </p>
          )}
          {cfg.codeClis.find((c) => c.id === cfg.codeCli)?.installed === false && (
            <p className="text-xs text-danger">
              `{cfg.codeClis.find((c) => c.id === cfg.codeCli)?.bin}` was not found on PATH.
              Install it before starting a session.
            </p>
          )}
        </Card>

        <Card className="space-y-3 p-5">
          <Label
            icon={FolderOpen}
            title="Local Projects folder"
            hint="The Local tab fills this folder in automatically. Open folder opens it."
          />
          <div className="flex gap-2">
            <Input
              value={projectsDir}
              onChange={(e) => setProjectsDir(e.target.value)}
              placeholder="C:\Users\you\projects"
              className="font-mono text-[13px]"
            />
            <Button
              variant="secondary"
              onClick={() => saveSettings({ projectsDir })}
              disabled={!projectsDir.trim()}
            >
              Save
            </Button>
          </div>
        </Card>

        <Card className="space-y-3 p-5">
          <div className="flex items-center justify-between gap-3">
            <Label icon={Server} title="Server" hint="Local access only." />
            <span className="flex items-center gap-2 font-mono text-xs text-muted">
              {cfg.host}:{cfg.port}
              <Badge tone="accent">loopback</Badge>
            </span>
          </div>
        </Card>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex items-center gap-3 text-xs text-faint">
          {saved ? (
            <span className="flex items-center gap-1.5 text-running">
              <Check className="size-3.5" /> Saved
            </span>
          ) : saving ? (
            <span className="flex items-center gap-1.5">
              <Save className="size-3.5" /> Saving…
            </span>
          ) : (
            <span>Changes apply immediately — no restart needed.</span>
          )}
        </div>
      </div>
    </div>
  );
}

function Label({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-faint" />
      <div>
        <div className="text-sm font-medium text-ink">{title}</div>
        <div className="text-xs text-faint">{hint}</div>
      </div>
    </div>
  );
}
