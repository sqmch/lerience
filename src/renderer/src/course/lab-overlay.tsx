/* The lab — the course's interactive teaching tools, on a stage (ADR-012).
 *
 * The audit found this surface broken, and it was two faults wearing one coat:
 * a 288px nav column plus a reading-measure content column squeezed the visual
 * — the only reason the overlay exists — into a small canvas in the corner of a
 * large window. ADR-019's answer is that a stage is a stage: the visual gets
 * the surface, the switcher shrinks to one control in the head row, and the
 * blurb becomes a line rather than a column.
 *
 * The security posture is untouched and is the load-bearing part of ADR-012:
 * course-authored visuals render in a null-origin iframe (`allow-scripts`,
 * never `allow-same-origin`) served under the network-blocking praxeum-visual
 * scheme; stock labs are ported engine components configured by the claiming
 * module's own lab.json. */

import {
  labFocus,
  stockLabConfig,
  type CourseData,
  type CourseLabEntry,
} from "../../../shared/course-data";
import { visualSrc } from "../../../shared/visuals";
import { Menu } from "../components/menu";
import { STOCK_LAB_COMPONENTS, type ModuleLabConfig } from "../labs";
import { EmptyNote } from "./material";
import { OverlayShell } from "./overlay-shell";

export function LabOverlay({
  open,
  onOpenChange,
  course,
  contextModuleId,
  selectedKey,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course: CourseData;
  /** the module the lab was opened from — configures a claimed stock lab */
  contextModuleId: string | null;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}): React.JSX.Element {
  const labs = course.labs;
  const active: CourseLabEntry | undefined =
    labs.find((entry) => entry.key === selectedKey) ?? labs[0];

  // The module whose lab.json frames this entry: the opening context when it
  // claims the entry, else the (first) claiming module.
  const framingModuleId =
    active === undefined
      ? null
      : contextModuleId !== null && active.modules.includes(contextModuleId)
        ? contextModuleId
        : (active.modules[0] ?? null);
  const focus = labFocus(course.labClaims, framingModuleId);
  // The tutor's focus note belongs to the lab it points at (engine study rule):
  // shown when focusLab is absent or names the active entry.
  const note =
    active !== undefined &&
    focus.focus !== null &&
    (focus.focusLab === null || focus.focusLab === active.key)
      ? focus.focus
      : (active?.blurb ?? "");

  const StockLab =
    active?.visual === undefined ? STOCK_LAB_COMPONENTS[active?.key ?? ""] : undefined;

  return (
    <OverlayShell
      open={open}
      onOpenChange={onOpenChange}
      title="Lab"
      srDescription="The interactive visualizations this course claims or ships."
      actions={
        active === undefined ? null : (
          /* The head's action row is stretched full-height for tab rules; a
             menu and a chip want centring, so they say so. */
          <div className="flex min-w-0 items-center gap-2">
            {/* One control, and only when there is a choice to make: a switcher
                over a single visual is furniture. */}
            {labs.length > 1 ? (
              <Menu
                label="Which visualization is on the stage"
                value={active.key}
                trigger={active.title}
                options={labs.map((entry) => ({
                  value: entry.key,
                  label: entry.title,
                  ...(entry.blurb === "" ? {} : { description: entry.blurb }),
                }))}
                onChange={onSelect}
              />
            ) : (
              <span className="text-hi font-course shrink-0 text-md font-semibold">
                {active.title}
              </span>
            )}
            {course.currentModuleId !== null && active.modules.includes(course.currentModuleId) ? (
              <span className="bg-accent-wash text-accent shrink-0 rounded-pill px-2 py-0.5 text-2xs font-medium">
                current module
              </span>
            ) : null}
          </div>
        )
      }
    >
      {active === undefined ? (
        <EmptyNote
          title="No visualizations claimed"
          desc="A module claims a stock lab or ships its own visual in its lab.json. None does yet."
        />
      ) : (
        <>
          {note === "" ? null : (
            <p className="text-ink-dim border-line-soft shrink-0 border-b px-5 py-2.5 text-sm leading-normal text-pretty">
              {note}
            </p>
          )}
          {/* THE STAGE. It fills what is left — no reading measure, no card
              inset: a visualization answers to its own geometry, and the last
              design put it in a box inside a column inside a page. */}
          <div className="min-h-0 flex-1 overflow-hidden">
            {active.visual !== undefined ? (
              <iframe
                /* A foreign document, so it gets the deep ground: whatever the
                   course wrote paints itself, and the app supplies no frame it
                   might clash with. */
                className="bg-surface-deep block size-full border-0"
                /* a fresh document per visual — state never leaks across */
                key={active.key}
                src={visualSrc(active.visual.moduleId, active.visual.file)}
                title={active.title}
                sandbox="allow-scripts"
              />
            ) : StockLab !== undefined ? (
              /* A ported engine component, so it is on our own ground and gets
                 a gutter — it was drawn for a page, not for a bleed. A flex
                 COLUMN, because the ports size themselves as flex children of
                 a fixed-height column (`flex: 1; min-height: 0`): that is how
                 the side panel scrolls on its own and the drawing stays put.
                 As a block, the grid grew to the panel's full height and the
                 picture floated in the middle of a column taller than the
                 window. */
              <div className="bg-surface flex size-full flex-col overflow-auto p-6">
                <StockLab
                  key={`${active.key}:${framingModuleId ?? ""}`}
                  config={
                    stockLabConfig(
                      course.labClaims,
                      active.key,
                      framingModuleId,
                    ) as ModuleLabConfig | null
                  }
                  moduleId={framingModuleId}
                />
              </div>
            ) : (
              <EmptyNote
                title="This lab isn't on the stage yet"
                desc="The course claims a stock lab this app doesn't carry. The engine registry and this app move together; update the app."
              />
            )}
          </div>
        </>
      )}
    </OverlayShell>
  );
}
