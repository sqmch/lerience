import type { ProviderReadiness } from "../../../shared/provider";

/** True when the card is reporting something the learner has to REPAIR —
 * sign in, install, update. ADR-015 reserves colour for exactly that, so this
 * predicate is what every surface asks before spending any: the status dot,
 * the card's status line, and the dashboard menu's row. It lived as the same
 * four-clause condition written out three times, which is how the card came to
 * paint an amber dot beside a status word set in the peripheral ink. */
export function needsRepair(provider: ProviderReadiness): boolean {
  return (
    provider.connection === "signed-out" ||
    provider.runtime.state === "not-installed" ||
    provider.runtime.state === "provider-update-required" ||
    provider.runtime.state === "praxeum-update-required"
  );
}

export function isReady(provider: ProviderReadiness): boolean {
  return provider.connection === "connected" && provider.runtime.state === "ready";
}

export function statusLabel(provider: ProviderReadiness): string {
  if (provider.runtime.state === "not-installed") return "Not installed";
  if (provider.runtime.state === "provider-update-required") return "Update needed";
  if (provider.runtime.state === "praxeum-update-required") return "Compatibility issue";
  if (provider.runtime.state === "temporarily-unavailable") return "Try again";
  if (provider.connection === "connected") return provider.planLabel ?? "Connected";
  if (provider.connection === "signed-out") return "Sign in";
  return "Unavailable";
}

export type ProviderPrimaryAction = "select" | "login" | "guide" | "refresh";

export function providerPrimaryAction(provider: ProviderReadiness): {
  kind: ProviderPrimaryAction;
  label: string;
} {
  if (provider.runtime.state === "not-installed") {
    return { kind: "guide", label: `Install ${provider.label}` };
  }
  if (provider.runtime.state === "provider-update-required") {
    return { kind: "guide", label: `Update ${provider.label}` };
  }
  if (provider.runtime.state !== "ready" || provider.connection === "unavailable") {
    return { kind: "refresh", label: "Check again" };
  }
  if (provider.connection === "signed-out") {
    return { kind: "login", label: `Sign in to ${provider.label}` };
  }
  return { kind: "select", label: `Use ${provider.label}` };
}

export function providerSecondaryAction(provider: ProviderReadiness): {
  kind: "refresh";
  label: string;
} | null {
  return providerPrimaryAction(provider).kind === "guide"
    ? { kind: "refresh", label: "Check again" }
    : null;
}
