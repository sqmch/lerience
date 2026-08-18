import { VISUAL_SCHEME } from "./ipc";

/** The iframe src for a course visual, served by main's scheme handler.
 *  `visuals/` prefixes in lab.json are tolerated (engine rule). */
export function visualSrc(moduleId: string, file: string): string {
  const stripped = file.replace(/^visuals\//, "");
  return `${VISUAL_SCHEME}://${moduleId}/${encodeURIComponent(stripped)}`;
}
