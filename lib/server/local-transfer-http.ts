import { once } from "node:events";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { imageMime } from "../remote-upload-flow";
import { decodePathHeader, MAX_TRANSFER_BYTES, planTransfer, remoteRelative } from "../remote-transfer";
import { listImageSetCache, saveImageSetBytes, saveImageSetFile } from "./image-set-cache";
import { writeLocalBody, writeLocalTree, type UploadSource } from "./local-upload";
import { remoteMkdir, remotePut, remoteRead } from "./remote-copy";

const UPLOAD = "/api/fs/upload";
const PATHS = "/api/transfer/paths";
const RAW = "/api/fs/raw";
const PREVIEW = "/api/remote/preview";
const CACHE = "/api/image-set/cache";
const LOCAL_SET = "/api/image-set/local";

export function isLocalStream(url: string | undefined): boolean {
  const pathOnly = (url || "").split("?")[0];
  return pathOnly === UPLOAD || pathOnly === PATHS || pathOnly === RAW || pathOnly === PREVIEW || pathOnly === CACHE || pathOnly === LOCAL_SET;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  if (res.headersSent || res.writableEnded) {
    res.end();
    return;
  }
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(data),
    "cache-control": "no-store",
  });
  res.end(data);
}

function header(req: IncomingMessage, name: string): string {
  const value = req.headers[name];
  return typeof value === "string" ? value : "";
}

async function readJson(req: IncomingMessage, max: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    n += buf.length;
    if (n > max) throw new Error("Request is too large.");
    chunks.push(buf);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function writeLine(res: ServerResponse, body: unknown): Promise<void> {
  const ok = res.write(`${JSON.stringify(body)}\n`);
  if (!ok) await once(res, "drain");
}

function closeSignal(req: IncomingMessage): AbortSignal {
  const ctrl = new AbortController();
  const stop = () => ctrl.abort();
  req.on("aborted", stop);
  req.on("close", () => {
    if (!req.complete) ctrl.abort();
  });
  return ctrl.signal;
}

async function normalizeSources(items: unknown): Promise<UploadSource[]> {
  if (!Array.isArray(items) || items.length === 0) throw new Error("Nothing to upload.");
  const out: UploadSource[] = [];
  for (const raw of items) {
    const item = raw as { rel?: unknown; source?: unknown; dir?: unknown };
    if (typeof item.rel !== "string" || !item.rel.trim()) throw new Error("Invalid file name.");
    if (item.dir === true) {
      out.push({ rel: item.rel, size: 0, dir: true });
      continue;
    }
    if (typeof item.source !== "string" || !item.source.trim()) throw new Error("File is missing.");
    let st: fs.Stats;
    try {
      st = await fs.promises.lstat(item.source);
    } catch {
      throw new Error("File is missing.");
    }
    if (st.isSymbolicLink() || !st.isFile()) throw new Error("File is missing.");
    out.push({ rel: item.rel, size: st.size, source: item.source });
  }
  return out;
}

async function* readTracked(
  source: string,
  signal: AbortSignal,
  onBytes: (n: number) => void,
): AsyncGenerator<Buffer> {
  const input = fs.createReadStream(source);
  const onAbort = () => input.destroy(new Error("Canceled."));
  signal.addEventListener("abort", onAbort);
  try {
    for await (const chunk of input) {
      if (signal.aborted) throw new Error("Canceled.");
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (buf.length === 0) continue;
      onBytes(buf.length);
      yield buf;
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

async function uploadRemoteSources(
  port: number,
  dir: string,
  items: readonly UploadSource[],
  signal: AbortSignal,
  onProgress: (written: number, total: number, current: string) => void,
): Promise<{ files: number; bytes: number; dirs: number }> {
  const planned = planTransfer(items);
  if (!planned.ok) throw new Error(planned.error);
  const sources = new Map<string, string>();
  for (const item of items) {
    const rel = remoteRelative(item.rel);
    if (rel && item.source) sources.set(rel, item.source);
  }
  for (const rel of planned.plan.dirs) {
    if (signal.aborted) throw new Error("Canceled.");
    await remoteMkdir(port, dir, rel, signal);
  }
  let written = 0;
  const total = planned.plan.total;
  onProgress(0, total, "");
  for (const file of planned.plan.files) {
    if (signal.aborted) throw new Error("Canceled.");
    const source = sources.get(file.rel);
    if (!source) throw new Error("File is missing.");
    await remotePut(
      port,
      dir,
      file.rel,
      readTracked(source, signal, (n) => {
        written += n;
        onProgress(Math.min(total, written), total, file.rel);
      }),
      file.size,
      signal,
    );
  }
  onProgress(total, total, "");
  return { files: planned.plan.files.length, bytes: total, dirs: planned.plan.dirs.length };
}

async function handleFsUpload(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed." });
    return;
  }
  let root = "";
  let rel = "";
  try {
    root = decodePathHeader(header(req, "x-ccc-dir")).trim();
    rel = decodePathHeader(header(req, "x-ccc-rel"));
  } catch {
    json(res, 400, { error: "Invalid path." });
    return;
  }
  if (!root) {
    json(res, 400, { error: "Folder is missing." });
    return;
  }
  const kind = header(req, "x-ccc-kind") === "dir" ? "dir" : "file";
  if (kind === "dir") req.resume();
  const len = kind === "dir" ? 0 : Number(header(req, "content-length"));
  if (kind === "file" && (!Number.isInteger(len) || len < 0)) {
    json(res, 411, { error: "Length is missing." });
    req.destroy();
    return;
  }
  if (len > MAX_TRANSFER_BYTES) {
    json(res, 413, { error: "Maximum 10 GB." });
    req.destroy();
    return;
  }
  await writeLocalBody({
    dir: root,
    rel,
    kind,
    body: req,
    length: len,
    signal: closeSignal(req),
  });
  json(res, 200, { ok: true, size: len });
}

async function handlePaths(req: IncomingMessage, res: ServerResponse, getPort: () => number | null): Promise<void> {
  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed." });
    return;
  }
  const body = (await readJson(req, 32_000_000)) as { kind?: unknown; dir?: unknown; items?: unknown };
  const kind = body.kind === "local" ? "local" : body.kind === "remote" ? "remote" : "";
  const dir = typeof body.dir === "string" ? body.dir.trim() : "";
  if (!kind || !dir) {
    json(res, 400, { error: "Folder is missing." });
    return;
  }
  const items = await normalizeSources(body.items);
  const ctrl = new AbortController();
  const stop = () => {
    if (!res.writableEnded) ctrl.abort();
  };
  res.on("close", stop);
  const signal = ctrl.signal;
  let port: number | null = null;
  if (kind === "remote") {
    port = getPort();
    if (!port) {
      json(res, 409, { error: "Not connected to the server." });
      return;
    }
  }
  res.writeHead(200, {
    "content-type": "application/x-ndjson; charset=utf-8",
    "cache-control": "no-store",
  });
  const onProgress = (written: number, total: number, current: string) => {
    void writeLine(res, { type: "progress", written, total, current });
  };
  const result =
    kind === "local"
      ? await writeLocalTree({ dir, items, signal, onProgress })
      : await uploadRemoteSources(port as number, dir, items, signal, onProgress);
  await writeLine(res, { type: "done", ...result });
  res.off("close", stop);
  res.end();
}

function streamFile(req: IncomingMessage, res: ServerResponse, filePath: string, mime: string, size: number): void {
  res.writeHead(200, {
    "content-type": mime,
    "content-length": String(size),
    "content-disposition": "inline",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  const stream = fs.createReadStream(filePath);
  const stop = () => stream.destroy();
  // `close` on the response also fires after a normal end. Only a client
  // abort should tear the file down, or a short body leaves the browser
  // waiting on content-length and every later request to this app queues.
  req.on("aborted", stop);
  stream.on("error", () => {
    req.off("aborted", stop);
    if (!res.writableEnded) res.destroy();
  });
  stream.on("end", () => req.off("aborted", stop));
  stream.pipe(res);
}

async function handleRaw(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "GET") {
    json(res, 405, { error: "Method not allowed." });
    return;
  }
  const url = new URL(req.url || "", "http://127.0.0.1");
  const filePath = url.searchParams.get("path")?.trim() || "";
  const mime = imageMime(filePath);
  if (!filePath || !mime) {
    json(res, 415, { error: "Images only." });
    return;
  }
  let st: fs.Stats;
  try {
    st = await fs.promises.stat(filePath);
  } catch {
    json(res, 404, { error: "File is missing." });
    return;
  }
  if (!st.isFile()) {
    json(res, 404, { error: "File is missing." });
    return;
  }
  streamFile(req, res, filePath, mime, st.size);
}

async function handlePreview(req: IncomingMessage, res: ServerResponse, getPort: () => number | null): Promise<void> {
  if (req.method !== "GET") {
    json(res, 405, { error: "Method not allowed." });
    return;
  }
  const url = new URL(req.url || "", "http://127.0.0.1");
  const filePath = url.searchParams.get("path")?.trim() || "";
  const mime = imageMime(filePath);
  if (!filePath || !mime) {
    json(res, 415, { error: "Images only." });
    return;
  }
  const port = getPort();
  if (!port) {
    json(res, 409, { error: "Not connected to the server." });
    return;
  }
  const ctrl = new AbortController();
  const stop = () => ctrl.abort();
  req.on("aborted", stop);
  let headed = false;
  try {
    await remoteRead(
      port,
      filePath,
      async (chunk) => {
        if (ctrl.signal.aborted || res.destroyed) return;
        if (!res.write(chunk)) {
          await new Promise<void>((resolve) => {
            const done = () => resolve();
            res.once("drain", done);
            ctrl.signal.addEventListener("abort", done, { once: true });
          });
        }
      },
      ctrl.signal,
      (size) => {
        if (res.headersSent || res.destroyed) return;
        res.writeHead(200, {
          "content-type": mime,
          "content-length": String(size),
          "content-disposition": "inline",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        });
        headed = true;
      },
    );
  } catch (err) {
    if (res.headersSent) {
      if (!res.destroyed) res.destroy();
      return;
    }
    throw err;
  } finally {
    req.off("aborted", stop);
  }
  if (!headed && !res.headersSent) json(res, 502, { error: "Image is missing." });
  else if (!res.writableEnded && !res.destroyed) res.end();
}

async function handleCacheSave(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed." });
    return;
  }
  const type = header(req, "content-type");
  if (type.includes("application/json")) {
    const body = (await readJson(req, 1_000_000)) as { name?: unknown; file?: unknown; source?: unknown };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const file = typeof body.file === "string" ? body.file.trim() : "";
    const source = typeof body.source === "string" ? body.source.trim() : "";
    if (!name || !file || !source) {
      json(res, 400, { error: "File is missing." });
      return;
    }
    await saveImageSetFile(name, file, source);
    json(res, 200, { ok: true });
    return;
  }
  let setName = "";
  let fileName = "";
  try {
    setName = decodePathHeader(header(req, "x-ccc-set")).trim();
    fileName = decodePathHeader(header(req, "x-ccc-file")).trim();
  } catch {
    json(res, 400, { error: "Invalid file name." });
    return;
  }
  const length = Number(header(req, "content-length"));
  if (!setName || !fileName || !Number.isInteger(length) || length < 0) {
    req.resume();
    json(res, 400, { error: "File is missing." });
    return;
  }
  await saveImageSetBytes({ name: setName, fileName, body: req, length });
  json(res, 200, { ok: true });
}

async function handleLocalSet(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "GET") {
    json(res, 405, { error: "Method not allowed." });
    return;
  }
  const url = new URL(req.url || "", "http://127.0.0.1");
  const name = url.searchParams.get("name")?.trim() || "";
  const images = await listImageSetCache(name);
  json(res, 200, { images });
}

export async function handleLocalStream(
  req: IncomingMessage,
  res: ServerResponse,
  getPort: () => number | null,
): Promise<boolean> {
  if (!isLocalStream(req.url)) return false;
  const pathOnly = (req.url || "").split("?")[0];
  try {
    if (pathOnly === UPLOAD) await handleFsUpload(req, res);
    else if (pathOnly === PATHS) await handlePaths(req, res, getPort);
    else if (pathOnly === RAW) await handleRaw(req, res);
    else if (pathOnly === CACHE) await handleCacheSave(req, res);
    else if (pathOnly === LOCAL_SET) await handleLocalSet(req, res);
    else await handlePreview(req, res, getPort);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transfer failed.";
    if (message === "Canceled.") {
      if (!res.writableEnded) res.end();
      return true;
    }
    if (!res.headersSent) {
      const status = message === "Not connected to the server." ? 409 : 400;
      json(res, status, { error: message });
    } else if (!res.writableEnded) {
      await writeLine(res, { type: "error", error: message }).catch(() => {});
      res.end();
    }
  }
  return true;
}
