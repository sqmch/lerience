import type {
  CanUseTool,
  Options,
  SDKMessage,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, it, vi } from "vitest";
import {
  ClaudeTutorAgent,
  describeClaudeActivity,
  isEditWithinCourse,
  normalizeClaudeError,
  normalizeClaudeMessage,
  summarizeClaudeTool,
} from "../src/main/agent/claude";
import type { AgentEvent } from "../src/shared/seminar";

class TestQueue<T> implements AsyncIterable<T> {
  private readonly buffered: T[] = [];
  private readonly waiters: Array<(result: IteratorResult<T>) => void> = [];
  private closed = false;

  push(value: T): void {
    const waiter = this.waiters.shift();
    if (waiter === undefined) this.buffered.push(value);
    else waiter({ done: false, value });
  }

  end(): void {
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) waiter({ done: true, value: undefined });
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.buffered.length > 0) {
          return Promise.resolve({ done: false, value: this.buffered.shift() as T });
        }
        if (this.closed) return Promise.resolve({ done: true, value: undefined });
        return new Promise<IteratorResult<T>>((resolve) => this.waiters.push(resolve));
      },
    };
  }
}

class FakeClaudeQuery implements AsyncIterable<SDKMessage> {
  private readonly output = new TestQueue<SDKMessage>();
  readonly interrupt = vi.fn(async () => undefined);
  readonly permissionModes: string[] = [];
  readonly setModels: (string | undefined)[] = [];
  readonly flagSettings: Record<string, unknown>[] = [];

  async setPermissionMode(mode: string): Promise<void> {
    this.permissionModes.push(mode);
  }

  async setModel(model?: string): Promise<void> {
    this.setModels.push(model);
  }

  async applyFlagSettings(settings: Record<string, unknown>): Promise<void> {
    this.flagSettings.push(settings);
  }

  async supportedModels(): Promise<
    {
      value: string;
      displayName: string;
      description: string;
      resolvedModel?: string;
      supportsEffort?: boolean;
      supportedEffortLevels?: ("low" | "medium" | "high" | "xhigh" | "max")[];
    }[]
  > {
    return [
      {
        value: "sonnet",
        displayName: "Sonnet",
        description: "Balanced",
        resolvedModel: "claude-sonnet-5",
        supportsEffort: true,
        supportedEffortLevels: ["high", "low"],
      },
      { value: "haiku", displayName: "Haiku", description: "Fast" },
    ];
  }

  push(message: SDKMessage): void {
    this.output.push(message);
  }

  end(): void {
    this.output.end();
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKMessage> {
    return this.output[Symbol.asyncIterator]();
  }
}

interface CapturedQueryOptions {
  prompt: string | AsyncIterable<SDKUserMessage>;
  options?: Options;
}

function sdkMessage(value: object): SDKMessage {
  return value as SDKMessage;
}

async function closeSession(
  session: ReturnType<ClaudeTutorAgent["startSession"]>,
  query: FakeClaudeQuery,
): Promise<void> {
  const ending = session.end();
  query.end();
  await ending;
}

describe("ClaudeTutorAgent", () => {
  it("retires ambiguous root output after an interrupt loses its result", async () => {
    const sdkQuery = new FakeClaudeQuery();
    const session = new ClaudeTutorAgent(() => sdkQuery, 5).startSession({
      courseDir: "C:/course",
    });
    const received: AgentEvent[] = [];
    const drain = (async () => {
      for await (const event of session.events) received.push(event);
    })();
    session.send("first");
    await session.interrupt();
    sdkQuery.push(sdkMessage({ type: "system", subtype: "background_tasks_changed", tasks: [] }));
    sdkQuery.push(
      sdkMessage({
        type: "stream_event",
        parent_tool_use_id: null,
        event: { type: "message_start" },
      }),
    );
    sdkQuery.push(
      sdkMessage({
        type: "assistant",
        parent_tool_use_id: null,
        message: { content: [{ type: "text", text: "untracked reply" }] },
      }),
    );
    sdkQuery.push(sdkMessage({ type: "result", subtype: "success", total_cost_usd: 0.02 }));
    sdkQuery.end();
    await drain;
    expect(received.filter((event) => event.type === "message_delta")).toEqual([]);
    expect(received.filter((event) => event.type === "turn_complete")).toHaveLength(1);
    expect(received).toContainEqual(
      expect.objectContaining({
        type: "error",
        message: expect.stringContaining("interrupted turn"),
      }),
    );
    expect(received.at(-1)).toEqual({ type: "session_ended", reason: "died" });
    expect(session.busy).toBe(false);
  });
  it("uses replace-only background membership independently of task outcomes and root turns", async () => {
    const sdkQuery = new FakeClaudeQuery();
    const session = new ClaudeTutorAgent(() => sdkQuery).startSession({ courseDir: "C:/course" });
    const received: AgentEvent[] = [];
    const drain = (async () => {
      for await (const event of session.events) received.push(event);
    })();
    sdkQuery.push(
      sdkMessage({
        type: "system",
        subtype: "background_tasks_changed",
        tasks: [
          { task_id: "a", task_type: "local_agent", description: "Read the lesson" },
          { task_id: "b", task_type: "local_agent", description: "Read the brief" },
        ],
      }),
    );
    sdkQuery.push(
      sdkMessage({
        type: "system",
        subtype: "task_notification",
        task_id: "b",
        status: "failed",
        summary: "private output",
        output_file: "private/path",
      }),
    );
    sdkQuery.push(
      sdkMessage({
        type: "assistant",
        parent_tool_use_id: "child-tool",
        message: { content: [{ type: "text", text: "child answer" }] },
      }),
    );
    sdkQuery.push(sdkMessage({ type: "system", subtype: "background_tasks_changed", tasks: [] }));
    await vi.waitFor(() => expect(received).toHaveLength(3));
    expect(received).toEqual([
      {
        type: "background_tasks",
        tasks: [
          { id: "a", description: "Read the lesson" },
          { id: "b", description: "Read the brief" },
        ],
      },
      { type: "task_notification", taskId: "b", status: "failed" },
      { type: "background_tasks", tasks: [] },
    ]);
    expect(session.busy).toBe(false);
    await closeSession(session, sdkQuery);
    await drain;
  });

  it.each(["error", "interrupt", "death"])(
    "settles an automatic continuation on %s",
    async (outcome) => {
      const sdkQuery = new FakeClaudeQuery();
      const session = new ClaudeTutorAgent(() => sdkQuery, 5).startSession({
        courseDir: "C:/course",
      });
      const received: AgentEvent[] = [];
      const drain = (async () => {
        for await (const event of session.events) received.push(event);
      })();
      sdkQuery.push(
        sdkMessage({
          type: "stream_event",
          parent_tool_use_id: null,
          event: { type: "message_start" },
        }),
      );
      await vi.waitFor(() => expect(session.busy).toBe(true));
      if (outcome === "death") sdkQuery.end();
      else if (outcome === "interrupt") {
        await session.interrupt();
        // A late result settles the stopped turn before any new root output.
        sdkQuery.push(
          sdkMessage({
            type: "result",
            subtype: "error_during_execution",
            errors: ["interrupted"],
            total_cost_usd: 0.01,
          }),
        );
      } else
        sdkQuery.push(
          sdkMessage({
            type: "result",
            subtype: "error_during_execution",
            errors: ["failed"],
            total_cost_usd: 0.01,
          }),
        );
      await vi.waitFor(() => expect(session.busy).toBe(false));
      await closeSession(session, sdkQuery);
      await drain;
      expect(received.filter((e) => e.type === "turn_started")).toHaveLength(1);
      expect(received.filter((e) => e.type === "turn_complete")).toHaveLength(1);
      expect(received.filter((e) => e.type === "error")).toHaveLength(
        outcome === "interrupt" ? 0 : 1,
      );
    },
  );

  it("settles a provider-initiated continuation after the foreground result", async () => {
    const sdkQuery = new FakeClaudeQuery();
    const session = new ClaudeTutorAgent(() => sdkQuery).startSession({ courseDir: "C:/course" });
    const received: AgentEvent[] = [];
    const drain = (async () => {
      for await (const event of session.events) received.push(event);
    })();
    session.send("review the module");
    sdkQuery.push(sdkMessage({ type: "result", subtype: "success", total_cost_usd: 0.01 }));
    await vi.waitFor(() => expect(session.busy).toBe(false));
    sdkQuery.push(
      sdkMessage({
        type: "stream_event",
        parent_tool_use_id: null,
        event: { type: "message_start" },
      }),
    );
    sdkQuery.push(
      sdkMessage({
        type: "assistant",
        parent_tool_use_id: null,
        message: { content: [{ type: "text", text: "The review is complete." }] },
      }),
    );
    await vi.waitFor(() =>
      expect(received.some((event) => event.type === "message_delta")).toBe(true),
    );
    expect(session.busy).toBe(true);
    sdkQuery.push(
      sdkMessage({
        type: "rate_limit_event",
        rate_limit_info: {
          status: "allowed_warning",
          rateLimitType: "seven_day",
          utilization: 0.77,
        },
      }),
    );
    sdkQuery.push(sdkMessage({ type: "result", subtype: "success", total_cost_usd: 0.02 }));
    await vi.waitFor(() =>
      expect(received.filter((event) => event.type === "turn_complete")).toHaveLength(2),
    );
    expect(session.busy).toBe(false);
    expect(received.filter((event) => event.type === "limit_warning")).toHaveLength(1);
    await closeSession(session, sdkQuery);
    await drain;
  });

  it("starts one streaming-input query with canonical CLI settings and no capability overrides", async () => {
    const sdkQuery = new FakeClaudeQuery();
    let captured: CapturedQueryOptions | null = null;
    const agent = new ClaudeTutorAgent((options) => {
      captured = options;
      return sdkQuery;
    });

    const session = agent.startSession({ courseDir: "C:/courses/example" });
    const queryOptions = captured as CapturedQueryOptions | null;
    expect(queryOptions).not.toBeNull();
    if (queryOptions === null) throw new Error("query options were not captured");

    expect(queryOptions.options).toMatchObject({
      cwd: "C:/courses/example",
      systemPrompt: { type: "preset", preset: "claude_code" },
      settingSources: ["user", "project", "local"],
      includePartialMessages: true,
    });
    expect(queryOptions.options).not.toHaveProperty("env");
    expect(queryOptions.options).not.toHaveProperty("model");
    expect(queryOptions.options).not.toHaveProperty("tools");
    expect(queryOptions.options).not.toHaveProperty("permissionMode");
    expect(queryOptions.options).not.toHaveProperty("pathToClaudeCodeExecutable");
    expect(() => queryOptions.options?.stderr?.("provider diagnostic")).not.toThrow();

    if (typeof queryOptions.prompt === "string") throw new Error("expected streaming input");
    const input = queryOptions.prompt[Symbol.asyncIterator]();
    session.send("hello tutor");
    await expect(input.next()).resolves.toEqual({
      done: false,
      value: {
        type: "user",
        message: { role: "user", content: "hello tutor" },
        parent_tool_use_id: null,
      },
    });

    await closeSession(session, sdkQuery);
  });

  it("uses an injected provider-owned CLI without replacing the canonical environment", async () => {
    const sdkQuery = new FakeClaudeQuery();
    let captured: CapturedQueryOptions | null = null;
    const agent = new ClaudeTutorAgent(
      (options) => {
        captured = options;
        return sdkQuery;
      },
      undefined,
      "C:/Users/learner/.local/bin/claude.exe",
    );

    const session = agent.startSession({ courseDir: "C:/courses/example" });
    const queryOptions = captured as CapturedQueryOptions | null;
    if (queryOptions === null) throw new Error("query options were not captured");
    expect(queryOptions.options?.pathToClaudeCodeExecutable).toBe(
      "C:/Users/learner/.local/bin/claude.exe",
    );
    expect(queryOptions.options).not.toHaveProperty("env");

    await closeSession(session, sdkQuery);
  });

  it("streams root text, human-shaped tool activity, cumulative usage, and one turn boundary", async () => {
    const sdkQuery = new FakeClaudeQuery();
    const session = new ClaudeTutorAgent(() => sdkQuery).startSession({ courseDir: "C:/course" });
    const events = session.events[Symbol.asyncIterator]();
    session.send("start session");

    sdkQuery.push(
      sdkMessage({
        type: "stream_event",
        parent_tool_use_id: null,
        event: {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "Welcome" },
        },
      }),
    );
    sdkQuery.push(
      sdkMessage({
        type: "assistant",
        parent_tool_use_id: null,
        message: {
          content: [
            {
              type: "tool_use",
              name: "Read",
              input: { file_path: "curriculum/02/LESSON.md" },
            },
          ],
        },
      }),
    );
    sdkQuery.push(sdkMessage({ type: "result", subtype: "success", total_cost_usd: 0.012 }));

    const received: AgentEvent[] = [];
    for (let index = 0; index < 4; index += 1) {
      const event = await events.next();
      if (!event.done) received.push(event.value);
    }
    expect(received).toEqual([
      { type: "message_delta", delta: "Welcome" },
      {
        type: "tool_activity",
        name: "Read",
        summary: "Reading a file",
        detail: "curriculum/02/LESSON.md",
      },
      { type: "usage_update", totalCostUsd: 0.012 },
      { type: "turn_complete" },
    ]);

    await closeSession(session, sdkQuery);
  });

  it("surfaces and resolves awaited permission requests by tool-use id", async () => {
    const sdkQuery = new FakeClaudeQuery();
    let canUseTool: CanUseTool | undefined;
    const session = new ClaudeTutorAgent((options) => {
      canUseTool = options.options?.canUseTool;
      return sdkQuery;
    }).startSession({ courseDir: "C:/course" });
    const events = session.events[Symbol.asyncIterator]();
    const input = { file_path: "../notes.txt" };

    const permission = canUseTool?.("Read", input, {
      signal: new AbortController().signal,
      toolUseID: "tool-17",
      requestId: "request-9",
      title: "Claude wants to read notes.txt",
    });
    expect(permission).toBeDefined();
    await expect(events.next()).resolves.toEqual({
      done: false,
      value: {
        type: "approval_request",
        requestId: "tool-17",
        toolName: "Read",
        summary: "Claude wants to read notes.txt",
        editWithinCourse: false,
      },
    });

    session.respondToApproval("tool-17", true);
    await expect(permission).resolves.toEqual({ behavior: "allow", updatedInput: input });
    await closeSession(session, sdkQuery);
  });

  it("puts the command on a Bash approval so the card can state the actual action", async () => {
    const sdkQuery = new FakeClaudeQuery();
    let canUseTool: CanUseTool | undefined;
    const session = new ClaudeTutorAgent((options) => {
      canUseTool = options.options?.canUseTool;
      return sdkQuery;
    }).startSession({ courseDir: "C:/course" });
    const events = session.events[Symbol.asyncIterator]();
    const input = {
      command: "pnpm install --frozen-lockfile",
      description: "Install the scaffold's dependencies",
    };

    const permission = canUseTool?.("Bash", input, {
      signal: new AbortController().signal,
      toolUseID: "tool-18",
      requestId: "request-10",
    });
    expect(permission).toBeDefined();
    await expect(events.next()).resolves.toEqual({
      done: false,
      value: {
        type: "approval_request",
        requestId: "tool-18",
        toolName: "Bash",
        summary: "Install the scaffold's dependencies",
        editWithinCourse: false,
        command: "pnpm install --frozen-lockfile",
      },
    });

    session.respondToApproval("tool-18", false);
    await expect(permission).resolves.toMatchObject({ behavior: "deny" });
    await closeSession(session, sdkQuery);
  });

  it("interrupts through the SDK and closes a turn even when no result frame arrives", async () => {
    const sdkQuery = new FakeClaudeQuery();
    const session = new ClaudeTutorAgent(() => sdkQuery, 10).startSession({
      courseDir: "C:/course",
    });
    const events = session.events[Symbol.asyncIterator]();
    session.send("pause");

    await session.interrupt();

    expect(sdkQuery.interrupt).toHaveBeenCalledOnce();
    await expect(events.next()).resolves.toEqual({
      done: false,
      value: { type: "turn_complete" },
    });
    await closeSession(session, sdkQuery);
  });

  it("reports that it cannot steer a running turn and refuses to try", async () => {
    const sdkQuery = new FakeClaudeQuery();
    const session = new ClaudeTutorAgent(() => sdkQuery, 10).startSession({
      courseDir: "C:/course",
    });
    expect(session.steerable).toBe(false);
    session.send("long task");
    await expect(session.steer("also this")).rejects.toThrow(
      "This provider cannot take a message while the tutor is working.",
    );
    expect(session.busy).toBe(true);
    await closeSession(session, sdkQuery);
  });

  it("lets the interrupted turn's own result close it, without a failure banner", async () => {
    const sdkQuery = new FakeClaudeQuery();
    const session = new ClaudeTutorAgent(() => sdkQuery, 5_000).startSession({
      courseDir: "C:/course",
    });
    const events = session.events[Symbol.asyncIterator]();
    session.send("long task");

    const interrupting = session.interrupt();
    sdkQuery.push(
      sdkMessage({
        type: "result",
        subtype: "error_during_execution",
        total_cost_usd: 0.01,
        errors: ["interrupted"],
      }),
    );

    // usage flows, the error is suppressed (learner-initiated stop), and the
    // turn closes exactly once — from the result frame, not the fallback.
    await expect(events.next()).resolves.toEqual({
      done: false,
      value: { type: "usage_update", totalCostUsd: 0.01 },
    });
    await expect(events.next()).resolves.toEqual({
      done: false,
      value: { type: "turn_complete" },
    });
    expect(session.busy).toBe(false);
    await interrupting;
    await closeSession(session, sdkQuery);
  });

  it("never lets a stale post-fallback result frame end the next turn", async () => {
    const sdkQuery = new FakeClaudeQuery();
    const session = new ClaudeTutorAgent(() => sdkQuery, 10).startSession({
      courseDir: "C:/course",
    });
    const events = session.events[Symbol.asyncIterator]();

    session.send("first");
    await session.interrupt(); // fallback fires: turn 1 force-finished
    await expect(events.next()).resolves.toEqual({
      done: false,
      value: { type: "turn_complete" },
    });

    session.send("second");
    // Turn 1's result arrives late: its usage still counts, but neither its
    // error nor its turn_complete may touch turn 2.
    sdkQuery.push(
      sdkMessage({
        type: "result",
        subtype: "error_during_execution",
        total_cost_usd: 0.02,
        errors: ["interrupted"],
      }),
    );
    await expect(events.next()).resolves.toEqual({
      done: false,
      value: { type: "usage_update", totalCostUsd: 0.02 },
    });
    expect(session.busy).toBe(true);

    sdkQuery.push(sdkMessage({ type: "result", subtype: "success", total_cost_usd: 0.03 }));
    await expect(events.next()).resolves.toEqual({
      done: false,
      value: { type: "usage_update", totalCostUsd: 0.03 },
    });
    await expect(events.next()).resolves.toEqual({
      done: false,
      value: { type: "turn_complete" },
    });
    expect(session.busy).toBe(false);
    await closeSession(session, sdkQuery);
  });
});

describe("Claude adapter normalization", () => {
  it("skips subagent text and never dumps tool input JSON", () => {
    expect(
      normalizeClaudeMessage(
        sdkMessage({
          type: "stream_event",
          parent_tool_use_id: "parent-tool",
          event: {
            type: "content_block_delta",
            delta: { type: "text_delta", text: "private subagent text" },
          },
        }),
      ),
    ).toEqual([]);
    expect(summarizeClaudeTool("Bash", { command: "echo super-secret" })).toBe(
      "Run a shell command",
    );
    expect(summarizeClaudeTool("WebFetch", { url: "https://example.com/doc?token=secret" })).toBe(
      "Read example.com/doc",
    );
  });

  it("phrases the live activity line in the present progressive without the command", () => {
    expect(
      describeClaudeActivity("Bash", {
        command: "echo super-secret",
        description: "Run the checks",
      }),
    ).toEqual({ summary: "Running a command", detail: "Run the checks" });
    expect(describeClaudeActivity("Bash", { command: "echo super-secret" })).toEqual({
      summary: "Running a command",
      detail: null,
    });
    expect(describeClaudeActivity("Read", { file_path: "COURSE.md" })).toEqual({
      summary: "Reading a file",
      detail: "COURSE.md",
    });
    expect(describeClaudeActivity("Grep", { pattern: "parseReading" })).toEqual({
      summary: "Searching course files",
      detail: "parseReading",
    });
    expect(
      describeClaudeActivity("WebFetch", { url: "https://example.com/doc?token=secret" }),
    ).toEqual({ summary: "Reading a web page", detail: "example.com/doc" });
    expect(describeClaudeActivity("Mystery", { anything: "at all" })).toEqual({
      summary: "Using Mystery",
      detail: null,
    });
  });

  it("renders assistant text only when nothing streamed it", () => {
    const spoke = sdkMessage({
      type: "assistant",
      parent_tool_use_id: null,
      message: {
        content: [
          { type: "text", text: "Fresh repo, no course yet." },
          { type: "tool_use", name: "Read", input: { file_path: "COURSE.md" } },
        ],
      },
    });

    // The normal path: the words already streamed as deltas, so repeating the
    // assistant frame's copy would print the turn twice.
    expect(normalizeClaudeMessage(spoke)).toEqual([
      { type: "tool_activity", name: "Read", summary: "Reading a file", detail: "COURSE.md" },
    ]);

    expect(normalizeClaudeMessage(spoke, { includeAssistantText: true })).toEqual([
      { type: "message_delta", delta: "Fresh repo, no course yet." },
      { type: "tool_activity", name: "Read", summary: "Reading a file", detail: "COURSE.md" },
    ]);
  });

  it("speaks a turn whose text never streamed, and stays silent when it did", async () => {
    const sdkQuery = new FakeClaudeQuery();
    const session = new ClaudeTutorAgent(() => sdkQuery).startSession({ courseDir: "C:/course" });
    const events = session.events[Symbol.asyncIterator]();
    session.send("new course");

    // The live failure of 2026-08-12: a whole turn arrives as one assistant
    // frame, with no stream_event deltas behind it.
    sdkQuery.push(
      sdkMessage({
        type: "assistant",
        parent_tool_use_id: null,
        message: { content: [{ type: "text", text: "Let's build your course." }] },
      }),
    );
    // ...and a second frame in the SAME turn, this one properly streamed. Its
    // duplicate must not print, which is why the flag is per-frame.
    sdkQuery.push(
      sdkMessage({
        type: "stream_event",
        parent_tool_use_id: null,
        event: {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "One more thing." },
        },
      }),
    );
    sdkQuery.push(
      sdkMessage({
        type: "assistant",
        parent_tool_use_id: null,
        message: { content: [{ type: "text", text: "One more thing." }] },
      }),
    );
    sdkQuery.push(sdkMessage({ type: "result", subtype: "success", total_cost_usd: 0.34 }));

    const received: AgentEvent[] = [];
    for (let index = 0; index < 4; index += 1) {
      const event = await events.next();
      if (!event.done) received.push(event.value);
    }
    expect(received).toEqual([
      { type: "message_delta", delta: "Let's build your course." },
      { type: "message_delta", delta: "One more thing." },
      { type: "usage_update", totalCostUsd: 0.34 },
      { type: "turn_complete" },
    ]);

    await closeSession(session, sdkQuery);
  });

  it("offers a curated autonomy ladder and refuses anything outside it", async () => {
    const sdkQuery = new FakeClaudeQuery();
    const session = new ClaudeTutorAgent(() => sdkQuery).startSession({ courseDir: "C:/course" });

    const controls = await session.describeControls();
    const ids = controls.autonomy.map((mode) => mode.id);
    // Least to most autonomy; "Never ask" is offered because the learner asked
    // for it, and is labelled as what it is (ADR-018).
    expect(ids).toEqual(["default", "acceptEdits", "auto", "bypassPermissions"]);
    expect(
      controls.autonomy.filter((mode) => mode.skipsApprovalPrompts).map((mode) => mode.id),
    ).toEqual(["bypassPermissions"]);
    // The modes that would read as the tutor failing are still not offered.
    expect(ids).not.toContain("plan");
    expect(ids).not.toContain("dontAsk");

    await expect(session.applyControls({ autonomy: "plan" })).rejects.toThrow(/not available/);
    expect(sdkQuery.permissionModes).toEqual([]);

    await session.applyControls({ autonomy: "acceptEdits" });
    expect(sdkQuery.permissionModes).toEqual(["acceptEdits"]);
    expect((await session.describeControls()).current.autonomy).toBe("acceptEdits");

    await closeSession(session, sdkQuery);
  });

  it("reports the model the learner's own configuration resolved to", async () => {
    const sdkQuery = new FakeClaudeQuery();
    const session = new ClaudeTutorAgent(() => sdkQuery).startSession({ courseDir: "C:/course" });
    session.send("start session");

    // Nothing is imposed at startup, so the init frame is the only truth.
    sdkQuery.push(
      sdkMessage({
        type: "system",
        subtype: "init",
        model: "claude-sonnet-5",
        permissionMode: "default",
      }),
    );
    sdkQuery.push(sdkMessage({ type: "result", subtype: "success", total_cost_usd: 0.01 }));
    const events = session.events[Symbol.asyncIterator]();
    await events.next();
    await events.next();

    const controls = await session.describeControls();
    // The provider reports a WIRE id; the offered rows are aliases. Matching
    // them is what lets the surface name the running model instead of
    // showing "default" over a session that is plainly running something.
    expect(controls.current.model).toBe("sonnet");
    expect(controls.current.autonomy).toBe("default");
    // Effort levels come from the provider's own per-model capability list.
    expect(controls.models).toEqual([
      { id: "sonnet", label: "Sonnet", description: "Balanced", efforts: ["low", "high"] },
      { id: "haiku", label: "Haiku", description: "Fast", efforts: [] },
    ]);

    await closeSession(session, sdkQuery);
  });

  it("keeps the learner's model choice when the provider re-announces its own", async () => {
    const sdkQuery = new FakeClaudeQuery();
    const session = new ClaudeTutorAgent(() => sdkQuery).startSession({ courseDir: "C:/course" });
    const events = session.events[Symbol.asyncIterator]();
    session.send("start session");

    await session.applyControls({ model: "haiku" });
    // The CLI re-announcing its startup model must not silently undo the pick
    // — that is what made the picker appear to reset itself mid-session.
    sdkQuery.push(
      sdkMessage({
        type: "system",
        subtype: "init",
        model: "claude-sonnet-5",
        permissionMode: "default",
      }),
    );
    sdkQuery.push(sdkMessage({ type: "result", subtype: "success", total_cost_usd: 0.01 }));
    await events.next();
    await events.next();

    expect((await session.describeControls()).current.model).toBe("haiku");
    await closeSession(session, sdkQuery);
  });

  it("never asks permission to ask the learner a question", async () => {
    const sdkQuery = new FakeClaudeQuery();
    let canUseTool: CanUseTool | undefined;
    const session = new ClaudeTutorAgent((options) => {
      canUseTool = options.options?.canUseTool;
      return sdkQuery;
    }).startSession({ courseDir: "C:/course" });

    const input = { question: "How many hours a week?" };
    await expect(
      canUseTool?.("AskUserQuestion", input, {
        signal: new AbortController().signal,
        toolUseID: "tool-1",
        requestId: "request-1",
      }),
    ).resolves.toEqual({ behavior: "allow", updatedInput: input });

    await closeSession(session, sdkQuery);
  });

  it("classifies course-folder file edits, and only those, as grantable", () => {
    const course = "C:\\Users\\learner\\Lerience\\Typed APIs";
    // The grant's whole contract: editing tools, absolute paths, inside root.
    expect(isEditWithinCourse("Write", { file_path: `${course}\\COURSE.md` }, course)).toBe(true);
    expect(
      isEditWithinCourse("Edit", { file_path: `${course}\\curriculum\\00\\LESSON.md` }, course),
    ).toBe(true);
    // A shell command can write files too, but it can do anything else —
    // "file edits" must never quietly cover it.
    expect(isEditWithinCourse("Bash", { command: `echo hi > ${course}\\x` }, course)).toBe(false);
    // Escapes and ambiguity fail closed.
    expect(isEditWithinCourse("Write", { file_path: `${course}\\..\\other\\f.md` }, course)).toBe(
      false,
    );
    expect(isEditWithinCourse("Write", { file_path: "COURSE.md" }, course)).toBe(false);
    expect(isEditWithinCourse("Write", {}, course)).toBe(false);
    expect(isEditWithinCourse("Write", { file_path: "C:\\elsewhere\\f.md" }, course)).toBe(false);
  });

  it("classifies provider failures into safe seam errors", () => {
    expect(normalizeClaudeError(new Error("OAuth session expired"))).toMatchObject({
      code: "auth",
    });
    expect(normalizeClaudeError(new Error("rate limit reached"))).toMatchObject({
      code: "rate-limit",
    });
    expect(normalizeClaudeError(new Error("process exited with code 1"))).toMatchObject({
      code: "process-exited",
    });
    expect(normalizeClaudeError(new Error("token=definitely-secret")).message).not.toContain(
      "definitely-secret",
    );
  });

  // SDK 0.3.233 supplies these fields. Claude Code 2.1.282's rate-limit
  // schema documents fractions and Unix seconds; these are synthetic values.
  it.each([
    ["five_hour", "Claude 5-hour limit", 0.92, 92],
    ["seven_day", "Claude weekly limit", 0.77, 77],
    ["seven_day_opus", "Claude Opus weekly limit", 0.8, 80],
    ["seven_day_sonnet", "Claude Sonnet weekly limit", 0.8, 80],
    ["seven_day_overage_included", "Claude model-specific weekly limit", 0.77, 77],
    ["overage", "Claude usage credit limit", 1.2, 120],
    ["future_bucket", "Claude usage limit", 0, 0],
    ["constructor", "Claude usage limit", 1, 100],
  ])(
    "maps %s without confusing allowance buckets",
    (rateLimitType, label, utilization, percent) => {
      expect(
        normalizeClaudeMessage(
          sdkMessage({
            type: "rate_limit_event",
            rate_limit_info: { status: "allowed_warning", rateLimitType, utilization },
          }),
        ),
      ).toEqual([
        { type: "limit_warning", label, usedPercent: percent, resetsAt: null, status: "warning" },
      ]);
    },
  );

  it.each([undefined, null, -1, NaN, Infinity, "0.92"])(
    "omits invalid utilization %s",
    (utilization) => {
      expect(
        normalizeClaudeMessage(
          sdkMessage({
            type: "rate_limit_event",
            rate_limit_info: {
              status: "rejected",
              utilization,
              surpassedThreshold: 0.75,
              overageStatus: "allowed",
              overageResetsAt: 1_800_000_000,
            },
          }),
        ),
      ).toEqual([
        {
          type: "limit_warning",
          label: "Claude usage limit",
          usedPercent: null,
          resetsAt: null,
          status: "rejected",
        },
      ]);
    },
  );

  it.each([undefined, null, 0, -1, NaN, Infinity, 1e20, "1800000000"])(
    "omits invalid reset %s",
    (resetsAt) => {
      expect(
        normalizeClaudeMessage(
          sdkMessage({
            type: "rate_limit_event",
            rate_limit_info: { status: "allowed_warning", resetsAt },
          }),
        )[0],
      ).toMatchObject({ resetsAt: null });
    },
  );

  it.each([undefined, null, {}, { status: "future_status" }])(
    "ignores unknown status payload %s",
    (info) => {
      expect(
        normalizeClaudeMessage(sdkMessage({ type: "rate_limit_event", rate_limit_info: info })),
      ).toEqual([]);
    },
  );

  it("normalizes only direct Claude subscription-limit warnings", () => {
    expect(
      normalizeClaudeMessage(
        sdkMessage({
          type: "rate_limit_event",
          rate_limit_info: {
            status: "allowed_warning",
            rateLimitType: "five_hour",
            utilization: 0.912,
            resetsAt: 1_800_000_000,
          },
        }),
      ),
    ).toEqual([
      {
        type: "limit_warning",
        label: "Claude 5-hour limit",
        usedPercent: 91.2,
        resetsAt: 1_800_000_000,
        status: "warning",
      },
    ]);
    expect(
      normalizeClaudeMessage(
        sdkMessage({ type: "rate_limit_event", rate_limit_info: { status: "allowed" } }),
      ),
    ).toEqual([{ type: "limit_cleared" }]);
  });
});
