import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { AssessmentService } from "../src/main/assessment-service";
import type { ProcessRunRequest, ProcessRunner } from "../src/main/scripts/process-runner";
import { fixtureQuestion } from "../dev/renderer-harness/assessment-store";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "assessment-service-"));
  roots.push(root);
  fs.cpSync(path.resolve("course-engine/template"), root, { recursive: true });
  fs.writeFileSync(
    path.join(root, ".praxeum.json"),
    JSON.stringify({ courseId: randomUUID(), formatVersion: 0 }),
  );
  const moduleId = "00-token-bin";
  const dir = path.join(root, "curriculum", moduleId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "assessment.json"), JSON.stringify(fixtureQuestion(moduleId)));
  fs.writeFileSync(
    path.join(dir, "assessment-key.json"),
    JSON.stringify({
      schemaVersion: 1,
      questionId: "trace",
      version: 1,
      answers: { add: 5, remove: 1, full: 6, spill: 2 },
    }),
  );
  return { root, moduleId };
}
class NodeRunner implements ProcessRunner {
  requests: ProcessRunRequest[] = [];
  run(request: ProcessRunRequest): ReturnType<ProcessRunner["run"]> {
    this.requests.push(request);
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [request.entryPoint, ...request.args], {
        cwd: request.cwd,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "",
        stderr = "";
      child.stdout.on("data", (c) => {
        stdout += String(c);
      });
      child.stderr.on("data", (c) => {
        stderr += String(c);
      });
      child.once("error", reject);
      child.once("exit", (exitCode) => resolve({ termination: "exit", exitCode, stdout, stderr }));
      child.stdin.end(JSON.stringify(request.input));
    });
  }
}
it("passes answers as structured input and saves before explicit review; refuses cross-course requests", async () => {
  const { root, moduleId } = fixture(),
    runner = new NodeRunner();
  let current = root;
  const sent: string[] = [];
  const service = new AssessmentService(
    runner,
    async (text) => {
      sent.push(text);
    },
    (r) => r === current,
  );
  const view = await service.execute(root, { operation: "read", moduleId });
  expect(view.ok).toBe(true);
  if (!view.ok) throw new Error(view.detail);
  const id = randomUUID();
  let reply = await service.execute(root, {
    operation: "save",
    moduleId,
    id,
    sourceDigest: view.view.sourceDigest,
    revision: 0,
    raw: { add: "5", remove: "1", full: "6", spill: "2", why: "One plus seven is eight." },
    help: "none",
    revisesAttemptId: null,
  });
  expect(reply.ok).toBe(true);
  expect(runner.requests.at(-1)?.args.join(" ")).not.toContain("One plus seven");
  expect(runner.requests.at(-1)?.input).toMatchObject({ raw: { why: "One plus seven is eight." } });
  expect(sent).toEqual([]);
  reply = await service.execute(root, {
    operation: "submit",
    moduleId,
    id,
    sourceDigest: view.view.sourceDigest,
    revision: 1,
  });
  expect(reply.ok).toBe(true);
  expect(sent).toEqual([]);
  const requestId = randomUUID();
  reply = await service.execute(root, { operation: "review", moduleId, id, requestId });
  expect(reply.ok).toBe(true);
  expect(sent).toHaveLength(1);
  expect(sent[0]).toContain(id);
  await service.execute(root, { operation: "review", moduleId, id, requestId });
  expect(sent).toHaveLength(1);
  current = "another course";
  expect((await service.execute(root, { operation: "read", moduleId })).ok).toBe(false);
}, 15000);
it("unknown capability invokes no script and creates no records", async () => {
  const { root, moduleId } = fixture(),
    runner = new NodeRunner();
  fs.writeFileSync(path.join(root, "assessment-capability.json"), '{"schemaVersion":9}');
  const service = new AssessmentService(
    runner,
    async () => {
      throw new Error("Unexpected provider send");
    },
    () => true,
  );
  const read = await service.execute(root, { operation: "read", moduleId });
  expect(read).toMatchObject({ ok: true, view: { state: "unsupported" } });
  expect(runner.requests).toHaveLength(0);
  expect(fs.existsSync(path.join(root, "tutor/assessments"))).toBe(false);
  expect((await service.execute(root, { operation: "read", moduleId: "../escape" })).ok).toBe(
    false,
  );
});
it("interrupted review keeps local submission and records uncertainty without automatic resend", async () => {
  const { root, moduleId } = fixture(),
    runner = new NodeRunner();
  let sends = 0;
  const service = new AssessmentService(
    runner,
    async () => {
      sends++;
      throw new Error("Admission was not confirmed");
    },
    () => true,
  );
  const first = await service.execute(root, { operation: "read", moduleId });
  if (!first.ok) throw new Error(first.detail);
  const id = randomUUID();
  await service.execute(root, {
    operation: "save",
    moduleId,
    id,
    sourceDigest: first.view.sourceDigest,
    revision: 0,
    raw: { add: "5", remove: "1", full: "6", spill: "2", why: "One plus seven is eight." },
    help: "unknown",
    revisesAttemptId: null,
  });
  await service.execute(root, {
    operation: "submit",
    moduleId,
    id,
    sourceDigest: first.view.sourceDigest,
    revision: 1,
  });
  const requestId = randomUUID();
  const result = await service.execute(root, { operation: "review", moduleId, id, requestId });
  expect(result).toMatchObject({ ok: true });
  if (!result.ok) throw new Error(result.detail);
  expect(result.view.attempts[0]?.status).toBe("submitted");
  expect(result.view.attempts[0]?.events.at(-1)?.text).toContain("not confirmed");
  await service.execute(root, { operation: "read", moduleId });
  await service.execute(root, { operation: "review", moduleId, id, requestId });
  expect(sends).toBe(1);
}, 15000);
