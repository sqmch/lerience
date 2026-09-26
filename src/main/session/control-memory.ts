/* Remembered session controls, per course and provider (ADR-040).

   A learner who picks "Never ask" or "Full access" for a course build is
   making a statement about THIS course folder's work, not about the provider
   in general — so the memory is keyed by course identity and provider, lives
   in app userData beside the course registry (ADR-010), and never in the
   course folder, where a git-tracked access grant would travel to another
   machine. Only explicit learner choices are stored: a control set back to
   the provider default is forgotten, never recorded as a value. */

import fs from "node:fs";
import path from "node:path";
import type { TutorProviderId } from "../../shared/provider";
import type { SessionControlPatch, SessionEffort } from "../../shared/seminar";

export type RememberedControlKey = "model" | "effort" | "autonomy" | "access";
export const REMEMBERED_CONTROL_KEYS: readonly RememberedControlKey[] = [
  "model",
  "effort",
  "autonomy",
  "access",
];

/** Explicit choices only; every key present names something the learner
 *  picked for this course. Applying it as a patch restores exactly those. */
export interface RememberedControls {
  model?: string;
  effort?: SessionEffort;
  autonomy?: string;
  access?: string;
}

export interface ControlMemory {
  read(courseId: string, providerId: TutorProviderId): RememberedControls;
  /** Merge an applied learner patch. A `null` value means "back to the
   *  provider default" and forgets that key rather than storing it. */
  remember(courseId: string, providerId: TutorProviderId, patch: SessionControlPatch): void;
}

const FILE_NAME = "course-controls.json";
const VERSION = 1 as const;

interface MemoryFile {
  version: typeof VERSION;
  courses: Record<string, Partial<Record<TutorProviderId, RememberedControls>>>;
}

function isProviderId(value: string): value is TutorProviderId {
  return value === "claude" || value === "codex";
}

/** Never throws: malformed memory means "nothing remembered", which is always
 *  a safe answer — the session then starts on the learner's own config. */
export function parseRememberedControls(value: unknown): RememberedControls {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const controls: RememberedControls = {};
  for (const key of ["model", "autonomy", "access"] as const) {
    const entry = record[key];
    if (typeof entry === "string" && entry !== "") controls[key] = entry;
  }
  const effort = record["effort"];
  // Compatibility belongs to the live provider capability list at restore.
  if (typeof effort === "string" && effort.trim() !== "") {
    controls.effort = effort;
  }
  return controls;
}

export function mergeRememberedControls(
  current: RememberedControls,
  patch: SessionControlPatch,
): RememberedControls {
  const next: RememberedControls = { ...current };
  for (const key of REMEMBERED_CONTROL_KEYS) {
    const value = patch[key];
    if (value === undefined) continue;
    if (value === null) delete next[key];
    else if (key === "effort") next.effort = value as SessionEffort;
    else next[key] = value;
  }
  return next;
}

export class FileControlMemory implements ControlMemory {
  private readonly filePath: string;

  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, FILE_NAME);
  }

  read(courseId: string, providerId: TutorProviderId): RememberedControls {
    return this.load().courses[courseId]?.[providerId] ?? {};
  }

  remember(courseId: string, providerId: TutorProviderId, patch: SessionControlPatch): void {
    const file = this.load();
    const byProvider = file.courses[courseId] ?? {};
    const merged = mergeRememberedControls(byProvider[providerId] ?? {}, patch);
    if (Object.keys(merged).length === 0) delete byProvider[providerId];
    else byProvider[providerId] = merged;
    if (Object.keys(byProvider).length === 0) delete file.courses[courseId];
    else file.courses[courseId] = byProvider;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, `${JSON.stringify(file, null, 2)}\n`, "utf8");
    } catch {
      // A lost memory costs one re-selection; failing the control change that
      // triggered the write would cost the learner the control itself.
    }
  }

  private load(): MemoryFile {
    const empty: MemoryFile = { version: VERSION, courses: {} };
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8").replace(/^\uFEFF/, ""));
    } catch {
      return empty;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return empty;
    const courses = (parsed as Record<string, unknown>)["courses"];
    if (typeof courses !== "object" || courses === null || Array.isArray(courses)) return empty;
    for (const [courseId, byProvider] of Object.entries(courses as Record<string, unknown>)) {
      if (typeof byProvider !== "object" || byProvider === null || Array.isArray(byProvider)) {
        continue;
      }
      const entry: Partial<Record<TutorProviderId, RememberedControls>> = {};
      for (const [providerId, controls] of Object.entries(byProvider as Record<string, unknown>)) {
        if (!isProviderId(providerId)) continue;
        const remembered = parseRememberedControls(controls);
        if (Object.keys(remembered).length > 0) entry[providerId] = remembered;
      }
      if (Object.keys(entry).length > 0) empty.courses[courseId] = entry;
    }
    return empty;
  }
}
