/* ── lab UI pieces, ported from the learning-harness engine ────────────────
   The four stock labs reach into the study's shared UI for exactly two things:
   `Icon` (study/src/ui/icons.tsx — the chunking lab's "fact held whole" check)
   and `Tooltip` (study/src/ui/Tooltip.tsx — the precision/recall rows). Only
   those two pieces are ported here, with the same markup contract (classes,
   props, aria behavior) so the labs render unchanged.

   Deviations from the study, both forced by the no-new-dependencies rule:
   - Icon wrapped a curated lucide-react set. This app doesn't ship lucide, so
     the one glyph the labs use (`check`) is inlined with lucide's own geometry
     (24-unit viewBox, path "M20 6 9 17l-5-5", round caps/joins). Because the
     study's ui.css (.icon-{size}) isn't ported either, the size map is carried
     as width/height attributes — CSS can still override them.
   - Tooltip wrapped @radix-ui/react-tooltip. This is a small React-only stand-in
     that keeps the study's contract: 400ms hover delay, instant on focus,
     Escape dismisses, side/align/sideOffset(6)/collisionPadding(8) semantics,
     the `tip` / `tip-wide` / `tip-arrow` class names, and flip-when-cramped
     near a window edge. The disabled-control re-hosting (`tipTrigger`) is not
     ported — no lab tooltips a disabled control. */

import { cloneElement, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { createPortal } from "react-dom";

/* ── icons ─────────────────────────────────────────────────────────────────
   Same registry-as-the-only-door shape as the study; add a name here rather
   than reaching past it. Paths are lucide geometry on a 24-unit viewBox. */

const REGISTRY = {
  check: "M20 6 9 17l-5-5", // pass, complete (lucide Check)
} as const;

export type IconName = keyof typeof REGISTRY;
export type IconSize = "xs" | "sm" | "md" | "lg";

/** Rendered box per size — the study's ui.css .icon-{size} steps. */
const PX: Record<IconSize, number> = { xs: 12, sm: 14, md: 16, lg: 20 };

/* Optical compensation. lucide draws on a 24-unit viewBox, so a fixed
   strokeWidth thins as the icon shrinks and thickens as it grows. These pairs
   hold the RENDERED stroke at ~1.33px at every step — the same weight as the
   hairline stroke — so icons sit level with the rules and borders around them
   instead of reading lighter at 12px and heavier at 20px. */
const STROKE: Record<IconSize, number> = {
  xs: 2.6, // 12px → 1.30px
  sm: 2.3, // 14px → 1.34px
  md: 2.0, // 16px → 1.33px
  lg: 1.7, // 20px → 1.42px
};

export function Icon(props: {
  name: IconName;
  size?: IconSize;
  /** Fills the glyph as well as stroking it. */
  filled?: boolean;
  /** Give a label ONLY when the icon stands alone as the whole control. Beside
   *  a text label it is decorative and must stay hidden from screen readers,
   *  or it reads the meaning out twice. */
  label?: string;
  className?: string;
}) {
  const { name, size = "sm", filled, label, className } = props;
  return (
    <svg
      className={["icon", `icon-${size}`, className].filter(Boolean).join(" ")}
      viewBox="0 0 24 24"
      width={PX[size]}
      height={PX[size]}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={STROKE[size]}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <path d={REGISTRY[name]} />
    </svg>
  );
}

/* ── tooltips ──────────────────────────────────────────────────────────────
   Rules of use (unchanged from the study):
   - A tooltip EXPLAINS; it never carries the only copy of something essential.
   - Keep `title` on nothing — a native title would render over this. */

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
  const points =
    side === "bottom"
      ? "0,5 10,5 5,0" // pointing up, at the anchor
      : side === "top"
        ? "0,0 10,0 5,5"
        : side === "right"
          ? "5,0 5,10 0,5"
          : "0,0 0,10 5,5";
  return (
    <svg
      className="tip-arrow"
      width={vertical ? ARROW_LONG : ARROW_SHORT}
      height={vertical ? ARROW_SHORT : ARROW_LONG}
      viewBox={vertical ? "0 0 10 5" : "0 0 5 10"}
      style={style}
      aria-hidden="true"
    >
      <polygon points={points} />
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

  const style: CSSProperties = layout
    ? { position: "fixed", left: layout.left, top: layout.top }
    : { position: "fixed", left: -9999, top: -9999, visibility: "hidden" };

  return createPortal(
    <div ref={ref} role="tooltip" className={wide ? "tip tip-wide" : "tip"} style={style}>
      {content}
      {layout && <TipArrow side={layout.side} at={layout.arrow} />}
    </div>,
    document.body,
  );
}

export function Tooltip(props: { content: ReactNode; children: ReactElement } & TipPlacement) {
  const { content, children, side = "bottom", align = "center", wide } = props;
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

  const show = (delay: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setOpen(false);
  };

  /* The trigger IS the child (Radix's asChild): handlers and a ref are grafted
     on so no wrapper element disturbs the labs' layout. 400ms is long enough
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
