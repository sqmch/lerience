// @vitest-environment jsdom

import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PraxeumApi } from "../../../shared/ipc";
import type { AgentEvent, SessionControls } from "../../../shared/seminar";
import type { SeminarSnapshot } from "../../../shared/session";
import { useSeminar, type SeminarController } from "./use-seminar";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const controls: SessionControls = {
  models: [{ id: "codex", label: "Codex", efforts: ["high", "xhigh"] }],
  autonomy: [{ id: "on-request", label: "Decide for me", description: "asks as needed" }],
  current: { model: "codex", effort: "xhigh", autonomy: "on-request" },
};

let root: Root | null = null;

afterEach(() => {
  if (root !== null) {
    act(() => root?.unmount());
    root = null;
  }
});

describe("useSeminar session controls", () => {
  it("keeps an IPC rejection local and preserves the confirmed controls", async () => {
    const setSeminarControls = vi.fn(async () => {
      throw new Error("Error invoking remote method: Codex rejected the request.");
    });
    const bridge = {
      currentSeminar: async () => ({
        lifecycle: "open" as const,
        sessionId: "session-1",
        messages: [],
        totalCostUsd: 0,
        turnInProgress: false,
      }),
      seminarControls: async () => controls,
      setSeminarControls,
      onSeminarEvent: () => () => undefined,
      onSeminarSnapshot: () => () => undefined,
    } as unknown as PraxeumApi;
    Object.defineProperty(window, "praxeum", { configurable: true, value: bridge });

    const observed: { current: SeminarController | null } = { current: null };
    const seminar = (): SeminarController => {
      if (observed.current === null) throw new Error("Seminar hook has not rendered.");
      return observed.current;
    };
    function Probe(): null {
      const controller = useSeminar({ currentModuleId: null, autoStart: false });
      useEffect(() => {
        observed.current = controller;
      }, [controller]);
      return null;
    }

    const host = document.createElement("div");
    root = createRoot(host);
    await act(async () => {
      root?.render(<Probe />);
    });
    await vi.waitFor(() => expect(seminar().controls).toEqual(controls));

    await act(async () => {
      await seminar().setControls({ effort: "high" });
    });

    expect(setSeminarControls).toHaveBeenCalledWith({ effort: "high" });
    expect(seminar().controls).toEqual(controls);
    expect(seminar().state.failure).toBeNull();
    expect(seminar().state.phase).toBe("idle");
    expect(seminar().state.controlNotice).toEqual({
      kind: "error",
      message:
        "That change didn't apply. Your tutor is still connected, and your previous settings are still active.",
    });
  });

  it("queues a message while recovery hands off to the fresh opener", async () => {
    let eventListener: ((event: AgentEvent) => void) | null = null;
    let snapshotListener: ((snapshot: SeminarSnapshot) => void) | null = null;
    const sendSeminarMessage = vi.fn(async () => undefined);
    const bridge = {
      currentSeminar: async () => ({
        lifecycle: "recoverable" as const,
        sessionId: "session-old",
        messages: [
          {
            id: "tutor-2",
            role: "tutor" as const,
            content: "Last time",
            partial: false,
          },
        ],
        totalCostUsd: 0.2,
        turnInProgress: false,
      }),
      startSeminar: async () => ({ ok: true as const }),
      sendSeminarMessage,
      seminarControls: async () => null,
      onSeminarEvent: (listener: (event: AgentEvent) => void) => {
        eventListener = listener;
        return () => undefined;
      },
      onSeminarSnapshot: (listener: (snapshot: SeminarSnapshot) => void) => {
        snapshotListener = listener;
        return () => undefined;
      },
    } as unknown as PraxeumApi;
    Object.defineProperty(window, "praxeum", { configurable: true, value: bridge });

    const observed: { current: SeminarController | null } = { current: null };
    const seminar = (): SeminarController => {
      if (observed.current === null) throw new Error("Seminar hook has not rendered.");
      return observed.current;
    };
    function Probe(): null {
      const controller = useSeminar({ currentModuleId: null, autoStart: false });
      useEffect(() => {
        observed.current = controller;
      }, [controller]);
      return null;
    }

    const host = document.createElement("div");
    root = createRoot(host);
    await act(async () => {
      root?.render(<Probe />);
    });
    await vi.waitFor(() => expect(seminar().recoveryPending).toBe(true));

    await act(async () => {
      await seminar().start();
      snapshotListener?.({
        lifecycle: "recovering",
        sessionId: "session-old",
        messages: [
          {
            id: "tutor-2",
            role: "tutor",
            content: "Last time",
            partial: false,
          },
        ],
        totalCostUsd: 0.2,
        turnInProgress: true,
      });
      eventListener?.({ type: "message_delta", delta: "Wrapped up" });
      eventListener?.({ type: "turn_complete" });
      snapshotListener?.({
        lifecycle: "closed",
        sessionId: "session-old",
        messages: [
          {
            id: "tutor-2",
            role: "tutor",
            content: "Last time",
            partial: false,
          },
          {
            id: "tutor-5",
            role: "tutor",
            content: "Wrapped up",
            partial: false,
          },
        ],
        totalCostUsd: 0.2,
        turnInProgress: false,
      });
      snapshotListener?.({
        lifecycle: "open",
        sessionId: "session-new",
        messages: [],
        totalCostUsd: 0,
        turnInProgress: true,
      });
    });

    await act(async () => {
      await seminar().send("I have a question");
    });

    expect(seminar().state.phase).toBe("thinking");
    expect(seminar().queued).toBe("I have a question");
    expect(sendSeminarMessage).not.toHaveBeenCalled();

    await act(async () => {
      eventListener?.({ type: "turn_complete" });
    });
    await vi.waitFor(() => expect(sendSeminarMessage).toHaveBeenCalledWith("I have a question"));
    expect(seminar().queued).toBeNull();
  });
});
