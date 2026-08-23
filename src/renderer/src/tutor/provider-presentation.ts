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

/* A STATE, never an instruction. "Sign in" and "Try again" read as controls,
   which is what they looked like sitting in a card's corner beside a button
   that actually does those things. Acting is the button's job; this says only
   where the provider stands. */
export function statusLabel(provider: ProviderReadiness): string {
  if (provider.runtime.state === "not-installed") return "Not installed";
  if (provider.runtime.state === "provider-update-required") return "Update needed";
  if (provider.runtime.state === "praxeum-update-required") return "Compatibility issue";
  if (provider.runtime.state === "temporarily-unavailable") return "Unavailable";
  if (provider.connection === "connected") return provider.planLabel ?? "Connected";
  if (provider.connection === "signed-out") return "Not signed in";
  return "Unavailable";
}

/** The line under a provider's name on the gate: whose account teaches on this
 * tutor, or — when there is no account to name — where it stands. One slot and
 * one fact, so a card no longer carries an account line AND a status word AND
 * a coloured dot all answering the same question. */
export function providerStanding(provider: ProviderReadiness): string {
  if (provider.connection !== "connected") return statusLabel(provider);
  const facts = [provider.accountLabel, provider.planLabel].filter(
    (value): value is string => value !== null,
  );
  return facts.length === 0 ? "Connected" : facts.join(" · ");
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

/** The sentence a card spends its one paragraph on.
 *
 * The card already names the tutor, states where it stands, and offers the one
 * action that moves it. So the paragraph says what this tutor IS — except when
 * the action on offer cannot repair the state, which is the one case where the
 * learner has to be told something the card does not otherwise contain (a
 * version that will never work with this build, and the two ways out of it).
 *
 * Printing both, which is what "description then detail" did, is how a
 * not-installed card came to say "not installed" three times: once in the
 * standing, once in the sentence, and once on the button. */
export function providerLine(provider: ProviderReadiness): string {
  if (providerPrimaryAction(provider).kind !== "refresh") return provider.description;
  return provider.detail ?? provider.description;
}
