// Engine-owned portable passage marks. No pedagogical state or provider work.
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validate } from "./validate.mjs";
import { EXTRACTION, extractPassages, matchPassage } from "./reading-extract.mjs";
const MAX_STORE = 1024 * 1024,
  MAX_SOURCE = 256 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MODULE = /^[0-9]{2}-[a-z0-9-]{1,80}$/;
const definition = JSON.parse(
  fs.readFileSync(new URL("../docs/schema/reading-marks.schema.json", import.meta.url), "utf8"),
);
const fail = (message) => {
  throw new Error(message);
};
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const RECORD = "tutor/reading-marks.json";
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
        fail("Highlight paths cannot contain links.");
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
  if (!stat.isFile() || stat.size > MAX_STORE) fail("Highlight file is too large or not a file.");
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
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
  ensureDirectory(root, "tutor");
  const lock = contained(root, "tutor/.reading-writer-lock", true);
  let fd;
  try {
    fd = fs.openSync(lock, "wx", 0o600);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const reclaim = contained(root, "tutor/.reading-reclaim-lock", true);
    let reclaimFd;
    try {
      reclaimFd = fs.openSync(reclaim, "wx", 0o600);
    } catch {
      fail(
        "Highlight lock recovery is busy. Retry shortly; if it persists, preserve the records and inspect the recovery lock.",
      );
    }
    try {
      // Re-read only AFTER exclusively owning reclaim. A second reclaimer
      // must never unlink the replacement lock created by the first.
      const owner = json(root, "tutor/.reading-writer-lock", true);
      if (owner !== null) {
        if (!Number.isInteger(owner.pid) || owner.pid < 1)
          fail("Highlight storage lock is unreadable.");
        try {
          process.kill(owner.pid, 0);
          fail("Highlight storage is busy. Retry shortly.");
        } catch (probe) {
          if (probe.code !== "ESRCH") throw probe;
        }
        fs.unlinkSync(contained(root, "tutor/.reading-writer-lock"));
      }
      fd = fs.openSync(lock, "wx", 0o600);
    } finally {
      fs.closeSync(reclaimFd);
      fs.unlinkSync(contained(root, "tutor/.reading-reclaim-lock"));
    }
  }
  try {
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid }));
    fs.fsyncSync(fd);
    return action();
  } finally {
    fs.closeSync(fd);
    fs.unlinkSync(contained(root, "tutor/.reading-writer-lock"));
  }
}

function source(root, moduleId) {
  try {
    const file = contained(root, `curriculum/${moduleId}/LESSON.md`);
    if (fs.statSync(file).size > MAX_SOURCE) return null;
    const bytes = fs.readFileSync(file),
      markdown = bytes.toString("utf8");
    return { digest: digest(bytes), markdown, passages: extractPassages(markdown) };
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
function checkRecord(record, courseId) {
  if (
    validate(definition, record, "", []).length ||
    record.courseId !== courseId ||
    new Set(record.marks.map((m) => m.id)).size !== record.marks.length
  )
    fail("Highlights are unreadable or use an unsupported format. The file was preserved.");
  for (const m of record.marks) {
    if (
      m.courseId !== courseId ||
      m.lessonPath !== `curriculum/${m.moduleId}/LESSON.md` ||
      m.start >= m.end ||
      m.end > m.text.length ||
      m.text.slice(m.start, m.end) !== m.quote ||
      !m.quote.trim()
    )
      fail("A saved highlight is inconsistent. The file was preserved.");
  }
}
function inspect(root, courseId, moduleId) {
  const stored = json(root, RECORD, true);
  const record = (stored ? JSON.parse(JSON.stringify(stored)) : null) ?? {
    schemaVersion: 1,
    courseId,
    revision: 0,
    marks: [],
  };
  checkRecord(record, courseId);
  const current = moduleId ? source(root, moduleId) : null;
  const sources = new Map(moduleId ? [[moduleId, current]] : []);
  const matches = {};
  for (const mark of record.marks) {
    if (!sources.has(mark.moduleId)) {
      try {
        sources.set(mark.moduleId, source(root, mark.moduleId));
      } catch {
        sources.set(mark.moduleId, null);
      }
    }
    const target = sources.get(mark.moduleId),
      match = matchPassage(mark, target);
    matches[mark.id] = match
      ? { index: match.index, changed: target.digest !== mark.sourceDigest }
      : null;
  }
  return {
    stored,
    record,
    view: {
      supported: true,
      revision: record.revision,
      marks: record.marks,
      source: current,
      matches,
    },
  };
}
export function readingOperation(courseRoot, request, { beforeCommit } = {}) {
  try {
    const root = path.resolve(courseRoot);
    if (fs.lstatSync(root).isSymbolicLink()) fail("Linked course root is unsupported.");
    if (
      !request ||
      typeof request !== "object" ||
      !["read", "add", "remove"].includes(request.operation) ||
      (request.moduleId !== null && !MODULE.test(request.moduleId)) ||
      JSON.stringify(request).length > 64000
    )
      fail("Invalid highlight request.");
    const capability = json(root, "reading-capability.json", true);
    if (
      !capability ||
      Object.keys(capability).length !== 2 ||
      capability.schemaVersion !== 1 ||
      capability.reading !== "passage-marks-v1"
    ) {
      if (request.operation !== "read") fail("This course does not support highlight writes.");
      return {
        ok: true,
        view: { supported: false, revision: 0, marks: [], source: null, matches: {} },
      };
    }
    const identity = json(root, ".praxeum.json");
    if (identity.formatVersion !== 0 || !UUID.test(identity.courseId))
      fail("Unsupported course identity.");
    if (request.operation === "read")
      return { ok: true, view: inspect(root, identity.courseId, request.moduleId).view };
    return withLock(root, () => {
      const { stored, record, view } = inspect(root, identity.courseId, request.moduleId);
      if (!Number.isSafeInteger(request.revision) || request.revision < 0 || !UUID.test(request.id))
        fail("Invalid highlight revision or identity.");
      if (request.operation === "add") {
        if (!MODULE.test(request.moduleId) || request.extractionVersion !== EXTRACTION)
          fail("Unsupported passage extraction.");
        const proposed = {
          id: request.id,
          courseId: identity.courseId,
          moduleId: request.moduleId,
          lessonPath: `curriculum/${request.moduleId}/LESSON.md`,
          sourceDigest: request.sourceDigest,
          extractionVersion: EXTRACTION,
          index: request.index,
          heading: request.heading,
          text: request.text,
          start: request.start,
          end: request.end,
          quote: request.quote,
          createdAt: new Date().toISOString(),
        };
        checkRecord({ ...record, marks: [proposed] }, identity.courseId);
        const prior = record.marks.find((m) => m.id === request.id);
        if (prior) {
          if (!same({ ...prior, createdAt: proposed.createdAt }, proposed))
            fail("Highlight identity conflicts with a saved passage.");
          return { ok: true, view }; // An uncertain acknowledgement retries exactly the same identity.
        }
        if (
          !view.source ||
          view.source.digest !== request.sourceDigest ||
          !matchPassage(proposed, view.source)
        )
          fail("The lesson changed. Select the passage again; the unsaved quote is kept here.");
        if (record.revision !== request.revision)
          fail("Highlights changed. Refresh the list before trying again.");
        if (
          record.marks.some(
            (m) =>
              m.moduleId === proposed.moduleId &&
              m.sourceDigest === proposed.sourceDigest &&
              m.index === proposed.index &&
              m.start === proposed.start &&
              m.end === proposed.end,
          )
        )
          return { ok: true, view };
        record.marks.push(proposed);
      } else {
        if (!record.marks.some((m) => m.id === request.id)) return { ok: true, view };
        if (record.revision !== request.revision)
          fail("Highlights changed. Refresh the list before removing this mark.");
        record.marks = record.marks.filter((m) => m.id !== request.id);
      }
      record.revision++;
      checkRecord(record, identity.courseId);
      const bytes = JSON.stringify(record, null, 2) + "\n";
      if (Buffer.byteLength(bytes) > MAX_STORE)
        fail("Highlight storage is full. No change was written.");
      const temporary = contained(root, `tutor/.reading-${randomUUID()}.tmp`, true);
      const fd = fs.openSync(temporary, "wx", 0o600);
      try {
        fs.writeFileSync(fd, bytes);
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      try {
        beforeCommit?.();
        if (!same(json(root, RECORD, true), stored))
          fail("Highlights changed outside this window. No change was written.");
        if (
          request.operation === "add" &&
          source(root, request.moduleId)?.digest !== request.sourceDigest
        )
          fail("The lesson changed while saving. Select the passage again.");
        fs.renameSync(temporary, contained(root, RECORD, true));
      } finally {
        if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
      }
      return { ok: true, view: inspect(root, identity.courseId, request.moduleId).view };
    });
  } catch (error) {
    return {
      ok: false,
      detail: error.code
        ? "Highlight storage is unavailable. Keep the unsaved quote and retry."
        : error.message,
    };
  }
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const [root, mode] = process.argv.slice(2);
  const run = (input) => {
    const reply = JSON.stringify(readingOperation(root, input)) + "\n";
    if (mode === "--ipc" && process.parentPort) {
      process.parentPort.once("message", ({ data }) => {
        if (data === "reply-received") process.exit(0);
      });
      process.parentPort.postMessage(reply);
    } else process.stdout.write(reply);
  };
  if (mode === "--ipc" && process.parentPort)
    process.parentPort.once("message", ({ data }) => run(data));
  else {
    let text = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      text += chunk;
      if (text.length > 64000) process.exit(1);
    });
    process.stdin.on("end", () => {
      try {
        run(JSON.parse(text));
      } catch {
        process.stdout.write(JSON.stringify({ ok: false, detail: "Invalid highlight request." }));
      }
    });
  }
}
