import fs from "node:fs";
import path from "node:path";
import { reaInstancesRoot } from "@/lib/config";
import { instanceDir } from "@/lib/rea-instance";

export const dynamic = "force-dynamic";

/**
 * Create a new REA instance folder, or check a folder the user already has.
 * Body is `{ name }` or `{ path }`.
 */
export async function POST(req: Request) {
  let body: { name?: unknown; path?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Ungültige Eingabe." }, { status: 400 });
  }

  if (typeof body.path === "string" && body.path.trim()) {
    const dir = path.resolve(body.path.trim());
    let st: fs.Stats;
    try {
      st = await fs.promises.stat(dir);
    } catch {
      return Response.json({ error: "Ordner existiert nicht." }, { status: 400 });
    }
    if (!st.isDirectory()) {
      return Response.json({ error: "Pfad ist kein Ordner." }, { status: 400 });
    }
    return Response.json({ path: dir });
  }

  if (typeof body.name === "string") {
    let dir: string;
    try {
      dir = instanceDir(reaInstancesRoot(), body.name);
    } catch (err) {
      return Response.json({ error: (err as Error).message }, { status: 400 });
    }
    await fs.promises.mkdir(dir, { recursive: true });
    return Response.json({ path: dir });
  }

  return Response.json({ error: "Name oder Pfad fehlt." }, { status: 400 });
}
