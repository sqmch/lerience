// Unit tests for the pure helpers in scripts/doctor.mjs: porcelain parsing,
// the course-state path filter, and journal-heading date extraction.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parsePorcelain,
  isCourseState,
  newestJournalDate,
  newestQuizActivity,
  checkSpine,
  findMissingProgressModules,
  findCompletedModulesWithoutQuiz,
} from "../template/scripts/doctor.mjs";

test("parsePorcelain: modifications, renames, quoted paths, deletes, untracked", () => {
  const out = [
    " M tutor/quiz-bank.json",
    "R  curriculum/00-old/module.json -> curriculum/00-new/module.json", // rename → current path
    ' M "tutor/a file with spaces.md"', // quoted (special chars) → unwrapped
    " D tutor/progress.json", // delete still reports the path
    "?? scratch.txt",
    "", // blank lines are skipped
  ].join("\n");
  assert.deepEqual(parsePorcelain(out), [
    "tutor/quiz-bank.json",
    "curriculum/00-new/module.json",
    "tutor/a file with spaces.md",
    "tutor/progress.json",
    "scratch.txt",
  ]);
});

test("parsePorcelain: tolerates CRLF and empty input", () => {
  assert.deepEqual(parsePorcelain(" M a.txt\r\n M b.txt\r\n"), ["a.txt", "b.txt"]);
  assert.deepEqual(parsePorcelain(""), []);
  assert.deepEqual(parsePorcelain("\n\n"), []);
});

test("isCourseState: tutor / curriculum / COURSE.md are state; engine paths are not", () => {
  assert.equal(isCourseState("tutor/quiz-bank.json"), true);
  assert.equal(isCourseState("curriculum/00-orientation/module.json"), true);
  assert.equal(isCourseState("COURSE.md"), true);
  assert.equal(isCourseState("tutor\\quiz-bank.json"), true); // Windows backslash normalized
  assert.equal(isCourseState("docs/FORMAT.md"), false);
  assert.equal(isCourseState("README.md"), false);
  assert.equal(isCourseState("scripts/doctor.mjs"), false);
});

test("newestJournalDate: newest heading wins; a range heading takes its first date", () => {
  const journal = [
    "# Journal",
    "",
    "## 2026-06-10 — Session 1 (module 00)",
    "text",
    "## 2026-06-15/16 — Session 5 (range heading)",
    "more",
    "## 2026-07-03 — Maintenance",
    "tail",
  ].join("\n");
  assert.equal(newestJournalDate(journal), "2026-07-03");
  // the "…-15/16" range heading contributes 2026-06-15 (its first date), which
  // beats the earlier 06-10 — the exact shape journal.md carries in instance #1
  assert.equal(
    newestJournalDate("## 2026-06-15/16 — Session 5\n\n## 2026-06-10 — Session 1"),
    "2026-06-15",
  );
  assert.equal(newestJournalDate("no dated headings here\n### 2026-01-01 not an h2\n"), null);
});

test("newestQuizActivity: grades and moves both count; newest wins; kind names it", () => {
  // grades-only bank → the newest grade, kind "graded" (the pre-moves behavior)
  assert.deepEqual(
    newestQuizActivity({
      items: [
        { history: [{ date: "2026-07-03", result: "correct" }] },
        { history: [{ date: "2026-07-01", result: "wrong" }] },
      ],
    }),
    { date: "2026-07-03", kind: "graded" },
  );
  // a reschedule newer than every grade is unjournaled session activity too — it
  // wins, and is named "rescheduled" (a maintenance move must still be journaled)
  assert.deepEqual(
    newestQuizActivity({
      items: [
        {
          history: [{ date: "2026-07-03", result: "correct" }],
          moves: [{ date: "2026-07-06", action: "rescheduled", to: "2026-07-20" }],
        },
      ],
    }),
    { date: "2026-07-06", kind: "rescheduled" },
  );
  // a tie goes to "graded" (the stronger signal)
  assert.deepEqual(
    newestQuizActivity({
      items: [
        {
          history: [{ date: "2026-07-06", result: "partial" }],
          moves: [{ date: "2026-07-06", action: "rescheduled", to: "2026-07-10" }],
        },
      ],
    }),
    { date: "2026-07-06", kind: "graded" },
  );
  // no activity at all
  assert.deepEqual(newestQuizActivity({ items: [] }), { date: null, kind: null });
  assert.deepEqual(newestQuizActivity(null), { date: null, kind: null });
});

test("checkSpine: curriculum without COURSE.md fails; both-missing and present are ok", () => {
  // curriculum/ but no COURSE.md — onboarding step 3 never completed or spine lost
  const missing = checkSpine({ hasCurriculum: true, hasCourse: false });
  assert.equal(missing.level, "fail");
  assert.match(missing.message, /curriculum\/ exists but COURSE\.md is missing/);
  assert.match(missing.message, /a course without its spine/);
  // neither present — the not-yet-onboarded engine repo / fresh clone
  assert.deepEqual(checkSpine({ hasCurriculum: false, hasCourse: false }), {
    level: "ok",
    message: "no COURSE.md and no curriculum/ — not onboarded yet",
  });
  // COURSE.md present — spine intact, with or without curriculum/ yet
  assert.equal(checkSpine({ hasCurriculum: true, hasCourse: true }).level, "ok");
  assert.equal(checkSpine({ hasCurriculum: false, hasCourse: true }).level, "ok");
});

test("findMissingProgressModules: reports filesystem-only modules deterministically", () => {
  assert.deepEqual(
    findMissingProgressModules(
      ["02-effects", "00-orientation", "01-rendering", "02-effects"],
      ["00-orientation", "02-effects"],
    ),
    ["01-rendering"],
  );
  assert.deepEqual(findMissingProgressModules([], []), []);
  assert.deepEqual(findMissingProgressModules(["00-orientation"], ["00-orientation"]), []);
});

test("findCompletedModulesWithoutQuiz: reports completed modules with no seeded items", () => {
  assert.deepEqual(
    findCompletedModulesWithoutQuiz(
      ["02-effects", "00-orientation", "01-rendering", "02-effects"],
      ["00-orientation", "01-rendering"],
    ),
    ["02-effects"],
  );
  assert.deepEqual(findCompletedModulesWithoutQuiz([], []), []);
  assert.deepEqual(
    findCompletedModulesWithoutQuiz(["00-orientation"], ["00-orientation", "00-orientation"]),
    [],
  );
});
