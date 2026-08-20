/* The course view's docked conversation.
 *
 * There is ONE chat in this app, and this file is where that stops being a
 * promise. Behaviour comes from `use-seminar.ts` (it always did); the LOOK now
 * comes from `parts.tsx`, the same components the onboarding surface renders.
 * The D2 markup this column used to carry is gone with `course.css`'s
 * `.course-talk` family (ADR-019).
 *
 * The shared column provides the auto-growing composer, the session-control
 * pills (ADR-018), mid-turn sends
 * that queue instead of being refused, the session-scoped file-edit grant, the
 * silent-turn retry, and scroll pinning that survives late layout.
 *
 * What it loses: the TUTOR / YOU eyebrows. The two type voices are the labels —
 * the tutor speaks the reading face on the ground, the learner speaks sans in a
 * raised card. Screen readers still get both, via aria-label on the turns. */

import { useState, type ReactNode } from "react";
import { INSTRUMENT, PRIMARY, QUIET } from "../components/controls";
import { CloseGlyph } from "../components/glyphs";
import { Notice } from "../components/notice";
import {
  ApprovalCard,
  Composer,
  ConversationTranscript,
  FailureNotice,
  LimitNotice,
  ScrollEdgeFade,
  Thinking,
  conversationThinkingLabel,
  useFollowBottom,
} from "./parts";
import type { SeminarController } from "./use-seminar";

export function SeminarColumn({
  seminar,
  onboarding,
  onStart,
  head,
  notice,
  onDismissNotice,
}: {
  /** Created by the course view, not here: the status bar reads the same
   *  session, and two `useSeminar` calls would be two reducers over one real
   *  conversation. */
  seminar: SeminarController;
  onboarding: boolean;
  onStart: () => void;
  /** A control the head has room for and the material pane's tab row does
   *  not. The column stays ignorant of what it is. */
  head?: ReactNode;
  /** What `head`'s control could not fit — a failed editor launch, chiefly.
   *  Under the head rather than in the transcript: the transcript scrolls, and
   *  a message about a button should not scroll away from it. */
  notice?: string | null;
  onDismissNotice?: () => void;
}): React.JSX.Element {
  const { state, busy, recoveryPending } = seminar;
  const [draft, setDraft] = useState("");
  const { viewportRef, onScroll, showLatest, jumpToLatest } = useFollowBottom(state);
  const closed = state.phase === "closed" || state.phase === "opening";

  const sendDraft = async (): Promise<void> => {
    const text = draft;
    setDraft("");
    const sent = await seminar.send(text);
    if (!sent) setDraft(text);
  };

  return (
    /* No left border: the SEAM is the divider between these columns. A border
       here put a second rule a pixel from the seam's own, and the material
       pane's scrollbar track made it a third. One divider per division. */
    <section
      className="bg-surface flex min-h-0 min-w-0 flex-1 flex-col"
      aria-label="Course conversation"
    >
      {/* Head height matches the material pane's tab row so the two line up
          across the workspace. It names the column, and its right end is where
          the workspace's chrome controls go: the one session action that must
          not sit next to Send, and whatever the caller hands it. The tab row
          beside it is full at any width; this row is a heading and room. */}
      <header className="border-line-soft flex h-12 shrink-0 items-center gap-3 overflow-hidden border-b px-5">
        <h2 className="text-ink-dim shrink-0 text-xs font-medium">Seminar</h2>
        {/* `min-w-0` down the chain so a long editor name yields to the column
            instead of pushing "End session" out of it. */}
        <div className="ml-auto flex min-w-0 items-center gap-3">
          {head}
          {/* An instrument, like the editor handoff beside it. It was an
              underlined word, which put a text link and a control side by side
              in one row: two vocabularies, and two different heights, so the
              two labels did not even sit on the same line. */}
          {state.phase === "idle" ? (
            <button
              type="button"
              className={`${INSTRUMENT} shrink-0`}
              title="Wrap this session up: journal entry, quiz seeds, progress, commit"
              onClick={() => {
                void seminar.end();
              }}
            >
              <CloseGlyph className="size-3.5 shrink-0" />
              <span>End session</span>
            </button>
          ) : null}
        </div>
      </header>

      {notice === null || notice === undefined || onDismissNotice === undefined ? null : (
        <div className="shrink-0 px-5 pt-3.5">
          <Notice detail={notice} dismissLabel="Dismiss this notice" onDismiss={onDismissNotice} />
        </div>
      )}

      <div ref={viewportRef} className="min-h-0 flex-1 overflow-y-auto" onScroll={onScroll}>
        <div className="flex flex-col gap-5 px-5 pt-5 pb-8">
          {state.items.length === 0 && state.previousSession === null && !busy ? (
            <div className="flex flex-col gap-2 py-6">
              <p className="text-hi font-course text-lg font-semibold text-balance">
                {onboarding ? "Plan this course with your tutor" : "Your tutor, in this folder"}
              </p>
              <p className="text-ink-dim text-sm leading-normal text-pretty">
                {onboarding
                  ? "Start with what you want to learn, what you already know, and the time you can honestly give it."
                  : "It can read and adapt this course while you talk. Its work appears here; changes to your course files appear in the page beside it."}
              </p>
            </div>
          ) : null}

          <ConversationTranscript state={state} />

          {busy ? (
            <Thinking label={conversationThinkingLabel(state)} detail={state.toolActivity} />
          ) : null}

          {state.approval === null ? null : (
            <ApprovalCard
              approval={state.approval}
              answering={seminar.answering}
              onAnswer={(allow) => void seminar.answerApproval(allow)}
              onAllowEdits={() => {
                void seminar.allowCourseEdits();
              }}
            />
          )}

          {state.phase === "closed" && state.items.length > 0 ? (
            <p className="text-ink-faint before:bg-line-soft after:bg-line-soft flex items-center gap-3 text-xs before:h-(--stroke-hair) before:flex-1 before:content-[''] after:h-(--stroke-hair) after:flex-1 after:content-['']">
              {recoveryPending ? "Session paused" : "Session ended"}
            </p>
          ) : null}
        </div>
        <ScrollEdgeFade />

        {showLatest ? (
          <button
            type="button"
            className={`${QUIET} bg-surface-raised sticky bottom-4 left-1/2 -translate-x-1/2 px-3.5 py-1.5 text-xs shadow-popover`}
            onClick={jumpToLatest}
          >
            Jump to latest
          </button>
        ) : null}
      </div>

      {/* Not a footer: no rule, no second ground. The composer sits on the
          column's own surface, and the transcript fades out as it passes the
          bottom edge rather than being cut off by a bar. */}
      <div className="shrink-0 px-5 pt-3.5 pb-4">
        {state.limitWarning === null ? null : (
          <div className="mb-3">
            <LimitNotice warning={state.limitWarning} />
          </div>
        )}
        {state.failure === null ? null : (
          <div className="mb-3">
            <FailureNotice
              failure={state.failure}
              {...(state.failure.kind === "silent" && state.phase === "idle"
                ? {
                    onRetry: () => {
                      void seminar.retry();
                    },
                  }
                : {})}
            />
          </div>
        )}

        {closed ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-ink-dim text-sm leading-normal text-pretty">
              {recoveryPending
                ? "Your last session ended without a verified close. Your tutor reviews it before opening the next one."
                : "Open a tutor session in this course folder. Provider sign-in stays with your coding agent."}
            </p>
            <button
              type="button"
              className={`${PRIMARY} text-sm`}
              disabled={state.phase === "opening"}
              onClick={onStart}
            >
              {state.phase === "opening"
                ? recoveryPending
                  ? "Recovering…"
                  : "Opening…"
                : recoveryPending
                  ? "Recover previous session"
                  : "Start session"}
            </button>
          </div>
        ) : (
          <Composer
            draft={draft}
            onDraft={setDraft}
            onSend={() => void sendDraft()}
            onStop={seminar.interrupt}
            busy={busy}
            controls={seminar.controls}
            onControls={(patch) => void seminar.setControls(patch)}
            controlNotice={state.controlNotice}
            queued={seminar.queued}
            onUnqueue={seminar.unqueue}
            placeholder="Reply to your tutor…"
          />
        )}
      </div>
    </section>
  );
}
