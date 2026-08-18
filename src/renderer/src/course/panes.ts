/* The workspace's column arithmetic (ADR-019).
 *
 * Kept separate from the components, and pure, for one reason: a drag and a
 * keyboard press must land a pane in exactly the same place. When the two
 * clamp independently — as they did in the previous project — a keyboard
 * resize can park a pane at a width no drag can reach, and nobody notices
 * until someone tries to drag it back.
 *
 * The measures are READ from the design layer rather than restated here.
 * tokens.css says why: "they live here so the resize logic in TS and the paint
 * in CSS read the SAME numbers". */

export interface PaneMeasures {
  railMin: number;
  railMax: number;
  railDefault: number;
  talkMin: number;
  talkMax: number;
  talkDefault: number;
  /** The reading pane's target floor — honoured whenever the window has the
   *  room, and yielded when it does not (see `fitPanes`). */
  pageMin: number;
  /** One seam's hit area; there are two. */
  seam: number;
}

export interface PaneWidths {
  rail: number;
  talk: number;
}

/** Which pane a seam sizes, and which way dragging it grows that pane. */
export type PaneId = "rail" | "talk";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * The desired widths, made to fit.
 *
 * Each pane is first clamped to its own range. Then, if the two together would
 * push the reading pane under its floor, **the seminar yields first**: it has
 * the smallest usable width of the three, so taking room from it costs the
 * least. Only when it has given everything does the rail start giving.
 *
 * At the window's own minimum size the three floors genuinely cannot all be
 * met (240 + 360 + 420 + two seams exceeds 960). That is why the reading floor
 * is a target and not a hard minimum on the grid track: a track that cannot be
 * satisfied overflows the window, and a horizontal scrollbar across a study
 * surface is a worse answer than a narrower page.
 */
export function fitPanes(
  desired: PaneWidths,
  measures: PaneMeasures,
  containerWidth: number,
): PaneWidths {
  let rail = clamp(desired.rail, measures.railMin, measures.railMax);
  let talk = clamp(desired.talk, measures.talkMin, measures.talkMax);
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return { rail, talk };

  const room = containerWidth - measures.seam * 2 - measures.pageMin;
  const over = rail + talk - room;
  if (over <= 0) return { rail, talk };

  const fromTalk = Math.min(over, talk - measures.talkMin);
  talk -= fromTalk;
  rail -= Math.min(over - fromTalk, rail - measures.railMin);
  return { rail, talk };
}

/** The widths a course opens with when the learner has never moved a seam. */
export function defaultPanes(measures: PaneMeasures): PaneWidths {
  return { rail: measures.railDefault, talk: measures.talkDefault };
}

/** How far one arrow-key press moves a seam. Shift multiplies it — the same
 *  coarse/fine pair every resize control in every OS offers. */
export const PANE_STEP = 16;
export const PANE_STEP_COARSE = 64;

const NUMERIC = (root: Element, name: string): number => {
  const raw = getComputedStyle(root).getPropertyValue(name);
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : 0;
};

/** The component measures, off the running document. Called on mount and never
 *  cached across themes, because none of these switch with the theme. */
export function readPaneMeasures(root: Element = document.documentElement): PaneMeasures {
  return {
    railMin: NUMERIC(root, "--rail-w-min"),
    railMax: NUMERIC(root, "--rail-w-max"),
    railDefault: NUMERIC(root, "--rail-w"),
    talkMin: NUMERIC(root, "--talk-w-min"),
    talkMax: NUMERIC(root, "--talk-w-max"),
    talkDefault: NUMERIC(root, "--talk-w"),
    pageMin: NUMERIC(root, "--page-w-min"),
    seam: NUMERIC(root, "--seam-w"),
  };
}
