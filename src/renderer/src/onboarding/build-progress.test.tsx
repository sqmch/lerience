// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { assembleCourseData } from "../../../shared/course-data";
import { createSeminarState } from "../seminar/seminar-state";
import { OnboardingSurface } from "./onboarding-surface";

const tutor = vi.hoisted(() => ({
  busy: false,
  send: vi.fn(async () => true),
  setControls: vi.fn(async () => true),
}));
vi.mock("../seminar/use-seminar", () => ({
  useSeminar: () => ({ ...tutor, state: createSeminarState(), controls: null }),
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
});

it("shows zero at build start and reads every part from refreshed disk snapshots", async () => {
  // Course change notifications carry coarse invalidations, not file arrivals.
  // Re-rendering a refreshed snapshot is App's actual onCourseChanged contract.
  Object.defineProperty(window, "praxeum", {
    configurable: true,
    value: { onCourseChanged: () => () => undefined },
  });
  const host = document.createElement("div");
  root = createRoot(host);
  const render = async (files: string[]): Promise<void> => {
    await act(async () => {
      root?.render(
        <OnboardingSurface
          course={{
            rootPath: "C:\\Courses\\synthetic",
            folderName: "Synthetic",
            data: assembleCourseData({ files, contents: { "COURSE.md": "# Synthetic" } }),
          }}
          justCreated
          onLeaveCourse={() => undefined}
          onEnterCourse={() => undefined}
        />,
      );
    });
  };
  await render(["COURSE.md"]);
  const build = [...host.querySelectorAll("button")].find(
    (button) => button.textContent === "Build module 00",
  );
  expect(build).toBeDefined();
  await act(async () => build?.click());
  expect(host.textContent).toContain("0 of 7 parts landed");

  tutor.busy = true;
  const files = [
    "module.json",
    "LESSON.md",
    "BRIEF.md",
    "quiz.md",
    "scaffold/package.json",
    "checks/example.test.ts",
    "hints/01.md",
  ].map((file) => `curriculum/00-synthetic/${file}`);
  await render(["COURSE.md", ...files.slice(0, 3)]);
  expect(host.textContent).toContain("3 of 7 parts landed");
  await render([
    "COURSE.md",
    ...files,
    ...Array.from({ length: 450 }, (_, i) => `curriculum/00-synthetic/scaffold/src/${i}.ts`),
  ]);
  expect(host.textContent).toContain("7 of 7 parts landed");
  await render(["COURSE.md", ...files.filter((file) => !file.endsWith("LESSON.md"))]);
  expect(host.textContent).toContain("6 of 7 parts landed");
});
