import { contextBridge, ipcRenderer } from "electron";
import {
  COURSE_CHANGED_CHANNEL,
  COURSE_CHOOSE_PARENT_CHANNEL,
  COURSE_CLOSE_CHANNEL,
  COURSE_CREATE_CHANNEL,
  COURSE_CURRENT_CHANNEL,
  COURSE_FORGET_CHANNEL,
  COURSE_LOCATE_CHANNEL,
  COURSE_OPEN_CHANNEL,
  COURSE_OPEN_KNOWN_CHANNEL,
  COURSE_READ_DOC_CHANNEL,
  COURSE_REVEAL_CHANNEL,
  CHECK_RUN_CHANNEL,
  DASHBOARD_LIST_CHANNEL,
  EDITORS_LIST_CHANNEL,
  EDITOR_BROWSE_CHANNEL,
  EDITOR_OPEN_CHANNEL,
  EDITOR_SELECT_CHANNEL,
  LAYOUT_GET_CHANNEL,
  LAYOUT_SET_CHANNEL,
  PING_CHANNEL,
  PROVIDERS_LIST_CHANNEL,
  PROVIDER_LOGIN_CHANNEL,
  PROVIDER_LOGIN_CANCEL_CHANNEL,
  PROVIDER_SETUP_GUIDE_CHANNEL,
  PROVIDER_SELECT_CHANNEL,
  SEMINAR_ALLOW_EDITS_CHANNEL,
  SEMINAR_APPROVAL_CHANNEL,
  SEMINAR_CONTROLS_GET_CHANNEL,
  SEMINAR_CONTROLS_SET_CHANNEL,
  SEMINAR_END_CHANNEL,
  SEMINAR_EVENT_CHANNEL,
  SEMINAR_INTERRUPT_CHANNEL,
  SEMINAR_RETRY_CHANNEL,
  SEMINAR_SEND_CHANNEL,
  SEMINAR_SNAPSHOT_CHANNEL,
  SEMINAR_CURRENT_CHANNEL,
  SEMINAR_START_CHANNEL,
  THEME_CHANGED_CHANNEL,
  THEME_GET_CHANNEL,
  THEME_SET_CHANNEL,
  TITLE_BAR_OVERLAY_CHANNEL,
  UPDATE_CHECK_CHANNEL,
  UPDATE_DOWNLOAD_CHANNEL,
  UPDATE_HANDOFF_CHANNEL,
  UPDATE_STATUS_CHANGED_CHANNEL,
  UPDATE_STATUS_GET_CHANNEL,
  type ChooseCourseParentReply,
  type CourseSnapshot,
  type DashboardReply,
  type OpenCourseReply,
  type PingReply,
  type PraxeumApi,
  type StartSeminarReply,
  type ThemeState,
  type WorkspaceLayout,
} from "../shared/ipc";
import type { AgentEvent, SessionControls } from "../shared/seminar";
import type { RunChecksReply, SeminarSnapshot } from "../shared/session";
import type { BrowseEditorReply, EditorCatalog, OpenInEditorReply } from "../shared/editor";

const api: PraxeumApi = {
  ping: () => ipcRenderer.invoke(PING_CHANNEL) as Promise<PingReply>,
  openCourse: () => ipcRenderer.invoke(COURSE_OPEN_CHANNEL) as Promise<OpenCourseReply>,
  currentCourse: () => ipcRenderer.invoke(COURSE_CURRENT_CHANNEL) as Promise<CourseSnapshot | null>,
  listCourses: () => ipcRenderer.invoke(DASHBOARD_LIST_CHANNEL) as Promise<DashboardReply>,
  openKnownCourse: (courseId) =>
    ipcRenderer.invoke(COURSE_OPEN_KNOWN_CHANNEL, courseId) as Promise<OpenCourseReply>,
  locateCourse: (courseId) =>
    ipcRenderer.invoke(COURSE_LOCATE_CHANNEL, courseId) as Promise<OpenCourseReply>,
  forgetCourse: (courseId) => ipcRenderer.invoke(COURSE_FORGET_CHANNEL, courseId) as Promise<void>,
  createCourse: (name, parentDirectory) =>
    ipcRenderer.invoke(COURSE_CREATE_CHANNEL, name, parentDirectory) as Promise<OpenCourseReply>,
  chooseCourseParent: (currentDirectory) =>
    ipcRenderer.invoke(
      COURSE_CHOOSE_PARENT_CHANNEL,
      currentDirectory,
    ) as Promise<ChooseCourseParentReply>,
  closeCourse: () => ipcRenderer.invoke(COURSE_CLOSE_CHANNEL) as Promise<void>,
  readDoc: (relativePath) =>
    ipcRenderer.invoke(COURSE_READ_DOC_CHANNEL, relativePath) as Promise<string | null>,
  revealCourse: () => ipcRenderer.invoke(COURSE_REVEAL_CHANNEL) as Promise<void>,
  listEditors: () => ipcRenderer.invoke(EDITORS_LIST_CHANNEL) as Promise<EditorCatalog>,
  selectEditor: (editorId) =>
    ipcRenderer.invoke(EDITOR_SELECT_CHANNEL, editorId) as Promise<EditorCatalog>,
  browseForEditor: () => ipcRenderer.invoke(EDITOR_BROWSE_CHANNEL) as Promise<BrowseEditorReply>,
  openInEditor: (target) =>
    ipcRenderer.invoke(EDITOR_OPEN_CHANNEL, target) as Promise<OpenInEditorReply>,
  onCourseChanged: (listener) => {
    const wrapped = (_event: unknown, changedPaths: string[]): void => {
      listener(changedPaths);
    };
    ipcRenderer.on(COURSE_CHANGED_CHANNEL, wrapped);
    return () => {
      ipcRenderer.removeListener(COURSE_CHANGED_CHANNEL, wrapped);
    };
  },
  getTheme: () => ipcRenderer.invoke(THEME_GET_CHANNEL) as Promise<ThemeState>,
  setTheme: (preference) =>
    ipcRenderer.invoke(THEME_SET_CHANNEL, preference) as Promise<ThemeState>,
  onThemeChanged: (listener) => {
    const wrapped = (_event: unknown, state: ThemeState): void => {
      listener(state);
    };
    ipcRenderer.on(THEME_CHANGED_CHANNEL, wrapped);
    return () => {
      ipcRenderer.removeListener(THEME_CHANGED_CHANNEL, wrapped);
    };
  },
  setTitleBarOverlay: (colors) =>
    ipcRenderer.invoke(TITLE_BAR_OVERLAY_CHANNEL, colors) as Promise<void>,
  getLayout: () => ipcRenderer.invoke(LAYOUT_GET_CHANNEL) as Promise<WorkspaceLayout>,
  setLayout: (patch) => ipcRenderer.invoke(LAYOUT_SET_CHANNEL, patch) as Promise<void>,
  listTutorProviders: () =>
    ipcRenderer.invoke(PROVIDERS_LIST_CHANNEL) as ReturnType<PraxeumApi["listTutorProviders"]>,
  selectTutorProvider: (providerId) =>
    ipcRenderer.invoke(PROVIDER_SELECT_CHANNEL, providerId) as ReturnType<
      PraxeumApi["selectTutorProvider"]
    >,
  loginTutorProvider: (providerId) =>
    ipcRenderer.invoke(PROVIDER_LOGIN_CHANNEL, providerId) as ReturnType<
      PraxeumApi["loginTutorProvider"]
    >,
  cancelTutorProviderLogin: (providerId) =>
    ipcRenderer.invoke(PROVIDER_LOGIN_CANCEL_CHANNEL, providerId) as Promise<void>,
  openTutorProviderSetupGuide: (providerId) =>
    ipcRenderer.invoke(PROVIDER_SETUP_GUIDE_CHANNEL, providerId) as Promise<void>,
  getUpdateStatus: () =>
    ipcRenderer.invoke(UPDATE_STATUS_GET_CHANNEL) as ReturnType<PraxeumApi["getUpdateStatus"]>,
  checkForUpdate: () =>
    ipcRenderer.invoke(UPDATE_CHECK_CHANNEL) as ReturnType<PraxeumApi["checkForUpdate"]>,
  downloadUpdate: () =>
    ipcRenderer.invoke(UPDATE_DOWNLOAD_CHANNEL) as ReturnType<PraxeumApi["downloadUpdate"]>,
  handoffUpdate: () =>
    ipcRenderer.invoke(UPDATE_HANDOFF_CHANNEL) as ReturnType<PraxeumApi["handoffUpdate"]>,
  onUpdateStatusChanged: (listener) => {
    const wrapped = (_event: unknown, status: Parameters<typeof listener>[0]): void => {
      listener(status);
    };
    ipcRenderer.on(UPDATE_STATUS_CHANGED_CHANNEL, wrapped);
    return () => {
      ipcRenderer.removeListener(UPDATE_STATUS_CHANGED_CHANNEL, wrapped);
    };
  },
  startSeminar: (currentModuleId) =>
    ipcRenderer.invoke(SEMINAR_START_CHANNEL, currentModuleId) as Promise<StartSeminarReply>,
  currentSeminar: () => ipcRenderer.invoke(SEMINAR_CURRENT_CHANNEL) as Promise<SeminarSnapshot>,
  sendSeminarMessage: (message) =>
    ipcRenderer.invoke(SEMINAR_SEND_CHANNEL, message) as Promise<void>,
  retrySeminarTurn: () => ipcRenderer.invoke(SEMINAR_RETRY_CHANNEL) as Promise<void>,
  seminarControls: () =>
    ipcRenderer.invoke(SEMINAR_CONTROLS_GET_CHANNEL) as Promise<SessionControls | null>,
  setSeminarControls: (patch) =>
    ipcRenderer.invoke(SEMINAR_CONTROLS_SET_CHANNEL, patch) as Promise<SessionControls | null>,
  allowSeminarCourseEdits: (requestId) =>
    ipcRenderer.invoke(SEMINAR_ALLOW_EDITS_CHANNEL, requestId) as Promise<void>,
  respondToSeminarApproval: (requestId, allow, reason) =>
    ipcRenderer.invoke(SEMINAR_APPROVAL_CHANNEL, requestId, allow, reason) as Promise<void>,
  interruptSeminar: () => ipcRenderer.invoke(SEMINAR_INTERRUPT_CHANNEL) as Promise<void>,
  endSeminar: () => ipcRenderer.invoke(SEMINAR_END_CHANNEL) as Promise<void>,
  onSeminarEvent: (listener) => {
    const wrapped = (_event: unknown, agentEvent: AgentEvent): void => {
      listener(agentEvent);
    };
    ipcRenderer.on(SEMINAR_EVENT_CHANNEL, wrapped);
    return () => {
      ipcRenderer.removeListener(SEMINAR_EVENT_CHANNEL, wrapped);
    };
  },
  onSeminarSnapshot: (listener) => {
    const wrapped = (_event: unknown, snapshot: SeminarSnapshot): void => {
      listener(snapshot);
    };
    ipcRenderer.on(SEMINAR_SNAPSHOT_CHANNEL, wrapped);
    return () => {
      ipcRenderer.removeListener(SEMINAR_SNAPSHOT_CHANNEL, wrapped);
    };
  },
  runChecks: (moduleId) =>
    ipcRenderer.invoke(CHECK_RUN_CHANNEL, moduleId) as Promise<RunChecksReply>,
};

contextBridge.exposeInMainWorld("praxeum", api);
