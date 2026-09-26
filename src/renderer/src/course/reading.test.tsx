// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ReadingLesson } from "./reading";
import type { ReadingCommand, ReadingView, ReadingMark } from "../../../shared/reading";
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
async function render(
  reading: (r: string, c: ReadingCommand) => Promise<unknown>,
  options: { missing?: boolean; open?: (mark: ReadingMark) => void } = {},
) {
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
          moduleId={options.missing ? null : "00-rule"}
          markdown={options.missing ? null : markdown}
          availableModules={options.missing ? [] : ["00-rule", "01-other"]}
          onOpenMark={options.open ?? (() => {})}
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
const oldMark: ReadingMark = {
  id: "00000000-0000-4000-8000-000000000016",
  courseId: "00000000-0000-4000-8000-000000000015",
  moduleId: "01-other",
  lessonPath: "curriculum/01-other/LESSON.md",
  sourceDigest: "b".repeat(64),
  extractionVersion: "marked18-prose-v1",
  index: 0,
  heading: "Earlier",
  text: "An earlier passage.",
  quote: "earlier",
  start: 3,
  end: 10,
  createdAt: "2026-09-26",
};
it("unconfirmed add cannot leave through another module; retry retains quote and identity", async () => {
  const view = {
    ...base,
    marks: [oldMark],
    matches: { [oldMark.id]: { index: 0, changed: false } },
  };
  const open = vi.fn(),
    requests: ReadingCommand[] = [];
  let finish: (reply: unknown) => void = () => {};
  await render(
    async (_r, c) => {
      requests.push(c);
      return c.operation === "read"
        ? { ok: true, view }
        : await new Promise((resolve) => {
            finish = resolve;
          });
    },
    { open },
  );
  await menu("Highlight a passage\u2026");
  await click("Highlight passage");
  await menu("Your highlights");
  let button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent === "Open passage",
  )!;
  expect(button.disabled).toBe(true);
  await act(() => button.click());
  expect(open).not.toHaveBeenCalled();
  await act(() => finish({ ok: false, detail: "Acknowledgement lost." }));
  await tick();
  expect(document.querySelector("textarea")?.value).toBe("A bold passage.");
  await click("Close");
  await menu("Your highlights");
  button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent === "Open passage",
  )!;
  expect(button.disabled).toBe(true);
  await act(() => button.click());
  expect(open).not.toHaveBeenCalled();
  await click("Close");
  await menu("Highlight storage");
  await click("Retry");
  const writes = requests.filter((c) => c.operation === "add");
  expect(writes).toHaveLength(2);
  expect(writes[0]).toEqual(writes[1]);
  await act(() => finish({ ok: false, detail: "Still pending." }));
  await tick();
});
it("deleted only lesson/module retains contextual access to saved quote and removal", async () => {
  let view: ReadingView = {
    ...base,
    source: null,
    marks: [oldMark],
    matches: { [oldMark.id]: null },
  };
  await render(
    async (_r, c) => {
      if (c.operation === "remove") view = { ...view, marks: [], matches: {}, revision: 1 };
      return { ok: true, view };
    },
    { missing: true },
  );
  await menu("Your highlights");
  expect(document.querySelector("dialog")?.textContent).toContain("earlier");
  expect(document.querySelector("dialog")?.textContent).toContain("Passage changed or missing");
  expect(document.querySelector("dialog")?.textContent).not.toContain("preview memory");
  expect(
    [...document.querySelectorAll("button")].some((b) => b.textContent === "Open passage"),
  ).toBe(false);
  await click("Remove");
  expect(document.querySelectorAll("dialog article")).toHaveLength(0);
});
it("same-event removal and cross-module return cannot bypass the synchronous pending guard", async () => {
  const view = {
    ...base,
    marks: [oldMark],
    matches: { [oldMark.id]: { index: 0, changed: false } },
  };
  const open = vi.fn();
  let finish: (value: unknown) => void = () => {};
  await render(
    async (_r, c) =>
      c.operation === "read"
        ? { ok: true, view }
        : await new Promise((resolve) => {
            finish = resolve;
          }),
    { open },
  );
  await menu("Your highlights");
  const buttons = [...document.querySelectorAll<HTMLButtonElement>("dialog button")];
  const remove = buttons.find((b) => b.textContent === "Remove")!,
    jump = buttons.find((b) => b.textContent === "Open passage")!;
  await act(() => {
    remove.click();
    expect(dirty).toHaveBeenLastCalledWith(true);
    jump.click();
  });
  expect(open).not.toHaveBeenCalled();
  await act(() => finish({ ok: false, detail: "Not confirmed." }));
  await tick();
  expect(dirty).toHaveBeenLastCalledWith(true);
});
