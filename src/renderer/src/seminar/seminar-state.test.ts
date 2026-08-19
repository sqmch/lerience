import { describe, expect, it } from "vitest";
import {
  createSeminarState,
  seminarReducer,
  type SeminarAction,
  type SeminarState,
} from "./seminar-state";

function reduce(state: SeminarState, actions: readonly SeminarAction[]): SeminarState {
  return actions.reduce(seminarReducer, state);
}

describe("seminarReducer", () => {
  it("maps a complete local agent stream through the visible seminar phases", () => {
    const state = reduce(createSeminarState(), [
      { type: "open_started" },
      { type: "open_succeeded" },
      { type: "event", event: { type: "message_delta", delta: "Welcome" } },
      {
        type: "event",
        event: { type: "tool_activity", name: "Read", summary: "Reading the lesson" },
      },
      {
        type: "event",
        event: {
          type: "approval_request",
          requestId: "approval-1",
          toolName: "Bash",
          summary: "Run the module checks",
          editWithinCourse: false,
        },
      },
      { type: "approval_answered" },
      { type: "event", event: { type: "message_delta", delta: "The checks pass." } },
      { type: "event", event: { type: "usage_update", totalCostUsd: 0.25 } },
      { type: "event", event: { type: "turn_complete" } },
    ]);

    expect(state.phase).toBe("idle");
    expect(state.totalCostUsd).toBe(0.25);
    expect(state.toolActivity).toBeNull();
    expect(state.approval).toBeNull();
    expect(state.items).toEqual([
      {
        id: "tutor-1",
        role: "tutor",
        content: "Welcome",
        streaming: false,
      },
      {
        id: "tutor-2",
        role: "tutor",
        content: "The checks pass.",
        streaming: false,
      },
    ]);
  });

  it("keeps tool activity transient and finalizes the preceding tutor text", () => {
    const state = reduce(createSeminarState(), [
      { type: "open_started" },
      { type: "open_succeeded" },
      { type: "event", event: { type: "message_delta", delta: "Let me inspect that." } },
      {
        type: "event",
        event: { type: "tool_activity", name: "Read", summary: "Reading COURSE.md" },
      },
    ]);

    expect(state.phase).toBe("tool-activity");
    expect(state.toolActivity).toBe("Reading COURSE.md");
    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toMatchObject({ streaming: false });
  });

  it("keeps an approval actionable if its local IPC response fails", () => {
    const awaiting = reduce(createSeminarState(), [
      { type: "open_started" },
      {
        type: "event",
        event: {
          type: "approval_request",
          requestId: "approval-1",
          toolName: "Edit",
          summary: "Update the lesson",
          editWithinCourse: true,
        },
      },
    ]);
    const failed = seminarReducer(awaiting, {
      type: "approval_failed",
      message: "The response did not reach the tutor.",
    });

    expect(failed.phase).toBe("tool-activity");
    expect(failed.approval).toEqual(awaiting.approval);
    expect(failed.failure?.kind).toBe("unavailable");
  });

  it("uses cumulative provider usage rather than adding repeated totals", () => {
    const state = reduce(createSeminarState(), [
      { type: "event", event: { type: "usage_update", totalCostUsd: 0.2 } },
      { type: "event", event: { type: "usage_update", totalCostUsd: 0.35 } },
    ]);
    expect(state.totalCostUsd).toBe(0.35);
  });

  it("keeps a direct subscription-limit warning visible until the session ends", () => {
    const warning = {
      type: "limit_warning" as const,
      label: "Claude 5-hour limit",
      usedPercent: 92,
      resetsAt: 1_800_000_000,
      status: "warning" as const,
    };
    const active = reduce(createSeminarState(), [
      { type: "open_started" },
      { type: "event", event: warning },
      { type: "event", event: { type: "turn_complete" } },
    ]);
    expect(active.limitWarning).toEqual(warning);

    const ended = seminarReducer(active, {
      type: "event",
      event: { type: "session_ended", reason: "ended" },
    });
    expect(ended.limitWarning).toBeNull();
  });

  it("classifies provider errors into actionable renderer failure kinds", () => {
    const auth = seminarReducer(createSeminarState(), {
      type: "event",
      event: { type: "error", code: "auth", message: "Run the provider sign-in flow." },
    });
    const limited = seminarReducer(createSeminarState(), {
      type: "event",
      event: { type: "error", code: "rate-limit", message: "Try again later." },
    });
    const failed = seminarReducer(createSeminarState(), {
      type: "event",
      event: { type: "error", code: "turn-failed", message: "The turn failed." },
    });

    expect(auth.failure?.kind).toBe("auth");
    expect(limited.failure?.kind).toBe("rate-limit");
    expect(failed.failure?.kind).toBe("unavailable");
  });

  it("keeps a rejected session-control change local and recoverable", () => {
    const active = { ...createSeminarState(), phase: "idle" as const };
    const rejected = seminarReducer(active, {
      type: "control_change_failed",
      message: "Reasoning is still Very high effort. Try again.",
    } as Parameters<typeof seminarReducer>[1]);

    expect(rejected.phase).toBe("idle");
    expect(rejected.failure).toBeNull();
    expect(
      (rejected as typeof rejected & { controlNotice?: { kind: string; message: string } })
        .controlNotice,
    ).toEqual({
      kind: "error",
      message: "Reasoning is still Very high effort. Try again.",
    });
  });

  it("does not move a fast opening stream backwards when start resolves", () => {
    const streaming = reduce(createSeminarState(), [
      { type: "open_started" },
      { type: "event", event: { type: "message_delta", delta: "Already here" } },
    ]);
    expect(seminarReducer(streaming, { type: "open_succeeded" }).phase).toBe("streaming");
  });

  it("closes and finalizes a partial turn when the session ends", () => {
    const state = reduce(createSeminarState(), [
      { type: "open_started" },
      { type: "event", event: { type: "message_delta", delta: "Partial" } },
      { type: "event", event: { type: "session_ended", reason: "ended" } },
    ]);

    expect(state.phase).toBe("closed");
    expect(state.items[0]).toMatchObject({ content: "Partial", streaming: false });
  });

  it("rehydrates an abandoned transcript as recoverable without rendering operator rows", () => {
    const state = seminarReducer(createSeminarState(), {
      type: "hydrate",
      snapshot: {
        lifecycle: "recoverable",
        sessionId: "session-1",
        totalCostUsd: 0.4,
        turnInProgress: false,
        messages: [
          {
            id: "learner-2",
            role: "learner",
            content: "I stopped midway",
            partial: false,
          },
          { id: "tutor-3", role: "tutor", content: "Let's", partial: true },
        ],
      },
    });

    expect(state.phase).toBe("closed");
    expect(state.lifecycle).toBe("recoverable");
    expect(state.items).toHaveLength(2);
    expect(state.totalCostUsd).toBe(0.4);
  });

  it("reports a turn that completed without producing anything", () => {
    // The 2026-08-12 failure exactly: the opener is sent, the provider reports
    // cost and completion, and the learner is shown nothing at all.
    const silent = reduce(createSeminarState(), [
      { type: "open_started" },
      { type: "open_succeeded" },
      { type: "event", event: { type: "usage_update", totalCostUsd: 0.34 } },
      { type: "event", event: { type: "turn_complete" } },
    ]);

    expect(silent.failure).toEqual({ kind: "silent", message: expect.any(String) });
    expect(silent.phase).toBe("idle");

    // A turn that said something is never accused, and the next turn starts
    // with a clean slate rather than inheriting the last one's verdict.
    const spoke = reduce(createSeminarState(), [
      { type: "open_started" },
      { type: "event", event: { type: "message_delta", delta: "Hello" } },
      { type: "event", event: { type: "turn_complete" } },
    ]);
    expect(spoke.failure).toBeNull();
    expect(spoke.turnProducedContent).toBe(false);
  });

  it("keeps an error's explanation instead of replacing it with silence", () => {
    const errored = reduce(createSeminarState(), [
      { type: "open_started" },
      {
        type: "event",
        event: { type: "error", code: "rate-limit", message: "Usage limit reached." },
      },
      { type: "event", event: { type: "turn_complete" } },
    ]);

    expect(errored.failure).toEqual({ kind: "rate-limit", message: "Usage limit reached." });
  });

  it("ignores a snapshot that predates the session it is opening", () => {
    // currentSeminar() resolves after auto-start has already asked for a
    // session; honouring its "closed" would strand the surface, because
    // auto-start fires once.
    const opening = reduce(createSeminarState(), [{ type: "open_started" }]);
    const stale = seminarReducer(opening, {
      type: "hydrate",
      snapshot: {
        lifecycle: "closed",
        sessionId: null,
        totalCostUsd: 0,
        turnInProgress: false,
        messages: [],
      },
    });

    expect(stale.phase).toBe("opening");
  });

  it("keeps the composer closed while doctor verifies a recovery turn", () => {
    const recovering = seminarReducer(createSeminarState(), {
      type: "hydrate",
      snapshot: {
        lifecycle: "recovering",
        sessionId: "session-1",
        totalCostUsd: 0,
        turnInProgress: true,
        messages: [],
      },
    });
    const afterTurn = seminarReducer(recovering, {
      type: "event",
      event: { type: "turn_complete" },
    });

    expect(afterTurn.phase).toBe("thinking");
  });

  it("keeps the recovered transcript visible while the fresh opener starts", () => {
    const recovered = seminarReducer(createSeminarState(), {
      type: "hydrate",
      snapshot: {
        lifecycle: "recoverable",
        sessionId: "session-old",
        totalCostUsd: 0.4,
        turnInProgress: false,
        messages: [
          {
            id: "learner-2",
            role: "learner",
            content: "I stopped midway",
            partial: false,
          },
          { id: "tutor-3", role: "tutor", content: "Let's continue", partial: false },
        ],
      },
    });
    const recovering = reduce(recovered, [
      { type: "open_started" },
      {
        type: "hydrate",
        snapshot: {
          lifecycle: "recovering",
          sessionId: "session-old",
          totalCostUsd: 0.4,
          turnInProgress: true,
          messages: [
            {
              id: "learner-2",
              role: "learner",
              content: "I stopped midway",
              partial: false,
            },
            { id: "tutor-3", role: "tutor", content: "Let's continue", partial: false },
          ],
        },
      },
      { type: "event", event: { type: "message_delta", delta: "Previous session finished." } },
      { type: "event", event: { type: "turn_complete" } },
      {
        type: "hydrate",
        snapshot: {
          lifecycle: "closed",
          sessionId: "session-old",
          totalCostUsd: 0.4,
          turnInProgress: false,
          messages: [
            {
              id: "learner-2",
              role: "learner",
              content: "I stopped midway",
              partial: false,
            },
            { id: "tutor-3", role: "tutor", content: "Let's continue", partial: false },
            {
              id: "tutor-7",
              role: "tutor",
              content: "Previous session finished.",
              partial: false,
            },
          ],
        },
      },
    ]);
    const freshOpening = seminarReducer(recovering, {
      type: "hydrate",
      snapshot: {
        lifecycle: "open",
        sessionId: "session-new",
        totalCostUsd: 0,
        turnInProgress: true,
        messages: [],
      },
    });

    expect(recovering.phase).toBe("thinking");
    expect(recovering.items.at(-1)?.content).toBe("Previous session finished.");
    expect(recovering.recoveryHandoff).toBe("opening-next");
    expect(freshOpening.phase).toBe("thinking");
    expect(freshOpening.items).toEqual([]);
    expect(freshOpening.previousSession?.items.map((item) => item.content)).toEqual([
      "I stopped midway",
      "Let's continue",
      "Previous session finished.",
    ]);
    expect(freshOpening.previousSession?.recoveryStartIndex).toBe(2);
    expect(freshOpening.recoveryHandoff).toBe("opening-next");
  });
});
