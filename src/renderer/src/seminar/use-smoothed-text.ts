import { useEffect, useState } from "react";

/** Floor rate, characters per second. */
const MIN_CPS = 220;
/** The reveal accelerates as the unseen backlog grows. */
const BACKLOG_GAIN = 3.2;

/** Advance one animation frame without ever overrunning the accumulated text. */
export function advanceLength(shownLength: number, targetLength: number, dtMs: number): number {
  if (shownLength >= targetLength) return targetLength;
  const backlog = targetLength - shownLength;
  const cps = Math.max(MIN_CPS, backlog * BACKLOG_GAIN);
  const advance = Math.max(1, Math.round((cps * Math.max(0, dtMs)) / 1000));
  return Math.min(targetLength, shownLength + advance);
}

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = (): void => {
      setReduce(query.matches);
    };
    update();
    query.addEventListener("change", update);
    return () => {
      query.removeEventListener("change", update);
    };
  }, []);

  return reduce;
}

/** Smooth uneven provider chunks into a steady character reveal. */
export function useSmoothedText(target: string, streaming: boolean): string {
  const reduce = usePrefersReducedMotion();
  const smooth = streaming && !reduce;
  const [shown, setShown] = useState("");

  useEffect(() => {
    if (!smooth) return;
    let raf = 0;
    let last = performance.now();

    const tick = (now: number): void => {
      const dt = now - last;
      last = now;
      setShown((previous) => {
        const base = target.startsWith(previous) ? previous : "";
        return target.slice(0, advanceLength(base.length, target.length, dt));
      });
      raf = requestAnimationFrame(tick);
    };

    const onVisibility = (): void => {
      if (document.hidden) setShown(target);
    };
    document.addEventListener("visibilitychange", onVisibility);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [target, smooth]);

  return smooth ? shown : target;
}
