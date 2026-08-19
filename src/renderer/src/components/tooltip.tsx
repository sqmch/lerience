/* The app's one tooltip.
 *
 * It began as the labs' port of the study's Radix-backed tooltip, which kept
 * that component's behaviour (400ms on hover, instant on focus, Escape
 * dismisses, flip when cramped) but referred to `.tip` / `.tip-arrow` classes
 * that were never ported with it — so it rendered as unstyled text under the
 * lab overlay. Moving it here fixes that in the only durable way: one surface,
 * drawn from the Lens tokens like every other layer, used by both callers.
 *
 * Rules of use, unchanged from the study:
 * - A tooltip EXPLAINS; it never carries the only copy of something essential.
 * - Keep `title` off anything wrapped in one — a native title renders over it.
 *
 * The second rule is what makes `whenClipped` safe. A tip that repeats text
 * the trigger already contains is not hiding anything: the full string is in
 * the DOM, so assistive tech reads it whole whatever the visual clip does. The
 * tip is a way for a SIGHTED reader to reach the same text without the column
 * having to grow to hold it.
 */

import { cloneElement, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { createPortal } from "react-dom";

export type TipPlacement = {
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  /** Widen past the default measure for tips that run to a sentence or two. */
  wide?: boolean;
};

type Side = NonNullable<TipPlacement["side"]>;
type Align = NonNullable<TipPlacement["align"]>;

const SIDE_OFFSET = 6;
const COLLISION_PADDING = 8;
const ARROW_LONG = 10;
const ARROW_SHORT = 5;

/* Above the lab overlay's 200, since a lab row is one of the two things that
   tooltips. Inline rather than a utility because the surface already carries
   inline position values from the measure pass — one style object, one place
   to read the whole stacking answer. */
const TIP_Z = 300;

/** The tip's own ground. Same panel, border and elevation as the menu — a
 *  second floating layer with a second look is how a palette drifts. */
const TIP_SURFACE =
  "bg-surface-panel border-line shadow-popover text-ink pointer-events-none rounded-md " +
  "border px-2.5 py-1.5 text-xs leading-snug text-pretty";

type Layout = {
  left: number;
  top: number;
  /** The side actually used after collision flipping. */
  side: Side;
  /** Arrow offset along the tip's near edge, toward the anchor's centre. */
  arrow: number;
};

function place(side: Side, align: Align, a: DOMRect, t: DOMRect): { left: number; top: number } {
  const alongX =
    align === "start"
      ? a.left
      : align === "end"
        ? a.right - t.width
        : a.left + a.width / 2 - t.width / 2;
  const alongY =
    align === "start"
      ? a.top
      : align === "end"
        ? a.bottom - t.height
        : a.top + a.height / 2 - t.height / 2;
  switch (side) {
    case "top":
      return { left: alongX, top: a.top - SIDE_OFFSET - t.height };
    case "bottom":
      return { left: alongX, top: a.bottom + SIDE_OFFSET };
    case "left":
      return { left: a.left - SIDE_OFFSET - t.width, top: alongY };
    case "right":
      return { left: a.right + SIDE_OFFSET, top: alongY };
  }
}

const FLIP: Record<Side, Side> = { top: "bottom", bottom: "top", left: "right", right: "left" };

/* The arrow is drawn as an OPEN path so that fill and stroke can disagree: the
   fill closes the triangle and covers the panel's own 1px border where the two
   meet, while the stroke draws only the two slanted edges. A closed polygon
   would stroke the base as well, printing a hairline across the joint. */
function TipArrow(props: { side: Side; at: number }) {
  const { side, at } = props;
  const vertical = side === "top" || side === "bottom";
  const style: CSSProperties = vertical
    ? side === "bottom"
      ? { position: "absolute", top: -ARROW_SHORT, left: at }
      : { position: "absolute", bottom: -ARROW_SHORT, left: at }
    : side === "right"
      ? { position: "absolute", left: -ARROW_SHORT, top: at }
      : { position: "absolute", right: -ARROW_SHORT, top: at };
  const d =
    side === "bottom"
      ? "M0,5 L5,0 L10,5" // pointing up, at the anchor
      : side === "top"
        ? "M0,0 L5,5 L10,0"
        : side === "right"
          ? "M5,0 L0,5 L5,10"
          : "M0,0 L5,5 L0,10";
  return (
    <svg
      className="fill-surface-panel stroke-line"
      width={vertical ? ARROW_LONG : ARROW_SHORT}
      height={vertical ? ARROW_SHORT : ARROW_LONG}
      viewBox={vertical ? "0 0 10 5" : "0 0 5 10"}
      style={style}
      aria-hidden="true"
    >
      <path d={d} strokeWidth="1" />
    </svg>
  );
}

/** The portalled surface itself: measured, placed beside the anchor, flipped
 *  when the preferred side is cramped, clamped to the window with padding. */
function TipSurface(props: {
  content: ReactNode;
  anchor: HTMLElement;
  side: Side;
  align: Align;
  wide?: boolean;
}) {
  const { content, anchor, side, align, wide } = props;
  const ref = useRef<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const a = anchor.getBoundingClientRect();
    const t = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const fits = (s: Side): boolean => {
      const p = place(s, align, a, t);
      if (s === "top" || s === "bottom")
        return p.top >= COLLISION_PADDING && p.top + t.height <= vh - COLLISION_PADDING;
      return p.left >= COLLISION_PADDING && p.left + t.width <= vw - COLLISION_PADDING;
    };
    const used = fits(side) || !fits(FLIP[side]) ? side : FLIP[side];

    const p = place(used, align, a, t);
    const left = Math.min(Math.max(p.left, COLLISION_PADDING), vw - t.width - COLLISION_PADDING);
    const top = Math.min(Math.max(p.top, COLLISION_PADDING), vh - t.height - COLLISION_PADDING);
    const arrow =
      used === "top" || used === "bottom"
        ? a.left + a.width / 2 - left - ARROW_LONG / 2
        : a.top + a.height / 2 - top - ARROW_LONG / 2;
    setLayout({ left, top, side: used, arrow });
  }, [anchor, side, align, content]);

  /* Measured off-screen first, then placed. Painting at the fallback position
     for one frame is the flicker every hand-rolled tooltip starts with. */
  const style: CSSProperties = layout
    ? { position: "fixed", left: layout.left, top: layout.top, zIndex: TIP_Z }
    : { position: "fixed", left: -9999, top: -9999, visibility: "hidden", zIndex: TIP_Z };

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      className={`${TIP_SURFACE} ${wide ? "max-w-(--tip-w-max-wide)" : "max-w-(--tip-w-max)"}`}
      style={style}
    >
      {content}
      {layout && <TipArrow side={layout.side} at={layout.arrow} />}
    </div>,
    document.body,
  );
}

/**
 * True when anything inside `root` is being cut off.
 *
 * Elements marked `data-clip` are the ones asked about; without any, the root
 * itself is. Both axes are tested because the two ways this app clips text are
 * different: `truncate` overflows horizontally, `line-clamp-2` vertically. The
 * 1px slack absorbs sub-pixel layout, which otherwise reports every second
 * element as clipped by a fraction nobody can see.
 */
function isClipped(root: HTMLElement): boolean {
  const marked = root.querySelectorAll<HTMLElement>("[data-clip]");
  const nodes = marked.length > 0 ? Array.from(marked) : [root];
  return nodes.some(
    (n) => n.scrollWidth > n.clientWidth + 1 || n.scrollHeight > n.clientHeight + 1,
  );
}

export function Tooltip(
  props: {
    content: ReactNode;
    children: ReactElement;
    /** Show only while the trigger is actually cutting text off — for tips
     *  that exist to recover a clipped string rather than to explain. */
    whenClipped?: boolean;
  } & TipPlacement,
) {
  const { content, children, side = "bottom", align = "center", wide, whenClipped } = props;
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const timer = useRef(0);

  // Escape dismisses, as Radix did, wherever focus sits.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  if (!content) return children;

  /* Clipping is asked at OPEN time, never cached: the seam moves, and a tip
     that answered for last week's rail width would be wrong on both sides. */
  const show = (delay: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (whenClipped && (anchor === null || !isClipped(anchor))) return;
      setOpen(true);
    }, delay);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setOpen(false);
  };

  /* The trigger IS the child (Radix's asChild): handlers and a ref are grafted
     on so no wrapper element disturbs the caller's layout. 400ms is long enough
     not to flicker on a pass-by and short enough to feel answerable. */
  const trigger = cloneElement(children as ReactElement<Record<string, unknown>>, {
    ref: setAnchor,
    onPointerEnter: () => show(400),
    onPointerLeave: hide,
    onPointerDown: hide,
    onFocus: () => show(0),
    onBlur: hide,
  });

  return (
    <>
      {trigger}
      {open && anchor && (
        <TipSurface content={content} anchor={anchor} side={side} align={align} wide={wide} />
      )}
    </>
  );
}
