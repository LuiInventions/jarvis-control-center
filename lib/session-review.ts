import { getAiClient, getModel } from "./openai";

/**
 * Session-Review: turns the launcher's numbered Claude consoles into a
 * Markdown report (what each session worked on / what is still open) plus a
 * short spoken summary. The context builder and the JSON parser are PURE and
 * unit-tested; reviewSessions adds the single LLM call (mirrors prompt-improver).
 */

export interface SessionOutput {
  id: string;
  projectName: string;
  status: "running" | "done" | "error";
  prompt: string;
  /** Readable, already-tailed console output. */
  output: string;
}

/** One session enriched with its stable, UI-matching display number (#1..#N). */
export interface ReviewItem extends SessionOutput {
  number: number;
}

export interface ReviewResult {
  markdown: string;
  speech: string;
}

const STATUS_DE: Record<SessionOutput["status"], string> = {
  running: "running",
  done: "done",
  error: "error",
};

/** Build the numbered, plain-text LLM context (pure). */
export function buildReviewContext(items: ReviewItem[]): string {
  if (items.length === 0) return "(no sessions)";
  return items
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((it) => {
      const task = it.prompt.trim() || "(no prompt / interactive)";
      const out = it.output.trim() || "(no output)";
      return [
        `#${it.number} · ${it.projectName || "?"} [${STATUS_DE[it.status]}]`,
        `Task: ${task}`,
        "Output (excerpt):",
        out,
        "---",
      ].join("\n");
    })
    .join("\n");
}

/** Strip a single surrounding ```/```json fence if present. */
function stripFences(s: string): string {
  const m = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return m ? m[1].trim() : s;
}

/** Parse the model output into {markdown, speech}; robust fallback (pure). */
export function parseReviewResult(raw: string): ReviewResult {
  const text = raw.trim();
  try {
    const obj = JSON.parse(stripFences(text)) as Partial<ReviewResult>;
    if (typeof obj.markdown === "string" && typeof obj.speech === "string") {
      return { markdown: obj.markdown, speech: obj.speech };
    }
  } catch {
    /* fall through to raw fallback */
  }
  return {
    markdown: text || "_No result._",
    speech:
      "The review is finished. The summary is in the open report.",
  };
}

const SPEECH_SYSTEM_PROMPT = [
  "You are the review assistant in Jarvis Control Center.",
  "Summarize the state of ALL sessions in 1–4 natural English sentences.",
  "No Markdown characters, no bullet symbols, and no quotation marks.",
  "Return ONLY the spoken text — nothing else.",
].join("\n");

const MARKDOWN_SYSTEM_PROMPT = [
  "You are the review assistant in Jarvis Control Center.",
  "Write a clear English Markdown report of every session.",
  "Use ONLY the output shown — do not invent anything.",
  "",
  "FORMAT (follow it exactly):",
  "One section per session:",
  "",
  "## Session #N · <project name>",
  "",
  "> <emoji> **<status>** — <project name>",
  "",
  "### ✅ Done",
  "- Point 1",
  "- Point 2",
  "",
  "### 🔲 Still open",
  "- Point 1",
  "*(or: No open points.)*",
  "",
  "---",
  "",
  "Status emojis: ✅ done | ⏳ running | ❌ error",
  "Return only the Markdown, with no introduction and no ``` fences.",
].join("\n");

/** Generate just the spoken summary (fast, streamed first to the client). */
export async function generateSpeechSummary(items: ReviewItem[]): Promise<string> {
  if (items.length === 0) {
    return "There are no sessions to review.";
  }
  const client = getAiClient();
  const model = getModel();
  const res = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: SPEECH_SYSTEM_PROMPT },
      { role: "user", content: buildReviewContext(items) },
    ],
  });
  const text = (res.choices[0]?.message?.content ?? "").trim();
  return text || "The review is complete.";
}

/** Generate the detailed Markdown report. */
export async function generateMarkdownReport(items: ReviewItem[]): Promise<string> {
  if (items.length === 0) {
    return "_No sessions to review._";
  }
  const client = getAiClient();
  const model = getModel();
  const res = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: MARKDOWN_SYSTEM_PROMPT },
      { role: "user", content: buildReviewContext(items) },
    ],
  });
  const text = stripFences((res.choices[0]?.message?.content ?? "").trim());
  return text || "_No result._";
}

/** Read all sessions and produce the report + spoken summary (two parallel LLM calls). */
export async function reviewSessions(items: ReviewItem[]): Promise<ReviewResult> {
  if (items.length === 0) {
    return {
      markdown: "_No sessions to review._",
      speech: "There are no sessions to review.",
    };
  }
  const [speech, markdown] = await Promise.all([
    generateSpeechSummary(items),
    generateMarkdownReport(items),
  ]);
  return { markdown, speech };
}
