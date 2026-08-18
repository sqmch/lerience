/* App-owned preferences in userData. Small on purpose: this file holds only
   what the learner chose, never anything derivable from a course (ADR-010).

   Reads and writes MERGE. The previous code wrote `{}` to consume M1's
   remembered path, which was harmless when the file held exactly one key and
   silently destructive the moment it held two. */

import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import type { TutorProviderId } from "../shared/provider";

export type ThemePreference = "system" | "light" | "dark";

/** Course-workspace column widths in CSS pixels, app-wide (ADR-019). */
export interface WorkspaceLayout {
  railWidth?: number;
  talkWidth?: number;
}

export interface AppSettings {
  /** M1's remembered course; consumed once by the dashboard migration. */
  lastCoursePath?: string;
  theme?: ThemePreference;
  layout?: WorkspaceLayout;
  /** App-wide preference used only when a fresh tutor runtime starts. */
  tutorProvider?: TutorProviderId;
}

function settingsPath(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function isTutorProviderId(value: unknown): value is TutorProviderId {
  return value === "claude" || value === "codex";
}

/* A stored width is a number that came from a drag, so anything that is not a
   finite positive number is corruption rather than a preference. The renderer
   clamps to the token measures on read anyway — this only keeps NaN, Infinity
   and hand-edited nonsense from reaching a CSS length. */
function readLayout(value: unknown): WorkspaceLayout | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const layout: WorkspaceLayout = {};
  for (const key of ["railWidth", "talkWidth"] as const) {
    const width = record[key];
    if (typeof width === "number" && Number.isFinite(width) && width > 0) layout[key] = width;
  }
  return Object.keys(layout).length === 0 ? undefined : layout;
}

/** Never throws: unreadable or malformed settings mean "no preferences yet",
 *  which is always a safe answer for this file's contents. */
export function parseSettings(parsed: unknown): AppSettings {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};

  const record = parsed as Record<string, unknown>;
  const settings: AppSettings = {};
  if (typeof record["lastCoursePath"] === "string" && record["lastCoursePath"] !== "") {
    settings.lastCoursePath = record["lastCoursePath"];
  }
  if (isThemePreference(record["theme"])) settings.theme = record["theme"];
  const layout = readLayout(record["layout"]);
  if (layout !== undefined) settings.layout = layout;
  if (isTutorProviderId(record["tutorProvider"])) {
    settings.tutorProvider = record["tutorProvider"];
  }
  return settings;
}

export function readSettings(): AppSettings {
  let source: string;
  try {
    source = fs.readFileSync(settingsPath(), "utf8");
  } catch {
    return {};
  }

  try {
    return parseSettings(JSON.parse(source.replace(/^\uFEFF/, "")));
  } catch {
    return {};
  }
}

/** Merges the patch over what is on disk. A key set to undefined is removed. */
export function updateSettings(patch: Partial<AppSettings>): void {
  const next: AppSettings = { ...readSettings() };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete next[key as keyof AppSettings];
    else Object.assign(next, { [key]: value });
  }

  try {
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.writeFileSync(settingsPath(), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  } catch {
    // A lost preference is a small cost; failing the action that triggered the
    // write would be a larger one.
  }
}
