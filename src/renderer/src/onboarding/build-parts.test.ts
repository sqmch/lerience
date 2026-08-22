import { describe, expect, it } from "vitest";
import { groupWritten, isWriteNoise, moduleParts } from "./build-parts";

describe("isWriteNoise", () => {
  it("drops write plumbing and keeps course files", () => {
    expect(isWriteNoise("curriculum/00-x/quiz.md.tmp.22568.1cd3b28fdf5e")).toBe(true);
    expect(
      isWriteNoise("curriculum/00-x/scaffold/_tmp_16784_c7253531e0a568beb29c27dd637c7960"),
    ).toBe(true);
    expect(isWriteNoise("curriculum/00-x/scaffold/node_modules")).toBe(true);
    expect(isWriteNoise("curriculum/00-x/scaffold/node_modules/.bin/tsc")).toBe(true);
    expect(isWriteNoise("curriculum/00-x/scaffold/package.json")).toBe(false);
    expect(isWriteNoise("curriculum/00-x/scaffold/pnpm-lock.yaml")).toBe(false);
    expect(isWriteNoise("COURSE.md")).toBe(false);
  });
});

describe("moduleParts", () => {
  it("reports nothing until a module directory exists", () => {
    expect(moduleParts(["COURSE.md", "tutor/journal.md"], null)).toBeNull();
  });

  it("marks a part landed when a file under it has appeared", () => {
    const parts = moduleParts(
      [
        "COURSE.md",
        "curriculum/00-one-reading/module.json",
        "curriculum/00-one-reading/LESSON.md",
        "curriculum/00-one-reading/scaffold/package.json",
        "curriculum/00-one-reading/scaffold",
      ],
      null,
    );
    expect(parts?.moduleId).toBe("00-one-reading");
    expect([...(parts?.landed ?? [])]).toEqual(["manifest", "lesson", "scaffold"]);
    expect(parts?.now).toBeNull();
  });

  it("names the part the live activity targets, whichever way the provider writes the path", () => {
    const written = ["curriculum/00-one-reading/module.json"];
    expect(
      moduleParts(written, "C:\\Courses\\x\\curriculum\\00-one-reading\\checks\\reading.test.ts")
        ?.now,
    ).toBe("checks");
    expect(moduleParts(written, "curriculum/00-one-reading/LESSON.md")?.now).toBe("lesson");
    expect(moduleParts(written, "Install the scaffold's dependencies")?.now).toBeNull();
  });
});

describe("groupWritten", () => {
  it("groups by directory, strips the prefix, and drops a directory once a file inside it lands", () => {
    expect(
      groupWritten([
        "COURSE.md",
        "tutor/progress.json",
        "curriculum/00-one-reading/scaffold",
        "curriculum/00-one-reading/scaffold/package.json",
        "curriculum/00-one-reading/LESSON.md",
        "tutor/journal.md",
      ]),
    ).toEqual([
      { head: "", files: ["COURSE.md"] },
      { head: "tutor/", files: ["progress.json", "journal.md"] },
      { head: "curriculum/00-one-reading/", files: ["scaffold/package.json", "LESSON.md"] },
    ]);
  });
});
