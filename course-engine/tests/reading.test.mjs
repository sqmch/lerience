import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readingOperation } from "../template/scripts/reading.mjs";
import { extractPassages, EXTRACTION } from "../template/scripts/reading-extract.mjs";
const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "reading-engine-"));
  roots.push(root);
  fs.cpSync(path.resolve("course-engine/template"), root, { recursive: true });
  fs.writeFileSync(
    path.join(root, ".praxeum.json"),
    JSON.stringify({ courseId: randomUUID(), formatVersion: 0 }),
  );
  fs.mkdirSync(path.join(root, "curriculum/00-tray"), { recursive: true });
  const lesson = path.join(root, "curriculum/00-tray/LESSON.md");
  fs.writeFileSync(lesson, "# Tray\n\n## Rule\n\nOne **collection** leaves the shelf unchanged.\n");
  const read = () => readingOperation(root, { operation: "read", moduleId: "00-tray" });
  const view = read().view;
  assert.ok(view);
  const p = view.source.passages[0];
  const command = {
    operation: "add",
    moduleId: "00-tray",
    id: randomUUID(),
    revision: 0,
    sourceDigest: view.source.digest,
    extractionVersion: EXTRACTION,
    ...p,
    start: 4,
    end: 14,
    quote: p.text.slice(4, 14),
  };
  return { root, lesson, read, command };
}
test("save, duplicate/lost acknowledgement retry, independent overlap, removal and folder copy preserve source bytes", () => {
  const { root, lesson, read, command } = fixture();
  const original = fs.readFileSync(lesson);
  let reply = readingOperation(root, command);
  assert.equal(reply.ok, true, reply.detail);
  assert.equal(reply.view.revision, 1);
  assert.deepEqual(readingOperation(root, command), reply);
  assert.equal(
    readingOperation(root, { ...command, id: randomUUID(), revision: 1 }).view.marks.length,
    1,
  );
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), "reading-copy-"));
  roots.push(copy);
  fs.cpSync(root, copy, { recursive: true });
  assert.deepEqual(readingOperation(copy, { operation: "read", moduleId: "00-tray" }), read());
  reply = readingOperation(root, {
    ...command,
    id: randomUUID(),
    revision: 1,
    start: 0,
    end: 14,
    quote: command.text.slice(0, 14),
  });
  assert.equal(reply.view.marks.length, 2);
  const remove = { operation: "remove", moduleId: "00-tray", id: command.id, revision: 2 };
  reply = readingOperation(root, remove);
  assert.equal(reply.view.marks.length, 1);
  assert.deepEqual(readingOperation(root, remove), reply);
  assert.deepEqual(fs.readFileSync(lesson), original);
  assert.equal(fs.existsSync(path.join(root, "tutor/progress.json")), false);
  assert.equal(fs.existsSync(path.join(root, "tutor/quiz-bank.json")), false);
});
test("strict source, range, revision and identity conflicts preserve committed records", () => {
  const { root, lesson, command } = fixture();
  assert.equal(readingOperation(root, { ...command, quote: "wrong" }).ok, false);
  assert.equal(
    readingOperation(root, { ...command, text: "invented", start: 0, end: 3, quote: "inv" }).ok,
    false,
  );
  assert.equal(readingOperation(root, command).ok, true);
  assert.equal(
    readingOperation(root, { ...command, start: 0, quote: command.text.slice(0, 14) }).ok,
    false,
  );
  assert.equal(
    readingOperation(root, {
      ...command,
      id: randomUUID(),
      end: 15,
      quote: command.text.slice(4, 15),
    }).ok,
    false,
  );
  fs.appendFileSync(lesson, "\nChanged.");
  assert.equal(readingOperation(root, { ...command, id: randomUUID(), revision: 1 }).ok, false);
});
test("insertions relocate uniquely, changed/duplicate/deleted modules retain unmatched quotes", () => {
  const { root, lesson, read, command } = fixture();
  assert.equal(readingOperation(root, command).ok, true);
  const text = fs.readFileSync(lesson, "utf8");
  fs.writeFileSync(lesson, text.replace("## Rule", "Earlier prose.\n\n## Rule"));
  assert.deepEqual(read().view.matches[command.id], { index: 1, changed: true });
  for (const value of [
    text.replace("unchanged", "changed"),
    text + "\nOne **collection** leaves the shelf unchanged.\n",
  ]) {
    fs.writeFileSync(lesson, value);
    assert.equal(read().view.matches[command.id], null);
  }
  fs.rmSync(path.dirname(lesson), { recursive: true });
  const reply = read();
  assert.equal(reply.view.matches[command.id], null);
  assert.equal(reply.view.marks[0].quote, command.quote);
});
test("legacy, unknown, corrupt, external-write and source-race paths do not overwrite records", () => {
  const { root, lesson, command } = fixture();
  const capability = path.join(root, "reading-capability.json");
  fs.unlinkSync(capability);
  assert.equal(readingOperation(root, command).ok, false);
  assert.equal(fs.existsSync(path.join(root, "tutor")), false);
  fs.writeFileSync(capability, JSON.stringify({ schemaVersion: 1, reading: "passage-marks-v1" }));
  assert.equal(
    readingOperation(root, command, { beforeCommit: () => fs.appendFileSync(lesson, "\nEdit") }).ok,
    false,
  );
  assert.equal(fs.existsSync(path.join(root, "tutor/reading-marks.json")), false);
  const bytes = '{"schemaVersion":99}';
  fs.writeFileSync(path.join(root, "tutor/reading-marks.json"), bytes);
  assert.equal(readingOperation(root, command).ok, false);
  assert.equal(fs.readFileSync(path.join(root, "tutor/reading-marks.json"), "utf8"), bytes);
});
test("linked record and linked curriculum paths are refused", () => {
  const { root, lesson, command } = fixture();
  fs.mkdirSync(path.join(root, "tutor"));
  const outside = path.join(root, "outside.json");
  fs.writeFileSync(outside, "{}");
  fs.linkSync(outside, path.join(root, "tutor/reading-marks.json"));
  assert.equal(readingOperation(root, command).ok, false);
  assert.equal(fs.readFileSync(outside, "utf8"), "{}");
  fs.unlinkSync(path.join(root, "tutor/reading-marks.json"));
  fs.linkSync(lesson, path.join(root, "copy.md"));
  assert.equal(readingOperation(root, command).ok, false);
});
test("extraction keeps UTF16 and inline link/emphasis text; teaching blocks remain outside marks", () => {
  const source =
    "# Meaning\n\nA **bold** [link](BRIEF.md), `code`, &amp; \u{1f600}.\n\n- List\n\n```js\ncode\n```\n\n<table><tr><td>HTML</td></tr></table>";
  assert.deepEqual(extractPassages(source), [
    { index: 0, heading: "Meaning", text: "A bold link, code, & \u{1f600}." },
  ]);
});
