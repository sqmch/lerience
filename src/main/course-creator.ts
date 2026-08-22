/* Materializes the app-owned course template without teaching the renderer
   about Git or the engine's distribution shape. */

import { execFile } from "node:child_process";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  realpath,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";
import {
  COURSE_MARKER_NAME,
  getOrCreateCourseIdentity,
  type CourseIdentity,
} from "./course-identity";
import { slugifyCourseName } from "../shared/course-name";

const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;
const UNSAFE_CHARACTER = /[<>:"/\\|?*]/u;
const MAX_COMPONENT_UNITS = 255;
const MAX_COMPONENT_BYTES = 255;

export type CourseNameValidation = { ok: true; name: string } | { ok: false; reason: string };

/** Validate against the portable subset of Windows/macOS/Linux leaf names so
 *  a course folder can move between supported machines without being renamed. */
export function validateCourseName(name: string): CourseNameValidation {
  if (name.length === 0) return { ok: false, reason: "Give the course a folder name." };
  if (name !== name.trim()) {
    return { ok: false, reason: "A course folder name cannot start or end with whitespace." };
  }
  if (name === "." || name === ".." || name.startsWith("-")) {
    return { ok: false, reason: "Use a plain folder name, not a path or command flag." };
  }
  if (UNSAFE_CHARACTER.test(name) || containsControlCharacter(name)) {
    return { ok: false, reason: "That name contains a character folders cannot use." };
  }
  if (/[. ]$/u.test(name)) {
    return { ok: false, reason: "A course folder name cannot end with a dot or space." };
  }
  if (WINDOWS_RESERVED_NAME.test(name)) {
    return { ok: false, reason: "That name is reserved by the operating system." };
  }
  if (name.length > MAX_COMPONENT_UNITS || Buffer.byteLength(name, "utf8") > MAX_COMPONENT_BYTES) {
    return { ok: false, reason: "That folder name is too long." };
  }
  return { ok: true, name };
}

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => (character.codePointAt(0) ?? 0) <= 0x1f);
}

export interface GitRunOptions {
  cwd?: string;
}

/** The real M4/M5 seam: development supplies host Git; packaging supplies the
 *  bundled executable. CourseCreator knows only argv and never invokes a shell. */
export interface GitRunner {
  run(args: readonly string[], options?: GitRunOptions): Promise<void>;
}

export class HostGitRunner implements GitRunner {
  constructor(private readonly executable = "git") {}

  run(args: readonly string[], options: GitRunOptions = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      execFile(
        this.executable,
        [...args],
        {
          cwd: options.cwd,
          windowsHide: true,
          encoding: "utf8",
          maxBuffer: 10 * 1024 * 1024,
        },
        (error, _stdout, stderr) => {
          if (error === null) {
            resolve();
            return;
          }
          const detail = stderr.trim();
          reject(
            new Error(detail === "" ? "Git command failed." : `Git command failed: ${detail}`, {
              cause: error,
            }),
          );
        },
      );
    });
  }
}

export class InvalidCourseNameError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "InvalidCourseNameError";
  }
}

export class CourseTargetExistsError extends Error {
  constructor(readonly targetPath: string) {
    super(`A file or folder already exists at ${targetPath}`);
    this.name = "CourseTargetExistsError";
  }
}

export interface CourseCreatorOptions {
  /** App-owned course template. Never inferred from the learner's environment. */
  courseTemplateRoot: string;
  git: GitRunner;
  createCourseId?: () => string;
  markerCommitAuthor?: { name: string; email: string };
}

export interface CreateCourseRequest {
  parentDirectory: string;
  name: string;
}

export interface CreatedCourse {
  rootPath: string;
  identity: CourseIdentity;
}

const TEMPORARY_PREFIX = ".praxeum-create-";
const ENGINE_COMMIT_MESSAGE = "Initialize Praxeum Course Engine";
const MARKER_COMMIT_MESSAGE = "Initialize Praxeum course identity";
const DEFAULT_MARKER_AUTHOR = {
  name: "Lerience",
  email: "noreply@lerience.local",
} as const;

/** Mechanical course creation only. Registration, opening, onboarding, npm,
 *  and provider work deliberately live outside this module. */
export class CourseCreator {
  private readonly courseTemplateRoot: string;
  private readonly git: GitRunner;
  private readonly createCourseId: (() => string) | undefined;
  private readonly markerCommitAuthor: { name: string; email: string };

  constructor(options: CourseCreatorOptions) {
    this.courseTemplateRoot = options.courseTemplateRoot;
    this.git = options.git;
    this.createCourseId = options.createCourseId;
    this.markerCommitAuthor = options.markerCommitAuthor ?? DEFAULT_MARKER_AUTHOR;
  }

  async create(request: CreateCourseRequest): Promise<CreatedCourse> {
    // The learner's rough words become a folder name — lowercase, dash-joined,
    // a sentence trimmed to a few words. The portability guard then runs on the
    // slug, so a reserved or over-long result is still refused, not written.
    const folderName = slugifyCourseName(request.name);
    if (folderName === "") {
      throw new InvalidCourseNameError(
        "Use some letters or numbers in the name — that becomes the folder.",
      );
    }
    const validation = validateCourseName(folderName);
    if (!validation.ok) throw new InvalidCourseNameError(validation.reason);

    const parentDirectory = path.resolve(request.parentDirectory);
    const templateRoot = path.resolve(this.courseTemplateRoot);
    const parentInfo = await stat(parentDirectory);
    if (!parentInfo.isDirectory()) throw new TypeError("The course parent must be a directory.");

    const targetPath = path.resolve(parentDirectory, validation.name);
    if (
      path.dirname(targetPath) !== parentDirectory ||
      path.basename(targetPath) !== validation.name
    ) {
      throw new InvalidCourseNameError("The course must be a direct child of its parent folder.");
    }
    if (await pathExists(targetPath)) throw new CourseTargetExistsError(targetPath);

    // A course may never be created inside the app-owned template itself,
    // including through a differently-cased path or filesystem alias.
    const [canonicalParent, canonicalTemplate] = await Promise.all([
      realpath(parentDirectory),
      realpath(templateRoot),
    ]);
    if (isSameOrDescendant(canonicalTemplate, canonicalParent)) {
      throw new InvalidCourseNameError(
        "Courses cannot be created inside the app's course template.",
      );
    }

    // mkdtemp creates the sibling exclusively, establishing that cleanup owns
    // exactly this path even when materialization fails halfway through.
    let temporaryPath: string | null = await mkdtemp(path.join(parentDirectory, TEMPORARY_PREFIX));
    try {
      if (isSameOrDescendant(canonicalTemplate, await realpath(temporaryPath))) {
        throw new InvalidCourseNameError(
          "Courses cannot be created inside the app's course template.",
        );
      }
      await copyTemplateTree(templateRoot, temporaryPath);
      await this.git.run(["init", "--initial-branch=main"], { cwd: temporaryPath });
      await this.git.run(["add", "--all"], { cwd: temporaryPath });
      await this.git.run(
        [
          "-c",
          `user.name=${this.markerCommitAuthor.name}`,
          "-c",
          `user.email=${this.markerCommitAuthor.email}`,
          "-c",
          "commit.gpgSign=false",
          "commit",
          "--no-verify",
          "-m",
          ENGINE_COMMIT_MESSAGE,
        ],
        { cwd: temporaryPath },
      );
      // New courses intentionally have no upstream. Their Git repository is a
      // learner-owned history, not a transport back into the app template.
      const identity = await getOrCreateCourseIdentity(temporaryPath, {
        ...(this.createCourseId === undefined ? {} : { createId: this.createCourseId }),
      });

      await this.git.run(["add", "--", COURSE_MARKER_NAME], { cwd: temporaryPath });
      await this.git.run(
        [
          "-c",
          `user.name=${this.markerCommitAuthor.name}`,
          "-c",
          `user.email=${this.markerCommitAuthor.email}`,
          "-c",
          "commit.gpgSign=false",
          "commit",
          "--no-verify",
          "-m",
          MARKER_COMMIT_MESSAGE,
          "--",
          COURSE_MARKER_NAME,
        ],
        { cwd: temporaryPath },
      );

      // Refuse again immediately before the one publishing operation. rename
      // keeps observers from ever seeing a half-cloned final course.
      if (await pathExists(targetPath)) throw new CourseTargetExistsError(targetPath);
      await rename(temporaryPath, targetPath);
      temporaryPath = null;
      return { rootPath: targetPath, identity };
    } finally {
      if (temporaryPath !== null) {
        try {
          await rm(temporaryPath, { recursive: true, force: true });
        } catch {
          // A locked temp file (AV scanning a fresh clone is realistic on
          // Windows) must not mask the error that aborted the create; the
          // owned `.praxeum-create-*` leftover is inert and identifiable.
        }
      }
    }
  }
}

/** Copy only ordinary files and directories. Refusing links keeps a course
 * independent of paths outside the installer-owned template. */
async function copyTemplateTree(source: string, destination: string): Promise<void> {
  const sourceInfo = await stat(source);
  if (!sourceInfo.isDirectory()) throw new TypeError("The course template must be a directory.");

  for (const entry of await readdir(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`The course template contains an unsupported symbolic link: ${entry.name}`);
    }
    if (entry.isDirectory()) {
      await mkdir(destinationPath);
      await copyTemplateTree(sourcePath, destinationPath);
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(`The course template contains an unsupported entry: ${entry.name}`);
    }
    await copyFile(sourcePath, destinationPath);
  }
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await lstat(candidate);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function isSameOrDescendant(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
