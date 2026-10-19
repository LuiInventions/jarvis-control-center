import fs from "node:fs/promises";
import { reaIconPath } from "@/lib/server/rea-scan";

export const dynamic = "force-dynamic";

/** PNG extracted from an executable. The id is a hex hash, not a path. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const file = reaIconPath(id);
  if (!file) return new Response("not found", { status: 404 });
  const buf = await fs.readFile(file);
  return new Response(buf, {
    headers: {
      "content-type": "image/png",
      "cache-control": "private, max-age=86400",
    },
  });
}
