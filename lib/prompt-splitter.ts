import { getModel, getOpenAI } from "./openai";
import { activeCodeCliLabel } from "./config";
import { getOrBuildIndex } from "./indexer";
import { buildContextFromDisk } from "./prompt-improver";

/**
 * "KI Modus": rework a large developer task and split it into 1–6 independent,
 * well-structured sub-tasks for parallel sessions of the selected code CLI. The model decides
 * the optimal count so no single session is overwhelmed. parseSplitResponse is
 * pure (unit-tested); splitPrompt adds project context and calls the model.
 */

export interface SplitSession {
  title?: string;
  prompt: string;
}

const MAX_SESSIONS = 6;

/** Parse the model's JSON into clamped, non-empty sub-sessions. Pure. */
export function parseSplitResponse(text: string): SplitSession[] {
  let t = (text ?? "").trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();

  let data: unknown;
  try {
    data = JSON.parse(t);
  } catch {
    return [];
  }
  const arr = Array.isArray(data)
    ? data
    : (data as { sessions?: unknown }).sessions;
  if (!Array.isArray(arr)) return [];

  const out: SplitSession[] = [];
  for (const item of arr) {
    if (out.length >= MAX_SESSIONS) break;
    const o = (item ?? {}) as Record<string, unknown>;
    const prompt = typeof o.prompt === "string" ? o.prompt.trim() : "";
    if (!prompt) continue;
    const title =
      typeof o.title === "string" && o.title.trim() ? o.title.trim() : undefined;
    out.push({ title, prompt });
  }
  return out;
}

async function projectContext(projectPath: string): Promise<string> {
  const index = await getOrBuildIndex();
  const proj = index.projects.find((p) => p.path === projectPath);
  if (proj) {
    return JSON.stringify({
      name: proj.name,
      path: proj.path,
      stack: proj.stack,
      tree: proj.tree,
      manifest: proj.manifest,
      readme: proj.readme,
    });
  }
  return JSON.stringify(await buildContextFromDisk(projectPath));
}

export async function splitPrompt(
  projectPath: string,
  rawPrompt: string,
): Promise<SplitSession[]> {
  const client = getOpenAI();
  const model = getModel();
  const context = await projectContext(projectPath);

  const instructions = [
    "Split one large developer task into 1 to 6 independent, clearly",
    `structured subtasks for PARALLEL ${activeCodeCliLabel()} sessions. Each subtask`,
    "must stand on its own, be concrete, and be ready to run, and must not",
    "overload one session. Choose the count yourself: a small task → 1; a large or",
    "multi-part task → more (at most 6). Avoid overlap and dangerous",
    "parallel edits to the same files. Use the real project stack",
    "and structure. Do not invent facts.",
    "Reply with ONLY JSON in exactly this shape — no explanation,",
    "and no code fences:",
    '{"sessions":[{"title":"short title","prompt":"a complete prompt that can be run"}]}',
    "Keep the user's language (English by default).",
    "",
    "=== PROJECT CONTEXT (JSON) ===",
    context,
  ].join("\n");

  const res = await client.responses.create({
    model,
    instructions,
    input: `User's large task:\n${rawPrompt}`,
  });

  const sessions = parseSplitResponse(res.output_text ?? "");
  // Fallback: never return nothing — at worst run the original prompt once.
  return sessions.length ? sessions : [{ prompt: rawPrompt.trim() }];
}
