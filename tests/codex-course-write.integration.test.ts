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
import {
  createRuntimeEnvironment,
  resolveRuntimeLayout,
  resolvePackagedRuntimeRoot,
} from "../src/main/runtime-layout";
import { CodexAgentSession } from "../src/main/agent/codex";

// Explicit native acceptance, never dependent on personal courses or credentials in CI.
const resourcesPath = process.env.LERIENCE_CODEX_ACCEPTANCE_RESOURCES;
describe.skipIf(resourcesPath === undefined)("installed Codex course write capability", () => {
  it("keeps explicit Full access across turns and restores the course sandbox", async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "lerience-access-acceptance-"));
    const courseDir = path.join(base, "course");
    fs.mkdirSync(courseDir);
    const runtime = process.env.LERIENCE_CODEX_ACCEPTANCE_RUNTIME_ROOT
      ? resolvePackagedRuntimeRoot(
          process.env.LERIENCE_CODEX_ACCEPTANCE_RUNTIME_ROOT,
          "win32",
          "x64",
        )
      : resolveRuntimeLayout({ packaged: true, resourcesPath: resourcesPath! });
    const executable =
      process.env.LERIENCE_CODEX_ACCEPTANCE_EXECUTABLE ??
      discoverInstalledProviderRuntime("codex").executablePath;
    expect(executable).not.toBeNull();
    const factory = createCodexAppServerFactory({
      executable: executable!,
      clientVersion: "0.0.11",
      environment: createRuntimeEnvironment(
        runtime.toolDirectories,
        process.env,
        process.platform,
        process.env.LERIENCE_CODEX_ACCEPTANCE_ELECTRON ??
          path.join(path.dirname(resourcesPath!), "Lerience.exe"),
      ),
    });
    const session = new CodexAgentSession(
      courseDir,
      "This is a synthetic access acceptance check. Only touch the explicit fixture paths requested by the user.",
      factory,
    );
    const iterator = session.events[Symbol.asyncIterator]();
    const turn = async (message: string) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const completed = (async () => {
        let ranShell = false;
        while (true) {
          const { value: event, done } = await iterator.next();
          if (done) throw new Error("Session ended before completing acceptance.");
          if (event.type === "approval_request")
            throw new Error("Never ask emitted an approval request.");
          if (event.type === "error") throw new Error(`Provider acceptance failed: ${event.code}`);
          if (event.type === "tool_activity" && event.name === "Shell") ranShell = true;
          if (event.type === "turn_complete") return ranShell;
        }
      })();
      session.send(message);
      try {
        expect(
          await Promise.race([
            completed,
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error("Access acceptance timed out.")), 90_000);
            }),
          ]),
        ).toBe(true);
      } finally {
        clearTimeout(timer);
      }
    };
    try {
      expect((await session.describeControls()).current.access).toBe("workspace-write");
      await session.applyControls({ access: "danger-full-access", autonomy: "never" });
      expect((await session.describeControls()).pending?.access).toBe("danger-full-access");
      for (const name of ["first.txt", "second.txt"]) {
        const target = path.join(base, name);
        await turn(
          `Use the shell command tool to write exactly accepted to the file ${JSON.stringify(target)}. This is an explicitly authorized synthetic fixture outside the course. Do not touch any other file. Then stop.`,
        );
        expect(fs.readFileSync(target, "utf8").trim()).toBe("accepted");
        expect((await session.describeControls()).current.access).toBe("danger-full-access");
      }
      await session.applyControls({ access: "workspace-write" });
      const blocked = path.join(base, "blocked.txt");
      await turn(
        `Use the shell command tool to attempt once to write accepted to ${JSON.stringify(blocked)}. This synthetic probe is expected to fail after restoring course-only access. Do not retry, request elevation, or change permissions. Then stop.`,
      );
      expect(fs.existsSync(blocked)).toBe(false);
      expect((await session.describeControls()).current.access).toBe("workspace-write");
      const fresh = new CodexAgentSession(
        courseDir,
        "Synthetic fresh-session access check.",
        factory,
      );
      try {
        expect((await fresh.describeControls()).current.access).toBe("workspace-write");
      } finally {
        await fresh.end();
      }
    } finally {
      await session.end();
      await fs.promises.rm(base, { recursive: true, force: true, maxRetries: 10 });
    }
  }, 300_000);

  it("runs a course command after selecting the offered Never ask control without approvals", async () => {
    const courseDir = fs.mkdtempSync(path.join(os.tmpdir(), "lerience-autonomy-acceptance-"));
    const runtime = resolveRuntimeLayout({ packaged: true, resourcesPath: resourcesPath! });
    const executable =
      process.env.LERIENCE_CODEX_ACCEPTANCE_EXECUTABLE ??
      discoverInstalledProviderRuntime("codex").executablePath;
    expect(executable).not.toBeNull();
    const session = new CodexAgentSession(
      courseDir,
      "This is a synthetic course acceptance check.",
      createCodexAppServerFactory({
        executable: executable!,
        clientVersion: "0.0.11",
        environment: createRuntimeEnvironment(
          runtime.toolDirectories,
          process.env,
          process.platform,
          path.join(path.dirname(resourcesPath!), "Lerience.exe"),
        ),
      }),
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const controls = await session.describeControls();
      const option = controls.autonomy.find((choice) => choice.skipsApprovalPrompts);
      expect(option?.id).toBe("never");
      await session.applyControls({ autonomy: option!.id });
      const completed = (async () => {
        let commandRan = false;
        for await (const event of session.events) {
          if (event.type === "approval_request")
            throw new Error("Never ask emitted an approval request.");
          if (event.type === "error") throw new Error(`Provider acceptance failed: ${event.code}`);
          if (event.type === "tool_activity" && event.name === "Shell") commandRan = true;
          if (event.type === "turn_complete") return commandRan;
        }
        throw new Error("Provider ended before completing the command.");
      })();
      session.send(
        "Run a shell command in this course folder that writes the text accepted to autonomy-proof.txt. Use the shell command tool, not apply_patch. Do not read or write outside this folder. Then stop.",
      );
      expect(
        await Promise.race([
          completed,
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("Provider acceptance timed out.")), 90_000);
          }),
        ]),
      ).toBe(true);
      expect(fs.readFileSync(path.join(courseDir, "autonomy-proof.txt"), "utf8").trim()).toBe(
        "accepted",
      );
      expect((await session.describeControls()).current.autonomy).toBe("never");
    } finally {
      clearTimeout(timer);
      await session.end();
      await fs.promises.rm(courseDir, { recursive: true, force: true, maxRetries: 10 });
    }
  }, 120_000);

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
