import { describe, expect, it, vi } from "vitest";
import {
  CodexAgentSession,
  codexFileEditWithinCourse,
  normalizeCodexError,
  summarizeCodexItem,
} from "../src/main/agent/codex";
import type { CodexAppServerConnection } from "../src/main/provider/codex-app-server";
import type { AgentEvent } from "../src/shared/seminar";

class FakeConnection implements CodexAppServerConnection {
  readonly calls: Array<{ method: string; params: unknown }> = [];
  readonly responses = new Map<string, unknown>();
  readonly notifications = new Set<(method: string, params: unknown) => void>();
  readonly requests = new Set<(id: string | number, method: string, params: unknown) => void>();
  readonly responseFrames: Array<{ id: string | number; result: unknown }> = [];

  async initialize(): Promise<void> {}
  async request(method: string, params: unknown): Promise<unknown> {
    this.calls.push({ method, params });
    return this.responses.get(method);
  }
  notify(): void {}
  respond(id: string | number, result: unknown): void {
    this.responseFrames.push({ id, result });
  }
  onNotification(listener: (method: string, params: unknown) => void): () => void {
    this.notifications.add(listener);
    return () => this.notifications.delete(listener);
  }
  onRequest(listener: (id: string | number, method: string, params: unknown) => void): () => void {
    this.requests.add(listener);
    return () => this.requests.delete(listener);
  }
  onExit(): () => void {
    return () => undefined;
  }
  close(): void {}
  emit(method: string, params: unknown): void {
    for (const listener of this.notifications) listener(method, params);
  }
  ask(id: string | number, method: string, params: unknown): void {
    for (const listener of this.requests) listener(id, method, params);
  }
}

function setup(): { connection: FakeConnection; session: CodexAgentSession } {
  const connection = new FakeConnection();
  connection.responses.set("thread/start", {
    thread: { id: "thread-1" },
    cwd: "C:/course",
    model: "gpt-5.6-codex",
    reasoningEffort: "high",
    approvalPolicy: "on-request",
    sandbox: {
      type: "workspaceWrite",
      writableRoots: [],
      networkAccess: false,
      excludeTmpdirEnvVar: false,
      excludeSlashTmp: false,
    },
  });
  connection.responses.set("turn/start", {
    turn: { id: "turn-1", status: "inProgress", error: null },
  });
  return {
    connection,
    session: new CodexAgentSession("C:/course", "# Tutor protocol", () => connection),
  };
}

async function events(iterator: AsyncIterator<AgentEvent>, count: number): Promise<AgentEvent[]> {
  const received: AgentEvent[] = [];
  for (let index = 0; index < count; index += 1) {
    const result = await iterator.next();
    if (!result.done) received.push(result.value);
  }
  return received;
}

describe("CodexAgentSession", () => {
  it("starts an ephemeral thread with course-scoped write access", async () => {
    const { connection, session } = setup();
    await session.describeControls();

    expect(connection.calls[0]).toEqual({
      method: "thread/start",
      params: {
        cwd: "C:/course",
        sandbox: "workspace-write",
        ephemeral: true,
        developerInstructions: "# Tutor protocol",
      },
    });
    expect(connection.calls[0]?.params).not.toHaveProperty("model");
    expect(connection.calls[0]?.params).not.toHaveProperty("approvalPolicy");
    expect(connection.calls[0]?.params).not.toHaveProperty("config");
    await session.end();
  });

  it("fails closed when Codex does not grant course-scoped write access", async () => {
    const connection = new FakeConnection();
    connection.responses.set("thread/start", {
      thread: { id: "thread-1" },
      cwd: "C:/course",
      model: "gpt-5.6-codex",
      reasoningEffort: "high",
      approvalPolicy: "on-request",
      sandbox: { type: "readOnly", networkAccess: false },
    });
    const session = new CodexAgentSession("C:/course", "# Tutor protocol", () => connection);
    const iterator = session.events[Symbol.asyncIterator]();

    await session.describeControls();

    expect(await events(iterator, 2)).toEqual([
      {
        type: "error",
        code: "turn-failed",
        message: "Codex could not complete this turn. Please try again.",
      },
      { type: "session_ended", reason: "died" },
    ]);
    expect(connection.calls.some((call) => call.method === "turn/start")).toBe(false);
  });

  it("streams text and only safe, human-shaped activity into the shared seam", async () => {
    const { connection, session } = setup();
    const iterator = session.events[Symbol.asyncIterator]();
    session.send("start session");
    await vi.waitFor(() =>
      expect(connection.calls.some((call) => call.method === "turn/start")).toBe(true),
    );

    connection.emit("item/agentMessage/delta", {
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "message-1",
      delta: "Welcome",
    });
    connection.emit("item/started", {
      threadId: "thread-1",
      turnId: "turn-1",
      item: {
        type: "commandExecution",
        id: "command-1",
        command: "echo provider-secret",
        aggregatedOutput: "provider-secret",
      },
    });
    connection.emit("turn/completed", {
      threadId: "thread-1",
      turn: { id: "turn-1", status: "completed", error: null },
    });

    expect(await events(iterator, 3)).toEqual([
      { type: "message_delta", delta: "Welcome" },
      { type: "tool_activity", name: "Shell", summary: "Running a command" },
      { type: "turn_complete" },
    ]);
    await session.end();
  });

  it("falls back to the completed agent message only when no delta streamed", async () => {
    const { connection, session } = setup();
    const iterator = session.events[Symbol.asyncIterator]();
    session.send("start session");
    await vi.waitFor(() => expect(session.busy).toBe(true));
    connection.emit("item/completed", {
      threadId: "thread-1",
      turnId: "turn-1",
      item: { type: "agentMessage", id: "message-1", text: "A complete answer" },
    });

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { type: "message_delta", delta: "A complete answer" },
    });
    await session.end();
  });

  it("does not lose a turn completion that arrives before the start response", async () => {
    const connection = new FakeConnection();
    connection.responses.set("thread/start", {
      thread: { id: "thread-1" },
      cwd: "C:/course",
      model: "gpt-5.6-codex",
      reasoningEffort: "high",
      approvalPolicy: "on-request",
      sandbox: {
        type: "workspaceWrite",
        writableRoots: [],
        networkAccess: false,
        excludeTmpdirEnvVar: false,
        excludeSlashTmp: false,
      },
    });
    const deferred: { release?: (value: unknown) => void } = {};
    connection.request = vi.fn(async (method: string, params: unknown) => {
      connection.calls.push({ method, params });
      if (method === "thread/start") return connection.responses.get(method);
      if (method === "turn/start") {
        return await new Promise((resolve) => {
          deferred.release = resolve;
        });
      }
      return connection.responses.get(method);
    });
    const session = new CodexAgentSession("C:/course", "# Tutor protocol", () => connection);
    const iterator = session.events[Symbol.asyncIterator]();
    session.send("start session");
    await vi.waitFor(() =>
      expect(connection.calls.some((call) => call.method === "turn/start")).toBe(true),
    );
    connection.emit("turn/completed", {
      threadId: "thread-1",
      turn: { id: "turn-fast", status: "completed", error: null },
    });
    if (deferred.release === undefined) throw new Error("turn response was not awaiting release");
    deferred.release({ turn: { id: "turn-fast", status: "inProgress", error: null } });

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { type: "turn_complete" },
    });
    expect(session.busy).toBe(false);
    await session.end();
  });

  it("surfaces and answers command approvals without rendering the command", async () => {
    const { connection, session } = setup();
    const iterator = session.events[Symbol.asyncIterator]();
    connection.ask(7, "item/commandExecution/requestApproval", {
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "command-1",
      command: "type C:\\Users\\learner\\.codex\\auth.json",
      reason: "provider secret",
    });

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        type: "approval_request",
        requestId: "codex:7",
        toolName: "Shell",
        summary: "Codex wants to run a shell command",
        editWithinCourse: false,
      },
    });
    session.respondToApproval("codex:7", true);
    expect(connection.responseFrames).toEqual([{ id: 7, result: { decision: "accept" } }]);
    await session.end();
  });

  it("reports provider models and applies learner-selected settings on the next turn", async () => {
    const { connection, session } = setup();
    connection.responses.set("model/list", {
      data: [
        {
          id: "gpt-5.6-codex",
          model: "gpt-5.6-codex",
          displayName: "GPT-5.6 Codex",
          description: "Most capable",
          hidden: false,
          supportedReasoningEfforts: [
            { reasoningEffort: "minimal", description: "Quick" },
            { reasoningEffort: "high", description: "Deep" },
            { reasoningEffort: "xhigh", description: "Deeper" },
          ],
        },
      ],
      nextCursor: null,
    });
    await expect(session.describeControls()).resolves.toEqual({
      models: [
        {
          id: "gpt-5.6-codex",
          label: "GPT-5.6 Codex",
          description: "Most capable",
          efforts: ["high", "xhigh"],
        },
      ],
      autonomy: expect.arrayContaining([expect.objectContaining({ id: "never" })]),
      current: { model: "gpt-5.6-codex", effort: "high", autonomy: "on-request" },
    });
    await expect(session.applyControls({ effort: "xhigh", autonomy: "never" })).resolves.toEqual(
      expect.objectContaining({
        current: { model: "gpt-5.6-codex", effort: "high", autonomy: "on-request" },
        pending: { effort: "xhigh", autonomy: "never" },
      }),
    );
    expect(connection.calls.some((call) => call.method === "thread/settings/update")).toBe(false);

    session.send("Use the new settings");
    await vi.waitFor(() =>
      expect(connection.calls.some((call) => call.method === "turn/start")).toBe(true),
    );
    expect(connection.calls.find((call) => call.method === "turn/start")).toEqual({
      method: "turn/start",
      params: {
        threadId: "thread-1",
        input: [{ type: "text", text: "Use the new settings", text_elements: [] }],
        effort: "xhigh",
        approvalPolicy: "never",
      },
    });
    await vi.waitFor(async () => {
      const applied = await session.describeControls();
      expect(applied.current).toEqual({
        model: "gpt-5.6-codex",
        effort: "xhigh",
        autonomy: "never",
      });
      expect(applied).not.toHaveProperty("pending");
    });
    await session.end();
  });
});

describe("Codex adapter normalization", () => {
  it("classifies only course-contained file edits as grantable", () => {
    const item = {
      type: "fileChange",
      changes: [{ path: "curriculum/00/LESSON.md" }, { path: "COURSE.md" }],
    };
    expect(codexFileEditWithinCourse(item, "C:/course")).toBe(true);
    expect(
      codexFileEditWithinCourse(
        { type: "fileChange", changes: [{ path: "../other/notes.md" }] },
        "C:/course",
      ),
    ).toBe(false);
    expect(codexFileEditWithinCourse(undefined, "C:/course", "C:/course")).toBe(true);
  });

  it("never includes command, diff, tool arguments, or error text in normalized output", () => {
    expect(
      summarizeCodexItem({
        type: "fileChange",
        changes: [{ path: "secret.txt", diff: "+token=secret" }],
      }),
    ).toEqual({ type: "tool_activity", name: "Files", summary: "Changing course files" });
    expect(summarizeCodexItem({ type: "commandExecution", command: "echo token=secret" })).toEqual({
      type: "tool_activity",
      name: "Shell",
      summary: "Running a command",
    });
    expect(summarizeCodexItem({ type: "webSearch", query: "zero vector hypot" })).toEqual({
      type: "tool_activity",
      name: "Web",
      summary: "Searching the web",
      detail: "zero vector hypot",
    });
    expect(normalizeCodexError({ message: "token=secret", codexErrorInfo: "other" })).toEqual({
      code: "turn-failed",
      message: "Codex could not complete this turn. Please try again.",
    });
    expect(normalizeCodexError({ codexErrorInfo: "unauthorized" }).code).toBe("auth");
    expect(normalizeCodexError({ codexErrorInfo: "usageLimitExceeded" }).code).toBe("rate-limit");
  });
});
