import type { ContextUsage } from "../../shared/seminar";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sample(
  used: unknown,
  capacity: unknown,
  source: ContextUsage["source"],
): ContextUsage | null {
  if (
    typeof used !== "number" ||
    !Number.isSafeInteger(used) ||
    used < 0 ||
    typeof capacity !== "number" ||
    !Number.isSafeInteger(capacity) ||
    capacity <= 0
  )
    return null;
  // Do not clamp over-window reports or retain a previous model's capacity.
  return { usedTokens: used, capacityTokens: capacity, source };
}

export function claudeContextUsage(value: unknown): ContextUsage | null {
  if (!record(value)) return null;
  // Provider estimate includes the current conversation. rawMaxTokens is the
  // provider-resolved window, which can be smaller than the model's hard limit.
  return sample(value.totalTokens, value.rawMaxTokens, "current-context");
}

export function codexContextUsage(value: unknown): ContextUsage | null {
  if (!record(value) || !record(value.last)) return null;
  // `total` is cumulative. Cached input and reasoning output are already
  // included in `last.totalTokens`; adding either would double-count them.
  return sample(value.last.totalTokens, value.modelContextWindow, "last-request");
}
