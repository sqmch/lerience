import { describe, expect, it } from "vitest";
import { claudeContextUsage, codexContextUsage } from "../src/main/agent/context-usage";

describe("context samples", () => {
  it("uses the current Claude estimate and raw provider window, not category/cache sums", () => {
    expect(
      claudeContextUsage({
        totalTokens: 210000,
        rawMaxTokens: 200000,
        maxTokens: 210000,
        categories: [{ tokens: 900000, isDeferred: true }],
      }),
    ).toEqual({
      usedTokens: 210000,
      capacityTokens: 200000,
      source: "current-context",
    });
  });
  it("uses only Codex last.totalTokens, without adding cache or reasoning subsets", () => {
    expect(
      codexContextUsage({
        total: { totalTokens: 9999999 },
        modelContextWindow: 200000,
        last: {
          totalTokens: 12400,
          inputTokens: 12000,
          cachedInputTokens: 11000,
          outputTokens: 400,
          reasoningOutputTokens: 300,
        },
      }),
    ).toEqual({
      usedTokens: 12400,
      capacityTokens: 200000,
      source: "last-request",
    });
  });
  it.each([
    undefined,
    null,
    {},
    { totalTokens: -1, rawMaxTokens: 100 },
    { totalTokens: 10, rawMaxTokens: 0 },
    { totalTokens: 10, rawMaxTokens: null },
    { totalTokens: NaN, rawMaxTokens: 100 },
    { totalTokens: 1.5, rawMaxTokens: 100 },
  ])("hides absent or malformed telemetry %j", (value) =>
    expect(claudeContextUsage(value)).toBeNull(),
  );
  it("never carries an old capacity into a missing Codex capacity", () => {
    expect(codexContextUsage({ last: { totalTokens: 4000 }, modelContextWindow: null })).toBeNull();
  });
});
