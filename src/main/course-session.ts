/* Holds the one open course: load, remember, watch. The lens owns nothing —
   every load re-reads the files, and the watcher's only job is telling the
   renderer that a re-read is worth doing. */

import fs from "node:fs";
import path from "node:path";
import { assembleCourseData } from "../shared/course-data";
import type { CourseSnapshot } from "../shared/ipc";
import { gatherCourseFiles, looksLikeCourse } from "./course-files";
import { readSettings, updateSettings } from "./settings";

const WATCH_DEBOUNCE_MS = 300;

let currentRoot: string | null = null;
let watcher: fs.FSWatcher | null = null;

/** Consume M1's remembered-course path: the registry is the course index now,
 *  and a surviving lastCoursePath would resurrect a course the learner removed
 *  from the dashboard every time the registry went empty. Removes that one key
 *  and leaves every other preference alone. */
export function clearLastCourse(): void {
  updateSettings({ lastCoursePath: undefined });
}

export function lastCoursePath(): string | null {
  return readSettings().lastCoursePath ?? null;
}

export function loadCourse(root: string): CourseSnapshot {
  currentRoot = root;
  return inspectCourse(root);
}

/** Read a course for the dashboard without changing which course the guarded
 * IPC/read/watch surface considers open. */
export function inspectCourse(root: string): CourseSnapshot {
  return {
    rootPath: root,
    folderName: path.basename(root),
    data: assembleCourseData(gatherCourseFiles(root)),
  };
}

export function currentCourseRoot(): string | null {
  return currentRoot;
}

export function closeCourse(): void {
  currentRoot = null;
  unwatchCourse();
}

export { looksLikeCourse };

/** Watch the open course; `onChange` receives debounced course-relative paths.
 *  Replaces any previous watcher (one open course at a time). */
export function watchCourse(root: string, onChange: (paths: string[]) => void): void {
  unwatchCourse();
  const pending = new Set<string>();
  let timer: NodeJS.Timeout | null = null;

  try {
    watcher = fs.watch(root, { recursive: true }, (_event, filename) => {
      if (filename === null) return;
      const rel = filename.split(path.sep).join("/");
      // Only the lens's inputs matter; scaffold node_modules and .git churn
      // constantly. The directory entry itself is dropped along with its
      // contents — it is the same install, not a course file.
      if (/(^|\/)node_modules(\/|$)/.test(rel) || rel.startsWith(".git")) return;
      if (!/^(COURSE\.md|CLAUDE\.md|AGENTS\.md|tutor\/|curriculum\/)/.test(rel)) return;
      pending.add(rel);
      timer ??= setTimeout(() => {
        timer = null;
        const paths = [...pending];
        pending.clear();
        onChange(paths);
      }, WATCH_DEBOUNCE_MS);
    });
  } catch {
    // A course on a filesystem that cannot watch still renders; it just
    // doesn't live-refresh. The renderer's data is re-read on every load.
  }
}

export function unwatchCourse(): void {
  watcher?.close();
  watcher = null;
}
