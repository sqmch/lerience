import type {
  ProviderCatalog,
  ProviderLoginReply,
  ProviderReadiness,
  TutorProvider,
  TutorProviderId,
} from "../../shared/provider";
import type { TutorAgent } from "../../shared/seminar";

export interface ProviderSelectionStore {
  read(): TutorProviderId | null;
  write(providerId: TutorProviderId): void;
}

/** The single provider branching point. Everything downstream receives the
 * ordinary TutorAgent seam (ADR-004/021). */
export class TutorProviderRegistry {
  private readonly providers: ReadonlyMap<TutorProviderId, TutorProvider>;

  constructor(
    providers: TutorProvider[],
    private readonly selection: ProviderSelectionStore,
  ) {
    const entries = providers.map((provider) => [provider.id, provider] as const);
    if (new Set(entries.map(([id]) => id)).size !== entries.length) {
      throw new Error("A tutor provider was registered more than once.");
    }
    this.providers = new Map(entries);
  }

  async catalog(): Promise<ProviderCatalog> {
    const readiness = await Promise.all(
      [...this.providers.values()].map((provider) => this.safeReadiness(provider)),
    );
    return {
      selectedProviderId: this.selectedProviderId(),
      providers: readiness,
    };
  }

  selectedProviderId(): TutorProviderId | null {
    const stored = this.selection.read();
    if (stored !== null && this.providers.has(stored)) return stored;
    return this.providers.size === 1 ? (this.providers.keys().next().value ?? null) : null;
  }

  select(providerId: TutorProviderId): void {
    if (!this.providers.has(providerId)) throw new Error("That tutor is not available.");
    this.selection.write(providerId);
  }

  async beginLogin(providerId: TutorProviderId): Promise<ProviderLoginReply> {
    return await this.requireProvider(providerId).beginLogin();
  }

  cancelLogin(providerId: TutorProviderId): void {
    this.requireProvider(providerId).cancelLogin();
  }

  async openSetupGuide(providerId: TutorProviderId): Promise<void> {
    await this.requireProvider(providerId).openSetupGuide();
  }

  createSelectedAgent(): TutorAgent {
    const selected = this.selectedProviderId();
    if (selected === null) throw new Error("Choose a tutor before starting this session.");
    return this.requireProvider(selected).createAgent();
  }

  private requireProvider(providerId: TutorProviderId): TutorProvider {
    const provider = this.providers.get(providerId);
    if (provider === undefined) throw new Error("That tutor is not available.");
    return provider;
  }

  private async safeReadiness(provider: TutorProvider): Promise<ProviderReadiness> {
    try {
      return await provider.describeReadiness();
    } catch {
      return {
        id: provider.id,
        label: provider.label,
        description: "Use this tutor with your existing provider account.",
        runtime: { state: "temporarily-unavailable", version: null },
        connection: "unavailable",
        accountLabel: null,
        planLabel: null,
        usage: null,
        canLogin: false,
        detail: `${provider.label} could not be checked.`,
      };
    }
  }
}
