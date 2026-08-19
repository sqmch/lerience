import type { TitleBarOverlayColors } from "../shared/ipc";

/** The bar's height must match the renderer's own title bar exactly, or the
 * OS-drawn caption buttons sit off the row we drew. It is the one measure the
 * two processes have to agree on, and it is duplicated here rather than read
 * from the design layer because the OS needs it before any renderer exists —
 * `tests/window-frame.test.ts` fails if it drifts from `--titlebar-h`. */
export const TITLE_BAR_HEIGHT = 38;

declare const __PRAXEUM_FRAME_COLORS__:
  { dark: TitleBarOverlayColors; light: TitleBarOverlayColors } | undefined;

/** Replaced by electron-vite at build time with the resolved `--chrome` and
 * `--ink-dim` tokens (see `build/frame-colors.ts`). The renderer remains the
 * authority once it has painted; this only covers the frame the OS draws
 * BEFORE any renderer exists — the packaged runtime check, which is on screen
 * for seconds, and the first frames of every launch. Source execution and unit
 * tests compile no colours and get the OS default frame, which is the honest
 * answer when there is no design layer to read. */
export function compiledFrameColors(dark: boolean): TitleBarOverlayColors | null {
  if (typeof __PRAXEUM_FRAME_COLORS__ === "undefined") return null;
  return dark ? __PRAXEUM_FRAME_COLORS__.dark : __PRAXEUM_FRAME_COLORS__.light;
}
