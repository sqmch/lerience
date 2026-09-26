import { READING_CHANNEL } from "../../src/shared/ipc";
// Finite hidden acceptance through real CourseCreator, preload and utility writer.
import { app, BrowserWindow, ipcMain } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { CourseCreator, HostGitRunner } from "../../src/main/course-creator";
import { ReadingService } from "../../src/main/reading-service";
import { ElectronUtilityProcessRunner } from "../../src/main/scripts/utility-process-runner";
import type { ReadingCommand, ReadingReply } from "../../src/shared/reading";
const workspace = process.cwd();
const evidence = fs.mkdtempSync(path.join(os.tmpdir(), "lerience-reading-native-"));
app.setPath("userData", path.join(evidence, "app-data"));
fs.mkdirSync(path.join(workspace, "out"), { recursive: true });
fs.writeFileSync(path.join(workspace, "out/reading-location.txt"), evidence);
const log = (record: object) => {
  fs.appendFileSync(path.join(evidence, "capture.jsonl"), JSON.stringify(record) + "\n");
  console.log(JSON.stringify(record));
};
const fail = (error: unknown) => {
  log({ failed: error instanceof Error ? error.stack : String(error) });
  app.exit(1);
};
process.on("uncaughtException", fail);
process.on("unhandledRejection", fail);
app.on("window-all-closed", () => {});
const deadline = setTimeout(() => fail("Native reading deadline exceeded"), 120000);
void app
  .whenReady()
  .then(async () => {
    const creator = new CourseCreator({
      courseTemplateRoot: path.join(workspace, "course-engine/template"),
      git: new HostGitRunner(),
    });
    const created = await creator.create({ parentDirectory: evidence, name: "Synthetic reading" });
    let currentRoot = created.rootPath;
    const moduleId = "00-reading",
      lessonRelative = `curriculum/${moduleId}/LESSON.md`;
    fs.mkdirSync(path.join(currentRoot, "curriculum", moduleId), { recursive: true });
    fs.mkdirSync(path.join(currentRoot, "tutor"), { recursive: true });
    const markdown =
      "# Reading\n\n## Rule\n\nA **collection** leaves the waiting shelf unchanged.\n";
    fs.writeFileSync(path.join(currentRoot, lessonRelative), markdown);
    fs.writeFileSync(path.join(currentRoot, "tutor/progress.json"), "{}\n");
    fs.writeFileSync(path.join(currentRoot, "tutor/quiz-bank.json"), "[]\n");
    const utility = new ElectronUtilityProcessRunner();
    const service = new ReadingService(
      {
        async run(request) {
          const result = await utility.run(request);
          log({
            stage: "writer",
            termination: result.termination,
            exitCode: result.exitCode,
            bytes: Buffer.byteLength(result.stdout),
          });
          return result;
        },
      },
      (root) => root === currentRoot,
    );
    let drop = false;
    ipcMain.handle(READING_CHANNEL, async (_event, expected: unknown, input: unknown) => {
      assert.equal(expected, currentRoot);
      const reply = await service.execute(currentRoot, input);
      if (drop) {
        drop = false;
        return { ok: false, detail: "Synthetic lost acknowledgement after commit." };
      }
      return reply;
    });
    const createWindow = async () => {
      const window = new BrowserWindow({
        show: false,
        webPreferences: {
          preload: path.join(workspace, "out/preload/index.cjs"),
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      window.webContents.on("preload-error", (_event, _path, error) =>
        log({ preloadError: String(error) }),
      );
      window.webContents.on("console-message", (_event, _level, message) =>
        log({ renderer: message }),
      );
      await window.loadURL(
        "data:text/html,<html><body>Disposable reading acceptance</body></html>",
      );
      return window;
    };
    let window = await createWindow();
    const invoke = async (command: ReadingCommand): Promise<ReadingReply> =>
      (await window.webContents.executeJavaScript(
        `window.praxeum.reading(${JSON.stringify(currentRoot)},${JSON.stringify(command)})`,
      )) as ReadingReply;
    const initial = await invoke({ operation: "read", moduleId });
    assert.equal(initial.ok, true);
    assert.ok(initial.view.source);
    const passage = initial.view.source.passages[0]!;
    const command: ReadingCommand = {
      operation: "add",
      moduleId,
      id: randomUUID(),
      revision: 0,
      sourceDigest: initial.view.source.digest,
      extractionVersion: "marked18-prose-v1",
      ...passage,
      start: 2,
      end: 12,
      quote: passage.text.slice(2, 12),
    };
    drop = true;
    assert.equal((await invoke(command)).ok, false);
    const saved = await invoke(command);
    assert.equal(saved.ok, true);
    assert.equal(saved.view.marks.length, 1);
    window.destroy();
    window = await createWindow();
    assert.deepEqual(await invoke({ operation: "read", moduleId }), saved);
    const original = currentRoot;
    currentRoot = path.join(evidence, "copied-course");
    fs.cpSync(original, currentRoot, { recursive: true });
    assert.deepEqual(await invoke({ operation: "read", moduleId }), saved);
    fs.unlinkSync(path.join(currentRoot, lessonRelative));
    const missing = await invoke({ operation: "read", moduleId });
    assert.equal(missing.ok, true);
    assert.equal(missing.view.matches[command.id], null);
    assert.equal(missing.view.marks[0]?.quote, command.quote);
    const removed = await invoke({ operation: "remove", moduleId, id: command.id, revision: 1 });
    assert.equal(removed.ok, true);
    assert.equal(removed.view.marks.length, 0);
    assert.equal(fs.readFileSync(path.join(original, lessonRelative), "utf8"), markdown);
    for (const folder of [original, currentRoot]) {
      assert.equal(fs.readFileSync(path.join(folder, "tutor/progress.json"), "utf8"), "{}\n");
      assert.equal(fs.readFileSync(path.join(folder, "tutor/quiz-bank.json"), "utf8"), "[]\n");
    }
    log({
      passed: true,
      electron: process.versions.electron,
      node: process.versions.node,
      checks: [
        "new CourseCreator course",
        "real preload",
        "utility writer",
        "lost acknowledgement same-ID retry",
        "hidden window reopen",
        "folder copy without app-data",
        "missing source quote retained",
        "remove",
        "original lesson/progress/quiz bytes unchanged",
        "no provider integration",
      ],
    });
    window.destroy();
    clearTimeout(deadline);
    app.exit(0);
  })
  .catch(fail);
