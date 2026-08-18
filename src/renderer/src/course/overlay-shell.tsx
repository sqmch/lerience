/* The course-scoped overlay chassis, on a native <dialog>.
 *
 * The element gives us the focus trap, ESC, top-layer stacking and ::backdrop
 * for free — everything the vendored Dialog supplied in the previous project.
 * Radix's Dialog would be parity, not progress (ADR-019), so this stays.
 *
 * Two UA behaviours have to be answered explicitly because we skip Tailwind's
 * preflight and base.css deliberately does not reset `dialog`: its default
 * border/padding/canvas fill, and the fact that any `display` utility we set
 * would otherwise override the closed element's `display: none`. Hence
 * `hidden open:flex`. */

import { useEffect, useRef, type ReactNode } from "react";

export function OverlayShell({
  open,
  onOpenChange,
  title,
  srDescription,
  size = "stage",
  actions,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  srDescription: string;
  /** What the overlay holds. A stage takes the monitor; a document takes a
   *  page's width, because a reading column centred in a very wide layer reads
   *  as a mistake rather than as a page (ADR-019). */
  size?: "stage" | "reading";
  /** Controls that belong to the overlay as a whole — a visual switcher, a set
   *  of section tabs. Laid out between the title and the close control. */
  actions?: ReactNode;
  children: ReactNode;
}): React.JSX.Element {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      /* SEPARATION, three ways, because one was not enough: the overlay sits a
         step above the workspace in value (--bg-raised, not --bg, which is the
         ground it floats over), carries a real hairline so its edge is drawn
         rather than implied, and dims AND blurs what is behind it. The first
         cut had a dark panel on a dark ground behind a 50% scrim, so the
         overlay edge was not perceptible. */
      className={
        size === "stage"
          ? "bg-surface-raised text-ink border-line-strong shadow-overlay backdrop:bg-(--scrim) backdrop:backdrop-blur-(--blur-scrim) m-auto hidden h-(--overlay-h) max-h-none w-(--overlay-w) max-w-none flex-col overflow-hidden rounded-lg border p-0 open:flex"
          : "bg-surface-raised text-ink border-line-strong shadow-overlay backdrop:bg-(--scrim) backdrop:backdrop-blur-(--blur-scrim) m-auto hidden h-(--overlay-h) max-h-none w-(--overlay-w-read) max-w-none flex-col overflow-hidden rounded-lg border p-0 open:flex"
      }
      onClose={() => {
        onOpenChange(false);
      }}
      onClick={(event) => {
        // Only a click on the dialog element itself is the backdrop.
        if (event.target === ref.current) onOpenChange(false);
      }}
    >
      <div className="border-line flex h-(--overlay-head-h) shrink-0 items-center gap-3.5 border-b pr-4 pl-5">
        {/* The overlay names itself QUIETLY. It was set as a headline, which
            put it in direct competition with the section tabs beside it — two
            things at similar weight on one row, neither clearly the label nor
            the navigation. The content
            below carries the real heading. */}
        <h2 className="text-ink-dim shrink-0 text-xs font-medium tracking-tight">{title}</h2>
        <p className="sr-only">{srDescription}</p>
        {actions === undefined ? null : (
          <>
            <span className="bg-line h-4 w-(--stroke-hair) shrink-0" aria-hidden="true" />
            {/* Stretched to the head's full height so a full-height control —
                a tab with a rule under it — can sit on the head's own edge. */}
            <div className="flex min-w-0 flex-1 items-stretch gap-2 self-stretch">{actions}</div>
          </>
        )}
        <button
          type="button"
          aria-label="Close"
          className="text-ink-dim hover:bg-surface-raised hover:text-hi focus-visible:outline-focus ml-auto grid size-7 shrink-0 place-items-center rounded-pill transition-colors focus-visible:outline-2"
          onClick={() => {
            onOpenChange(false);
          }}
        >
          <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
            <path
              d="M1.5 1.5 L9.5 9.5 M9.5 1.5 L1.5 9.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </dialog>
  );
}
