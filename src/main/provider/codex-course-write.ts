import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { CodexAppServerConnection } from "./codex-app-server";

export const CODEX_COURSE_SANDBOX_CONFIG = {
  "sandbox_workspace_write.writable_roots": [],
  "sandbox_workspace_write.exclude_tmpdir_env_var": true,
  "sandbox_workspace_write.exclude_slash_tmp": true,
};

export class CodexCourseWriteFailure extends Error {
  constructor() {
    super(
      "Codex cannot write to this course folder. Repair or update your Codex installation, then retry the tutor connection. Your course and conversation have been kept.",
    );
    this.name = "CodexCourseWriteFailure";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sameDirectory(left: string, right: string): boolean {
  return path.relative(path.toNamespacedPath(left), path.toNamespacedPath(right)) === "";
}

/** A thread's sandbox label is not evidence that its Windows helpers work.
 * Run a fixed, non-model command through the same App Server sandbox, then
 * observe its bytes ourselves. Only this disposable marker is app-cleaned. */
export async function verifyCodexCourseWrite(
  client: CodexAppServerConnection,
  courseDir: string,
  response: unknown,
): Promise<void> {
  if (
    !isRecord(response) ||
    typeof response.cwd !== "string" ||
    !sameDirectory(courseDir, response.cwd) ||
    !isRecord(response.sandbox) ||
    response.sandbox.type !== "workspaceWrite" ||
    !Array.isArray(response.sandbox.writableRoots) ||
    !response.sandbox.writableRoots.every(
      (root) => typeof root === "string" && sameDirectory(root, courseDir),
    ) ||
    response.sandbox.excludeTmpdirEnvVar !== true ||
    response.sandbox.excludeSlashTmp !== true
  ) {
    throw new CodexCourseWriteFailure();
  }

  const nonce = randomUUID();
  const target = path.join(courseDir, `.lerience-write-check-${nonce}`);
  const content = `lerience:${nonce}`;
  const command =
    process.platform === "win32"
      ? [
          path.join(
            process.env.SystemRoot ?? "C:\\Windows",
            "System32",
            "WindowsPowerShell",
            "v1.0",
            "powershell.exe",
          ),
          "-NoProfile",
          "-NonInteractive",
          "-EncodedCommand",
          Buffer.from(
            `$ErrorActionPreference='Stop'; $f=[IO.File]::Open('${target.replaceAll("'", "''")}',[IO.FileMode]::CreateNew,[IO.FileAccess]::Write); try { $b=[Text.Encoding]::UTF8.GetBytes('${content}'); $f.Write($b,0,$b.Length) } finally { $f.Dispose() }`,
            "utf16le",
          ).toString("base64"),
        ]
      : ["/bin/sh", "-c", 'set -eu; set -C; printf %s "$1" > "$2"', "sh", content, target];

  try {
    const result = await client.request(
      "command/exec",
      {
        command,
        cwd: response.cwd,
        sandboxPolicy: response.sandbox,
        timeoutMs: 15_000,
      },
      30_000,
    );
    if (
      !isRecord(result) ||
      result.exitCode !== 0 ||
      !fs.lstatSync(target).isFile() ||
      fs.readFileSync(target, "utf8") !== content
    ) {
      throw new CodexCourseWriteFailure();
    }
  } catch {
    throw new CodexCourseWriteFailure();
  } finally {
    // Never create COURSE.md or touch any learner-owned content as a fallback.
    fs.rmSync(target, { force: true });
  }
}
