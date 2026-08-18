/* The three-column workspace and the seams between its columns (ADR-019).
 *
 * The seams are resizable. What makes each seam a control rather than a drag
 * handle is the keyboard: it is a real `separator` with a value, a range,
 * arrow keys, Home/End, and a reset. The
 * clamping is shared with the drag (see panes.ts), so both land in the same
 * places. */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  defaultPanes,
  fitPanes,
  PANE_STEP,
  PANE_STEP_COARSE,
  readPaneMeasures,
  type PaneMeasures,
  type PaneWidths,
} from "./panes";

/**
 * One seam.
 *
 * `grow` is which way dragging makes the pane bigger: the rail's seam grows it
 * rightwards (+1), the seminar's grows it leftwards (-1). Everything else about
 * the two is identical, which is the point — a learner should not have to learn
 * two seams.
 */
function Seam({
  label,
  value,
  min,
  max,
  grow,
  onSet,
  onNudge,
  onReset,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  grow: 1 | -1;
  /** Absolute: a drag knows where it started, and Home/End are absolute. */
  onSet: (width: number) => void;
  /** Relative, and it must be: two presses inside one render both read the
   *  same `value` prop, so key REPEAT silently dropped every second step
   *  (measured in the harness — three presses moved two steps). A delta is
   *  applied to the requested width, which is a ref and always current. */
  onNudge: (delta: number) => void;
  onReset: () => void;
}): React.JSX.Element {
  const drag = useRef<{ x: number; width: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={Math.round(min)}
      aria-valuemax={Math.round(max)}
      tabIndex={0}
      className="group focus-visible:outline-none relative z-1 flex w-(--seam-w) shrink-0 cursor-col-resize touch-none items-stretch justify-center"
      onPointerDown={(event) => {
        // Only the primary button drags; a right-click here is a context menu.
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { x: event.clientX, width: value };
        setDragging(true);
      }}
      onPointerMove={(event) => {
        const start = drag.current;
        if (start === null) return;
        onSet(start.width + (event.clientX - start.x) * grow);
      }}
      onPointerUp={(event) => {
        event.currentTarget.releasePointerCapture(event.pointerId);
        drag.current = null;
        setDragging(false);
      }}
      onPointerCancel={() => {
        drag.current = null;
        setDragging(false);
      }}
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        const step = event.shiftKey ? PANE_STEP_COARSE : PANE_STEP;
        if (event.key === "ArrowLeft") onNudge(-step * grow);
        else if (event.key === "ArrowRight") onNudge(step * grow);
        else if (event.key === "Home") onSet(min);
        else if (event.key === "End") onSet(max);
        else if (event.key === "Enter" || event.key === " ") onReset();
        else return;
        event.preventDefault();
      }}
    >
      {/* The painted rule is one hairline inside a nine-pixel hit area: the
          seam has to be easy to grab and invisible until you want it. */}
      <span
        aria-hidden="true"
        className={
          dragging
            ? "bg-accent block h-full w-(--stroke-hair)"
            : "bg-line group-hover:bg-line-strong group-focus-visible:bg-focus block h-full w-(--stroke-hair) transition-colors"
        }
      />
    </div>
  );
}

/**
 * Widths, clamped, persisted, and re-fitted whenever the window changes size.
 *
 * Persistence is app-wide rather than per course (ADR-019) and fire-and-forget:
 * a drag must never wait on a disk write, and a lost preference costs one
 * gesture.
 */
function usePanes(): {
  widths: PaneWidths;
  measures: PaneMeasures | null;
  frameRef: React.RefObject<HTMLDivElement | null>;
  set: (pane: keyof PaneWidths, width: number) => void;
  nudge: (pane: keyof PaneWidths, delta: number) => void;
  reset: (pane: keyof PaneWidths) => void;
} {
  const frameRef = useRef<HTMLDivElement>(null);
  const [measures, setMeasures] = useState<PaneMeasures | null>(null);
  const [widths, setWidths] = useState<PaneWidths>({ rail: 0, talk: 0 });
  /** The width the learner ASKED for, before the window's size had its say.
   *  Kept so that widening the window restores what they chose instead of
   *  leaving a pane where a narrow window squeezed it. */
  const wanted = useRef<PaneWidths>({ rail: 0, talk: 0 });

  useEffect(() => {
    const read = readPaneMeasures();
    setMeasures(read);
    let cancelled = false;
    const start = (stored: { railWidth?: number; talkWidth?: number }): void => {
      if (cancelled) return;
      wanted.current = {
        rail: stored.railWidth ?? read.railDefault,
        talk: stored.talkWidth ?? read.talkDefault,
      };
      setWidths(fitPanes(wanted.current, read, frameRef.current?.clientWidth ?? 0));
    };
    void window.praxeum.getLayout().then(start, () => {
      start({});
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /* Re-fit on every window change, from what the learner wanted rather than
     from where the last squeeze left things — otherwise narrowing and widening
     the window ratchets the panes smaller and never gives the room back.
     `fitPanes` is idempotent, so running it more often than necessary is free.
     Two triggers on purpose: the observer is the precise one (the frame can
     change without the window, if the chrome ever does), and the window event
     is the coarse one that still arrives when the observer is throttled — a
     background or occluded window delivers no observer callbacks at all. */
  useEffect(() => {
    const frame = frameRef.current;
    if (frame === null || measures === null) return;
    const refit = (): void => {
      setWidths(fitPanes(wanted.current, measures, frame.clientWidth));
    };
    const observer = new ResizeObserver(refit);
    observer.observe(frame);
    window.addEventListener("resize", refit);
    refit();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", refit);
    };
  }, [measures]);

  const apply = useCallback(
    (next: PaneWidths): void => {
      if (measures === null) return;
      wanted.current = next;
      const fitted = fitPanes(next, measures, frameRef.current?.clientWidth ?? 0);
      setWidths(fitted);
      void window.praxeum
        .setLayout({ railWidth: fitted.rail, talkWidth: fitted.talk })
        .catch(() => undefined);
    },
    [measures],
  );

  return {
    widths,
    measures,
    frameRef,
    set: (pane, width) => {
      apply({ ...wanted.current, [pane]: width });
    },
    nudge: (pane, delta) => {
      apply({ ...wanted.current, [pane]: wanted.current[pane] + delta });
    },
    reset: (pane) => {
      if (measures === null) return;
      apply({ ...wanted.current, [pane]: defaultPanes(measures)[pane] });
    },
  };
}

export function Workspace({
  rail,
  page,
  talk,
}: {
  rail: ReactNode;
  page: ReactNode;
  talk: ReactNode;
}): React.JSX.Element {
  const { widths, measures, frameRef, set, nudge, reset } = usePanes();

  return (
    <div
      ref={frameRef}
      className="flex min-h-0 min-w-0 flex-1 items-stretch overflow-hidden"
      /* The columns are laid out by flex rather than by a grid template so the
         seams can be real elements between them: a grid gutter cannot hold a
         focusable control. */
    >
      <div className="flex min-h-0 shrink-0 flex-col" style={{ width: `${String(widths.rail)}px` }}>
        {rail}
      </div>
      {measures === null ? null : (
        <Seam
          label="Resize the course track"
          value={widths.rail}
          min={measures.railMin}
          max={measures.railMax}
          grow={1}
          onSet={(width) => {
            set("rail", width);
          }}
          onNudge={(delta) => {
            nudge("rail", delta);
          }}
          onReset={() => {
            reset("rail");
          }}
        />
      )}
      {/* min-w-0 rather than the reading floor: the floor is honoured by the
          clamp when there is room, and a track that cannot be satisfied would
          overflow the window instead (panes.ts explains the trade). */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{page}</div>
      {measures === null ? null : (
        <Seam
          label="Resize the seminar"
          value={widths.talk}
          min={measures.talkMin}
          max={measures.talkMax}
          grow={-1}
          onSet={(width) => {
            set("talk", width);
          }}
          onNudge={(delta) => {
            nudge("talk", delta);
          }}
          onReset={() => {
            reset("talk");
          }}
        />
      )}
      <div className="flex min-h-0 shrink-0 flex-col" style={{ width: `${String(widths.talk)}px` }}>
        {talk}
      </div>
    </div>
  );
}
