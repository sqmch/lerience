import type { ProviderReadiness } from "../../../shared/provider";

export function statusLabel(provider: ProviderReadiness): string {
  if (provider.runtime.state === "not-installed") return "Not installed";
  if (provider.runtime.state === "provider-update-required") return "Update needed";
  if (provider.runtime.state === "praxeum-update-required") return "App update needed";
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
