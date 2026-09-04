import type { ReactNode } from "react";
import { PRODUCT_WORDMARK } from "../../../shared/product";
import { MarkGlyph } from "../components/glyphs";
import {
  UpdateNotice,
  UpdateStatusItem,
  useUpdateNotice,
  type UpdateNoticeModel,
} from "./update-notice";
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
          <MarkGlyph className="text-ink h-2.5 w-auto shrink-0" />
          <span className="text-ink-dim text-sm font-medium tracking-tight">
            {PRODUCT_WORDMARK}
          </span>
        </>
      )}
    </header>
  );
}

/** The update item sits with the theme switch rather than in the surface's
 *  slot: it is the shell's fact, the same on every surface, and the left slot
 *  belongs to whatever the surface is showing (update-notice.tsx). */
function StatusBar({
  update,
  children,
}: {
  update: UpdateNoticeModel;
  children?: ReactNode;
}): React.JSX.Element {
  const theme = useTheme();
  return (
    <footer className="bg-chrome border-line text-ink-dim font-data flex h-(--statusbar-h) shrink-0 items-center justify-between gap-4 border-t px-3 text-2xs">
      {/* flex-1 so a surface can push part of its status line to the right
          without leaving the status line. */}
      <div className="flex min-w-0 flex-1 items-center gap-3">{children}</div>
      <UpdateStatusItem model={update} />
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
  const update = useUpdateNotice();
  return (
    <div className="bg-surface text-ink flex h-dvh flex-col overflow-hidden">
      <TitleBar>{title}</TitleBar>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">{children}</div>
      <StatusBar update={update}>{status}</StatusBar>
      <UpdateNotice model={update} />
    </div>
  );
}
