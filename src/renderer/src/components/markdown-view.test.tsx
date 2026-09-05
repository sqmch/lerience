// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { DocMarkdown } from "./markdown-view";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const container = document.createElement("div");
document.body.append(container);
let root = createRoot(container);

it("hands a clicked source reference to the editor bridge and displays failure", async () => {
  const openInEditor = vi.fn(async () => ({
    ok: false,
    reason: "no-target",
    detail: "This linked file could not be found.",
  }));
  vi.stubGlobal("praxeum", { openInEditor });
  await act(() =>
    root.render(<DocMarkdown markdown="[Source](reference/run.py#L12)" moduleId="00-map" />),
  );
  await act(() => container.querySelector("a")!.click());
  expect(openInEditor).toHaveBeenCalledWith({
    kind: "document-link",
    moduleId: "00-map",
    href: "reference/run.py#L12",
  });
  expect(container.querySelector('[role="status"]')?.textContent).toContain("could not be found");
  vi.unstubAllGlobals();
});
afterEach(async () => {
  await act(() => root.unmount());
  root = createRoot(container);
});

it("preserves a live visual across parent renders with unchanged markdown", async () => {
  const markdown = '```visual\n{"file":"map.html","title":"Map"}\n```';
  await act(() => root.render(<DocMarkdown markdown={markdown} moduleId="00-map" />));
  const frame = container.querySelector("iframe");
  expect(frame).not.toBeNull();
  await act(() => root.render(<DocMarkdown markdown={markdown} moduleId="00-map" />));
  expect(container.querySelector("iframe")).toBe(frame);
});

it("replaces the visual when the document or module changes", async () => {
  const markdown = '```visual\n{"file":"map.html"}\n```';
  await act(() => root.render(<DocMarkdown markdown={markdown} moduleId="00-map" />));
  const frame = container.querySelector("iframe");
  await act(() => root.render(<DocMarkdown markdown={markdown} moduleId="01-map" />));
  expect(container.querySelector("iframe")).not.toBe(frame);
  expect(container.querySelector("iframe")?.getAttribute("src")).toContain("01-map");
  await act(() => root.render(<DocMarkdown markdown="New lesson" moduleId="01-map" />));
  expect(container.querySelector("iframe")).toBeNull();
});
