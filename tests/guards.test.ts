import path from "node:path";
import { describe, expect, it } from "vitest";
import { guardCourseDoc, guardVisualFile } from "../src/main/guards";
import { visualSrc } from "../src/shared/visuals";

const ROOT = path.resolve("C:/course");

describe("guardCourseDoc", () => {
  it("allows markdown and json inside the course", () => {
    expect(guardCourseDoc(ROOT, "curriculum/00-a/LESSON.md").ok).toBe(true);
    expect(guardCourseDoc(ROOT, "tutor/progress.json").ok).toBe(true);
  });

  it("refuses traversal out of the course", () => {
    expect(guardCourseDoc(ROOT, "../elsewhere/secrets.md").ok).toBe(false);
    expect(guardCourseDoc(ROOT, "..\\elsewhere\\secrets.md").ok).toBe(false);
    expect(guardCourseDoc(ROOT, "C:/other/file.md").ok).toBe(false);
  });

  it("refuses non-document extensions", () => {
    expect(guardCourseDoc(ROOT, "scripts/quiz.mjs").ok).toBe(false);
    expect(guardCourseDoc(ROOT, ".env").ok).toBe(false);
    expect(guardCourseDoc(ROOT, "curriculum/00-a/visuals/x.html").ok).toBe(false);
  });
});

describe("guardVisualFile", () => {
  it("allows html inside the module's visuals directory", () => {
    const { abs, ok } = guardVisualFile(ROOT, "02-vector-store", "loop.html");
    expect(ok).toBe(true);
    expect(abs).toBe(path.join(ROOT, "curriculum", "02-vector-store", "visuals", "loop.html"));
  });

  it("refuses traversal, non-html, and malformed module ids", () => {
    expect(guardVisualFile(ROOT, "02-vector-store", "../LESSON.md").ok).toBe(false);
    expect(guardVisualFile(ROOT, "02-vector-store", "..\\..\\tutor\\progress.json").ok).toBe(false);
    expect(guardVisualFile(ROOT, "02-vector-store", "notes.md").ok).toBe(false);
    expect(guardVisualFile(ROOT, "../evil", "x.html").ok).toBe(false);
    expect(guardVisualFile(ROOT, "UPPER-case", "x.html").ok).toBe(false);
  });
});

describe("visualSrc", () => {
  it("builds the scheme url and tolerates a visuals/ prefix (engine rule)", () => {
    expect(visualSrc("01-embeddings", "loop.html")).toBe(
      "praxeum-visual://01-embeddings/loop.html",
    );
    expect(visualSrc("01-embeddings", "visuals/loop.html")).toBe(
      "praxeum-visual://01-embeddings/loop.html",
    );
  });
});
