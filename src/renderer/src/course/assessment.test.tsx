// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Assessment } from "./assessment";
import { createAssessmentFixtureStore } from "../../../../dev/renderer-harness/assessment-store";
import type { AssessmentCommand, AssessmentReply } from "../../../shared/assessment";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
});
const tick = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};
async function click(text: string) {
  const button = [...host.querySelectorAll("button")].find((b) => b.textContent === text);
  expect(button).toBeDefined();
  await act(() => button!.click());
  await tick();
}
async function fill(id: string, value: string) {
  const element = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#answer-${id}`)!;
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  await act(() => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await tick();
}
it("real controls save raw edits, validate, submit once, reopen immutable history and revise", async () => {
  const store = createAssessmentFixtureStore();
  const command = vi.fn(store);
  window.praxeum = {
    assessment: command,
    onCourseChanged: () => () => undefined,
  } as unknown as typeof window.praxeum;
  const dirty = vi.fn();
  await act(() =>
    root.render(
      <Assessment courseRoot="fixture" moduleId="01-tracing-changes" onUnsaved={dirty} />,
    ),
  );
  await tick();
  await click("Begin answers");
  await click("Submit answers");
  expect(host.textContent).toContain("Check the marked answers");
  for (const [id, value] of Object.entries({
    add: "5",
    remove: "1",
    full: "6",
    spill: "2",
    why: "One plus seven makes eight, so two spill.",
  }))
    await fill(id, value);
  expect(host.textContent).toContain("Draft saved locally");
  expect(dirty).toHaveBeenLastCalledWith(false);
  await click("Submit answers");
  expect(host.textContent).toContain("Submitted locally");
  expect(host.textContent).toContain("4 of 4 correct");
  expect(host.textContent).toContain("Awaiting tutor review");
  expect(host.querySelector("input")).toBeNull();
  await act(() =>
    root.render(
      <Assessment
        key="reopen"
        courseRoot="fixture"
        moduleId="01-tracing-changes"
        onUnsaved={dirty}
      />,
    ),
  );
  await tick();
  expect(host.textContent).toContain("One plus seven makes eight");
  await click("Revise answers");
  expect(host.querySelector<HTMLInputElement>("#answer-spill")?.value).toBe("2");
  expect(host.textContent).toContain("Earlier answers and feedback are kept");
});
it("failed save keeps input and blocks exit until retry is acknowledged", async () => {
  const store = createAssessmentFixtureStore("save-error");
  window.praxeum = {
    assessment: store,
    onCourseChanged: () => () => undefined,
  } as unknown as typeof window.praxeum;
  const dirty = vi.fn();
  await act(() =>
    root.render(
      <Assessment courseRoot="fixture" moduleId="01-tracing-changes" onUnsaved={dirty} />,
    ),
  );
  await tick();
  await click("Begin answers");
  expect(host.textContent).toContain("Simulated save failure");
  expect(dirty).toHaveBeenLastCalledWith(true);
  const close = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(close);
  expect(close.defaultPrevented).toBe(true);
  await click("Retry");
  expect(host.textContent).toContain("Draft saved locally");
  expect(dirty).toHaveBeenLastCalledWith(false);
});
it("late response from an unmounted course cannot replace the new course view", async () => {
  let release!: (value: AssessmentReply) => void;
  const store = createAssessmentFixtureStore();
  window.praxeum = {
    assessment: (course: string, c: AssessmentCommand) =>
      course === "old"
        ? new Promise<AssessmentReply>((resolve) => {
            release = resolve;
          })
        : store(course, c),
    onCourseChanged: () => () => undefined,
  } as unknown as typeof window.praxeum;
  const dirty = () => undefined;
  await act(() =>
    root.render(
      <Assessment key="old" courseRoot="old" moduleId="01-tracing-changes" onUnsaved={dirty} />,
    ),
  );
  await act(() =>
    root.render(
      <Assessment key="new" courseRoot="new" moduleId="00-reading-state" onUnsaved={dirty} />,
    ),
  );
  await tick();
  await act(() =>
    release({
      ok: true,
      view: {
        state: "unsupported",
        detail: "OLD COURSE",
        question: null,
        sourceDigest: null,
        attempts: [],
      },
    }),
  );
  expect(host.textContent).toBe("");
});
it("reconciles a committed save with lost acknowledgement before saving newer typing", async () => {
  const store = createAssessmentFixtureStore();
  let rejectSave!: (reason: Error) => void;
  let interrupted = false;
  const bridge = vi.fn(async (course: string, c: AssessmentCommand): Promise<AssessmentReply> => {
    if (c.operation === "save" && c.raw.add === "5" && !interrupted) {
      interrupted = true;
      await store(course, c);
      return await new Promise((_resolve, reject) => {
        rejectSave = reject;
      });
    }
    return await store(course, c);
  });
  window.praxeum = {
    assessment: bridge,
    onCourseChanged: () => () => undefined,
  } as unknown as typeof window.praxeum;
  const dirty = vi.fn();
  await act(() =>
    root.render(
      <Assessment courseRoot="fixture" moduleId="01-tracing-changes" onUnsaved={dirty} />,
    ),
  );
  await tick();
  await click("Begin answers");
  await fill("add", "5");
  await fill("add", "55");
  await act(() => rejectSave(new Error("Acknowledgement lost")));
  await tick();
  expect(host.querySelector<HTMLInputElement>("#answer-add")?.value).toBe("55");
  await click("Retry");
  expect(host.textContent).toContain("Draft saved locally");
  expect(dirty).toHaveBeenLastCalledWith(false);
  expect(
    bridge.mock.calls.some(
      ([, c]) => c.operation === "save" && c.raw.add === "55" && c.revision === 2,
    ),
  ).toBe(true);
});
