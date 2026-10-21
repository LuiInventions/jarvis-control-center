import type { NextRequest } from "next/server";
import { JarvisRequestError, saveJarvisKey } from "@/lib/server/jarvis/chat";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { apiKey?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid input." }, { status: 400 });
  }
  if (typeof body.apiKey !== "string") {
    return Response.json({ error: "Enter the OpenAI API key." }, { status: 400 });
  }
  try {
    return Response.json({ hasKey: saveJarvisKey(body.apiKey) });
  } catch (err) {
    const error = err instanceof JarvisRequestError ? err.message : "The key could not be saved.";
    return Response.json({ error }, { status: 400 });
  }
}
