import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { assessmentOperation, validateQuestion } from "../template/scripts/assessment.mjs";

const moduleId = "00-token-bin";
const question = {
  schemaVersion: 1,
  moduleId,
  questionId: "trace",
  version: 1,
  title: "Trace the bin",
  prompt: "Capacity 6, starts at 2. Add 3, remove 4, add 7. Explain the spill.",
  fields: [
    { id: "stored", kind: "integer", label: "After adding 7", units: "tokens" },
    { id: "spill", kind: "integer", label: "Spilled", units: "tokens" },
    { id: "why", kind: "explanation", label: "Why?", units: "" },
  ],
  criteria: [
    { id: "capacity", description: "Account for the prior count, incoming tokens and capacity." },
  ],
};
const key = { schemaVersion: 1, questionId: "trace", version: 1, answers: { stored: 6, spill: 2 } };
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "assessment-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "curriculum", moduleId), { recursive: true });
  fs.writeFileSync(
    path.join(root, "assessment-capability.json"),
    JSON.stringify({ schemaVersion: 1, assessment: "numeric-explanation-v1" }),
  );
  fs.writeFileSync(
    path.join(root, ".praxeum.json"),
    JSON.stringify({ courseId: randomUUID(), formatVersion: 0 }),
  );
  for (const [file, data] of [
    ["assessment.json", question],
    ["assessment-key.json", key],
  ])
    fs.writeFileSync(path.join(root, "curriculum", moduleId, file), JSON.stringify(data));
  return root;
}
function run(root, command, options) {
  return assessmentOperation(root, { moduleId, ...command }, options);
}
function save(root, extra = {}) {
  return run(root, {
    operation: "save",
    id: randomUUID(),
    sourceDigest: validateQuestion(question, key, moduleId),
    revision: 0,
    raw: { stored: "6", spill: "2", why: "One token plus seven exceeds capacity six by two." },
    help: "none",
    revisesAttemptId: null,
    ...extra,
  });
}
test("raw invalid drafts survive; submit is durable, idempotent and immutable across reopen/copy", (t) => {
  const root = fixture(t),
    id = randomUUID();
  let result = save(root, { id, raw: { stored: "", spill: "bad", why: "" } });
  assert.equal(result.ok, true);
  let attempt = result.view.attempts[0];
  assert.equal(JSON.stringify(result).includes('"answers"'), false);
  result = run(root, { operation: "submit", id, revision: 1, sourceDigest: attempt.sourceDigest });
  assert.equal(result.ok, false);
  assert.ok(result.fields.spill);
  result = save(root, { id, revision: 1, raw: { stored: "6", spill: "0", why: "No spill." } });
  assert.equal(result.ok, true);
  attempt = result.view.attempts[0];
  const command = { operation: "submit", id, revision: 2, sourceDigest: attempt.sourceDigest };
  result = run(root, command);
  assert.equal(result.ok, true);
  assert.equal(result.view.attempts[0].objective[1].state, "incorrect");
  assert.deepEqual(run(root, command), result);
  assert.equal(save(root, { id, revision: 2 }).ok, false);
  const copy = path.join(root, "copy");
  fs.mkdirSync(copy);
  for (const name of ["curriculum", "tutor", ".praxeum.json", "assessment-capability.json"])
    fs.cpSync(path.join(root, name), path.join(copy, name), { recursive: true });
  assert.deepEqual(run(copy, { operation: "read" }), result);
});
test("failed replacement and stale revisions preserve stored bytes; lost save acknowledgement is retryable", (t) => {
  const root = fixture(t),
    id = randomUUID();
  const first = save(root, { id });
  assert.equal(first.ok, true);
  assert.deepEqual(save(root, { id }), first);
  const filename = path.join(root, "tutor/assessments", `${id}.json`),
    before = fs.readFileSync(filename, "utf8");
  assert.equal(
    save(root, { id, revision: 0, raw: { stored: "5", spill: "2", why: "changed" } }).ok,
    false,
  );
  assert.equal(
    run(
      root,
      {
        operation: "save",
        id,
        revision: 1,
        sourceDigest: first.view.sourceDigest,
        raw: { stored: "5", spill: "2", why: "changed" },
        help: "none",
        revisesAttemptId: null,
      },
      {
        beforeCommit: () => {
          throw new Error("injected storage failure");
        },
      },
    ).ok,
    false,
  );
  assert.equal(fs.readFileSync(filename, "utf8"), before);
});
test("version changes preserve old drafts; unsupported capability and contained-path failures cannot write", (t) => {
  const root = fixture(t);
  assert.equal(save(root).ok, true);
  fs.writeFileSync(
    path.join(root, "curriculum", moduleId, "assessment-key.json"),
    JSON.stringify({ ...key, answers: { stored: 6, spill: 3 } }),
  );
  assert.equal(run(root, { operation: "read" }).view.state, "unsupported");
  assert.equal(save(root).ok, false);
  fs.writeFileSync(
    path.join(root, "assessment-capability.json"),
    JSON.stringify({ schemaVersion: 2, assessment: "future" }),
  );
  assert.equal(run(root, { operation: "read" }).view.state, "unsupported");
  assert.equal(save(root).ok, false);
  assert.equal(assessmentOperation(root, { operation: "save", moduleId: "../escape" }).ok, false);
});
test("bound feedback, immutable excerpts, revision exposure and append-only disputes", (t) => {
  const root = fixture(t),
    id = randomUUID();
  let result = save(root, { id });
  result = run(root, {
    operation: "submit",
    id,
    revision: 1,
    sourceDigest: result.view.sourceDigest,
  });
  const feedback = {
    id: randomUUID(),
    attemptId: id,
    sourceDigest: result.view.sourceDigest,
    author: "tutor",
    createdAt: new Date().toISOString(),
    criteria: [
      {
        criterionId: "capacity",
        state: "supported",
        excerpt: "One token",
        rationale: "Accounts for the starting count.",
      },
    ],
  };
  result = run(root, { operation: "feedback", id, feedback });
  assert.equal(result.ok, true);
  assert.deepEqual(run(root, { operation: "feedback", id, feedback }), result);
  assert.equal(
    run(root, {
      operation: "feedback",
      id,
      feedback: { ...feedback, id: randomUUID(), sourceDigest: "a".repeat(64) },
    }).ok,
    false,
  );
  assert.equal(
    run(root, {
      operation: "feedback",
      id,
      feedback: {
        ...feedback,
        id: randomUUID(),
        criteria: [{ ...feedback.criteria[0], excerpt: "invented" }],
      },
    }).ok,
    false,
  );
  result = save(root, { revisesAttemptId: id });
  assert.equal(result.ok, true);
  assert.equal(result.view.attempts.at(-1).afterFeedback, true);
  const event = {
    operation: "event",
    id,
    eventId: randomUUID(),
    kind: "dispute",
    text: "Please reconsider.",
  };
  result = run(root, event);
  assert.deepEqual(run(root, event), result);
  assert.equal(result.view.attempts.find((a) => a.id === id).feedback.length, 1);
});
test("junctions and hard links are refused without touching their targets", (t) => {
  const root = fixture(t),
    outside = fs.mkdtempSync(path.join(os.tmpdir(), "assessment-outside-"));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "tutor"));
  fs.symlinkSync(
    outside,
    path.join(root, "tutor/assessments"),
    process.platform === "win32" ? "junction" : "dir",
  );
  assert.equal(save(root).ok, false);
  assert.deepEqual(fs.readdirSync(outside), []);
  fs.unlinkSync(path.join(root, "tutor/assessments"));
  const sourceFile = path.join(root, "curriculum", moduleId, "assessment.json");
  fs.linkSync(sourceFile, path.join(outside, "question.json"));
  assert.equal(save(root).ok, false);
});
