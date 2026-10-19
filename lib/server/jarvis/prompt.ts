/** One MCP tool as Jarvis should see it in the system prompt. */
export interface JarvisToolSpec {
  name: string;
  description: string;
  parameters?: Record<string, unknown> | null;
}

interface SchemaProp {
  type?: string;
  description?: string;
  enum?: string[];
}

/**
 * Persona plus every live MCP tool and the arguments that tool expects.
 * Built from the server's own tool list so the prompt cannot drift from the calls.
 */
export function jarvisSystemPrompt(instructions: string, tools: JarvisToolSpec[]): string {
  const catalog = tools
    .map((tool) => {
      const description = tool.description.trim() || "No description.";
      return `- ${tool.name}\n  When to use: ${description}\n  How to use: ${howToCall(tool)}`;
    })
    .join("\n");
  return `${instructions}

You are Jarvis, the assistant in the Jarvis tab of this app. The person is talking to you in that chat. Reply in German.

Every tool below is available in this turn. Formulate a call as a function whose name is exactly the tool name. The arguments are one JSON object. Use the field names from How to use, and omit optional fields you do not need. Call the tool before you answer when the person asks about this app, a file, a folder, a repository, SSH, or a session. If a session number, path, or repo name is not already in this conversation, get it from a tool. Do not invent one. Do not claim that a tool ran unless it appears in this turn.

Session numbers restart in each area. Session 1 is the oldest running session. Call list_active_github_sessions, list_active_local_sessions, list_active_rea_sessions, or list_active_remote_sessions, then get_session_x_info with where and x. where must be the same area as the list. x is that session's number.

If a tool result contains a token, password, or one-time code, do not repeat it in the chat.

Every tool you can call:
${catalog}`;
}

function howToCall(tool: JarvisToolSpec): string {
  const schema = tool.parameters;
  if (!schema || typeof schema !== "object") return `Call ${tool.name} with no arguments.`;
  const props = schema.properties as Record<string, SchemaProp> | undefined;
  const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);
  if (!props || Object.keys(props).length === 0) return `Call ${tool.name} with no arguments.`;
  const parts = Object.entries(props).map(([key, spec]) => {
    const type = Array.isArray(spec.enum) ? spec.enum.join("|") : spec.type || "value";
    const need = required.has(key) ? "required" : "optional";
    const desc = spec.description ? ` — ${spec.description}` : "";
    return `${key} (${type}, ${need})${desc}`;
  });
  return `Call ${tool.name} with ${parts.join("; ")}.`;
}
