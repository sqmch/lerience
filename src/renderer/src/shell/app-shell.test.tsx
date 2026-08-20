// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PraxeumApi } from "../../../shared/ipc";
import { AppShell } from "./app-shell";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
(globalThis as typeof globalThis & { React: typeof React }).React = React;

let root: Root | null = null;

afterEach(() => {
  if (root !== null) {
    act(() => root?.unmount());
    root = null;
  }
});

describe("update banner", () => {
  it("shows a failed automatic check and lets the learner retry it", async () => {
    const checkForUpdate = vi.fn(async () => ({ phase: "current" }) as const);
    Object.defineProperty(window, "praxeum", {
      configurable: true,
      value: {
        getUpdateStatus: vi.fn(async () => ({
          phase: "error",
          operation: "check",
          detail: "Updates could not be checked right now.",
        })),
        onUpdateStatusChanged: vi.fn(() => () => undefined),
        checkForUpdate,
        getTheme: vi.fn(() => new Promise(() => undefined)),
        onThemeChanged: vi.fn(() => () => undefined),
      } as unknown as PraxeumApi,
    });

    const host = document.createElement("div");
    root = createRoot(host);
    await act(async () => root?.render(<AppShell children={<main>Course</main>} />));

    await vi.waitFor(() =>
      expect(host.textContent).toContain("Updates could not be checked right now."),
    );
    const retry = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Try again",
    );
    expect(retry).toBeDefined();

    await act(async () => retry?.click());
    expect(checkForUpdate).toHaveBeenCalledOnce();
  });
});
