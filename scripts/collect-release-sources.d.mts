export interface ReleaseSourceEntry {
  component: string;
  version: string;
  revision: string;
  fileName: string;
  url: string;
  bytes: number;
  sha256: string;
}

export interface ReleaseSourceLedger {
  schemaVersion: 1;
  sources: ReleaseSourceEntry[];
}

export function assertLedger(ledger: unknown): asserts ledger is ReleaseSourceLedger;

export function collectReleaseSources(options: {
  ledgerPath?: string;
  output: string;
  fetcher?: typeof fetch;
}): Promise<{ outputDirectory: string; ledger: ReleaseSourceLedger }>;
