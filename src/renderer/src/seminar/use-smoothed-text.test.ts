import { describe, expect, it } from "vitest";
import { advanceLength } from "./use-smoothed-text";

describe("advanceLength", () => {
  it("never overruns the target", () => {
    expect(advanceLength(90, 100, 10_000)).toBe(100);
    expect(advanceLength(100, 100, 16)).toBe(100);
  });

  it("always advances at least one character", () => {
    expect(advanceLength(0, 500, 0)).toBe(1);
    expect(advanceLength(0, 500, 0.01)).toBe(1);
  });

  it("holds the floor rate on a small backlog", () => {
    expect(advanceLength(0, 40, 16)).toBe(4);
  });

  it("speeds up as the backlog grows", () => {
    expect(advanceLength(0, 100_000, 16)).toBeGreaterThan(advanceLength(0, 100, 16));
  });

  it("drains a realistic burst without an instant dump or a crawl", () => {
    let shown = 0;
    let frames = 0;
    while (shown < 1200 && frames < 600) {
      shown = advanceLength(shown, 1200, 16);
      frames += 1;
    }
    expect(shown).toBe(1200);
    expect(frames).toBeGreaterThan(30);
    expect(frames).toBeLessThan(120);
  });

  it("treats a negative frame delta as zero", () => {
    expect(advanceLength(50, 100, -500)).toBeGreaterThanOrEqual(51);
  });
});
