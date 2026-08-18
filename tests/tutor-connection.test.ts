import { describe, expect, it } from "vitest";
import { selectedReadiness } from "../src/renderer/src/tutor/use-tutor-connection";
import {
  providerPrimaryAction,
  statusLabel,
} from "../src/renderer/src/tutor/provider-presentation";
import type { ProviderCatalog } from "../src/shared/provider";

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
    expect(statusLabel(missing)).toBe("Not installed");
    expect(providerPrimaryAction(newer)).toEqual({ kind: "refresh", label: "Check again" });
    expect(statusLabel(newer)).toBe("App update needed");
  });
});
