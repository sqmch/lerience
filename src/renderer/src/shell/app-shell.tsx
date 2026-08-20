import { useEffect, useState, type ReactNode } from "react";
import { PRODUCT_NAME, PRODUCT_WORDMARK } from "../../../shared/product";
import type { UpdateStatus } from "../../../shared/update";
import { useTheme } from "./use-theme";

/** A half-filled disc: the conventional "appearance" mark, and simple enough
 *  to be geometry rather than an illustration. */
function ThemeMark(): React.JSX.Element {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
      <circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" strokeWidth="1" />
      <path d="M6 1a5 5 0 000 10z" fill="currentColor" />
    </svg>
  );
}

/** The window frame the app draws for itself (ADR-016). Native caption controls
 *  are not here. Chromium reports their actual available titlebar rectangle;
 *  the inset tokens keep content clear of Windows controls at the end and Mac
 *  traffic lights at the start without making either platform imitate the other.
 *
 *  A surface that passes `children` replaces the whole row, mark included: the
 *  course view leads with a back control, and a decorative mark in front of a
 *  navigation affordance reads as a logo you can click. */
function TitleBar({ children }: { children?: ReactNode }): React.JSX.Element {
  return (
    <header className="drag-region bg-chrome border-line flex h-(--titlebar-h) shrink-0 items-center gap-2 overflow-hidden border-b pl-(--titlebar-inset-start) pr-(--titlebar-inset-end)">
      {children ?? (
        <>
          <span
            className="border-ink-faint size-2.5 shrink-0 rounded-xs border-(length:--stroke)"
            aria-hidden="true"
          />
          <span className="text-ink-dim text-sm font-medium tracking-tight">
            {PRODUCT_WORDMARK}
          </span>
        </>
      )}
    </header>
  );
}

function StatusBar({ children }: { children?: ReactNode }): React.JSX.Element {
  const theme = useTheme();
  return (
    <footer className="bg-chrome border-line text-ink-dim font-data flex h-(--statusbar-h) shrink-0 items-center justify-between gap-4 border-t px-3 text-2xs">
      {/* flex-1 so a surface can push part of its status line to the right
          without leaving the status line. */}
      <div className="flex min-w-0 flex-1 items-center gap-3">{children}</div>
      <button
        type="button"
        onClick={theme.cycle}
        title="Appearance: follow the system, or force light or dark"
        className="hover:bg-accent-wash hover:text-hi focus-visible:outline-focus flex items-center gap-1.5 rounded-pill px-2 py-0.5 transition-colors focus-visible:outline-2"
      >
        <ThemeMark />
        <span>{theme.preference}</span>
      </button>
    </footer>
  );
}

function UpdateBanner(): React.JSX.Element | null {
  const [status, setStatus] = useState<UpdateStatus | null>(null);

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

  if (
    status === null ||
    status.phase === "unavailable" ||
    status.phase === "checking" ||
    status.phase === "current"
  ) {
    return null;
  }

  const invoke = (): void => {
    const api = window.praxeum;
    let operation: Promise<UpdateStatus>;
    let failureOperation: "check" | "download" | "handoff";
    if (status.phase === "available") {
      operation = api.downloadUpdate();
      failureOperation = "download";
    } else if (status.phase === "ready") {
      operation = api.handoffUpdate();
      failureOperation = "handoff";
    } else if (status.phase === "error" && status.operation === "download") {
      operation = api.downloadUpdate();
      failureOperation = "download";
    } else if (status.phase === "error" && status.operation === "handoff") {
      operation = api.handoffUpdate();
      failureOperation = "handoff";
    } else if (status.phase === "error" && status.operation === "check") {
      operation = api.checkForUpdate();
      failureOperation = "check";
    } else return;
    void operation.then(setStatus).catch(() => {
      setStatus({
        phase: "error",
        operation: failureOperation,
        detail: "The update action could not be completed. Your current app is unchanged.",
      });
    });
  };

  const busy = status.phase === "downloading" || status.phase === "preparing";
  const action =
    status.phase === "available"
      ? "Download update"
      : status.phase === "ready"
        ? status.action === "install-restart"
          ? "Restart to update"
          : "Open downloaded package"
        : status.phase === "error"
          ? "Try again"
          : null;
  const copy =
    status.phase === "available"
      ? `${PRODUCT_NAME} ${status.version} is available.`
      : status.phase === "downloading"
        ? `Downloading ${PRODUCT_NAME} ${status.version} — ${Math.floor((status.receivedBytes / status.totalBytes) * 100)}%`
        : status.phase === "ready"
          ? `${PRODUCT_NAME} ${status.version} is downloaded and verified.`
          : status.phase === "preparing"
            ? "Waiting for the current tutor turn to finish…"
            : status.detail;

  return (
    <section
      aria-live="polite"
      className="bg-accent-wash border-line text-ink flex shrink-0 items-center gap-3 border-b px-3 py-2 text-xs"
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium">{copy}</p>
        {"releaseNotes" in status && status.releaseNotes !== "" ? (
          <details className="text-ink-dim mt-0.5">
            <summary className="hover:text-ink cursor-pointer select-none">What changed</summary>
            <p className="mt-1 max-h-20 max-w-3xl overflow-auto whitespace-pre-wrap">
              {status.releaseNotes}
            </p>
          </details>
        ) : null}
      </div>
      {action === null ? null : (
        <button
          type="button"
          onClick={invoke}
          disabled={busy}
          className="border-line bg-surface hover:border-ink-faint hover:text-hi focus-visible:outline-focus shrink-0 rounded-pill border px-3 py-1 font-medium transition-colors focus-visible:outline-2 disabled:cursor-wait disabled:opacity-60"
        >
          {action}
        </button>
      )}
    </section>
  );
}

/** Every surface renders inside this: one frame, one status line, and the
 *  workspace between them. */
export function AppShell({
  title,
  status,
  children,
}: {
  title?: ReactNode;
  status?: ReactNode;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div className="bg-surface text-ink flex h-dvh flex-col overflow-hidden">
      <TitleBar>{title}</TitleBar>
      <UpdateBanner />
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">{children}</div>
      <StatusBar>{status}</StatusBar>
    </div>
  );
}
