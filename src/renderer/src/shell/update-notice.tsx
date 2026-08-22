/* How an available version reaches the learner.
 *
 * ADR-024 owns the update state machine in the main process; this is only its
 * presentation, in three pieces that each do one job:
 *
 * - The STATUS ITEM is the persistent fact, in the status bar where the app's
 *   ambient facts already live: "0.0.9 available", "Downloading 0.0.9 · 42%",
 *   "0.0.9 ready". It moves nothing and stays for as long as an update stands.
 * - The TOAST is the attention signal, bottom-left above the status bar. It
 *   appears once per moment that deserves a glance — a version offered, a
 *   verified download waiting to install, an action that failed — and once
 *   dismissed it stays dismissed for the run. The fact is still in the bar.
 * - The DIALOG holds everything else: what the action will do, the failure
 *   detail, the action itself, and the way to the release notes.
 *
 * The previous shape was one full-width banner above the workspace: it pushed
 * the layout down when it appeared, stayed up forever, and dumped the raw
 * release-notes Markdown into a five-line scroller. Release notes now open on
 * the version's release page in the browser; main owns that URL and the
 * renderer only asks for the page to be opened. */

import { useEffect, useId, useRef, useState } from "react";
import { PRODUCT_NAME } from "../../../shared/product";
import type { UpdateStatus } from "../../../shared/update";
import { PRIMARY, QUIET } from "../components/controls";
import { SpinnerGlyph } from "../components/glyphs";
import { Dismiss } from "../components/notice";

type Operation = "check" | "download" | "handoff";

/** One status, read three ways. Derived in one place so the item, the toast,
 *  and the dialog never disagree about what is going on. */
export interface UpdatePresentation {
  version: string | null;
  /** The status-bar label. */
  item: string;
  /** The one-line fact, for the toast and the dialog. */
  headline: string;
  /** What the action will do, or how to finish — for the dialog only. */
  detail: string | null;
  action: { label: string; operation: Operation } | null;
  busy: boolean;
  /** Download progress 0–100 while it runs, else null. */
  progress: number | null;
  /** Null when this status is not worth a toast. Otherwise a key that stays
   *  the same for as long as the same thing is being announced, so a dismissal
   *  covers the whole of one announcement and not one render of it. */
  announce: string | null;
}

export function presentUpdate(status: UpdateStatus): UpdatePresentation | null {
  switch (status.phase) {
    case "unavailable":
    case "checking":
    case "current":
      return null;
    case "available":
      return {
        version: status.version,
        item: `${status.version} available`,
        headline: `${PRODUCT_NAME} ${status.version} is available.`,
        detail: "Download it when you are ready. Nothing changes until you choose to install it.",
        action: { label: "Download", operation: "download" },
        busy: false,
        progress: null,
        announce: `available:${status.version}`,
      };
    case "downloading": {
      const progress =
        status.totalBytes > 0
          ? Math.min(100, Math.floor((status.receivedBytes / status.totalBytes) * 100))
          : 0;
      return {
        version: status.version,
        item: `Downloading ${status.version} · ${String(progress)}%`,
        headline: `Downloading ${PRODUCT_NAME} ${status.version}`,
        detail: `${megabytes(status.receivedBytes)} of ${megabytes(status.totalBytes)} MB. The download is verified before anything is installed.`,
        action: null,
        busy: true,
        progress,
        /* The same announcement as the offer: a learner who pressed Download
           on the toast keeps watching the same card, and one who dismissed the
           offer and downloaded from the dialog is not interrupted again. */
        announce: `available:${status.version}`,
      };
    }
    case "ready":
      return {
        version: status.version,
        item: `${status.version} ready`,
        headline: `${PRODUCT_NAME} ${status.version} is downloaded and verified.`,
        detail:
          status.action === "install-restart"
            ? `${PRODUCT_NAME} closes, installs the update, and reopens. If your tutor is mid-turn, it finishes first.`
            : `${PRODUCT_NAME} quits and opens the downloaded package. Finish the installation there, then open ${PRODUCT_NAME} again. If your tutor is mid-turn, it finishes first.`,
        action: {
          label:
            status.action === "install-restart" ? "Restart to update" : "Open downloaded package",
          operation: "handoff",
        },
        busy: false,
        progress: null,
        announce: `ready:${status.version}`,
      };
    case "preparing":
      return {
        version: status.version,
        item: "Waiting for the tutor turn…",
        headline: "Waiting for the current tutor turn to finish…",
        detail: "The update starts as soon as it does.",
        action: null,
        busy: true,
        progress: null,
        announce: `ready:${status.version}`,
      };
    case "error":
      return {
        version: null,
        item:
          status.operation === "check"
            ? "Update check failed"
            : status.operation === "download"
              ? "Update download failed"
              : "Update could not start",
        headline: status.detail,
        detail: null,
        action: { label: "Try again", operation: status.operation },
        busy: false,
        progress: null,
        /* A failed automatic check is a fact for the bar, not an interruption:
           nothing the learner did went wrong. A failed download or handoff
           followed their own action, so it is announced. */
        announce: status.operation === "check" ? null : `error:${status.operation}`,
      };
  }
}

function megabytes(bytes: number): string {
  return (bytes / 1_000_000).toFixed(bytes >= 10_000_000 ? 0 : 1);
}

/* Dismissals live for the process, not for the component: the shell remounts
   between the dashboard and a course, and a toast that came back on every
   navigation would be the banner again with extra steps. */
const dismissed = new Set<string>();

/** For tests, which mount the shell many times in one process. */
export function forgetDismissedUpdateNotices(): void {
  dismissed.clear();
}

export interface UpdateNoticeModel {
  shown: UpdatePresentation | null;
  toastVisible: boolean;
  dialogOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;
  dismissToast: () => void;
  /** Run the presentation's action: download, hand off, or re-check. */
  invoke: () => void;
  openReleasePage: () => void;
}

export function useUpdateNotice(): UpdateNoticeModel {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [, rerender] = useState(0);

  useEffect(() => {
    const api = window.praxeum;
    // The visual harness can intentionally expose a narrower bridge fixture.
    if (typeof api?.getUpdateStatus !== "function") return;
    let active = true;
    void api.getUpdateStatus().then((next) => {
      if (active) setStatus(next);
    });
    const unsubscribe = api.onUpdateStatusChanged((next) => {
      if (active) setStatus(next);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const shown = status === null ? null : presentUpdate(status);
  const standing = shown !== null;
  useEffect(() => {
    if (!standing) setDialogOpen(false);
  }, [standing]);

  const announce = shown?.announce ?? null;
  const dismissToast = (): void => {
    if (announce === null) return;
    dismissed.add(announce);
    rerender((n) => n + 1);
  };

  const invoke = (): void => {
    if (shown?.action === undefined || shown.action === null) return;
    const api = window.praxeum;
    const { operation } = shown.action;
    const run =
      operation === "download"
        ? api.downloadUpdate()
        : operation === "handoff"
          ? api.handoffUpdate()
          : api.checkForUpdate();
    void run.then(setStatus).catch(() => {
      setStatus({
        phase: "error",
        operation,
        detail: "The update action could not be completed. Your current app is unchanged.",
      });
    });
  };

  return {
    shown,
    toastVisible: announce !== null && !dismissed.has(announce),
    dialogOpen: standing && dialogOpen,
    openDialog: () => {
      /* Opening the dialog is engagement: the toast has done its job. */
      dismissToast();
      setDialogOpen(true);
    },
    closeDialog: () => {
      setDialogOpen(false);
    },
    dismissToast,
    invoke,
    openReleasePage: () => {
      void window.praxeum.openUpdateReleasePage();
    },
  };
}

/** A circled up-arrow: the conventional "update" mark, drawn as geometry at
 *  the status bar's scale. */
function UpdateMark(): React.JSX.Element {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
      <circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" strokeWidth="1" />
      <path
        d="M6 8.6V3.6M3.9 5.6 6 3.5l2.1 2.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The status-bar item. A step brighter than the bar's own text so it reads
 *  as a fact with a door on it, and the same control shape as the theme
 *  switch beside it. */
export function UpdateStatusItem({
  model,
}: {
  model: UpdateNoticeModel;
}): React.JSX.Element | null {
  const { shown } = model;
  if (shown === null) return null;
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-expanded={model.dialogOpen}
      onClick={model.openDialog}
      className="hover:bg-accent-wash hover:text-hi focus-visible:outline-focus text-ink flex min-w-0 shrink-0 items-center gap-1.5 rounded-pill px-2 py-0.5 tabular-nums transition-colors focus-visible:outline-2"
    >
      {shown.busy ? <SpinnerGlyph className="animate-spin size-3 shrink-0" /> : <UpdateMark />}
      <span className="truncate">{shown.item}</span>
    </button>
  );
}

function ProgressBar({
  value,
  className,
}: {
  value: number;
  className: string;
}): React.JSX.Element {
  return (
    <div
      role="progressbar"
      aria-label="Download progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      className={`bg-wash h-1 w-full overflow-hidden rounded-pill ${className}`}
    >
      <div
        className="bg-accent h-full rounded-pill transition-[width] duration-(--dur-fast) ease-(--ease)"
        style={{ width: `${String(value)}%` }}
      />
    </div>
  );
}

/* Compact controls for the toast: the dialog's full-size pair would make a
   six-line card out of a two-line notice. Full literal strings (controls.ts
   explains why). */
const TOAST_PRIMARY =
  "bg-accent text-accent-ink hover:brightness-95 focus-visible:outline-focus inline-flex items-center " +
  "rounded-pill px-3 py-1 text-xs font-medium transition-[filter] focus-visible:outline-2 " +
  "focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-60 disabled:hover:brightness-100";
const TOAST_GHOST =
  "text-ink-dim hover:bg-accent-wash hover:text-hi focus-visible:outline-focus inline-flex items-center " +
  "rounded-pill px-2.5 py-1 text-xs transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2";

/** The toast and the dialog. Rendered by the shell once, beside the status
 *  bar, so every surface gets the same notice in the same place. */
export function UpdateNotice({ model }: { model: UpdateNoticeModel }): React.JSX.Element | null {
  const { shown } = model;
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialogRef.current;
    if (element === null) return;
    if (model.dialogOpen && !element.open) element.showModal();
    if (!model.dialogOpen && element.open) element.close();
  }, [model.dialogOpen]);

  if (shown === null) return null;
  const title = shown.version === null ? "Update" : `${PRODUCT_NAME} ${shown.version}`;

  return (
    <>
      {model.toastVisible ? (
        <section
          role="status"
          aria-label="Update"
          /* Raised a step, edged, and lifted: the same separation the record
             overlay uses, at popover weight because it floats over the
             workspace rather than replacing it. Fixed bottom-left, one gutter
             above the status bar whose item it hands over to. */
          className="bg-surface-raised border-line-strong shadow-popover animate-settle fixed bottom-(--notice-bottom) left-3 z-20 w-(--notice-w) rounded-lg border p-4"
        >
          <div className="flex items-start gap-3">
            <p className="text-ink min-w-0 flex-1 text-sm leading-normal font-medium text-pretty">
              {shown.headline}
            </p>
            <Dismiss label="Dismiss this update notice" onDismiss={model.dismissToast} />
          </div>
          {shown.progress === null ? null : <ProgressBar value={shown.progress} className="mt-3" />}
          <div className="mt-3 flex items-center gap-2">
            {shown.action === null ? null : (
              <button
                type="button"
                className={TOAST_PRIMARY}
                disabled={shown.busy}
                onClick={model.invoke}
              >
                {shown.action.label}
              </button>
            )}
            <button type="button" className={TOAST_GHOST} onClick={model.openDialog}>
              Details
            </button>
          </div>
        </section>
      ) : null}

      {/* A native <dialog> for the same reasons overlay-shell.tsx gives: focus
          trap, ESC, top layer and ::backdrop for free. `hidden open:flex`
          because base.css does not reset dialog. */}
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="bg-surface-raised text-ink border-line-strong shadow-overlay backdrop:bg-(--scrim) backdrop:backdrop-blur-(--blur-scrim) m-auto hidden w-(--notice-w) max-w-none flex-col rounded-lg border p-0 open:flex"
        onClose={model.closeDialog}
        onClick={(event) => {
          // Only a click on the dialog element itself is the backdrop.
          if (event.target === dialogRef.current) model.closeDialog();
        }}
      >
        <div className="flex items-start gap-3 px-5 pt-5">
          <h2 id={titleId} className="text-hi min-w-0 flex-1 text-md font-semibold tracking-tight">
            {title}
          </h2>
          <Dismiss label="Close" onDismiss={model.closeDialog} />
        </div>
        <div className="px-5 pt-2 pb-5 text-sm leading-normal">
          <p className="text-ink text-pretty">{shown.headline}</p>
          {shown.detail === null ? null : (
            <p className="text-ink-dim mt-2 text-pretty">{shown.detail}</p>
          )}
          {shown.progress === null ? null : <ProgressBar value={shown.progress} className="mt-4" />}
          {shown.version === null ? null : (
            <p className="mt-4">
              <button
                type="button"
                onClick={model.openReleasePage}
                className="text-ink-dim hover:text-hi decoration-line-strong hover:decoration-ink-faint focus-visible:outline-focus rounded-xs text-sm underline underline-offset-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                View release notes
              </button>
            </p>
          )}
        </div>
        <div className="border-line flex justify-end gap-2 border-t px-5 py-3">
          <button type="button" className={QUIET} onClick={model.closeDialog}>
            Close
          </button>
          {shown.action === null ? null : (
            <button type="button" className={PRIMARY} disabled={shown.busy} onClick={model.invoke}>
              {shown.action.label}
            </button>
          )}
        </div>
      </dialog>
    </>
  );
}
