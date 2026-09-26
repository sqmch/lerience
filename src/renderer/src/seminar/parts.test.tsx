// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { SessionControls } from "../../../shared/seminar";
import {
  ApprovalCard,
  BackgroundActivity,
  ConversationTranscript,
  LimitNotice,
  SessionControlBar,
} from "./parts";
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

describe("SessionControlBar", () => {
  const controls: SessionControls = {
    models: [{ id: "fixture", label: "Fixture model", efforts: ["low", "high"] }],
    autonomy: [
      { id: "never", label: "Never ask", description: "No approval prompts" },
      { id: "on-request", label: "Decide for me", description: "Ask when needed" },
    ],
    access: [
      { id: "danger-full-access", label: "Full access", description: "Outside the course too" },
      { id: "workspace-write", label: "Course folder", description: "Within the course" },
    ],
    current: { model: "fixture", effort: "high", autonomy: "never", access: "danger-full-access" },
    remembered: ["model", "effort", "autonomy", "access"],
  };

  it.each([
    ["xhigh", "Extra high effort"],
    ["ultra", "Ultra effort"],
    ["future-effort", "future-effort effort"],
  ])("shows provider effort %s without losing its identity", (effort, label) => {
    const host = document.createElement("div");
    root = createRoot(host);
    act(() =>
      root?.render(
        <SessionControlBar
          controls={{ ...controls, current: { ...controls.current, effort } }}
          onChange={() => undefined}
        />,
      ),
    );
    expect(host.textContent).toContain(label);
  });

  it("shows restored choices with their actual values and no restoration suffix", () => {
    const host = document.createElement("div");
    root = createRoot(host);
    act(() => root?.render(<SessionControlBar controls={controls} onChange={() => undefined} />));
    expect([...host.querySelectorAll("button")].map((button) => button.textContent)).toEqual([
      "Full access",
      "Never ask",
      "Fixture model",
      "High effort",
    ]);
  });

  it("labels only pending values as next reply, including null and unknown model values", () => {
    const host = document.createElement("div");
    root = createRoot(host);
    const render = (pending: SessionControls["pending"]): void => {
      act(() =>
        root?.render(
          <SessionControlBar controls={{ ...controls, pending }} onChange={() => undefined} />,
        ),
      );
    };
    render({ access: "workspace-write", autonomy: "on-request", effort: null });
    expect([...host.querySelectorAll("button")].map((button) => button.textContent)).toEqual([
      "Course folder · next reply",
      "Decide for me · next reply",
      "Fixture model",
      "Default effort · next reply",
    ]);
    render({ model: "provider-reported-model" });
    expect([...host.querySelectorAll("button")].map((button) => button.textContent)).toEqual([
      "Full access",
      "Never ask",
      "provider-reported-model · next reply",
    ]);
  });
});

describe("ConversationTranscript", () => {
  it("shows limit state, fractional usage mapped to percent, and the reset date", () => {
    const host = document.createElement("div");
    root = createRoot(host);
    const reset = 1_800_000_000;
    const warning = {
      type: "limit_warning" as const,
      label: "Claude model-specific weekly limit",
      usedPercent: 77,
      resetsAt: reset,
      status: "warning" as const,
    };
    act(() => root?.render(<LimitNotice warning={warning} />));
    expect(host.querySelector('[role="status"]')).not.toBeNull();
    expect(host.textContent).toContain("Approaching limit · 77% used");
    expect(host.textContent).toContain(
      new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(reset * 1000)),
    );
    expect(host.textContent).not.toContain("overage");
    act(() =>
      root?.render(<LimitNotice warning={{ ...warning, status: "rejected", usedPercent: 100 }} />),
    );
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(host.textContent).toContain("Limit reached · 100% used");
    act(() =>
      root?.render(<LimitNotice warning={{ ...warning, usedPercent: null, resetsAt: null }} />),
    );
    expect(host.textContent).toBe("Claude model-specific weekly limitApproaching limit");
  });

  it("shows running task descriptions and terminal outcomes without a Thinking timer", () => {
    const host = document.createElement("div");
    root = createRoot(host);
    const state = {
      ...createSeminarState(),
      backgroundTasks: [
        { id: "a", description: "Review lesson" },
        { id: "b", description: "Review brief" },
      ],
    };
    act(() => root?.render(<BackgroundActivity state={state} />));
    expect(host.textContent).toContain("2 background tasks running");
    expect(host.textContent).toContain("Review lesson");
    expect(host.textContent).toContain("Review brief");
    expect(host.textContent).not.toContain("Thinking");
    act(() =>
      root?.render(
        <BackgroundActivity state={{ ...state, backgroundTasks: [], taskNotice: "failed" }} />,
      ),
    );
    expect(host.textContent).toBe("Task failed");
    act(() => root?.render(<BackgroundActivity state={createSeminarState()} />));
    expect(host.textContent).toBe("");
  });

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

describe("ApprovalCard", () => {
  const approval = {
    requestId: "codex:7",
    toolName: "Shell",
    summary: "Codex wants to run a command",
    editWithinCourse: false,
  };

  it("states a command approval as the command and where it runs", () => {
    const host = document.createElement("div");
    root = createRoot(host);
    act(() => {
      root?.render(
        <ApprovalCard
          approval={{ ...approval, command: "pnpm install", cwd: "curriculum/00-x/scaffold" }}
          answering={false}
          onAnswer={() => undefined}
        />,
      );
    });
    expect(host.querySelector("pre")?.textContent).toBe("pnpm install");
    expect(host.textContent).toContain("in curriculum/00-x/scaffold");
  });

  it("names an absolute working directory as outside the course, and none as the course", () => {
    const host = document.createElement("div");
    root = createRoot(host);
    act(() => {
      root?.render(
        <ApprovalCard
          approval={{ ...approval, command: "type auth.json", cwd: "D:\\tools\\codex" }}
          answering={false}
          onAnswer={() => undefined}
        />,
      );
    });
    expect(host.textContent).toContain("outside your course, in D:\\tools\\codex");

    act(() => {
      root?.render(
        <ApprovalCard
          approval={{ ...approval, command: "pnpm test", cwd: null }}
          answering={false}
          onAnswer={() => undefined}
        />,
      );
    });
    expect(host.textContent).toContain("in your course folder");
    expect(host.textContent).not.toContain("outside");
  });
});
