import { CourseMarkdown } from "../components/markdown-view";
/* The course surface: the frame it wears, the three columns, and the two
 * course-scoped overlays (ADR-019).
 *
 * This used to live inside App.tsx as a second app shell — its own grid, its
 * own bar, no status line, no theme control. It is a surface inside `AppShell`
 * now, like the dashboard and onboarding, so the window is one window.
 *
 * The conversation's controller is created HERE rather than inside the seminar
 * column, for one reason: the status bar reports session state, and two calls
 * to `useSeminar` would be two subscriptions, two reducers, and two auto-start
 * latches over one real session. One controller, two readers. */

import { useCallback, useEffect, useRef, useState } from "react";
import { dueItems, type CourseDocs } from "../../../shared/course-data";
import type { CourseSnapshot } from "../../../shared/ipc";
import { SeminarColumn } from "../seminar/seminar-column";
import { useSeminar, type SeminarController } from "../seminar/use-seminar";
import { AppShell } from "../shell/app-shell";
import { BackToCourses, TitleRule } from "../shell/surface-head";
import { EditorControl } from "./editor-control";
import { ReadingLesson } from "./reading";
import type { ReadingMark } from "../../../shared/reading";
import { Assessment } from "./assessment";
import { LabOverlay } from "./lab-overlay";
import { MaterialPane, type MaterialTab } from "./material";
import { CourseRail } from "./rail";
import { RecordOverlay, type RecordTab } from "./record-overlay";
import { Workspace } from "./workspace";
import { TutorConnectionGate } from "../tutor/tutor-connection";
import { useTutorConnection } from "../tutor/use-tutor-connection";

/**
 * Where the session is, said quietly and continuously. Ambient rather than
 * urgent — the conversation itself shows work in progress where the learner is
 * already looking — so it lives in the status line.
 *
 * No cost figure appears here. The provider reports
 * `total_cost_usd`, and on a subscription that is the notional pay-as-you-go
 * PRICE of the tokens, not a debit: a learner on Max who sees "$6.67" was
 * charged nothing of the sort. Standing in the corner of every screen, it
 * anchors a worry on a number that is not true, and it can make someone ration
 * study time for no reason. Usage is worth reporting — on demand, in a place
 * with room to say what the figure is and is not (STATUS ledger #6).
 */
function SessionStatus({ seminar }: { seminar: SeminarController }): React.JSX.Element {
  const { phase, recoveryHandoff } = seminar.state;
  const working = phase === "thinking" || phase === "streaming" || phase === "tool-activity";

  const label =
    phase === "choosing-model"
      ? "Choose a tutor model"
      : recoveryHandoff === "finishing-previous"
        ? "Finishing previous session"
        : recoveryHandoff === "opening-next"
          ? "Opening new session"
          : seminar.recoveryPending
            ? "Unfinished session"
            : phase === "closed"
              ? "No session open"
              : phase === "opening"
                ? "Opening session"
                : working
                  ? "Tutor working"
                  : "Session open";

  const explain =
    recoveryHandoff === "finishing-previous"
      ? "Your tutor is finishing the previous session before a new one opens."
      : recoveryHandoff === "opening-next"
        ? "The previous session is saved. Your tutor is opening the new session."
        : seminar.recoveryPending
          ? "Your last session ended without a verified close. Your tutor updates the journal, quiz seeds, progress, and commit before the next one opens."
          : phase === "closed"
            ? "No tutor session is running in this course folder."
            : "A tutor session is running in this course folder.";

  return (
    <span className="flex shrink-0 items-center gap-2" title={explain}>
      <span
        aria-hidden="true"
        className={
          working
            ? "bg-attention animate-dot size-1.5 rounded-pill"
            : phase === "closed"
              ? "bg-ink-faint size-1.5 rounded-pill"
              : "bg-ok size-1.5 rounded-pill"
        }
      />
      <span>{label}</span>
    </span>
  );
}

export function CourseView({
  course,
  onLeaveCourse,
  renderBriefSupplement,
  initialTab = "lesson",
}: {
  course: CourseSnapshot;
  onLeaveCourse: () => void;
  /** Optional activity beside the course's own Brief, which always stays visible. */
  renderBriefSupplement?: (moduleId: string) => React.ReactNode;
  initialTab?: MaterialTab;
}): React.JSX.Element {
  const data = course.data;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<MaterialTab>(initialTab);
  const [docs, setDocs] = useState<CourseDocs>({});
  const [docRevision, setDocRevision] = useState(0);
  const readGenerations = useRef(new Map<string, number>());
  const [overlay, setOverlay] = useState<"record" | "lab" | null>(null);
  const [recordTab, setRecordTab] = useState<RecordTab>("quiz");
  const [labKey, setLabKey] = useState<string | null>(null);
  /* The editor handoff lives in the seminar's head and its failures are shown
     there, so the state that joins them belongs to the surface that owns both
     columns rather than to either one. */
  const [editorNotice, setEditorNotice] = useState<string | null>(null);
  const readingUnsaved = useRef(false);
  const [readingTarget, setReadingTarget] = useState<string | null>(null);
  const onReadingUnsaved = useCallback((value: boolean) => {
    readingUnsaved.current = value;
  }, []);
  const openReadingMark = useCallback((mark: ReadingMark) => {
    if (readingUnsaved.current) return;
    setSelectedId(mark.moduleId);
    setTab("lesson");
    setReadingTarget(mark.id);
  }, []);
  const assessmentUnsaved = useRef(false);
  const onAssessmentUnsaved = useCallback((value: boolean) => {
    assessmentUnsaved.current = value;
  }, []);
  const canLeaveAssessment = useCallback(() => {
    if (readingUnsaved.current) {
      setEditorNotice(
        "Wait for the highlight to save, or retry/discard its unsaved action in the Lesson menu.",
      );
      return false;
    }
    if (!assessmentUnsaved.current) return true;
    setEditorNotice(
      "Wait for your answers to save, or retry the failed save in the Brief before leaving.",
    );
    return false;
  }, []);
  const [connectionRequested, setConnectionRequested] = useState(false);
  const connection = useTutorConnection();
  /** Paths whose read is in flight or done. A read that returns nothing must
   *  not loop forever (the old surface's rule, kept). */
  const requested = useRef(new Set<string>());

  const active =
    data.modules.find((entry) => entry.id === (selectedId ?? data.currentModuleId)) ??
    data.modules[0] ??
    null;

  const currentModuleId = active?.id ?? data.currentModuleId;
  /* The session is already open and streaming when onboarding hands over, and
     a reopened course waits for the learner to press Start — so this surface
     never auto-starts anything. */
  const seminar = useSeminar({ currentModuleId, autoStart: false });
  const startSeminar = seminar.start;

  useEffect(() => {
    if (!connectionRequested || !connection.ready) return;
    setConnectionRequested(false);
    void startSeminar();
  }, [connection.ready, connectionRequested, startSeminar]);

  // Fetch the active module's documents once each; a change push re-requests.
  useEffect(() => {
    if (active === null) return;
    for (const path of [active.lessonPath, active.briefPath, active.quizPath]) {
      if (path === null || requested.current.has(path)) continue;
      requested.current.add(path);
      const generation = (readGenerations.current.get(path) ?? 0) + 1;
      readGenerations.current.set(path, generation);
      void window.praxeum.readDoc(path).then((content) => {
        if (readGenerations.current.get(path) !== generation) return;
        setDocs((cache) => ({ ...cache, [path]: content ?? "" }));
      });
    }
  }, [active, docRevision]);

  // Keep the displayed document mounted during refresh so an unacknowledged
  // highlight retains its quote and retry identity. New bytes replace it in place.
  useEffect(
    () =>
      window.praxeum.onCourseChanged((changed) => {
        if (changed.length === 0) return;
        for (const path of changed) {
          requested.current.delete(path);
          readGenerations.current.set(path, (readGenerations.current.get(path) ?? 0) + 1);
        }
        setDocRevision((value) => value + 1);
      }),
    [],
  );

  const selectModule = useCallback(
    (id: string) => {
      if (!canLeaveAssessment()) return;
      setSelectedId(id);
      setTab("lesson");
    },
    [canLeaveAssessment],
  );

  /* A failed launch is about the module it was launched for. Move to another
     and the message is no longer true of anything on screen. */
  useEffect(() => {
    setEditorNotice(null);
  }, [active?.id]);

  const done = data.modules.filter((entry) => entry.status === "completed").length;
  const due = dueItems(data.quiz).length;
  const title = data.title ?? course.folderName;

  const titleBar = (
    <>
      <BackToCourses
        onLeaveCourse={() => {
          if (canLeaveAssessment()) onLeaveCourse();
        }}
      />
      <TitleRule />
      <h1 className="text-hi font-course ml-1 min-w-0 truncate text-md font-semibold">{title}</h1>
    </>
  );

  if (connectionRequested && !connection.ready) {
    return (
      <AppShell
        title={titleBar}
        status={
          <span className="min-w-0 flex-1 truncate" title={course.rootPath}>
            {course.rootPath}
          </span>
        }
      >
        <TutorConnectionGate
          connection={connection}
          onBack={() => {
            setConnectionRequested(false);
          }}
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title={titleBar}
      status={
        <>
          {/* flex-1 so the path yields first and the session facts stay pinned
              to the right, where a status line's state conventionally sits. */}
          <span className="min-w-0 flex-1 truncate" title={course.rootPath}>
            {course.rootPath}
          </span>
          <SessionStatus seminar={seminar} />
        </>
      }
    >
      <Workspace
        rail={
          <CourseRail
            modules={data.modules}
            unreadableModuleIds={data.unreadableModuleIds}
            currentModuleId={data.currentModuleId}
            selectedId={active?.id ?? null}
            completed={done}
            dueCount={due}
            labs={data.labs}
            recordOpen={overlay === "record"}
            labOpen={overlay === "lab"}
            onSelect={selectModule}
            onOpenRecord={() => {
              setOverlay("record");
            }}
            onOpenLab={() => {
              setOverlay("lab");
            }}
            onRevealFolder={() => {
              void window.praxeum.revealCourse();
            }}
          />
        }
        page={
          <MaterialPane
            activeModule={active}
            briefSupplement={
              active === null ? undefined : renderBriefSupplement ? (
                renderBriefSupplement(active.id)
              ) : (
                <Assessment
                  key={`${course.rootPath}:${active.id}`}
                  courseRoot={course.rootPath}
                  moduleId={active.id}
                  onUnsaved={onAssessmentUnsaved}
                />
              )
            }
            lessonContent={
              <ReadingLesson
                key={`${course.rootPath}:${active?.id ?? "archive"}`}
                markdown={active?.lessonPath ? (docs[active.lessonPath] ?? null) : null}
                moduleId={active?.id ?? null}
                courseRoot={course.rootPath}
                availableModules={data.modules.map((m) => m.id)}
                onOpenMark={openReadingMark}
                targetId={readingTarget}
                onUnsaved={onReadingUnsaved}
              >
                {!active && data.courseDoc ? (
                  <CourseMarkdown markdown={data.courseDoc} />
                ) : (
                  <p className="text-ink-dim text-sm">
                    {active ? "The Lesson is not available." : "No modules are available."}
                  </p>
                )}
              </ReadingLesson>
            }
            docs={docs}
            quiz={data.quiz}
            labs={data.labs}
            courseDoc={data.courseDoc}
            tab={tab}
            onTab={(next) => {
              if (canLeaveAssessment()) setTab(next);
            }}
            onOpenLab={(key) => {
              setLabKey(key);
              setOverlay("lab");
            }}
          />
        }
        talk={
          <SeminarColumn
            seminar={seminar}
            onboarding={data.modules.length === 0}
            onStart={() => {
              if (connection.ready) void startSeminar();
              else setConnectionRequested(true);
            }}
            /* Presence-based (ADR-013): a scaffold on the SELECTED module is
               what there is to open, so the control follows the page beside
               it rather than the session. */
            head={
              active?.hasScaffold === true ? (
                <EditorControl
                  target={{ kind: "module", moduleId: active.id }}
                  onNotice={setEditorNotice}
                />
              ) : null
            }
            notice={editorNotice}
            onDismissNotice={() => {
              setEditorNotice(null);
            }}
          />
        }
      />

      <RecordOverlay
        open={overlay === "record"}
        onOpenChange={(open) => {
          // A dialog's close event arrives async — it must only clear ITSELF,
          // or closing one overlay would clobber the next one opening.
          setOverlay((previous) => (open ? "record" : previous === "record" ? null : previous));
        }}
        course={data}
        tab={recordTab}
        onTab={setRecordTab}
      />
      <LabOverlay
        open={overlay === "lab"}
        onOpenChange={(open) => {
          setOverlay((previous) => (open ? "lab" : previous === "lab" ? null : previous));
        }}
        course={data}
        contextModuleId={currentModuleId}
        selectedKey={labKey}
        onSelect={setLabKey}
      />
    </AppShell>
  );
}
