/* Electron-only adapter for ProcessRunner. Keep imports of this file out of
   parser/service tests: importing Electron under plain Node is not supported. */

import { utilityProcess } from "electron";
import type { ProcessRunRequest, ProcessRunner, ProcessRunResult } from "./process-runner";

export class ElectronUtilityProcessRunner implements ProcessRunner {
  constructor(private readonly environment?: Readonly<Record<string, string>>) {}

  async run(request: ProcessRunRequest): Promise<ProcessRunResult> {
    return await new Promise((resolve) => {
      let child: Electron.UtilityProcess;
      try {
        child = utilityProcess.fork(request.entryPoint, [...request.args], {
          cwd: request.cwd,
          execArgv: [],
          stdio: ["ignore", "pipe", "pipe"],
          serviceName: request.serviceName,
          ...(this.environment === undefined ? {} : { env: this.environment }),
        });
      } catch {
        resolve(emptyResult("spawn-error"));
        return;
      }

      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let outputBytes = 0;
      let settled = false;
      let forcedTermination: ProcessRunResult["termination"] | null = null;
      const timeoutRef: { value?: NodeJS.Timeout } = {};

      const finish = (result: ProcessRunResult) => {
        if (settled) return;
        settled = true;
        if (timeoutRef.value !== undefined) clearTimeout(timeoutRef.value);
        resolve(result);
      };

      const result = (
        termination: ProcessRunResult["termination"],
        exitCode: number | null,
      ): ProcessRunResult => ({
        termination,
        exitCode,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });

      const terminate = (termination: ProcessRunResult["termination"]) => {
        if (forcedTermination !== null || settled) return;
        forcedTermination = termination;
        // Keep the runner promise pending until the exit event when possible.
        // That makes the service's single-flight flag cover the child's whole
        // lifetime, including the short interval after a timeout signal.
        if (!child.kill()) {
          finish(result(termination, null));
          return;
        }
        // Backstop: if kill() reported success but the exit event never fires
        // (seen with wedged children on Windows), a pending promise would pin
        // the service's single-flight flag until app restart.
        setTimeout(() => {
          finish(result(termination, null));
        }, 10_000);
      };

      const capture = (target: Buffer[]) => (chunk: string | Buffer) => {
        if (settled || forcedTermination !== null) return;
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        outputBytes += bytes.byteLength;
        if (outputBytes > request.maxOutputBytes) {
          terminate("output-limit");
          return;
        }
        target.push(bytes);
      };

      child.stdout?.on("data", capture(stdout));
      child.stderr?.on("data", capture(stderr));
      child.once("error", () => terminate("spawn-error"));
      child.once("exit", (exitCode) => {
        const termination = forcedTermination ?? "exit";
        finish(result(termination, termination === "exit" ? exitCode : null));
      });

      timeoutRef.value = setTimeout(() => {
        terminate("timeout");
      }, request.timeoutMs);
    });
  }
}

function emptyResult(termination: ProcessRunResult["termination"]): ProcessRunResult {
  return { termination, exitCode: null, stdout: "", stderr: "" };
}
