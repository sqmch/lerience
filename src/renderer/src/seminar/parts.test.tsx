// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { ConversationTranscript } from "./parts";
import { createSeminarState } from "./seminar-state";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
(globalThis as typeof globalThis & { React: typeof React }).React = React;
window.matchMedia = () =>
  ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }) as unknown as MediaQueryList;

let root: Root | null = null;

afterEach(() => {
  if (root !== null) {
    act(() => root?.unmount());
    root = null;
  }
});

describe("ConversationTranscript", () => {
  it("keeps the recovered reply readable until the learner hides it", () => {
    const state = {
      ...createSeminarState(),
      phase: "streaming" as const,
      lifecycle: "open" as const,
      sessionId: "session-new",
      recoveryHandoff: "opening-next" as const,
      previousSession: {
        sessionId: "session-old",
        recoveryStartIndex: 2,
        items: [
          {
            id: "learner-2",
            role: "learner" as const,
            content: "I stopped midway",
            streaming: false,
          },
          {
            id: "tutor-3",
            role: "tutor" as const,
            content: "Let's continue",
            streaming: false,
          },
          {
            id: "tutor-7",
            role: "tutor" as const,
            content: "Previous session finished.",
            streaming: false,
          },
        ],
      },
      items: [
        {
          id: "tutor-2",
          role: "tutor" as const,
          content: "Welcome back to the new session.",
          streaming: false,
        },
      ],
    };
    const host = document.createElement("div");
    root = createRoot(host);

    act(() => {
      root?.render(<ConversationTranscript state={state} />);
    });

    const visible = host.textContent ?? "";
    expect(visible.indexOf("I stopped midway")).toBeLessThan(
      visible.indexOf("Finishing previous session"),
    );
    expect(visible.indexOf("Previous session finished.")).toBeLessThan(
      visible.indexOf("New session"),
    );
    expect(visible.indexOf("New session")).toBeLessThan(
      visible.indexOf("Welcome back to the new session."),
    );

    const hide = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Hide previous",
    );
    expect(hide?.getAttribute("aria-expanded")).toBe("true");
    act(() => hide?.click());

    expect(host.textContent).not.toContain("Previous session finished.");
    expect(host.textContent).toContain("Welcome back to the new session.");
    const show = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Show previous",
    );
    expect(show?.getAttribute("aria-expanded")).toBe("false");

    act(() => show?.click());
    expect(host.textContent).toContain("Previous session finished.");
  });
});
