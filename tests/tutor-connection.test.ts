import { describe, expect, it } from "vitest";
import { selectedReadiness } from "../src/renderer/src/tutor/use-tutor-connection";
import {
  isReady,
  needsRepair,
  providerLine,
  providerPrimaryAction,
  providerSecondaryAction,
  providerStanding,
  statusLabel,
} from "../src/renderer/src/tutor/provider-presentation";
import type { ProviderCatalog, ProviderReadiness } from "../src/shared/provider";

const catalog: ProviderCatalog = {
  selectedProviderId: "codex",
  providers: [
    {
      id: "claude",
      label: "Claude Code",
      description: "Claude",
      runtime: { state: "ready", version: "2.1.223" },
      connection: "connected",
      accountLabel: null,
      planLabel: null,
      usage: null,
      canLogin: true,
      detail: null,
    },
    {
      id: "codex",
      label: "Codex",
      description: "Codex",
      runtime: { state: "ready", version: "0.144.6" },
      connection: "signed-out",
      accountLabel: null,
      planLabel: null,
      usage: null,
      canLogin: true,
      detail: null,
    },
  ],
};

describe("selectedReadiness", () => {
  it("returns the explicitly selected provider rather than the first connected one", () => {
    expect(selectedReadiness(catalog)?.id).toBe("codex");
  });

  it("fails closed when the selected provider is not in the available catalog", () => {
    expect(
      selectedReadiness({ ...catalog, selectedProviderId: "claude", providers: [] }),
    ).toBeNull();
  });
});

describe("provider readiness actions", () => {
  it("routes install and compatibility states without offering sign-in", () => {
    const installed = catalog.providers[0]!;
    const missing = {
      ...installed,
      runtime: { state: "not-installed", version: null } as const,
      connection: "unavailable" as const,
      canLogin: false,
    };
    const newer = {
      ...missing,
      runtime: { state: "praxeum-update-required", version: "3.0.0" } as const,
    };

    expect(providerPrimaryAction(missing)).toEqual({
      kind: "guide",
      label: "Install Claude Code",
    });
    expect(providerSecondaryAction(missing)).toEqual({ kind: "refresh", label: "Check again" });
    expect(statusLabel(missing)).toBe("Not installed");
    expect(providerPrimaryAction(newer)).toEqual({ kind: "refresh", label: "Check again" });
    expect(providerSecondaryAction(newer)).toBeNull();
    expect(statusLabel(newer)).toBe("Compatibility issue");
  });
});

/* The gate gives a provider one line for where it stands and one for what it
   is. Both were assembled at the call site out of four optional fields, which
   is how a signed-out card came to print the same subscription sentence twice
   and a connected one to state its account in two places. */
describe("what a provider card says about itself", () => {
  const connected = catalog.providers[0]!;

  it("names the account and plan when there is one, and the state when there is not", () => {
    expect(
      providerStanding({
        ...connected,
        accountLabel: "learner@example.invalid",
        planLabel: "Claude Max",
      }),
    ).toBe("learner@example.invalid · Claude Max");
    expect(providerStanding(connected)).toBe("Connected");
    expect(providerStanding({ ...connected, planLabel: "Claude Pro" })).toBe("Claude Pro");
    expect(providerStanding(catalog.providers[1]!)).toBe("Not signed in");
  });

  /* A status is a state, not a control. "Sign in" and "Try again" sat beside
     buttons that did exactly those things, which read as a second control. */
  it("states a status rather than instructing", () => {
    expect(statusLabel(catalog.providers[1]!)).toBe("Not signed in");
    expect(
      statusLabel({ ...connected, runtime: { state: "temporarily-unavailable", version: null } }),
    ).toBe("Unavailable");
  });

  /* The paragraph is the tutor's description everywhere the card's own button
     repairs the state — otherwise the card says "not installed" in the
     standing, in the sentence and on the button. It gives the paragraph up to
     the provider's own words only where checking again is all that is on
     offer, which is the state no button on this card can fix. */
  it("describes the tutor unless its action cannot repair the state", () => {
    expect(providerLine(catalog.providers[1]!)).toBe("Codex");
    expect(
      providerLine({
        ...connected,
        runtime: { state: "not-installed", version: null },
        detail: "Claude Code is not installed yet.",
      }),
    ).toBe("Claude");
    expect(
      providerLine({
        ...connected,
        runtime: { state: "praxeum-update-required", version: "3.0.0" },
        detail: "Claude Code 3.0.0 is not compatible with this build.",
      }),
    ).toBe("Claude Code 3.0.0 is not compatible with this build.");
  });
});

/* The two predicates the surfaces spend colour and emphasis on. They were the
   same four-clause condition inlined at three call sites, which is how the
   provider card came to paint an amber dot beside a status word set in the
   peripheral ink — the dot had the condition and the word did not. */
describe("provider readiness predicates", () => {
  const connected = catalog.providers[0]!;

  const withRuntime = (state: ProviderReadiness["runtime"]["state"]): ProviderReadiness => ({
    ...connected,
    runtime: { state, version: null },
  });

  it("treats every state the learner can repair as one that earns colour", () => {
    expect(needsRepair({ ...connected, connection: "signed-out" })).toBe(true);
    expect(needsRepair(withRuntime("not-installed"))).toBe(true);
    expect(needsRepair(withRuntime("provider-update-required"))).toBe(true);
    expect(needsRepair(withRuntime("praxeum-update-required"))).toBe(true);
  });

  it("does not mark a working tutor, or one the learner cannot act on, for repair", () => {
    expect(needsRepair(connected)).toBe(false);
    expect(needsRepair(withRuntime("temporarily-unavailable"))).toBe(false);
    expect(needsRepair({ ...connected, connection: "unavailable" })).toBe(false);
  });

  it("requires both halves before a provider counts as ready to teach", () => {
    expect(isReady(connected)).toBe(true);
    expect(isReady({ ...connected, connection: "signed-out" })).toBe(false);
    // Authenticated but incompatible: a session started here would not run.
    expect(isReady(withRuntime("provider-update-required"))).toBe(false);
  });
});
