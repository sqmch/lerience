// @vitest-environment jsdom

import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PraxeumApi } from "../../../shared/ipc";
import type { AgentEvent, SessionControls } from "../../../shared/seminar";
import type { SeminarSnapshot } from "../../../shared/session";
import { useSeminar, type SeminarController } from "./use-seminar";
import { ModelChoice } from "./model-choice";

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
  it("retains a rejected queue and preserves an intervening automatic turn without a retry loop", async () => {
    let listener: ((event: AgentEvent) => void) | undefined;
    let rejectSend!: (error: Error) => void;
    const sendSeminarMessage = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectSend = reject;
        }),
    );
    Object.defineProperty(window, "praxeum", {
      configurable: true,
      value: {
        currentSeminar: async () => ({
          lifecycle: "open",
          sessionId: "race",
          messages: [],
          totalCostUsd: 0,
          turnInProgress: true,
          steerable: false,
        }),
        seminarControls: async () => null,
        sendSeminarMessage,
        onSeminarEvent: (next: (event: AgentEvent) => void) => {
          listener = next;
          return () => undefined;
        },
        onSeminarSnapshot: () => () => undefined,
      },
    });
    const observed: { current: SeminarController | null } = { current: null };
    function Probe(): null {
      const controller = useSeminar({ currentModuleId: null, autoStart: false });
      useEffect(() => {
        observed.current = controller;
      }, [controller]);
      return null;
    }
    root = createRoot(document.createElement("div"));
    await act(async () => root?.render(<Probe />));
    await act(async () => {
      await observed.current?.send("Keep this question");
    });
    await act(async () => listener?.({ type: "turn_complete" }));
    expect(sendSeminarMessage).toHaveBeenCalledTimes(1);
    await act(async () => {
      listener?.({ type: "turn_started" });
      rejectSend(new Error("A tutor turn is already in progress."));
    });
    expect(observed.current?.busy).toBe(true);
    expect(observed.current?.queued).toBe("Keep this question");
    expect(observed.current?.state.items).toEqual([]);
    expect(sendSeminarMessage).toHaveBeenCalledTimes(1);
    await act(async () => listener?.({ type: "turn_complete" }));
    expect(sendSeminarMessage).toHaveBeenCalledTimes(2);
    await act(async () => rejectSend(new Error("Temporarily unavailable")));
    expect(observed.current?.queued).toBe("Keep this question");
    expect(sendSeminarMessage).toHaveBeenCalledTimes(2);
    sendSeminarMessage.mockResolvedValueOnce(undefined);
    await act(async () => observed.current?.retryQueued?.());
    expect(sendSeminarMessage).toHaveBeenCalledTimes(3);
    expect(observed.current?.queued).toBeNull();
    expect(observed.current?.state.items.map((item) => item.content)).toEqual([
      "Keep this question",
    ]);
  });
  it("queues during an automatic foreground turn and flushes once at its result, independently of background work", async () => {
    let listener: ((event: AgentEvent) => void) | undefined;
    const sendSeminarMessage = vi.fn(async () => undefined);
    const bridge = {
      currentSeminar: async () => ({
        lifecycle: "open",
        sessionId: "review",
        messages: [],
        totalCostUsd: 0,
        turnInProgress: false,
        steerable: false,
      }),
      seminarControls: async () => null,
      sendSeminarMessage,
      onSeminarEvent: (next: (event: AgentEvent) => void) => {
        listener = next;
        return () => undefined;
      },
      onSeminarSnapshot: () => () => undefined,
    } as unknown as PraxeumApi;
    Object.defineProperty(window, "praxeum", { configurable: true, value: bridge });
    const observed: { current: SeminarController | null } = { current: null };
    function Probe(): null {
      const controller = useSeminar({ currentModuleId: null, autoStart: false });
      useEffect(() => {
        observed.current = controller;
      }, [controller]);
      return null;
    }
    root = createRoot(document.createElement("div"));
    await act(async () => root?.render(<Probe />));
    await act(async () => {
      listener?.({
        type: "background_tasks",
        tasks: [{ id: "review", description: "Read lesson" }],
      });
      listener?.({ type: "turn_started" });
    });
    expect(observed.current?.busy).toBe(true);
    await act(async () => {
      await observed.current?.send("Also explain this");
    });
    expect(sendSeminarMessage).not.toHaveBeenCalled();
    expect(observed.current?.queued).toBe("Also explain this");
    await act(async () =>
      listener?.({ type: "task_notification", taskId: "other", status: "completed" }),
    );
    expect(sendSeminarMessage).not.toHaveBeenCalled();
    await act(async () => {
      listener?.({ type: "message_delta", delta: "Review conclusion" });
      listener?.({ type: "turn_complete" });
    });
    expect(sendSeminarMessage).toHaveBeenCalledExactlyOnceWith("Also explain this");
    expect(observed.current?.queued).toBeNull();
    expect(observed.current?.state.backgroundTasks).toHaveLength(1);
    await act(async () => {
      listener?.({ type: "message_delta", delta: "Explanation" });
      listener?.({ type: "turn_complete" });
      listener?.({ type: "background_tasks", tasks: [] });
    });
    expect(sendSeminarMessage).toHaveBeenCalledTimes(1);
    expect(observed.current?.busy).toBe(false);
  });

  it("refreshes pending access after a tool-only turn completes", async () => {
    let listener: ((event: AgentEvent) => void) | undefined;
    let providerControls: SessionControls = {
      ...controls,
      current: { ...controls.current, access: "workspace-write" },
      pending: { access: "danger-full-access" },
    };
    const bridge = {
      currentSeminar: async () => ({
        lifecycle: "open",
        sessionId: "tools-only",
        messages: [],
        totalCostUsd: 0,
        turnInProgress: true,
        steerable: false,
      }),
      seminarControls: async () => providerControls,
      onSeminarEvent: (next: (event: AgentEvent) => void) => {
        listener = next;
        return () => undefined;
      },
      onSeminarSnapshot: () => () => undefined,
    } as unknown as PraxeumApi;
    Object.defineProperty(window, "praxeum", { configurable: true, value: bridge });
    const observed: { current: SeminarController | null } = { current: null };
    function Probe(): null {
      const controller = useSeminar({ currentModuleId: null, autoStart: false });
      useEffect(() => {
        observed.current = controller;
      }, [controller]);
      return null;
    }
    root = createRoot(document.createElement("div"));
    await act(async () => root?.render(<Probe />));
    expect(observed.current?.controls?.pending?.access).toBe("danger-full-access");
    await act(async () =>
      listener?.({ type: "tool_activity", name: "Shell", summary: "Running a command" }),
    );
    providerControls = {
      ...controls,
      current: { ...controls.current, access: "danger-full-access" },
    };
    await act(async () => listener?.({ type: "turn_complete" }));
    expect(observed.current?.state.items).toHaveLength(0);
    expect(observed.current?.controls?.current.access).toBe("danger-full-access");
    expect(observed.current?.controls?.pending).toBeUndefined();
  });

  it.each(["rejected", "unavailable", "partly accepted"])(
    "keeps %s controls local and preserves the confirmed controls",
    async (result) => {
      let confirmed = controls;
      const setSeminarControls = vi.fn(async () => {
        if (result === "unavailable") return null;
        if (result === "partly accepted")
          confirmed = { ...controls, current: { ...controls.current, effort: null } };
        throw new Error("Error invoking remote method: Codex rejected the request.");
      });
      const bridge = {
        currentSeminar: async () => ({
          lifecycle: "open" as const,
          sessionId: "session-1",
          messages: [],
          totalCostUsd: 0,
          turnInProgress: false,
          steerable: false,
        }),
        seminarControls: async () => confirmed,
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
        expect(await seminar().setControls({ effort: "high" })).toBe(false);
      });

      expect(setSeminarControls).toHaveBeenCalledWith({ effort: "high" });
      expect(seminar().controls).toEqual(confirmed);
      expect(seminar().state.failure).toBeNull();
      expect(seminar().state.phase).toBe("idle");
      expect(seminar().state.controlNotice).toEqual({
        kind: "error",
        message:
          "That change couldn't be completed. Your tutor is still connected. Check the settings shown and try again.",
      });
    },
  );

  it.each([
    { outcome: "accepted", refuse: false },
    { outcome: "refused", refuse: true },
  ])(
    "steers a mid-turn message when the provider can take it, queueing it when $outcome fails",
    async ({ refuse }) => {
      let eventListener: ((event: AgentEvent) => void) | null = null;
      const sendSeminarMessage = vi.fn(async () => {
        if (refuse) throw new Error("expected turn is no longer active");
      });
      const bridge = {
        currentSeminar: async () => ({
          lifecycle: "open" as const,
          sessionId: "session-1",
          messages: [{ id: "tutor-1", role: "tutor" as const, content: "Working", partial: true }],
          totalCostUsd: 0,
          turnInProgress: true,
          steerable: true,
        }),
        sendSeminarMessage,
        seminarControls: async () => null,
        onSeminarEvent: (listener: (event: AgentEvent) => void) => {
          eventListener = listener;
          return () => undefined;
        },
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

      root = createRoot(document.createElement("div"));
      await act(async () => {
        root?.render(<Probe />);
      });
      await vi.waitFor(() => expect(seminar().state.steerable).toBe(true));
      expect(seminar().busy).toBe(true);

      await act(async () => {
        expect(await seminar().send("Also cover the dot product")).toBe(true);
      });
      expect(sendSeminarMessage).toHaveBeenCalledWith("Also cover the dot product");
      // The turn keeps running either way; the composer never sees a failure.
      expect(seminar().busy).toBe(true);
      expect(seminar().state.failure).toBeNull();

      if (refuse) {
        expect(seminar().queued).toBe("Also cover the dot product");
        expect(seminar().state.items.map((item) => item.role)).toEqual(["tutor"]);
        await act(async () => {
          eventListener?.({ type: "turn_complete" });
        });
        await vi.waitFor(() => expect(sendSeminarMessage).toHaveBeenCalledTimes(2));
        expect(seminar().queued).toBe("Also cover the dot product");
        expect(seminar().retryQueued).toBeTypeOf("function");
        return;
      }

      expect(seminar().queued).toBeNull();
      expect(seminar().state.items.map((item) => item.role)).toEqual(["tutor", "learner"]);
      expect(seminar().state.items[0]).toMatchObject({ content: "Working", streaming: false });
      // What the tutor says after reading it is a new bubble, in order.
      await act(async () => {
        eventListener?.({ type: "message_delta", delta: "Adding the dot product." });
      });
      expect(seminar().state.items.map((item) => item.role)).toEqual(["tutor", "learner", "tutor"]);
      expect(sendSeminarMessage).toHaveBeenCalledTimes(1);
    },
  );

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
        steerable: false,
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
        steerable: false,
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
        steerable: false,
      });
      snapshotListener?.({
        lifecycle: "open",
        sessionId: "session-new",
        messages: [],
        totalCostUsd: 0,
        turnInProgress: true,
        steerable: false,
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

describe("model preflight", () => {
  it("shows the supported choice, keeps sends closed, resets default, and starts only on confirmation", async () => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    let snapshotListener: ((snapshot: SeminarSnapshot) => void) | undefined;
    const snapshot: SeminarSnapshot = {
      lifecycle: "open",
      sessionId: "prepared",
      messages: [],
      totalCostUsd: 0,
      turnInProgress: false,
      steerable: true,
      modelChoice: { runtimeId: 7, recovery: false },
    };
    const sendSeminarMessage = vi.fn();
    const setSeminarControls = vi.fn(async () => ({ ...controls, pending: { model: null } }));
    const confirmSeminarModel = vi.fn(async () => {
      snapshotListener?.({ ...snapshot, modelChoice: undefined, turnInProgress: true });
    });
    Object.defineProperty(window, "praxeum", {
      configurable: true,
      value: {
        currentSeminar: async () => snapshot,
        seminarControls: async () => controls,
        setSeminarControls,
        confirmSeminarModel,
        sendSeminarMessage,
        onSeminarEvent: () => () => undefined,
        onSeminarSnapshot: (listener: (snapshot: SeminarSnapshot) => void) => {
          snapshotListener = listener;
          return () => undefined;
        },
      },
    });
    const observed: { current: SeminarController | null } = { current: null };
    function Probe(): React.JSX.Element {
      const seminar = useSeminar({ currentModuleId: null, autoStart: true });
      observed.current = seminar;
      return seminar.state.phase === "choosing-model" ? (
        <ModelChoice seminar={seminar} />
      ) : (
        <p>{seminar.state.phase}</p>
      );
    }
    const host = document.createElement("div");
    root = createRoot(host);
    await act(async () => root?.render(<Probe />));
    expect(host.textContent).toContain("Codex");
    expect(host.textContent).toContain("Start tutor");
    expect(observed.current?.busy).toBe(false);
    await act(async () => {
      expect(await observed.current?.send("Early question")).toBe(false);
    });
    expect(sendSeminarMessage).not.toHaveBeenCalled();
    expect(confirmSeminarModel).not.toHaveBeenCalled();
    const button = (text: string) =>
      [...host.querySelectorAll("button")].find((entry) => entry.textContent === text)!;
    await act(async () => button("Use provider default").click());
    expect(setSeminarControls).toHaveBeenCalledWith({ model: null });
    expect(host.textContent).toMatch(/Provider default.*next reply/);
    await act(async () => button("Start tutor").click());
    expect(confirmSeminarModel).toHaveBeenCalledExactlyOnceWith(7);
    expect(host.textContent).toBe("thinking");
  });
});

describe("replacement model controls", () => {
  it("keeps Start disabled from the first replacement render until matching controls resolve", async () => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    let snapshotListener: ((snapshot: SeminarSnapshot) => void) | undefined;
    let resolveControls!: (value: SessionControls) => void;
    const snapshot: SeminarSnapshot = {
      lifecycle: "open",
      sessionId: "prior",
      messages: [],
      totalCostUsd: 0,
      turnInProgress: false,
      steerable: false,
    };
    const seminarControls = vi.fn(async () => controls);
    const confirmSeminarModel = vi.fn(async () => undefined);
    Object.defineProperty(window, "praxeum", {
      configurable: true,
      value: {
        currentSeminar: async () => snapshot,
        seminarControls,
        confirmSeminarModel,
        onSeminarEvent: () => () => undefined,
        onSeminarSnapshot: (listener: (snapshot: SeminarSnapshot) => void) => {
          snapshotListener = listener;
          return () => undefined;
        },
      },
    });
    const renders: Array<{ choice?: number; model: string | null | undefined }> = [];
    const observed: { current: SeminarController | null } = { current: null };
    function Probe(): React.JSX.Element {
      const seminar = useSeminar({ currentModuleId: null, autoStart: false });
      observed.current = seminar;
      renders.push({
        choice: seminar.state.modelChoice?.runtimeId,
        model: seminar.controls?.current.model,
      });
      return seminar.state.phase === "choosing-model" ? (
        <ModelChoice seminar={seminar} />
      ) : (
        <p>{seminar.controls?.current.model}</p>
      );
    }
    const host = document.createElement("div");
    root = createRoot(host);
    await act(async () => root?.render(<Probe />));
    expect(host.textContent).toBe("codex");
    seminarControls.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveControls = resolve;
        }),
    );
    await act(async () =>
      snapshotListener?.({
        ...snapshot,
        sessionId: "replacement",
        modelChoice: { runtimeId: 8, recovery: false },
      }),
    );
    const start = () =>
      [...host.querySelectorAll("button")].find((entry) => entry.textContent === "Start tutor")!;
    expect(start().disabled).toBe(true);
    expect(
      renders.filter((render) => render.choice === 8).every((render) => render.model === undefined),
    ).toBe(true);
    await act(async () => {
      start().click();
      await observed.current?.confirmModel();
    });
    expect(confirmSeminarModel).not.toHaveBeenCalled();
    await act(async () =>
      resolveControls({
        ...controls,
        models: [{ id: "replacement-model", label: "Replacement model", efforts: [] }],
        current: { ...controls.current, model: "replacement-model" },
      }),
    );
    expect(host.textContent).toContain("Replacement model");
    expect(start().disabled).toBe(false);
    await act(async () => start().click());
    expect(confirmSeminarModel).toHaveBeenCalledExactlyOnceWith(8);
  });
});
