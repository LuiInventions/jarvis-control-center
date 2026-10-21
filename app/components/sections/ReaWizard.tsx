"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Loader2, Play, RefreshCw, X } from "lucide-react";
import { Button, cn } from "../ui";
import { copyText } from "../term-copy";
import { fillClonePrompt, fillFeaturePrompt, fillOwnPrompt } from "@/lib/rea-prompts";

interface DesktopApp {
  id: string;
  name: string;
  exe: string;
  icon: string | null;
}

type Step = "apps" | "mode" | "name" | "prompt";
type Mode = "feature" | "clone" | "own";

export default function ReaWizard({
  onClose,
  onStart,
}: {
  onClose: () => void;
  onStart: (prompt: string) => void;
}) {
  const [step, setStep] = useState<Step>("apps");
  const [apps, setApps] = useState<DesktopApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [manualName, setManualName] = useState("");
  const [mode, setMode] = useState<Mode>("feature");
  const [ownName, setOwnName] = useState("");
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const [reload, setReload] = useState(0);

  const selected = apps.find((app) => app.id === selectedId) ?? null;
  const programName = manualName.trim();

  useEffect(() => {
    let stop = false;
    setLoading(true);
    setError(null);
    const url = reload ? "/api/rea/apps?refresh=1" : "/api/rea/apps";
    fetch(url)
      .then((r) => r.json())
      .then((d: { apps?: DesktopApp[]; error?: string }) => {
        if (stop) return;
        if (d.error) throw new Error(d.error);
        setApps(d.apps ?? []);
      })
      .catch((err: Error) => {
        if (!stop) setError(err.message);
      })
      .finally(() => {
        if (!stop) setLoading(false);
      });
    return () => {
      stop = true;
    };
  }, [reload]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return apps;
    return apps.filter(
      (app) => app.name.toLowerCase().includes(q) || app.exe.toLowerCase().includes(q),
    );
  }, [apps, query]);

  const pickApp = (app: DesktopApp) => {
    setSelectedId(app.id);
    setManualName(app.name);
  };

  const chooseMode = (next: Mode) => {
    const program = manualName.trim();
    if (!program) return;
    setManualName(program);
    setMode(next);
    setCopied(false);
    if (next === "own") {
      setText(fillOwnPrompt(program));
      setStep("prompt");
      return;
    }
    setStep("name");
  };

  const filled = (next: Mode, name: string) => {
    if (!programName) return;
    if (next === "own") {
      setText(fillOwnPrompt(programName));
      return;
    }
    setText(next === "feature" ? fillFeaturePrompt(programName, name) : fillClonePrompt(programName, name));
  };

  const confirmName = () => {
    const own = ownName.trim();
    if (!programName || !own || mode === "own") return;
    setOwnName(own);
    filled(mode, own);
    setCopied(false);
    setStep("prompt");
  };

  const retarget = (name: string) => {
    setOwnName(name);
    filled(mode, name);
    setCopied(false);
  };

  const copy = async () => {
    await copyText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const nameLabel = mode === "feature" ? "Where should the feature go?" : "Clone name";
  const title =
    step === "apps"
      ? "Choose program"
      : step === "mode"
        ? "What should be rebuilt?"
        : step === "name"
          ? nameLabel
          : "Prompt";

  return createPortal(
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-black/55 p-4"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rea-wizard-title"
        className={cn(
          "flex w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_24px_60px_rgba(0,0,0,0.45)]",
          step === "apps" || step === "prompt" ? "h-[92vh] max-h-[92vh]" : "max-h-[92vh]",
        )}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id="rea-wizard-title" className="text-sm font-semibold text-ink">
              {title}
            </h2>
            <p className="mt-1 text-xs text-muted">
              {step === "apps"
                ? "All programs on this PC. You can also enter the name yourself."
                : step === "mode"
                  ? programName
                  : step === "name"
                    ? mode === "feature"
                      ? "Name of the project where the feature will be added."
                      : "Name of the clone that will be built."
                    : "Only software that you own or are allowed to inspect."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-faint hover:bg-raised hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>

        {step === "apps" && (
          <>
            <div className="flex items-center gap-2 px-5 py-3">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search"
                aria-label="Search programs"
                spellCheck={false}
                className="h-9 min-w-0 flex-1 rounded-lg border border-transparent bg-raised/80 px-2.5 text-sm text-ink outline-none"
              />
              <input
                value={manualName}
                onChange={(event) => {
                  const next = event.target.value;
                  setManualName(next);
                  if (selected && next.trim() !== selected.name) setSelectedId(null);
                }}
                placeholder="Manual software name"
                aria-label="Software name"
                spellCheck={false}
                className="h-9 min-w-0 flex-1 rounded-lg border border-transparent bg-raised/80 px-2.5 text-sm text-ink outline-none"
              />
              <Button
                variant="secondary"
                icon={RefreshCw}
                onClick={() => setReload((n) => n + 1)}
                disabled={loading}
              >
                Refresh
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-5 pb-4">
              {loading && (
                <div className="flex items-center gap-2 py-10 text-sm text-muted">
                  <Loader2 className="size-4 animate-spin" />
                  Searching programs and icons…
                </div>
              )}
              {!loading && error && <p className="py-6 text-sm text-danger">{error}</p>}
              {!loading && !error && shown.length === 0 && (
                <p className="py-6 text-sm text-muted">No programs found.</p>
              )}
              {!loading && !error && shown.length > 0 && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {shown.map((app) => (
                    <button
                      key={app.id}
                      type="button"
                      aria-pressed={app.id === selectedId}
                      title={app.exe}
                      onClick={() => pickApp(app)}
                      onDoubleClick={() => {
                        pickApp(app);
                        setStep("mode");
                      }}
                      className={cn(
                        "flex cursor-pointer flex-col items-center gap-2 rounded-lg border px-2 py-3 text-center",
                        app.id === selectedId
                          ? "border-accent bg-accent/10"
                          : "border-transparent bg-raised/70 hover:bg-raised",
                      )}
                    >
                      <AppMark app={app} />
                      <span className="line-clamp-2 text-xs text-ink">{app.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
              <Button variant="primary" disabled={!programName} onClick={() => setStep("mode")}>
                Next
              </Button>
            </div>
          </>
        )}

        {step === "mode" && (
          <div className="flex flex-col gap-3 px-5 py-5">
            <button
              type="button"
              onClick={() => chooseMode("feature")}
              className="cursor-pointer rounded-xl border border-line bg-raised/70 px-4 py-4 text-left hover:border-accent"
            >
              <div className="text-sm font-medium text-ink">Copy features</div>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Trace one feature of {programName}. Then enter the name of the destination project.
              </p>
            </button>
            <button
              type="button"
              onClick={() => chooseMode("clone")}
              className="cursor-pointer rounded-xl border border-line bg-raised/70 px-4 py-4 text-left hover:border-accent"
            >
              <div className="text-sm font-medium text-ink">Copy the whole app</div>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Rebuild every feature as your own clone. Then enter the clone name.
              </p>
            </button>
            <button
              type="button"
              onClick={() => chooseMode("own")}
              className="cursor-pointer rounded-xl border border-line bg-raised/70 px-4 py-4 text-left hover:border-accent"
            >
              <div className="text-sm font-medium text-ink">Write your own prompt</div>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Only the agent role and {programName} are inserted. You write the prompt yourself.
              </p>
            </button>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setStep("apps")}>
                Back
              </Button>
            </div>
          </div>
        )}

        {step === "name" && (
          <div className="flex flex-col gap-3 px-5 py-5">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">{nameLabel}</span>
              <input
                value={ownName}
                onChange={(event) => setOwnName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") confirmName();
                }}
                placeholder="Name"
                aria-label={nameLabel}
                spellCheck={false}
                autoFocus
                className="h-9 rounded-lg border border-transparent bg-raised/80 px-2.5 text-sm text-ink outline-none"
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setStep("mode")}>
                Back
              </Button>
              <Button variant="primary" disabled={!ownName.trim()} onClick={confirmName}>
                Next
              </Button>
            </div>
          </div>
        )}

        {step === "prompt" && (
          <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 py-4">
            {mode !== "own" && (
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-muted">{nameLabel}</span>
                <input
                  value={ownName}
                  onChange={(event) => retarget(event.target.value)}
                  aria-label={nameLabel}
                  spellCheck={false}
                  className="h-9 rounded-lg border border-transparent bg-raised/80 px-2.5 text-sm text-ink outline-none"
                />
              </label>
            )}
            <p className="text-xs text-muted">
              {mode === "feature"
                ? "Replace [feature] in the text with the desired feature."
                : mode === "clone"
                  ? "The text follows the clone name."
                  : "The role and the program name are filled in. You write the rest of the prompt."}
            </p>
            <textarea
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                setCopied(false);
              }}
              aria-label="REA Prompt"
              spellCheck={false}
              className="min-h-0 w-full flex-1 resize-none rounded-lg border border-transparent bg-raised/80 p-3 font-mono text-[12px] leading-relaxed text-ink outline-none"
            />
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => setStep(mode === "own" ? "mode" : "name")}>
                Back
              </Button>
              <Button variant="secondary" icon={Copy} onClick={() => void copy()} disabled={!text.trim()}>
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
              <Button
                variant="primary"
                icon={Play}
                disabled={!text.trim() || (mode !== "own" && !ownName.trim())}
                onClick={() => onStart(text)}
              >
                Start session
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function AppMark({ app }: { app: DesktopApp }) {
  const [failed, setFailed] = useState(false);
  const letter = app.name.trim().slice(0, 1).toUpperCase() || "?";
  return (
    <span className="relative grid size-12 place-items-center overflow-hidden rounded-lg bg-canvas">
      <span className="text-sm font-semibold text-muted">{letter}</span>
      {app.icon && !failed && (
        <img
          src={app.icon}
          alt=""
          className="absolute inset-0 size-12 bg-canvas object-contain"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
