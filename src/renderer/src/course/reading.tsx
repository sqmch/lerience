import {
  useCallback,
  useMemo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { DocMarkdown } from "../components/markdown-view";
import { GHOST, PRIMARY } from "../components/controls";
import { Menu, MENU_PANEL, MENU_ROW } from "../components/menu";
import { LayerContainerProvider } from "../components/layer";
import { passageRange, readPassages, selectedPassage, type Passage } from "./reading-selection";
import {
  EXTRACTION_VERSION,
  type ReadingCommand,
  type ReadingMark,
  type ReadingView,
} from "../../../shared/reading";
type NewMark = Extract<ReadingCommand, { operation: "add" }>;
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

export function ReadingLesson({
  markdown,
  moduleId,
  courseRoot,
  availableModules,
  onOpenMark,
  targetId,
  onUnsaved,
  children,
}: {
  markdown: string | null;
  moduleId: string | null;
  courseRoot: string;
  availableModules: readonly string[];
  onOpenMark: (mark: ReadingMark) => void;
  targetId: string | null;
  onUnsaved: (value: boolean) => void;
  children?: ReactNode;
}) {
  const [view, setView] = useState<ReadingView | null>(null);
  const [failure, setFailure] = useState("");
  const [pending, setPending] = useState<ReadingCommand | null>(null);
  const [busy, setBusy] = useState(false);
  const pendingRef = useRef<ReadingCommand | null>(null);
  const inFlight = useRef(false);
  const generation = useRef(0);
  const marks = useMemo(() => view?.marks ?? [], [view]);
  const revision = view?.source?.digest ?? "";
  const supported = view?.supported === true;
  const refresh = useCallback(async (): Promise<void> => {
    const token = ++generation.current;
    try {
      const reply = await window.praxeum.reading(courseRoot, { operation: "read", moduleId });
      if (token !== generation.current) return;
      if (reply.ok) {
        setView(reply.view);
        if (!pendingRef.current) setFailure("");
      } else setFailure(reply.detail);
    } catch {
      if (token === generation.current)
        setFailure("Highlights could not be read. Retry from the Lesson menu.");
    }
  }, [courseRoot, moduleId]);
  useEffect(() => {
    void refresh();
    return () => {
      generation.current++;
    };
  }, [refresh, markdown]);
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent): void => {
      if (busy || pending) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [busy, pending]);
  const root = useRef<HTMLDivElement>(null);
  const openingDialog = useRef(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const popover = useRef<HTMLButtonElement>(null);
  const [dialog, setDialog] = useState<"list" | "choose" | "failure" | null>(null);
  const [chosen, setChosen] = useState(0);
  const [candidate, setCandidate] = useState<{
    mark: NewMark;
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
    selection: NewMark | null;
    copy: string;
  } | null>(null);
  const passages = useCallback((): Passage[] => {
    if (!root.current || view?.source?.markdown !== markdown) return [];
    return readPassages(root.current).filter((p) =>
      view.source?.passages.some(
        (s) => s.index === p.index && s.text === p.text && s.heading === p.heading,
      ),
    );
  }, [view, markdown]);
  const makeMark = useCallback(
    (passage: Passage, start: number, end: number): NewMark | null => {
      if (
        !moduleId ||
        !supported ||
        view?.source?.markdown !== markdown ||
        start < 0 ||
        end > passage.text.length ||
        start >= end ||
        !passage.text.slice(start, end).trim()
      )
        return null;
      return {
        operation: "add",
        id: crypto.randomUUID(),
        moduleId,
        revision: view.revision,
        sourceDigest: revision,
        extractionVersion: EXTRACTION_VERSION,
        index: passage.index,
        heading: passage.heading,
        text: passage.text,
        start,
        end,
        quote: passage.text.slice(start, end),
      };
    },
    [supported, view, markdown, moduleId, revision],
  );
  const matchMark = useCallback(
    (mark: ReadingMark): Passage | null => {
      if (mark.moduleId !== moduleId || view?.source?.markdown !== markdown) return null;
      const match = view.matches[mark.id];
      return match
        ? (passages().find(
            (p) => p.index === match.index && p.text === mark.text && p.heading === mark.heading,
          ) ?? null)
        : null;
    },
    [moduleId, view, markdown, passages],
  );

  useEffect(() => {
    const panel = root.current?.closest<HTMLElement>('[role="tabpanel"]') ?? root.current;
    if (!panel || (!supported && !failure) || (markdown === null && marks.length === 0 && !failure))
      return;
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
      const source = passages();
      const selected = window.getSelection();
      const range = selected ? selectedPassage(source, selected) : null;
      const clicked = source.find((entry) => entry.element.contains(target));
      setChosen(clicked?.index ?? range?.passage.index ?? 0);
      const selection = range ? makeMark(range.passage, range.start, range.end) : null;
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
  }, [supported, failure, passages, makeMark, markdown, marks.length]);

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

    if (typeof Highlight === "undefined" || !CSS.highlights) return;
    const ranges = marks.flatMap((mark) => {
      const match = matchMark(mark);
      const range = match ? passageRange(match, mark.start, mark.end) : null;
      return range ? [range] : [];
    });
    CSS.highlights.set("reading-marks", new Highlight(...ranges));
    return () => {
      CSS.highlights.delete("reading-marks");
    };
  }, [marks, matchMark]);

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
    if (context || dialog || pending || busy) return;
    const selection = window.getSelection();
    setCandidate(null);
    if (!selection || selection.isCollapsed) return;
    const selected = selectedPassage(passages(), selection);
    if (!selected) return;
    const mark = makeMark(selected.passage, selected.start, selected.end);
    if (!mark) return;
    const rect = selected.range.getBoundingClientRect();
    setCandidate({
      mark,
      left: rect.left,
      top: rect.top,
      bottom: rect.bottom,
    });
  };
  const execute = async (command: ReadingCommand): Promise<void> => {
    if (inFlight.current || (pendingRef.current && pendingRef.current !== command)) return;
    inFlight.current = true;
    onUnsaved(true);
    pendingRef.current = command;
    setPending(command);
    setBusy(true);
    setCandidate(null);
    try {
      const reply = await window.praxeum.reading(courseRoot, command);
      if (reply.ok) {
        setView(reply.view);
        pendingRef.current = null;
        onUnsaved(false);
        setPending(null);
        setFailure("");
        setNotice(command.operation === "remove" ? "Highlight removed." : "Highlight saved.");
      } else {
        setFailure(reply.detail);
        setDialog("failure");
      }
    } catch {
      setFailure("Saving could not be confirmed. Retry the same action.");
      setDialog("failure");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const save = (mark: NewMark): void => {
    void execute(mark);
  };
  const closeDialog = (): void => {
    setDialog(null);
    openingDialog.current = false;
    requestAnimationFrame(() =>
      (root.current?.closest<HTMLElement>('[role="tabpanel"]') ?? root.current)?.focus({
        preventScroll: true,
      }),
    );
  };
  const openPassage = useCallback(
    (mark: ReadingMark): void => {
      if (pendingRef.current) return;
      const match = matchMark(mark);
      if (!match) {
        if (view?.matches[mark.id] && availableModules.includes(mark.moduleId)) onOpenMark(mark);
        return;
      }
      setDialog(null);
      requestAnimationFrame(() => {
        match.element.scrollIntoView({ block: "center", behavior: "instant" });
        match.element.tabIndex = -1;
        match.element.focus({ preventScroll: true });
        match.element.addEventListener("blur", () => match.element.removeAttribute("tabindex"), {
          once: true,
        });
      });
    },
    [matchMark, view, availableModules, onOpenMark],
  );
  const returnedTarget = useRef<string | null>(null);
  useEffect(() => {
    if (!targetId || returnedTarget.current === targetId) return;
    const mark = marks.find((m) => m.id === targetId);
    if (mark && matchMark(mark)) {
      returnedTarget.current = targetId;
      openPassage(mark);
    }
  }, [targetId, marks, matchMark, openPassage]);
  const currentPassages = dialog ? passages() : [];
  const paragraph = currentPassages.find((p) => p.index === chosen) ?? currentPassages[0];

  return (
    <div
      ref={root}
      className={markdown === null ? "reading-marks h-full min-h-0" : "reading-marks"}
      tabIndex={markdown === null ? 0 : undefined}
      role={markdown === null ? "region" : undefined}
      aria-label={markdown === null ? "Course reading" : undefined}
    >
      <div role="status" className="sr-only">
        {notice}
      </div>
      <div onPointerUp={inspectSelection} onKeyUp={inspectSelection}>
        {markdown !== null && moduleId ? (
          <DocMarkdown markdown={markdown} moduleId={moduleId} className="prose max-w-none" />
        ) : (
          children
        )}
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
                  (root.current?.closest<HTMLElement>('[role="tabpanel"]') ?? root.current)?.focus({
                    preventScroll: true,
                  });
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
              {context.selection && !pending && !busy && (
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
                disabled={!supported || busy || pending !== null || passages().length === 0}
                className={`${MENU_ROW} cursor-pointer px-3 py-2 text-sm`}
                onSelect={() => {
                  openingDialog.current = true;
                  setDialog("choose");
                }}
              >
                Highlight a passage…
              </DropdownMenu.Item>
              {failure && (
                <DropdownMenu.Item
                  className={`${MENU_ROW} cursor-pointer px-3 py-2 text-sm`}
                  onSelect={() => {
                    openingDialog.current = true;
                    setDialog("failure");
                  }}
                >
                  Highlight storage
                </DropdownMenu.Item>
              )}
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
        candidate.mark.sourceDigest === revision &&
        !busy &&
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
            Saved passages from this course.
          </p>
          {marks.length === 0 ? (
            <p className="font-course text-read leading-read">
              Nothing marked yet. Select a passage while reading, or use Highlight a passage.
            </p>
          ) : (
            marks.map((mark) => {
              const match =
                view?.matches[mark.id] &&
                availableModules.includes(mark.moduleId) &&
                (mark.moduleId !== moduleId || matchMark(mark));
              return (
                <article
                  key={mark.id}
                  className="border-line-soft border-b py-4 first:pt-0 last:border-0 last:pb-0"
                >
                  <p className="text-ink-dim mb-2 text-xs">
                    {mark.moduleId} / {mark.heading.split(" / ").at(-1)}
                  </p>
                  <p className="font-course text-read leading-read">{mark.quote}</p>
                  {!match ? (
                    <p className="text-warn mt-3 text-xs">Passage changed or missing</p>
                  ) : view?.matches[mark.id]?.changed ? (
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
                        disabled={busy || pending !== null}
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
                      disabled={busy || pending !== null}
                      aria-label={`Remove highlight: ${mark.quote}`}
                      onClick={(event) => {
                        const close = event.currentTarget
                          .closest("dialog")
                          ?.querySelector<HTMLButtonElement>("button");
                        void execute({
                          operation: "remove",
                          moduleId,
                          id: mark.id,
                          revision: view!.revision,
                        });
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
      {dialog === "failure" && (
        <ReadingDialog title="Highlight storage" onClose={closeDialog}>
          <p role="alert" className="text-sm">
            {failure || "Saving highlight..."}
          </p>
          {pending?.operation === "add" && (
            <textarea
              aria-label="Unsaved quote"
              readOnly
              value={pending.quote}
              className="font-course mt-4 w-full"
            />
          )}
          <div className="mt-4 flex gap-2">
            <button
              disabled={busy}
              className={`${PRIMARY} text-sm`}
              onClick={() => {
                if (pending) void execute(pending);
                else void refresh();
              }}
            >
              Retry
            </button>
            <button
              disabled={busy}
              className={`${GHOST} text-sm`}
              onClick={() => {
                pendingRef.current = null;
                onUnsaved(false);
                setPending(null);
                void refresh();
                closeDialog();
              }}
            >
              Discard unsaved action
            </button>
          </div>
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
