import tls from "node:tls";

interface TlsCa {
  getCACertificates?(store: "default" | "system"): string[];
  setDefaultCACertificates?(certs: string[]): void;
}

let done = false;

/**
 * Node trusts its own CA bundle. On this PC a local inspector adds a CA that
 * only the Windows store knows, so HTTPS to OpenAI fails as "Connection error."
 * Merge the OS roots in once. Later calls do nothing.
 */
export function trustSystemCertificates(): void {
  if (done) return;
  done = true;
  const api = tls as TlsCa;
  if (!api.getCACertificates || !api.setDefaultCACertificates) return;
  try {
    const bundled = api.getCACertificates("default");
    const system = api.getCACertificates("system");
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const cert of [...bundled, ...system]) {
      if (seen.has(cert)) continue;
      seen.add(cert);
      merged.push(cert);
    }
    if (merged.length > bundled.length) api.setDefaultCACertificates(merged);
  } catch {
    /* keep the Node bundle */
  }
}
