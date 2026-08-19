import type { AgentErrorCode, AgentEvent } from "../../../shared/seminar";
import type { SeminarLifecycle, SeminarSnapshot } from "../../../shared/session";

export type SeminarPhase =
  "closed" | "opening" | "idle" | "thinking" | "streaming" | "tool-activity";

export type SeminarFailureKind = "auth" | "rate-limit" | "unavailable" | "silent";

export interface TranscriptTurn {
  id: string;
  role: "learner" | "tutor";
  content: string;
  streaming: boolean;
}

export type RecoveryHandoff = "none" | "finishing-previous" | "opening-next";

export interface PreviousSessionTranscript {
  sessionId: string;
  items: TranscriptTurn[];
  /** The first turn produced by the recovery close. Earlier turns are the
   *  conversation the learner returned to. */
  recoveryStartIndex: number | null;
}

export interface SeminarApproval {
  requestId: string;
  toolName: string;
  summary: string;
  /** A file edit inside the course folder — the only class the learner may
   *  grant for the rest of the session. */
  editWithinCourse: boolean;
}

export interface SeminarState {
  phase: SeminarPhase;
  lifecycle: SeminarLifecycle;
  sessionId: string | null;
  items: TranscriptTurn[];
  /** The sealed transcript kept on screen while its fresh successor opens. */
  previousSession: PreviousSessionTranscript | null;
  recoveryStartIndex: number | null;
  recoveryHandoff: RecoveryHandoff;
  toolActivity: string | null;
  approval: SeminarApproval | null;
  totalCostUsd: number;
  limitWarning: Extract<AgentEvent, { type: "limit_warning" }> | null;
  failure: { kind: SeminarFailureKind; message: string } | null;
  /** A recoverable failure scoped to the composer's session controls. It must
   *  never imply that the tutor or conversation failed. */
  controlNotice: { kind: "error"; message: string } | null;
  nextItemId: number;
  /** Whether the turn in flight has produced anything the learner can see.
   *  A turn that completes having produced nothing is the failure this tracks:
   *  it looks exactly like success to every other signal (no error, a cost, a
   *  completion), so only the absence of content reveals it. */
  turnProducedContent: boolean;
}

export type SeminarAction =
  | { type: "hydrate"; snapshot: SeminarSnapshot }
  | { type: "open_started" }
  | { type: "open_succeeded" }
  | { type: "open_failed"; message: string }
  | { type: "retry_started" }
  | { type: "submit_learner"; id: string; text: string }
  | { type: "submit_failed"; id: string; message: string }
  | { type: "approval_answered" }
  | { type: "approval_failed"; message: string }
  | { type: "control_change_started" }
  | { type: "control_change_succeeded" }
  | { type: "control_change_failed"; message: string }
  | { type: "event"; event: AgentEvent }
  | { type: "clear_failure" };

export function createSeminarState(): SeminarState {
  return {
    phase: "closed",
    lifecycle: "closed",
    sessionId: null,
    items: [],
    previousSession: null,
    recoveryStartIndex: null,
    recoveryHandoff: "none",
    toolActivity: null,
    approval: null,
    totalCostUsd: 0,
    limitWarning: null,
    failure: null,
    controlNotice: null,
    nextItemId: 1,
    turnProducedContent: false,
  };
}

const SILENT_TURN_MESSAGE =
  "The turn finished, but no reply came back. Asking again usually resolves it; " +
  "your course folder and this conversation are intact.";

function finalizeStreamingTutor(items: readonly TranscriptTurn[]): TranscriptTurn[] {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item?.role === "tutor" && item.streaming) {
      return items.map((candidate, candidateIndex) =>
        candidateIndex === index ? { ...item, streaming: false } : candidate,
      );
    }
  }
  return [...items];
}

function appendTutorDelta(state: SeminarState, delta: string): SeminarState {
  const last = state.items.at(-1);
  if (last?.role === "tutor" && last.streaming) {
    return {
      ...state,
      phase: "streaming",
      toolActivity: null,
      failure: null,
      turnProducedContent: true,
      items: state.items.map((item, index) =>
        index === state.items.length - 1 ? { ...last, content: last.content + delta } : item,
      ),
    };
  }

  return {
    ...state,
    phase: "streaming",
    toolActivity: null,
    failure: null,
    turnProducedContent: true,
    nextItemId: state.nextItemId + 1,
    items: [
      ...state.items,
      {
        id: `tutor-${String(state.nextItemId)}`,
        role: "tutor",
        content: delta,
        streaming: true,
      },
    ],
  };
}

function failureKind(code: AgentErrorCode): SeminarFailureKind {
  if (code === "auth") return "auth";
  if (code === "rate-limit") return "rate-limit";
  return "unavailable";
}

function reduceEvent(state: SeminarState, event: AgentEvent): SeminarState {
  if (event.type === "message_delta") return appendTutorDelta(state, event.delta);

  if (event.type === "tool_activity") {
    return {
      ...state,
      phase: "tool-activity",
      items: finalizeStreamingTutor(state.items),
      toolActivity: event.summary,
      failure: null,
      turnProducedContent: true,
    };
  }

  if (event.type === "approval_request") {
    return {
      ...state,
      phase: "tool-activity",
      items: finalizeStreamingTutor(state.items),
      toolActivity: event.summary,
      turnProducedContent: true,
      approval: {
        requestId: event.requestId,
        toolName: event.toolName,
        summary: event.summary,
        editWithinCourse: event.editWithinCourse,
      },
    };
  }

  if (event.type === "usage_update") {
    // Provider usage is cumulative for the lifetime of the session.
    return { ...state, totalCostUsd: event.totalCostUsd };
  }

  if (event.type === "limit_warning") {
    return { ...state, limitWarning: event };
  }

  if (event.type === "turn_complete") {
    // The close ritual's own turns are the conductor's business and end the
    // session either way; only a live conversational turn can strand a learner
    // in front of silence.
    const closing = state.lifecycle === "recovering" || state.lifecycle === "wrapping";
    const silent = !closing && !state.turnProducedContent;
    return {
      ...state,
      phase: closing ? "thinking" : "idle",
      recoveryHandoff: state.recoveryHandoff === "opening-next" ? "none" : state.recoveryHandoff,
      items: finalizeStreamingTutor(state.items),
      toolActivity: null,
      approval: null,
      // A completed turn does not clear a failure it already reported: the
      // adapter emits the error and the completion together, so clearing here
      // would erase the explanation in the same tick it arrived.
      failure: silent ? { kind: "silent", message: SILENT_TURN_MESSAGE } : state.failure,
      turnProducedContent: false,
    };
  }

  if (event.type === "session_ended") {
    return {
      ...state,
      phase: "closed",
      lifecycle: "closed",
      recoveryHandoff: "none",
      items: finalizeStreamingTutor(state.items),
      toolActivity: null,
      approval: null,
      limitWarning: null,
      failure:
        event.reason === "died" && state.failure === null
          ? { kind: "unavailable", message: "The tutor session ended unexpectedly." }
          : state.failure,
    };
  }

  return {
    ...state,
    phase: state.phase === "closed" ? "closed" : "idle",
    items: finalizeStreamingTutor(state.items),
    toolActivity: null,
    approval: null,
    // An error explains the silence better than the silence does, and the
    // turn_complete that follows it must not overwrite it.
    turnProducedContent: true,
    failure: { kind: failureKind(event.code), message: event.message },
  };
}

export function seminarReducer(state: SeminarState, action: SeminarAction): SeminarState {
  if (action.type === "hydrate") {
    const { snapshot } = action;
    // A snapshot read at mount can land AFTER a start has been requested. It
    // describes the world before that start, so honouring it would report "no
    // session" over a session that is opening — and since auto-start only fires
    // once, the surface would then wait forever for a tutor already at work.
    if (state.phase === "opening" && snapshot.lifecycle === "closed") return state;
    const items = snapshot.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      /* A partial message is one the tutor is still writing. Hydrating it as
         finished would make the next delta start a SECOND bubble, splitting
         one paragraph in two — which is what a surface swap mid-stream would
         otherwise look like. */
      streaming: message.partial,
    }));
    const sessionChanged =
      state.sessionId !== null &&
      snapshot.sessionId !== null &&
      state.sessionId !== snapshot.sessionId;
    const recoveryChangedSession = sessionChanged && state.recoveryHandoff !== "none";
    const previousSession =
      recoveryChangedSession && state.sessionId !== null
        ? {
            sessionId: state.sessionId,
            items: finalizeStreamingTutor(state.items),
            recoveryStartIndex: state.recoveryStartIndex,
          }
        : sessionChanged
          ? null
          : state.previousSession;
    let recoveryHandoff = state.recoveryHandoff;
    if (snapshot.lifecycle === "close-failed") {
      recoveryHandoff = "none";
    } else if (snapshot.lifecycle === "recovering" || snapshot.lifecycle === "wrapping") {
      recoveryHandoff = "finishing-previous";
    } else if (recoveryChangedSession) {
      recoveryHandoff = "opening-next";
    } else if (snapshot.lifecycle === "closed" && state.recoveryHandoff === "finishing-previous") {
      // The recovery transcript is sealed before its provider process drains
      // and the successor is created. Keep one continuous waiting state.
      recoveryHandoff = "opening-next";
    }
    // Transcript ids are minted from the store's entry sequence, which skips
    // operator/lifecycle records — so ids run AHEAD of the message count.
    // Seeding from length would re-mint an existing id for the first locally
    // streamed turn (duplicate React keys). Seed past the largest suffix seen.
    const largestSeenId = items.reduce((largest, item) => {
      const suffix = /-(\d+)$/.exec(item.id);
      return suffix === null ? largest : Math.max(largest, Number(suffix[1]));
    }, items.length);
    const failure =
      snapshot.lifecycle === "close-failed"
        ? {
            kind: "unavailable" as const,
            message: snapshot.detail ?? "The previous session did not close cleanly.",
          }
        : state.failure;
    return {
      ...state,
      lifecycle: snapshot.lifecycle,
      sessionId: snapshot.sessionId,
      phase:
        snapshot.lifecycle === "open"
          ? snapshot.turnInProgress ||
            state.phase === "opening" ||
            recoveryHandoff === "opening-next"
            ? !sessionChanged && (state.phase === "streaming" || state.phase === "tool-activity")
              ? state.phase
              : "thinking"
            : "idle"
          : snapshot.lifecycle === "opening" ||
              snapshot.lifecycle === "recovering" ||
              snapshot.lifecycle === "wrapping" ||
              recoveryHandoff === "opening-next"
            ? "thinking"
            : "closed",
      items,
      previousSession,
      recoveryStartIndex: recoveryChangedSession ? null : state.recoveryStartIndex,
      recoveryHandoff,
      toolActivity: null,
      approval: null,
      totalCostUsd: snapshot.totalCostUsd,
      failure,
      nextItemId: largestSeenId + 1,
      // A rehydrated conversation has already shown the learner something, so
      // only a turn started AFTER this point can be judged silent. Mounting
      // mid-turn (the onboarding surface handing over to the course view) must
      // never accuse a turn whose words simply predate this component.
      turnProducedContent: sessionChanged
        ? items.length > 0
        : items.length > 0
          ? true
          : state.turnProducedContent,
    };
  }

  if (action.type === "open_started") {
    const recovering = state.lifecycle === "recoverable" || state.lifecycle === "close-failed";
    return {
      ...(recovering ? state : createSeminarState()),
      phase: "opening",
      lifecycle: "opening",
      recoveryStartIndex: recovering ? state.items.length : null,
      recoveryHandoff: recovering ? "finishing-previous" : "none",
      failure: null,
      turnProducedContent: false,
    };
  }

  if (action.type === "retry_started") {
    return { ...state, phase: "thinking", failure: null, turnProducedContent: false };
  }

  if (action.type === "open_succeeded") {
    // A fast provider event may arrive before the invoke reply. Never move an
    // already-streaming opening turn backwards to "thinking".
    return state.phase === "opening"
      ? { ...state, phase: "thinking", lifecycle: "opening" }
      : state;
  }

  if (action.type === "open_failed") {
    return {
      ...state,
      phase: "closed",
      lifecycle: "closed",
      recoveryHandoff: "none",
      failure: { kind: "unavailable", message: action.message },
    };
  }

  if (action.type === "submit_learner") {
    return {
      ...state,
      phase: "thinking",
      lifecycle: "open",
      recoveryHandoff: "none",
      toolActivity: null,
      approval: null,
      failure: null,
      turnProducedContent: false,
      items: [
        ...state.items,
        {
          id: action.id,
          role: "learner",
          content: action.text,
          streaming: false,
        },
      ],
    };
  }

  if (action.type === "submit_failed") {
    return {
      ...state,
      phase: "idle",
      items: state.items.filter((item) => item.id !== action.id),
      failure: { kind: "unavailable", message: action.message },
    };
  }

  if (action.type === "approval_answered") {
    // The answer resumes the same turn, which has already produced content.
    return { ...state, phase: "thinking", toolActivity: null, approval: null, failure: null };
  }

  if (action.type === "approval_failed") {
    return {
      ...state,
      phase: "tool-activity",
      failure: { kind: "unavailable", message: action.message },
    };
  }

  if (action.type === "control_change_started" || action.type === "control_change_succeeded") {
    return { ...state, controlNotice: null };
  }

  if (action.type === "control_change_failed") {
    return {
      ...state,
      controlNotice: { kind: "error", message: action.message },
    };
  }

  if (action.type === "event") return reduceEvent(state, action.event);
  if (action.type === "clear_failure") return { ...state, failure: null };
  return state;
}
