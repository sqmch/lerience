import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from "electron";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { PRODUCT_NAME, PRODUCT_WORDMARK } from "../shared/product";
import {
  CHECK_RUN_CHANNEL,
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
  DASHBOARD_LIST_CHANNEL,
  EDITORS_LIST_CHANNEL,
  EDITOR_BROWSE_CHANNEL,
  EDITOR_OPEN_CHANNEL,
  EDITOR_SELECT_CHANNEL,
  PING_CHANNEL,
  PROVIDERS_LIST_CHANNEL,
  PROVIDER_LOGIN_CHANNEL,
  PROVIDER_LOGIN_CANCEL_CHANNEL,
  PROVIDER_SETUP_GUIDE_CHANNEL,
  PROVIDER_SELECT_CHANNEL,
  LAYOUT_GET_CHANNEL,
  LAYOUT_SET_CHANNEL,
  THEME_CHANGED_CHANNEL,
  THEME_GET_CHANNEL,
  THEME_SET_CHANNEL,
  TITLE_BAR_OVERLAY_CHANNEL,
  UPDATE_CHECK_CHANNEL,
  UPDATE_DOWNLOAD_CHANNEL,
  UPDATE_HANDOFF_CHANNEL,
  UPDATE_STATUS_CHANGED_CHANNEL,
  UPDATE_STATUS_GET_CHANNEL,
  SEMINAR_ALLOW_EDITS_CHANNEL,
  SEMINAR_APPROVAL_CHANNEL,
  SEMINAR_CONTROLS_GET_CHANNEL,
  SEMINAR_CONTROLS_SET_CHANNEL,
  SEMINAR_CURRENT_CHANNEL,
  SEMINAR_END_CHANNEL,
  SEMINAR_EVENT_CHANNEL,
  SEMINAR_INTERRUPT_CHANNEL,
  SEMINAR_RETRY_CHANNEL,
  SEMINAR_SEND_CHANNEL,
  SEMINAR_SNAPSHOT_CHANNEL,
  SEMINAR_START_CHANNEL,
  type ChooseCourseParentReply,
  type CourseSnapshot,
  type DashboardReply,
  type OpenCourseReply,
  type StartSeminarReply,
  type ThemePreference,
  type ThemeState,
  type TitleBarOverlayColors,
  type WorkspaceLayout,
} from "../shared/ipc";
import type { AgentEvent, SessionControlPatch, SessionControls } from "../shared/seminar";
import type { RunChecksReply, SeminarSnapshot } from "../shared/session";
import { describeRegisteredCourse } from "./course-dashboard";
import { CourseCreator, HostGitRunner, validateCourseName } from "./course-creator";
import { FileCourseRegistry } from "./course-registry";
import {
  clearLastCourse,
  closeCourse,
  currentCourseRoot,
  lastCoursePath,
  loadCourse,
  looksLikeCourse,
  unwatchCourse,
  watchCourse,
} from "./course-session";
import { guardCourseDoc } from "./guards";
import { discoverEditors } from "./editor/discovery";
import { EditorService } from "./editor/service";
import { guardModuleDirectory } from "./scripts/parsers";
import type { BrowseEditorReply, EditorCatalog, OpenInEditorReply } from "../shared/editor";
import { buildPingReply } from "./ping";
import { createEngineScriptService } from "./scripts/engine-script-service";
import { readSettings, updateSettings } from "./settings";
import { ElectronUtilityProcessRunner } from "./scripts/utility-process-runner";
import { SessionConductor } from "./session/conductor";
import { handleVisualScheme, registerVisualScheme } from "./visual-protocol";
import { ClaudeTutorProvider, createClaudeCommandRunner } from "./provider/claude-provider";
import { CodexTutorProvider } from "./provider/codex-provider";
import { ClaudeTutorAgent } from "./agent/claude";
import { createCodexAppServerFactory } from "./provider/codex-app-server";
import { discoverInstalledProviderRuntime } from "./provider/installed-runtime";
import { createRefreshingTutorProvider, TutorProviderRegistry } from "./provider/registry";
import { createProviderRuntimeProbe } from "./provider/compatibility";
import { createRuntimeEnvironment, resolveRuntimeLayout } from "./runtime-layout";
import { inspectPackagedRuntime } from "./runtime-manifest";
import type { ProviderCatalog, ProviderLoginReply, TutorProviderId } from "../shared/provider";
import type { UpdateStatus } from "../shared/update";
import { registerUpdateActivationCheck } from "./update/activation";
import { createUpdatePlatform } from "./update/platform";
import { compiledReleaseConfig } from "./update/release-config";
import {
  compiledFrameColors,
  TITLE_BAR_HEIGHT,
  WINDOWS_CAPTION_WIDTH,
  windowTitleBarOptions,
} from "./window-frame";
import { UpdateService } from "./update/service";

const devServerUrl = process.env["ELECTRON_RENDERER_URL"];
const require = createRequire(import.meta.url);
const installationVerificationRequested = process.argv.includes("--verify-installation");

function writeInstallationVerificationReport(report: object): void {
  /* Packaged Windows executables use the GUI subsystem, so stdout may have no
     attached console. A synchronous best-effort write cannot keep the app
     alive; the process exit code remains the automation contract. */
  try {
    fs.writeSync(1, `${JSON.stringify(report)}\n`);
  } catch {
    // No console is the normal packaged Windows case.
  }
}

/* Dev-only: lets tooling drive the app over CDP (never set when packaged). */
const debugPort = process.env["PRAXEUM_DEBUG_PORT"];
if (debugPort !== undefined && !app.isPackaged) {
  app.commandLine.appendSwitch("remote-debugging-port", debugPort);
}

registerVisualScheme();

function openingTitleBarOverlay(): { color?: string; symbolColor?: string; height: number } {
  const colors = compiledFrameColors(nativeTheme.shouldUseDarkColors);
  return colors === null ? { height: TITLE_BAR_HEIGHT } : { ...colors, height: TITLE_BAR_HEIGHT };
}

function createWindow(content: "app" | "runtime-check" = "app"): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 832,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    /* ADR-016: the app draws the bar while the OS keeps its native controls.
       Windows receives the exact overlay it had before; macOS uses hiddenInset
       and enables the overlay geometry variables so renderer content clears
       the real traffic-light area instead of a guessed pixel width. */
    ...windowTitleBarOptions(process.platform, openingTitleBarOverlay()),
    webPreferences: {
      preload: path.join(import.meta.dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once("ready-to-show", () => {
    window.show();
  });

  if (content === "runtime-check") {
    void window.loadURL(runtimeCheckPage());
  } else {
    loadWindowContent(window);
  }
  return window;
}

function loadWindowContent(window: BrowserWindow): void {
  if (devServerUrl !== undefined) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(path.join(import.meta.dirname, "../renderer/index.html"));
  }
}

/** The page shown while a packaged launch verifies its own runtime. It is
 *  plain inline HTML rather than the renderer because the check gates the app
 *  starting at all, and it draws its own title bar for the same reason the app
 *  does: both supported hidden title-bar styles need an app drag region. The
 *  bar is the same height and uses the same OS-reported control insets as the
 *  app, so the swap to real content moves nothing. */
function runtimeCheckPage(): string {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="color-scheme" content="light dark">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${PRODUCT_NAME}</title><style>
html,body{height:100%;margin:0}body{display:grid;grid-template-rows:auto 1fr;background:Canvas;color:CanvasText;font:.875rem/1.5 Inter,system-ui,sans-serif}
header{-webkit-app-region:drag;display:flex;align-items:center;gap:.5rem;height:${String(TITLE_BAR_HEIGHT)}px;padding-left:max(.875rem,env(titlebar-area-x,0));padding-right:max(.875rem,calc(100vw - env(titlebar-area-x,0) - env(titlebar-area-width,calc(100vw - ${String(WINDOWS_CAPTION_WIDTH)}px))))}
.chip{width:.625rem;height:.625rem;border:.0625rem solid GrayText;border-radius:.1875rem}
.wordmark{color:GrayText;font-weight:500;letter-spacing:-.01em}
main{place-self:center;text-align:center}
.mark{width:2.125rem;height:2.125rem;margin:0 auto 1.375rem;border:.0625rem solid ButtonBorder;border-radius:.625rem;display:grid;place-items:center;font:600 1rem Georgia,serif}
h1{margin:0 0 .375rem;font-size:1rem;font-weight:600;letter-spacing:-.01em}p{margin:0;color:GrayText}.spinner{width:1.125rem;height:1.125rem;margin:1.5rem auto 0;border:.125rem solid ButtonFace;border-top-color:CanvasText;border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
</style></head><body><header><span class="chip" aria-hidden="true"></span><span class="wordmark">${PRODUCT_WORDMARK}</span></header><main aria-live="polite"><div class="mark">${PRODUCT_NAME[0]}</div><h1>Checking installation</h1><p>Confirming the tools this app installed for itself are complete and unchanged.</p><div class="spinner" aria-hidden="true"></div></main></body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

/* The renderer loads only bundled content (SPEC §4): windows never open, and
   the only navigations allowed are within the dev server during dev. Course
   visuals render in iframes on the praxeum-visual scheme, which is a subframe
   load, not a navigation — will-navigate still guards the top frame. */
app.on("web-contents-created", (_event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-navigate", (event, url) => {
    if (devServerUrl !== undefined && url.startsWith(devServerUrl)) return;
    event.preventDefault();
  });
});

/* Theme. nativeTheme is the single owner: setting themeSource drives the
   renderer's own prefers-color-scheme, so the CSS media query stays the one
   place the resolved theme is expressed and there is no second source to keep
   in sync. The preference persists; the resolution never does. */
function themeState(): ThemeState {
  const preference = readSettings().theme ?? "system";
  return { preference, dark: nativeTheme.shouldUseDarkColors };
}

function applyThemePreference(preference: ThemePreference): void {
  nativeTheme.themeSource = preference;
}

function broadcastThemeChange(): void {
  const state = themeState();
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(THEME_CHANGED_CHANNEL, state);
  }
}

function broadcastCourseChange(paths: string[]): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(COURSE_CHANGED_CHANNEL, paths);
  }
}

function broadcastSeminarEvent(event: AgentEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(SEMINAR_EVENT_CHANNEL, event);
  }
}

function broadcastSeminarSnapshot(snapshot: SeminarSnapshot): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(SEMINAR_SNAPSHOT_CHANNEL, snapshot);
  }
}

function broadcastUpdateStatus(status: UpdateStatus): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(UPDATE_STATUS_CHANGED_CHANNEL, status);
  }
}

let seminar: SessionConductor | null = null;
let registry: FileCourseRegistry | null = null;
let creator: CourseCreator | null = null;
let providers: TutorProviderRegistry | null = null;
let updates: UpdateService | null = null;
let editors: EditorService | null = null;

function editorService(): EditorService {
  editors ??= new EditorService({
    discover: () => discoverEditors(),
    readPreference: () => readSettings().editor,
    writePreference: (editor) => {
      updateSettings({ editor });
    },
    isRunnable: (executablePath) => {
      try {
        const stat = fs.statSync(executablePath);
        // A macOS app is a directory; everywhere else a program is a file.
        return stat.isFile() || (process.platform === "darwin" && stat.isDirectory());
      } catch {
        return false;
      }
    },
  });
  return editors;
}

/** The directory "Open in editor" opens: a module's scaffold — the project
 *  the learner builds, where package.json lives and the checks run — or the
 *  course folder. A module id is guarded the same way the check runner
 *  guards it, and a scaffold that does not exist is "no target", never a
 *  freshly created directory. */
function editorTargetDirectory(root: string, target: unknown): string | null {
  if (typeof target !== "object" || target === null) return null;
  const record = target as Record<string, unknown>;
  if (record["kind"] === "course") return root;
  if (record["kind"] !== "module" || typeof record["moduleId"] !== "string") return null;
  const guarded = guardModuleDirectory(root, record["moduleId"]);
  if (!guarded.ok) return null;
  try {
    return fs.statSync(guarded.scaffoldDir).isDirectory() ? guarded.scaffoldDir : null;
  } catch {
    return null;
  }
}

function sessionConductor(): SessionConductor {
  if (seminar === null) throw new Error("The session conductor is not ready.");
  return seminar;
}

function courseRegistry(): FileCourseRegistry {
  if (registry === null) throw new Error("The course registry is not ready.");
  return registry;
}

function courseCreator(): CourseCreator {
  if (creator === null) throw new Error("Course creation is not ready.");
  return creator;
}

function tutorProviders(): TutorProviderRegistry {
  if (providers === null) throw new Error("Tutor providers are not ready.");
  return providers;
}

function updateService(): UpdateService {
  if (updates === null) throw new Error("The update service is not ready.");
  return updates;
}

function isTutorProviderId(value: unknown): value is TutorProviderId {
  return value === "claude" || value === "codex";
}

function defaultCourseParent(): string {
  return path.join(app.getPath("home"), PRODUCT_NAME);
}

async function openCourseAt(root: string): Promise<CourseSnapshot> {
  await courseRegistry().register(root);
  const previous = currentCourseRoot();
  if (previous !== null && !sameCoursePath(previous, root)) {
    await sessionConductor().abandon();
  }
  const snapshot = loadCourse(root);
  watchCourse(root, broadcastCourseChange);
  return snapshot;
}

async function leaveCourse(): Promise<void> {
  await sessionConductor().abandon();
  closeCourse();
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : "The operation could not be completed.";
}

function sameCoursePath(left: string, right: string): boolean {
  const normalize = (value: string): string => {
    const resolved = path.resolve(value);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  };
  return normalize(left) === normalize(right);
}

void app.whenReady().then(async () => {
  /* Release automation needs proof from the exact packaged executable, not a
     source-level recreation of its checks. This mode opens no window, starts
     no provider, touches no app data, and reports only package-owned facts. */
  if (installationVerificationRequested) {
    if (!app.isPackaged) {
      writeInstallationVerificationReport({
        ok: false,
        reason: "Installation verification requires a packaged app.",
      });
      app.exit(2);
      return;
    }
    try {
      const runtime = resolveRuntimeLayout({
        packaged: true,
        resourcesPath: process.resourcesPath,
      });
      const inspection = await inspectPackagedRuntime(runtime, app.getVersion(), {
        forceFull: true,
      });
      const report = inspection.ok
        ? {
            ok: true,
            appVersion: inspection.manifest.appVersion,
            target: inspection.manifest.target,
            payload: inspection.manifest.payload,
          }
        : inspection;
      writeInstallationVerificationReport(report);
      app.exit(inspection.ok ? 0 : 1);
    } catch (error) {
      writeInstallationVerificationReport({
        ok: false,
        reason: error instanceof Error ? error.message : "Installation verification failed.",
      });
      app.exit(1);
    }
    return;
  }

  handleVisualScheme(currentCourseRoot);
  /* Resolve the theme before a packaged integrity check so its visible,
     non-interactive startup page never flashes the wrong scheme. */
  applyThemePreference(readSettings().theme ?? "system");
  const startupWindow = app.isPackaged ? createWindow("runtime-check") : null;
  // A missing npm module must degrade to "checks unavailable", never to an
  // app that boots with no window and no error (the script service already
  // refuses loudly on an absent path).
  let npmCliPath = "";
  try {
    npmCliPath = path.join(path.dirname(require.resolve("npm")), "bin", "npm-cli.js");
  } catch {
    // Leave it empty; the engine-script service reports the truth per run.
  }
  const runtime = resolveRuntimeLayout({
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    development: app.isPackaged
      ? undefined
      : {
          courseTemplateRoot: path.resolve(app.getAppPath(), "course-engine", "template"),
          npmCliPath,
        },
  });
  if (runtime.mode === "packaged") {
    const inspection = await inspectPackagedRuntime(runtime, app.getVersion(), {
      cachePath: path.join(app.getPath("userData"), "runtime-verification-cache.json"),
    });
    if (!inspection.ok) {
      dialog.showErrorBox(
        `${PRODUCT_NAME} needs repair`,
        `${inspection.reason}\n\nReinstall this version of ${PRODUCT_NAME}. Your course folders and provider account are not removed.`,
      );
      app.quit();
      return;
    }
  }
  registry = new FileCourseRegistry(app.getPath("userData"));
  creator = new CourseCreator({
    courseTemplateRoot: runtime.courseTemplateRoot,
    git: new HostGitRunner(runtime.gitExecutable),
  });
  const runtimeEnvironment =
    runtime.toolDirectories.length === 0
      ? undefined
      : createRuntimeEnvironment(
          runtime.toolDirectories,
          process.env,
          process.platform,
          process.execPath,
        );
  providers = new TutorProviderRegistry(
    [
      createRefreshingTutorProvider({
        id: "claude",
        label: "Claude Code",
        load: () => {
          const runtime = discoverInstalledProviderRuntime("claude");
          const executable = runtime.executablePath;
          return new ClaudeTutorProvider({
            runtimeProbe: createProviderRuntimeProbe(runtime, runtimeEnvironment),
            command:
              executable === null
                ? null
                : createClaudeCommandRunner(executable, runtimeEnvironment),
            agent:
              executable === null
                ? null
                : new ClaudeTutorAgent(undefined, undefined, executable, runtimeEnvironment),
            openExternal: (url) => shell.openExternal(url),
          });
        },
      }),
      createRefreshingTutorProvider({
        id: "codex",
        label: "Codex",
        load: () => {
          const runtime = discoverInstalledProviderRuntime("codex");
          const executable = runtime.executablePath;
          return new CodexTutorProvider({
            runtimeProbe: createProviderRuntimeProbe(runtime, runtimeEnvironment),
            openExternal: (url) => shell.openExternal(url),
            appServer:
              executable === null
                ? null
                : createCodexAppServerFactory({
                    executable,
                    clientVersion: app.getVersion(),
                    environment: runtimeEnvironment,
                  }),
          });
        },
      }),
    ],
    {
      read: () => readSettings().tutorProvider ?? null,
      write: (providerId) => updateSettings({ tutorProvider: providerId }),
    },
  );
  seminar = new SessionConductor({
    createAgent: () => tutorProviders().createSelectedAgent(),
    scripts: createEngineScriptService({
      runner: new ElectronUtilityProcessRunner(runtimeEnvironment),
      npmCliPath: runtime.npmCliPath,
    }),
    userDataPath: app.getPath("userData"),
    emitAgentEvent: broadcastSeminarEvent,
    emitSnapshot: broadcastSeminarSnapshot,
  });
  const updatePlatform = createUpdatePlatform({
    platform: process.platform,
    architecture: process.arch,
    portableExecutable: Boolean(process.env["PORTABLE_EXECUTABLE_FILE"]),
    openPath: (filePath) => shell.openPath(filePath),
    launchDetached: (filePath, args) => {
      const child = spawn(filePath, [...args], { detached: true, stdio: "ignore" });
      child.unref();
    },
  });
  updates = new UpdateService({
    config: compiledReleaseConfig,
    currentVersion: app.getVersion(),
    target: updatePlatform.target,
    downloadRoot: path.join(app.getPath("userData"), "updates"),
    emitStatus: broadcastUpdateStatus,
    prepareForHandoff: () => sessionConductor().prepareForUpdate(),
    launchArtifact: updatePlatform.launchArtifact,
    quit: () => app.quit(),
  });

  ipcMain.handle(THEME_GET_CHANNEL, (): ThemeState => themeState());

  ipcMain.handle(THEME_SET_CHANNEL, (_event, preference: unknown): ThemeState => {
    if (preference !== "system" && preference !== "light" && preference !== "dark") {
      return themeState();
    }
    updateSettings({ theme: preference });
    applyThemePreference(preference);
    return themeState();
  });

  ipcMain.handle(TITLE_BAR_OVERLAY_CHANNEL, (event, colors: unknown): void => {
    if (typeof colors !== "object" || colors === null) return;
    const { color, symbolColor } = colors as Partial<TitleBarOverlayColors>;
    if (typeof color !== "string" || typeof symbolColor !== "string") return;

    const window = BrowserWindow.fromWebContents(event.sender);
    // Windows-only API; on a platform without it the native bar keeps its own
    // colours and the app is merely less matched, never broken.
    if (window === null || typeof window.setTitleBarOverlay !== "function") return;
    try {
      window.setTitleBarOverlay({ color, symbolColor, height: TITLE_BAR_HEIGHT });
    } catch {
      // A rejected colour string must not take the window down with it.
    }
  });

  ipcMain.handle(LAYOUT_GET_CHANNEL, (): WorkspaceLayout => readSettings().layout ?? {});

  /* Merged against what is stored, not written over it: the renderer sends one
     pane at a time (a drag only moves one seam), and a replace would forget the
     other column every time a seam moved. */
  ipcMain.handle(LAYOUT_SET_CHANNEL, (_event, patch: unknown): void => {
    if (typeof patch !== "object" || patch === null) return;
    const raw = patch as Record<string, unknown>;
    const next: WorkspaceLayout = { ...(readSettings().layout ?? {}) };
    for (const key of ["railWidth", "talkWidth"] as const) {
      const width = raw[key];
      if (typeof width === "number" && Number.isFinite(width) && width > 0) {
        next[key] = Math.round(width);
      }
    }
    updateSettings({ layout: next });
  });

  ipcMain.handle(PROVIDERS_LIST_CHANNEL, async (): Promise<ProviderCatalog> =>
    tutorProviders().catalog(),
  );

  ipcMain.handle(
    PROVIDER_SELECT_CHANNEL,
    async (_event, providerId: unknown): Promise<ProviderCatalog> => {
      if (!isTutorProviderId(providerId)) throw new Error("That tutor is not available.");
      tutorProviders().select(providerId);
      return tutorProviders().catalog();
    },
  );

  ipcMain.handle(
    PROVIDER_LOGIN_CHANNEL,
    async (_event, providerId: unknown): Promise<ProviderLoginReply> => {
      if (!isTutorProviderId(providerId)) throw new Error("That tutor is not available.");
      return tutorProviders().beginLogin(providerId);
    },
  );

  ipcMain.handle(PROVIDER_LOGIN_CANCEL_CHANNEL, (_event, providerId: unknown): void => {
    if (!isTutorProviderId(providerId)) return;
    tutorProviders().cancelLogin(providerId);
  });

  ipcMain.handle(
    PROVIDER_SETUP_GUIDE_CHANNEL,
    async (_event, providerId: unknown): Promise<void> => {
      if (!isTutorProviderId(providerId)) throw new Error("That tutor is not available.");
      await tutorProviders().openSetupGuide(providerId);
    },
  );

  ipcMain.handle(PING_CHANNEL, () => {
    if (!app.isPackaged) console.log("[praxeum] ipc ping: renderer round-trip ok");
    return buildPingReply(app.getVersion(), process.versions);
  });

  ipcMain.handle(UPDATE_STATUS_GET_CHANNEL, (): UpdateStatus => updateService().current());
  ipcMain.handle(UPDATE_CHECK_CHANNEL, async (): Promise<UpdateStatus> =>
    updateService().checkForUpdate(),
  );
  ipcMain.handle(UPDATE_DOWNLOAD_CHANNEL, async (): Promise<UpdateStatus> =>
    updateService().downloadUpdate(),
  );
  ipcMain.handle(UPDATE_HANDOFF_CHANNEL, async (): Promise<UpdateStatus> =>
    updateService().handoffUpdate(),
  );

  ipcMain.handle(COURSE_OPEN_CHANNEL, async (): Promise<OpenCourseReply> => {
    const picked = await dialog.showOpenDialog({
      title: "Open a course folder",
      properties: ["openDirectory"],
    });
    const root = picked.filePaths[0];
    if (picked.canceled || root === undefined) return { ok: false, reason: "cancelled" };
    if (!looksLikeCourse(root)) {
      return {
        ok: false,
        reason: "not-a-course",
        detail: "That folder has no course in it (no CLAUDE.md, COURSE.md, curriculum, or tutor).",
      };
    }
    try {
      return { ok: true, course: await openCourseAt(root) };
    } catch (error) {
      return { ok: false, reason: "error", detail: errorDetail(error) };
    }
  });

  ipcMain.handle(COURSE_CURRENT_CHANNEL, (): CourseSnapshot | null => {
    const open = currentCourseRoot();
    if (open !== null) return loadCourse(open);
    return null;
  });

  ipcMain.handle(DASHBOARD_LIST_CHANNEL, async (): Promise<DashboardReply> => {
    const defaultParentDirectory = defaultCourseParent();
    try {
      // One-time migration from M1's remembered path — CONSUMED on first
      // attempt (or a re-registered course would resurrect after every
      // Remove-from-list that empties the registry), and adopted only when
      // the course already carries its marker: a listing never writes into
      // a course folder. A markerless M1 course is one folder-pick away.
      const remembered = lastCoursePath();
      if (remembered !== null) {
        if (
          courseRegistry().list().length === 0 &&
          fs.existsSync(remembered) &&
          looksLikeCourse(remembered)
        ) {
          await courseRegistry().adopt(remembered);
        }
        clearLastCourse();
      }
      return {
        ok: true,
        courses: courseRegistry().list().map(describeRegisteredCourse),
        defaultParentDirectory,
      };
    } catch (error) {
      return { ok: false, detail: errorDetail(error), defaultParentDirectory };
    }
  });

  ipcMain.handle(
    COURSE_OPEN_KNOWN_CHANNEL,
    async (_event, courseId: unknown): Promise<OpenCourseReply> => {
      if (typeof courseId !== "string") return { ok: false, reason: "not-found" };
      const entry = courseRegistry()
        .list()
        .find((course) => course.courseId === courseId);
      if (entry === undefined) return { ok: false, reason: "not-found" };
      if (!fs.existsSync(entry.rootPath) || !looksLikeCourse(entry.rootPath)) {
        return {
          ok: false,
          reason: "missing",
          detail: "That course folder has moved or is unavailable.",
        };
      }
      try {
        return { ok: true, course: await openCourseAt(entry.rootPath) };
      } catch (error) {
        return { ok: false, reason: "error", detail: errorDetail(error) };
      }
    },
  );

  ipcMain.handle(
    COURSE_LOCATE_CHANNEL,
    async (_event, courseId: unknown): Promise<OpenCourseReply> => {
      if (typeof courseId !== "string") return { ok: false, reason: "not-found" };
      if (
        !courseRegistry()
          .list()
          .some((course) => course.courseId === courseId)
      ) {
        return { ok: false, reason: "not-found" };
      }
      const picked = await dialog.showOpenDialog({
        title: "Locate this course folder",
        properties: ["openDirectory"],
      });
      const root = picked.filePaths[0];
      if (picked.canceled || root === undefined) return { ok: false, reason: "cancelled" };
      if (!looksLikeCourse(root)) {
        return {
          ok: false,
          reason: "not-a-course",
          detail: "That folder does not contain a course.",
        };
      }
      try {
        await courseRegistry().relocate(courseId, root);
        return { ok: true, course: await openCourseAt(root) };
      } catch (error) {
        return { ok: false, reason: "error", detail: errorDetail(error) };
      }
    },
  );

  ipcMain.handle(COURSE_FORGET_CHANNEL, async (_event, courseId: unknown): Promise<void> => {
    if (typeof courseId !== "string") return;
    const entry = courseRegistry()
      .list()
      .find((course) => course.courseId === courseId);
    if (
      entry !== undefined &&
      currentCourseRoot() !== null &&
      sameCoursePath(currentCourseRoot() ?? "", entry.rootPath)
    ) {
      await leaveCourse();
    }
    courseRegistry().forget(courseId);
  });

  ipcMain.handle(
    COURSE_CHOOSE_PARENT_CHANNEL,
    async (_event, currentDirectory: unknown): Promise<ChooseCourseParentReply> => {
      const fallback = defaultCourseParent();
      const defaultPath =
        typeof currentDirectory === "string" && fs.existsSync(currentDirectory)
          ? currentDirectory
          : fallback;
      const picked = await dialog.showOpenDialog({
        title: "Choose where courses live",
        defaultPath,
        properties: ["openDirectory", "createDirectory"],
      });
      const parentDirectory = picked.filePaths[0];
      return picked.canceled || parentDirectory === undefined
        ? { ok: false, reason: "cancelled" }
        : { ok: true, parentDirectory };
    },
  );

  ipcMain.handle(
    COURSE_CREATE_CHANNEL,
    async (_event, name: unknown, parentDirectory: unknown): Promise<OpenCourseReply> => {
      if (typeof name !== "string" || typeof parentDirectory !== "string") {
        return { ok: false, reason: "error", detail: "Give the course a name and location." };
      }
      try {
        // Validate the name BEFORE creating the parent chain, so a rejected
        // form submission leaves no directories behind as a side effect.
        const validation = validateCourseName(name);
        if (!validation.ok) return { ok: false, reason: "error", detail: validation.reason };
        fs.mkdirSync(parentDirectory, { recursive: true });
        const created = await courseCreator().create({ name, parentDirectory });
        return { ok: true, course: await openCourseAt(created.rootPath) };
      } catch (error) {
        return { ok: false, reason: "error", detail: errorDetail(error) };
      }
    },
  );

  ipcMain.handle(COURSE_CLOSE_CHANNEL, async (): Promise<void> => leaveCourse());

  ipcMain.handle(COURSE_READ_DOC_CHANNEL, (_event, relativePath: unknown): string | null => {
    const root = currentCourseRoot();
    if (root === null || typeof relativePath !== "string") return null;
    const { abs, ok } = guardCourseDoc(root, relativePath);
    if (!ok || !fs.existsSync(abs)) return null;
    try {
      return fs.readFileSync(abs, "utf8");
    } catch {
      return null;
    }
  });

  ipcMain.handle(COURSE_REVEAL_CHANNEL, async (): Promise<void> => {
    const root = currentCourseRoot();
    if (root !== null) await shell.openPath(root);
  });

  ipcMain.handle(EDITORS_LIST_CHANNEL, (): EditorCatalog => editorService().catalog());

  ipcMain.handle(EDITOR_SELECT_CHANNEL, (_event, editorId: unknown): EditorCatalog =>
    editorService().select(editorId),
  );

  ipcMain.handle(EDITOR_BROWSE_CHANNEL, async (): Promise<BrowseEditorReply> => {
    const picked = await dialog.showOpenDialog({
      title: "Choose an editor",
      properties: ["openFile", "dontAddToRecent"],
      ...(process.platform === "win32"
        ? { filters: [{ name: "Programs", extensions: ["exe"] }] }
        : process.platform === "darwin"
          ? { filters: [{ name: "Applications", extensions: ["app"] }] }
          : {}),
    });
    const executablePath = picked.filePaths[0];
    if (picked.canceled || executablePath === undefined) {
      return { ok: false, reason: "cancelled", catalog: editorService().catalog() };
    }
    const catalog = editorService().chooseCustom(executablePath);
    if (catalog === null) {
      return { ok: false, reason: "not-runnable", catalog: editorService().catalog() };
    }
    return { ok: true, catalog };
  });

  ipcMain.handle(
    EDITOR_OPEN_CHANNEL,
    async (_event, target: unknown): Promise<OpenInEditorReply> => {
      const root = currentCourseRoot();
      if (root === null) return { ok: false, reason: "no-course", detail: "Open a course first." };
      const directory = editorTargetDirectory(root, target);
      if (directory === null) {
        return {
          ok: false,
          reason: "no-target",
          detail: "This module has no project folder to open yet.",
        };
      }
      return editorService().open(directory);
    },
  );

  ipcMain.handle(
    SEMINAR_START_CHANNEL,
    async (_event, currentModuleId: unknown): Promise<StartSeminarReply> => {
      const root = currentCourseRoot();
      if (root === null) {
        return { ok: false, reason: "no-course", detail: "Open a course before starting." };
      }
      const course = loadCourse(root);
      return sessionConductor().start({
        courseDir: root,
        currentModuleId: typeof currentModuleId === "string" ? currentModuleId : null,
        onboarding: course.data.modules.length === 0,
      });
    },
  );

  ipcMain.handle(SEMINAR_CURRENT_CHANNEL, async (): Promise<SeminarSnapshot> => {
    const root = currentCourseRoot();
    return root === null
      ? {
          lifecycle: "closed",
          sessionId: null,
          messages: [],
          totalCostUsd: 0,
          turnInProgress: false,
        }
      : sessionConductor().current(root);
  });

  ipcMain.handle(SEMINAR_SEND_CHANNEL, async (_event, message: unknown): Promise<void> => {
    if (typeof message !== "string" || message.length === 0) return;
    await sessionConductor().send(message);
  });

  ipcMain.handle(
    SEMINAR_APPROVAL_CHANNEL,
    async (_event, requestId: unknown, allow: unknown, reason: unknown): Promise<void> => {
      if (typeof requestId !== "string" || typeof allow !== "boolean") return;
      await sessionConductor().respondToApproval(
        requestId,
        allow,
        typeof reason === "string" ? reason : undefined,
      );
    },
  );

  ipcMain.handle(SEMINAR_RETRY_CHANNEL, async (): Promise<void> => sessionConductor().retry());

  ipcMain.handle(SEMINAR_CONTROLS_GET_CHANNEL, async (): Promise<SessionControls | null> =>
    sessionConductor().sessionControls(),
  );

  ipcMain.handle(
    SEMINAR_CONTROLS_SET_CHANNEL,
    async (_event, patch: unknown): Promise<SessionControls | null> => {
      // The renderer's patch is validated here rather than trusted: only the
      // three known keys, only the shapes the seam declares.
      if (typeof patch !== "object" || patch === null) return null;
      const raw = patch as Record<string, unknown>;
      const checked: SessionControlPatch = {};
      if ("model" in raw && (typeof raw.model === "string" || raw.model === null)) {
        checked.model = raw.model;
      }
      if ("effort" in raw && (typeof raw.effort === "string" || raw.effort === null)) {
        checked.effort = raw.effort as SessionControlPatch["effort"];
      }
      if (typeof raw.autonomy === "string") checked.autonomy = raw.autonomy;
      return await sessionConductor().applySessionControls(checked);
    },
  );

  ipcMain.handle(SEMINAR_ALLOW_EDITS_CHANNEL, async (_event, requestId: unknown): Promise<void> => {
    if (typeof requestId !== "string") return;
    await sessionConductor().allowCourseEditsForSession(requestId);
  });

  ipcMain.handle(SEMINAR_INTERRUPT_CHANNEL, async (): Promise<void> =>
    sessionConductor().interrupt(),
  );
  ipcMain.handle(SEMINAR_END_CHANNEL, async (): Promise<void> => sessionConductor().end());

  ipcMain.handle(CHECK_RUN_CHANNEL, async (_event, moduleId: unknown): Promise<RunChecksReply> => {
    const root = currentCourseRoot();
    if (root === null || typeof moduleId !== "string") {
      return { ok: false, reason: "bad-module", detail: "Open a valid module first." };
    }
    return sessionConductor().runChecks(root, moduleId);
  });

  nativeTheme.on("updated", broadcastThemeChange);

  if (startupWindow === null || startupWindow.isDestroyed()) {
    createWindow();
  } else {
    loadWindowContent(startupWindow);
  }
  void updateService().checkForUpdate();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  registerUpdateActivationCheck(app, updateService());
});

app.on("window-all-closed", () => {
  unwatchCourse();
  void seminar?.abandon();
  if (process.platform !== "darwin") app.quit();
});
