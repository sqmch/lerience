/* App-owned index of known course locations. It stores only identity + path
   facts; titles, due counts, progress, and onboarding state are always derived
   fresh from the course files (SPEC state model, ADR-010). */

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getOrCreateCourseIdentity, readCourseIdentity } from "./course-identity";

const REGISTRY_VERSION = 1 as const;

export interface CourseRegistryEntry {
  courseId: string;
  rootPath: string;
  addedAt: string;
  lastOpenedAt: string;
}

interface RegistryFile {
  version: typeof REGISTRY_VERSION;
  courses: CourseRegistryEntry[];
}

export class CourseRegistryError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CourseRegistryError";
  }
}

export class CourseRegistryCollisionError extends CourseRegistryError {
  constructor(
    readonly courseId: string,
    readonly registeredPath: string,
    readonly conflictingPath: string,
  ) {
    super("Two course folders on this computer have the same course identity.");
    this.name = "CourseRegistryCollisionError";
  }
}

export class FileCourseRegistry {
  private readonly filePath: string;

  constructor(
    userDataPath: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.filePath = path.join(userDataPath, "course-registry.json");
  }

  list(): CourseRegistryEntry[] {
    return this.read().courses.sort((left, right) =>
      right.lastOpenedAt.localeCompare(left.lastOpenedAt),
    );
  }

  async register(rootPath: string): Promise<CourseRegistryEntry> {
    const root = path.resolve(rootPath);
    const identity = await getOrCreateCourseIdentity(root);
    return await this.registerIdentity(identity.courseId, root);
  }

  /** Registry adoption for migration paths: registers only a course that
   *  ALREADY carries a marker. A listing/projection flow must never write
   *  into a course folder (marker creation belongs to a real open). */
  async adopt(rootPath: string): Promise<CourseRegistryEntry | null> {
    const root = path.resolve(rootPath);
    const identity = await readCourseIdentity(root);
    if (identity === null) return null;
    return await this.registerIdentity(identity.courseId, root);
  }

  private async registerIdentity(courseId: string, root: string): Promise<CourseRegistryEntry> {
    const registry = this.read();
    const existing = registry.courses.find((entry) => entry.courseId === courseId);
    const timestamp = this.now().toISOString();

    if (existing !== undefined) {
      if (!samePath(existing.rootPath, root)) {
        // A true copy (both folders alive with one identity) fails closed.
        // A MOVED course — the registered path gone, or no longer carrying
        // this identity — is a relocation, not a collision; the learner who
        // moves a folder and reopens it via the picker did nothing wrong.
        if (await pathStillOwnsIdentity(existing.rootPath, courseId)) {
          throw new CourseRegistryCollisionError(courseId, existing.rootPath, root);
        }
      }
      existing.lastOpenedAt = timestamp;
      existing.rootPath = root;
      this.write(registry);
      return { ...existing };
    }

    const entry: CourseRegistryEntry = {
      courseId,
      rootPath: root,
      addedAt: timestamp,
      lastOpenedAt: timestamp,
    };
    registry.courses.push(entry);
    this.write(registry);
    return { ...entry };
  }

  async relocate(courseId: string, rootPath: string): Promise<CourseRegistryEntry> {
    const root = path.resolve(rootPath);
    const identity = await readCourseIdentity(root);
    if (identity === null || identity.courseId !== courseId) {
      throw new CourseRegistryError("That folder is not the same course.");
    }

    const registry = this.read();
    const existing = registry.courses.find((entry) => entry.courseId === courseId);
    if (existing === undefined) throw new CourseRegistryError("That course is not registered.");
    existing.rootPath = root;
    existing.lastOpenedAt = this.now().toISOString();
    this.write(registry);
    return { ...existing };
  }

  touch(courseId: string): void {
    const registry = this.read();
    const existing = registry.courses.find((entry) => entry.courseId === courseId);
    if (existing === undefined) return;
    existing.lastOpenedAt = this.now().toISOString();
    this.write(registry);
  }

  forget(courseId: string): void {
    const registry = this.read();
    const courses = registry.courses.filter((entry) => entry.courseId !== courseId);
    if (courses.length === registry.courses.length) return;
    this.write({ ...registry, courses });
  }

  private read(): RegistryFile {
    let source: string;
    try {
      source = fs.readFileSync(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { version: REGISTRY_VERSION, courses: [] };
      }
      throw error;
    }

    try {
      return parseRegistry(JSON.parse(source.replace(/^\uFEFF/, "")) as unknown);
    } catch (cause) {
      throw new CourseRegistryError("The course registry is unreadable.", { cause });
    }
  }

  private write(registry: RegistryFile): void {
    const directory = path.dirname(this.filePath);
    fs.mkdirSync(directory, { recursive: true });
    const temporary = path.join(directory, `.course-registry-${randomUUID()}.tmp`);
    try {
      fs.writeFileSync(temporary, `${JSON.stringify(registry, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
      fs.renameSync(temporary, this.filePath);
    } catch (error) {
      try {
        fs.unlinkSync(temporary);
      } catch {
        // The registry write already failed. A stale private temp file is less
        // important than preserving the original error for diagnosis.
      }
      throw error;
    }
  }
}

function parseRegistry(value: unknown): RegistryFile {
  if (!isRecord(value) || value.version !== REGISTRY_VERSION || !Array.isArray(value.courses)) {
    throw new TypeError("Unsupported registry shape");
  }
  const courses = value.courses.map((entry) => {
    if (
      !isRecord(entry) ||
      typeof entry.courseId !== "string" ||
      typeof entry.rootPath !== "string" ||
      typeof entry.addedAt !== "string" ||
      typeof entry.lastOpenedAt !== "string"
    ) {
      throw new TypeError("Invalid registry entry");
    }
    return {
      courseId: entry.courseId,
      rootPath: path.resolve(entry.rootPath),
      addedAt: entry.addedAt,
      lastOpenedAt: entry.lastOpenedAt,
    };
  });
  if (new Set(courses.map((entry) => entry.courseId)).size !== courses.length) {
    throw new TypeError("Duplicate course IDs in registry");
  }
  return { version: REGISTRY_VERSION, courses };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function pathStillOwnsIdentity(rootPath: string, courseId: string): Promise<boolean> {
  if (!fs.existsSync(rootPath)) return false;
  try {
    const identity = await readCourseIdentity(rootPath);
    return identity !== null && identity.courseId === courseId;
  } catch {
    // An unreadable marker at the old path: fail closed as a real collision
    // rather than silently forgetting a folder that may still be this course.
    return true;
  }
}

function samePath(left: string, right: string): boolean {
  const normalize = (value: string): string => {
    const resolved = path.resolve(value);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  };
  return normalize(left) === normalize(right);
}
