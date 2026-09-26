// Opt-in native experiment. Never launched by the app or normal test suite.
import { app } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { ClaudeTutorAgent } from "../../src/main/agent/claude";
import { SessionConductor } from "../../src/main/session/conductor";
import { FileTranscriptStore } from "../../src/main/session/transcript-store";
import { createEngineScriptService } from "../../src/main/scripts/engine-script-service";
import { ElectronUtilityProcessRunner } from "../../src/main/scripts/utility-process-runner";
import { runBoundedProbe } from "./deadline";

const candidate = `
**Closing interrupted work:** a session close records what happened; it does not finish an
unfinished generation job. Reconcile actual learning from the conversation and course files,
even when no files changed. Preserve independent answers, assistance, unresolved gaps and
unattempted transfer honestly. Seed only concepts actually covered, without duplicating
existing seeds or grades. Record unfinished material and each outstanding QA/review step in
the relevant module's progress notes and a concise journal entry. Keep that material pending
and explicitly unreviewed; do not mark it ready, reviewed or completed. During close, defer
further generation, reference solutions, dependency setup, QA and learner's-eye review for
material merely left pending. Do only the work needed to reconcile learning records, commit
the actual state and pass doctor. At the next session, make pending work visible and let the
learner choose whether to continue it. The QA and review gates still apply before handover.
`;

const root = fs.mkdtempSync(path.join(os.tmpdir(), "lerience-recovery-comparison-"));
app.setPath("userData", path.join(root, "electron"));
const logPath = path.join(root, "capture.jsonl");
const log = (record: object) => fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`);
// Developer probe only: persist a failed run instead of presenting an Electron
// uncaught-exception modal while the learner is using another application.
process.on("uncaughtException", (error) => {
  log({ phase: "probe-error", message: error.message });
  app.exit(1);
});
process.on("unhandledRejection", (error) => {
  log({ phase: "probe-rejection", message: String(error) });
  app.exit(1);
});
const write = (dir: string, rel: string, value: string | object) => {
  const target = path.join(dir, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(
    target,
    typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`,
  );
};
const git = (dir: string, ...args: string[]) =>
  execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", windowsHide: true });
const today = new Date().toISOString().slice(0, 10);
const previous = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

// Only synthetic course metadata is retained. Never persist provider payloads,
// command bodies, generated code, credentials, or unrelated filesystem paths.
function toolMetadata(dir: string, input: unknown): object {
  if (typeof input !== "object" || input === null) return {};
  const fields = input as Record<string, unknown>;
  const target = typeof fields.file_path === "string" ? path.relative(dir, fields.file_path) : null;
  const command = typeof fields.command === "string" ? fields.command : "";
  return {
    target:
      target === null
        ? null
        : target.startsWith("..") || path.isAbsolute(target)
          ? "outside-fixture"
          : target,
    offset: typeof fields.offset === "number" ? fields.offset : null,
    limit: typeof fields.limit === "number" ? fields.limit : null,
    categories: ["doctor", "quiz", "qa", "review", "git", "journal", "install"].filter((word) =>
      new RegExp(`\\b${word}\\b`, "i").test(command),
    ),
  };
}

async function fixture(variant: string) {
  const dir = path.join(root, variant);
  fs.cpSync(path.resolve("course-engine/template"), dir, { recursive: true });
  if (variant === "candidate") {
    const protocol = fs.readFileSync(path.join(dir, "CLAUDE.md"), "utf8");
    write(
      dir,
      "CLAUDE.md",
      protocol.replace(
        "## Module generation (just-in-time)",
        `${candidate}\n## Module generation (just-in-time)`,
      ),
    );
  }
  const courseId = randomUUID();
  write(dir, ".praxeum.json", { courseId, formatVersion: 0 });
  write(
    dir,
    "COURSE.md",
    `# Running totals in JavaScript\n\nSynthetic learner, familiar with arrays and loops, 3 hours/week. Arc explicitly accepted.\n\n00-running-total: implement a sum and explain its accumulator.\n01-prefix-sums: build a prefix-sum array and answer range queries.\n\nModule 00 remains in progress until independent changed-case evidence resolves the empty-array gap. Module 01 was requested early as a preview, not an agreed expansion of the arc.\n`,
  );
  write(dir, "tutor/progress.json", {
    learner: { profile: "Synthetic JS learner", paceHoursPerWeek: "3", started: previous },
    currentModule: "00-running-total",
    modules: {
      "00-running-total": {
        status: "in-progress",
        startedAt: previous,
        hintsUsed: [],
        checkAttempts: 0,
        notes: `${previous}: empty-array result remains unverified; retrieve that journal entry before assuming mastery.`,
      },
    },
  });
  write(dir, "tutor/quiz-bank.json", {
    items: [
      {
        id: "00-accumulator",
        module: "00-running-total",
        question: "What does the accumulator represent?",
        interval: 3,
        due: today,
        history: [
          { date: previous, result: "correct", note: "Independent explanation of prior elements." },
        ],
      },
    ],
  });
  write(
    dir,
    "tutor/journal.md",
    `# Journal\n\n## ${previous} - Prior study\nIndependently described the accumulator as the total of prior elements. Empty-array result remains unverified; next probe must change the input.\n`,
  );
  write(
    dir,
    "curriculum/00-running-total/LESSON.md",
    "# Running totals\nAn accumulator stores a running total. Initialize it to zero before visiting elements.\n",
  );
  write(dir, "curriculum/00-running-total/module.json", {
    id: "00-running-total",
    title: "Running totals",
    phase: 1,
    phaseName: "Arrays",
    prerequisites: [],
    runtime: "node",
    estimatedHours: 0.5,
    provenance: "core",
    volatileLayer: "generated-at-start",
    bossCheck: false,
  });
  git(dir, "init", "-b", "main");
  git(dir, "config", "user.name", "Recovery Fixture");
  git(dir, "config", "user.email", "fixture@example.invalid");
  git(dir, "add", ".");
  git(dir, "commit", "-m", "Synthetic prior learning");
  write(
    dir,
    "curriculum/01-prefix-sums/LESSON.md",
    "# Prefix sums (unfinished draft)\nA prefix total records the sum before an index. For [2, 4, 1], start from [0, 2, 6, 7]. Range-query teaching, brief, scaffold, checks, source verification, reference QA and learner review remain unfinished. This draft has not been handed over.\n",
  );
  const store = await FileTranscriptStore.create({
    userDataPath: path.join(root, `${variant}-appdata`),
    courseId,
  });
  for (const entry of [
    {
      kind: "learner" as const,
      text: "For [2,4,1], the total is 7. Before each step the accumulator is the sum of earlier elements.",
    },
    {
      kind: "tutor_delta" as const,
      delta:
        "That explanation is independent. For an empty array, what result should the loop return?",
    },
    { kind: "learner" as const, text: "I am unsure; maybe undefined?" },
    {
      kind: "tutor_delta" as const,
      delta:
        "Level 2 assistance: follow the initialized accumulator when the loop executes zero times. No iterations means its initial value survives.",
    },
    {
      kind: "learner" as const,
      text: "Then zero. I needed that explanation. Please generate the next prefix-sums module as a preview.",
    },
    {
      kind: "tutor_delta" as const,
      delta:
        "The draft lesson for 01-prefix-sums is written. The brief, scaffold, checks, source verification, reference QA and independent learner review are still to do. We have not studied prefix sums or tried a changed example yet.",
    },
  ])
    await store.append(entry);
  return { dir, store };
}

async function run(variant: string) {
  const { dir, store } = await fixture(variant);
  const started = performance.now();
  const stamp = (record: object) =>
    log({ variant, ms: Math.round(performance.now() - started), ...record });
  let runtime = 0;
  let finished = false;
  let failed = false;
  const abortController = new AbortController();
  const queries: Array<{ close(): void }> = [];
  const service = createEngineScriptService({ runner: new ElectronUtilityProcessRunner() });
  const agent = new ClaudeTutorAgent(
    ({ prompt, options }) => {
      // A timed-out start may settle later. It must not spawn a fresh provider.
      if (abortController.signal.aborted) throw new Error("Recovery probe was cancelled");
      const n = ++runtime;
      stamp({ phase: "provider-create", runtime: n });
      const actual = query({
        prompt,
        options: {
          ...options,
          abortController,
          model: "claude-sonnet-4-6",
          effort: "medium",
          permissionMode: "bypassPermissions",
          settingSources: ["project"],
          hooks: {
            PreToolUse: [
              {
                hooks: [
                  async (input) => {
                    if (input.hook_event_name === "PreToolUse")
                      stamp({
                        phase: "tool-start",
                        runtime: n,
                        name: input.tool_name,
                        ...toolMetadata(dir, input.tool_input),
                      });
                    return {};
                  },
                ],
              },
            ],
            PostToolUse: [
              {
                hooks: [
                  async (input) => {
                    if (input.hook_event_name === "PostToolUse")
                      stamp({
                        phase: "tool-result",
                        runtime: n,
                        name: input.tool_name,
                        bytes: Buffer.byteLength(JSON.stringify(input.tool_response)),
                      });
                    return {};
                  },
                ],
              },
            ],
          },
        },
      });
      queries.push(actual);
      return actual;
    },
    1500,
    process.env.RECOVERY_CLAUDE_EXE,
  );
  const conductor = new SessionConductor({
    createAgent: () => agent,
    scripts: {
      async inspectContext(input) {
        stamp({ phase: "inspection-start" });
        const value = await service.inspectContext(input);
        stamp({ phase: "inspection-end", doctor: value.doctor });
        return value;
      },
      runChecks: (input) => service.runChecks(input),
    },
    userDataPath: path.join(root, `${variant}-appdata`),
    emitAgentEvent(event) {
      if (event.type === "error") {
        stamp({ phase: "error", code: event.code });
        failed = true;
      }
      if (event.type === "turn_complete") {
        stamp({ phase: "result", runtime });
        if (runtime === 2) finished = true;
      }
      if (event.type === "tool_activity") stamp({ phase: "activity", runtime, name: event.name });
    },
    emitSnapshot(snapshot) {
      stamp({ phase: "snapshot", lifecycle: snapshot.lifecycle });
      if (snapshot.lifecycle === "close-failed") {
        failed = true;
        finished = true;
      }
    },
  });
  write(root, `${variant}-before.json`, {
    progress: JSON.parse(fs.readFileSync(path.join(dir, "tutor/progress.json"), "utf8")),
    quiz: JSON.parse(fs.readFileSync(path.join(dir, "tutor/quiz-bank.json"), "utf8")),
    head: git(dir, "rev-parse", "HEAD").trim(),
  });
  await runBoundedProbe(
    async () => {
      stamp({ phase: "start" });
      stamp({
        phase: "accepted",
        reply: await conductor.start({
          courseDir: dir,
          currentModuleId: "00-running-total",
          onboarding: false,
        }),
      });
      const prepared = await conductor.current(dir);
      if (prepared.modelChoice) await conductor.confirmModel(prepared.modelChoice.runtimeId);
      while (!finished && !abortController.signal.aborted)
        await new Promise((resolve) => setTimeout(resolve, 250));
      if (abortController.signal.aborted) return;
      stamp({ phase: "finished", failed });
      write(root, `${variant}-after.json`, {
        snapshot: await (
          await FileTranscriptStore.open({
            userDataPath: path.join(root, `${variant}-appdata`),
            courseId: store.courseId,
            sessionId: store.sessionId,
          })
        ).snapshot(),
        progress: JSON.parse(fs.readFileSync(path.join(dir, "tutor/progress.json"), "utf8")),
        quiz: JSON.parse(fs.readFileSync(path.join(dir, "tutor/quiz-bank.json"), "utf8")),
        journal: fs.readFileSync(path.join(dir, "tutor/journal.md"), "utf8"),
        status: git(dir, "status", "--short"),
        diff: git(dir, "diff", "HEAD~1", "--stat"),
      });
    },
    () => {
      stamp({ phase: "provider-cancel" });
      abortController.abort();
      for (const handle of queries) {
        try {
          handle.close();
        } catch (error) {
          stamp({ phase: "provider-close-error", message: String(error) });
        }
      }
    },
    async () => {
      await conductor.abandon();
      stamp({ phase: "abandoned" });
    },
  );
}

void app.whenReady().then(async () => {
  fs.writeFileSync(path.resolve("out/recovery-location.txt"), root);
  log({
    versions: process.versions,
    provider: "claude",
    model: "claude-sonnet-4-6",
    effort: "medium",
  });
  try {
    await run("baseline");
    await run("candidate");
    app.exit(0);
  } catch (error) {
    log({ failed: String(error) });
    app.exit(1);
  }
});
