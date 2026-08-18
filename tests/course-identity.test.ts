import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  COURSE_MARKER_NAME,
  CourseIdentityError,
  UnsupportedCourseFormatError,
  courseDataDirectory,
  getOrCreateCourseIdentity,
  readCourseIdentity,
} from "../src/main/course-identity";

const COURSE_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const temporaryRoots: string[] = [];

async function temporaryCourse(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "praxeum-identity-test-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("course identity", () => {
  it("exclusively creates a write-once format-v0 marker", async () => {
    const courseRoot = await temporaryCourse();
    const markerPath = path.join(courseRoot, COURSE_MARKER_NAME);

    await expect(
      getOrCreateCourseIdentity(courseRoot, { createId: () => COURSE_ID }),
    ).resolves.toEqual({ courseId: COURSE_ID, formatVersion: 0 });
    const firstBytes = await readFile(markerPath, "utf8");

    await expect(
      getOrCreateCourseIdentity(courseRoot, { createId: () => OTHER_ID }),
    ).resolves.toEqual({ courseId: COURSE_ID, formatVersion: 0 });
    expect(await readFile(markerPath, "utf8")).toBe(firstBytes);
  });

  it("tolerates a UTF-8 BOM but otherwise parses the marker strictly", async () => {
    const courseRoot = await temporaryCourse();
    await writeFile(
      path.join(courseRoot, COURSE_MARKER_NAME),
      `\ufeff${JSON.stringify({ courseId: COURSE_ID.toUpperCase(), formatVersion: 0 })}`,
    );

    await expect(readCourseIdentity(courseRoot)).resolves.toEqual({
      courseId: COURSE_ID,
      formatVersion: 0,
    });
  });

  it.each([
    ["malformed JSON", "{broken", CourseIdentityError],
    [
      "extra fields",
      JSON.stringify({ courseId: COURSE_ID, formatVersion: 0, path: "elsewhere" }),
      CourseIdentityError,
    ],
    [
      "an invalid UUID",
      JSON.stringify({ courseId: "../../escape", formatVersion: 0 }),
      CourseIdentityError,
    ],
    [
      "an unsupported format",
      JSON.stringify({ courseId: COURSE_ID, formatVersion: 1 }),
      UnsupportedCourseFormatError,
    ],
  ])("fails closed on %s and never replaces it", async (_label, source, ErrorType) => {
    const courseRoot = await temporaryCourse();
    const markerPath = path.join(courseRoot, COURSE_MARKER_NAME);
    await writeFile(markerPath, source);

    await expect(
      getOrCreateCourseIdentity(courseRoot, { createId: () => OTHER_ID }),
    ).rejects.toBeInstanceOf(ErrorType);
    expect(await readFile(markerPath, "utf8")).toBe(source);
  });

  it("validates a course-controlled UUID before deriving an app-data path", () => {
    expect(courseDataDirectory("C:/app-data", COURSE_ID)).toBe(
      path.join("C:/app-data", "courses", COURSE_ID),
    );
    expect(() => courseDataDirectory("C:/app-data", "../outside")).toThrow(/UUID/);
  });

  it("converges on the exclusive-create winner when creators race", async () => {
    const courseRoot = await temporaryCourse();
    const identities = await Promise.all([
      getOrCreateCourseIdentity(courseRoot, { createId: () => COURSE_ID }),
      getOrCreateCourseIdentity(courseRoot, { createId: () => OTHER_ID }),
    ]);

    expect(identities[0]).toEqual(identities[1]);
    expect([COURSE_ID, OTHER_ID]).toContain(identities[0]?.courseId);
  });
});
