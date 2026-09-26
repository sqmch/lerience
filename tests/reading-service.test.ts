import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { ReadingService } from "../src/main/reading-service";
import type { ProcessRunner } from "../src/main/scripts/process-runner";
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
const runner: ProcessRunner = {
  run(request) {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [request.entryPoint, ...request.args], {
        cwd: request.cwd,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "",
        stderr = "";
      child.stdout.on("data", (c) => (stdout += String(c)));
      child.stderr.on("data", (c) => (stderr += String(c)));
      child.on("error", reject);
      child.on("close", (exitCode) => resolve({ termination: "exit", exitCode, stdout, stderr }));
      child.stdin.end(JSON.stringify(request.input));
    });
  },
};
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "reading-service-"));
  roots.push(root);
  fs.cpSync(path.resolve("course-engine/template"), root, { recursive: true });
  fs.writeFileSync(
    path.join(root, ".praxeum.json"),
    JSON.stringify({ courseId: randomUUID(), formatVersion: 0 }),
  );
  fs.mkdirSync(path.join(root, "curriculum/00-rule"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "curriculum/00-rule/LESSON.md"),
    "# Rule\n\nKeep the shelf unchanged.\n",
  );
  return root;
}
it("validates before transport, refuses inactive/legacy courses, and preserves same identity after lost reply", async () => {
  const root = fixture();
  let active = true,
    drop = false;
  const requests: unknown[] = [];
  const run = vi.fn(async (request: Parameters<ProcessRunner["run"]>[0]) => {
    requests.push(request.input);
    const result = await runner.run(request);
    return drop ? { ...result, termination: "timeout" as const, exitCode: null } : result;
  });
  const service = new ReadingService({ run }, () => active);
  expect((await service.execute(root, { operation: "add", moduleId: "../../bad" })).ok).toBe(false);
  expect(run).not.toHaveBeenCalled();
  const first = await service.execute(root, { operation: "read", moduleId: "00-rule" });
  if (!first.ok || !first.view.source) throw new Error("No source");
  const p = first.view.source.passages[0]!;
  const command = {
    operation: "add",
    moduleId: "00-rule",
    id: randomUUID(),
    revision: 0,
    sourceDigest: first.view.source.digest,
    extractionVersion: "marked18-prose-v1",
    ...p,
    start: 0,
    end: 4,
    quote: "Keep",
  };
  drop = true;
  expect((await service.execute(root, command)).ok).toBe(false);
  drop = false;
  const retry = await service.execute(root, command);
  expect(retry.ok).toBe(true);
  if (retry.ok) expect(retry.view.marks).toHaveLength(1);
  expect(requests.at(-1)).toEqual(command);
  active = false;
  const n = run.mock.calls.length;
  expect((await service.execute(root, command)).ok).toBe(false);
  expect(run).toHaveBeenCalledTimes(n);
  active = true;
  fs.unlinkSync(path.join(root, "reading-capability.json"));
  expect(await service.execute(root, { operation: "read", moduleId: "00-rule" })).toMatchObject({
    ok: true,
    view: { supported: false },
  });
  expect(run).toHaveBeenCalledTimes(n);
});
