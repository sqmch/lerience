/* The rail's one piece of arithmetic. `estimatedHours` is a manifest number a
   tutor writes freely, and the rail used to print it raw — "0.75h", which is a
   unit nobody plans in. */

import { describe, expect, it } from "vitest";

import { moduleLength } from "./rail";

describe("moduleLength", () => {
  it("prints under an hour in minutes", () => {
    expect(moduleLength(0.5)).toBe("30 min");
    expect(moduleLength(0.75)).toBe("45 min");
    expect(moduleLength(0.25)).toBe("15 min");
  });

  it("prints whole hours as hours, and the rest with minutes", () => {
    expect(moduleLength(1)).toBe("1h");
    expect(moduleLength(2)).toBe("2h");
    expect(moduleLength(1.5)).toBe("1h 30m");
    expect(moduleLength(2.5)).toBe("2h 30m");
  });

  /* A tutor's estimate is not a measurement, so an odd fraction rounds to the
     minute rather than reaching for seconds. */
  it("rounds to the minute", () => {
    expect(moduleLength(1 / 3)).toBe("20 min");
    expect(moduleLength(0.51)).toBe("31 min");
  });

  /* Absent, zero, or nonsense means the rail draws no length line at all
     rather than "0 min", which reads as a module with no work in it. */
  it("has nothing to say about zero or nonsense", () => {
    expect(moduleLength(0)).toBeNull();
    expect(moduleLength(-1)).toBeNull();
    expect(moduleLength(Number.NaN)).toBeNull();
    expect(moduleLength(Number.POSITIVE_INFINITY)).toBeNull();
  });

  /* Rounds UP to a minute rather than disappearing: a module the tutor sized
     at a couple of minutes still has a length. */
  it("keeps a very short module visible", () => {
    expect(moduleLength(0.001)).toBe("1 min");
  });
});
