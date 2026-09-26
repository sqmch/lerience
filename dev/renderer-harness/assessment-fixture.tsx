/* Development-only assessment preview. All course material and feedback are
   original synthetic examples. State lives in this mounted fixture only. */
import { useReducer, useRef, useState } from "react";
import type { CourseSnapshot } from "../../src/shared/ipc";
import { CourseView } from "../../src/renderer/src/course/course-view";
import { PRIMARY, GHOST } from "../../src/renderer/src/components/controls";
import { Menu } from "../../src/renderer/src/components/menu";
import {
  assessmentReducer,
  initialAssessment,
  PREVIEW_STATES,
  TRACE_FIELDS,
  validateAnswers,
  type AssessmentState,
  type AssessmentAction,
  type Attempt,
  type Help,
  type PreviewState,
} from "./assessment-state";

const MODULE_ID = "01-tracing-changes";
export const ASSESSMENT_COURSE: CourseSnapshot = {
  rootPath: "C:\\PraxeumFixture\\Courses\\State changes",
  folderName: "State changes",
  data: {
    title: "Making sense of state changes",
    currentModuleId: MODULE_ID,
    learner: { profile: "Synthetic learner", paceHoursPerWeek: "3", started: "2026-01-01" },
    unreadableModuleIds: [],
    quiz: [],
    journal: [],
    labs: [],
    labClaims: [],
    files: [],
    courseDoc: null,
    modules: [
      {
        id: "00-reading-state",
        title: "Reading a state",
        phase: 0,
        phaseName: "Follow the change",
        runtime: "",
        estimatedHours: 0.5,
        status: "completed",
        bossCheck: false,
        hasVisual: false,
        hasChecks: false,
        hasScaffold: false,
        checkAttempts: 0,
        hintsUsed: [],
        lessonPath: null,
        briefPath: null,
        quizPath: null,
      },
      {
        id: MODULE_ID,
        title: "Tracing changes",
        phase: 0,
        phaseName: "Follow the change",
        runtime: "",
        estimatedHours: 0.5,
        status: "in-progress",
        bossCheck: false,
        hasVisual: false,
        hasChecks: false,
        hasScaffold: false,
        checkAttempts: 0,
        hintsUsed: [],
        lessonPath: `curriculum/${MODULE_ID}/LESSON.md`,
        briefPath: `curriculum/${MODULE_ID}/BRIEF.md`,
        quizPath: null,
      },
      {
        id: "02-changing-the-rule",
        title: "Changing the rule",
        phase: 0,
        phaseName: "Follow the change",
        runtime: "",
        estimatedHours: 0.5,
        status: "not-started",
        bossCheck: false,
        hasVisual: false,
        hasChecks: false,
        hasScaffold: false,
        checkAttempts: 0,
        hintsUsed: [],
        lessonPath: null,
        briefPath: null,
        quizPath: null,
      },
    ],
  },
};

export function readAssessmentDoc(path: string): string | null {
  if (path === `curriculum/${MODULE_ID}/LESSON.md`)
    return `# A change starts with the previous state

A bin has a fixed capacity. When tokens arrive, keep as many as fit and discard the excess.
When tokens leave, the stored count cannot fall below zero.

For example, a bin with capacity 5 starts with 3 tokens. Adding 1 leaves 4 stored. Adding
another 3 leaves 5 stored and spills 2. Each event starts where the previous event finished.

In the Brief, trace a different sequence and explain the last change.`;
  if (path === `curriculum/${MODULE_ID}/BRIEF.md`) return "# Trace the token bin";
  return null;
}

const HELP_OPTIONS: { value: Help; label: string }[] = [
  { value: "unknown", label: "Not recorded" },
  { value: "none", label: "No help used" },
  { value: "hint", label: "Used a hint or example" },
];
const FIELD =
  "bg-surface-input border-line-strong text-hi placeholder:text-ink-faint focus:outline-focus rounded-pill border px-4 py-2 text-md focus:border-transparent focus:outline-2 focus:-outline-offset-1";

function correctCount(attempt: Attempt): number {
  return TRACE_FIELDS.filter((field) => Number(attempt.answers[field.id]) === field.expected)
    .length;
}

export function AssessmentResponse({
  state,
  dispatch,
}: {
  state: AssessmentState;
  dispatch: React.Dispatch<AssessmentAction>;
}): React.JSX.Element {
  const form = useRef<HTMLFormElement>(null);
  const feedback = useRef<HTMLHeadingElement>(null);
  const firstInput = useRef<HTMLInputElement>(null);
  const attempt = state.attempts.find((entry) => entry.id === state.current);
  const submitted = attempt !== undefined;
  const hasErrors = Object.keys(state.errors).length > 0;
  const hasDraft = Object.values(state.answers).some(Boolean);

  return (
    <article aria-label="Trace the token bin" className="text-ink">
      <h1 className="font-course text-hi text-2xl font-semibold leading-tight text-balance">
        Trace the token bin
      </h1>
      <p className="font-course mt-4 text-read leading-read text-pretty">
        A bin holds up to <strong className="text-hi font-semibold">6 tokens</strong> and starts
        with 2. Follow the events in order. Additions spill when the bin is full; removals stop at
        zero.
      </p>
      <p className="text-ink-dim mt-3 text-sm leading-normal">
        Record the count after each change, then explain the last one.
      </p>

      <form
        ref={form}
        noValidate
        className="mt-7"
        onSubmit={(event) => {
          event.preventDefault();
          if (submitted || state.saveFailed) return;
          const firstError = Object.keys(validateAnswers(state.answers))[0];
          dispatch({ type: "submit" });
          requestAnimationFrame(() => {
            if (firstError)
              form.current?.querySelector<HTMLElement>(`#assessment-${firstError}`)?.focus();
            else feedback.current?.focus();
          });
        }}
      >
        {state.afterFeedback && !submitted ? (
          <p className="text-ink-dim mb-4 text-sm">
            Revising after feedback. Your earlier answer is kept below.
          </p>
        ) : null}
        {hasErrors ? (
          <p role="alert" className="text-bad mb-4 text-sm">
            Check the marked answers before submitting.
          </p>
        ) : null}
        <div className="border-line-soft flex items-baseline justify-between gap-4 border-b pb-2 text-xs text-ink-dim">
          <span>Event</span>
          <span>Tokens stored</span>
        </div>
        {TRACE_FIELDS.map((field, index) => (
          <div key={field.id} className={index === 3 ? "pt-4" : "border-line-soft border-b py-3"}>
            <div className="flex items-center justify-between gap-4">
              <label
                htmlFor={`assessment-${field.id}`}
                className="font-course min-w-0 text-md leading-normal"
              >
                {field.label}
              </label>
              {submitted ? (
                <span className="font-data text-hi w-20 shrink-0 text-center text-md tabular-nums">
                  {state.answers[field.id]}
                </span>
              ) : (
                <input
                  ref={index === 0 ? firstInput : undefined}
                  id={`assessment-${field.id}`}
                  inputMode="numeric"
                  autoComplete="off"
                  aria-label={field.label}
                  aria-invalid={state.errors[field.id] !== undefined}
                  aria-describedby={state.errors[field.id] ? `error-${field.id}` : undefined}
                  className={`${FIELD} w-20 shrink-0 text-center tabular-nums`}
                  value={state.answers[field.id]}
                  onChange={(event) =>
                    dispatch({ type: "edit", field: field.id, value: event.target.value })
                  }
                />
              )}
            </div>
            {state.errors[field.id] ? (
              <p id={`error-${field.id}`} className="text-bad mt-2 text-sm">
                {state.errors[field.id]}
              </p>
            ) : null}
          </div>
        ))}

        <div className="mt-7">
          <label
            htmlFor="assessment-explanation"
            className="font-course text-hi block text-lg font-medium"
          >
            Why does the last addition spill?
          </label>
          <p id="explanation-help" className="text-ink-dim mt-1.5 text-sm leading-normal">
            Explain what was in the bin just before it, and what happens to the incoming tokens.
          </p>
          {submitted ? (
            <p className="font-course mt-4 whitespace-pre-wrap break-words text-read leading-read">
              {state.answers.explanation}
            </p>
          ) : (
            <textarea
              id="assessment-explanation"
              rows={4}
              value={state.answers.explanation}
              aria-describedby={
                state.errors.explanation ? "explanation-help error-explanation" : "explanation-help"
              }
              aria-invalid={state.errors.explanation !== undefined}
              className="bg-surface-input border-line-strong text-ink focus:outline-focus mt-3 block w-full resize-y rounded-lg border px-4 py-3 text-md leading-normal focus:border-transparent focus:outline-2 focus:-outline-offset-1"
              onChange={(event) =>
                dispatch({ type: "edit", field: "explanation", value: event.target.value })
              }
            />
          )}
          {state.errors.explanation ? (
            <p id="error-explanation" className="text-bad mt-2 text-sm">
              {state.errors.explanation}
            </p>
          ) : null}
        </div>

        {!submitted ? (
          <>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <span className="text-ink-dim text-xs">Help used</span>
                <Menu
                  label="Help used"
                  value={state.help}
                  options={HELP_OPTIONS}
                  onChange={(value) => dispatch({ type: "help", value })}
                />
              </div>
              <p className="text-ink-faint text-xs" role="status">
                {state.saveFailed
                  ? "Draft not saved"
                  : hasDraft
                    ? "Draft held in memory"
                    : "No answers yet"}
              </p>
            </div>
            {state.saveFailed ? (
              <div role="alert" className="border-warn mt-4 border-l-2 pl-4">
                <p className="text-warn text-sm">
                  Simulated save failure. Your answers are still here.
                </p>
                <p className="text-ink-dim mt-1 text-sm">
                  Retry before submitting. This preview does not write to disk.
                </p>
                <button
                  type="button"
                  className={`${PRIMARY} mt-3 text-sm`}
                  onClick={() => dispatch({ type: "retry-save" })}
                >
                  Retry save
                </button>
              </div>
            ) : (
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button type="submit" className={`${PRIMARY} text-sm`}>
                  Submit answers
                </button>
                {state.attempts.length ? (
                  <button
                    type="button"
                    className={`${GHOST} text-sm`}
                    aria-expanded={state.historyOpen}
                    aria-controls="assessment-history"
                    onClick={() => dispatch({ type: "history" })}
                  >
                    Earlier attempts
                  </button>
                ) : null}
              </div>
            )}
          </>
        ) : (
          <section aria-label="Assessment feedback" className="border-line mt-7 border-t pt-5">
            <h2
              ref={feedback}
              tabIndex={-1}
              className="text-hi text-md font-medium focus:outline-none"
            >
              Attempt {attempt.id} submitted in preview
            </h2>
            <p className="text-ink-dim mt-1.5 text-sm">
              {HELP_OPTIONS.find((option) => option.value === attempt.help)?.label}
              {attempt.afterFeedback ? " · After feedback" : ""}
            </p>
            <p className="mt-4 text-sm">
              <span className="text-hi font-medium">Number checks</span> · {correctCount(attempt)}{" "}
              of 4 correct
            </p>
            {TRACE_FIELDS.filter(
              (field) => Number(attempt.answers[field.id]) !== field.expected,
            ).map((field) => (
              <p key={field.id} className="text-bad mt-2 text-sm leading-normal">
                {field.label}: you entered {attempt.answers[field.id]}; the expected count is{" "}
                {field.expected}.
              </p>
            ))}
            {attempt.reviewed ? (
              <div className="mt-5">
                <h3 className="text-hi text-sm font-medium">Example tutor feedback</h3>
                <p className="font-course mt-2 text-read leading-read">
                  You described the capacity limit. Now account for the tokens: how many were stored
                  before the last addition, and how many arrived?
                </p>
                <p className="text-ink-dim mt-2 text-xs leading-normal">
                  Scripted feedback for design review, not an evaluation of your explanation. No
                  completion or mastery is recorded.
                </p>
              </div>
            ) : (
              <p className="text-ink-dim mt-3 text-sm">Your explanation has not been reviewed.</p>
            )}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {attempt.reviewed ? (
                <button
                  type="button"
                  className={`${PRIMARY} text-sm`}
                  onClick={() => {
                    dispatch({ type: "revise" });
                    requestAnimationFrame(() => firstInput.current?.focus());
                  }}
                >
                  Revise answers
                </button>
              ) : (
                <button
                  type="button"
                  className={`${PRIMARY} text-sm`}
                  onClick={() => dispatch({ type: "review" })}
                >
                  Preview tutor feedback
                </button>
              )}
              <button
                type="button"
                className={`${GHOST} text-sm`}
                aria-expanded={state.historyOpen}
                aria-controls="assessment-history"
                onClick={() => dispatch({ type: "history" })}
              >
                Earlier attempts
              </button>
            </div>
          </section>
        )}
      </form>

      <div
        id="assessment-history"
        hidden={!state.historyOpen}
        className="border-line mt-7 border-t pt-5"
      >
        <h2 className="text-hi font-course text-lg font-medium">Earlier attempts</h2>
        {state.attempts.map((previous) => (
          <details key={previous.id} className="border-line-soft border-b py-3 text-sm">
            <summary className="text-ink cursor-pointer rounded-xs focus-visible:outline-2 focus-visible:outline-focus">
              Attempt {previous.id} · {correctCount(previous)} of 4 number checks
              {previous.afterFeedback ? " · After feedback" : ""}
            </summary>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2">
              {TRACE_FIELDS.map((field) => (
                <div key={field.id} className="contents">
                  <dt className="text-ink-dim">{field.label}</dt>
                  <dd className="font-data text-right">{previous.answers[field.id]}</dd>
                </div>
              ))}
            </dl>
            <p className="font-course mt-4 whitespace-pre-wrap break-words text-md leading-read">
              {previous.answers.explanation}
            </p>
            <p className="text-ink-dim mt-3 text-xs">
              {HELP_OPTIONS.find((option) => option.value === previous.help)?.label} ·{" "}
              {previous.reviewed ? "Example feedback viewed" : "Explanation not reviewed"}
            </p>
          </details>
        ))}
      </div>
    </article>
  );
}

export function AssessmentFixture(): React.JSX.Element {
  const requested = new URLSearchParams(window.location.search).get("assessment");
  const initial = PREVIEW_STATES.find((entry) => entry === requested) ?? "initial";
  const [preview, setPreview] = useState<PreviewState>(initial);
  const [state, dispatch] = useReducer(assessmentReducer, initial, initialAssessment);
  return (
    <>
      <CourseView
        course={ASSESSMENT_COURSE}
        initialTab="brief"
        onLeaveCourse={() => undefined}
        renderBrief={(id) =>
          id === MODULE_ID ? <AssessmentResponse state={state} dispatch={dispatch} /> : undefined
        }
      />
      <div className="bg-surface-raised border-line text-ink-dim fixed bottom-8 left-3 z-10 flex items-center gap-2 rounded-pill border px-3 py-1 text-2xs">
        <span>Assessment preview · memory only</span>
        <Menu<PreviewState>
          label="Assessment preview state"
          value={preview}
          options={PREVIEW_STATES.map((value) => ({ value, label: value }))}
          onChange={(next) => {
            setPreview(next);
            dispatch({ type: "reset", preview: next });
          }}
        />
      </div>
    </>
  );
}
