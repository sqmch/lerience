import { READING_COURSE, READING_LESSONS, READING_MODULE } from "./reading-material";
/* Original synthetic reading material. No course writes, provider calls or durable store. */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { CourseView } from "../../src/renderer/src/course/course-view";
import { DocMarkdown } from "../../src/renderer/src/components/markdown-view";
import { GHOST, PRIMARY } from "../../src/renderer/src/components/controls";
import { Menu, MENU_PANEL, MENU_ROW } from "../../src/renderer/src/components/menu";
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
  const openingDialog = useRef(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const popover = useRef<HTMLButtonElement>(null);
  const [dialog, setDialog] = useState<"list" | "choose" | null>(null);
  const [chosen, setChosen] = useState(0);
  const [candidate, setCandidate] = useState<{
    mark: ReadingMark;
    left: number;
    top: number;
    bottom: number;
  } | null>(null);
  const [notice, setNotice] = useState("");
  const [context, setContext] = useState<{
    left: number;
    top: number;
    gap: number;
    padding: number;
    selection: ReadingMark | null;
    copy: string;
  } | null>(null);
  const passages = (): Passage[] => (root.current ? readPassages(root.current) : []);

  useEffect(() => {
    const panel = root.current?.closest<HTMLElement>('[role="tabpanel"]');
    if (!panel) return;
    panel.setAttribute("aria-haspopup", "menu");
    panel.setAttribute("aria-keyshortcuts", "Shift+F10");
    const open = (event: MouseEvent | KeyboardEvent): void => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || target.closest("a,button,input,textarea,dialog,pre,table,iframe")) return;
      const keyboard = event instanceof KeyboardEvent;
      if (keyboard && event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10"))
        return;
      if (!keyboard && target !== panel && !root.current?.contains(target)) return;
      event.preventDefault();
      const source = root.current ? readPassages(root.current) : [];
      const selected = window.getSelection();
      const range = selected ? selectedPassage(source, selected) : null;
      const clicked = source.find((entry) => entry.element.contains(target));
      setChosen(clicked?.index ?? range?.passage.index ?? 0);
      const selection = range
        ? makeMark(
            range.passage,
            range.start,
            range.end,
            revision,
            Math.max(0, ...marks.map((entry) => entry.id)) + 1,
          )
        : null;
      const rect = (clicked?.element ?? root.current ?? panel).getBoundingClientRect();
      const style = getComputedStyle(panel);
      const padding = Number.parseFloat(style.getPropertyValue("--space-3"));
      const scale = Number.parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
      setCandidate(null);
      openingDialog.current = false;
      setContext({
        left: keyboard ? rect.left / scale + padding : event.clientX / scale,
        top: keyboard ? Math.max(rect.top / scale, padding) : event.clientY / scale,
        gap: Number.parseFloat(style.getPropertyValue("--space-1-5")),
        padding,
        selection,
        copy: selected?.toString() ?? "",
      });
    };
    panel.addEventListener("contextmenu", open);
    panel.addEventListener("keydown", open);
    return () => {
      panel.removeEventListener("contextmenu", open);
      panel.removeEventListener("keydown", open);
      panel.removeAttribute("aria-haspopup");
      panel.removeAttribute("aria-keyshortcuts");
    };
  }, [marks, revision]);

  useLayoutEffect(() => {
    const button = popover.current;
    if (!button || !candidate) return;
    const styles = getComputedStyle(button);
    const gap = Number.parseFloat(styles.getPropertyValue("--space-2"));
    const padding = Number.parseFloat(styles.getPropertyValue("--space-3"));
    const width = Number.parseFloat(styles.width);
    const height = Number.parseFloat(styles.height);
    const scale = button.getBoundingClientRect().width / width || 1;
    const viewportWidth = window.innerWidth / scale;
    const viewportHeight = window.innerHeight / scale;
    const below = candidate.bottom / scale + gap;
    button.style.left = `${Math.max(padding, Math.min(candidate.left / scale, viewportWidth - width - padding))}px`;
    button.style.top = `${Math.max(padding, below + height <= viewportHeight - padding ? below : candidate.top / scale - gap - height)}px`;
  }, [candidate, revision]);

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
    if (context || dialog) return;
    const selection = window.getSelection();
    setCandidate(null);
    if (!selection || selection.isCollapsed) return;
    const selected = selectedPassage(passages(), selection);
    if (!selected) return;
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
      left: rect.left,
      top: rect.top,
      bottom: rect.bottom,
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
    openingDialog.current = false;
    requestAnimationFrame(() =>
      root.current?.closest<HTMLElement>('[role="tabpanel"]')?.focus({ preventScroll: true }),
    );
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
      <div role="status" className="sr-only">
        {notice}
      </div>
      <div onPointerUp={inspectSelection} onKeyUp={inspectSelection}>
        <DocMarkdown
          markdown={READING_LESSONS[revision]}
          moduleId={READING_MODULE}
          className="prose max-w-none"
        />
      </div>
      {context && (
        <DropdownMenu.Root
          open
          onOpenChange={(open) => {
            if (!open) setContext(null);
          }}
        >
          <DropdownMenu.Trigger asChild>
            <span
              aria-hidden="true"
              tabIndex={-1}
              className="pointer-events-none fixed size-px opacity-0"
              style={{ left: context.left, top: context.top }}
            />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              aria-label="Lesson actions"
              align="start"
              sideOffset={context.gap}
              collisionPadding={context.padding}
              className={`${MENU_PANEL} min-w-56`}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                if (!openingDialog.current)
                  root.current
                    ?.closest<HTMLElement>('[role="tabpanel"]')
                    ?.focus({ preventScroll: true });
              }}
            >
              {context.copy && (
                <DropdownMenu.Item
                  className={`${MENU_ROW} cursor-pointer px-3 py-2 text-sm`}
                  onSelect={() => {
                    void navigator.clipboard.writeText(context.copy).then(
                      () => setNotice("Selection copied."),
                      () =>
                        setNotice("Copy unavailable. Select the text and use your copy shortcut."),
                    );
                  }}
                >
                  Copy
                </DropdownMenu.Item>
              )}
              {context.copy && !context.selection && (
                <DropdownMenu.Item disabled className={`${MENU_ROW} max-w-56 px-3 py-2 text-xs`}>
                  Highlight within one prose paragraph.
                </DropdownMenu.Item>
              )}
              {context.selection && (
                <DropdownMenu.Item
                  className={`${MENU_ROW} cursor-pointer px-3 py-2 text-sm`}
                  onSelect={() => {
                    if (context.selection) save(context.selection);
                  }}
                >
                  Highlight selection
                </DropdownMenu.Item>
              )}
              <DropdownMenu.Item
                className={`${MENU_ROW} cursor-pointer px-3 py-2 text-sm`}
                onSelect={() => {
                  openingDialog.current = true;
                  setDialog("choose");
                }}
              >
                Highlight a passage…
              </DropdownMenu.Item>
              {marks.length > 0 && (
                <DropdownMenu.Item
                  className={`${MENU_ROW} cursor-pointer px-3 py-2 text-sm`}
                  onSelect={() => {
                    openingDialog.current = true;
                    setDialog("list");
                  }}
                >
                  Your highlights
                </DropdownMenu.Item>
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      )}
      {candidate &&
        candidate.mark.revision === revision &&
        createPortal(
          <button
            ref={popover}
            type="button"
            className={`${PRIMARY} shadow-popover fixed z-50 text-xs`}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => save(candidate.mark)}
          >
            Highlight
          </button>,
          document.body,
        )}
      {dialog === "list" && (
        <ReadingDialog title="Your highlights" onClose={closeDialog}>
          <div role="status" className="sr-only">
            {notice}
          </div>
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
