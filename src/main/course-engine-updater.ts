/*
 * Explicit Course Engine maintenance for an existing learner-owned course.
 *
 * Previewing is read-only. Applying an accepted preview builds and validates a
 * commit in an owned temporary clone, then fast-forwards the still-clean source
 * repository. Git, filesystem, recovery, and ownership details stay behind the
 * two-operation interface below; IPC and renderer code never learn them.
 */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PRODUCT_NAME } from "../shared/product";

const ENGINE_BASELINE_SUBJECT = "Initialize Praxeum Course Engine";
const ENGINE_UPDATE_PREFIX = "Update Praxeum Course Engine to ";
const ENGINE_UPDATE_TRAILER = "Praxeum-Engine-Update: 1";
const ENGINE_TARGET_TRAILER = "Praxeum-Engine-Target:";
const ENGINE_AUTHOR = {
  name: "Lerience",
  email: "noreply@lerience.local",
} as const;
const MAX_GIT_OUTPUT_BYTES = 32 * 1024 * 1024;
const RESERVED_EXACT_PATHS = new Set([".git", ".praxeum.json", "COURSE.md"]);
const RESERVED_PATH_PREFIXES = ["curriculum/", "tutor/"] as const;

export type CourseEngineChangeKind = "add" | "update" | "remove";

export interface CourseEngineChange {
  path: string;
  kind: CourseEngineChangeKind;
}

interface PreviewBase {
  courseRoot: string;
  targetVersion: string;
  targetFingerprint: string;
}

interface InspectablePreviewBase extends PreviewBase {
  head: string;
  branch: string | null;
  courseDirty: boolean;
  changes: CourseEngineChange[];
}

export type CourseEngineUpdatePreview =
  | (InspectablePreviewBase & { status: "current" })
  | (InspectablePreviewBase & { status: "ready" })
  | (PreviewBase & {
      status: "blocked";
      reason: "unsupported-course" | "engine-conflicts" | "unsafe-template";
      detail: string;
      conflicts: string[];
    });

export type CourseEngineUpdateResult =
  | {
      status: "updated";
      fromHead: string;
      toHead: string;
      targetVersion: string;
      changedPaths: string[];
    }
  | { status: "current"; head: string; targetVersion: string }
  | {
      status: "refused";
      reason:
        | "unsupported-course"
        | "unsafe-template"
        | "engine-conflicts"
        | "course-dirty"
        | "detached-head"
        | "candidate-invalid"
        | "course-changed";
      detail: string;
      conflicts?: string[];
    };

export type CandidateValidation = { ok: true } | { ok: false; detail: string };

export interface CourseEngineUpdaterOptions {
  courseTemplateRoot: string;
  targetEngineVersion: string;
  gitExecutable: string;
  validateCandidate(candidateRoot: string): Promise<CandidateValidation>;
}

interface TemplateSnapshot {
  files: Map<string, Buffer>;
  fingerprint: string;
}

interface EngineBaseline {
  commit: string;
  ownedPaths: string[];
}

interface GitResult {
  exitCode: number;
  stdout: Buffer;
  stderr: string;
}

/**
 * The updater is deliberately deep: callers can preview or apply. Everything
 * else -- provenance, path ownership, collision checks, candidate validation,
 * commit construction, race checks, and cleanup -- remains implementation.
 */
export class CourseEngineUpdater {
  private readonly templateRoot: string;
  private readonly targetVersion: string;
  private readonly gitExecutable: string;
  private readonly validateCandidate: CourseEngineUpdaterOptions["validateCandidate"];

  constructor(options: CourseEngineUpdaterOptions) {
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(options.targetEngineVersion)) {
      throw new TypeError("The target Course Engine version must be a semantic version.");
    }
    this.templateRoot = path.resolve(options.courseTemplateRoot);
    this.targetVersion = options.targetEngineVersion;
    this.gitExecutable = options.gitExecutable;
    this.validateCandidate = options.validateCandidate;
  }

  async preview(courseRoot: string): Promise<CourseEngineUpdatePreview> {
    const resolvedCourseRoot = path.resolve(courseRoot);
    let target: TemplateSnapshot;
    try {
      target = await snapshotTemplate(this.templateRoot, this.targetVersion);
    } catch (error) {
      return {
        status: "blocked",
        reason: "unsafe-template",
        detail: errorDetail(error, "The packaged Course Engine template is unsafe."),
        conflicts: [],
        courseRoot: resolvedCourseRoot,
        targetVersion: this.targetVersion,
        targetFingerprint: "",
      };
    }

    const base: PreviewBase = {
      courseRoot: resolvedCourseRoot,
      targetVersion: this.targetVersion,
      targetFingerprint: target.fingerprint,
    };

    const repository = await this.inspectRepository(resolvedCourseRoot);
    if (!repository.ok) {
      return {
        ...base,
        status: "blocked",
        reason: "unsupported-course",
        detail: repository.detail,
        conflicts: [],
      };
    }

    const conflicts: string[] = [];
    const changes: CourseEngineChange[] = [];
    const baselineFiles = new Map<string, Buffer>();
    for (const relativePath of repository.baseline.ownedPaths) {
      baselineFiles.set(
        relativePath,
        await this.gitBuffer(resolvedCourseRoot, [
          "show",
          `${repository.baseline.commit}:${relativePath}`,
        ]),
      );
    }

    const allPaths = new Set([...baselineFiles.keys(), ...target.files.keys()]);
    for (const relativePath of [...allPaths].sort(comparePaths)) {
      const baseline = baselineFiles.get(relativePath);
      const desired = target.files.get(relativePath);
      const current = await inspectCourseFile(resolvedCourseRoot, relativePath);

      if (baseline !== undefined) {
        if (
          current.kind !== "file" ||
          !(await this.worktreeFileMatchesBaseline(
            resolvedCourseRoot,
            relativePath,
            repository.baseline.commit,
          ))
        ) {
          conflicts.push(relativePath);
          continue;
        }
        if (desired === undefined) {
          changes.push({ path: relativePath, kind: "remove" });
        } else if (!desired.equals(baseline)) {
          changes.push({ path: relativePath, kind: "update" });
        }
        continue;
      }

      if (desired === undefined) continue;
      if (current.kind !== "missing") {
        conflicts.push(relativePath);
      } else {
        changes.push({ path: relativePath, kind: "add" });
      }
    }

    if (conflicts.length > 0) {
      return {
        ...base,
        status: "blocked",
        reason: "engine-conflicts",
        detail: `Course Engine files were changed, removed, or occupied by learner files. ${PRODUCT_NAME} will not overwrite them.`,
        conflicts,
      };
    }

    return {
      ...base,
      status: changes.length === 0 ? "current" : "ready",
      head: repository.head,
      branch: repository.branch,
      courseDirty: repository.dirty,
      changes,
    };
  }

  async apply(courseRoot: string): Promise<CourseEngineUpdateResult> {
    const preview = await this.preview(courseRoot);
    if (preview.status === "blocked") {
      return {
        status: "refused",
        reason: preview.reason,
        detail: preview.detail,
        ...(preview.conflicts.length === 0 ? {} : { conflicts: preview.conflicts }),
      };
    }
    if (preview.status === "current") {
      return { status: "current", head: preview.head, targetVersion: preview.targetVersion };
    }
    if (preview.courseDirty) {
      return {
        status: "refused",
        reason: "course-dirty",
        detail: "Finish or close the current course work before updating its Course Engine.",
      };
    }
    if (preview.branch === null) {
      return {
        status: "refused",
        reason: "detached-head",
        detail: `The course is not on a branch. ${PRODUCT_NAME} left it unchanged.`,
      };
    }

    const target = await snapshotTemplate(this.templateRoot, this.targetVersion);
    if (target.fingerprint !== preview.targetFingerprint) {
      return {
        status: "refused",
        reason: "course-changed",
        detail: `The packaged Course Engine changed after preview. ${PRODUCT_NAME} left the course unchanged.`,
      };
    }
    const temporaryRoot = await mkdtemp(path.join(tmpdir(), "praxeum-engine-update-"));
    const candidateRoot = path.join(temporaryRoot, "candidate");
    const emptyHooks = path.join(temporaryRoot, "hooks");
    try {
      await mkdir(emptyHooks);
      await this.gitVoid(undefined, [
        "clone",
        "--quiet",
        "--no-local",
        "--no-hardlinks",
        "--no-checkout",
        preview.courseRoot,
        candidateRoot,
      ]);
      await this.gitVoid(candidateRoot, ["checkout", "--quiet", "--detach", preview.head]);

      for (const change of preview.changes) {
        const destination = coursePath(candidateRoot, change.path);
        if (change.kind === "remove") {
          await rm(destination, { force: true });
          continue;
        }
        const bytes = target.files.get(change.path);
        if (bytes === undefined) throw new Error(`Target file disappeared: ${change.path}`);
        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(destination, bytes);
      }

      await this.gitVoid(candidateRoot, ["add", "--all"]);
      const stagedPaths = splitNul(
        await this.gitBuffer(candidateRoot, ["diff", "--cached", "--name-only", "-z"]),
      ).sort(comparePaths);
      const plannedPaths = preview.changes.map((change) => change.path).sort(comparePaths);
      if (!sameStringArray(stagedPaths, plannedPaths)) {
        throw new Error("The staged candidate did not match the accepted engine preview.");
      }

      const validation = await this.validateCandidate(candidateRoot);
      if (!validation.ok) {
        return {
          status: "refused",
          reason: "candidate-invalid",
          detail: validation.detail,
        };
      }

      const subject = `${ENGINE_UPDATE_PREFIX}${this.targetVersion}`;
      const body = `${ENGINE_UPDATE_TRAILER}\n${ENGINE_TARGET_TRAILER} ${target.fingerprint}`;
      await this.gitVoid(candidateRoot, [
        "-c",
        `user.name=${ENGINE_AUTHOR.name}`,
        "-c",
        `user.email=${ENGINE_AUTHOR.email}`,
        "-c",
        "commit.gpgSign=false",
        "-c",
        `core.hooksPath=${emptyHooks}`,
        "commit",
        "--quiet",
        "--no-verify",
        "-m",
        subject,
        "-m",
        body,
      ]);
      const candidateHead = await this.gitText(candidateRoot, ["rev-parse", "HEAD"]);

      // Recompute immediately before the only mutation of the learner's
      // repository. A tutor turn, editor save, branch switch, or app race makes
      // this refuse instead of applying a stale preview.
      const current = await this.preview(preview.courseRoot);
      if (!matchesAcceptedPreview(current, preview)) {
        return {
          status: "refused",
          reason: "course-changed",
          detail: `The course changed while its engine update was prepared. ${PRODUCT_NAME} left it unchanged.`,
        };
      }

      await this.gitVoid(preview.courseRoot, [
        "fetch",
        "--quiet",
        "--no-tags",
        "--no-write-fetch-head",
        candidateRoot,
        candidateHead,
      ]);
      const afterFetch = await this.preview(preview.courseRoot);
      if (!matchesAcceptedPreview(afterFetch, preview)) {
        return {
          status: "refused",
          reason: "course-changed",
          detail: `The course changed while its engine update was prepared. ${PRODUCT_NAME} left it unchanged.`,
        };
      }
      await this.gitVoid(preview.courseRoot, [
        "-c",
        `core.hooksPath=${emptyHooks}`,
        "merge",
        "--quiet",
        "--ff-only",
        "--no-edit",
        candidateHead,
      ]);

      const [finalHead, finalStatus] = await Promise.all([
        this.gitText(preview.courseRoot, ["rev-parse", "HEAD"]),
        this.gitBuffer(preview.courseRoot, [
          "status",
          "--porcelain=v1",
          "-z",
          "--untracked-files=all",
        ]),
      ]);
      if (finalHead !== candidateHead || finalStatus.byteLength !== 0) {
        throw new Error(
          `Course Engine update reached an unexpected Git state. Recovery commit: ${preview.head}`,
        );
      }

      return {
        status: "updated",
        fromHead: preview.head,
        toHead: candidateHead,
        targetVersion: this.targetVersion,
        changedPaths: plannedPaths,
      };
    } finally {
      try {
        await rm(temporaryRoot, { recursive: true, force: true });
      } catch {
        // The candidate is an owned, inert temp clone. A scanner or indexer
        // holding it open must not turn a completed source update into a false
        // failure; the OS temp lifecycle can reclaim the leftover.
      }
    }
  }

  private async inspectRepository(
    courseRoot: string,
  ): Promise<
    | { ok: true; head: string; branch: string | null; dirty: boolean; baseline: EngineBaseline }
    | { ok: false; detail: string }
  > {
    try {
      const [head, roots, branchResult, status] = await Promise.all([
        this.gitText(courseRoot, ["rev-parse", "--verify", "HEAD"]),
        this.gitText(courseRoot, ["rev-list", "--max-parents=0", "HEAD"]),
        this.git(courseRoot, ["symbolic-ref", "--quiet", "--short", "HEAD"], [0, 1]),
        this.gitBuffer(courseRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
      ]);
      const rootCommits = splitLines(roots);
      if (rootCommits.length !== 1) {
        return { ok: false, detail: "The course does not have one recognizable engine baseline." };
      }
      const rootCommit = rootCommits[0];
      if (rootCommit === undefined || !(await this.isInitialEngineCommit(courseRoot, rootCommit))) {
        return {
          ok: false,
          detail: `This course predates ${PRODUCT_NAME}'s internal engine baseline. It remains compatible, but cannot be updated automatically yet.`,
        };
      }

      const baseline = await this.findEngineBaseline(courseRoot, rootCommit, head);
      return {
        ok: true,
        head,
        branch: branchResult.exitCode === 0 ? branchResult.stdout.toString("utf8").trim() : null,
        dirty: status.byteLength !== 0,
        baseline,
      };
    } catch (error) {
      return {
        ok: false,
        detail: errorDetail(error, "The course Git history could not be inspected safely."),
      };
    }
  }

  private async findEngineBaseline(
    courseRoot: string,
    rootCommit: string,
    head: string,
  ): Promise<EngineBaseline> {
    const commits = splitLines(
      await this.gitText(courseRoot, ["rev-list", "--first-parent", "--reverse", head]),
    );
    let baselineCommit = rootCommit;
    const ownedCandidates = new Set(await this.listTreeFiles(courseRoot, rootCommit, true));

    for (const commit of commits) {
      if (commit === rootCommit || !(await this.isEngineUpdateCommit(courseRoot, commit))) continue;
      baselineCommit = commit;
      const parent = await this.gitText(courseRoot, ["rev-parse", `${commit}^`]);
      for (const changedPath of splitNul(
        await this.gitBuffer(courseRoot, [
          "diff-tree",
          "--no-commit-id",
          "--name-only",
          "--no-renames",
          "-r",
          "-z",
          parent,
          commit,
        ]),
      )) {
        assertEnginePath(changedPath);
        ownedCandidates.add(changedPath);
      }
    }

    const baselineTreePaths = new Set(await this.listTreeFiles(courseRoot, baselineCommit, false));
    return {
      commit: baselineCommit,
      ownedPaths: [...ownedCandidates]
        .filter((relativePath) => baselineTreePaths.has(relativePath))
        .sort(comparePaths),
    };
  }

  private async isInitialEngineCommit(courseRoot: string, commit: string): Promise<boolean> {
    const metadata = splitNul(
      await this.gitBuffer(courseRoot, ["show", "-s", "--format=%an%x00%ae%x00%s%x00", commit]),
    );
    return (
      metadata[0] === ENGINE_AUTHOR.name &&
      metadata[1] === ENGINE_AUTHOR.email &&
      metadata[2] === ENGINE_BASELINE_SUBJECT
    );
  }

  private async isEngineUpdateCommit(courseRoot: string, commit: string): Promise<boolean> {
    const metadata = splitNul(
      await this.gitBuffer(courseRoot, [
        "show",
        "-s",
        "--format=%an%x00%ae%x00%s%x00%B%x00",
        commit,
      ]),
    );
    const body = metadata[3] ?? "";
    return (
      metadata[0] === ENGINE_AUTHOR.name &&
      metadata[1] === ENGINE_AUTHOR.email &&
      (metadata[2] ?? "").startsWith(ENGINE_UPDATE_PREFIX) &&
      body.includes(ENGINE_UPDATE_TRAILER) &&
      body.includes(ENGINE_TARGET_TRAILER)
    );
  }

  private async listTreeFiles(
    courseRoot: string,
    commit: string,
    engineOnly: boolean,
  ): Promise<string[]> {
    const files = splitNul(
      await this.gitBuffer(courseRoot, ["ls-tree", "-r", "-z", "--name-only", commit]),
    );
    if (engineOnly) {
      for (const relativePath of files) assertEnginePath(relativePath);
      assertNoCaseOrShapeCollisions(files);
    }
    return files;
  }

  private async worktreeFileMatchesBaseline(
    courseRoot: string,
    relativePath: string,
    baselineCommit: string,
  ): Promise<boolean> {
    const [worktreeBlob, baselineBlob] = await Promise.all([
      this.gitText(courseRoot, ["hash-object", `--path=${relativePath}`, "--", relativePath]),
      this.gitText(courseRoot, ["rev-parse", `${baselineCommit}:${relativePath}`]),
    ]);
    return worktreeBlob === baselineBlob;
  }

  private async git(
    cwd: string | undefined,
    args: readonly string[],
    acceptedExitCodes: readonly number[] = [0],
  ): Promise<GitResult> {
    const result = await runFile(this.gitExecutable, args, cwd);
    if (!acceptedExitCodes.includes(result.exitCode)) {
      const detail = result.stderr.trim();
      throw new Error(detail === "" ? "Git command failed." : `Git command failed: ${detail}`);
    }
    return result;
  }

  private async gitBuffer(cwd: string, args: readonly string[]): Promise<Buffer> {
    return (await this.git(cwd, args)).stdout;
  }

  private async gitText(cwd: string, args: readonly string[]): Promise<string> {
    return (await this.gitBuffer(cwd, args)).toString("utf8").trim();
  }

  private async gitVoid(cwd: string | undefined, args: readonly string[]): Promise<void> {
    await this.git(cwd, args);
  }
}

async function snapshotTemplate(root: string, version: string): Promise<TemplateSnapshot> {
  const files = new Map<string, Buffer>();
  await collectTemplateFiles(root, "", files);
  const paths = [...files.keys()].sort(comparePaths);
  assertNoCaseOrShapeCollisions(paths);
  const hash = createHash("sha256");
  hash.update(`praxeum-course-engine\0${version}\0`, "utf8");
  for (const relativePath of paths) {
    const bytes = files.get(relativePath);
    if (bytes === undefined) throw new Error(`Template file disappeared: ${relativePath}`);
    hash.update(relativePath, "utf8");
    hash.update("\0", "utf8");
    hash.update(String(bytes.byteLength), "utf8");
    hash.update("\0", "utf8");
    hash.update(bytes);
  }
  return { files, fingerprint: `sha256:${hash.digest("hex")}` };
}

async function collectTemplateFiles(
  root: string,
  relativeDirectory: string,
  target: Map<string, Buffer>,
): Promise<void> {
  const directory = relativeDirectory === "" ? root : coursePath(root, relativeDirectory);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relativePath = toGitPath(path.join(relativeDirectory, entry.name));
    assertEnginePath(relativePath);
    if (entry.isSymbolicLink()) {
      throw new Error(`The Course Engine template contains a symbolic link: ${relativePath}`);
    }
    if (entry.isDirectory()) {
      await collectTemplateFiles(root, relativePath, target);
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(`The Course Engine template contains an unsupported entry: ${relativePath}`);
    }
    target.set(relativePath, await readFile(coursePath(root, relativePath)));
  }
}

type InspectedCourseFile = { kind: "missing" } | { kind: "file" } | { kind: "conflict" };

async function inspectCourseFile(root: string, relativePath: string): Promise<InspectedCourseFile> {
  const segments = relativePath.split("/");
  let current = root;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment === undefined) return { kind: "conflict" };
    current = path.join(current, segment);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) return { kind: "conflict" };
      const final = index === segments.length - 1;
      if (!final && !info.isDirectory()) return { kind: "conflict" };
      if (final) {
        return info.isFile() ? { kind: "file" } : { kind: "conflict" };
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { kind: "missing" };
      throw error;
    }
  }
  return { kind: "conflict" };
}

function assertEnginePath(relativePath: string): void {
  const normalized = toGitPath(relativePath);
  const folded = normalized.toLocaleLowerCase("en-US");
  if (
    normalized === "" ||
    normalized !== relativePath ||
    path.posix.isAbsolute(normalized) ||
    normalized
      .split("/")
      .some((segment) => segment === "" || segment === "." || segment === "..") ||
    [...normalized].some((character) => (character.codePointAt(0) ?? 0) <= 0x1f) ||
    RESERVED_EXACT_PATHS.has(folded) ||
    RESERVED_PATH_PREFIXES.some((prefix) => folded.startsWith(prefix))
  ) {
    throw new Error(`Unsafe Course Engine-owned path: ${relativePath}`);
  }
}

function assertNoCaseOrShapeCollisions(paths: readonly string[]): void {
  const folded = new Map<string, string>();
  for (const relativePath of paths) {
    const key = relativePath.toLocaleLowerCase("en-US");
    const previous = folded.get(key);
    if (previous !== undefined && previous !== relativePath) {
      throw new Error(`Case-colliding Course Engine paths: ${previous} and ${relativePath}`);
    }
    folded.set(key, relativePath);
  }
  const keys = new Set([...folded.keys()]);
  for (const relativePath of paths) {
    const segments = relativePath.toLocaleLowerCase("en-US").split("/");
    for (let index = 1; index < segments.length; index += 1) {
      const ancestor = segments.slice(0, index).join("/");
      if (keys.has(ancestor)) {
        throw new Error(`File/directory-colliding Course Engine path: ${relativePath}`);
      }
    }
  }
}

function coursePath(root: string, relativePath: string): string {
  assertEnginePath(relativePath);
  const resolved = path.resolve(root, ...relativePath.split("/"));
  const relative = path.relative(path.resolve(root), resolved);
  if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Course Engine path escapes its root: ${relativePath}`);
  }
  return resolved;
}

function toGitPath(value: string): string {
  return value.split(path.sep).join("/");
}

function comparePaths(left: string, right: string): number {
  return left.localeCompare(right, "en-US");
}

function splitNul(value: Buffer): string[] {
  const entries = value.toString("utf8").split("\0");
  if (/^\r?\n?$/u.test(entries.at(-1) ?? "")) entries.pop();
  return entries.filter((entry) => entry !== "");
}

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameChanges(
  left: readonly CourseEngineChange[],
  right: readonly CourseEngineChange[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (change, index) => change.path === right[index]?.path && change.kind === right[index]?.kind,
    )
  );
}

function matchesAcceptedPreview(
  current: CourseEngineUpdatePreview,
  accepted: CourseEngineUpdatePreview & { status: "ready" },
): current is CourseEngineUpdatePreview & { status: "ready" } {
  return (
    current.status === "ready" &&
    !current.courseDirty &&
    current.head === accepted.head &&
    current.branch === accepted.branch &&
    current.targetFingerprint === accepted.targetFingerprint &&
    sameChanges(current.changes, accepted.changes)
  );
}

function errorDetail(error: unknown, fallback: string): string {
  return error instanceof Error && error.message !== "" ? error.message : fallback;
}

function runFile(
  executable: string,
  args: readonly string[],
  cwd: string | undefined,
): Promise<GitResult> {
  return new Promise((resolve, reject) => {
    execFile(
      executable,
      [...args],
      {
        ...(cwd === undefined ? {} : { cwd }),
        windowsHide: true,
        encoding: "buffer",
        maxBuffer: MAX_GIT_OUTPUT_BYTES,
      },
      (error, stdout, stderr) => {
        const output = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
        const errorOutput = Buffer.isBuffer(stderr) ? stderr.toString("utf8") : stderr;
        if (error === null) {
          resolve({ exitCode: 0, stdout: output, stderr: errorOutput });
          return;
        }
        const code = typeof error.code === "number" ? error.code : null;
        if (code !== null) {
          resolve({ exitCode: code, stdout: output, stderr: errorOutput });
          return;
        }
        reject(new Error("Git could not be started.", { cause: error }));
      },
    );
  });
}
