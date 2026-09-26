import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AssessmentAttempt,
  AssessmentCommand,
  AssessmentQuestion,
  AssessmentView,
} from "../../../shared/assessment";
import { PRIMARY, GHOST } from "../components/controls";
import { CourseMarkdown } from "../components/markdown-view";

const FIELD =
  "border-line-strong bg-surface-input text-ink focus-visible:outline-focus rounded-pill border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50";
type Draft = {
  id: string;
  question: AssessmentQuestion;
  sourceDigest: string;
  revision: number;
  raw: Record<string, string>;
  help: AssessmentAttempt["help"];
  revisesAttemptId: string | null;
};
function draftOf(a: AssessmentAttempt): Draft {
  return {
    id: a.id,
    question: a.question,
    sourceDigest: a.sourceDigest,
    revision: a.revision,
    raw: a.raw,
    help: a.help,
    revisesAttemptId: a.revisesAttemptId,
  };
}

/** Real course records only. The harness supplies this same component's bridge. */
export function Assessment({
  courseRoot,
  moduleId,
  onUnsaved,
}: {
  courseRoot: string;
  moduleId: string;
  onUnsaved: (dirty: boolean) => void;
}): React.JSX.Element | null {
  const [view, setView] = useState<AssessmentView | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [history, setHistory] = useState(false);
  const [note, setNote] = useState("");
  const [noteKind, setNoteKind] = useState<"help" | "dispute">("dispute");
  const working = useRef(false);
  const unsaved = useRef(false);
  const latest = useRef<Draft | null>(null);
  const mounted = useRef(true);
  const generation = useRef(0);
  const initialized = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const markDirty = useCallback(
    (value: boolean) => {
      unsaved.current = value;
      setDirty(value);
      onUnsaved(value);
    },
    [onUnsaved],
  );
  const applyDraft = (value: Draft | null) => {
    latest.current = value;
    setDraft(value);
  };
  const load = useCallback(async () => {
    if (unsaved.current || working.current) return;
    const token = ++generation.current;
    try {
      const reply = await window.praxeum.assessment(courseRoot, { operation: "read", moduleId });
      if (!mounted.current || token !== generation.current || unsaved.current || working.current)
        return;
      if (!reply.ok) {
        setError(reply.detail);
        return;
      }
      setView(reply.view);
      setError(null);
      const newest = reply.view.attempts.at(-1);
      const refreshed =
        latest.current === null
          ? undefined
          : reply.view.attempts.find((a) => a.id === latest.current?.id);
      if (refreshed) {
        latest.current = refreshed.status === "draft" ? draftOf(refreshed) : null;
        setDraft(latest.current);
        setSelected(refreshed.id);
      } else if (!initialized.current) {
        setSelected(newest?.id ?? null);
        if (newest?.status === "draft") {
          latest.current = draftOf(newest);
          setDraft(latest.current);
        }
      }
      initialized.current = true;
    } catch {
      if (mounted.current)
        setError("Could not read this assessment. Retry without changing your answers.");
    }
  }, [courseRoot, moduleId]);
  useEffect(() => {
    mounted.current = true;
    void load();
    const unsubscribe = window.praxeum.onCourseChanged((paths) => {
      if (
        paths.length === 0 ||
        paths.some(
          (p) => p.startsWith("tutor/assessments") || p.startsWith(`curriculum/${moduleId}`),
        )
      )
        void load();
    });
    return () => {
      mounted.current = false;
      generation.current++;
      unsubscribe();
    };
  }, [load, moduleId]);
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => {
      if (unsaved.current || working.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, []);

  async function save(): Promise<boolean> {
    if (working.current) return false;
    working.current = true;
    generation.current++;
    setBusy(true);
    try {
      while (unsaved.current && latest.current) {
        const snapshot = latest.current;
        const reply = await window.praxeum.assessment(courseRoot, {
          operation: "save",
          moduleId,
          id: snapshot.id,
          sourceDigest: snapshot.sourceDigest,
          revision: snapshot.revision,
          raw: snapshot.raw,
          help: snapshot.help,
          revisesAttemptId: snapshot.revisesAttemptId,
        });
        if (!mounted.current) return false;
        if (!reply.ok) {
          setError(reply.detail);
          return false;
        }
        const saved = reply.view.attempts.find((a) => a.id === snapshot.id);
        if (!saved) {
          setError("Save acknowledgement was incomplete. Keep your answers and retry.");
          return false;
        }
        setView(reply.view);
        setError(null);
        const changed = latest.current !== snapshot;
        applyDraft({ ...latest.current!, revision: saved.revision });
        if (!changed) markDirty(false);
      }
      return true;
    } catch {
      if (mounted.current)
        setError(
          "Save could not be confirmed. Your answers are still here; retry to reconcile the saved revision.",
        );
      return false;
    } finally {
      working.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function edit(raw: Record<string, string>, help: AssessmentAttempt["help"]) {
    if (!latest.current) return;
    applyDraft({ ...latest.current, raw, help });
    setFields({});
    markDirty(true);
    void save();
  }
  function begin(parent: AssessmentAttempt | null) {
    if (!view?.question || !view.sourceDigest) return;
    applyDraft({
      id: crypto.randomUUID(),
      question: view.question,
      sourceDigest: view.sourceDigest,
      revision: 0,
      raw: Object.fromEntries(
        view.question.fields.map((f) => [
          f.id,
          parent?.sourceDigest === view.sourceDigest ? (parent.raw[f.id] ?? "") : "",
        ]),
      ),
      help: parent?.help ?? "unknown",
      revisesAttemptId: parent?.id ?? null,
    });
    setSelected(null);
    setFields({});
    setError(null);
    markDirty(true);
    void save();
  }
  async function action(command: AssessmentCommand) {
    if (working.current) return;
    working.current = true;
    generation.current++;
    setBusy(true);
    onUnsaved(true);
    try {
      const reply = await window.praxeum.assessment(courseRoot, command);
      if (!mounted.current) return;
      if (!reply.ok) {
        setError(reply.detail);
        setFields(reply.fields ?? {});
        requestAnimationFrame(() =>
          form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
        );
        return;
      }
      setView(reply.view);
      setError(null);
      setFields({});
      if (command.operation === "submit") {
        setSelected(command.id);
        applyDraft(null);
        markDirty(false);
        requestAnimationFrame(() => heading.current?.focus());
      }
      if (command.operation === "event") setNote("");
    } catch {
      if (mounted.current)
        setError(
          "The action could not be confirmed. Reload saved history before repeating a review request.",
        );
    } finally {
      working.current = false;
      if (mounted.current) {
        setBusy(false);
        onUnsaved(unsaved.current);
      }
    }
  }
  const attempt = view?.attempts.find((a) => a.id === selected) ?? null;
  const question = draft?.question ?? attempt?.question ?? view?.question ?? null;
  if (view?.state === "none" && view.attempts.length === 0) return null;
  if (!view && !error) return null;
  const earlier =
    question !== null &&
    view?.sourceDigest !== (draft?.sourceDigest ?? attempt?.sourceDigest ?? view?.sourceDigest);
  return (
    <article aria-label="Assessment" className="text-ink mt-7">
      {error ? (
        <div role="alert" className="border-warn border-l-2 pl-4 text-sm">
          <p>{error}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              className={GHOST}
              disabled={busy}
              onClick={() => {
                if (dirty) void save();
                else void load();
              }}
            >
              Retry
            </button>
            {draft ? (
              <button
                className={GHOST}
                onClick={() => {
                  void navigator.clipboard
                    .writeText(
                      draft.question.fields
                        .map((f) => `${f.label}: ${draft.raw[f.id] ?? ""}`)
                        .join("\n\n"),
                    )
                    .catch(() => setError("Copy failed. Select and copy the answer text."));
                }}
              >
                Copy answers
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {view?.state === "unsupported" ? <p className="text-ink-dim text-sm">{view.detail}</p> : null}
      {question ? (
        <>
          <h2 className="font-course text-hi text-xl font-semibold">{question.title}</h2>
          <CourseMarkdown className="prose mt-3 max-w-none" markdown={question.prompt} />
        </>
      ) : null}
      {earlier ? (
        <p className="text-warn mt-4 text-sm">
          Earlier question version. These answers remain attached to the original question.
        </p>
      ) : null}
      {draft ? (
        <form
          ref={form}
          className="mt-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy && !dirty)
              void action({
                operation: "submit",
                moduleId,
                id: draft.id,
                sourceDigest: draft.sourceDigest,
                revision: draft.revision,
              });
          }}
        >
          {draft.revisesAttemptId ? (
            <p className="text-ink-dim mb-4 text-sm">
              Revising an earlier submission. Earlier answers and feedback are kept.
            </p>
          ) : null}
          {question?.fields.map((field) => (
            <div key={field.id} className="border-line-soft border-b py-3">
              <div
                className={
                  field.kind === "integer" ? "flex items-center justify-between gap-4" : ""
                }
              >
                <label
                  className="font-course text-md leading-normal"
                  htmlFor={`answer-${field.id}`}
                >
                  {field.label}
                  {field.units ? ` (${field.units})` : ""}
                </label>
                {field.kind === "integer" ? (
                  <input
                    id={`answer-${field.id}`}
                    inputMode="numeric"
                    autoComplete="off"
                    aria-invalid={!!fields[field.id]}
                    aria-describedby={fields[field.id] ? `answer-error-${field.id}` : undefined}
                    className={`${FIELD} w-20 shrink-0 text-center`}
                    value={draft.raw[field.id] ?? ""}
                    maxLength={100}
                    onChange={(e) => edit({ ...draft.raw, [field.id]: e.target.value }, draft.help)}
                  />
                ) : (
                  <textarea
                    id={`answer-${field.id}`}
                    rows={4}
                    maxLength={4000}
                    aria-invalid={!!fields[field.id]}
                    aria-describedby={fields[field.id] ? `answer-error-${field.id}` : undefined}
                    className="border-line-strong bg-surface-input focus-visible:outline-focus mt-3 w-full resize-y rounded-lg border px-4 py-3 text-sm leading-normal focus-visible:outline-2 focus-visible:outline-offset-2"
                    value={draft.raw[field.id] ?? ""}
                    onChange={(e) => edit({ ...draft.raw, [field.id]: e.target.value }, draft.help)}
                  />
                )}
              </div>
              {fields[field.id] ? (
                <p id={`answer-error-${field.id}`} className="text-bad mt-2 text-sm">
                  {fields[field.id]}
                </p>
              ) : null}
            </div>
          ))}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs">
            <label>
              Help used{" "}
              <select
                className={`${FIELD} ml-2`}
                value={draft.help}
                onChange={(e) => edit(draft.raw, e.target.value as AssessmentAttempt["help"])}
              >
                {["unknown", "none", "hint-1", "hint-2", "hint-3", "outside"].map((help) => (
                  <option key={help} value={help}>
                    {help === "unknown" ? "Not recorded" : help === "none" ? "None reported" : help}
                  </option>
                ))}
              </select>
            </label>
            <span role="status">
              {busy ? "Saving…" : dirty ? "Draft not saved" : "Draft saved locally"}
            </span>
          </div>
          <button
            type="submit"
            className={`${PRIMARY} mt-5 text-sm`}
            disabled={busy || dirty || earlier || view?.state !== "available"}
          >
            Submit answers
          </button>
        </form>
      ) : attempt ? (
        <div className="mt-6">
          {attempt.question.fields.map((field) => (
            <div key={field.id} className="border-line-soft border-b py-3">
              <p className="font-course text-md">{field.label}</p>
              <p
                className={
                  field.kind === "integer"
                    ? "font-data mt-2 text-md"
                    : "font-course mt-2 whitespace-pre-wrap break-words text-read leading-read"
                }
              >
                {attempt.raw[field.id]}
              </p>
            </div>
          ))}
          <h3 ref={heading} tabIndex={-1} className="text-hi mt-6 text-sm font-semibold">
            Submitted locally ·{" "}
            {new Date(attempt.submittedAt ?? attempt.updatedAt).toLocaleString()}
          </h3>
          <p className="text-ink-dim mt-2 text-xs">
            Help: {attempt.help === "unknown" ? "not recorded" : attempt.help}
            {attempt.afterFeedback ? " · after earlier feedback" : ""}
          </p>
          <p className="mt-4 text-sm">
            Number checks: {attempt.objective.filter((o) => o.state === "correct").length} of{" "}
            {attempt.objective.length} correct
          </p>
          {attempt.objective
            .filter((o) => o.state !== "correct")
            .map((o) => (
              <p key={o.fieldId} className="text-bad mt-2 text-sm">
                {attempt.question.fields.find((f) => f.id === o.fieldId)?.label}:{" "}
                {o.state === "check-error"
                  ? "could not be checked"
                  : `you entered ${attempt.raw[o.fieldId]}; expected ${o.expected}`}
              </p>
            ))}
          <h3 className="text-hi mt-5 text-sm font-semibold">Reasoning feedback</h3>
          {attempt.feedback.length === 0 ? (
            <p className="text-ink-dim mt-2 text-sm">
              Awaiting tutor review. Number checks do not evaluate your explanation.
            </p>
          ) : (
            attempt.feedback.map((feedback) => (
              <div key={feedback.id} className="border-line-soft mt-4 border-t pt-4">
                <p className="text-ink-dim text-xs">
                  Tutor review · {new Date(feedback.createdAt).toLocaleString()}
                </p>
                {feedback.criteria.map((c) => (
                  <div key={c.criterionId} className="mt-3">
                    <p className="text-sm font-medium">
                      {attempt.question.criteria.find((q) => q.id === c.criterionId)?.description} ·{" "}
                      {c.state}
                    </p>
                    {c.excerpt ? (
                      <blockquote className="font-course mt-2 text-md">“{c.excerpt}”</blockquote>
                    ) : null}
                    <p className="font-course mt-2 text-md leading-normal">{c.rationale}</p>
                  </div>
                ))}
              </div>
            ))
          )}
          {attempt.events.map((e) => (
            <p key={e.id} className="text-ink-dim mt-3 text-xs">
              {e.kind}: {e.text}
            </p>
          ))}
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              className={`${PRIMARY} text-sm`}
              disabled={busy}
              onClick={() =>
                void action({
                  operation: "review",
                  moduleId,
                  id: attempt.id,
                  requestId: crypto.randomUUID(),
                })
              }
            >
              {attempt.events.some((e) => e.kind === "review")
                ? "Request another review"
                : "Ask tutor to review"}
            </button>
            {view?.state === "available" ? (
              <button className={`${GHOST} text-sm`} disabled={busy} onClick={() => begin(attempt)}>
                Revise answers
              </button>
            ) : null}
          </div>
          <p className="text-ink-dim mt-3 text-xs">
            Start a tutor session before requesting review. Results do not change module progress or
            recall grades.
          </p>
          <details className="mt-5 text-sm">
            <summary>Add context or dispute feedback</summary>
            <label className="mt-3 block">
              Kind{" "}
              <select
                className={FIELD}
                value={noteKind}
                onChange={(e) => setNoteKind(e.target.value as "help" | "dispute")}
              >
                <option value="dispute">Dispute feedback</option>
                <option value="help">Report later help</option>
              </select>
            </label>
            <label className="mt-3 block">
              Your note
              <textarea
                rows={3}
                maxLength={4000}
                className="border-line-strong mt-2 w-full rounded-lg border p-3"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <button
              className={`${GHOST} mt-2`}
              disabled={busy || !note.trim()}
              onClick={() =>
                void action({
                  operation: "event",
                  moduleId,
                  id: attempt.id,
                  eventId: crypto.randomUUID(),
                  kind: noteKind,
                  text: note,
                })
              }
            >
              Save note
            </button>
          </details>
        </div>
      ) : view?.state === "available" ? (
        <button className={`${PRIMARY} mt-5 text-sm`} disabled={busy} onClick={() => begin(null)}>
          Begin answers
        </button>
      ) : null}
      {earlier && view?.state === "available" && !dirty ? (
        <button className={`${GHOST} mt-4 text-sm`} disabled={busy} onClick={() => begin(null)}>
          Start current question
        </button>
      ) : null}
      {(view?.attempts.length ?? 0) > 0 ? (
        <div className="mt-6">
          <button
            className={`${GHOST} text-sm`}
            aria-expanded={history}
            onClick={() => setHistory(!history)}
          >
            Earlier attempts
          </button>
          {history ? (
            <ol className="mt-3 space-y-3">
              {view?.attempts.map((a, index) => (
                <li key={a.id}>
                  <button
                    className="text-ink underline underline-offset-4 text-sm"
                    disabled={dirty || busy}
                    onClick={() => {
                      setSelected(a.id);
                      applyDraft(a.status === "draft" ? draftOf(a) : null);
                    }}
                  >
                    {index + 1}. {a.question.title} · version {a.question.version} · {a.status}
                  </button>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
