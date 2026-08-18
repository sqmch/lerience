/* Gathers a CourseFileMap from disk for shared assembly. The walk is bounded
   to what the lens reads — COURSE.md, tutor/, curriculum/ — and skips
   node_modules (scaffolds carry one) and dot-directories (.git). */

import fs from "node:fs";
import path from "node:path";
import type { CourseFileMap } from "../shared/course-data";

const WALK_ROOTS = ["curriculum", "tutor"];
const ROOT_FILES = ["COURSE.md", "CLAUDE.md", "AGENTS.md"];

/** Small files assembly parses eagerly; everything else is read on demand. */
const CONTENT_PATTERNS = [
  /^COURSE\.md$/,
  /^tutor\/(progress\.json|quiz-bank\.json|journal\.md)$/,
  /^curriculum\/[^/]+\/(module\.json|lab\.json)$/,
  /^curriculum\/[^/]+\/scaffold\/package\.json$/,
];

function shouldSkip(name: string): boolean {
  return name === "node_modules" || name.startsWith(".");
}

function walk(rootAbs: string, relative: string, files: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(path.join(rootAbs, relative), { withFileTypes: true });
  } catch {
    return; // a directory that vanished mid-walk costs its subtree, not the load
  }
  for (const entry of entries) {
    if (shouldSkip(entry.name)) continue;
    const rel = relative === "" ? entry.name : `${relative}/${entry.name}`;
    if (entry.isDirectory()) walk(rootAbs, rel, files);
    else if (entry.isFile()) files.push(rel);
  }
}

export function gatherCourseFiles(root: string): CourseFileMap {
  const files: string[] = [];
  for (const file of ROOT_FILES) {
    if (fs.existsSync(path.join(root, file))) files.push(file);
  }
  for (const dir of WALK_ROOTS) {
    if (fs.existsSync(path.join(root, dir))) walk(root, dir, files);
  }
  files.sort((left, right) => left.localeCompare(right));

  const contents: Record<string, string> = {};
  for (const file of files) {
    if (!CONTENT_PATTERNS.some((pattern) => pattern.test(file))) continue;
    try {
      // Editors on Windows write UTF-8 BOMs; JSON.parse refuses them. The
      // lens reads what's there, so it strips rather than rejects.
      contents[file] = fs.readFileSync(path.join(root, file), "utf8").replace(/^\uFEFF/, "");
    } catch {
      // unreadable content renders as absent; assembly degrades per file
    }
  }
  return { files, contents };
}

/** A folder counts as a course when any engine marker is present. Loose on
 *  purpose: a brand-new course may have nothing but CLAUDE.md yet. */
export function looksLikeCourse(root: string): boolean {
  return (
    fs.existsSync(path.join(root, "CLAUDE.md")) ||
    fs.existsSync(path.join(root, "COURSE.md")) ||
    fs.existsSync(path.join(root, "curriculum")) ||
    fs.existsSync(path.join(root, "tutor"))
  );
}
