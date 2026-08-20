// @vitest-environment jsdom

import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PraxeumApi } from "../../../shared/ipc";
import type { ProviderCatalog } from "../../../shared/provider";
import { useTutorConnection, type TutorConnectionController } from "./use-tutor-connection";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const missing: ProviderCatalog = {
  selectedProviderId: "codex",
  providers: [
    {
      id: "codex",
      label: "Codex",
      description: "Use ChatGPT through Codex.",
      runtime: { state: "not-installed", version: null },
      connection: "unavailable",
      accountLabel: null,
      planLabel: null,
      usage: null,
      canLogin: false,
      detail: "Codex is not installed yet.",
    },
  ],
};

const connected: ProviderCatalog = {
  selectedProviderId: "codex",
  providers: [
    {
      ...missing.providers[0]!,
      runtime: { state: "ready", version: "0.144.6" },
      connection: "connected",
      canLogin: true,
      detail: null,
    },
  ],
};

let root: Root | null = null;

afterEach(() => {
  if (root !== null) {
    act(() => root?.unmount());
    root = null;
  }
});

describe("useTutorConnection", () => {
  it("automatically rechecks providers when the learner returns to Lerience", async () => {
    const listTutorProviders = vi.fn().mockResolvedValueOnce(missing).mockResolvedValue(connected);
    Object.defineProperty(window, "praxeum", {
      configurable: true,
      value: { listTutorProviders } as unknown as PraxeumApi,
    });

    const observed: { current: TutorConnectionController | null } = { current: null };
    function Probe(): null {
      const controller = useTutorConnection();
      useEffect(() => {
        observed.current = controller;
      }, [controller]);
      return null;
    }

    root = createRoot(document.createElement("div"));
    await act(async () => root?.render(<Probe />));
    await vi.waitFor(() => expect(observed.current?.catalog).toEqual(missing));

    await act(async () => window.dispatchEvent(new Event("focus")));

    await vi.waitFor(() => expect(observed.current?.catalog).toEqual(connected));
    expect(listTutorProviders).toHaveBeenCalledTimes(2);

    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(listTutorProviders).toHaveBeenCalledTimes(2);
  });
});
