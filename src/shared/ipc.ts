/* The IPC contract between renderer and main. Pattern: every channel gets a
   named constant and a typed reply here, the preload exposes a method per
   channel, and the renderer consumes `PraxeumApi` — never `ipcRenderer`,
   never a bare channel string. */

import type { CourseData } from "./course-data";
import type { AgentEvent, SessionControlPatch, SessionControls } from "./seminar";
import type { RunChecksReply, SeminarSnapshot } from "./session";
import type { ProviderCatalog, ProviderLoginReply, TutorProviderId } from "./provider";
import type { UpdateStatus } from "./update";

export const PING_CHANNEL = "praxeum:ping";
export const COURSE_OPEN_CHANNEL = "praxeum:course-open";
export const COURSE_CURRENT_CHANNEL = "praxeum:course-current";
export const COURSE_READ_DOC_CHANNEL = "praxeum:course-read-doc";
/** main → renderer push: course files changed on disk. */
export const COURSE_CHANGED_CHANNEL = "praxeum:course-changed";
export const COURSE_REVEAL_CHANNEL = "praxeum:course-reveal";
export const COURSE_CLOSE_CHANNEL = "praxeum:course-close";
export const DASHBOARD_LIST_CHANNEL = "praxeum:dashboard-list";
export const COURSE_OPEN_KNOWN_CHANNEL = "praxeum:course-open-known";
export const COURSE_LOCATE_CHANNEL = "praxeum:course-locate";
export const COURSE_FORGET_CHANNEL = "praxeum:course-forget";
export const COURSE_CREATE_CHANNEL = "praxeum:course-create";
export const COURSE_CHOOSE_PARENT_CHANNEL = "praxeum:course-choose-parent";
export const SEMINAR_START_CHANNEL = "praxeum:seminar-start";
export const SEMINAR_CURRENT_CHANNEL = "praxeum:seminar-current";
export const SEMINAR_SEND_CHANNEL = "praxeum:seminar-send";
export const SEMINAR_APPROVAL_CHANNEL = "praxeum:seminar-approval";
export const SEMINAR_ALLOW_EDITS_CHANNEL = "praxeum:seminar-allow-edits";
export const SEMINAR_RETRY_CHANNEL = "praxeum:seminar-retry";
export const SEMINAR_CONTROLS_GET_CHANNEL = "praxeum:seminar-controls-get";
export const SEMINAR_CONTROLS_SET_CHANNEL = "praxeum:seminar-controls-set";
export const SEMINAR_INTERRUPT_CHANNEL = "praxeum:seminar-interrupt";
export const SEMINAR_END_CHANNEL = "praxeum:seminar-end";
/** main → renderer push: one normalized event from the active tutor session. */
export const SEMINAR_EVENT_CHANNEL = "praxeum:seminar-event";
/** main → renderer push: durable logical-session lifecycle/hydration. */
export const SEMINAR_SNAPSHOT_CHANNEL = "praxeum:seminar-snapshot";
export const CHECK_RUN_CHANNEL = "praxeum:check-run";
export const THEME_GET_CHANNEL = "praxeum:theme-get";
export const THEME_SET_CHANNEL = "praxeum:theme-set";
export const THEME_CHANGED_CHANNEL = "praxeum:theme-changed";
export const TITLE_BAR_OVERLAY_CHANNEL = "praxeum:title-bar-overlay";
export const LAYOUT_GET_CHANNEL = "praxeum:layout-get";
export const LAYOUT_SET_CHANNEL = "praxeum:layout-set";
export const PROVIDERS_LIST_CHANNEL = "praxeum:providers-list";
export const PROVIDER_SELECT_CHANNEL = "praxeum:provider-select";
export const PROVIDER_LOGIN_CHANNEL = "praxeum:provider-login";
export const PROVIDER_LOGIN_CANCEL_CHANNEL = "praxeum:provider-login-cancel";
export const PROVIDER_SETUP_GUIDE_CHANNEL = "praxeum:provider-setup-guide";
export const UPDATE_STATUS_GET_CHANNEL = "praxeum:update-status-get";
export const UPDATE_CHECK_CHANNEL = "praxeum:update-check";
export const UPDATE_DOWNLOAD_CHANNEL = "praxeum:update-download";
export const UPDATE_HANDOFF_CHANNEL = "praxeum:update-handoff";
/** main → renderer push: safe update state, never manifest authority or paths. */
export const UPDATE_STATUS_CHANGED_CHANNEL = "praxeum:update-status-changed";

/** The scheme that serves course visuals into the sandboxed lab stage
 *  (ADR-012). URL shape: praxeum-visual://<module-id>/<file>.html */
export const VISUAL_SCHEME = "praxeum-visual";

export interface PingReply {
  pong: true;
  appVersion: string;
  runtime: {
    electron: string;
    chrome: string;
    node: string;
  };
}

export interface CourseSnapshot {
  /** absolute path of the course folder */
  rootPath: string;
  /** folder basename — the working display name for the course */
  folderName: string;
  data: CourseData;
}

export type OpenCourseReply =
  | { ok: true; course: CourseSnapshot }
  | {
      ok: false;
      reason: "cancelled" | "not-a-course" | "missing" | "not-found" | "error";
      detail?: string;
    };

interface DashboardCourseBase {
  courseId: string;
  rootPath: string;
  folderName: string;
  lastOpenedAt: string;
}

export type DashboardCourse =
  | (DashboardCourseBase & { available: false })
  | (DashboardCourseBase & {
      available: true;
      /** The tutor-written course name from COURSE.md; null before the arc
       *  exists, when the folder name is all a course has. */
      title: string | null;
      currentModuleId: string | null;
      completedModules: number;
      totalModules: number;
      dueCount: number;
      onboarding: boolean;
    });

export type DashboardReply =
  | { ok: true; courses: DashboardCourse[]; defaultParentDirectory: string }
  | { ok: false; detail: string; defaultParentDirectory: string };

export type ChooseCourseParentReply =
  { ok: true; parentDirectory: string } | { ok: false; reason: "cancelled" };

export type StartSeminarReply =
  { ok: true } | { ok: false; reason: "no-course" | "unavailable"; detail: string };

/** What the learner chose. "system" follows the OS and is the default. */
export type ThemePreference = "system" | "light" | "dark";

export interface ThemeState {
  preference: ThemePreference;
  /** What that preference currently resolves to, which is what the renderer paints. */
  dark: boolean;
}

/**
 * How the learner has arranged the course workspace's columns, in CSS pixels.
 *
 * APP-WIDE, not per course (ADR-019): a window arrangement is a property of the
 * window, and an app that rearranges itself as you move between courses reads
 * as a bug. An absent key means "never resized" — the surface falls back to the
 * token default, so a new install and a reset are the same code path.
 */
export interface WorkspaceLayout {
  railWidth?: number;
  talkWidth?: number;
}

/** The title bar's caption buttons are drawn by the OS, so their colours have
 *  to be handed to it as values (ADR-016). The RENDERER supplies them, read
 *  from the computed tokens: colour never leaves the design layer, and the
 *  main process never learns a hex literal. */
export interface TitleBarOverlayColors {
  color: string;
  symbolColor: string;
}

/** What the preload bridges onto `window.praxeum`. */
export interface PraxeumApi {
  ping(): Promise<PingReply>;
  /** Folder picker → load. */
  openCourse(): Promise<OpenCourseReply>;
  /** The loaded course (reopened from the last session on boot), if any. */
  currentCourse(): Promise<CourseSnapshot | null>;
  /** Dashboard facts are derived fresh from registered course folders. */
  listCourses(): Promise<DashboardReply>;
  openKnownCourse(courseId: string): Promise<OpenCourseReply>;
  locateCourse(courseId: string): Promise<OpenCourseReply>;
  forgetCourse(courseId: string): Promise<void>;
  createCourse(name: string, parentDirectory: string): Promise<OpenCourseReply>;
  chooseCourseParent(currentDirectory: string): Promise<ChooseCourseParentReply>;
  /** Leave the course surface. An open logical session becomes recoverable. */
  closeCourse(): Promise<void>;
  /** Read one course document (guarded: .md/.json inside the course). */
  readDoc(relativePath: string): Promise<string | null>;
  /** Show the course folder in the system file manager (the learner's own
   *  editor opens it from there — the app embeds none, ADR-006). */
  revealCourse(): Promise<void>;
  /** Subscribe to file-change pushes; returns unsubscribe. */
  onCourseChanged(listener: (changedPaths: string[]) => void): () => void;
  /** The learner's theme preference and what it resolves to right now. */
  getTheme(): Promise<ThemeState>;
  setTheme(preference: ThemePreference): Promise<ThemeState>;
  /** Fires when the resolved theme changes, including when the OS flips while
   *  the preference is "system". */
  onThemeChanged(listener: (state: ThemeState) => void): () => void;
  /** Repaint the OS-drawn caption buttons to match the current theme. */
  setTitleBarOverlay(colors: TitleBarOverlayColors): Promise<void>;
  /** The learner's column arrangement; `{}` until they have moved a seam. */
  getLayout(): Promise<WorkspaceLayout>;
  /** Merge a pane width into the stored arrangement. Fire-and-forget: a lost
   *  layout is a small cost, and a drag must never wait on a disk write. */
  setLayout(patch: WorkspaceLayout): Promise<void>;
  /** Safe connection facts for every tutor that is genuinely usable by this build. */
  listTutorProviders(): Promise<ProviderCatalog>;
  /** Persist the provider used by the next fresh session. Never replaces a live runtime. */
  selectTutorProvider(providerId: TutorProviderId): Promise<ProviderCatalog>;
  /** Begin the vendor-owned sign-in ceremony after an explicit learner action. */
  loginTutorProvider(providerId: TutorProviderId): Promise<ProviderLoginReply>;
  cancelTutorProviderLogin(providerId: TutorProviderId): Promise<void>;
  /** Open the provider's allowlisted official install/update page. */
  openTutorProviderSetupGuide(providerId: TutorProviderId): Promise<void>;
  /** Stable-channel updates remain main-owned: renderer receives status/copy only. */
  getUpdateStatus(): Promise<UpdateStatus>;
  checkForUpdate(): Promise<UpdateStatus>;
  downloadUpdate(): Promise<UpdateStatus>;
  handoffUpdate(): Promise<UpdateStatus>;
  onUpdateStatusChanged(listener: (status: UpdateStatus) => void): () => void;
  /** Start a fresh tutor session in the open course and send its conducted opener. */
  startSeminar(currentModuleId: string | null): Promise<StartSeminarReply>;
  /** Rehydrate app-owned transcript/lifecycle for the open course. */
  currentSeminar(): Promise<SeminarSnapshot>;
  /** Send one learner turn through the transparent conversation pipe (ADR-011). */
  sendSeminarMessage(message: string): Promise<void>;
  /** Ask the last request again when a turn completed without answering it. */
  retrySeminarTurn(): Promise<void>;
  /** What the learner may change about the running session (null when none). */
  seminarControls(): Promise<SessionControls | null>;
  /** Change model, effort, or autonomy for this session only (ADR-018). */
  setSeminarControls(patch: SessionControlPatch): Promise<SessionControls | null>;
  respondToSeminarApproval(requestId: string, allow: boolean, reason?: string): Promise<void>;
  /** Allow this approval AND every later course-folder file edit, for the rest
   *  of this session only. Dies with the session; never touches provider
   *  config (ADR-004). */
  allowSeminarCourseEdits(requestId: string): Promise<void>;
  interruptSeminar(): Promise<void>;
  endSeminar(): Promise<void>;
  /** Subscribe to the provider-neutral lifetime event stream; returns unsubscribe. */
  onSeminarEvent(listener: (event: AgentEvent) => void): () => void;
  onSeminarSnapshot(listener: (snapshot: SeminarSnapshot) => void): () => void;
  /** Run only the selected module's declared check script through the guarded lens. */
  runChecks(moduleId: string): Promise<RunChecksReply>;
}
