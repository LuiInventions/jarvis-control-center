import path from "node:path";
import { isInside } from "./paths";

const NAME = /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** Accept a folder name. Reject path pieces and Windows device names. */
export function validateInstanceName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name fehlt.");
  if (trimmed.length > 80) throw new Error("Name ist zu lang.");
  if (!NAME.test(trimmed)) {
    throw new Error("Name darf nur Buchstaben, Zahlen, Leerzeichen, Punkt, _ und - enthalten.");
  }
  if (RESERVED.test(trimmed)) throw new Error("Dieser Name ist unter Windows reserviert.");
  return trimmed;
}

/** Absolute folder for one new REA instance. Stays inside the REA root. */
export function instanceDir(root: string, name: string): string {
  const safe = validateInstanceName(name);
  const dir = path.resolve(root, safe);
  if (!isInside(root, dir) || path.resolve(root) === path.resolve(dir)) {
    throw new Error("Ungültiger Name.");
  }
  return dir;
}
