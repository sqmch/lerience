import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CourseRegistryCollisionError, FileCourseRegistry } from "../src/main/course-registry";

const roots: string[] = [];

function temporaryRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "praxeum-registry-"));
  roots.push(root);
  return root;
}

function writeMarker(root: string, courseId: string): void {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(
    path.join(root, ".praxeum.json"),
    `${JSON.stringify({ courseId, formatVersion: 0 })}\n`,
  );
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("FileCourseRegistry", () => {
  it("registers a marker-backed course and updates its last-opened time", async () => {
    const userData = temporaryRoot();
    const course = temporaryRoot();
    const id = "123e4567-e89b-42d3-a456-426614174000";
    writeMarker(course, id);
    const dates = [new Date("2026-08-12T01:00:00Z"), new Date("2026-08-12T02:00:00Z")];
    const registry = new FileCourseRegistry(userData, () => dates.shift() ?? new Date(0));

    await registry.register(course);
    await registry.register(course);

    expect(registry.list()).toEqual([
      {
        courseId: id,
        rootPath: path.resolve(course),
        addedAt: "2026-08-12T01:00:00.000Z",
        lastOpenedAt: "2026-08-12T02:00:00.000Z",
      },
    ]);
  });

  it("relocates a MOVED course opened via the picker instead of misreporting a copy", async () => {
    const userData = temporaryRoot();
    const original = temporaryRoot();
    const movedTo = temporaryRoot();
    const id = "123e4567-e89b-42d3-a456-426614174000";
    writeMarker(original, id);
    const registry = new FileCourseRegistry(userData);
    await registry.register(original);

    // The learner moves the folder (old path gone), then reopens it normally.
    fs.rmSync(path.join(original, ".praxeum.json"));
    fs.rmSync(original, { recursive: true, force: true });
    writeMarker(movedTo, id);

    const entry = await registry.register(movedTo);
    expect(entry.rootPath).toBe(path.resolve(movedTo));
    expect(registry.list()).toHaveLength(1);
  });

  it("adopts only marker-backed courses and never writes into the folder", async () => {
    const userData = temporaryRoot();
    const markerless = temporaryRoot();
    const registry = new FileCourseRegistry(userData);

    await expect(registry.adopt(markerless)).resolves.toBeNull();
    // Adoption is a listing-path affordance: it must not have minted identity.
    expect(fs.existsSync(path.join(markerless, ".praxeum.json"))).toBe(false);
    expect(registry.list()).toHaveLength(0);

    const marked = temporaryRoot();
    const id = "223e4567-e89b-42d3-a456-426614174000";
    writeMarker(marked, id);
    await expect(registry.adopt(marked)).resolves.toMatchObject({ courseId: id });
    expect(registry.list()).toHaveLength(1);
  });

  it("fails closed when a second local folder carries the same identity", async () => {
    const userData = temporaryRoot();
    const first = temporaryRoot();
    const copy = temporaryRoot();
    const id = "123e4567-e89b-42d3-a456-426614174000";
    writeMarker(first, id);
    writeMarker(copy, id);
    const registry = new FileCourseRegistry(userData);
    await registry.register(first);

    await expect(registry.register(copy)).rejects.toBeInstanceOf(CourseRegistryCollisionError);
    expect(registry.list()).toHaveLength(1);
  });

  it("relocates only to a folder with the same marker and forgets without deleting it", async () => {
    const userData = temporaryRoot();
    const original = temporaryRoot();
    const moved = temporaryRoot();
    const wrong = temporaryRoot();
    const id = "123e4567-e89b-42d3-a456-426614174000";
    writeMarker(original, id);
    writeMarker(moved, id);
    writeMarker(wrong, "223e4567-e89b-42d3-a456-426614174000");
    const registry = new FileCourseRegistry(userData);
    await registry.register(original);

    await expect(registry.relocate(id, wrong)).rejects.toThrow("not the same course");
    await expect(registry.relocate(id, moved)).resolves.toMatchObject({
      courseId: id,
      rootPath: path.resolve(moved),
    });

    registry.forget(id);
    expect(registry.list()).toEqual([]);
    expect(fs.existsSync(path.join(moved, ".praxeum.json"))).toBe(true);
  });

  it("rejects registry corruption instead of silently discarding known courses", () => {
    const userData = temporaryRoot();
    fs.writeFileSync(path.join(userData, "course-registry.json"), "{ not json");
    const registry = new FileCourseRegistry(userData);

    expect(() => registry.list()).toThrow("registry is unreadable");
  });
});
