// Portable optional assessment. All mutations use this course-local writer.
// CLI: node scripts/assessment.mjs <course-root> <module-id> <operation>
// Request JSON is read from stdin; Electron uses --ipc and parentPort instead.
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validate } from "./validate.mjs";

const engineRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX = 2 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MODULE = /^[0-9]{2}-[a-z0-9-]{1,80}$/;
const HELP = ["unknown", "none", "hint-1", "hint-2", "hint-3", "outside"];
const fail = (message, fields) => {
  const error = new Error(message);
  error.fields = fields;
  throw error;
};
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value !== null && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
const hash = (value) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
const same = (left, right) => hash(left) === hash(right);
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const exact = (value, keys) =>
  object(value) &&
  Object.keys(value).every((key) => keys.includes(key)) &&
  keys.every((key) => Object.hasOwn(value, key));
const timestamp = () => new Date().toISOString();

// Refuse every link in a selected course-relative path, including hard-linked
// files. Paths are fixed here or built from validated module IDs / UUIDs.
function contained(root, relative, missing = false) {
  let current = root;
  const parts = relative.split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || /[\\:]/.test(part)))
    fail("Invalid assessment path.");
  for (const part of parts) {
    current = path.join(current, part);
    try {
      const info = fs.lstatSync(current);
      if (info.isSymbolicLink() || (info.isFile() && info.nlink !== 1))
        fail("Assessment paths cannot contain links.");
      if (!info.isFile() && !info.isDirectory()) fail("Unsupported assessment path.");
    } catch (error) {
      if (missing && error.code === "ENOENT") continue;
      throw error;
    }
  }
  return current;
}
function json(root, relative, optional = false) {
  let file;
  try {
    file = contained(root, relative);
  } catch (error) {
    if (optional && error.code === "ENOENT") return null;
    throw error;
  }
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > MAX) fail("Assessment file is too large or not a file.");
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}
function schema(name, value) {
  const definition = JSON.parse(
    fs.readFileSync(path.join(engineRoot, "docs/schema", `${name}.schema.json`), "utf8"),
  );
  const errors = validate(definition, value, "", []);
  if (errors.length) fail(`Invalid ${name}: ${errors[0].path} ${errors[0].message}`);
}
export function validateQuestion(question, key, moduleId) {
  schema("assessment-question", question);
  if (question.moduleId !== moduleId) fail("Assessment module identity does not match.");
  if (
    new Set(question.fields.map((f) => f.id)).size !== question.fields.length ||
    new Set(question.criteria.map((c) => c.id)).size !== question.criteria.length
  )
    fail("Assessment IDs must be unique.");
  const numbers = question.fields.filter((f) => f.kind === "integer");
  if (!numbers.length || !question.fields.some((f) => f.kind === "explanation"))
    fail("Assessment requires numeric prediction and explanation.");
  if (
    !exact(key, ["schemaVersion", "questionId", "version", "answers"]) ||
    key.schemaVersion !== 1 ||
    key.questionId !== question.questionId ||
    key.version !== question.version ||
    !exact(
      key.answers,
      numbers.map((f) => f.id),
    ) ||
    Object.values(key.answers).some((n) => !Number.isSafeInteger(n))
  )
    fail("Objective key does not match this assessment version.");
  return hash({ question, key });
}
function source(root, moduleId) {
  const question = json(root, `curriculum/${moduleId}/assessment.json`, true);
  if (question === null) return null;
  if (question.schemaVersion !== 1)
    fail("This assessment version is not supported. The Brief remains available.");
  const key = json(root, `curriculum/${moduleId}/assessment-key.json`);
  return { question, key, digest: validateQuestion(question, key, moduleId) };
}
function projection(record) {
  const { grading, submissionDigest, ...visible } = record;
  void grading;
  void submissionDigest;
  return visible;
}
function records(root, courseId, moduleId) {
  let directory;
  try {
    directory = contained(root, "tutor/assessments");
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const files = fs.readdirSync(directory).filter((f) => f.endsWith(".json"));
  if (files.length > 1000) fail("Too many assessment records to read safely.");
  const result = [];
  for (const file of files) {
    if (!UUID.test(file.slice(0, -5))) fail("Invalid assessment record filename.");
    const record = json(root, `tutor/assessments/${file}`);
    schema("assessment-attempt", projection(record));
    if (
      record.id !== file.slice(0, -5) ||
      record.courseId !== courseId ||
      validateQuestion(record.question, record.grading, record.question.moduleId) !==
        record.sourceDigest
    )
      fail("Assessment record binding is inconsistent.");
    if (record.status === "submitted" && record.submissionDigest !== submissionHash(record))
      fail("Submitted assessment was changed outside the writer.");
    if (record.question.moduleId === moduleId) result.push(record);
  }
  if (result.length > 100) fail("This module has reached its assessment history limit.");
  return result.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
function submissionHash(r) {
  return hash({
    id: r.id,
    courseId: r.courseId,
    sourceDigest: r.sourceDigest,
    raw: r.raw,
    help: r.help,
    afterFeedback: r.afterFeedback,
    revisesAttemptId: r.revisesAttemptId,
    submittedAt: r.submittedAt,
    objective: r.objective,
  });
}
function inspect(root, courseId, moduleId) {
  const attempts = records(root, courseId, moduleId);
  let current;
  try {
    current = source(root, moduleId);
  } catch (error) {
    return {
      view: {
        state: "unsupported",
        detail: error.message,
        question: null,
        sourceDigest: null,
        attempts: attempts.map(projection),
      },
      current: null,
      attempts,
    };
  }
  if (
    current &&
    attempts.some(
      (r) =>
        r.question.questionId === current.question.questionId &&
        r.question.version === current.question.version &&
        r.sourceDigest !== current.digest,
    )
  ) {
    return {
      view: {
        state: "unsupported",
        detail:
          "The question or key changed without a new version. Earlier answers remain readable.",
        question: null,
        sourceDigest: null,
        attempts: attempts.map(projection),
      },
      current: null,
      attempts,
    };
  }
  return {
    view: {
      state: current ? "available" : "none",
      detail: "",
      question: current?.question ?? null,
      sourceDigest: current?.digest ?? null,
      attempts: attempts.map(projection),
    },
    current,
    attempts,
  };
}
function ensureDirectory(root, relative) {
  contained(root, relative, true);
  let prefix = "";
  for (const part of relative.split("/")) {
    prefix = prefix ? `${prefix}/${part}` : part;
    try {
      fs.mkdirSync(contained(root, prefix, true));
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    contained(root, prefix);
  }
}
function withLock(root, action) {
  ensureDirectory(root, "tutor/assessments");
  const lock = contained(root, "tutor/assessments/.writer-lock", true);
  let fd;
  try {
    fd = fs.openSync(lock, "wx", 0o600);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const owner = json(root, "tutor/assessments/.writer-lock");
    if (!Number.isInteger(owner.pid) || owner.pid < 1)
      fail("Assessment storage lock is unreadable.");
    try {
      process.kill(owner.pid, 0);
      fail("Assessment storage is busy. Retry shortly.");
    } catch (probe) {
      if (probe.code !== "ESRCH") throw probe;
    }
    fs.unlinkSync(contained(root, "tutor/assessments/.writer-lock"));
    fd = fs.openSync(lock, "wx", 0o600);
  }
  try {
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid }));
    fs.fsyncSync(fd);
    return action();
  } finally {
    fs.closeSync(fd);
    fs.unlinkSync(contained(root, "tutor/assessments/.writer-lock"));
  }
}
function commit(root, record, previous, beforeCommit) {
  schema("assessment-attempt", projection(record));
  const relative = `tutor/assessments/${record.id}.json`;
  const target = contained(root, relative, true);
  const temporary = contained(root, `tutor/assessments/.${randomUUID()}.tmp`, true);
  const fd = fs.openSync(temporary, "wx", 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(record, null, 2) + "\n");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  try {
    beforeCommit?.();
    if (!same(json(root, relative, true), previous))
      fail(
        "Assessment changed outside this window. Your input has been kept; reopen before reconciling.",
      );
    contained(root, relative, true);
    fs.renameSync(temporary, target);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}
function rawAnswers(question, raw, submitting) {
  if (
    !exact(
      raw,
      question.fields.map((f) => f.id),
    ) ||
    Object.values(raw).some((v) => typeof v !== "string" || v.length > 4000)
  )
    fail("Answers do not match the question fields.");
  const errors = {};
  for (const f of question.fields) {
    const value = raw[f.id].trim();
    if (!value) errors[f.id] = "Enter an answer.";
    else if (
      f.kind === "integer" &&
      (!/^-?\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
    )
      errors[f.id] = "Enter a whole number.";
  }
  if (submitting && Object.keys(errors).length) fail("Check the marked answers.", errors);
}

export function assessmentOperation(courseRoot, request, { beforeCommit } = {}) {
  try {
    const root = path.resolve(courseRoot);
    if (fs.lstatSync(root).isSymbolicLink()) fail("Assessment course root cannot be a link.");
    if (
      !object(request) ||
      !MODULE.test(request.moduleId) ||
      JSON.stringify(request).length > 64000
    )
      fail("Invalid assessment request.");
    const capability = json(root, "assessment-capability.json", true);
    if (!same(capability, { schemaVersion: 1, assessment: "numeric-explanation-v1" })) {
      if (request.operation !== "read") fail("This course does not support assessment writes.");
      const authored = json(root, `curriculum/${request.moduleId}/assessment.json`, true);
      return {
        ok: true,
        view: {
          state: authored ? "unsupported" : "none",
          detail: authored
            ? "This course does not support this assessment. Read the Brief and discuss it with your tutor."
            : "",
          question: null,
          sourceDigest: null,
          attempts: [],
        },
      };
    }
    const identity = json(root, ".praxeum.json");
    if (identity.formatVersion !== 0 || !UUID.test(identity.courseId))
      fail("Unsupported course identity.");
    const moduleId = request.moduleId;
    if (request.operation === "read")
      return { ok: true, view: inspect(root, identity.courseId, moduleId).view };
    return withLock(root, () => {
      const { view, current, attempts } = inspect(root, identity.courseId, moduleId);
      if (!UUID.test(request.id)) fail("Invalid attempt identity.");
      const existing = attempts.find((r) => r.id === request.id) ?? null;
      let record = existing ? structuredClone(existing) : null;
      const now = timestamp();
      if (request.operation === "save") {
        if (!current || request.sourceDigest !== current.digest)
          fail(
            "The question changed. Keep these answers and start the current question separately.",
          );
        rawAnswers(current.question, request.raw, false);
        if (
          !HELP.includes(request.help) ||
          !Number.isInteger(request.revision) ||
          request.revision < 0
        )
          fail("Invalid draft.");
        if (record && record.sourceDigest !== current.digest)
          fail("A draft cannot change question versions.");
        if (record?.status === "submitted")
          fail("Submitted answers cannot be edited. Choose Revise answers.");
        if (
          record &&
          same(record.raw, request.raw) &&
          record.help === request.help &&
          record.revision === request.revision + 1
        )
          return { ok: true, view };
        if ((record?.revision ?? 0) !== request.revision)
          fail("This draft changed. Your input is kept; reopen to reconcile it.");
        if (!record) {
          const parent =
            request.revisesAttemptId === null
              ? null
              : attempts.find((r) => r.id === request.revisesAttemptId && r.status === "submitted");
          if (request.revisesAttemptId !== null && !parent) fail("Revision parent is missing.");
          record = {
            schemaVersion: 1,
            id: request.id,
            courseId: identity.courseId,
            sourceDigest: current.digest,
            question: current.question,
            grading: current.key,
            submissionDigest: null,
            revision: 0,
            status: "draft",
            raw: {},
            help: "unknown",
            afterFeedback:
              parent !== null &&
              (parent.afterFeedback || parent.feedback.length > 0 || parent.objective.length > 0),
            revisesAttemptId: request.revisesAttemptId,
            createdAt: now,
            updatedAt: now,
            submittedAt: null,
            objective: [],
            feedback: [],
            events: [],
          };
        }
        record.raw = request.raw;
        if (record.help !== request.help)
          record.events.push({
            id: randomUUID(),
            kind: "help",
            text: `Learner reported ${request.help}. Earlier reports remain in history.`,
            createdAt: now,
          });
        record.help = request.help;
        record.revision++;
        record.updatedAt = now;
      } else if (request.operation === "submit") {
        if (!record) fail("Save these answers before submitting.");
        if (record.status === "submitted") {
          if (request.sourceDigest !== record.sourceDigest || request.revision !== record.revision)
            fail("Submission conflicts with the saved attempt.");
          return { ok: true, view };
        }
        if (
          !current ||
          current.digest !== record.sourceDigest ||
          request.sourceDigest !== record.sourceDigest ||
          request.revision !== record.revision
        )
          fail("The question or draft changed. Save and review before submitting.");
        rawAnswers(record.question, record.raw, true);
        record.status = "submitted";
        record.submittedAt = now;
        record.updatedAt = now;
        record.objective = record.question.fields
          .filter((f) => f.kind === "integer")
          .map((f) => ({
            fieldId: f.id,
            state:
              Number(record.raw[f.id]) === record.grading.answers[f.id] ? "correct" : "incorrect",
            expected: record.grading.answers[f.id],
          }));
        record.submissionDigest = submissionHash(record);
      } else if (request.operation === "feedback") {
        if (!record || record.status !== "submitted")
          fail("Feedback requires a submitted attempt.");
        schema("assessment-feedback", request.feedback);
        const feedback = request.feedback;
        if (
          feedback.attemptId !== record.id ||
          feedback.sourceDigest !== record.sourceDigest ||
          feedback.criteria.length !== record.question.criteria.length ||
          new Set(feedback.criteria.map((c) => c.criterionId)).size !== feedback.criteria.length ||
          feedback.criteria.some(
            (c) => !record.question.criteria.some((q) => q.id === c.criterionId),
          )
        )
          fail("Feedback is not bound to this question and attempt.");
        for (const c of feedback.criteria)
          if (c.excerpt && !Object.values(record.raw).some((v) => v.includes(c.excerpt)))
            fail("Feedback excerpt is not in the submitted response.");
        const prior = record.feedback.find((f) => f.id === feedback.id);
        if (prior) {
          if (!same(prior, feedback)) fail("Feedback ID conflicts with earlier feedback.");
          return { ok: true, view };
        }
        record.feedback.push(feedback);
        record.updatedAt = now;
      } else if (request.operation === "event") {
        if (
          !record ||
          record.status !== "submitted" ||
          !UUID.test(request.eventId) ||
          !["help", "dispute", "review"].includes(request.kind) ||
          typeof request.text !== "string" ||
          !request.text.trim() ||
          request.text.length > 4000
        )
          fail("Invalid assessment history addition.");
        const prior = record.events.find((e) => e.id === request.eventId);
        if (prior) {
          if (prior.kind !== request.kind || prior.text !== request.text)
            fail("History ID conflict.");
          return { ok: true, view };
        }
        record.events.push({
          id: request.eventId,
          kind: request.kind,
          text: request.text,
          createdAt: now,
        });
        record.updatedAt = now;
      } else fail("Unknown assessment operation.");
      // Source is re-read just before save/submit. A cooperative writer lock
      // also protects CLI review additions and concurrent app windows.
      if (
        ["save", "submit"].includes(request.operation) &&
        source(root, moduleId)?.digest !== record.sourceDigest
      )
        fail("Question changed while saving.");
      commit(root, record, existing, beforeCommit);
      return { ok: true, view: inspect(root, identity.courseId, moduleId).view };
    });
  } catch (error) {
    return {
      ok: false,
      detail: error.code
        ? "Assessment storage is unavailable. Your unsaved answers are still in this window."
        : error.message,
      ...(error.fields ? { fields: error.fields } : {}),
    };
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const [root, moduleId, operation, mode] = process.argv.slice(2);
  const run = (input) => {
    const result = assessmentOperation(root, { ...input, moduleId, operation });
    process.stdout.write(JSON.stringify(result) + "\n");
  };
  if (mode === "--ipc" && process.parentPort)
    process.parentPort.once("message", ({ data }) => {
      run(data);
      process.exit(0);
    });
  else {
    let text = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      text += chunk;
      if (text.length > 64000) process.exit(1);
    });
    process.stdin.on("end", () => {
      try {
        run(JSON.parse(text || "{}"));
      } catch {
        process.stdout.write(
          JSON.stringify({ ok: false, detail: "Invalid assessment request." }) + "\n",
        );
      }
    });
  }
}
