/* What the build screen says about the files landing in the course folder.
 *
 * A module has a fixed shape (course-engine FORMAT.md), so the filesystem
 * inventory can answer a better question than "what was the last file written":
 * which parts of the module exist yet. Everything here is derived from paths
 * currently present on disk — a part is landed when a file under it exists,
 * "now" only when the live tool activity names it — and nothing is claimed
 * about order or about what is still to come. */

export const MODULE_PARTS = [
  { key: "manifest", label: "Manifest", path: "module.json" },
  { key: "lesson", label: "Lesson", path: "LESSON.md" },
  { key: "brief", label: "Brief", path: "BRIEF.md" },
  { key: "quiz", label: "Quiz", path: "quiz.md" },
  { key: "scaffold", label: "Scaffold", path: "scaffold" },
  { key: "checks", label: "Checks", path: "checks" },
  { key: "hints", label: "Hints", path: "hints" },
] as const;

export type ModulePartKey = (typeof MODULE_PARTS)[number]["key"];

export interface ModuleParts {
  /** The module directory's name under curriculum/, e.g. "00-one-reading". */
  moduleId: string | null;
  landed: ReadonlySet<ModulePartKey>;
  /** The part the tutor's current tool activity names, if any. */
  now: ModulePartKey | null;
}

/** Write plumbing that lands beside real course files and must never read as
 *  progress: the app's own atomic-write twins ("quiz.md.tmp.22568.1cd3b28f"),
 *  pnpm's install temporaries ("_tmp_16784_c7253531e0a5…"), and dependency
 *  trees, which the watch drops by content but not as a bare directory entry. */
export function isWriteNoise(path: string): boolean {
  return (
    /\.tmp\.[\w.]+$/.test(path) ||
    /(^|\/)_tmp_\d+_[0-9a-f]+$/.test(path) ||
    /(^|\/)node_modules(\/|$)/.test(path) ||
    /(^|\/)\.pnpm-store(\/|$)/.test(path)
  );
}

function moduleIdOf(path: string): string | null {
  const match = /^curriculum\/([^/]+)(?:\/|$)/.exec(path);
  return match?.[1] ?? null;
}

function isUnderPart(relative: string, part: string): boolean {
  return relative === part || relative.startsWith(`${part}/`);
}

/** Before module files exist, report zero without inventing a directory name. */
export function moduleParts(
  written: readonly string[],
  activityDetail: string | null,
): ModuleParts {
  const moduleId = written.map(moduleIdOf).find((id) => id !== null) ?? null;
  if (moduleId === null) return { moduleId: null, landed: new Set(), now: null };
  const prefix = `curriculum/${moduleId}/`;
  const landed = new Set<ModulePartKey>();
  for (const path of written) {
    if (!path.startsWith(prefix)) continue;
    const relative = path.slice(prefix.length);
    for (const part of MODULE_PARTS) {
      if (isUnderPart(relative, part.path)) landed.add(part.key);
    }
  }
  // The activity target is a provider path: absolute or relative, either
  // separator. The module directory is distinctive enough to anchor on.
  const detail = activityDetail?.split("\\").join("/") ?? null;
  const now =
    detail === null
      ? null
      : (MODULE_PARTS.find((part) => {
          const needle = `${prefix}${part.path}`;
          return detail.endsWith(needle) || detail.includes(`${needle}/`);
        })?.key ?? null);
  return { moduleId, landed, now };
}

export interface WrittenGroup {
  /** The shared directory prefix, ending in "/" — or "" for course-root files. */
  head: string;
  files: string[];
}

/** The landed paths as a short tree rather than a log: one head per directory
 *  (the module's own directory counts as one), the files beneath it with the
 *  prefix stripped, and a directory entry dropped once a file inside it has
 *  appeared — "scaffold" beside "scaffold/package.json" says nothing twice. */
export function groupWritten(written: readonly string[]): WrittenGroup[] {
  const files = written.filter(
    (path) => !written.some((other) => other !== path && other.startsWith(`${path}/`)),
  );
  const groups: WrittenGroup[] = [];
  for (const path of files) {
    const moduleId = moduleIdOf(path);
    const head =
      moduleId !== null && path.startsWith(`curriculum/${moduleId}/`)
        ? `curriculum/${moduleId}/`
        : path.includes("/")
          ? path.slice(0, path.indexOf("/") + 1)
          : "";
    const group = groups.find((candidate) => candidate.head === head);
    const file = path.slice(head.length);
    if (group === undefined) groups.push({ head, files: [file] });
    else group.files.push(file);
  }
  return groups;
}
