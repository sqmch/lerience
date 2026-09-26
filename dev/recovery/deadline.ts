async function within<T>(
  work: () => Promise<T>,
  milliseconds: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(work),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Probe-only budget around admission, provider work and record capture. Always
 * stop the retained provider handles BEFORE waiting for conductor cleanup. */
export async function runBoundedProbe(
  work: () => Promise<void>,
  cancel: () => void,
  cleanup: () => Promise<void>,
  { workMs = 480_000, cleanupMs = 10_000 } = {},
): Promise<void> {
  try {
    await within(work, workMs, "Recovery probe exceeded its work deadline");
  } finally {
    cancel();
    await within(cleanup, cleanupMs, "Recovery probe exceeded its cleanup deadline");
  }
}
