/** One prior chat line, or a tool result the model must see on the next step. */
export type LoopItem =
  | { kind: "user" | "assistant"; text: string }
  | { kind: "tool"; id: string; name: string; arguments: string; output: string; ok: boolean; echoCall?: boolean }
  | { kind: "raw"; value: unknown };

export interface ModelCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ModelStep {
  text: string;
  calls: ModelCall[];
  /** Reasoning and function-call items the next request must echo. */
  carried?: unknown[];
}

export interface JarvisToolNote {
  name: string;
  ok: boolean;
}

export type LoopEvent =
  | { type: "thinking" }
  | { type: "reasoning"; text: string }
  | { type: "text"; text: string }
  | { type: "tool-start"; name: string; arguments: string }
  | { type: "tool-end"; name: string; arguments: string; output: string; ok: boolean };

const DEFAULT_STEPS = 8;

/**
 * Talk to the model, run the tool calls it asks for, and repeat until it answers.
 * The transcript passed to callModel includes every tool result from this turn.
 */
export async function runToolLoop(opts: {
  messages: { role: "user" | "assistant"; text: string }[];
  callModel: (items: LoopItem[], emit: (event: LoopEvent) => void) => Promise<ModelStep>;
  callTool: (name: string, args: Record<string, unknown>) => Promise<{ text: string; ok: boolean }>;
  onEvent?: (event: LoopEvent) => void;
  maxSteps?: number;
}): Promise<{ text: string; tools: JarvisToolNote[] }> {
  const emit = (event: LoopEvent) => opts.onEvent?.(event);
  const items: LoopItem[] = opts.messages.map((message) => ({
    kind: message.role,
    text: message.text,
  }));
  const tools: JarvisToolNote[] = [];
  const max = opts.maxSteps ?? DEFAULT_STEPS;
  let text = "";
  for (let step = 0; step < max; step++) {
    emit({ type: "thinking" });
    const reply = await opts.callModel(items, emit);
    text = reply.text.trim();
    if (reply.calls.length === 0) {
      if (text) emit({ type: "text", text });
      return { text, tools };
    }
    const echoed = new Set<string>();
    for (const value of reply.carried ?? []) {
      items.push({ kind: "raw", value });
      if (value && typeof value === "object" && "type" in value && (value as { type?: string }).type === "function_call") {
        const id = (value as { call_id?: string }).call_id;
        if (id) echoed.add(id);
      }
    }
    for (const call of reply.calls) {
      emit({ type: "tool-start", name: call.name, arguments: call.arguments || "{}" });
      const parsed = parseArgs(call.arguments);
      if (!parsed.ok) {
        const output = "arguments were not a JSON object";
        tools.push({ name: call.name, ok: false });
        emit({ type: "tool-end", name: call.name, arguments: call.arguments || "{}", output, ok: false });
        items.push({
          kind: "tool",
          id: call.id,
          name: call.name,
          arguments: call.arguments,
          output,
          ok: false,
          echoCall: !echoed.has(call.id),
        });
        continue;
      }
      let result: { text: string; ok: boolean };
      try {
        result = await opts.callTool(call.name, parsed.args);
      } catch (err) {
        result = {
          text: err instanceof Error ? err.message : "Werkzeug fehlgeschlagen",
          ok: false,
        };
      }
      tools.push({ name: call.name, ok: result.ok });
      emit({
        type: "tool-end",
        name: call.name,
        arguments: call.arguments || "{}",
        output: result.text,
        ok: result.ok,
      });
      items.push({
        kind: "tool",
        id: call.id,
        name: call.name,
        arguments: call.arguments,
        output: result.text,
        ok: result.ok,
        echoCall: !echoed.has(call.id),
      });
    }
  }
  return {
    text: text || "Ich habe das Werkzeug-Limit erreicht. Sag mir, womit ich weitermachen soll.",
    tools,
  };
}

function parseArgs(raw: string): { ok: true; args: Record<string, unknown> } | { ok: false } {
  const text = raw.trim();
  if (!text) return { ok: true, args: {} };
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false };
    return { ok: true, args: parsed as Record<string, unknown> };
  } catch {
    return { ok: false };
  }
}
