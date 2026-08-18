import type { TutorAgent } from "./seminar";

/** Provider identity is the only provider-specific value shared beyond the
 * registry. Course, transcript, pedagogy, and message contracts never branch
 * on it (ADR-004, ADR-021). */
export type TutorProviderId = "claude" | "codex";

export type ProviderConnectionState = "connected" | "signed-out" | "unavailable";

/** Compatibility of the provider-owned executable with this Lerience build.
 * Authentication is deliberately separate: an installed, compatible provider
 * may still be signed out, while an incompatible provider must not be offered
 * a sign-in action. */
export type ProviderRuntimeState =
  | "ready"
  | "not-installed"
  | "provider-update-required"
  | "praxeum-update-required"
  | "temporarily-unavailable";

export interface ProviderRuntimeReadiness {
  state: ProviderRuntimeState;
  /** Safe semantic version parsed from the provider's public version output. */
  version: string | null;
}

/** A provider-owned rolling limit. Percent and reset are copied only from an
 * explicit status API; Lerience never estimates allowance from token counts. */
export interface ProviderUsageWindow {
  label: string;
  usedPercent: number;
  /** Unix seconds, or null when the provider does not report a reset. */
  resetsAt: number | null;
}

export interface ProviderUsage {
  windows: ProviderUsageWindow[];
}

/** Safe display facts from a provider-owned status interface. No raw payload,
 * path, stderr, environment value, or credential-shaped field may cross this
 * boundary. */
export interface ProviderReadiness {
  id: TutorProviderId;
  label: string;
  description: string;
  runtime: ProviderRuntimeReadiness;
  connection: ProviderConnectionState;
  accountLabel: string | null;
  planLabel: string | null;
  usage: ProviderUsage | null;
  canLogin: boolean;
  detail: string | null;
}

export interface ProviderCatalog {
  selectedProviderId: TutorProviderId | null;
  providers: ProviderReadiness[];
}

export type ProviderLoginReply =
  | { ok: true; readiness: ProviderReadiness }
  | {
      ok: false;
      reason: "cancelled" | "failed" | "unavailable";
      detail: string;
      readiness: ProviderReadiness;
    };

/** Main-process-only capability. The renderer receives ProviderReadiness, not
 * this object or a way to invoke provider commands directly. */
export interface TutorProvider {
  readonly id: TutorProviderId;
  readonly label: string;
  describeReadiness(): Promise<ProviderReadiness>;
  beginLogin(): Promise<ProviderLoginReply>;
  cancelLogin(): void;
  /** Open the provider's static official install/update guidance. */
  openSetupGuide(): Promise<void>;
  createAgent(): TutorAgent;
}
