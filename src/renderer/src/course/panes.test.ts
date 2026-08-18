import { describe, expect, it } from "vitest";
import { defaultPanes, fitPanes, type PaneMeasures } from "./panes";

/* The workspace's seams (ADR-019). What is worth mechanizing here is not the
   arithmetic but the INVARIANT: a drag and an arrow key both go through
   fitPanes, so anything it refuses is unreachable by either. The failure this
   guards against is the previous project's — a keyboard resize parking a pane
   at a width no drag could reach, because the two clamped independently. */

/** The real token values, as tokens.css defines them. */
const MEASURES: PaneMeasures = {
  railMin: 240,
  railMax: 420,
  railDefault: 288,
  talkMin: 360,
  talkMax: 720,
  talkDefault: 480,
  pageMin: 420,
  seam: 9,
};

/** Room for every floor plus slack — nothing is under pressure here. */
const ROOMY = 1600;

describe("fitPanes", () => {
  it("leaves widths alone when they fit", () => {
    expect(fitPanes({ rail: 300, talk: 500 }, MEASURES, ROOMY)).toEqual({ rail: 300, talk: 500 });
  });

  it("clamps each pane to its own range", () => {
    expect(fitPanes({ rail: 10, talk: 10 }, MEASURES, ROOMY)).toEqual({ rail: 240, talk: 360 });
    expect(fitPanes({ rail: 9999, talk: 9999 }, MEASURES, 4000)).toEqual({ rail: 420, talk: 720 });
  });

  it("keeps the reading pane at its floor by taking from the seminar first", () => {
    // 1200 - 18 seams - 420 page = 762 for two panes that want 288 + 480 = 768.
    const fitted = fitPanes({ rail: 288, talk: 480 }, MEASURES, 1200);
    expect(fitted.rail).toBe(288);
    expect(fitted.talk).toBe(474);
    expect(1200 - MEASURES.seam * 2 - fitted.rail - fitted.talk).toBe(MEASURES.pageMin);
  });

  it("only takes from the rail once the seminar has given everything", () => {
    // 1128 - 18 seams - 420 page = 690 for two panes that want 360 + 480 = 840.
    // The seminar gives its full 120 first and stops at its floor; the last 30
    // comes off the rail, which still has room above its own.
    const fitted = fitPanes({ rail: 360, talk: 480 }, MEASURES, 1128);
    expect(fitted).toEqual({ rail: 330, talk: MEASURES.talkMin });
  });

  it("never pushes a pane under its own floor, even when nothing can fit", () => {
    // The window's own minimum (960) cannot satisfy all three floors at once:
    // 240 + 360 + 420 + 18 = 1038. The reading floor yields, the panes do not.
    const fitted = fitPanes({ rail: 288, talk: 480 }, MEASURES, 960);
    expect(fitted).toEqual({ rail: MEASURES.railMin, talk: MEASURES.talkMin });
  });

  it("is idempotent, so re-fitting on every window resize cannot ratchet", () => {
    const once = fitPanes({ rail: 288, talk: 480 }, MEASURES, 1100);
    expect(fitPanes(once, MEASURES, 1100)).toEqual(once);
  });

  it("ignores a container it has not measured yet", () => {
    // The first render happens before the ResizeObserver has reported, and a
    // zero width there must not collapse both panes to their minimums.
    expect(fitPanes({ rail: 288, talk: 480 }, MEASURES, 0)).toEqual({ rail: 288, talk: 480 });
  });

  it("hands back the token defaults for a learner who has never dragged", () => {
    expect(defaultPanes(MEASURES)).toEqual({ rail: 288, talk: 480 });
  });
});
