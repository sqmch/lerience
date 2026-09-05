import fs from "node:fs";
import path from "node:path";
import { guardModuleDirectory } from "../scripts/parsers";

export type DocumentLink =
  | { kind: "web"; url: string }
  | { kind: "file"; path: string; line?: number; column?: number }
  | { kind: "invalid"; detail: string };

/** Resolve from the document's module; never grant access outside the real course root. */
export function resolveDocumentLink(root: string, moduleId: unknown, href: unknown): DocumentLink {
  const invalid = (
    detail = "This link does not point to a file inside this course.",
  ): DocumentLink => ({ kind: "invalid", detail });
  if (typeof moduleId !== "string" || typeof href !== "string" || href.length > 8192)
    return invalid();
  const module = guardModuleDirectory(root, moduleId);
  if (!module.ok) return invalid();
  if (/^https?:\/\//i.test(href)) {
    try {
      const url = new URL(href);
      if (url.username || url.password) return invalid();
      return { kind: "web", url: url.href };
    } catch {
      return invalid("This web link is malformed.");
    }
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith("//")) return invalid();
  const hash = href.indexOf("#");
  const fragment = hash < 0 ? "" : href.slice(hash + 1);
  let relative: string;
  try {
    relative = decodeURIComponent(hash < 0 ? href : href.slice(0, hash));
  } catch {
    return invalid("This file link is malformed.");
  }
  if (
    !relative ||
    Array.from(relative).some((character) => character.charCodeAt(0) < 32) ||
    /^[a-z]:/i.test(relative) ||
    /^[\\/]/.test(relative)
  )
    return invalid();
  const absolute = path.resolve(module.moduleDir, relative.replaceAll("\\", "/"));
  const inside = (base: string, candidate: string): boolean => {
    const rel = path.relative(base, candidate);
    return rel !== "" && rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
  };
  if (!inside(path.resolve(root), absolute)) return invalid();
  try {
    const canonical = fs.realpathSync(absolute);
    if (!inside(fs.realpathSync(root), canonical)) return invalid();
    if (!fs.statSync(canonical).isFile())
      return invalid("This link points to a folder, not a file.");
    const location = /^(?:L)?([1-9]\d*)(?:(?::|C)([1-9]\d*))?(?:-L?[1-9]\d*)?$/.exec(fragment);
    const line = location?.[1] === undefined ? undefined : Number(location[1]);
    const column = location?.[2] === undefined ? undefined : Number(location[2]);
    if (
      (line !== undefined && !Number.isSafeInteger(line)) ||
      (column !== undefined && !Number.isSafeInteger(column))
    )
      return invalid();
    return {
      kind: "file",
      path: canonical,
      ...(line === undefined ? {} : { line }),
      ...(column === undefined ? {} : { column }),
    };
  } catch {
    return invalid("This linked file could not be found or read. It may have moved.");
  }
}
