import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { expect, it, vi } from "vitest";
vi.mock("electron", () => ({ utilityProcess: { fork: vi.fn() } }));
import { utilityProcess } from "electron";
import { ElectronUtilityProcessRunner } from "../src/main/scripts/utility-process-runner";

it("acknowledges a complete large IPC reply before the worker exits", async () => {
  const child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    postMessage: vi.fn(),
    kill: vi.fn(() => true),
  });
  vi.mocked(utilityProcess.fork).mockReturnValue(child as unknown as Electron.UtilityProcess);
  const input = { raw: "x".repeat(40000) };
  let finished = false;
  const pending = new ElectronUtilityProcessRunner()
    .run({
      entryPoint: "assessment.mjs",
      args: [],
      cwd: "fixture",
      timeoutMs: 1000,
      maxOutputBytes: 2 * 1024 * 1024,
      serviceName: "test",
      input,
      ipcReply: true,
    })
    .then((result) => {
      finished = true;
      return result;
    });
  child.emit("spawn");
  expect(child.postMessage).toHaveBeenCalledWith(input);
  const output = JSON.stringify({ history: "y".repeat(1500000) });
  child.emit("message", output);
  await Promise.resolve();
  expect(finished).toBe(false);
  expect(child.postMessage).toHaveBeenLastCalledWith("reply-received");
  child.emit("exit", 0);
  const result = await pending;
  expect(result.termination).toBe("exit");
  expect(result.stdout).toBe(output);
  expect(JSON.parse(result.stdout)).toEqual({ history: "y".repeat(1500000) });
});
