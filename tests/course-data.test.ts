import { describe, expect, it } from "vitest";
import {
  assembleCourseData,
  courseTitle,
  daysOverdue,
  dueItems,
  labFocus,
  moduleDirectories,
  parseJournal,
  stockLabConfig,
  type CourseFileMap,
} from "../src/shared/course-data";

function manifest(id: string, overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id,
    title: `Module ${id}`,
    phase: Number(id.slice(0, 2)),
    phaseName: `Phase ${id.slice(0, 2)}`,
    prerequisites: [],
    runtime: "node",
    estimatedHours: 2,
    provenance: "core",
    volatileLayer: "present",
    ...overrides,
  });
}

function courseFixture(): CourseFileMap {
  const contents: Record<string, string> = {
    "COURSE.md": "# COURSE.md — fixture\n\nThe arc.",
    "tutor/progress.json": JSON.stringify({
      learner: { profile: "dev", paceHoursPerWeek: "3-5", started: "2026-06-10" },
      currentModule: "01-second",
      modules: {
        "00-first": {
          status: "completed",
          startedAt: "2026-06-10",
          completedAt: "2026-06-11",
          hintsUsed: ["hint-1"],
          checkAttempts: 3,
          notes: "Solid.",
        },
        "01-second": { status: "in-progress", startedAt: "2026-06-12" },
      },
    }),
    "tutor/quiz-bank.json": JSON.stringify({
      items: [
        {
          id: "00-alpha",
          module: "00-first",
          question: "Why?",
          interval: 2,
          due: "2026-06-15",
          history: [
            { date: "2026-06-11", result: "correct", note: "clean" },
            { date: "2026-06-12", result: "rescheduled", note: "legacy bookkeeping" },
          ],
        },
      ],
    }),
    "tutor/journal.md":
      "# Tutor journal\n\npreamble text\n\n---\n\n## 2026-06-10 — Session 1\n\n- opened\n\n---\n\n## 2026-06-15/16 — Session 2 (range)\n\n- resumed\n",
    "curriculum/00-first/module.json": manifest("00-first"),
    "curriculum/00-first/scaffold/package.json": JSON.stringify({
      scripts: { check: "vitest run --dir ../checks" },
    }),
    "curriculum/01-second/module.json": manifest("01-second", { bossCheck: true, runtime: "" }),
    "curriculum/01-second/lab.json": JSON.stringify({
      provenance: "tutor-generated",
      focus: "Feel the vectors.",
      focusLab: "vectors",
      vectors: { axisX: "x", axisY: "y" },
      visuals: [
        { file: "visuals/loop.html", title: "The loop", blurb: "Watch it go." },
        { file: 17, title: "malformed entry must not brick the lab" },
      ],
    }),
    "curriculum/02-broken/module.json": `{"id": "not-matching-the-directory"}`,
  };
  const files = [
    ...Object.keys(contents),
    "curriculum/00-first/LESSON.md",
    "curriculum/00-first/BRIEF.md",
    "curriculum/00-first/checks/first.test.ts",
    "curriculum/01-second/LESSON.md",
    "curriculum/01-second/visuals/loop.html",
  ];
  return { files, contents };
}

describe("assembleCourseData", () => {
  const data = assembleCourseData(courseFixture());

  it("builds the module list in curriculum order with progress merged", () => {
    expect(data.modules.map((entry) => entry.id)).toEqual(["00-first", "01-second"]);
    expect(data.modules[0]).toMatchObject({
      status: "completed",
      checkAttempts: 3,
      hintsUsed: ["hint-1"],
      note: "Solid.",
    });
    expect(data.currentModuleId).toBe("01-second");
  });

  it("derives presence facts per module (ADR-013), never a course mode", () => {
    const [first, second] = data.modules;
    expect(first).toMatchObject({ hasChecks: true, hasScaffold: true, hasVisual: false });
    expect(second).toMatchObject({ hasChecks: false, hasScaffold: false, hasVisual: true });
    expect(first?.lessonPath).toBe("curriculum/00-first/LESSON.md");
    expect(first?.briefPath).toBe("curriculum/00-first/BRIEF.md");
    expect(second?.briefPath).toBeNull();
  });

  it("costs a malformed manifest its row, not the rail", () => {
    expect(data.unreadableModuleIds).toEqual(["02-broken"]);
    expect(data.modules).toHaveLength(2);
  });

  it("drops legacy rescheduled history entries at the boundary", () => {
    expect(data.quiz[0]?.history).toEqual([
      { date: "2026-06-11", result: "correct", note: "clean" },
    ]);
  });

  it("builds lab entries from stock claims and visuals, skipping malformed ones", () => {
    expect(data.labs.map((entry) => entry.key)).toEqual(["vectors", "01-second/loop.html"]);
    const visual = data.labs[1];
    expect(visual?.visual).toEqual({ moduleId: "01-second", file: "loop.html" });
    expect(visual?.title).toBe("The loop");
  });

  it("hands a claiming module's whole lab.json to its stock lab, and null to others", () => {
    const config = stockLabConfig(data.labClaims, "vectors", "01-second");
    expect(config).toMatchObject({ focus: "Feel the vectors.", vectors: { axisX: "x" } });
    expect(stockLabConfig(data.labClaims, "vectors", "00-first")).toBeNull();
    expect(stockLabConfig(data.labClaims, "chunking", "01-second")).toBeNull();
    expect(labFocus(data.labClaims, "01-second")).toEqual({
      focus: "Feel the vectors.",
      focusLab: "vectors",
    });
  });

  it("parses the journal newest-first, dropping the preamble, keeping range dates", () => {
    expect(data.journal.map((entry) => entry.date)).toEqual(["2026-06-15/16", "2026-06-10"]);
    expect(data.journal[0]?.title).toBe("Session 2 (range)");
    expect(data.journal[1]?.body).toBe("- opened");
  });

  it("tolerates a UTF-8 BOM on JSON files (Windows editors write them)", () => {
    const BOM = "\uFEFF";
    const fixture = courseFixture();
    const bommed = {
      files: fixture.files,
      contents: Object.fromEntries(
        Object.entries(fixture.contents).map(([key, value]) => [key, BOM + value]),
      ),
    };
    const bommedData = assembleCourseData(bommed);
    expect(bommedData.modules).toHaveLength(2);
    expect(bommedData.currentModuleId).toBe("01-second");
  });

  it("renders a brand-new course as empty rather than failing", () => {
    const empty = assembleCourseData({ files: ["CLAUDE.md"], contents: {} });
    expect(empty.modules).toEqual([]);
    expect(empty.quiz).toEqual([]);
    expect(empty.journal).toEqual([]);
    expect(empty.labs).toEqual([]);
    expect(empty.courseDoc).toBeNull();
    expect(empty.title).toBeNull();
    expect(empty.currentModuleId).toBeNull();
  });

  it("takes the course's name from COURSE.md once onboarding has written it", () => {
    const named = assembleCourseData({
      files: ["CLAUDE.md", "COURSE.md"],
      contents: { "COURSE.md": "# COURSE.md — Typed REST APIs\n\n## Phase 0\n" },
    });
    expect(named.title).toBe("Typed REST APIs");
  });
});

describe("helpers", () => {
  it("moduleDirectories reads only manifest-bearing directories", () => {
    expect(
      moduleDirectories([
        "curriculum/01-b/module.json",
        "curriculum/00-a/module.json",
        "curriculum/stray/notes.md",
        "tutor/progress.json",
      ]),
    ).toEqual(["00-a", "01-b"]);
  });

  it("courseTitle strips the file name and refuses a heading that is only one", () => {
    // The engine's documented heading, and what every real course writes.
    expect(courseTitle("# COURSE.md — fundAImentals\n")).toBe("fundAImentals");
    // A tutor writing a plain title is taken at its word.
    expect(courseTitle("Preamble\n\n# Typed REST APIs\n")).toBe("Typed REST APIs");
    // Nothing worth showing: the folder name stays the course's name.
    expect(courseTitle("# COURSE.md\n")).toBeNull();
    expect(courseTitle("no heading here")).toBeNull();
    expect(courseTitle(null)).toBeNull();
  });

  it("parseJournal tolerates a heading with no title separator", () => {
    const entries = parseJournal("## 2026-01-05\nbody");
    expect(entries).toEqual([{ date: "2026-01-05", title: "", body: "body" }]);
  });

  it("daysOverdue and dueItems agree on the boundary day", () => {
    const today = new Date("2026-06-15T12:00:00Z");
    expect(daysOverdue("2026-06-15", today)).toBe(0);
    expect(daysOverdue("2026-06-13", today)).toBe(2);
    const items = dueItems(
      [
        { id: "a", module: "m", question: "q", interval: 1, due: "2026-06-14", history: [] },
        { id: "b", module: "m", question: "q", interval: 1, due: "2026-06-16", history: [] },
        { id: "c", module: "m", question: "q", interval: 1, due: "2026-06-12", history: [] },
      ],
      today,
    );
    expect(items.map((item) => item.id)).toEqual(["c", "a"]);
  });
});
