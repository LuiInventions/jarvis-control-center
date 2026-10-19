"use client";

import { useEffect, useState } from "react";
import { Copy, FolderOpen, FolderPlus, Play } from "lucide-react";
import { Button } from "../ui";
import { copyText } from "../term-copy";
import { type SectionCommand } from "../app-commands";
import { REA_SETUP_PROMPT } from "@/lib/rea-prompts";
import LauncherSection from "./LauncherSection";

type Phase = "loading" | "choose" | "setup" | "work";

export default function ReaSection({ command }: { command?: SectionCommand | null }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [dir, setDir] = useState("");
  const [savedDir, setSavedDir] = useState("");
  const [name, setName] = useState("");
  const [pathInput, setPathInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [override, setOverride] = useState<SectionCommand | null>(null);
  const [shellNonce, setShellNonce] = useState<number | null>(null);

  useEffect(() => {
    let stop = false;
    fetch("/api/settings")
      .then((r) => r.json())
      .then((c: { reaDir?: string }) => {
        if (stop) return;
        const folder = (c.reaDir || "").trim();
        if (folder) {
          setDir(folder);
          setSavedDir(folder);
          setPhase("work");
        } else {
          setPhase("choose");
        }
      })
      .catch(() => {
        if (!stop) setPhase("choose");
      });
    return () => {
      stop = true;
    };
  }, []);

  useEffect(() => {
    if (!command) return;
    if (shellNonce === command.nonce) return;
    setShellNonce(command.nonce);
    setOverride(null);
  }, [command, shellNonce]);

  const remember = (folder: string) => {
    void fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reaDir: folder }),
    });
  };

  const createInstance = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/rea/instance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const d = (await r.json()) as { path?: string; error?: string };
      if (!r.ok || !d.path) throw new Error(d.error || "Instanz konnte nicht erstellt werden.");
      setDir(d.path);
      setPhase("setup");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const usePath = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/rea/instance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: pathInput }),
      });
      const d = (await r.json()) as { path?: string; error?: string };
      if (!r.ok || !d.path) throw new Error(d.error || "Ordner ungültig.");
      setDir(d.path);
      setPhase("setup");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const pickFolder = async () => {
    const picked = await window.cccDesktop?.pickFolder?.("REA-Ordner");
    if (picked) setPathInput(picked);
  };

  const openWork = (start: boolean) => {
    remember(dir);
    setSavedDir(dir);
    if (start) {
      setOverride({
        nonce: Date.now(),
        payload: { projectPath: dir, prompt: REA_SETUP_PROMPT, autoStart: true },
      });
    } else {
      setOverride(null);
    }
    setPhase("work");
  };

  const copySetup = async () => {
    await copyText(REA_SETUP_PROMPT);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  if (phase === "loading") {
    return (
      <div className="grid h-full place-items-center text-sm text-muted">REA wird geladen…</div>
    );
  }

  if (phase === "work") {
    return (
      <LauncherSection
        command={override ?? command ?? null}
        sourceLock="rea"
        initialPath={dir}
        onSwitchInstance={() => {
          setError(null);
          setPhase("choose");
        }}
      />
    );
  }

  if (phase === "setup") {
    return (
      <div className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col gap-4 p-6">
        <div>
          <h2 className="text-sm font-semibold text-ink">REA einrichten</h2>
          <p className="mt-1 break-all font-mono text-[11px] text-faint">{dir}</p>
        </div>
        <textarea
          readOnly
          value={REA_SETUP_PROMPT}
          aria-label="Setup-Prompt"
          className="min-h-0 w-full flex-1 resize-none rounded-lg border border-transparent bg-raised/80 p-3 font-mono text-[12px] leading-relaxed text-ink outline-none"
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => setPhase("choose")}>
            Zurück
          </Button>
          <Button variant="secondary" icon={Copy} onClick={() => void copySetup()}>
            {copied ? "Kopiert" : "Kopieren"}
          </Button>
          <Button variant="secondary" onClick={() => openWork(false)}>
            Arbeitsfläche öffnen
          </Button>
          <Button variant="primary" icon={Play} onClick={() => openWork(true)}>
            Setup jetzt starten
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid h-full place-items-center p-6">
      <div className="w-full max-w-3xl">
        <h2 className="text-sm font-semibold text-ink">REA</h2>
        <p className="mt-1 text-sm text-muted">
          Neue Instanz anlegen oder einen Ordner wählen, in dem REA schon liegt.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <section className="glass-pane flex flex-col gap-3 rounded-xl border p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-ink">
              <FolderPlus className="size-4 text-accent" />
              Neue REA-Instanz
            </div>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Name"
              aria-label="Name der REA-Instanz"
              spellCheck={false}
              className="h-9 rounded-lg border border-transparent bg-raised/80 px-2.5 text-sm text-ink outline-none"
            />
            <Button
              variant="primary"
              icon={FolderPlus}
              className="w-full"
              loading={busy}
              disabled={!name.trim()}
              onClick={() => void createInstance()}
            >
              Erstellen
            </Button>
          </section>
          <section className="glass-pane flex flex-col gap-3 rounded-xl border p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-ink">
              <FolderOpen className="size-4 text-accent" />
              Pfad eingeben
            </div>
            <input
              value={pathInput}
              onChange={(event) => setPathInput(event.target.value)}
              placeholder="Ordner auf diesem PC"
              aria-label="REA-Ordner"
              spellCheck={false}
              className="h-9 rounded-lg border border-transparent bg-raised/80 px-2.5 font-mono text-[12.5px] text-ink outline-none"
            />
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" icon={FolderOpen} onClick={() => void pickFolder()}>
                Ordner wählen
              </Button>
              <Button
                variant="primary"
                disabled={!pathInput.trim()}
                loading={busy}
                onClick={() => void usePath()}
              >
                Weiter
              </Button>
            </div>
          </section>
        </div>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        {savedDir && (
          <div className="mt-4">
            <Button variant="secondary" onClick={() => setPhase("work")}>
              Zurück zur Arbeitsfläche
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
