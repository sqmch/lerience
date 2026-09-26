// Opt-in, hidden native acceptance using only freshly created synthetic courses.
import { app, BrowserWindow, ipcMain } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { CourseCreator, HostGitRunner } from "../../src/main/course-creator";
import { AssessmentService } from "../../src/main/assessment-service";
import { ElectronUtilityProcessRunner } from "../../src/main/scripts/utility-process-runner";
import { ASSESSMENT_CHANNEL } from "../../src/shared/ipc";
import type { AssessmentCommand, AssessmentReply } from "../../src/shared/assessment";
import { fixtureQuestion } from "../renderer-harness/assessment-store";

const workspace = process.cwd();
const evidence = fs.mkdtempSync(path.join(os.tmpdir(), "lerience-assessment-native-"));
app.setPath("userData", path.join(evidence, "app-data"));
fs.mkdirSync(path.join(workspace, "out"), { recursive: true });
fs.writeFileSync(path.join(workspace, "out/assessment-location.txt"), evidence);
const log = (value: object) => {
  fs.appendFileSync(path.join(evidence, "capture.jsonl"), JSON.stringify(value) + "\n");
  console.log(JSON.stringify(value));
};
const failure = (error: unknown) => {
  log({ failed: error instanceof Error ? error.stack : String(error) });
  app.exit(1);
};
process.on("uncaughtException", failure);
process.on("unhandledRejection", failure);
app.on("window-all-closed", () => {
  /* The probe deliberately reopens a hidden window. */
});
const deadline = setTimeout(() => failure("Native assessment deadline exceeded"), 120000);
void app
  .whenReady()
  .then(async () => {
    log({ stage: "ready" });
    const creator = new CourseCreator({
      courseTemplateRoot: path.join(workspace, "course-engine/template"),
      git: new HostGitRunner(),
    });
    const created = await creator.create({
      parentDirectory: evidence,
      name: "Synthetic assessment",
    });
    log({ stage: "created" });
    let currentRoot = created.rootPath;
    const moduleId = "00-token-bin";
    const directory = path.join(currentRoot, "curriculum", moduleId);
    fs.mkdirSync(directory, { recursive: true });
    const question = fixtureQuestion(moduleId);
    question.prompt = "Synthetic transport exercise. " + "Read the stated bin rule. ".repeat(350);
    question.fields = [
      question.fields[0]!,
      ...Array.from({ length: 9 }, (_, n) => ({
        id: `explain-${n}`,
        kind: "explanation" as const,
        label: `Explanation ${n + 1}`,
        units: "",
      })),
    ];
    fs.writeFileSync(path.join(directory, "assessment.json"), JSON.stringify(question));
    fs.writeFileSync(
      path.join(directory, "assessment-key.json"),
      JSON.stringify({ schemaVersion: 1, questionId: "trace", version: 1, answers: { add: 5 } }),
    );
    let sends = 0;
    const nativeRunner = new ElectronUtilityProcessRunner();
    const service = new AssessmentService(
      {
        async run(request) {
          const result = await nativeRunner.run(request);
          log({
            operation: request.args[2],
            termination: result.termination,
            exitCode: result.exitCode,
            bytes: Buffer.byteLength(result.stdout),
          });
          return result;
        },
      },
      async () => {
        sends++;
        throw new Error("No provider in this storage acceptance");
      },
      (r) => r === currentRoot,
    );
    ipcMain.handle(ASSESSMENT_CHANNEL, async (_event, root: unknown, command: unknown) =>
      root === currentRoot
        ? await service.execute(currentRoot, command)
        : { ok: false, detail: "Course changed" },
    );
    let window = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.join(workspace, "out/preload/index.cjs"),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    await window.loadURL(
      "data:text/html,<html><body>Disposable assessment IPC acceptance</body></html>",
    );
    const invoke = async (command: AssessmentCommand): Promise<AssessmentReply> =>
      (await window.webContents.executeJavaScript(
        `window.praxeum.assessment(${JSON.stringify(currentRoot)},${JSON.stringify(command)})`,
      )) as AssessmentReply;
    const read = await invoke({ operation: "read", moduleId });
    assert.equal(read.ok, true);
    assert.ok(read.view.sourceDigest);
    const id = randomUUID();
    const raw = Object.fromEntries(
      question.fields.map((f) => [f.id, f.kind === "integer" ? "5" : "a".repeat(3900)]),
    );
    const command: AssessmentCommand = {
      operation: "save",
      moduleId,
      id,
      sourceDigest: read.view.sourceDigest,
      revision: 0,
      raw,
      help: "unknown",
      revisesAttemptId: null,
    };
    assert.ok(JSON.stringify(command).length > 32768);
    let saved = await invoke(command);
    assert.equal(saved.ok, true);
    assert.equal(saved.view.attempts[0]?.raw["explain-0"], raw["explain-0"]);
    const submit: AssessmentCommand = {
      operation: "submit",
      moduleId,
      id,
      sourceDigest: read.view.sourceDigest,
      revision: 1,
    };
    const submitted = await invoke(submit);
    assert.equal(submitted.ok, true);
    assert.deepEqual(await invoke(submit), submitted);
    assert.equal(sends, 0);
    window.destroy();
    window = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.join(workspace, "out/preload/index.cjs"),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    await window.loadURL("data:text/html,<html><body>Reopened</body></html>");
    assert.deepEqual(await invoke({ operation: "read", moduleId }), submitted);
    const originalRoot = currentRoot;
    currentRoot = path.join(evidence, "copied-course");
    fs.cpSync(originalRoot, currentRoot, { recursive: true });
    assert.deepEqual(await invoke({ operation: "read", moduleId }), submitted);
    let lastBytes = 0;
    let count = 1;
    for (let n = 0; n < 40; n++) {
      saved = await invoke({ ...command, id: randomUUID() });
      if (!saved.ok) {
        assert.match(saved.detail, /storage display limit/);
        break;
      }
      lastBytes = Buffer.byteLength(JSON.stringify(saved));
      count = saved.view.attempts.length;
    }
    assert.ok(lastBytes > 1024 * 1024);
    assert.ok(lastBytes < 1536 * 1024);
    const final = await invoke({ operation: "read", moduleId });
    assert.equal(final.ok, true);
    assert.equal(final.view.attempts.length, count);
    assert.equal(fs.existsSync(path.join(currentRoot, "tutor/progress.json")), false);
    assert.equal(fs.existsSync(path.join(currentRoot, "tutor/quiz-bank.json")), false);
    log({
      passed: true,
      electron: process.versions.electron,
      node: process.versions.node,
      payloadCharacters: JSON.stringify(command).length,
      replyBytes: lastBytes,
      attempts: count,
      checks: [
        "new CourseCreator course",
        "real preload IPC",
        "Electron utility writer",
        "large structured input",
        "immutable idempotent submission",
        "window reopen",
        "copied course without old app-data",
        "near-limit acknowledged IPC reply",
        "precommit reply quota",
        "no provider/progress/quiz writes",
      ],
    });
    window.destroy();
    clearTimeout(deadline);
    app.exit(0);
  })
  .catch(failure);
