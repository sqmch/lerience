import { spawn } from "node:child_process";
import type {
  ProviderReadiness,
  ProviderRuntimeReadiness,
  ProviderRuntimeState,
  TutorProviderId,
} from "../../shared/provider";
import { PRODUCT_NAME } from "../../shared/product";
import { CODEX_APP_SERVER_SCHEMA_VERSION } from "./codex-app-server";
import type { InstalledProviderRuntime } from "./installed-runtime";

const OUTPUT_LIMIT = 16 * 1024;
const VERSION_TIMEOUT_MS = 5_000;
const SEMVER = /(?:^|[^0-9])(\d+)\.(\d+)\.(\d+)(?:[^0-9]|$)/u;

/** Claude's CLI/SDK contract is capability-probed and compatible within the
 * current major. Codex App Server schemas are generated per exact build, so a
 * different Codex version requires a provider or app update. */
export const PROVIDER_COMPATIBILITY = {
  claude: { minimum: "2.1.223", maximumExclusive: "3.0.0" },
  codex: { exact: CODEX_APP_SERVER_SCHEMA_VERSION },
} as const;

export interface VersionCommandResult {
  exitCode: number | null;
  stdout: string;
  missing: boolean;
  timedOut: boolean;
}

export type VersionCommandRunner = (
  executable: string,
  environment?: Readonly<Record<string, string>>,
) => Promise<VersionCommandResult>;

export type ProviderRuntimeProbe = () => Promise<ProviderRuntimeReadiness>;

/** Convert an incompatible executable into the complete safe readiness shape.
 * Providers call this before any auth or session operation. */
export function readinessForRuntime(
  provider: { id: TutorProviderId; label: string; description: string },
  runtime: ProviderRuntimeReadiness,
): ProviderReadiness | null {
  if (runtime.state === "ready") return null;
  const versionSuffix = runtime.version === null ? "" : ` ${runtime.version}`;
  const detail: Record<Exclude<ProviderRuntimeState, "ready">, string> = {
    "not-installed": `${provider.label} is not installed yet. Open the official setup guide, then check again.`,
    "provider-update-required": `The installed ${provider.label}${versionSuffix} is too old for this ${PRODUCT_NAME} build. Update it from the official guide, then check again.`,
    "praxeum-update-required": `The installed ${provider.label}${versionSuffix} uses a newer connection contract. Update ${PRODUCT_NAME}, then check again.`,
    "temporarily-unavailable": `${provider.label} could not be reached just now. Check again in a moment.`,
  };
  return {
    id: provider.id,
    label: provider.label,
    description: provider.description,
    runtime,
    connection: "unavailable",
    accountLabel: null,
    planLabel: null,
    usage: null,
    canLogin: false,
    detail: detail[runtime.state],
  };
}

export function createProviderRuntimeProbe(
  runtime: InstalledProviderRuntime,
  environment?: Readonly<Record<string, string>>,
  runVersion: VersionCommandRunner = runVersionCommand,
): ProviderRuntimeProbe {
  return async () => {
    if (runtime.executablePath === null) return { state: "not-installed", version: null };

    let result: VersionCommandResult;
    try {
      result = await runVersion(runtime.executablePath, environment);
    } catch {
      return { state: "temporarily-unavailable", version: null };
    }
    if (result.missing) return { state: "not-installed", version: null };
    if (result.timedOut || result.exitCode !== 0) {
      return { state: "temporarily-unavailable", version: null };
    }

    const version = parseProviderVersion(result.stdout);
    if (version === null) return { state: "praxeum-update-required", version: null };
    return { state: compatibilityState(runtime.providerId, version), version };
  };
}

export function parseProviderVersion(source: string): string | null {
  const match = SEMVER.exec(source.trim());
  if (match?.[1] === undefined || match[2] === undefined || match[3] === undefined) return null;
  return `${match[1]}.${match[2]}.${match[3]}`;
}

export function compatibilityState(
  providerId: TutorProviderId,
  version: string,
): ProviderRuntimeState {
  const parsed = semanticVersion(version);
  if (parsed === null) return "praxeum-update-required";

  if (providerId === "codex") {
    const exact = semanticVersion(PROVIDER_COMPATIBILITY.codex.exact);
    if (exact === null) return "praxeum-update-required";
    const compared = compareVersions(parsed, exact);
    return compared < 0
      ? "provider-update-required"
      : compared > 0
        ? "praxeum-update-required"
        : "ready";
  }

  const minimum = semanticVersion(PROVIDER_COMPATIBILITY.claude.minimum);
  const maximum = semanticVersion(PROVIDER_COMPATIBILITY.claude.maximumExclusive);
  if (minimum === null || maximum === null) return "praxeum-update-required";
  if (compareVersions(parsed, minimum) < 0) return "provider-update-required";
  if (compareVersions(parsed, maximum) >= 0) return "praxeum-update-required";
  return "ready";
}

function runVersionCommand(
  executable: string,
  environment?: Readonly<Record<string, string>>,
): Promise<VersionCommandResult> {
  return new Promise((resolve) => {
    const child = spawn(executable, ["--version"], {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      ...(environment === undefined ? {} : { env: environment }),
    });
    let stdout = "";
    let settled = false;
    let timedOut = false;
    const settle = (result: VersionCommandResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, VERSION_TIMEOUT_MS);
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      if (stdout.length < OUTPUT_LIMIT) stdout += chunk.slice(0, OUTPUT_LIMIT - stdout.length);
    });
    child.stderr?.resume();
    child.once("error", (error) => {
      settle({
        exitCode: null,
        stdout,
        missing: "code" in error && error.code === "ENOENT",
        timedOut: false,
      });
    });
    child.once("close", (exitCode) => {
      settle({ exitCode, stdout, missing: false, timedOut });
    });
  });
}

type SemanticVersion = readonly [number, number, number];

function semanticVersion(value: string): SemanticVersion | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(value);
  if (match?.[1] === undefined || match[2] === undefined || match[3] === undefined) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersions(left: SemanticVersion, right: SemanticVersion): number {
  for (let index = 0; index < left.length; index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}
