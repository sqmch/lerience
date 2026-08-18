/* Path guards for everything main serves out of a course folder. Pure and
   node-path-only so tests can drive them hard; mirrors the engine study's
   guardRepoFile / guardVisualFile (resolve first, then check containment). */

import path from "node:path";

/** Course documents the renderer may read: .md/.json strictly inside root. */
export function guardCourseDoc(root: string, relativePath: string): { abs: string; ok: boolean } {
  const abs = path.resolve(root, relativePath);
  const inRoot = abs.startsWith(path.resolve(root) + path.sep);
  const extension = path.extname(abs).toLowerCase();
  const ok = inRoot && (extension === ".md" || extension === ".json");
  return { abs, ok };
}

/** Course visuals: only curriculum/<moduleId>/visuals/<file>.html. */
export function guardVisualFile(
  root: string,
  moduleId: string,
  file: string,
): { abs: string; ok: boolean } {
  // A module id that fails the engine's own pattern never reaches the disk.
  if (!/^[0-9]{2}-[a-z0-9-]+$/.test(moduleId)) {
    return { abs: "", ok: false };
  }
  const visualsDir = path.join(root, "curriculum", moduleId, "visuals");
  const abs = path.resolve(visualsDir, file);
  const inDir = abs.startsWith(path.resolve(visualsDir) + path.sep);
  const ok = inDir && path.extname(abs).toLowerCase() === ".html";
  return { abs, ok };
}
