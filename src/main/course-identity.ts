/* The only app-owned file placed in a course folder. The marker is a
   write-once identity, not a settings file: an existing value is either
   accepted exactly or rejected without repair (ADR-002, ADR-010). */

import { randomUUID } from "node:crypto";
import { open, readFile } from "node:fs/promises";
import path from "node:path";

export const COURSE_MARKER_NAME = ".praxeum.json";
export const COURSE_FORMAT_VERSION = 0 as const;

export interface CourseIdentity {
  courseId: string;
  formatVersion: typeof COURSE_FORMAT_VERSION;
}

export class CourseIdentityError extends Error {
  constructor(
    message: string,
    readonly markerPath: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CourseIdentityError";
  }
}

export class UnsupportedCourseFormatError extends CourseIdentityError {
  constructor(
    markerPath: string,
    readonly formatVersion: unknown,
  ) {
    super(`Course marker format version ${String(formatVersion)} is not supported`, markerPath);
    this.name = "UnsupportedCourseFormatError";
  }
}

export interface CreateCourseIdentityOptions {
  /** Injectable so tests and future import flows do not depend on global randomness. */
  createId?: () => string;
}

/** Returns null only when the marker does not exist. Existing malformed or
 *  unsupported markers fail closed and are never rewritten. */
export async function readCourseIdentity(courseRoot: string): Promise<CourseIdentity | null> {
  const markerPath = path.join(courseRoot, COURSE_MARKER_NAME);
  let source: string;
  try {
    source = await readFile(markerPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }

  return parseCourseIdentity(source, markerPath);
}

/** Creates the marker with exclusive-create semantics. A racing creator may
 *  win; in that case its marker is read and returned. No existing byte is
 *  overwritten, including when the existing marker is malformed. */
export async function getOrCreateCourseIdentity(
  courseRoot: string,
  options: CreateCourseIdentityOptions = {},
): Promise<CourseIdentity> {
  const existing = await readCourseIdentity(courseRoot);
  if (existing !== null) return existing;

  const markerPath = path.join(courseRoot, COURSE_MARKER_NAME);
  const identity: CourseIdentity = {
    courseId: options.createId?.() ?? randomUUID(),
    formatVersion: COURSE_FORMAT_VERSION,
  };
  assertUuid(identity.courseId, "course ID");

  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(markerPath, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(identity, null, 2)}\n`, "utf8");
    await handle.sync();
    return identity;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  } finally {
    await handle?.close();
  }

  const winner = await readCourseIdentity(courseRoot);
  if (winner === null) {
    throw new CourseIdentityError("Course marker disappeared during creation", markerPath);
  }
  return winner;
}

/** App-data paths are never derived from an unchecked course-controlled value. */
export function courseDataDirectory(userDataPath: string, courseId: string): string {
  assertUuid(courseId, "course ID");
  return path.join(userDataPath, "courses", courseId.toLowerCase());
}

export function assertUuid(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
  ) {
    throw new TypeError(`The ${label} must be a UUID`);
  }
}

function parseCourseIdentity(source: string, markerPath: string): CourseIdentity {
  let value: unknown;
  try {
    value = JSON.parse(stripBom(source)) as unknown;
  } catch (cause) {
    throw new CourseIdentityError("Course marker is not valid JSON", markerPath, { cause });
  }

  if (!isRecord(value)) {
    throw new CourseIdentityError("Course marker must be an object", markerPath);
  }
  requireExactKeys(value, ["courseId", "formatVersion"], markerPath);
  if (value.formatVersion !== COURSE_FORMAT_VERSION) {
    throw new UnsupportedCourseFormatError(markerPath, value.formatVersion);
  }

  try {
    assertUuid(value.courseId, "course ID");
  } catch (cause) {
    throw new CourseIdentityError("Course marker has an invalid course ID", markerPath, { cause });
  }

  return { courseId: value.courseId.toLowerCase(), formatVersion: COURSE_FORMAT_VERSION };
}

function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  markerPath: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new CourseIdentityError(
      "Course marker contains missing or unsupported fields",
      markerPath,
    );
  }
}
