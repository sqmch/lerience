import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { describeRegisteredCourse } from "../src/main/course-dashboard";
import type { CourseRegistryEntry } from "../src/main/course-registry";
import { validModuleManifest, validProgress, validQuizBank } from "./fixtures";

const roots: string[] = [];

function temporaryRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "praxeum-dashboard-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("describeRegisteredCourse", () => {
  it("derives progress and due facts from the folder without changing registry facts", () => {
    const root = temporaryRoot();
    fs.mkdirSync(path.join(root, "tutor"));
    fs.mkdirSync(path.join(root, "curriculum", validModuleManifest.id), { recursive: true });
    fs.writeFileSync(path.join(root, "CLAUDE.md"), "# Protocol\n");
    fs.writeFileSync(path.join(root, "tutor", "progress.json"), JSON.stringify(validProgress));
    fs.writeFileSync(path.join(root, "tutor", "quiz-bank.json"), JSON.stringify(validQuizBank));
    fs.writeFileSync(path.join(root, "tutor", "journal.md"), "# Journal\n");
    fs.writeFileSync(path.join(root, "COURSE.md"), "# COURSE.md — Typed REST APIs\n\nThe arc.\n");
    fs.writeFileSync(
      path.join(root, "curriculum", validModuleManifest.id, "module.json"),
      JSON.stringify(validModuleManifest),
    );
    const entry: CourseRegistryEntry = {
      courseId: "123e4567-e89b-42d3-a456-426614174000",
      rootPath: root,
      addedAt: "2026-08-01T00:00:00.000Z",
      lastOpenedAt: "2026-08-12T00:00:00.000Z",
    };

    expect(describeRegisteredCourse(entry)).toEqual({
      courseId: entry.courseId,
      rootPath: root,
      folderName: path.basename(root),
      lastOpenedAt: entry.lastOpenedAt,
      available: true,
      // The course's own name, not the temporary folder's.
      title: "Typed REST APIs",
      currentModuleId: validProgress.currentModule,
      completedModules: 0,
      totalModules: 1,
      dueCount: 1,
      onboarding: false,
    });
  });

  it("keeps a moved course visible without trying to discard its entry", () => {
    const root = path.join(temporaryRoot(), "moved-course");
    const entry: CourseRegistryEntry = {
      courseId: "123e4567-e89b-42d3-a456-426614174000",
      rootPath: root,
      addedAt: "2026-08-01T00:00:00.000Z",
      lastOpenedAt: "2026-08-12T00:00:00.000Z",
    };

    expect(describeRegisteredCourse(entry)).toEqual({
      courseId: entry.courseId,
      rootPath: root,
      folderName: "moved-course",
      lastOpenedAt: entry.lastOpenedAt,
      available: false,
    });
  });
});
