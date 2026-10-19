import { listDesktopApps } from "@/lib/server/rea-scan";

export const dynamic = "force-dynamic";

/** Installed programs, Start Menu apps, and Electron apps on this PC. */
export async function GET(req: Request) {
  const refresh = new URL(req.url).searchParams.get("refresh") === "1";
  try {
    const apps = await listDesktopApps(refresh);
    return Response.json({ apps });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
