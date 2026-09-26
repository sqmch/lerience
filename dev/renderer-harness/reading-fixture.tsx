import { READING_COURSE, READING_LESSONS, READING_MODULE } from "./reading-material";
/* Original synthetic reading material. No course writes, provider calls or durable store. */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CourseView } from "../../src/renderer/src/course/course-view";
import { DocMarkdown } from "../../src/renderer/src/components/markdown-view";
import { GHOST, PRIMARY } from "../../src/renderer/src/components/controls";
import { Menu } from "../../src/renderer/src/components/menu";
import { LayerContainerProvider } from "../../src/renderer/src/components/layer";
import {
  appendMark,
  makeMark,
  matchMark,
  passageRange,
  readPassages,
  selectedPassage,
  READING_REVISIONS,
  type Passage,
  type ReadingMark,
  type ReadingRevision,
} from "./reading-state";

export type ReadingTutor = "ready" | "busy" | "unavailable";
/** Connected only by the synthetic harness bridge, never production preload. */
export const readingBridge: { setTutor: (state: ReadingTutor) => void } = {
  setTutor: () => undefined,
};
function ReadingDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [layer, setLayer] = useState<HTMLDialogElement | null>(null);
  useEffect(() => {
    const element = ref.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={(element) => {
        ref.current = element;
        setLayer(element);
      }}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="bg-surface-raised text-ink border-line-strong shadow-overlay backdrop:bg-(--scrim) backdrop:backdrop-blur-(--blur-scrim) m-auto hidden max-h-(--overlay-h) w-(--overlay-w-read) max-w-(--container-start) flex-col overflow-hidden rounded-lg border p-0 open:flex"
    >
      <LayerContainerProvider value={layer}>
        <div className="border-line flex shrink-0 items-center justify-between gap-3 border-b px-5 py-3">
          <h2 className="text-hi text-sm font-medium">{title}</h2>
          <button className={`${GHOST} text-xs`} onClick={onClose}>
            Close
          </button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </LayerContainerProvider>
    </dialog>
  );
}

function ReadingLesson({
  revision,
  marks,
  onMarks,
}: {
  revision: ReadingRevision;
  marks: ReadingMark[];
  onMarks: (marks: ReadingMark[]) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const [dialog, setDialog] = useState<"list" | "choose" | null>(null);
  const [chosen, setChosen] = useState(0);
  const [candidate, setCandidate] = useState<{
    mark: ReadingMark;
    left: number;
    top: number;
  } | null>(null);
  const [notice, setNotice] = useState("");
  const [selectionNotice, setSelectionNotice] = useState("");
  const passages = (): Passage[] => (root.current ? readPassages(root.current) : []);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const source = readPassages(element);
    if (typeof Highlight === "undefined" || !CSS.highlights) return;
    const ranges = marks.flatMap((mark) => {
      const match = matchMark(mark, source, revision);
      const range = match ? passageRange(match, mark.start, mark.end) : null;
      return range ? [range] : [];
    });
    CSS.highlights.set("reading-preview", new Highlight(...ranges));
    return () => {
      CSS.highlights.delete("reading-preview");
    };
  }, [marks, revision]);

  useEffect(() => {
    const dismiss = (): void => setCandidate(null);
    const escape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") dismiss();
    };
    document.addEventListener("scroll", dismiss, true);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("scroll", dismiss, true);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", dismiss);
    };
  }, []);

  useEffect(() => {
    if (!candidate) return;
    const changed = (): void => {
      const selection = window.getSelection();
      const selected =
        selection && root.current ? selectedPassage(readPassages(root.current), selection) : null;
      if (
        !selected ||
        selected.passage.index !== candidate.mark.index ||
        selected.start !== candidate.mark.start ||
        selected.end !== candidate.mark.end
      )
        setCandidate(null);
    };
    document.addEventListener("selectionchange", changed);
    return () => document.removeEventListener("selectionchange", changed);
  }, [candidate]);

  const inspectSelection = (): void => {
    const selection = window.getSelection();
    setCandidate(null);
    setSelectionNotice("");
    if (!selection || selection.isCollapsed) return;
    const selected = selectedPassage(passages(), selection);
    if (!selected) {
      setSelectionNotice("Select text within one prose paragraph to highlight it.");
      return;
    }
    const mark = makeMark(
      selected.passage,
      selected.start,
      selected.end,
      revision,
      Math.max(0, ...marks.map((entry) => entry.id)) + 1,
    );
    if (!mark) return;
    const rect = selected.range.getBoundingClientRect();
    setCandidate({
      mark,
      left: Math.min(window.innerWidth - 130, Math.max(12, rect.left)),
      top: Math.min(window.innerHeight - 90, rect.bottom + 8),
    });
  };
  const save = (mark: ReadingMark): void => {
    const next = appendMark(marks, mark);
    onMarks(next);
    setNotice(
      next === marks ? "This passage is already highlighted." : "Highlight held in preview memory.",
    );
    setCandidate(null);
  };
  const closeDialog = (): void => {
    setDialog(null);
    requestAnimationFrame(() => trigger.current?.focus());
  };
  const openPassage = (mark: ReadingMark): void => {
    const match = matchMark(mark, passages(), revision);
    if (!match) return;
    setDialog(null);
    requestAnimationFrame(() => {
      match.element.scrollIntoView({ block: "center", behavior: "instant" });
      match.element.tabIndex = -1;
      match.element.focus({ preventScroll: true });
      match.element.addEventListener("blur", () => match.element.removeAttribute("tabindex"), {
        once: true,
      });
    });
  };
  const currentPassages = dialog ? passages() : [];
  const paragraph = currentPassages[chosen] ?? currentPassages[0];

  return (
    <div ref={root} className="reading-preview">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          className={`${GHOST} -ml-2.5 text-xs`}
          onClick={(event) => {
            trigger.current = event.currentTarget;
            setCandidate(null);
            setDialog("choose");
          }}
        >
          Highlight a passage
        </button>
        <button
          type="button"
          className={`${GHOST} text-xs`}
          onClick={(event) => {
            trigger.current = event.currentTarget;
            setCandidate(null);
            setDialog("list");
          }}
        >
          Highlights{marks.length ? ` · ${marks.length}` : ""}
        </button>
      </div>
      <div role="status" className="sr-only">
        {notice}
      </div>
      {selectionNotice ? (
        <p role="status" className="text-ink-dim mb-4 text-xs">
          {selectionNotice}
        </p>
      ) : null}
      <div onPointerUp={inspectSelection} onKeyUp={inspectSelection}>
        <DocMarkdown
          markdown={READING_LESSONS[revision]}
          moduleId={READING_MODULE}
          className="prose max-w-none"
        />
      </div>
      {candidate &&
        candidate.mark.revision === revision &&
        createPortal(
          <button
            type="button"
            className={`${PRIMARY} shadow-popover fixed z-50 text-xs`}
            style={{ left: candidate.left, top: candidate.top }}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => save(candidate.mark)}
          >
            Highlight
          </button>,
          document.body,
        )}
      {dialog === "list" && (
        <ReadingDialog title="Your highlights" onClose={closeDialog}>
          <p className="text-ink-dim mb-5 text-xs leading-normal">
            The parcel tray · Held in preview memory. Reloading clears your marks.
          </p>
          {marks.length === 0 ? (
            <p className="font-course text-read leading-read">
              Nothing marked yet. Select a passage while reading, or use Highlight a passage.
            </p>
          ) : (
            marks.map((mark) => {
              const match = matchMark(mark, currentPassages, revision);
              return (
                <article
                  key={mark.id}
                  className="border-line-soft border-b py-4 first:pt-0 last:border-0 last:pb-0"
                >
                  <p className="text-ink-dim mb-2 text-xs">{mark.heading.split(" / ").at(-1)}</p>
                  <p className="font-course text-read leading-read">{mark.quote}</p>
                  {!match ? (
                    <p className="text-warn mt-3 text-xs">Passage changed or missing</p>
                  ) : mark.revision !== revision ? (
                    <p className="text-ink-dim mt-3 text-xs">
                      Lesson changed since this highlight. Reread the context.
                    </p>
                  ) : null}
                  {!match && (
                    <details className="mt-3 text-sm">
                      <summary className="text-ink-dim cursor-pointer">Saved context</summary>
                      <p className="font-course mt-3 leading-read">{mark.text}</p>
                    </details>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {match && (
                      <button
                        type="button"
                        className={`${GHOST} -ml-2.5 text-xs`}
                        onClick={() => openPassage(mark)}
                      >
                        Open passage
                      </button>
                    )}
                    {!match && (
                      <button
                        type="button"
                        className={`${GHOST} -ml-2.5 text-xs`}
                        onClick={closeDialog}
                      >
                        Back to lesson
                      </button>
                    )}
                    <button
                      type="button"
                      className={`${GHOST} text-xs`}
                      aria-label={`Remove highlight: ${mark.quote}`}
                      onClick={(event) => {
                        const close = event.currentTarget
                          .closest("dialog")
                          ?.querySelector<HTMLButtonElement>("button");
                        onMarks(marks.filter((entry) => entry.id !== mark.id));
                        setNotice("Highlight removed from preview memory.");
                        requestAnimationFrame(() => close?.focus());
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </ReadingDialog>
      )}
      {dialog === "choose" && (
        <ReadingDialog title="Highlight a passage" onClose={closeDialog}>
          <p className="text-ink-dim mb-4 text-sm leading-normal">
            Choose a paragraph. Select a few words in the text below, or keep the whole paragraph.
          </p>
          <Menu
            label="Paragraph"
            value={String(paragraph?.index ?? 0)}
            options={currentPassages.map((entry) => ({
              value: String(entry.index),
              label: `${entry.index + 1}. ${entry.heading.split(" / ").at(-1) ?? "Introduction"}`,
              description: entry.text.slice(0, 85),
            }))}
            onChange={(value) => setChosen(Number(value))}
          />
          <label className="text-ink-dim mt-4 block text-xs" htmlFor="reading-passage">
            Passage text
          </label>
          <textarea
            ref={field}
            id="reading-passage"
            readOnly
            value={paragraph?.text ?? ""}
            rows={6}
            className="bg-surface-input border-line-strong text-ink font-course focus:outline-focus mt-2 block w-full resize-y rounded-lg border px-4 py-3 text-md leading-read focus:outline-2"
          />
          <button
            type="button"
            className={`${PRIMARY} mt-4 text-sm`}
            onClick={() => {
              if (!paragraph || !field.current) return;
              const { selectionStart: start, selectionEnd: end } = field.current;
              const mark = makeMark(
                paragraph,
                start === end ? 0 : start,
                start === end ? paragraph.text.length : end,
                revision,
                Math.max(0, ...marks.map((entry) => entry.id)) + 1,
              );
              if (mark) {
                save(mark);
                closeDialog();
              }
            }}
          >
            Highlight passage
          </button>
        </ReadingDialog>
      )}
    </div>
  );
}

export function ReadingFixture(): React.JSX.Element {
  const requested = new URLSearchParams(window.location.search).get("reading");
  const initial = READING_REVISIONS.find((entry) => entry === requested) ?? "original";
  const [revision, setRevision] = useState<ReadingRevision>(initial);
  const [marks, setMarks] = useState<ReadingMark[]>([]);
  const [tutor, setTutor] = useState<ReadingTutor>("ready");
  return (
    <>
      <CourseView
        course={READING_COURSE}
        onLeaveCourse={() => undefined}
        renderLessonPreview={(id) =>
          id === READING_MODULE ? (
            <ReadingLesson revision={revision} marks={marks} onMarks={setMarks} />
          ) : undefined
        }
      />
      <div className="bg-surface-raised border-line text-ink-dim fixed bottom-8 left-3 z-10 flex max-w-(--container-read) flex-wrap items-center gap-1 rounded-lg border px-3 py-1 text-2xs">
        <span>Reading preview · memory only</span>
        <Menu
          label="Lesson version"
          value={revision}
          options={READING_REVISIONS.map((value) => ({ value, label: value }))}
          onChange={setRevision}
        />
        <Menu<ReadingTutor>
          label="Preview tutor state"
          value={tutor}
          options={["ready", "busy", "unavailable"].map((value) => ({
            value: value as ReadingTutor,
            label: value,
          }))}
          onChange={(value) => {
            setTutor(value);
            readingBridge.setTutor(value);
          }}
        />
      </div>
    </>
  );
}
