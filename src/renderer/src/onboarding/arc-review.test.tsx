// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { assembleCourseData } from "../../../shared/course-data";
import { createSeminarState } from "../seminar/seminar-state";
import { OnboardingSurface } from "./onboarding-surface";

const tutor = vi.hoisted(() => ({
  busy: false,
  controls: null as import("../../../shared/seminar").SessionControls | null,
  controlNotice: null as { kind: "error"; message: string } | null,
  send: vi.fn(async () => true),
  setControls: vi.fn(async () => true),
}));
vi.mock("../seminar/use-seminar", () => ({
  useSeminar: () => ({
    ...tutor,
    state: { ...createSeminarState(), controlNotice: tutor.controlNotice },
  }),
}));
vi.mock("../tutor/use-tutor-connection", () => ({
  useTutorConnection: () => ({ ready: true }),
}));
vi.mock("../shell/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => children,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
(globalThis as typeof globalThis & { React: typeof React }).React = React;
HTMLElement.prototype.scrollTo = vi.fn();
window.matchMedia = () =>
  ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as MediaQueryList;

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  tutor.busy = false;
  document.body.innerHTML = "";
});

beforeEach(() => {
  tutor.send.mockReset().mockResolvedValue(true);
  tutor.setControls.mockReset().mockResolvedValue(true);
  tutor.controlNotice = null;
  tutor.controls = null;
  Object.defineProperty(window, "praxeum", { configurable: true, value: {} });
});

async function renderArc(): Promise<HTMLDivElement> {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root?.render(
      <OnboardingSurface
        course={{
          rootPath: "C:/Courses/synthetic",
          folderName: "Synthetic",
          data: assembleCourseData({
            files: ["COURSE.md"],
            contents: { "COURSE.md": "# Synthetic" },
          }),
        }}
        justCreated
        onLeaveCourse={() => undefined}
        onEnterCourse={() => undefined}
      />,
    ),
  );
  return host;
}

it.each(["never", "bypassPermissions"])(
  "uses the offered %s option before building and prevents duplicate starts",
  async (id) => {
    tutor.controls = {
      models: [],
      autonomy: [
        {
          id,
          label: "Never ask",
          description: "Provider access scope",
          skipsApprovalPrompts: true,
        },
      ],
      current: { model: null, effort: null, autonomy: null },
    };
    let applied!: (result: boolean) => void;
    tutor.setControls.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          applied = resolve;
        }),
    );
    const host = await renderArc();
    expect(host.textContent).toContain("Provider access scope");
    const button = [...host.querySelectorAll("button")].find(
      (item) => item.textContent === "Build module 00",
    )!;
    await act(async () => {
      button.click();
      button.click();
    });
    expect(tutor.setControls).toHaveBeenCalledExactlyOnceWith({ autonomy: id });
    expect(tutor.send).not.toHaveBeenCalled();
    await act(async () => applied(true));
    expect(tutor.send).toHaveBeenCalledOnce();
  },
);

it("keeps the arc visible and explains a rejected control without sending assent", async () => {
  tutor.controls = {
    models: [],
    autonomy: [
      { id: "never", label: "Never ask", description: "Scope", skipsApprovalPrompts: true },
    ],
    current: { model: null, effort: null, autonomy: null },
  };
  tutor.setControls.mockImplementation(async () => {
    tutor.controlNotice = { kind: "error", message: "That change didn't apply." };
    return false;
  });
  const host = await renderArc();
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((item) => item.textContent === "Build module 00")!
      .click(),
  );
  expect(tutor.send).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("The build has not started");
  expect(host.textContent).toContain("Does this look like your course?");
});

it("offers no permission checkbox when the provider has no no-approval mode", async () => {
  const host = await renderArc();
  expect(host.querySelector('input[type="checkbox"]')).toBeNull();
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((item) => item.textContent === "Build module 00")!
      .click(),
  );
  expect(tutor.setControls).not.toHaveBeenCalled();
  expect(tutor.send).toHaveBeenCalledOnce();
});

it.each([true, false])(
  "requires a deliberate Full access pick and awaits both controls, accepted=%s",
  async (accepted) => {
    tutor.controls = {
      models: [],
      autonomy: [
        {
          id: "never",
          label: "Never ask",
          description: "No approvals",
          skipsApprovalPrompts: true,
        },
      ],
      access: [
        { id: "workspace-write", label: "Course folder", description: "Course scope" },
        {
          id: "danger-full-access",
          label: "Full access",
          description: "Can write outside this course and use the network",
        },
      ],
      current: { model: null, effort: null, autonomy: null, access: "workspace-write" },
    };
    let applied!: (value: boolean) => void;
    tutor.setControls.mockImplementation(
      () =>
        new Promise((resolve) => {
          applied = resolve;
        }),
    );
    const host = await renderArc();
    const access = host.querySelector('button[aria-label="Tutor access"]') as HTMLButtonElement;
    expect(access.textContent).toContain("Course folder");
    expect(tutor.setControls).not.toHaveBeenCalled();
    await act(async () => {
      access.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });
    await act(async () =>
      (document.querySelectorAll('[role="menuitem"]')[1] as HTMLElement).click(),
    );
    expect(host.textContent).toContain("outside this course and use the network");
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((item) => item.textContent === "Build module 00")!
        .click(),
    );
    expect(tutor.setControls).toHaveBeenCalledExactlyOnceWith({
      autonomy: "never",
      access: "danger-full-access",
    });
    expect(tutor.send).not.toHaveBeenCalled();
    await act(async () => applied(accepted));
    expect(tutor.send).toHaveBeenCalledTimes(accepted ? 1 : 0);
  },
);
