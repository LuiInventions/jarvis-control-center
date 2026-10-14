"use client";

import { useEffect, useRef, useState } from "react";
import Markdown from "../Markdown";
import { Button, Input, Textarea } from "../ui";

interface ToolNote {
  name: string;
  ok: boolean;
}

interface Activity {
  kind: "thinking" | "reasoning" | "tool";
  text?: string;
  name?: string;
  ok?: boolean;
}

interface TraceLine {
  at: string;
  dir: "call" | "result";
  name: string;
  body: string;
  ok?: boolean;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  tools?: ToolNote[];
  activity?: Activity[];
  trace?: TraceLine[];
}

interface LiveTurn {
  thinking: boolean;
  reasoning: string;
  text: string;
  tools: { name: string; ok?: boolean; done: boolean }[];
  trace: TraceLine[];
}

type StreamEvent =
  | { type: "thinking" }
  | { type: "reasoning"; text: string }
  | { type: "text"; text: string }
  | { type: "tool-start"; name: string; arguments: string }
  | { type: "tool-end"; name: string; arguments: string; output: string; ok: boolean }
  | { type: "done"; messages?: ChatMessage[] }
  | { type: "error"; error?: string; messages?: ChatMessage[] };

const emptyLive = (): LiveTurn => ({ thinking: false, reasoning: "", text: "", tools: [], trace: [] });

export default function JarvisSection() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [hasKey, setHasKey] = useState(true);
  const [modelLabel, setModelLabel] = useState("GPT 6 Luna");
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [keyBusy, setKeyBusy] = useState(false);
  const [live, setLive] = useState<LiveTurn | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stop = false;
    fetch("/api/jarvis")
      .then((res) => res.json())
      .then((data: { messages?: ChatMessage[]; hasKey?: boolean; modelLabel?: string }) => {
        if (stop) return;
        setMessages(data.messages ?? []);
        setHasKey(data.hasKey !== false);
        if (data.modelLabel) setModelLabel(data.modelLabel);
        setLoaded(true);
      })
      .catch(() => {
        if (!stop) {
          setError("Der Verlauf konnte nicht geladen werden.");
          setLoaded(true);
        }
      });
    return () => {
      stop = true;
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, live, pending]);

  useEffect(() => {
    const node = logRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, live]);

  async function send() {
    const sent = text.trim();
    if (!sent || pending || !hasKey) return;
    setText("");
    setError("");
    setPending(true);
    setLive(emptyLive());
    setMessages((prev) => [
      ...prev,
      { id: `local_${Date.now()}`, role: "user", text: sent, createdAt: new Date().toISOString() },
    ]);
    try {
      const res = await fetch("/api/jarvis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: sent }),
      });
      const kind = res.headers.get("content-type") || "";
      if (kind.includes("application/json")) {
        const data = (await res.json()) as { messages?: ChatMessage[]; error?: string };
        if (data.messages) setMessages(data.messages);
        if (!res.ok) setError(data.error || "Jarvis konnte nicht antworten.");
        return;
      }
      await readEvents(res, (event) => {
        if (event.type === "done") {
          setLive(null);
          if (event.messages) setMessages(event.messages);
          return;
        }
        if (event.type === "error") {
          setLive(null);
          if (event.messages) setMessages(event.messages);
          setError(event.error || "Jarvis konnte nicht antworten.");
          return;
        }
        setLive((prev) => applyLive(prev ?? emptyLive(), event));
      });
    } catch {
      setError("Jarvis ist nicht erreichbar.");
      setText(sent);
      const again = await fetch("/api/jarvis").then((item) => item.json()).catch(() => null);
      if (again?.messages) setMessages(again.messages as ChatMessage[]);
    } finally {
      setLive(null);
      setPending(false);
    }
  }

  async function clearHistory() {
    if (!window.confirm("Den Jarvis-Verlauf löschen?")) return;
    setError("");
    const res = await fetch("/api/jarvis", { method: "DELETE" });
    const data = (await res.json()) as { messages?: ChatMessage[] };
    setMessages(data.messages ?? []);
  }

  async function saveKey() {
    const next = apiKey.trim();
    if (!next || keyBusy) return;
    setKeyBusy(true);
    setError("");
    try {
      const res = await fetch("/api/jarvis/key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: next }),
      });
      const data = (await res.json()) as { hasKey?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error || "Der Key konnte nicht gespeichert werden.");
      setHasKey(Boolean(data.hasKey));
      setApiKey("");
      setKeyOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Der Key konnte nicht gespeichert werden.");
    } finally {
      setKeyBusy(false);
    }
  }

  const log = consoleLines(messages, live);
  const showKey = !hasKey || keyOpen;

  return (
    <div className="flex min-h-0 flex-1">
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-4 border-b border-line px-6 py-3">
          <div className="mr-auto min-w-0">
            <h2 className="text-[15px] font-medium tracking-tight text-ink">Jarvis</h2>
            <p className="text-[11px] text-faint">{modelLabel} · kurzes Nachdenken</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setKeyOpen((open) => !open)}>
            API-Key
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void clearHistory()}
            disabled={pending || messages.length === 0}
          >
            Verlauf löschen
          </Button>
        </header>

        {error && (
          <p className="border-b border-danger/30 px-6 py-2 text-[13px] text-danger">{error}</p>
        )}

        {showKey && (
          <form
            className="border-b border-line px-6 py-4"
            onSubmit={(event) => {
              event.preventDefault();
              void saveKey();
            }}
          >
            <p className="text-sm text-ink">OpenAI-API-Key</p>
            <p className="mt-1 text-[12px] text-faint">Nur dieser Tab benutzt ihn. Er bleibt auf diesem PC.</p>
            <div className="mt-3 flex max-w-xl items-center gap-2">
              <Input
                type="password"
                autoComplete="off"
                value={apiKey}
                placeholder={hasKey ? "Neuen Key eingeben" : "sk-…"}
                onChange={(event) => setApiKey(event.target.value)}
                className="font-mono text-[13px]"
              />
              <Button type="submit" variant="primary" loading={keyBusy} disabled={!apiKey.trim()}>
                Speichern
              </Button>
              {hasKey && (
                <Button type="button" variant="ghost" onClick={() => setKeyOpen(false)}>
                  Abbrechen
                </Button>
              )}
            </div>
          </form>
        )}

        <div className="min-h-0 flex-1 overflow-auto px-6 py-6" role="log" aria-live="polite">
          {loaded && messages.length === 0 && !pending && hasKey && (
            <p className="max-w-md text-sm leading-relaxed text-muted">
              Schreib, was die App tun soll. Jarvis liest Sessions, Dateien und Repos über den lokalen MCP-Server.
            </p>
          )}
          <div className="mx-auto flex max-w-2xl flex-col gap-6">
            {messages.map((entry) => (
              <article key={entry.id} className={entry.role === "user" ? "ml-auto max-w-[80%]" : "max-w-full"}>
                {entry.role === "user" ? (
                  <p className="whitespace-pre-wrap text-right text-sm leading-relaxed text-ink">{entry.text}</p>
                ) : (
                  <div className="border-l border-line pl-4">
                    <ActivityList activity={entry.activity} />
                    {entry.text && <Markdown>{entry.text}</Markdown>}
                  </div>
                )}
              </article>
            ))}
            {live && (
              <article className="border-l border-line pl-4">
                <ActivityList
                  activity={liveActivity(live)}
                  thinking={live.thinking}
                />
                {live.text && <Markdown>{live.text}</Markdown>}
              </article>
            )}
          </div>
          <div ref={endRef} />
        </div>

        <form
          className="border-t border-line px-6 py-3"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <div className="mx-auto flex max-w-2xl items-end gap-2">
            <Textarea
              rows={1}
              value={text}
              placeholder={hasKey ? "Nachricht" : "Zuerst den OpenAI-Key eintragen"}
              disabled={pending || !hasKey}
              className="min-h-9 resize-none"
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <Button type="submit" variant="primary" loading={pending} disabled={!text.trim() || !hasKey}>
              Senden
            </Button>
          </div>
        </form>
      </section>

      <aside className="flex w-[340px] shrink-0 flex-col border-l border-line bg-canvas">
        <header className="border-b border-line px-4 py-3">
          <h3 className="text-[11px] font-medium tracking-[0.14em] text-faint uppercase">MCP</h3>
        </header>
        <div ref={logRef} className="min-h-0 flex-1 overflow-auto px-4 py-3 font-mono text-[11px] leading-relaxed">
          {log.length === 0 ? (
            <p className="text-faint">Werkzeugaufrufe erscheinen hier.</p>
          ) : (
            log.map((line) => (
              <div key={line.id} className="mb-3">
                <p className="text-faint">
                  {clock(line.at)} {line.dir === "call" ? "→" : "←"} {line.name}
                  {line.dir === "result" ? `  ${line.ok ? "erfolgreich" : "fehlgeschlagen"}` : ""}
                </p>
                {line.body && (
                  <pre className="mt-1 whitespace-pre-wrap break-words text-muted">{pretty(line.body)}</pre>
                )}
              </div>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}

function ActivityList({ activity, thinking }: { activity?: Activity[]; thinking?: boolean }) {
  const rows = activity ?? [];
  if (!thinking && rows.length === 0) return null;
  return (
    <ul className="mb-3 space-y-1 text-[12px]">
      {thinking && <li className="text-faint motion-safe:animate-pulse">denkt nach</li>}
      {rows.map((row, index) => {
        if (row.kind === "thinking") {
          return (
            <li key={`think_${index}`} className="text-faint">
              denkt nach
            </li>
          );
        }
        if (row.kind === "reasoning") {
          return (
            <li key={`reason_${index}`} className="text-muted">
              <span className="text-faint">Überlegung </span>
              {row.text}
            </li>
          );
        }
        return (
          <li key={`${row.name}_${index}`} className="font-mono text-[11px] text-muted">
            {row.name}
            <span className={row.ok === false ? "text-danger" : "text-running"}>
              {" "}
              {row.ok === false ? "fehlgeschlagen" : row.ok === true ? "erfolgreich" : "läuft"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function liveActivity(live: LiveTurn): Activity[] {
  const rows: Activity[] = [];
  if (live.reasoning) rows.push({ kind: "reasoning", text: live.reasoning });
  for (const tool of live.tools) {
    if (!tool.done) rows.push({ kind: "tool", name: tool.name });
    else rows.push({ kind: "tool", name: tool.name, ok: tool.ok });
  }
  return rows;
}

function applyLive(live: LiveTurn, event: StreamEvent): LiveTurn {
  if (event.type === "thinking") return { ...live, thinking: true };
  if (event.type === "reasoning") return { ...live, thinking: false, reasoning: event.text };
  if (event.type === "text") return { ...live, thinking: false, text: event.text };
  if (event.type === "tool-start") {
    return {
      ...live,
      thinking: false,
      tools: [...live.tools, { name: event.name, done: false }],
      trace: [
        ...live.trace,
        { at: new Date().toISOString(), dir: "call", name: event.name, body: event.arguments },
      ],
    };
  }
  if (event.type === "tool-end") {
    const tools = live.tools.map((tool, index) =>
      index === live.tools.length - 1 && tool.name === event.name && !tool.done
        ? { name: event.name, done: true, ok: event.ok }
        : tool,
    );
    return {
      ...live,
      thinking: false,
      tools,
      trace: [
        ...live.trace,
        { at: new Date().toISOString(), dir: "result", name: event.name, body: event.output, ok: event.ok },
      ],
    };
  }
  return live;
}

function consoleLines(messages: ChatMessage[], live: LiveTurn | null): (TraceLine & { id: string })[] {
  const lines: (TraceLine & { id: string })[] = [];
  for (const entry of messages) {
    for (const [index, line] of (entry.trace ?? []).entries()) {
      lines.push({ ...line, id: `${entry.id}_${index}` });
    }
  }
  for (const [index, line] of (live?.trace ?? []).entries()) {
    lines.push({ ...line, id: `live_${index}` });
  }
  return lines;
}

function clock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function pretty(body: string): string {
  const text = body.trim();
  if (!text) return "";
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return body;
  }
}

async function readEvents(res: Response, onEvent: (event: StreamEvent) => void) {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("leer");
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      onEvent(JSON.parse(trimmed) as StreamEvent);
    }
  }
  const tail = buffer.trim();
  if (tail) onEvent(JSON.parse(tail) as StreamEvent);
}
