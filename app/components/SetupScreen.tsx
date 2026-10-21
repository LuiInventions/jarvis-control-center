"use client";

import { useEffect, useState } from "react";
import { FolderOpen, Rocket, Terminal } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button, Card, Input } from "./ui";

interface CodeCliOpt {
  id: string;
  label: string;
  bin: string;
  hint: string;
  installed: boolean;
}

export default function SetupScreen({ onReady }: { onReady: () => void }) {
  const [projectsDir, setProjectsDir] = useState("");
  const [codeCli, setCodeCli] = useState("claude");
  const [codeClis, setCodeClis] = useState<CodeCliOpt[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const desktop = typeof window !== "undefined" ? window.cccDesktop : undefined;

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(
        (c: {
          projectsDir?: string;
          codeCli?: string;
          codeClis?: CodeCliOpt[];
        }) => {
          setCodeClis(c.codeClis ?? []);
          if (c.projectsDir) setProjectsDir(c.projectsDir);
          if (c.codeCli) setCodeCli(c.codeCli);
        },
      )
      .catch(() => {});
  }, []);

  const pick = async () => {
    const dir = await desktop?.pickFolder();
    if (dir) setProjectsDir(dir);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!projectsDir.trim()) throw new Error("Choose a projects folder.");

      const set = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectsDir: projectsDir.trim(),
          codeCli,
          // Stamp this version so the welcome screen doesn't reappear until the
          // next update (config.ready gate). The GitHub token is left intact.
          setupComplete: true,
        }),
      });
      const d = await set.json();
      if (d.error) throw new Error(d.error);

      onReady();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center overflow-auto bg-elevated p-6">
      <div className="w-full max-w-lg space-y-4">
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold text-ink">Welcome</h1>
          <p className="text-sm text-faint">
            One-time setup. Everything stays on this PC.
          </p>
        </div>

        <Card className="space-y-3 p-5">
          <Field
            icon={FolderOpen}
            title="Projects folder"
            hint="Required. Direct subfolders are listed as local projects."
          />
          <div className="flex gap-2">
            <Input
              value={projectsDir}
              onChange={(e) => setProjectsDir(e.target.value)}
              placeholder="C:\Users\you\projects"
              className="font-mono text-[13px]"
            />
            {desktop && (
              <Button variant="secondary" icon={FolderOpen} onClick={pick}>
                Choose
              </Button>
            )}
          </div>
        </Card>

        <Card className="space-y-2 p-5">
          <Field
            icon={Terminal}
            title="Code CLI"
            hint="Which CLI starts the sessions. You can change it later in Settings."
          />
          <div className="grid gap-2">
            {(codeClis.length ? codeClis : [{ id: "claude", label: "Claude Code", bin: "claude", hint: "", installed: true }]).map(
              (c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCodeCli(c.id)}
                  className={`cursor-pointer rounded-md border px-3 py-2 text-left transition-colors ${
                    codeCli === c.id
                      ? "border-accent bg-surface"
                      : "border-line bg-raised hover:border-line"
                  }`}
                >
                  <div className="text-sm font-medium text-ink">{c.label}</div>
                  {c.hint && <div className="text-xs text-faint">{c.hint}</div>}
                  {!c.installed && (
                    <div className="text-xs text-danger">
                      `{c.bin}` is not on PATH
                    </div>
                  )}
                </button>
              ),
            )}
          </div>
        </Card>

        {error && <p className="text-sm text-danger">{error}</p>}

        <Button
          variant="primary"
          icon={Rocket}
          onClick={submit}
          loading={busy}
          disabled={!projectsDir.trim()}
          className="w-full"
        >
          Get started
        </Button>
      </div>
    </div>
  );
}

function Field({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint: string }) {
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
