// Opt-in native acceptance. Synthetic courses only; no installed app or provider configuration changes.
import { app } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { query, type Query } from "@anthropic-ai/claude-agent-sdk";
import { ClaudeTutorAgent } from "../../src/main/agent/claude";
import { CodexTutorAgent } from "../../src/main/agent/codex";
import {
  createCodexAppServerFactory,
  type CodexAppServerConnection,
} from "../../src/main/provider/codex-app-server";
import { discoverInstalledProviderRuntime } from "../../src/main/provider/installed-runtime";
import { SessionConductor } from "../../src/main/session/conductor";
import { FileControlMemory } from "../../src/main/session/control-memory";
import type { AgentEvent, TutorAgent } from "../../src/shared/seminar";
import { runBoundedProbe } from "../recovery/deadline";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "lerience-context-usage-"));
app.setPath("userData", path.join(root, "electron"));
const log = (record: object): void => {
  fs.appendFileSync(path.join(root, "capture.jsonl"), `${JSON.stringify(record)}\n`);
  console.log(JSON.stringify(record));
};
process.on("uncaughtException", (error) => {
  log({ failed: error.message });
  app.exit(1);
});
process.on("unhandledRejection", (error) => {
  log({ failed: String(error) });
  app.exit(1);
});

async function run(providerId: "claude" | "codex"): Promise<void> {
  const courseDir = path.join(root, providerId);
  fs.mkdirSync(courseDir);
  fs.writeFileSync(
    path.join(courseDir, "CLAUDE.md"),
    "Synthetic context-usage acceptance fixture. For any session opener, reply exactly CONTEXT_OK. Do not use tools, read files, or perform course work.",
  );
  const executable = discoverInstalledProviderRuntime(providerId).executablePath;
  assert.ok(executable, "Provider-owned executable must be installed");
  log({
    providerId,
    version: execFileSync(executable, ["--version"], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 10000,
    }).trim(),
  });
  const queries: Query[] = [];
  const clients: CodexAppServerConnection[] = [];
  let firstInputs = 0;
  let turnModel: unknown = null;
  const factory = createCodexAppServerFactory({ executable, clientVersion: "0.0.14" });
  const agent: TutorAgent =
    providerId === "claude"
      ? new ClaudeTutorAgent(
          (options) => {
            const prompt = options.prompt;
            assert.notEqual(typeof prompt, "string");
            const handle = query({
              ...options,
              prompt: (async function* () {
                for await (const input of prompt as Exclude<typeof prompt, string>) {
                  firstInputs++;
                  yield input;
                }
              })(),
            });
            const context = handle.getContextUsage.bind(handle);
            handle.getContextUsage = async () => {
              const usage = await context();
              log({
                providerId,
                rawContext: {
                  totalTokens: usage.totalTokens,
                  rawMaxTokens: usage.rawMaxTokens,
                  model: usage.model,
                },
              });
              return usage;
            };
            queries.push(handle);
            return handle;
          },
          undefined,
          executable,
        )
      : new CodexTutorAgent((cwd) => {
          const client = factory(cwd);
          clients.push(client);
          client.onNotification((method, params) => {
            if (method === "thread/tokenUsage/updated") log({ providerId, rawTokenUsage: params });
          });
          const request = client.request.bind(client);
          client.request = (method, params, timeout) => {
            if (method === "turn/start") {
              firstInputs++;
              turnModel = (params as { model?: unknown }).model;
            }
            return request(method, params, timeout);
          };
          return client;
        });
  const events: AgentEvent[] = [];
  const userDataPath = path.join(root, `${providerId}-appdata`);
  const conductor = new SessionConductor({
    createAgent: () => agent,
    userDataPath,
    controlMemory: new FileControlMemory(userDataPath),
    scripts: {
      inspectContext: async () => ({
        doctor: { available: true, value: [] },
        due: { available: true, value: "None" },
        journalTail: { available: true, value: "Synthetic fixture, no prior study." },
        currentModuleId: null,
      }),
      runChecks: async () => ({ outcome: "no-checks", total: 0, passed: 0, failed: 0 }),
    },
    emitAgentEvent: (event) => {
      events.push(event);
      if (
        event.type === "context_usage" ||
        event.type === "error" ||
        event.type === "turn_complete"
      )
        log({ providerId, event });
    },
    emitSnapshot: () => undefined,
  });
  await runBoundedProbe(
    async () => {
      assert.deepEqual(
        await conductor.start({ courseDir, currentModuleId: null, onboarding: true }),
        { ok: true },
      );
      const prepared = await conductor.current(courseDir);
      assert.ok(prepared.modelChoice);
      assert.equal(prepared.turnInProgress, false);
      assert.equal(firstInputs, 0);
      const before = await conductor.sessionControls();
      assert.ok(before);
      const chosen =
        before.models.find(
          (model) => model.id === (providerId === "claude" ? "sonnet" : "gpt-5.5"),
        ) ?? before.models.find((model) => model.id !== "default");
      assert.ok(chosen, "Native provider must offer a selectable model");
      const staged = await conductor.applySessionControls({ model: chosen.id });
      assert.equal(firstInputs, 0);
      assert.equal({ ...staged?.current, ...staged?.pending }.model, chosen.id);
      log({
        providerId,
        phase: "before-confirmation",
        firstInputs,
        chosen: chosen.id,
        current: staged?.current,
        pending: staged?.pending,
      });
      await conductor.confirmModel(prepared.modelChoice.runtimeId);
      while (!events.some((event) => event.type === "turn_complete")) {
        const error = events.find((event) => event.type === "error");
        if (error) throw new Error(JSON.stringify(error));
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.equal(firstInputs, 1);
      assert.ok(events.some((event) => event.type === "message_delta" && event.delta.length > 0));
      while (!(await conductor.current(courseDir)).contextUsage) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const context = (await conductor.current(courseDir)).contextUsage;
      assert.ok(context && context.usedTokens > 0 && context.capacityTokens > 0);
      log({ providerId, phase: "context-verified", context });
      const after = await conductor.sessionControls();
      assert.equal(after?.current.model, chosen.id);
      assert.equal(after?.pending?.model, undefined);
      log({
        providerId,
        phase: "passed",
        firstInputs,
        chosen: chosen.id,
        turnModel,
        current: after?.current,
      });
    },
    () => {
      queries.forEach((handle) => handle.close());
      clients.forEach((client) => client.close());
    },
    () => conductor.abandon(),
    { workMs: 180000, cleanupMs: 10000 },
  );
}

void app.whenReady().then(async () => {
  fs.writeFileSync(path.resolve("out/context-usage-location.txt"), root);
  log({ versions: process.versions });
  try {
    await run("claude");
    await run("codex");
    app.exit(0);
  } catch (error) {
    log({ failed: String(error) });
    app.exit(1);
  }
});
