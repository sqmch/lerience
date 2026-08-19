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
   - Tooltip wrapped @radix-ui/react-tooltip. The React-only stand-in that
     replaced it now lives in components/tooltip.tsx as the app's one tooltip
     and is re-exported at the foot of this file. */

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
   Re-exported, not re-implemented. The port that used to live here carried the
   study's behaviour but not its stylesheet, so a lab tip drew as unstyled text
   underneath the overlay. The app now has one tooltip in components/, drawn
   from the Lens tokens; the labs use that. The re-export stays so a lab keeps
   importing its UI from one place. */

export { Tooltip } from "../components/tooltip";
export type { TipPlacement } from "../components/tooltip";
