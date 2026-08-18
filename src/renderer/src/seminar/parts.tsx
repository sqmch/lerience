/* The conversation's visible pieces, on utilities.
 *
 * These are the app's one set of chat components. Onboarding renders them
 * today; the course view's seminar column still carries its own D2 markup and
 * adopts these when that surface is rebuilt (its mock owns that moment). No
 * surface is half-migrated: this file is where the shared look LANDS, not a
 * second implementation of how a conversation behaves — behaviour lives in
 * use-seminar.ts and there is exactly one of it. */

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type {
  AgentEvent,
  SessionControlPatch,
  SessionControls,
  SessionEffort,
} from "../../../shared/seminar";
import { CourseMarkdown } from "../components/markdown-view";
import { Menu } from "../components/menu";
import { PRIMARY, QUIET } from "../components/controls";
import type { SeminarApproval, SeminarFailureKind, SeminarState } from "./seminar-state";
import { useSmoothedText } from "./use-smoothed-text";

/* No speaker labels: the tutor speaks Literata on the ground, the learner
   speaks sans in a raised card on the right. The two voices ARE the labels
   (screen readers still get them via aria-label). */

export function TutorTurn({
  content,
  streaming,
}: {
  content: string;
  streaming: boolean;
}): React.JSX.Element {
  const visible = useSmoothedText(content, streaming);
  return (
    <article className="animate-settle" aria-label="Tutor">
      {/* `prose` is the app's markdown stylesheet, shared by every surface that
          renders course words — the reading voice belongs to the course, not to
          whichever pane is showing it. */}
      <CourseMarkdown className="prose" markdown={visible} />
    </article>
  );
}

export function LearnerTurn({ content }: { content: string }): React.JSX.Element {
  return (
    <article
      className="bg-surface-raised border-line-soft animate-settle ml-auto w-fit max-w-(--measure-narrow) rounded-lg border px-4 py-2.5"
      aria-label="You"
    >
      <p className="text-ink text-md leading-normal whitespace-pre-wrap">{content}</p>
    </article>
  );
}

/** Waiting, said quietly, with the current tool work as an aligned second line
 *  when there is any. The dots breathe on the token duration; base.css
 *  neutralizes the whole thing under prefers-reduced-motion. */
export function Thinking({
  label,
  detail,
}: {
  label: string;
  detail?: string | null;
}): React.JSX.Element {
  return (
    <div className="text-ink-dim flex items-start gap-2.5 text-sm" aria-live="polite">
      {/* The dots sit on the label's first line: `items-baseline` aligned the
          dot BOXES to the text baseline, which parks a 4px dot below it. */}
      <span className="flex h-5 shrink-0 items-center gap-1" aria-hidden="true">
        <i className="bg-ink-faint animate-dot size-1 rounded-pill" />
        <i className="bg-ink-faint animate-dot size-1 rounded-pill [animation-delay:var(--dur-fast)]" />
        <i className="bg-ink-faint animate-dot size-1 rounded-pill [animation-delay:calc(var(--dur-fast)*2)]" />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span>{label}</span>
        {detail === undefined || detail === null ? null : (
          <span className="text-ink-faint font-data truncate text-2xs">{detail}</span>
        )}
      </span>
    </div>
  );
}

export function ApprovalCard({
  approval,
  answering,
  onAnswer,
  onAllowEdits,
}: {
  approval: SeminarApproval;
  answering: boolean;
  onAnswer: (allow: boolean) => void;
  /** Offered only for course-folder file edits: allow this one and every
   *  later one like it, until the session ends. */
  onAllowEdits?: () => void;
}): React.JSX.Element {
  return (
    /* No header: the Deny/Allow pair says what this card is. The summary is
       the whole message. */
    <div className="bg-surface-raised border-line rounded-lg border p-4">
      <p className="text-hi text-md text-pretty">{approval.summary}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={`${QUIET} text-sm`}
          disabled={answering}
          onClick={() => {
            onAnswer(false);
          }}
        >
          Deny
        </button>
        <button
          type="button"
          className={`${PRIMARY} text-sm`}
          disabled={answering}
          onClick={() => {
            onAnswer(true);
          }}
        >
          Allow
        </button>
        {approval.editWithinCourse && onAllowEdits !== undefined ? (
          <button
            type="button"
            className={`${QUIET} text-sm`}
            disabled={answering}
            title="Applies to file edits inside this course folder only, and resets when the session ends"
            onClick={onAllowEdits}
          >
            Allow file edits for this session
          </button>
        ) : null}
      </div>
    </div>
  );
}

function failureTitle(kind: SeminarFailureKind): string {
  if (kind === "auth") return "Your tutor needs you to sign in again";
  if (kind === "rate-limit") return "Your plan's usage limit is reached";
  if (kind === "silent") return "The tutor finished without saying anything";
  return "Your tutor is unavailable right now";
}

/** A failure the learner can act on. The retry is offered only where repeating
 *  the request is the actual remedy (a turn that answered nothing). */
export function FailureNotice({
  failure,
  onRetry,
  children,
}: {
  failure: { kind: SeminarFailureKind; message: string };
  onRetry?: () => void;
  children?: ReactNode;
}): React.JSX.Element {
  return (
    <div
      className="bg-surface-panel border-line border-l-bad rounded-lg border border-l-2 p-4"
      role="alert"
    >
      <p className="text-hi text-md font-bold">{failureTitle(failure.kind)}</p>
      <p className="text-ink-dim mt-1.5 text-sm leading-normal text-pretty">{failure.message}</p>
      {onRetry === undefined && children === undefined ? null : (
        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          {onRetry === undefined ? null : (
            <button type="button" className={`${PRIMARY} text-sm`} onClick={onRetry}>
              Ask again
            </button>
          )}
          {children}
        </div>
      )}
    </div>
  );
}

export function LimitNotice({
  warning,
}: {
  warning: Extract<AgentEvent, { type: "limit_warning" }>;
}): React.JSX.Element {
  const reset =
    warning.resetsAt === null
      ? null
      : new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(
          new Date(warning.resetsAt * 1_000),
        );
  return (
    <div
      className="border-warn bg-surface-panel flex items-baseline gap-2 rounded-md border px-3 py-2 text-xs"
      role={warning.status === "rejected" ? "alert" : "status"}
    >
      <span className="text-hi font-medium">{warning.label}</span>
      <span className="text-ink-dim ml-auto text-right">
        {warning.usedPercent === null
          ? warning.status === "rejected"
            ? "Limit reached"
            : "Nearly reached"
          : `${String(Math.round(warning.usedPercent))}% used`}
        {reset === null ? null : ` · resets ${reset}`}
      </span>
    </div>
  );
}

/** What the learner may change about the running session, in the composer's
 *  own row: which model answers, how hard it thinks, and how much it may do
 *  without asking. Nothing here is imposed — every value starts as whatever
 *  the learner's own provider configuration resolved to (ADR-018). */
export function SessionControlBar({
  controls,
  onChange,
  notice,
}: {
  controls: SessionControls;
  onChange: (patch: SessionControlPatch) => void;
  notice?: SeminarState["controlNotice"];
}): React.JSX.Element | null {
  const selected = { ...controls.current, ...controls.pending };
  const model = controls.models.find((candidate) => candidate.id === selected.model);
  const efforts = model?.efforts ?? [];
  if (controls.models.length === 0 && controls.autonomy.length === 0) return null;

  const pendingLabels: string[] = [];
  if (controls.pending?.model !== undefined) {
    pendingLabels.push(model?.label ?? controls.pending.model ?? "Default model");
  }
  if (controls.pending?.effort !== undefined) {
    pendingLabels.push(
      controls.pending.effort === null ? "Default effort" : EFFORT_LABELS[controls.pending.effort],
    );
  }
  if (controls.pending?.autonomy !== undefined) {
    pendingLabels.push(
      controls.autonomy.find((mode) => mode.id === controls.pending?.autonomy)?.label ??
        controls.pending.autonomy,
    );
  }
  const pendingMessage =
    pendingLabels.length === 0
      ? null
      : pendingLabels.length === 1
        ? `${pendingLabels[0]} applies to your next reply.`
        : "Your selected settings apply to your next reply.";

  return (
    <div className="min-w-0 flex-1">
      <div className="flex min-w-0 items-center gap-0.5 overflow-hidden">
        {controls.autonomy.length === 0 ? null : (
          <Menu
            label="How much your tutor may do without asking"
            value={selected.autonomy}
            options={controls.autonomy.map((mode) => ({
              value: mode.id,
              label: mode.label,
              description: mode.description,
            }))}
            onChange={(autonomy) => {
              onChange({ autonomy });
            }}
          />
        )}
        {controls.models.length === 0 ? null : (
          <Menu
            label="Which model answers in this session"
            value={selected.model}
            /* When the provider reports a model the app has no row for, the
             trigger shows that id rather than claiming "default" — the
             learner must always be able to see what is actually answering. */
            trigger={model?.label ?? selected.model ?? "Model"}
            options={controls.models.map((option) => ({
              value: option.id,
              label: option.label,
              ...(option.description === undefined ? {} : { description: option.description }),
            }))}
            onChange={(id) => {
              onChange({ model: id });
            }}
          />
        )}
        {efforts.length === 0 ? null : (
          <Menu
            label="How hard the model thinks before answering"
            value={selected.effort}
            trigger={selected.effort === null ? "Default effort" : EFFORT_LABELS[selected.effort]}
            options={efforts.map((level) => ({ value: level, label: EFFORT_LABELS[level] }))}
            onChange={(effort) => {
              onChange({ effort });
            }}
          />
        )}
      </div>
      {notice === undefined || notice === null ? (
        pendingMessage === null ? null : (
          <p className="text-ink-faint px-1 pt-1 text-2xs" role="status">
            {pendingMessage}
          </p>
        )
      ) : (
        <p className="text-bad px-1 pt-1 text-2xs" role="alert">
          {notice.message}
        </p>
      )}
    </div>
  );
}

const EFFORT_LABELS: Record<SessionEffort, string> = {
  low: "Low effort",
  medium: "Medium effort",
  high: "High effort",
  xhigh: "Very high effort",
  max: "Max effort",
};

/** The prompt box. Grows with its content up to a reading-height cap, stays
 *  typeable while the tutor works (only Send waits), and keeps focus through a
 *  send — losing the caret after every message is the single fastest way to
 *  make a conversation feel like a form. The field suppresses its own focus
 *  ring; the CONTAINER carries it, because the rounded card is the control the
 *  learner sees. */
export function Composer({
  draft,
  onDraft,
  onSend,
  onStop,
  busy,
  placeholder,
  controls,
  onControls,
  controlNotice,
  queued,
  onUnqueue,
}: {
  draft: string;
  onDraft: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  busy: boolean;
  placeholder: string;
  controls?: SessionControls | null;
  onControls?: (patch: SessionControlPatch) => void;
  controlNotice?: SeminarState["controlNotice"];
  queued?: string | null;
  onUnqueue?: () => void;
}): React.JSX.Element {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const send = (): void => {
    if (draft.trim() === "") return;
    onSend();
    inputRef.current?.focus();
  };

  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {queued === undefined || queued === null ? null : (
        <div className="border-line bg-surface-panel text-ink-dim flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm">
          <span className="flex h-5 shrink-0 items-center" aria-hidden="true">
            <i className="bg-attention animate-dot size-1.5 rounded-pill" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-ink-faint block text-2xs">Sending when the tutor finishes</span>
            <span className="line-clamp-2 whitespace-pre-wrap">{queued}</span>
          </span>
          {onUnqueue === undefined ? null : (
            <button
              type="button"
              className="text-ink-faint hover:text-hi shrink-0 text-2xs underline underline-offset-4"
              onClick={onUnqueue}
            >
              Cancel
            </button>
          )}
        </div>
      )}
      {/* One soft surface that IS the input — no field-in-a-box. The whole card
          focuses the textarea on click, and focus reads as a quiet border
          brightening, nothing louder. */}
      <div
        className="bg-surface-raised border-line focus-within:border-ink-faint flex cursor-text flex-col rounded-lg border transition-colors"
        onClick={(event) => {
          if (event.target === event.currentTarget) inputRef.current?.focus();
        }}
      >
        <label className="sr-only" htmlFor="seminar-message">
          Message your tutor
        </label>
        <textarea
          id="seminar-message"
          ref={inputRef}
          className="text-hi placeholder:text-ink-faint max-h-44 min-h-6 resize-none border-0 bg-transparent px-4 pt-3.5 pb-1 text-md leading-normal outline-none field-sizing-content"
          rows={1}
          value={draft}
          placeholder={placeholder}
          onChange={(event) => {
            onDraft(event.target.value);
          }}
          onKeyDown={keyDown}
        />
        <div className="flex items-center gap-2 px-2.5 pt-1 pb-2.5">
          {controls === undefined || controls === null || onControls === undefined ? null : (
            <SessionControlBar controls={controls} onChange={onControls} notice={controlNotice} />
          )}
          {busy && onStop !== undefined ? (
            <button
              type="button"
              className="border-line-strong text-ink hover:bg-accent-wash hover:border-ink-faint focus-visible:outline-focus ml-auto grid size-8 shrink-0 place-items-center rounded-pill border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
              title="Stop this turn"
              onClick={onStop}
            >
              <span className="sr-only">Stop</span>
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <rect x="1" y="1" width="8" height="8" rx="1.5" fill="currentColor" />
              </svg>
            </button>
          ) : null}
          <button
            type="button"
            className={
              busy && onStop !== undefined
                ? "bg-accent text-accent-ink focus-visible:outline-focus grid size-8 shrink-0 place-items-center rounded-pill transition-[filter,opacity] hover:brightness-95 disabled:opacity-35 disabled:hover:brightness-100 focus-visible:outline-2 focus-visible:outline-offset-2"
                : "bg-accent text-accent-ink focus-visible:outline-focus ml-auto grid size-8 shrink-0 place-items-center rounded-pill transition-[filter,opacity] hover:brightness-95 disabled:opacity-35 disabled:hover:brightness-100 focus-visible:outline-2 focus-visible:outline-offset-2"
            }
            disabled={draft.trim() === ""}
            /* Sending mid-turn is allowed: the message waits its turn rather
               than being refused, which is what every agent CLI does. */
            title={busy ? "Send when the tutor finishes" : "Send"}
            onClick={send}
          >
            <span className="sr-only">Send</span>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path
                d="M6 10V2M6 2L2.5 5.5M6 2l3.5 3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

/** Keeps a growing transcript pinned to the newest words unless the reader has
 *  scrolled away — then it offers to catch them up instead of yanking them.
 *  `signals` is for content that lives OUTSIDE the conversation state — an arc
 *  card mounting, a build list growing — which must pull the view down exactly
 *  the way a new message does, or it appears half off the bottom edge. */
export function useFollowBottom(
  state: SeminarState,
  signals: readonly unknown[] = [],
): {
  viewportRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  showLatest: boolean;
  jumpToLatest: () => void;
} {
  const viewportRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const [showLatest, setShowLatest] = useState(false);

  /* The real pinning mechanism: whatever makes the content taller (streamed
     words, a card mounting, markdown finishing layout, fonts landing) resizes
     the scroll content, and the observer re-pins. React deps alone fire BEFORE
     layout settles, which is exactly how a mounting card ends up half off the
     bottom edge. */
  useEffect(() => {
    const viewport = viewportRef.current;
    const content = viewport?.firstElementChild;
    if (viewport == null || content == null) return;
    const observer = new ResizeObserver(() => {
      if (nearBottom.current) viewport.scrollTop = viewport.scrollHeight;
    });
    observer.observe(content);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null) return;
    if (nearBottom.current) {
      viewport.scrollTop = viewport.scrollHeight;
      setShowLatest(false);
    } else {
      setShowLatest(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- signals is spread on purpose
  }, [state.items, state.toolActivity, state.approval, state.failure, ...signals]);

  return {
    viewportRef,
    showLatest,
    onScroll: () => {
      const viewport = viewportRef.current;
      if (viewport === null) return;
      const distance = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      nearBottom.current = distance <= viewport.clientHeight / 4;
      if (nearBottom.current) setShowLatest(false);
    },
    jumpToLatest: () => {
      const viewport = viewportRef.current;
      if (viewport === null) return;
      viewport.scrollTop = viewport.scrollHeight;
      nearBottom.current = true;
      setShowLatest(false);
    },
  };
}
