import { afterEach, expect, it, vi } from "vitest";
import { runBoundedProbe } from "../dev/recovery/deadline";

afterEach(() => vi.useRealTimers());

const never = () => new Promise<void>(() => undefined);

it("stops provider work when admission never returns, before awaiting cleanup", async () => {
  vi.useFakeTimers();
  let stopped = false;
  let providerSteps = 0;
  const provider = setInterval(() => {
    if (!stopped) providerSteps++;
  }, 10);
  const cleanup = vi.fn(async () => {
    expect(stopped).toBe(true);
  });
  const result = runBoundedProbe(
    never,
    () => {
      stopped = true;
      clearInterval(provider);
    },
    cleanup,
    { workMs: 100, cleanupMs: 20 },
  );
  const rejected = expect(result).rejects.toThrow("work deadline");
  await vi.advanceTimersByTimeAsync(100);
  await rejected;
  const atCancellation = providerSteps;
  await vi.advanceTimersByTimeAsync(1_000);
  expect(providerSteps).toBe(atCancellation);
  expect(cleanup).toHaveBeenCalledOnce();
});

it("bounds stalled cleanup after stopping a provider, even after successful work", async () => {
  vi.useFakeTimers();
  const cancel = vi.fn();
  const result = runBoundedProbe(async () => undefined, cancel, never, {
    workMs: 100,
    cleanupMs: 20,
  });
  const rejected = expect(result).rejects.toThrow("cleanup deadline");
  await vi.advanceTimersByTimeAsync(20);
  await rejected;
  expect(cancel).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it("cancels and cleans up a failed work operation without waiting for its budget", async () => {
  vi.useFakeTimers();
  const cancel = vi.fn();
  const cleanup = vi.fn(async () => undefined);
  await expect(
    runBoundedProbe(
      async () => {
        throw new Error("start refused");
      },
      cancel,
      cleanup,
    ),
  ).rejects.toThrow("start refused");
  expect(cancel).toHaveBeenCalledOnce();
  expect(cleanup).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
