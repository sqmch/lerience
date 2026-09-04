// Mechanical evidence for the worked cases in course-engine/evaluations/teaching-protocol.md.
// The learner responses and assessment are authored fixtures, not tutor behavior under test.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Ajv } from "ajv";
import { afterEach, describe, expect, it } from "vitest";
import progressSchema from "../course-engine/template/docs/schema/progress.schema.json" with { type: "json" };
import quizSchema from "../course-engine/template/docs/schema/quiz-bank.schema.json" with { type: "json" };
import { buildSessionOpener } from "../src/main/agent/opener";
import { journalTail } from "../src/main/scripts/parsers";
import { progressSchema as progressLens, quizBankSchema } from "../src/shared/engine/schemas";
import { scanFilings } from "./fixtures/teaching-scanner";

const temporaryRoots: string[] = [];
afterEach(() => {
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("teaching scanner's actual guarantees", () => {
  it("accepts a correctly filed path and reports an invalid filing", () => {
    expect(scanFilings(["north/2026-09.csv", "north/2026-13.csv"], () => "42")).toEqual({
      accepted: [{ path: "north/2026-09.csv", contents: "42" }],
      filingErrors: ["north/2026-13.csv"],
    });
  });

  it("does not inspect malformed contents despite a valid filing", () => {
    expect(scanFilings(["north/2026-09.csv"], () => "malformed contents")).toEqual({
      accepted: [{ path: "north/2026-09.csv", contents: "malformed contents" }],
      filingErrors: [],
    });
  });

  it("propagates a read failure and stops before the following file", () => {
    const visited: string[] = [];
    const failure = Object.assign(new Error("Read denied"), { code: "EACCES" });
    expect(() =>
      scanFilings(["north/2026-09.csv", "south/2026-09.csv"], (file) => {
        visited.push(file);
        throw failure;
      }),
    ).toThrow(failure);
    expect(visited).toEqual(["north/2026-09.csv"]);
  });
});

it("preserves assisted recall, failed transfer, and an open gap in existing course records", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lerience-teaching-evidence-"));
  temporaryRoots.push(root);
  fs.mkdirSync(path.join(root, "tutor"));
  const gap =
    "Read-error propagation remains unverified. 2026-09-05: checks passed after hint-2; " +
    "explained filing validation independently, but predicted read errors would be collected. " +
    "Next: trace a missing-file error without help. See journal 2026-09-05.";
  const progress = {
    learner: { profile: "Synthetic beginner", paceHoursPerWeek: "2-3", started: "2026-09-05" },
    currentModule: "00-filings",
    modules: {
      "00-filings": {
        status: "in-progress",
        hintsUsed: ["hint-1", "hint-2"],
        checkAttempts: 2,
        notes: gap,
      },
    },
  };
  const journal = [
    "# Tutor journal",
    "## 2026-09-05 - Filing exercise",
    gap,
    "Tutor explained the uncaught read. Independent recheck not attempted.",
    "## 2026-09-06 - Recall",
    "With a step-order prompt, learner repeated the read-error explanation. Tutored.",
    "## 2026-09-07 - Changed example",
    "Without help, learner predicted a missing file becomes a filing error. Wrong.",
    "## 2026-09-08 - Pause",
    "Learner paused. Open: read-error propagation; next probe remains pending.",
  ].join("\n");
  fs.writeFileSync(path.join(root, "tutor/progress.json"), JSON.stringify(progress));
  fs.writeFileSync(path.join(root, "tutor/journal.md"), journal);
  fs.writeFileSync(path.join(root, "tutor/quiz-bank.json"), '{"items":[]}\n');

  const quiz = (...args: string[]) =>
    execFileSync(
      process.execPath,
      [path.resolve("course-engine/template/scripts/quiz.mjs"), ...args, root],
      { encoding: "utf8", windowsHide: true },
    );
  quiz(
    "seed",
    "00-filings",
    "00-read-error",
    "What happens if reading a valid path fails?",
    "--today",
    "2026-09-05",
  );
  quiz(
    "tutored",
    "00-read-error",
    "--note",
    "Needed a step-order prompt.",
    "--today",
    "2026-09-06",
  );
  quiz(
    "grade",
    "00-read-error",
    "wrong",
    "--note",
    "Changed to a missing file; predicted filing error without help.",
    "--today",
    "2026-09-07",
  );

  const storedProgress: unknown = JSON.parse(
    fs.readFileSync(path.join(root, "tutor/progress.json"), "utf8"),
  );
  const storedBank: unknown = JSON.parse(
    fs.readFileSync(path.join(root, "tutor/quiz-bank.json"), "utf8"),
  );
  const ajv = new Ajv({ allErrors: true, strict: true });
  expect(ajv.validate(progressSchema, storedProgress), ajv.errorsText()).toBe(true);
  expect(ajv.validate(quizSchema, storedBank), ajv.errorsText()).toBe(true);
  expect(progressLens.parse(storedProgress).modules["00-filings"]).toEqual(
    progress.modules["00-filings"],
  );
  expect(quizBankSchema.parse(storedBank).items[0]).toMatchObject({
    interval: 1,
    due: "2026-09-08",
    history: [
      { date: "2026-09-06", result: "tutored", note: "Needed a step-order prompt." },
      {
        date: "2026-09-07",
        result: "wrong",
        note: "Changed to a missing file; predicted filing error without help.",
      },
    ],
  });

  const tail = journalTail(fs.readFileSync(path.join(root, "tutor/journal.md"), "utf8"));
  const opener = buildSessionOpener({ currentModuleId: "00-filings", journalTail: tail });
  // Transport assertions on authored evidence, not phrase-presence tests of the protocol.
  expect(tail).not.toContain("## 2026-09-05");
  expect(opener).toContain(tail);
  expect(tail).toContain("Open: read-error propagation; next probe remains pending.");
  expect(progressLens.parse(storedProgress).modules["00-filings"]?.notes).toBe(gap);
});
