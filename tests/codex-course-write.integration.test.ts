import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createCodexAppServerFactory } from "../src/main/provider/codex-app-server";
import {
  CODEX_COURSE_SANDBOX_CONFIG,
  verifyCodexCourseWrite,
} from "../src/main/provider/codex-course-write";
import { discoverInstalledProviderRuntime } from "../src/main/provider/installed-runtime";
import { createRuntimeEnvironment, resolveRuntimeLayout } from "../src/main/runtime-layout";

// Explicit native acceptance, never dependent on personal courses or credentials in CI.
const resourcesPath = process.env.LERIENCE_CODEX_ACCEPTANCE_RESOURCES;
describe.skipIf(resourcesPath === undefined)("installed Codex course write capability", () => {
  it("writes through the packaged provider environment and refuses a sibling write", async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "lerience-provider-acceptance-"));
    const courseDir = path.join(base, "Course with space and 'quote");
    fs.mkdirSync(courseDir);
    const runtime = resolveRuntimeLayout({ packaged: true, resourcesPath: resourcesPath! });
    const executable =
      process.env.LERIENCE_CODEX_ACCEPTANCE_EXECUTABLE ??
      discoverInstalledProviderRuntime("codex").executablePath;
    expect(executable).not.toBeNull();
    const client = createCodexAppServerFactory({
      executable: executable!,
      clientVersion: "0.0.10",
      environment: createRuntimeEnvironment(
        runtime.toolDirectories,
        process.env,
        process.platform,
        path.join(path.dirname(resourcesPath!), "Lerience.exe"),
      ),
    })(courseDir);
    try {
      await client.initialize();
      const response = (await client.request("thread/start", {
        cwd: courseDir,
        sandbox: "workspace-write",
        config: CODEX_COURSE_SANDBOX_CONFIG,
        approvalPolicy: "never",
        ephemeral: true,
      })) as { cwd: string; sandbox: unknown };
      await verifyCodexCourseWrite(client, courseDir, response);
      expect(fs.readdirSync(courseDir)).toEqual([]);
      const target = path.join(base, "outside.txt");
      const result = (await client
        .request("command/exec", {
          cwd: courseDir,
          sandboxPolicy: response.sandbox,
          command: [
            executable!,
            "--codex-run-as-apply-patch",
            `*** Begin Patch\n*** Add File: ${target}\n+outside\n*** End Patch`,
          ],
          timeoutMs: 10_000,
        })
        .catch(() => null)) as { exitCode: number } | null;
      expect(result?.exitCode).not.toBe(0);
      expect(fs.existsSync(target)).toBe(false);
      const resultInside = (await client.request("command/exec", {
        cwd: courseDir,
        sandboxPolicy: response.sandbox,
        command: [
          executable!,
          "--codex-run-as-apply-patch",
          "*** Begin Patch\n*** Add File: COURSE.md\n+test\n*** End Patch",
        ],
        timeoutMs: 10_000,
      })) as { exitCode: number };
      expect(resultInside.exitCode).toBe(0);
      expect(fs.readFileSync(path.join(courseDir, "COURSE.md"), "utf8")).toBe("test\n");
    } finally {
      client.close();
      await fs.promises.rm(base, { recursive: true, force: true, maxRetries: 10 });
    }
  }, 90_000);
});
