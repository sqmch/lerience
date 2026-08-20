export function assembleRuntime(options: {
  platform: string;
  architecture: string;
  targetKey: string;
  ledger: Record<string, unknown>;
  sources: Record<string, unknown>;
  outputRoot: string;
}): Promise<void>;

export function copyNpmTree(source: string, destination: string): Promise<void>;

export function normalizeRuntimeFileMode(mode: number, platform?: NodeJS.Platform): number;
