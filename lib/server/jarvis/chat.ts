import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import OpenAI from "openai";
import { explainAiFailure } from "../../openai";
import { readSecrets, writeSecrets } from "../../secrets";
import { readJson, writeJson } from "../../store";
import { mcpUrl } from "../mcp/endpoint";
import { clipText } from "../mcp/errors";
import { MCP_INSTRUCTIONS } from "../mcp/server";
import { JARVIS_KEY_MISSING, JARVIS_MODEL, JARVIS_MODEL_LABEL, JARVIS_REASONING } from "./model";
import { jarvisSystemPrompt, type JarvisToolSpec } from "./prompt";
import { trustSystemCertificates } from "../system-ca";
import { runToolLoop, type JarvisToolNote, type LoopEvent, type LoopItem, type ModelStep } from "./turn";

export { JARVIS_MODEL, JARVIS_MODEL_LABEL, JARVIS_REASONING, JARVIS_KEY_MISSING };

const HISTORY_FILE = "jarvis-chat.json";
const MAX_STORED = 80;
const MAX_CONTEXT = 30;
const MAX_TEXT = 16_000;
const TOOL_TEXT_CAP = 24_000;
const TRACE_CAP = 8_000;
const REASON_CAP = 1_500;

export interface JarvisActivity {
  kind: "thinking" | "reasoning" | "tool";
  text?: string;
  name?: string;
  ok?: boolean;
}

export interface JarvisTraceLine {
  at: string;
  dir: "call" | "result";
  name: string;
  body: string;
  ok?: boolean;
}

export interface JarvisMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  tools?: JarvisToolNote[];
  activity?: JarvisActivity[];
  trace?: JarvisTraceLine[];
}

export interface JarvisHistory {
  messages: JarvisMessage[];
}

export class JarvisRequestError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
    this.name = "JarvisRequestError";
  }
}

let busy = false;

export function hasJarvisKey(): boolean {
  return Boolean(readSecrets().providerKeys?.openai?.trim());
}

/** Store the OpenAI key used only by this chat. An empty string clears it. */
export function saveJarvisKey(apiKey: string): boolean {
  const key = apiKey.trim();
  if (key && (key.length < 20 || /\s/.test(key))) {
    throw new JarvisRequestError("That is not an OpenAI API key.");
  }
  writeSecrets({ providerKeys: { openai: key } });
  return hasJarvisKey();
}

export function loadJarvisHistory(): JarvisHistory {
  const raw = readJson<JarvisHistory>(HISTORY_FILE, { messages: [] });
  const messages = Array.isArray(raw.messages) ? raw.messages.filter(isMessage).map(cleanMessage).slice(-MAX_STORED) : [];
  return { messages };
}

export function clearJarvisHistory(): JarvisHistory {
  const empty = { messages: [] };
  writeJson(HISTORY_FILE, empty);
  return empty;
}

/** Append the user's line, let GPT 6 Luna call MCP, and store the reply. */
export async function askJarvis(
  userText: string,
  onEvent?: (event: LoopEvent) => void,
): Promise<JarvisHistory> {
  const text = userText.trim();
  if (!text) throw new JarvisRequestError("Write a message.");
  if (text.length > MAX_TEXT) throw new JarvisRequestError("The message is too long.");
  if (!hasJarvisKey()) throw new JarvisRequestError(JARVIS_KEY_MISSING);
  const url = mcpEndpoint();
  if (busy) throw new JarvisRequestError("Jarvis is still replying.", 409);
  busy = true;
  let history: JarvisHistory = { messages: [] };
  try {
    history = loadJarvisHistory();
    history.messages.push(message("user", text));
    saveHistory(history);
    let reasoning = "";
    const trace: JarvisTraceLine[] = [];
    const answer = await withMcp(url, async (client) => {
      const tools = (await listAllTools(client)).map(toSpec);
      if (tools.length === 0) {
        throw new JarvisRequestError("The MCP server did not report any tools.");
      }
      const prompt = jarvisSystemPrompt(MCP_INSTRUCTIONS, tools);
      const openai = lunaClient();
      const functions = tools.map(toFunctionTool);
      return runToolLoop({
        messages: history.messages.slice(-MAX_CONTEXT).map(forModel),
        onEvent: (event) => {
          if (event.type === "reasoning") reasoning = clip(event.text, REASON_CAP);
          if (event.type === "tool-start") {
            trace.push({
              at: new Date().toISOString(),
              dir: "call",
              name: event.name,
              body: clip(event.arguments, TRACE_CAP),
            });
          }
          if (event.type === "tool-end") {
            trace.push({
              at: new Date().toISOString(),
              dir: "result",
              name: event.name,
              body: clip(event.output, TRACE_CAP),
              ok: event.ok,
            });
          }
          const outgoing = event.type === "reasoning" ? { ...event, text: reasoning } : event;
          onEvent?.(outgoing);
        },
        callModel: (items, emit) => callLuna(openai, prompt, functions, items, emit),
        callTool: (name, args) => callMcpTool(client, name, args),
      });
    });
    const activity: JarvisActivity[] = [];
    if (reasoning) activity.push({ kind: "reasoning", text: reasoning });
    for (const tool of answer.tools) activity.push({ kind: "tool", name: tool.name, ok: tool.ok });
    history.messages.push(
      message("assistant", answer.text || "I did not get a reply.", answer.tools, activity, trace),
    );
    saveHistory(history);
    return loadJarvisHistory();
  } catch (err) {
    const note = err instanceof JarvisRequestError ? err.message : explainAiFailure(err);
    const last = history.messages[history.messages.length - 1];
    if (last?.role === "user") {
      history.messages.push(message("assistant", note));
      try {
        saveHistory(history);
      } catch {
        /* report the reply error */
      }
    }
    if (err instanceof JarvisRequestError) throw err;
    throw new JarvisRequestError(note);
  } finally {
    busy = false;
  }
}

async function listAllTools(client: Client) {
  try {
    const tools: Awaited<ReturnType<Client["listTools"]>>["tools"] = [];
    let cursor: string | undefined;
    do {
      const page = await client.listTools(cursor ? { cursor } : undefined);
      tools.push(...page.tools);
      cursor = page.nextCursor;
    } while (cursor);
    return tools;
  } catch (err) {
    throw new JarvisRequestError(mcpFailure(err));
  }
}

function mcpEndpoint(): string {
  const live = mcpUrl();
  if (live) return live;
  const stored = readJson<{ url?: string | null }>("mcp.json", {}).url;
  if (stored) return stored;
  throw new JarvisRequestError("The MCP server is not running. Restart Jarvis Control Center.");
}

function lunaClient(): OpenAI {
  trustSystemCertificates();
  const key = readSecrets().providerKeys?.openai?.trim();
  if (!key) throw new JarvisRequestError(JARVIS_KEY_MISSING);
  return new OpenAI({
    apiKey: key,
    baseURL: "https://api.openai.com/v1",
    timeout: 120_000,
    maxRetries: 0,
  });
}

async function withMcp<T>(url: string, fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ name: "jarvis-tab", version: "1" });
  const transport = new StreamableHTTPClientTransport(new URL(url));
  try {
    await client.connect(transport);
  } catch (err) {
    throw new JarvisRequestError(mcpFailure(err));
  }
  try {
    return await fn(client);
  } finally {
    await client.close().catch(() => undefined);
  }
}

function mcpFailure(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/ECONNREFUSED|ENOTFOUND|fetch failed|socket|ECONNRESET/i.test(message)) {
    return "The MCP server is not reachable. Restart Jarvis Control Center.";
  }
  return message || "The MCP server did not reply.";
}

function toSpec(tool: { name: string; description?: string; inputSchema?: object }): JarvisToolSpec {
  const parameters =
    tool.inputSchema && typeof tool.inputSchema === "object"
      ? (tool.inputSchema as Record<string, unknown>)
      : null;
  return { name: tool.name, description: tool.description ?? "", parameters };
}

function toFunctionTool(tool: JarvisToolSpec): OpenAI.Responses.FunctionTool {
  const parameters = sanitizeSchema(tool.parameters);
  return {
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters,
    strict: false,
  };
}

function sanitizeSchema(schema: Record<string, unknown> | null | undefined): { [key: string]: unknown } {
  if (!schema) return { type: "object", properties: {} };
  const copy: { [key: string]: unknown } = { ...schema };
  delete copy.$schema;
  return copy;
}

async function callLuna(
  client: OpenAI,
  prompt: string,
  tools: OpenAI.Responses.FunctionTool[],
  items: LoopItem[],
  emit: (event: LoopEvent) => void,
): Promise<ModelStep> {
  try {
    return await callLunaOnce(client, prompt, tools, items, emit);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (!/connection error|fetch failed/i.test(message)) throw err;
    return callLunaOnce(client, prompt, tools, items, emit);
  }
}

async function callLunaOnce(
  client: OpenAI,
  prompt: string,
  tools: OpenAI.Responses.FunctionTool[],
  items: LoopItem[],
  emit: (event: LoopEvent) => void,
): Promise<ModelStep> {
  const stream = await client.responses.create({
    model: JARVIS_MODEL,
    instructions: prompt,
    input: items.flatMap(toResponseItem),
    tools,
    reasoning: { effort: JARVIS_REASONING.effort, summary: JARVIS_REASONING.summary },
    store: false,
    stream: true,
  });
  let text = "";
  let reasoning = "";
  for await (const event of stream) {
    if (event.type === "response.reasoning_summary_text.delta") {
      reasoning += event.delta;
      emit({ type: "reasoning", text: clip(reasoning, REASON_CAP) });
    } else if (event.type === "response.output_text.delta") {
      text += event.delta;
      emit({ type: "text", text });
    } else if (event.type === "response.completed") {
      const calls = event.response.output.flatMap((item) => {
        if (item.type !== "function_call") return [];
        return [{ id: item.call_id, name: item.name, arguments: item.arguments || "{}" }];
      });
      const carried = event.response.output.filter((item) => item.type === "reasoning" || item.type === "function_call");
      if (!text) text = event.response.output_text ?? "";
      return { text, calls, carried };
    } else if (event.type === "error") {
      throw new JarvisRequestError(event.message || "The model stopped the reply.");
    } else if (event.type === "response.failed") {
      throw new JarvisRequestError(event.response.error?.message || "The model stopped the reply.");
    }
  }
  return { text, calls: [] };
}

function toResponseItem(item: LoopItem): OpenAI.Responses.ResponseInput {
  if (item.kind === "raw") return [item.value as OpenAI.Responses.ResponseInputItem];
  if (item.kind === "tool") {
    const output = {
      type: "function_call_output" as const,
      call_id: item.id,
      output: item.output,
    };
    if (item.echoCall === false) return [output];
    return [
      {
        type: "function_call",
        call_id: item.id,
        name: item.name,
        arguments: item.arguments || "{}",
      },
      output,
    ];
  }
  return [{ role: item.kind, content: item.text }];
}

async function callMcpTool(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<{ text: string; ok: boolean }> {
  try {
    const result = await client.callTool({ name, arguments: args });
    const content = Array.isArray(result.content) ? result.content : [];
    const text = content
      .map((part) => {
        if (part && typeof part === "object" && "text" in part && typeof part.text === "string") return part.text;
        return "";
      })
      .filter(Boolean)
      .join("\n");
    return { text: clipText(text || "(empty tool result)", TOOL_TEXT_CAP).text, ok: result.isError !== true };
  } catch (err) {
    return { text: mcpFailure(err), ok: false };
  }
}

function forModel(entry: JarvisMessage): { role: "user" | "assistant"; text: string } {
  if (entry.role === "assistant" && entry.tools?.length) {
    const names = entry.tools.map((tool) => `${tool.name} ${tool.ok ? "succeeded" : "failed"}`).join(", ");
    return { role: "assistant", text: `${entry.text}\n\nTools: ${names}` };
  }
  return { role: entry.role, text: entry.text };
}

function message(
  role: "user" | "assistant",
  text: string,
  tools?: JarvisToolNote[],
  activity?: JarvisActivity[],
  trace?: JarvisTraceLine[],
): JarvisMessage {
  return {
    id: `j_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    role,
    text,
    createdAt: new Date().toISOString(),
    ...(tools && tools.length ? { tools } : {}),
    ...(activity && activity.length ? { activity } : {}),
    ...(trace && trace.length ? { trace } : {}),
  };
}

function saveHistory(history: JarvisHistory): void {
  writeJson(HISTORY_FILE, { messages: history.messages.slice(-MAX_STORED) });
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…`;
}

function isMessage(value: unknown): value is JarvisMessage {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<JarvisMessage>;
  return (
    typeof row.id === "string" &&
    (row.role === "user" || row.role === "assistant") &&
    typeof row.text === "string" &&
    typeof row.createdAt === "string"
  );
}

function cleanMessage(row: JarvisMessage): JarvisMessage {
  const tools = Array.isArray(row.tools) ? row.tools.filter(isTool) : undefined;
  const activity = Array.isArray(row.activity) ? row.activity.filter(isActivity) : undefined;
  const trace = Array.isArray(row.trace) ? row.trace.filter(isTrace) : undefined;
  return {
    ...row,
    ...(tools && tools.length ? { tools } : { tools: undefined }),
    ...(activity && activity.length ? { activity } : { activity: undefined }),
    ...(trace && trace.length ? { trace } : { trace: undefined }),
  };
}

function isTool(value: unknown): value is JarvisToolNote {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<JarvisToolNote>;
  return typeof row.name === "string" && typeof row.ok === "boolean";
}

function isActivity(value: unknown): value is JarvisActivity {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<JarvisActivity>;
  return row.kind === "thinking" || row.kind === "reasoning" || row.kind === "tool";
}

function isTrace(value: unknown): value is JarvisTraceLine {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<JarvisTraceLine>;
  return (
    typeof row.at === "string" &&
    (row.dir === "call" || row.dir === "result") &&
    typeof row.name === "string" &&
    typeof row.body === "string"
  );
}
