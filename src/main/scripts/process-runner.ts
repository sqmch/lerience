/**
 * The narrow process boundary used by course-owned engine scripts.
 *
 * Electron is deliberately absent from this module. The production adapter
 * lives beside it in `utility-process-runner.ts`; tests inject a deterministic
 * runner and can exercise every parser without booting Electron.
 */

export const CONTEXT_SCRIPT_TIMEOUT_MS = 15_000;
export const CONTEXT_SCRIPT_MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
export const CHECK_TIMEOUT_MS = 120_000;
export const CHECK_MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

export interface ProcessRunRequest {
  /** A JavaScript entry point executed with Electron's bundled Node runtime. */
  entryPoint: string;
  args: readonly string[];
  cwd: string;
  timeoutMs: number;
  maxOutputBytes: number;
  serviceName: string;
}

export type ProcessTermination = "exit" | "timeout" | "output-limit" | "spawn-error";

export interface ProcessRunResult {
  termination: ProcessTermination;
  /** Present only when the child reached its exit event. */
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export interface ProcessRunner {
  run(request: ProcessRunRequest): Promise<ProcessRunResult>;
}
