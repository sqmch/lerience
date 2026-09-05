/* Which editor opens, and opening it (ADR-034).
 *
 * Three facts meet here: what discovery found, what the learner chose (a
 * known editor by id, or a program they browsed to), and a directory to open.
 * The service owns the rule that turns the first two into "the editor" and
 * the launch that never blocks the app — a detached child, no shell, no
 * waiting on the editor's exit. Pure over injected discovery, settings and
 * spawn so the rule can be tested without a desktop. */

import { spawn } from "node:child_process";
import path from "node:path";
import {
  KNOWN_EDITOR_IDS,
  type EditorCatalog,
  type EditorChoice,
  type EditorId,
  type KnownEditorId,
  type OpenInEditorReply,
} from "../../shared/editor";
import type { EditorLaunch, InstalledEditor } from "./discovery";

/** What settings.json remembers. A known editor is remembered by id only, so a
 *  reinstall in a new place still resolves; a custom one IS its path. */
export type EditorPreference = { id: KnownEditorId } | { id: "custom"; executablePath: string };

export function isKnownEditorId(value: unknown): value is KnownEditorId {
  return typeof value === "string" && (KNOWN_EDITOR_IDS as readonly string[]).includes(value);
}

export function parseEditorPreference(value: unknown): EditorPreference | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (isKnownEditorId(record["id"])) return { id: record["id"] };
  if (
    record["id"] === "custom" &&
    typeof record["executablePath"] === "string" &&
    record["executablePath"] !== ""
  ) {
    return { id: "custom", executablePath: record["executablePath"] };
  }
  return undefined;
}

export interface EditorServiceOptions {
  discover: () => InstalledEditor[];
  readPreference: () => EditorPreference | undefined;
  writePreference: (preference: EditorPreference | undefined) => void;
  launch?: (launch: EditorLaunch, target: string, file?: EditorFileOptions) => Promise<void>;
  platform?: NodeJS.Platform;
  isRunnable?: (executablePath: string) => boolean;
}

/** The learner-facing name for a browsed-to program: its file name without
 *  the extension, or the app bundle's name on macOS. */
export function customEditorLabel(executablePath: string): string {
  const base = path.basename(executablePath);
  const extension = path.extname(base).toLowerCase();
  return extension === ".exe" || extension === ".app" || extension === ".appimage"
    ? base.slice(0, -extension.length)
    : base;
}

export interface EditorFileOptions {
  editorId: EditorId;
  line?: number;
  column?: number;
}

export class EditorService {
  private readonly launch: NonNullable<EditorServiceOptions["launch"]>;
  private readonly platform: NodeJS.Platform;

  constructor(private readonly options: EditorServiceOptions) {
    this.launch = options.launch ?? launchDetached;
    this.platform = options.platform ?? process.platform;
  }

  catalog(): EditorCatalog {
    return this.resolve().catalog;
  }

  select(editorId: unknown): EditorCatalog {
    const { installed } = this.resolve();
    // "custom" is already the preference whenever it is offered, so choosing
    // it again changes nothing; an id that is not installed is ignored.
    if (isKnownEditorId(editorId) && installed.some((editor) => editor.id === editorId)) {
      this.options.writePreference({ id: editorId });
    }
    return this.catalog();
  }

  /** Remember a program the learner pointed at. Returns null when the path is
   *  not something this machine can run, and leaves the preference alone. */
  chooseCustom(executablePath: string): EditorCatalog | null {
    const runnable = this.options.isRunnable ?? (() => true);
    if (!runnable(executablePath)) return null;
    this.options.writePreference({ id: "custom", executablePath });
    return this.catalog();
  }

  async open(
    directory: string,
    file?: { line?: number; column?: number },
  ): Promise<OpenInEditorReply> {
    const { selected } = this.resolve();
    if (selected === null) {
      return {
        ok: false,
        reason: "no-editor",
        detail: "No editor was found on this computer. Choose one from the menu.",
      };
    }
    try {
      if (file === undefined) await this.launch(selected.launch, directory);
      else await this.launch(selected.launch, directory, { ...file, editorId: selected.id });
      return { ok: true };
    } catch (error) {
      const name = selected.label;
      const why = error instanceof Error ? error.message : "";
      return {
        ok: false,
        reason: "launch-failed",
        detail: `${name} could not be started.${why === "" ? "" : ` ${why}`}`,
      };
    }
  }

  private resolve(): {
    installed: InstalledEditor[];
    preference: EditorPreference | undefined;
    selected: { id: EditorId; label: string; launch: EditorLaunch } | null;
    catalog: EditorCatalog;
  } {
    const installed = this.options.discover();
    const preference = this.options.readPreference();

    const editors: EditorChoice[] = installed.map((editor) => ({
      id: editor.id,
      label: editor.label,
    }));
    if (preference?.id === "custom") {
      editors.push({ id: "custom", label: customEditorLabel(preference.executablePath) });
    }

    let selected: { id: EditorId; label: string; launch: EditorLaunch } | null = null;
    let chosen = false;
    if (preference?.id === "custom") {
      selected = {
        id: "custom",
        label: customEditorLabel(preference.executablePath),
        launch: customLaunch(preference.executablePath, this.platform),
      };
      chosen = true;
    } else if (preference !== undefined) {
      const match = installed.find((editor) => editor.id === preference.id);
      if (match !== undefined) {
        selected = match;
        chosen = true;
      }
    }
    // A remembered editor that is no longer installed falls back to whatever
    // is, rather than to a dead button; the name on the control says which.
    if (selected === null && installed.length > 0) {
      const first = installed[0];
      if (first !== undefined) selected = first;
    }

    return {
      installed,
      preference,
      selected,
      catalog: { selectedEditorId: selected?.id ?? null, chosen, editors },
    };
  }
}

function customLaunch(executablePath: string, platform: NodeJS.Platform): EditorLaunch {
  if (platform === "darwin" && executablePath.toLowerCase().endsWith(".app")) {
    return { kind: "mac-app", bundlePath: executablePath };
  }
  return { kind: "executable", path: executablePath };
}

/** Start the editor and let go of it. The child is detached and its stdio
 *  ignored, so the app neither waits for it nor is held open by it; the
 *  promise settles on spawn success or failure, not on the editor's exit. */
export function editorArguments(target: string, file?: EditorFileOptions): string[] {
  if (file === undefined || file.editorId === "custom") return [target];
  const located = file.line === undefined ? target : `${target}:${file.line}:${file.column ?? 1}`;
  if (file.editorId === "zed") return [located];
  if (file.editorId === "sublime") return ["--add", located];
  return ["--reuse-window", ...(file.line === undefined ? [] : ["--goto"]), located];
}

export function launchDetached(
  launch: EditorLaunch,
  directory: string,
  file?: EditorFileOptions,
): Promise<void> {
  const [command, args] =
    launch.kind === "mac-app"
      ? ["/usr/bin/open", ["-a", launch.bundlePath, directory]]
      : [launch.path, editorArguments(directory, file)];

  // An Electron-based editor inherits our environment; these two would make it
  // start as a headless Node process instead of an editor.
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_NO_ATTACH_CONSOLE;

  return new Promise((resolve, reject) => {
    let settled = false;
    const child = spawn(command, args, {
      cwd: file === undefined ? directory : path.dirname(directory),
      detached: true,
      stdio: "ignore",
      windowsHide: false,
      env,
    });
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    child.once("spawn", () => {
      if (settled) return;
      settled = true;
      child.unref();
      resolve();
    });
  });
}
