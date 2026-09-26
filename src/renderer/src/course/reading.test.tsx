// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ReadingLesson } from "./reading";
import type { ReadingCommand, ReadingView } from "../../../shared/reading";
const markdown = "# Rule\n\nA **bold** passage.\n";
const base: ReadingView = {
  supported: true,
  revision: 0,
  marks: [],
  matches: {},
  source: {
    digest: "a".repeat(64),
    markdown,
    passages: [{ index: 0, heading: "Rule", text: "A bold passage." }],
  },
};
let root: Root, host: HTMLDivElement;
const dirty = vi.fn();
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  HTMLElement.prototype.scrollIntoView = vi.fn();
  dirty.mockClear();
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});
const tick = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
};
async function render(reading: (r: string, c: ReadingCommand) => Promise<unknown>) {
  Object.defineProperty(window, "praxeum", {
    configurable: true,
    value: {
      reading,
      openInEditor: vi.fn(),
      sendSeminarMessage: vi.fn(() => {
        throw new Error("Must not send");
      }),
    },
  });
  await act(() =>
    root.render(
      <div role="tabpanel" tabIndex={0}>
        <ReadingLesson
          courseRoot="fixture"
          moduleId="00-rule"
          markdown={markdown}
          availableModules={["00-rule"]}
          onOpenMark={() => {}}
          targetId={null}
          onUnsaved={dirty}
        />
      </div>,
    ),
  );
  await tick();
}
async function menu(label: string) {
  const panel = host.querySelector<HTMLElement>("[role=tabpanel]")!;
  await act(() => {
    panel.focus();
    panel.dispatchEvent(
      new KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true }),
    );
  });
  await tick();
  const item = [...document.querySelectorAll<HTMLElement>("[role=menuitem]")].find(
    (e) => e.textContent === label,
  );
  expect(item).toBeDefined();
  await act(() => item!.click());
  await tick();
}
async function click(label: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent === label,
  );
  expect(button).toBeDefined();
  await act(() => button!.click());
  await tick();
}
it("legacy course keeps ordinary reading and exposes no highlight context menu", async () => {
  await render(async () => ({ ok: true, view: { ...base, supported: false, source: null } }));
  const panel = host.querySelector("[role=tabpanel]")!;
  expect(panel.hasAttribute("aria-haspopup")).toBe(false);
  expect(host.textContent).toContain("A bold passage.");
  expect(host.querySelector("button")).toBeNull();
});
it("failed write retains quote and same ID for retry; only acknowledgement paints saved state; no permanent controls", async () => {
  let view = structuredClone(base),
    failed = true;
  const calls: ReadingCommand[] = [];
  await render(async (_r, c) => {
    calls.push(c);
    if (c.operation === "read") return { ok: true, view };
    if (failed) {
      failed = false;
      return { ok: false, detail: "Write failed." };
    }
    if (c.operation === "add") {
      view = {
        ...view,
        revision: 1,
        marks: [
          {
            id: c.id,
            courseId: "00000000-0000-4000-8000-000000000015",
            moduleId: c.moduleId,
            lessonPath: "curriculum/00-rule/LESSON.md",
            createdAt: "2026-09-26",
            sourceDigest: c.sourceDigest,
            extractionVersion: c.extractionVersion,
            index: c.index,
            heading: c.heading,
            text: c.text,
            start: c.start,
            end: c.end,
            quote: c.quote,
          },
        ],
        matches: { [c.id]: { index: 0, changed: false } },
      };
    }
    return { ok: true, view };
  });
  expect(host.querySelector("button")).toBeNull();
  await menu("Highlight a passage\u2026");
  await click("Highlight passage");
  expect(document.querySelector("dialog")?.textContent).toContain("Write failed.");
  expect(document.querySelector("textarea")?.value).toBe("A bold passage.");
  expect(dirty).toHaveBeenLastCalledWith(true);
  await click("Retry");
  const writes = calls.filter((c) => c.operation === "add");
  expect(writes).toHaveLength(2);
  expect(writes[0]).toEqual(writes[1]);
  expect(dirty).toHaveBeenLastCalledWith(false);
  await click("Close");
  await menu("Your highlights");
  expect(document.querySelector("dialog")?.textContent).toContain("A bold passage.");
  await click("Open passage");
  await new Promise((r) => setTimeout(r, 25));
  expect(document.activeElement?.tagName).toBe("P");
  expect(window.praxeum.sendSeminarMessage).not.toHaveBeenCalled();
});
