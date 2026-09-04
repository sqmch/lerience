/* The agent seam's shared vocabulary (SPEC §7, ADR-004): the normalized event
   stream every provider adapter emits and the renderer consumes. The renderer
   never sees provider shapes — an adapter maps its SDK's messages onto these
   and skips what it cannot express (ADR-011's legibility rule: unknown types
   skip, known-but-malformed raise).

   Deviation from SPEC §7's sketch, flag at review: `send()` does not return a
   per-turn AsyncIterable — the session exposes ONE lifetime `events` stream
   and `turn_complete` delimits turns. Session-level events (session_ended,
   auth errors between turns) have no turn to belong to, and the conductor
   pipes every event to the renderer over one IPC channel regardless. The
   opener also moved out of startSession: the conductor sends it as the first
   `send()`, so the opening turn's events flow like any other turn's. */

/** Why a session or turn failed, normalized across providers. */
export type AgentErrorCode =
  | "auth" // provider authentication invalid/expired — learner fixes in vendor flow
  | "rate-limit" // plan/usage limit reached
  | "turn-failed" // the turn errored; message kept, retry is sane
  | "process-exited"; // the agent process died outside a turn

export type AgentEvent =
  /** A chunk of the tutor's streaming reply text. */
  | { type: "message_delta"; delta: string }
  /** The tutor is doing tool work. Rendered as the live line of the waiting
   *  state — never raw JSON. `summary` is what is happening, in the present
   *  progressive ("Reading a file"); `detail` is the specific target when one
   *  can be shown safely (a course path, a search term, the model's own
   *  one-line description of a command — never the command itself). */
  | { type: "tool_activity"; name: string; summary: string; detail?: string }
  /** The agent surface asked permission for an action. The app renders an
   *  honest generic card (ADR-011: never an automatic refusal) and answers
   *  via `AgentSession.respondToApproval`. The turn is blocked until then.
   *
   *  `editWithinCourse` is the adapter's classification: a file-editing tool
   *  whose target resolves inside the course folder. It exists so the learner
   *  can grant those — and only those — for the rest of a session (course
   *  generation is dozens of file writes; a card per write is a gauntlet, not
   *  a trust moment). Anything else (commands, network, files elsewhere)
   *  always asks. */
  | {
      type: "approval_request";
      requestId: string;
      toolName: string;
      summary: string;
      editWithinCourse: boolean;
      /** For a command approval: the command itself, so the card can state the
       *  actual action (a permission prompt is a trust moment and never hides
       *  a command — DESIGN.md). The live activity line still never shows it. */
      command?: string;
      /** Where that command runs, when the provider says: course-relative
       *  inside the course folder, absolute outside it. Absent when it is the
       *  course folder itself or unknown. */
      cwd?: string;
    }
  /** Cumulative session cost in USD, when the provider reports it. */
  | { type: "usage_update"; totalCostUsd: number }
  /** A provider-reported subscription-limit warning. Healthy windows stay in
   *  the on-demand provider view; only warning/rejected becomes ambient. */
  | {
      type: "limit_warning";
      label: string;
      usedPercent: number | null;
      resetsAt: number | null;
      status: "warning" | "rejected";
    }
  /** The turn finished; the composer reopens. */
  | { type: "turn_complete" }
  /** The session is gone (ended deliberately or the process died). */
  | { type: "session_ended"; reason: "ended" | "died" }
  | { type: "error"; code: AgentErrorCode; message: string };

export interface StartSessionOptions {
  /** Absolute path of the course folder the agent runs in. */
  courseDir: string;
}

/** How hard the model is asked to think. Providers that have no such control
 *  report no levels and the app shows none. */
export type SessionEffort = "low" | "medium" | "high" | "xhigh" | "max";

export interface SessionModelOption {
  /** Opaque to the app — only the adapter interprets it. */
  id: string;
  label: string;
  description?: string;
  /** Effort levels this model accepts; empty when it has no effort control. */
  efforts: SessionEffort[];
}

/** How much the tutor may do without asking. Ids are the provider's own; the
 *  app never invents a mode or reorders the risk ladder. */
export interface SessionAutonomyOption {
  /** This offered mode runs without approval prompts; sandbox scope is unchanged. */
  skipsApprovalPrompts?: boolean;
  id: string;
  label: string;
  description: string;
}

/** Provider-owned filesystem/network scope, separate from approval prompts. */
export interface SessionAccessOption {
  id: string;
  label: string;
  description: string;
}

/**
 * What the learner may change about a running session, and what it is set to
 * now.
 *
 * The app OFFERS these; it never imposes them (ADR-004, ADR-018). A session
 * always starts on the learner's own provider configuration, and `current`
 * reports what that configuration actually resolved to — which is also the
 * only way the app can honestly tell the learner which model is answering.
 */
export interface SessionControls {
  models: SessionModelOption[];
  autonomy: SessionAutonomyOption[];
  access?: SessionAccessOption[];
  /** Learner-selected values that this provider can only apply when the next
   *  turn starts. `current` remains the provider-confirmed state until then. */
  pending?: SessionControlPatch;
  current: {
    model: string | null;
    effort: SessionEffort | null;
    autonomy: string | null;
    access?: string | null;
  };
}

/** Only the keys present are changed. `null` restores the provider default. */
export interface SessionControlPatch {
  model?: string | null;
  effort?: SessionEffort | null;
  autonomy?: string;
  access?: string;
}

export interface AgentSession {
  /** Every event the session emits, in order, for its whole lifetime.
   *  Completes after `session_ended`. Iterate once (the conductor does). */
  readonly events: AsyncIterable<AgentEvent>;
  /** True while a turn is in flight. The conductor checks this BEFORE
   *  persisting a learner message, so the durable transcript never records
   *  a message the provider refused to accept. */
  readonly busy: boolean;
  /** Send a learner message (the opener included — ADR-014's
   *  buildSessionOpener output is just the first send). One turn at a time:
   *  throws if a turn is already in flight. */
  send(message: string): void;
  /** Answer a pending approval_request. Unknown ids are ignored. */
  respondToApproval(requestId: string, allow: boolean, reason?: string): void;
  /** What the learner may change, and what it is set to now. Providers that
   *  expose nothing return empty lists rather than failing. */
  describeControls(): Promise<SessionControls>;
  /** Apply or stage a learner-initiated change and report the resulting state.
   *  Never persisted to the learner's own configuration (ADR-018). */
  applyControls(patch: SessionControlPatch): Promise<SessionControls>;
  /** Stop the in-flight turn without ending the session. */
  interrupt(): Promise<void>;
  /** End the session and release the process. Idempotent. */
  end(): Promise<void>;
}

export interface TutorAgent {
  readonly providerId: import("./provider").TutorProviderId;
  startSession(options: StartSessionOptions): AgentSession;
}
