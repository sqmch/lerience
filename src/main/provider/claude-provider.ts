import { spawn } from "node:child_process";
import { PRODUCT_NAME } from "../../shared/product";
import type { ProviderLoginReply, ProviderReadiness, TutorProvider } from "../../shared/provider";
import type { TutorAgent } from "../../shared/seminar";
import { readinessForRuntime, type ProviderRuntimeProbe } from "./compatibility";

const OUTPUT_LIMIT = 64 * 1024;
const STATUS_TIMEOUT_MS = 8_000;
const LOGIN_TIMEOUT_MS = 10 * 60_000;
const DESCRIPTION = "Use the Claude subscription already connected to Claude Code.";
const CLAUDE_SETUP_GUIDE = "https://code.claude.com/docs/en/installation";

export interface ProviderCommandResult {
  exitCode: number | null;
  stdout: string;
  missing: boolean;
  timedOut: boolean;
  cancelled: boolean;
}

export type ProviderCommandRunner = (
  args: string[],
  options: { timeoutMs: number; signal?: AbortSignal },
) => Promise<ProviderCommandResult>;

/** Runs only the fixed argv supplied by a provider adapter. stderr is drained
 * and discarded, stdout is bounded, and no shell participates. */
function runClaudeExecutable(
  executable: string,
  args: string[],
  { timeoutMs, signal }: { timeoutMs: number; signal?: AbortSignal },
  environment?: Readonly<Record<string, string>>,
): Promise<ProviderCommandResult> {
  return new Promise((resolve) => {
    const child = spawn(executable, args, {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      ...(environment === undefined ? {} : { env: environment }),
    });
    let stdout = "";
    let settled = false;
    let timedOut = false;
    let cancelled = false;

    const settle = (result: ProviderCommandResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      resolve(result);
    };
    const abort = (): void => {
      cancelled = true;
      child.kill();
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      if (stdout.length < OUTPUT_LIMIT) stdout += chunk.slice(0, OUTPUT_LIMIT - stdout.length);
    });
    // Required to prevent a blocked child, deliberately never logged or kept.
    child.stderr?.resume();
    child.once("error", (error) => {
      const missing = "code" in error && error.code === "ENOENT";
      settle({ exitCode: null, stdout, missing, timedOut: false, cancelled });
    });
    child.once("close", (exitCode) => {
      settle({ exitCode, stdout, missing: false, timedOut, cancelled });
    });
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted === true) abort();
  });
}

export function createClaudeCommandRunner(
  executable: string,
  environment?: Readonly<Record<string, string>>,
): ProviderCommandRunner {
  return (args, options) => runClaudeExecutable(executable, args, options, environment);
}

export const runClaudeCommand = createClaudeCommandRunner("claude");

interface ClaudeAuthStatus {
  loggedIn: boolean;
  email: string | null;
  subscriptionType: string | null;
}

function parseStatus(source: string): ClaudeAuthStatus | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  if (typeof record.loggedIn !== "boolean") return null;
  return {
    loggedIn: record.loggedIn,
    email:
      typeof record.email === "string" && /^[^\s@]+@[^\s@]+$/.test(record.email)
        ? record.email
        : null,
    subscriptionType: typeof record.subscriptionType === "string" ? record.subscriptionType : null,
  };
}

function planLabel(value: string | null): string | null {
  switch (value?.toLowerCase()) {
    case "pro":
      return "Claude Pro";
    case "max":
      return "Claude Max";
    case "team":
      return "Claude Team";
    case "enterprise":
      return "Claude Enterprise";
    default:
      return null;
  }
}

function unavailable(
  detail: string,
  runtime: ProviderReadiness["runtime"],
  canLogin = false,
): ProviderReadiness {
  return {
    id: "claude",
    label: "Claude Code",
    description: DESCRIPTION,
    runtime,
    connection: "unavailable",
    accountLabel: null,
    planLabel: null,
    usage: null,
    canLogin,
    detail,
  };
}

type OpenExternal = (url: string) => Promise<unknown>;

export interface ClaudeTutorProviderOptions {
  runtimeProbe: ProviderRuntimeProbe;
  command: ProviderCommandRunner | null;
  agent: TutorAgent | null;
  openExternal: OpenExternal;
}

export class ClaudeTutorProvider implements TutorProvider {
  readonly id = "claude" as const;
  readonly label = "Claude Code";
  private loginAbort: AbortController | null = null;

  constructor(private readonly options: ClaudeTutorProviderOptions) {}

  async describeReadiness(): Promise<ProviderReadiness> {
    const runtime = await this.options.runtimeProbe();
    const blocked = readinessForRuntime(
      { id: this.id, label: this.label, description: DESCRIPTION },
      runtime,
    );
    if (blocked !== null) return blocked;
    if (this.options.command === null) {
      return unavailable("Claude Code could not be reached just now. Check again in a moment.", {
        state: "temporarily-unavailable",
        version: runtime.version,
      });
    }

    const result = await this.options.command(["auth", "status", "--json"], {
      timeoutMs: STATUS_TIMEOUT_MS,
    });
    if (result.missing) {
      return unavailable("Claude Code is not installed yet.", {
        state: "not-installed",
        version: null,
      });
    }
    if (result.timedOut) {
      return unavailable("Claude Code did not answer the connection check. Try again.", {
        state: "temporarily-unavailable",
        version: runtime.version,
      });
    }

    const status = parseStatus(result.stdout);
    if (status === null) {
      const changed = result.exitCode === 0;
      return unavailable(
        changed
          ? `This Claude Code version uses a connection format this ${PRODUCT_NAME} build does not understand. Update ${PRODUCT_NAME}, then check again.`
          : "Claude Code could not report its connection state. Check again in a moment.",
        {
          state: changed ? "praxeum-update-required" : "temporarily-unavailable",
          version: runtime.version,
        },
      );
    }
    if (!status.loggedIn) {
      return {
        id: this.id,
        label: this.label,
        description: DESCRIPTION,
        runtime,
        connection: "signed-out",
        accountLabel: null,
        planLabel: null,
        usage: null,
        canLogin: true,
        detail: "Sign in with your Claude subscription to start a tutor session.",
      };
    }
    return {
      id: this.id,
      label: this.label,
      description: DESCRIPTION,
      runtime,
      connection: "connected",
      accountLabel: status.email,
      planLabel: planLabel(status.subscriptionType),
      usage: null,
      canLogin: true,
      detail: null,
    };
  }

  async beginLogin(): Promise<ProviderLoginReply> {
    if (this.loginAbort !== null) {
      const readiness = await this.describeReadiness();
      return {
        ok: false,
        reason: "failed",
        detail: "Claude sign-in is already open.",
        readiness,
      };
    }
    const before = await this.describeReadiness();
    if (before.connection === "connected") return { ok: true, readiness: before };
    if (!before.canLogin) {
      return {
        ok: false,
        reason: "unavailable",
        detail: before.detail ?? "Claude Code is unavailable.",
        readiness: before,
      };
    }

    const controller = new AbortController();
    this.loginAbort = controller;
    let result: ProviderCommandResult;
    try {
      if (this.options.command === null) {
        return {
          ok: false,
          reason: "unavailable",
          detail: before.detail ?? "Claude Code is unavailable.",
          readiness: before,
        };
      }
      result = await this.options.command(["auth", "login", "--claudeai"], {
        timeoutMs: LOGIN_TIMEOUT_MS,
        signal: controller.signal,
      });
    } finally {
      if (this.loginAbort === controller) this.loginAbort = null;
    }
    const readiness = await this.describeReadiness();
    if (readiness.connection === "connected") return { ok: true, readiness };

    const detail = result.cancelled
      ? "Claude sign-in was cancelled."
      : result.timedOut
        ? "Claude sign-in took too long. You can try again."
        : "Claude sign-in did not finish. You can try again.";
    return {
      ok: false,
      reason: result.cancelled || result.timedOut ? "cancelled" : "failed",
      detail,
      readiness,
    };
  }

  cancelLogin(): void {
    this.loginAbort?.abort();
  }

  async openSetupGuide(): Promise<void> {
    await this.options.openExternal(CLAUDE_SETUP_GUIDE);
  }

  createAgent(): TutorAgent {
    if (this.options.agent === null) {
      throw new Error("Claude Code is not available through an installed provider runtime.");
    }
    return this.options.agent;
  }
}
