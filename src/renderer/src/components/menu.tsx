/* The app's one dropdown, on Radix's menu primitive (the component shadcn
   itself wraps). Radix owns the behaviour nobody should hand-roll — focus
   trapping, typeahead, roving focus, escape/outside dismissal, collision
   flipping — and every visible value here is a token, so the menu belongs to
   the Lens palette rather than to the operating system.

   Native `<select>` was the previous answer and it was wrong: the OS draws
   that popup with its own colours, which is why it read as a bright rectangle
   in a dark app. */

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";
import { CheckGlyph, ChevronDownGlyph } from "./glyphs";

/* ── the menu's shared chrome ────────────────────────────────────────────────
   Exported as class strings rather than as wrapper components, because a menu
   whose rows carry more than a label and a line (the tutor control) still has
   to be built from Radix's own parts. Sharing the SURFACE — panel, row ground,
   highlight, disabled state — is what keeps a second menu from drifting into a
   second look. Full literal strings: Tailwind scans source text. */

/** The floating panel itself. Width is the caller's, since it answers to the
 *  content; everything that makes it read as a layer is here. */
export const MENU_PANEL = "bg-surface-panel border-line shadow-popover z-50 rounded-md border p-1";

/** One row's ground and states. Layout and padding stay with the caller: a
 *  one-line option and a two-line provider row want different boxes. */
export const MENU_ROW =
  "text-ink data-highlighted:bg-accent-wash data-highlighted:text-hi " +
  "data-disabled:pointer-events-none data-disabled:opacity-50 rounded-sm outline-none select-none";

/** The column a selection tick sits in — reserved always, so labels do not
 *  shift when the selection moves. Callers put the tick (or nothing) inside.
 *
 *  Sized in BOTH axes on purpose: a glyph left at its natural inline height
 *  brings a whole line box with it, so the row carrying the tick stood 3px
 *  taller than the row without one — two menu rows of different heights,
 *  which reads as a rendering fault rather than as a selection. */
export const MENU_TICK = "flex size-3 shrink-0 items-center";

export interface MenuOption<T extends string> {
  value: T;
  label: string;
  /** One line under the label — what choosing this actually does. */
  description?: string;
}

/** A compact trigger + menu. The trigger reads as a quiet pill until hovered
 *  or open, so a row of them does not compete with the conversation. */
export function Menu<T extends string>({
  label,
  value,
  options,
  onChange,
  align = "start",
  trigger,
  disabled = false,
}: {
  /** Names the control for assistive tech; never drawn. */
  label: string;
  value: T | null;
  options: MenuOption<T>[];
  onChange: (value: T) => void;
  align?: "start" | "end";
  /** What the closed control shows. Defaults to the selected option's label. */
  trigger?: ReactNode;
  disabled?: boolean;
}): React.JSX.Element {
  const selected = options.find((option) => option.value === value);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={label}
        disabled={disabled}
        className="text-ink-dim hover:text-hi hover:bg-accent-wash data-[state=open]:bg-accent-wash data-[state=open]:text-hi focus-visible:focus-frame focus-visible:text-hi flex shrink-0 items-center gap-1 rounded-pill px-2.5 py-1.5 text-2xs transition-colors"
      >
        <span className="max-w-40 truncate">{trigger ?? selected?.label ?? label}</span>
        <ChevronDownGlyph className="size-2.5 shrink-0 opacity-60" />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={6}
          collisionPadding={12}
          className={`${MENU_PANEL} min-w-56`}
        >
          {options.map((option) => (
            <DropdownMenu.Item
              key={option.value}
              onSelect={() => {
                onChange(option.value);
              }}
              className={`${MENU_ROW} flex cursor-pointer flex-col gap-0.5 px-2.5 py-2 text-sm`}
            >
              <span className="flex items-center gap-2">
                <span className={MENU_TICK}>
                  {option.value === value ? <CheckGlyph className="text-accent size-3" /> : null}
                </span>
                {option.label}
              </span>
              {option.description === undefined ? null : (
                <span className="text-ink-faint pl-5 text-2xs leading-normal text-pretty">
                  {option.description}
                </span>
              )}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
