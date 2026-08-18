/* The course track, and the course-scoped instruments under it (ADR-019).
 *
 * THE SIGNATURE, kept: one continuous spine runs the height of the track and
 * every module node sits ON it. Exactly one point is lit — where the course
 * has got to. That is the whole accent budget for this column.
 *
 * What is new is the column's two ends. The header carries progress, because a
 * meter belongs beside the count it is a picture of. The footer carries Record,
 * Lab and Folder, which used to live in a horizontal band above the workspace —
 * a band that cost every reader its height forever to hold three controls used
 * a few times a session (ADR-019). */

import type { CourseLabEntry, CourseModule, ModuleStatus } from "../../../shared/course-data";
import { DiamondGlyph, FolderGlyph, StackGlyph } from "../components/glyphs";

/**
 * The module mark — one of the two things in praxeum that stay hand-drawn.
 *
 * Geometry: the mark must sit centred on the spine at a half pixel, which is
 * why it is drawn inside a 21px box (--rail-node). Meaning: shape says what
 * kind of module this is (a diamond gates a phase), fill says how far you got,
 * and the lit ring says you are here. No icon set encodes that.
 */
function ModuleMark({
  status,
  bossCheck,
  current,
}: {
  status: ModuleStatus;
  bossCheck: boolean;
  current: boolean;
}): React.JSX.Element {
  const done = status === "completed";
  const shape = done
    ? "fill-ink-dim stroke-ink-dim"
    : current
      ? "fill-surface stroke-accent"
      : "fill-surface stroke-ink-faint";

  return (
    <svg
      viewBox="0 0 21 21"
      className="relative z-1 size-(--rail-node) shrink-0"
      aria-hidden="true"
      focusable="false"
    >
      {bossCheck ? (
        <path className={shape} strokeWidth="1.5" d="M10.5 3.4 L17.6 10.5 L10.5 17.6 L3.4 10.5 Z" />
      ) : (
        <circle className={shape} strokeWidth="1.5" cx="10.5" cy="10.5" r="6.6" />
      )}
      {done ? (
        <path
          className="stroke-surface"
          strokeWidth="1.75"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M7.4 10.7 L9.7 13 L13.8 8.6"
        />
      ) : null}
      {/* "You are here", as a filled centre rather than a glow. A drop shadow
          reads as a rendering artefact at this size; a solid dot does not. */}
      {current && !done ? <circle className="fill-accent" cx="10.5" cy="10.5" r="2.6" /> : null}
    </svg>
  );
}

const INSTRUMENT =
  "border-transparent text-ink-dim hover:bg-surface-raised hover:border-line hover:text-hi " +
  "focus-visible:outline-focus flex min-w-0 items-center gap-1.5 rounded-pill border px-2.5 py-1.5 " +
  "text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 " +
  "aria-pressed:bg-surface-raised aria-pressed:border-line aria-pressed:text-hi";

export function CourseRail({
  modules,
  unreadableModuleIds,
  currentModuleId,
  selectedId,
  completed,
  dueCount,
  labs,
  recordOpen,
  labOpen,
  onSelect,
  onOpenRecord,
  onOpenLab,
  onRevealFolder,
}: {
  modules: CourseModule[];
  unreadableModuleIds: string[];
  currentModuleId: string | null;
  selectedId: string | null;
  completed: number;
  dueCount: number;
  labs: CourseLabEntry[];
  recordOpen: boolean;
  labOpen: boolean;
  onSelect: (id: string) => void;
  onOpenRecord: () => void;
  onOpenLab: () => void;
  onRevealFolder: () => void;
}): React.JSX.Element {
  const phases: { phase: number; phaseName: string; modules: CourseModule[] }[] = [];
  for (const entry of modules) {
    const last = phases.at(-1);
    if (last?.phase === entry.phase) last.modules.push(entry);
    else phases.push({ phase: entry.phase, phaseName: entry.phaseName, modules: [entry] });
  }
  const percent = modules.length === 0 ? 0 : (completed / modules.length) * 100;

  return (
    <nav className="bg-surface flex min-h-0 flex-1 flex-col" aria-label="Course track">
      {/* Exactly the material pane's tab-row height, so the three columns share
          one head line across the workspace — the single strongest signal that
          this is one window rather than three panels. */}
      {modules.length === 0 ? null : (
        <header className="border-line-soft flex h-12 shrink-0 items-center gap-3 border-b px-4">
          <span className="text-ink-dim shrink-0 text-xs tabular-nums">
            {completed} of {modules.length}
          </span>
          <div
            className="bg-line h-0.5 min-w-0 flex-1 overflow-hidden rounded-pill"
            role="progressbar"
            aria-label="Modules completed"
            aria-valuenow={completed}
            aria-valuemin={0}
            aria-valuemax={modules.length}
          >
            <div
              className={
                completed === modules.length
                  ? "bg-ok h-full rounded-pill transition-[width] duration-(--dur-slow)"
                  : "bg-accent h-full rounded-pill transition-[width] duration-(--dur-slow)"
              }
              style={{ width: `${String(percent)}%` }}
            />
          </div>
          <span className="text-ink-faint shrink-0 text-2xs tabular-nums">
            {completed === modules.length ? "done" : `${String(Math.round(percent))}%`}
          </span>
        </header>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {/* A hairline running down an empty column reads as a rendering fault,
            not as a waiting state, so the spine is dropped entirely here. */}
        {modules.length === 0 ? (
          <div className="mx-auto flex max-w-(--container-start) flex-col gap-2 px-4 py-10 text-center">
            {unreadableModuleIds.length > 0 ? (
              <>
                <p className="text-bad font-course text-lg font-semibold">
                  Course material needs repair
                </p>
                <p className="text-ink-dim text-sm leading-normal text-pretty">
                  Your tutor wrote a module record this course cannot safely read yet.
                </p>
              </>
            ) : (
              <>
                <p className="text-hi font-course text-lg font-semibold">
                  The arc is being drafted
                </p>
                <p className="text-ink-dim text-sm leading-normal text-pretty">
                  Modules appear on this track as you and your tutor agree on them.
                </p>
              </>
            )}
          </div>
        ) : (
          <div>
            {phases.map((phase) => (
              <section
                key={phase.phase}
                aria-label={phase.phaseName}
                className="flex flex-col not-first:mt-6"
              >
                {/* A section label in a sidebar sits at the sidebar's own left
                    axis — that is the convention every modern editor and app
                    shell shares, and indenting it to the module TITLES (as the
                    first cut did) leaves it hanging in the middle of nothing.
                    No number: numbered step markers were
                    banned at mock round 1, and the phase's name says more. */}
                <h3 className="text-ink-faint px-3 pb-2 text-xs font-medium tracking-tight">
                  {phase.phaseName}
                </h3>
                {/* The spine belongs to the PHASE, not to the whole track: one
                    unbroken rule for the column would have to pass behind the
                    labels now that they sit at the left axis. Per-phase, it
                    also draws what it actually means — these modules are one
                    run of work. */}
                <div className="relative flex flex-col gap-0.5">
                  <span
                    aria-hidden="true"
                    className="bg-line-soft absolute top-3 bottom-3 left-(--rail-spine-x) w-(--stroke-hair)"
                  />
                  {phase.modules.map((entry) => {
                    const current = entry.id === currentModuleId;
                    const selected = entry.id === selectedId;
                    const runtime = entry.runtime === "" ? null : entry.runtime;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        aria-current={selected ? "true" : undefined}
                        onClick={() => {
                          onSelect(entry.id);
                        }}
                        className={
                          selected
                            ? "bg-surface-raised border-line focus-visible:outline-focus flex w-full items-start gap-2.5 rounded-md border px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2"
                            : "hover:bg-surface-raised focus-visible:outline-focus flex w-full items-start gap-2.5 rounded-md border border-transparent px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2"
                        }
                      >
                        <ModuleMark
                          status={entry.status}
                          bossCheck={entry.bossCheck}
                          current={current}
                        />
                        <span className="flex min-w-0 flex-1 flex-col gap-1">
                          <span
                            className={
                              entry.status === "not-started"
                                ? "text-ink-dim line-clamp-2 text-sm leading-snug"
                                : "text-ink line-clamp-2 text-sm leading-snug"
                            }
                          >
                            {entry.title}
                          </span>
                          {/* Deliberately few facts: the mark already says "boss
                            check" and "you are here". */}
                          <span
                            className={
                              current
                                ? "text-accent flex min-w-0 items-center gap-1.5 text-2xs"
                                : "text-ink-dim flex min-w-0 items-center gap-1.5 text-2xs"
                            }
                          >
                            <span className="min-w-0 truncate tabular-nums">
                              {entry.estimatedHours}h{runtime === null ? "" : ` · ${runtime}`}
                            </span>
                            {entry.hasVisual ? (
                              <>
                                <DiamondGlyph className="size-2.5 shrink-0" />
                                <span className="sr-only">has a visualization</span>
                              </>
                            ) : null}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {/* The instruments. Course-scoped, so they live in the course-scoped
          column rather than in a band across the top of the workspace. */}
      <footer className="border-line-soft flex shrink-0 flex-wrap items-center gap-1 border-t p-2">
        <button
          type="button"
          className={INSTRUMENT}
          aria-pressed={recordOpen}
          onClick={onOpenRecord}
        >
          <StackGlyph className="size-3.5 shrink-0" />
          <span>Record</span>
          {dueCount > 0 ? (
            <span className="bg-accent-wash text-accent ml-0.5 rounded-pill px-1.5 text-2xs font-medium tabular-nums">
              {dueCount}
            </span>
          ) : null}
        </button>
        {labs.length > 0 ? (
          <button type="button" className={INSTRUMENT} aria-pressed={labOpen} onClick={onOpenLab}>
            <DiamondGlyph className="size-3.5 shrink-0" />
            <span>Lab</span>
          </button>
        ) : null}
        <button
          type="button"
          className={INSTRUMENT}
          title="Show the course folder — your own editor opens it from there"
          onClick={onRevealFolder}
        >
          <FolderGlyph className="size-3.5 shrink-0" />
          <span>Folder</span>
        </button>
      </footer>
    </nav>
  );
}
