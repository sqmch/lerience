/* Finding the learner's editors without a shell (ADR-006, ADR-034).
 *
 * The same stance as provider discovery (`provider/installed-runtime.ts`): look
 * in the places each editor's own installer puts it, then along PATH, and read
 * nothing else — no registry, no `which`, no editor config. What comes back is
 * a way to LAUNCH each editor that was found, which is the only thing the app
 * needs from it. Pure over injected platform/environment/stat so the catalog
 * can be tested on any machine. */

import fs from "node:fs";
import path from "node:path";
import { KNOWN_EDITOR_IDS, type KnownEditorId } from "../../shared/editor";

/** How to start an editor with one directory argument. macOS apps are opened
 *  through `open -a` so the bundle's own launcher applies; everywhere else the
 *  program is spawned directly. */
export type EditorLaunch =
  { kind: "executable"; path: string } | { kind: "mac-app"; bundlePath: string };

export interface InstalledEditor {
  id: KnownEditorId;
  label: string;
  launch: EditorLaunch;
}

export interface DiscoverEditorsOptions {
  platform?: NodeJS.Platform;
  environment?: NodeJS.ProcessEnv;
  isFile?: (candidate: string) => boolean;
  isDirectory?: (candidate: string) => boolean;
}

interface PathName {
  name: string;
  /** Some PATH entries are command wrappers (VS Code's `bin/code.cmd`) that
   *  only a shell can run. The real program sits one directory up; this maps a
   *  wrapper's directory to it. Absent means the PATH hit is itself runnable. */
  program?: (binDirectory: string) => string;
}

interface EditorSpec {
  id: KnownEditorId;
  label: string;
  win32: { wellKnown: (environment: NodeJS.ProcessEnv) => Array<string | null>; path: PathName[] };
  darwin: { bundles: string[]; path: PathName[] };
  linux: { wellKnown: (environment: NodeJS.ProcessEnv) => Array<string | null>; path: PathName[] };
}

const programs = (environment: NodeJS.ProcessEnv): string[] =>
  unique([
    environment.ProgramFiles ?? null,
    environment["ProgramFiles(x86)"] ?? null,
    environment.ProgramW6432 ?? null,
  ]);

const localPrograms = (environment: NodeJS.ProcessEnv): string | null =>
  environment.LOCALAPPDATA ? path.join(environment.LOCALAPPDATA, "Programs") : null;

const parentProgram =
  (name: string) =>
  (binDirectory: string): string =>
    path.join(binDirectory, "..", name);

const SPECS: Record<KnownEditorId, EditorSpec> = {
  vscode: {
    id: "vscode",
    label: "Visual Studio Code",
    win32: {
      wellKnown: (environment) => {
        const local = localPrograms(environment);
        return [
          local ? path.join(local, "Microsoft VS Code", "Code.exe") : null,
          ...programs(environment).map((root) => path.join(root, "Microsoft VS Code", "Code.exe")),
        ];
      },
      path: [{ name: "code.cmd", program: parentProgram("Code.exe") }],
    },
    darwin: { bundles: ["Visual Studio Code.app"], path: [{ name: "code" }] },
    linux: {
      wellKnown: () => ["/usr/share/code/bin/code", "/snap/bin/code", "/usr/bin/code"],
      path: [{ name: "code" }],
    },
  },
  cursor: {
    id: "cursor",
    label: "Cursor",
    win32: {
      wellKnown: (environment) => {
        const local = localPrograms(environment);
        return [local ? path.join(local, "cursor", "Cursor.exe") : null];
      },
      path: [{ name: "cursor.cmd", program: parentProgram("Cursor.exe") }],
    },
    darwin: { bundles: ["Cursor.app"], path: [{ name: "cursor" }] },
    linux: { wellKnown: () => ["/usr/bin/cursor"], path: [{ name: "cursor" }] },
  },
  zed: {
    id: "zed",
    label: "Zed",
    win32: {
      wellKnown: (environment) => {
        const local = localPrograms(environment);
        return [local ? path.join(local, "Zed", "Zed.exe") : null];
      },
      // Zed's PATH entry is a real executable (its CLI), not a wrapper.
      path: [{ name: "zed.exe" }],
    },
    darwin: { bundles: ["Zed.app"], path: [{ name: "zed" }] },
    linux: {
      wellKnown: (environment) => [
        environment.HOME ? path.join(environment.HOME, ".local", "bin", "zed") : null,
        "/usr/bin/zeditor",
      ],
      path: [{ name: "zed" }, { name: "zeditor" }],
    },
  },
  windsurf: {
    id: "windsurf",
    label: "Windsurf",
    win32: {
      wellKnown: (environment) => {
        const local = localPrograms(environment);
        return [local ? path.join(local, "Windsurf", "Windsurf.exe") : null];
      },
      path: [{ name: "windsurf.cmd", program: parentProgram("Windsurf.exe") }],
    },
    darwin: { bundles: ["Windsurf.app"], path: [{ name: "windsurf" }] },
    linux: { wellKnown: () => ["/usr/bin/windsurf"], path: [{ name: "windsurf" }] },
  },
  "vscode-insiders": {
    id: "vscode-insiders",
    label: "Visual Studio Code Insiders",
    win32: {
      wellKnown: (environment) => {
        const local = localPrograms(environment);
        return [
          local ? path.join(local, "Microsoft VS Code Insiders", "Code - Insiders.exe") : null,
          ...programs(environment).map((root) =>
            path.join(root, "Microsoft VS Code Insiders", "Code - Insiders.exe"),
          ),
        ];
      },
      path: [{ name: "code-insiders.cmd", program: parentProgram("Code - Insiders.exe") }],
    },
    darwin: { bundles: ["Visual Studio Code - Insiders.app"], path: [{ name: "code-insiders" }] },
    linux: {
      wellKnown: () => ["/usr/share/code-insiders/bin/code-insiders", "/usr/bin/code-insiders"],
      path: [{ name: "code-insiders" }],
    },
  },
  sublime: {
    id: "sublime",
    label: "Sublime Text",
    win32: {
      wellKnown: (environment) =>
        programs(environment).flatMap((root) => [
          path.join(root, "Sublime Text", "sublime_text.exe"),
          path.join(root, "Sublime Text 3", "sublime_text.exe"),
        ]),
      path: [{ name: "subl.exe" }, { name: "sublime_text.exe" }],
    },
    darwin: { bundles: ["Sublime Text.app"], path: [{ name: "subl" }] },
    linux: {
      wellKnown: () => ["/opt/sublime_text/sublime_text", "/usr/bin/subl"],
      path: [{ name: "subl" }, { name: "sublime_text" }],
    },
  },
};

/** Every known editor that is installed, in catalog order. */
export function discoverEditors(options: DiscoverEditorsOptions = {}): InstalledEditor[] {
  const platform = options.platform ?? process.platform;
  const environment = options.environment ?? process.env;
  const isFile = options.isFile ?? ordinaryFile;
  const isDirectory = options.isDirectory ?? ordinaryDirectory;

  const found: InstalledEditor[] = [];
  for (const id of KNOWN_EDITOR_IDS) {
    const launch = locate(SPECS[id], platform, environment, isFile, isDirectory);
    if (launch !== null) found.push({ id, label: SPECS[id].label, launch });
  }
  return found;
}

function locate(
  spec: EditorSpec,
  platform: NodeJS.Platform,
  environment: NodeJS.ProcessEnv,
  isFile: (candidate: string) => boolean,
  isDirectory: (candidate: string) => boolean,
): EditorLaunch | null {
  if (platform === "darwin") {
    const home = environment.HOME;
    for (const bundle of spec.darwin.bundles) {
      for (const root of unique(["/Applications", home ? path.join(home, "Applications") : null])) {
        const bundlePath = path.join(root, bundle);
        if (isDirectory(bundlePath)) return { kind: "mac-app", bundlePath };
      }
    }
    return fromPath(spec.darwin.path, platform, environment, isFile);
  }

  const table = platform === "win32" ? spec.win32 : spec.linux;
  for (const candidate of unique(table.wellKnown(environment))) {
    if (isFile(candidate)) return { kind: "executable", path: candidate };
  }
  return fromPath(table.path, platform, environment, isFile);
}

function fromPath(
  names: PathName[],
  platform: NodeJS.Platform,
  environment: NodeJS.ProcessEnv,
  isFile: (candidate: string) => boolean,
): EditorLaunch | null {
  for (const directory of pathDirectories(platform, environment)) {
    for (const entry of names) {
      if (!isFile(path.join(directory, entry.name))) continue;
      const program = entry.program ? path.resolve(entry.program(directory)) : null;
      if (program === null) return { kind: "executable", path: path.join(directory, entry.name) };
      if (isFile(program)) return { kind: "executable", path: program };
    }
  }
  return null;
}

function pathDirectories(platform: NodeJS.Platform, environment: NodeJS.ProcessEnv): string[] {
  const pathValue = Object.entries(environment).find(
    ([key, value]) => key.toLowerCase() === "path" && typeof value === "string",
  )?.[1];
  if (pathValue === undefined || pathValue === "") return [];
  return unique(
    pathValue
      .split(platform === "win32" ? ";" : ":")
      .map((directory) => directory.trim().replace(/^"(.*)"$/u, "$1"))
      .filter((directory) => directory !== ""),
  );
}

function ordinaryFile(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function ordinaryDirectory(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}

function unique(candidates: Array<string | null>): string[] {
  return [...new Set(candidates.filter((candidate): candidate is string => candidate !== null))];
}
