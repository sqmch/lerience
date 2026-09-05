/* The learner's own editor, as the renderer sees it (ADR-006, ADR-034).
 *
 * The app embeds no editor and runs no shell. What crosses this boundary is a
 * list of editors the main process found on the machine, which one opens by
 * default, and a way to open a course directory in one of them. Executable
 * paths stay in main: the renderer names an editor, never a program. */

/** Editors the app knows how to find and launch without a shell. Ordered by
 *  how likely a learner is to have exactly one of them — the order is also the
 *  implicit default when nothing has been chosen. */
export const KNOWN_EDITOR_IDS = [
  "vscode",
  "cursor",
  "zed",
  "windsurf",
  "vscode-insiders",
  "sublime",
] as const;

export type KnownEditorId = (typeof KNOWN_EDITOR_IDS)[number];

/** "custom" is an executable the learner pointed at themselves, for an editor
 *  the catalog does not know or an install it could not find. */
export type EditorId = KnownEditorId | "custom";

export interface EditorChoice {
  id: EditorId;
  /** A product name for a known editor; the file name for a custom one. */
  label: string;
}

export interface EditorCatalog {
  /** Which editor "Open in editor" uses. Null only when nothing was found and
   *  nothing was chosen. An implicit default (nothing chosen, something found)
   *  reports the first detected editor here so the control can name it. */
  selectedEditorId: EditorId | null;
  /** True when the learner picked the selection themselves, false when it is
   *  the first editor the app found — a hint to the control, not a rule. */
  chosen: boolean;
  editors: EditorChoice[];
}

/** What to open: a module's scaffold (the project the learner builds, where
 *  package.json and the checks' cwd live) or the whole course folder. */
export type EditorTarget =
  | { kind: "module"; moduleId: string }
  | { kind: "course" }
  | { kind: "document-link"; moduleId: string; href: string };

export type OpenInEditorReply =
  | { ok: true }
  | {
      ok: false;
      reason: "no-course" | "no-editor" | "no-target" | "launch-failed";
      /** Learner-facing, already phrased for the moment of action. */
      detail: string;
    };

export type BrowseEditorReply =
  | { ok: true; catalog: EditorCatalog }
  | { ok: false; reason: "cancelled" | "not-runnable"; catalog: EditorCatalog };
