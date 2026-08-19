import { useCallback, useEffect, useRef, useState } from "react";
import type { CourseSnapshot, DashboardCourse, OpenCourseReply, PingReply } from "../../shared/ipc";
import { CourseDashboard } from "./components/course-dashboard";
import { CourseView } from "./course/course-view";
import { OnboardingSurface } from "./onboarding/onboarding-surface";
import { AppShell } from "./shell/app-shell";
import { TutorConnectionGate, TutorControl } from "./tutor/tutor-connection";
import { useTutorConnection } from "./tutor/use-tutor-connection";

/* The app's router, and nothing else. Each of the three surfaces owns its own
   frame contents, its own state, and its own reads — App only decides which
   one is on screen and keeps the open course's snapshot fresh. */

type Boot =
  | { phase: "booting" }
  | {
      phase: "dashboard";
      courses: DashboardCourse[];
      defaultParentDirectory: string;
      ping: PingReply | null;
      error: string | null;
    }
  | {
      phase: "open";
      course: CourseSnapshot;
      /** Chosen once, when the course is opened: a course with no modules gets
       *  onboarding whether it was just created or reopened days later. It is
       *  latched rather than re-derived because module 00 appears WHILE the
       *  tutor is still talking — re-reading the count every render would tear
       *  the view away mid-sentence. Onboarding hands over when it is ready. */
      surface: "onboarding" | "course";
      /** Only changes what onboarding says about the folder: created, or found. */
      justCreated: boolean;
    };

export function App(): React.JSX.Element {
  const [boot, setBoot] = useState<Boot>({ phase: "booting" });
  /* One probe for the window, rather than one per surface that happens to show
     a tutor control. The dashboard's menu reads it, and so does the first-run
     decision below — which has to be made from the same facts the menu shows,
     or the app can route past a question it is simultaneously asking. */
  const connection = useTutorConnection();
  /** The learner chose "Set this up later" on the first-run gate. Held for the
   *  window's lifetime only: it is a "not now", not a preference, and the next
   *  launch of a still-unconnected app should ask again. */
  const [tutorDeferred, setTutorDeferred] = useState(false);
  /** Coalesces change-driven refreshes so a burst of tutor writes is one re-read. */
  const refreshing = useRef(false);
  const refreshQueued = useRef(false);

  const enterCourse = useCallback((course: CourseSnapshot, justCreated = false) => {
    setBoot({
      phase: "open",
      course,
      surface: course.data.modules.length === 0 ? "onboarding" : "course",
      justCreated,
    });
  }, []);

  /** Onboarding is done with this course: the course view owns it now. */
  const enterCourseView = useCallback(() => {
    setBoot((previous) =>
      previous.phase === "open" ? { ...previous, surface: "course" } : previous,
    );
  }, []);

  const loadDashboard = useCallback(async (error: string | null = null): Promise<void> => {
    if (typeof window.praxeum === "undefined") {
      setBoot({
        phase: "dashboard",
        courses: [],
        defaultParentDirectory: "",
        ping: null,
        error: "The IPC bridge is unavailable.",
      });
      return;
    }
    const [dashboard, ping] = await Promise.all([
      window.praxeum.listCourses(),
      window.praxeum.ping().catch(() => null),
    ]);
    setBoot({
      phase: "dashboard",
      courses: dashboard.ok ? dashboard.courses : [],
      defaultParentDirectory: dashboard.defaultParentDirectory,
      ping,
      error: dashboard.ok ? error : dashboard.detail,
    });
  }, []);

  const leaveCourse = useCallback(() => {
    void window.praxeum.closeCourse().then(() => loadDashboard());
  }, [loadDashboard]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  /* One re-read of the whole snapshot per burst. The surfaces watch the same
     push for their own caches; this keeps the rail, the progress meter and the
     module list honest about what is on disk. */
  const refresh = useCallback(() => {
    if (refreshing.current) {
      refreshQueued.current = true;
      return;
    }
    refreshing.current = true;
    void window.praxeum
      .currentCourse()
      .then((course) => {
        if (course !== null) {
          setBoot((previous) => (previous.phase === "open" ? { ...previous, course } : previous));
        }
      })
      .finally(() => {
        refreshing.current = false;
        if (refreshQueued.current) {
          refreshQueued.current = false;
          refresh();
        }
      });
  }, []);

  useEffect(() => {
    if (typeof window.praxeum === "undefined") return;
    return window.praxeum.onCourseChanged(refresh);
  }, [refresh]);

  if (boot.phase === "booting") {
    return <AppShell children={<div aria-busy="true" className="flex-1" />} />;
  }

  if (boot.phase === "dashboard") {
    const acceptReply = (reply: OpenCourseReply, justCreated = false): string | null => {
      if (reply.ok) {
        enterCourse(reply.course, justCreated);
        return null;
      }
      return reply.reason === "cancelled"
        ? null
        : (reply.detail ?? "That course could not be opened.");
    };

    const version =
      boot.ping === null ? null : <span className="truncate">v{boot.ping.appVersion}</span>;

    /* FIRST RUN. Nothing on disk, nothing connected: the app has no courses to
       show and no tutor to run one, so the first question it asks is the one it
       actually needs answered. It used to open on "What do you want to learn?"
       and let the learner name a course, watch a folder be created, and only
       then discover — at the gate onboarding raises — that no tutor was ever
       chosen. The prerequisite is asked BEFORE the work, not after it.

       Deliberately narrow. A learner who already has courses opens straight
       onto them: reading finished material needs no provider, and hijacking
       their dashboard to sell a connection would be the app deciding what they
       came here to do. They get the honest signals instead — an amber dot on
       the tutor menu, and a line on the create screen — and the just-in-time
       gate still stands where onboarding needs a live tutor.

       `ready` is false while the probe is still running, which is why the gate
       and not the dashboard owns that wait: it renders its own "Checking your
       tutors…", then either the cards or (if a connection was already there)
       hands over to the dashboard without ever having flashed one. */
    if (boot.courses.length === 0 && !connection.ready && !tutorDeferred) {
      return (
        <AppShell status={version}>
          <TutorConnectionGate
            connection={connection}
            onDefer={() => {
              setTutorDeferred(true);
            }}
          />
        </AppShell>
      );
    }

    return (
      <AppShell
        status={
          /* Version only. This used to read "everything stays on this computer",
             which is not true and must not come back: the tutor is a frontier
             model, so every word of a session makes a round trip to Anthropic
             or OpenAI. What IS true is narrower — praxeum has no backend and
             receives nothing (ADR-001), and it never touches provider auth
             (ADR-004) — and that is a sentence with caveats, which is not a
             thing a 26px status bar can carry honestly. It belongs wherever the
             privacy story is told properly (SPEC §9, positioning). */
          version
        }
      >
        <CourseDashboard
          courses={boot.courses}
          defaultParentDirectory={boot.defaultParentDirectory}
          initialError={boot.error}
          onOpen={(courseId) =>
            window.praxeum.openKnownCourse(courseId).then((reply) => acceptReply(reply))
          }
          onLocate={(courseId) =>
            window.praxeum.locateCourse(courseId).then((reply) => acceptReply(reply))
          }
          onForget={async (courseId) => {
            await window.praxeum.forgetCourse(courseId);
            await loadDashboard();
            return null;
          }}
          onOpenFolder={() => window.praxeum.openCourse().then((reply) => acceptReply(reply))}
          onCreate={(name, parentDirectory) =>
            window.praxeum
              .createCourse(name, parentDirectory)
              .then((reply) => acceptReply(reply, true))
          }
          tutorControl={<TutorControl connection={connection} />}
          /* Not an error and not a blocker — course creation deliberately works
             with no provider at all (ADR-004). It is the answer to "would it
             even stop me?", said before the folder exists rather than after. */
          needsTutor={!connection.checking && !connection.ready}
        />
      </AppShell>
    );
  }

  /* A course with no modules has no rail to sit beside and no material to
     read, so it does not get the three-column view at all: onboarding is the
     whole window until the tutor has built module 00 (docs/DESIGN.md).
     Reopening an unfinished course lands here too, which is what makes the
     conversation resumable rather than restartable. */
  if (boot.surface === "onboarding") {
    /* Onboarding owns its own AppShell, exactly as the course view does: the
       window's title bar carries the way out and the course's name, and only
       the surface knows either of them. */
    return (
      <OnboardingSurface
        key={boot.course.rootPath}
        course={boot.course}
        justCreated={boot.justCreated}
        onLeaveCourse={leaveCourse}
        onEnterCourse={enterCourseView}
      />
    );
  }

  /* Keyed by the folder: opening a different course must start with an empty
     document cache and no module selected, and a remount says that once
     instead of five resets saying it separately. */
  return <CourseView key={boot.course.rootPath} course={boot.course} onLeaveCourse={leaveCourse} />;
}
