import { describe, expect, it } from "vitest";
import {
  createRefreshingTutorProvider,
  TutorProviderRegistry,
} from "../src/main/provider/registry";
import type {
  ProviderLoginReply,
  ProviderReadiness,
  TutorProvider,
  TutorProviderId,
} from "../src/shared/provider";
import type { TutorAgent } from "../src/shared/seminar";

function provider(id: TutorProviderId, overrides: Partial<TutorProvider> = {}): TutorProvider {
  const readiness: ProviderReadiness = {
    id,
    label: id === "claude" ? "Claude Code" : "Codex",
    description: "Use an existing subscription.",
    runtime: { state: "ready", version: "1.0.0" },
    connection: "connected",
    accountLabel: "Learner",
    planLabel: null,
    usage: null,
    canLogin: true,
    detail: null,
  };
  const login: ProviderLoginReply = { ok: true, readiness };
  return {
    id,
    label: readiness.label,
    describeReadiness: async () => readiness,
    beginLogin: async () => login,
    cancelLogin: () => undefined,
    openSetupGuide: async () => undefined,
    createAgent: () => ({ providerId: id }) as TutorAgent,
    ...overrides,
  };
}

function selection(initial: TutorProviderId | null = null) {
  let selected = initial;
  return {
    store: {
      read: (): TutorProviderId | null => selected,
      write: (providerId: TutorProviderId): void => {
        selected = providerId;
      },
    },
    value: (): TutorProviderId | null => selected,
  };
}

describe("TutorProviderRegistry", () => {
  it("uses the only registered provider without inventing a persisted choice", () => {
    const chosen = selection();
    const registry = new TutorProviderRegistry([provider("claude")], chosen.store);

    expect(registry.selectedProviderId()).toBe("claude");
    expect(registry.createSelectedAgent().providerId).toBe("claude");
    expect(chosen.value()).toBeNull();
  });

  it("persists an explicit choice and creates only that provider's agent", () => {
    const chosen = selection("claude");
    const registry = new TutorProviderRegistry(
      [provider("claude"), provider("codex")],
      chosen.store,
    );

    registry.select("codex");

    expect(chosen.value()).toBe("codex");
    expect(registry.createSelectedAgent().providerId).toBe("codex");
  });

  it("normalizes a failed probe instead of leaking its error", async () => {
    const chosen = selection("claude");
    const registry = new TutorProviderRegistry(
      [
        provider("claude", {
          describeReadiness: async () => {
            throw new Error("C:\\Users\\learner\\.claude\\credentials.json contains token");
          },
        }),
      ],
      chosen.store,
    );

    await expect(registry.catalog()).resolves.toEqual({
      selectedProviderId: "claude",
      providers: [
        {
          id: "claude",
          label: "Claude Code",
          description: "Use this tutor with your existing provider account.",
          runtime: { state: "temporarily-unavailable", version: null },
          connection: "unavailable",
          accountLabel: null,
          planLabel: null,
          usage: null,
          canLogin: false,
          detail: "Claude Code could not be checked.",
        },
      ],
    });
  });

  it("rejects unknown selections", () => {
    const chosen = selection();
    const registry = new TutorProviderRegistry([provider("claude")], chosen.store);

    expect(() => registry.select("codex")).toThrow("That tutor is not available.");
  });
});

describe("createRefreshingTutorProvider", () => {
  it("re-discovers an installation between readiness checks and before session creation", async () => {
    let installed = false;
    let loads = 0;
    const refreshing = createRefreshingTutorProvider({
      id: "codex",
      label: "Codex",
      load: () => {
        loads += 1;
        return provider("codex", {
          describeReadiness: async () => ({
            ...(await provider("codex").describeReadiness()),
            runtime: installed
              ? { state: "ready", version: "0.144.6" }
              : { state: "not-installed", version: null },
            connection: installed ? "connected" : "unavailable",
            canLogin: installed,
          }),
          createAgent: () => {
            if (!installed) throw new Error("Codex is not installed.");
            return { providerId: "codex" } as TutorAgent;
          },
        });
      },
    });
    const chosen = selection("codex");
    const registry = new TutorProviderRegistry([refreshing], chosen.store);

    expect((await registry.catalog()).providers[0]?.runtime.state).toBe("not-installed");
    installed = true;
    expect((await registry.catalog()).providers[0]?.runtime.state).toBe("ready");
    expect(registry.createSelectedAgent().providerId).toBe("codex");
    expect(loads).toBe(3);
  });

  it("keeps cancellation bound to the provider that owns an active login", async () => {
    const readiness = await provider("codex").describeReadiness();
    let loads = 0;
    let cancelCalls = 0;
    let finishLogin: (reply: ProviderLoginReply) => void = () => undefined;
    const loginCompletion = new Promise<ProviderLoginReply>((resolve) => {
      finishLogin = resolve;
    });
    const refreshing = createRefreshingTutorProvider({
      id: "codex",
      label: "Codex",
      load: () => {
        loads += 1;
        if (loads !== 1) return provider("codex");
        return provider("codex", {
          beginLogin: async () => await loginCompletion,
          cancelLogin: () => {
            cancelCalls += 1;
            finishLogin({
              ok: false,
              reason: "cancelled",
              detail: "Codex sign-in was cancelled.",
              readiness,
            });
          },
        });
      },
    });

    const login = refreshing.beginLogin();
    await refreshing.describeReadiness();
    refreshing.cancelLogin();

    await expect(login).resolves.toMatchObject({ ok: false, reason: "cancelled" });
    expect(loads).toBe(2);
    expect(cancelCalls).toBe(1);
  });
});
