/* "Open in editor" — the handoff to the learner's own editor (ADR-006, ADR-034).
 *
 * A split control: the button opens this module's project in the editor the
 * app will use, NAMED on the button so the learner never has to guess which
 * of their editors it means; the chevron beside it opens the menu where that
 * choice is made. Choosing an editor in the menu opens the project in it AND
 * remembers it, because "open with X" and "use X from now on" are the same
 * decision for nearly everyone — and the button's label shows the decision
 * took. The menu also carries the two other things the handoff needs: a way
 * to point at an editor the app could not find, and the whole course folder
 * for when the learner wants their journal or COURSE.md beside the code.
 *
 * Presence-based (ADR-013): the caller renders this only for a module with a
 * scaffold. The control itself knows nothing about course types.
 *
 * It sits in the seminar column's head. It used to sit in the material pane's
 * tab row, and an editor with a long name ("Visual Studio Code") plus the tabs
 * plus Run checks was more row than a squeezed pane had: the control painted
 * over the seam and into the column beside it. The seminar's head carries a
 * label and one link, so there is room — and the older Praxeum builds put the
 * handoff there for the same reason. */

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useCallback, useEffect, useState } from "react";
import type { EditorCatalog, EditorTarget } from "../../../shared/editor";
import { CheckGlyph, ChevronDownGlyph, CodeGlyph, SpinnerGlyph } from "../components/glyphs";
import { MENU_PANEL, MENU_ROW, MENU_TICK } from "../components/menu";

/* The two halves of one pill. Between them: one hairline, drawn once (the
   right half's left border is dropped) so the seam reads as a division of one
   control rather than two controls touching.

   The vocabulary is the rail's INSTRUMENT, restated here because INSTRUMENT
   is fully round and these ends are not: transparent border at rest, a border
   and a ground on hover. An outlined pill was the loudest thing in a head row
   whose other occupants are a heading and a text link, and it read as the
   column's main action, which it is not. Quiet at rest, a control under the
   pointer, the same as Record / Lab / Folder.

   `group-hover` on the border and `hover` on the ground: the outline belongs
   to the whole control, so both halves take it together, while the wash
   marks the half you are actually about to press. */
const HALF =
  "border-transparent text-ink-dim group-hover:border-line group-hover:text-hi " +
  "inline-flex items-center gap-2 self-stretch border py-1.5 text-xs font-medium " +
  "whitespace-nowrap transition-colors hover:bg-surface-raised disabled:opacity-50 " +
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus " +
  "data-[state=open]:border-line data-[state=open]:bg-surface-raised data-[state=open]:text-hi";
const LEFT = `${HALF} rounded-l-pill pl-2.5 pr-2`;
const RIGHT = `${HALF} rounded-r-pill border-l-0 px-1.5`;

const ROW = `${MENU_ROW} flex cursor-pointer items-center gap-2 px-2.5 py-2 text-sm`;

export function EditorControl({
  target,
  onNotice,
}: {
  /** What the button opens. The menu's "whole course folder" ignores it. */
  target: EditorTarget;
  /** A launch that failed, phrased for the learner. Shown by the pane, which
   *  has the room; the head row does not. */
  onNotice: (detail: string) => void;
}): React.JSX.Element {
  const [catalog, setCatalog] = useState<EditorCatalog | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const refresh = useCallback((): void => {
    void window.praxeum.listEditors().then(setCatalog);
  }, []);
  useEffect(refresh, [refresh]);

  const launch = (where: EditorTarget): void => {
    setBusy(true);
    void window.praxeum.openInEditor(where).then(
      (reply) => {
        setBusy(false);
        if (!reply.ok) onNotice(reply.detail);
      },
      () => {
        setBusy(false);
        onNotice("The editor could not be started.");
      },
    );
  };

  const choose = (editorId: EditorCatalog["editors"][number]["id"]): void => {
    void window.praxeum.selectEditor(editorId).then((next) => {
      setCatalog(next);
      launch(target);
    });
  };

  const browse = (): void => {
    void window.praxeum.browseForEditor().then((reply) => {
      setCatalog(reply.catalog);
      if (reply.ok) launch(target);
      else if (reply.reason === "not-runnable") {
        onNotice("That file is not a program this computer can run.");
      }
    });
  };

  const selected = catalog?.editors.find((editor) => editor.id === catalog.selectedEditorId);
  const none = catalog !== null && selected === undefined;
  const label = selected === undefined ? "Open in editor" : `Open in ${selected.label}`;

  return (
    <DropdownMenu.Root
      open={open}
      onOpenChange={(next) => {
        // Re-read on every open: an editor installed since the course was
        // opened should appear without a restart.
        if (next) refresh();
        setOpen(next);
      }}
    >
      {/* Shrinkable, unlike every other pill: this one carries a name the
          app does not choose ("Visual Studio Code", or whatever executable the
          learner browsed to), in a column the learner can drag narrow. The
          label truncates; the chevron and the glyph never do, so the control
          stays a control at any width. */}
      <div className="group flex min-w-0 items-center">
        {/* With nothing to launch, the button's only useful act is to show the
            menu — so it opens it rather than sitting dead. (The chevron stays
            the menu's one anchor; Radix positions against a single trigger.) */}
        <button
          type="button"
          className={`${LEFT} min-w-0`}
          disabled={busy || catalog === null}
          aria-haspopup={none ? "menu" : undefined}
          aria-expanded={none ? open : undefined}
          title={
            selected === undefined
              ? "Choose an editor to open this module's project folder in"
              : `Open this module's project folder in ${selected.label}`
          }
          onClick={() => {
            if (none) setOpen(true);
            else launch(target);
          }}
        >
          {busy ? (
            <SpinnerGlyph className="animate-spin size-3.5 shrink-0" />
          ) : (
            <CodeGlyph className="size-3.5 shrink-0" />
          )}
          <span className="truncate">{label}</span>
        </button>
        <DropdownMenu.Trigger
          className={`${RIGHT} shrink-0`}
          aria-label="Choose an editor"
          disabled={catalog === null}
        >
          <ChevronDownGlyph className="size-2.5 opacity-70" />
        </DropdownMenu.Trigger>
      </div>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className={`${MENU_PANEL} min-w-60`}
        >
          <DropdownMenu.Label className="text-ink-faint px-2.5 pt-1.5 pb-1 text-2xs font-medium">
            Open with
          </DropdownMenu.Label>
          {catalog === null || catalog.editors.length === 0 ? (
            <div className="text-ink-dim px-2.5 py-2 text-sm leading-normal text-pretty">
              No editor was found on this computer.
            </div>
          ) : (
            catalog.editors.map((editor) => {
              const isDefault = editor.id === catalog.selectedEditorId;
              return (
                <DropdownMenu.Item
                  key={editor.id}
                  className={ROW}
                  onSelect={() => {
                    choose(editor.id);
                  }}
                >
                  <span className={MENU_TICK}>
                    {isDefault ? <CheckGlyph className="text-accent size-3" /> : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{editor.label}</span>
                  {isDefault ? (
                    <span className="text-ink-faint text-2xs">
                      {catalog.chosen ? "default" : "found first"}
                    </span>
                  ) : null}
                </DropdownMenu.Item>
              );
            })
          )}
          <DropdownMenu.Item className={ROW} onSelect={browse}>
            <span className={MENU_TICK} />
            <span>Browse for an editor…</span>
          </DropdownMenu.Item>

          {selected === undefined ? null : (
            <>
              <DropdownMenu.Separator className="bg-line-soft my-1 h-px" />
              <DropdownMenu.Item
                className={ROW}
                onSelect={() => {
                  launch({ kind: "course" });
                }}
              >
                <span className={MENU_TICK} />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span>Whole course folder</span>
                  <span className="text-ink-faint text-2xs leading-normal">
                    Lessons, journal and every module, in {selected.label}
                  </span>
                </span>
              </DropdownMenu.Item>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
