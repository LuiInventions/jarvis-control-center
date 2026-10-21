import type { NextRequest } from "next/server";
import { explainAiFailure } from "@/lib/openai";
import {
  askJarvis,
  clearJarvisHistory,
  hasJarvisKey,
  JARVIS_MODEL,
  JARVIS_MODEL_LABEL,
  JarvisRequestError,
  loadJarvisHistory,
} from "@/lib/server/jarvis/chat";
import type { LoopEvent } from "@/lib/server/jarvis/turn";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export function GET() {
  return Response.json({
    messages: loadJarvisHistory().messages,
    model: JARVIS_MODEL,
    modelLabel: JARVIS_MODEL_LABEL,
    hasKey: hasJarvisKey(),
  });
}

export async function POST(req: NextRequest) {
  let body: { text?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid message." }, { status: 400 });
  }
  if (typeof body.text !== "string") {
    return Response.json({ error: "Write a message." }, { status: 400 });
  }
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: LoopEvent | { type: "done" | "error"; messages?: unknown; error?: string }) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        const history = await askJarvis(body.text as string, (event) => send(event));
        send({ type: "done", messages: history.messages });
      } catch (err) {
        const error = err instanceof JarvisRequestError ? err.message : explainAiFailure(err);
        send({ type: "error", error, messages: loadJarvisHistory().messages });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}

export function DELETE() {
  return Response.json({ messages: clearJarvisHistory().messages });
}
