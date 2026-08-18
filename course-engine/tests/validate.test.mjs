// Unit tests for the draft-07-subset core in scripts/validate.mjs: each keyword
// the schemas actually use (pass + fail), plus the four shipped schemas against
// real fixtures and corrupted copies.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validate } from "../template/scripts/validate.mjs";

const errs = (schema, value) => validate(schema, value, "", []);
const ok = (schema, value) =>
  assert.equal(errs(schema, value).length, 0, JSON.stringify(errs(schema, value)));
const bad = (schema, value) =>
  assert.ok(errs(schema, value).length > 0, "expected at least one error");

const schemaDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "template",
  "docs",
  "schema",
);
const load = (n) => JSON.parse(fs.readFileSync(path.join(schemaDir, `${n}.schema.json`), "utf8"));

test("type: unions and integer vs number", () => {
  ok({ type: ["string", "null"] }, "x");
  ok({ type: ["string", "null"] }, null);
  bad({ type: ["string", "null"] }, 5);
  ok({ type: "integer" }, 3);
  bad({ type: "integer" }, 3.5);
  ok({ type: "number" }, 3.5);
  bad({ type: "number" }, Number.NaN); // NaN is not a valid number
});

test("required", () => {
  ok({ type: "object", required: ["a"] }, { a: 1 });
  bad({ type: "object", required: ["a"] }, {});
});

test("enum", () => {
  ok({ enum: ["x", "y"] }, "x");
  bad({ enum: ["x", "y"] }, "z");
});

test("additionalProperties: false, and as-a-schema", () => {
  ok({ type: "object", properties: { a: {} }, additionalProperties: false }, { a: 1 });
  bad({ type: "object", properties: { a: {} }, additionalProperties: false }, { a: 1, b: 2 });
  ok({ type: "object", additionalProperties: { type: "number" } }, { a: 1, b: 2 });
  bad({ type: "object", additionalProperties: { type: "number" } }, { a: "not a number" });
});

test("pattern", () => {
  ok({ type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }, "2026-07-08");
  bad({ type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }, "2026-7-8");
});

test("items", () => {
  ok({ type: "array", items: { type: "number" } }, [1, 2, 3]);
  bad({ type: "array", items: { type: "number" } }, [1, "two", 3]);
});

test("minimum / maximum and minItems / maxItems", () => {
  ok({ type: "number", minimum: 0, maximum: 10 }, 5);
  bad({ type: "number", minimum: 0 }, -1);
  bad({ type: "number", maximum: 10 }, 11);
  ok({ type: "array", minItems: 1, maxItems: 3 }, [1, 2]);
  bad({ type: "array", minItems: 2 }, [1]);
  bad({ type: "array", maxItems: 1 }, [1, 2]);
});

test("the four shipped schemas accept real / realistic fixtures", () => {
  const tutorDir = path.resolve(schemaDir, "..", "..", "templates", "tutor");
  ok(load("progress"), JSON.parse(fs.readFileSync(path.join(tutorDir, "progress.json"), "utf8")));
  ok(load("quiz-bank"), JSON.parse(fs.readFileSync(path.join(tutorDir, "quiz-bank.json"), "utf8")));
  ok(load("module"), {
    id: "02-vector-store",
    title: "A Vector Store from Scratch",
    phase: 1,
    prerequisites: ["01-embeddings"],
    runtime: "node",
    estimatedHours: 2.5, // number, not integer — the real bank carries this
    provenance: "core",
    volatileLayer: "generated-at-start",
    bossCheck: true,
  });
  ok(load("lab"), { provenance: "tutor-generated", focus: "…", vectors: {} });
});

test("the four shipped schemas reject corrupted copies", () => {
  // module: missing required volatileLayer; bad id pattern; bad enum
  bad(load("module"), {
    id: "02-x",
    title: "T",
    phase: 1,
    prerequisites: [],
    runtime: "node",
    estimatedHours: 2,
    provenance: "core",
  });
  bad(load("module"), {
    id: "BAD ID",
    title: "T",
    phase: 1,
    prerequisites: [],
    runtime: "node",
    estimatedHours: 2,
    provenance: "core",
    volatileLayer: "generated-at-start",
  });
  // progress: status outside the canonical vocabulary
  bad(load("progress"), {
    learner: { profile: "p", paceHoursPerWeek: "3-5", started: "" },
    currentModule: null,
    modules: { "00-orientation": { status: "done" } },
  });
  // quiz-bank: interval below the minimum of 1
  bad(load("quiz-bank"), {
    items: [{ id: "x", module: "m", question: "q", interval: 0, due: "2026-07-08", history: [] }],
  });
  // lab: missing required provenance
  bad(load("lab"), { focus: "no provenance here" });
});

test("progress: optional bossCheck record — accepted, and strict on outcome/dates", () => {
  const withBoss = (bossCheck, status = "completed") => ({
    learner: { profile: "p", paceHoursPerWeek: "3-5", started: "2026-06-10" },
    currentModule: "00-orientation",
    modules: { "00-orientation": { status, bossCheck } },
  });
  // full record: passedAt + both a fail and a pass attempt
  ok(
    load("progress"),
    withBoss({
      passedAt: "2026-06-11",
      attempts: [
        { date: "2026-06-11", outcome: "failed", notes: "missed the continuation pattern" },
        { date: "2026-06-11", outcome: "passed", notes: "re-explained, passed clean" },
      ],
    }),
  );
  // still failing: passedAt null, empty attempts is valid
  ok(load("progress"), withBoss({ passedAt: null, attempts: [] }, "in-progress"));
  // strict: a bad outcome enum is rejected
  bad(
    load("progress"),
    withBoss({ passedAt: null, attempts: [{ date: "2026-06-11", outcome: "aced" }] }),
  );
  // strict: a malformed date is rejected (both passedAt and attempt.date)
  bad(load("progress"), withBoss({ passedAt: "2026-6-11", attempts: [] }));
  bad(
    load("progress"),
    withBoss({ passedAt: null, attempts: [{ date: "2026-6-11", outcome: "passed" }] }),
  );
  // strict: attempts require date + outcome
  bad(load("progress"), withBoss({ passedAt: null, attempts: [{ outcome: "passed" }] }));
  bad(load("progress"), withBoss({ passedAt: null, attempts: [{ date: "2026-06-11" }] }));
});

test("quiz-bank: moves accepted; legacy rescheduled history stays valid; malformed moves rejected", () => {
  const item = (extra) => ({
    id: "x",
    module: "m",
    question: "q",
    interval: 1,
    due: "2026-07-08",
    history: [],
    ...extra,
  });
  // a fresh reschedule (with "to") and a migrated-legacy move (no "to") both validate
  ok(load("quiz-bank"), {
    items: [
      item({ moves: [{ date: "2026-07-08", action: "rescheduled", to: "2026-07-12", note: "…" }] }),
    ],
  });
  ok(load("quiz-bank"), {
    items: [item({ moves: [{ date: "2026-07-08", action: "rescheduled" }] })],
  });
  // reality wins: a pre-migration bank with rescheduled in history is still valid
  ok(load("quiz-bank"), {
    items: [item({ history: [{ date: "2026-06-13", result: "rescheduled", note: "…" }] })],
  });
  // strict inside moves: bad action enum, bad date, and missing required action all fail
  bad(load("quiz-bank"), { items: [item({ moves: [{ date: "2026-07-08", action: "bumped" }] })] });
  bad(load("quiz-bank"), {
    items: [item({ moves: [{ date: "2026-7-8", action: "rescheduled" }] })],
  });
  bad(load("quiz-bank"), { items: [item({ moves: [{ date: "2026-07-08" }] })] });
  // "to", when present, must be a real ISO date
  bad(load("quiz-bank"), {
    items: [item({ moves: [{ date: "2026-07-08", action: "rescheduled", to: "soon" }] })],
  });
});
