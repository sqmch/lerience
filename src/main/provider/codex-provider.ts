import type {
  ProviderLoginReply,
  ProviderReadiness,
  ProviderUsage,
  ProviderUsageWindow,
  TutorProvider,
} from "../../shared/provider";
import type { TutorAgent } from "../../shared/seminar";
import { CodexTutorAgent } from "../agent/codex";
import { readinessForRuntime, type ProviderRuntimeProbe } from "./compatibility";
import {
  CodexAppServerFailure,
  type CodexAppServerConnection,
  type CodexAppServerFactory,
} from "./codex-app-server";

const LOGIN_TIMEOUT_MS = 10 * 60_000;
const DESCRIPTION = "Use your existing ChatGPT plan through Codex.";
const CODEX_SETUP_GUIDE = "https://developers.openai.com/codex/cli";

interface PendingLogin {
  client: CodexAppServerConnection;
  loginId: string;
  cancelled: boolean;
  settle(completion: LoginCompletion): void;
}

interface LoginCompletion {
  success: boolean;
}

type OpenExternal = (url: string) => Promise<unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function planLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const labels: Record<string, string> = {
    free: "ChatGPT Free",
    go: "ChatGPT Go",
    plus: "ChatGPT Plus",
    pro: "ChatGPT Pro",
    prolite: "ChatGPT Pro",
    team: "ChatGPT Team",
    self_serve_business_usage_based: "ChatGPT Business",
    business: "ChatGPT Business",
    enterprise_cbp_usage_based: "ChatGPT Enterprise",
    enterprise: "ChatGPT Enterprise",
    edu: "ChatGPT Edu",
  };
  return labels[value] ?? null;
}

function unavailable(detail: string, runtime: ProviderReadiness["runtime"]): ProviderReadiness {
  return {
    id: "codex",
    label: "Codex",
    description: DESCRIPTION,
    runtime,
    connection: "unavailable",
    accountLabel: null,
    planLabel: null,
    usage: null,
    canLogin: false,
    detail,
  };
}

export function normalizeCodexAccount(
  value: unknown,
  runtime: ProviderReadiness["runtime"] = { state: "ready", version: null },
): ProviderReadiness | null {
  if (!isRecord(value) || !("account" in value)) return null;
  const account = value.account;
  if (account === null) {
    return {
      id: "codex",
      label: "Codex",
      description: DESCRIPTION,
      runtime,
      connection: "signed-out",
      accountLabel: null,
      planLabel: null,
      usage: null,
      canLogin: true,
      detail: "Sign in with ChatGPT to start a Codex tutor session.",
    };
  }
  if (!isRecord(account) || typeof account.type !== "string") return null;
  if (account.type === "chatgpt") {
    const email =
      typeof account.email === "string" && /^[^\s@]+@[^\s@]+$/.test(account.email)
        ? account.email
        : null;
    return {
      id: "codex",
      label: "Codex",
      description: DESCRIPTION,
      runtime,
      connection: "connected",
      accountLabel: email,
      planLabel: planLabel(account.planType),
      usage: null,
      canLogin: true,
      detail: null,
    };
  }
  if (account.type === "apiKey" || account.type === "amazonBedrock") {
    return {
      id: "codex",
      label: "Codex",
      description: DESCRIPTION,
      runtime,
      connection: "connected",
      accountLabel: account.type === "apiKey" ? "API key" : "Amazon Bedrock",
      planLabel: null,
      usage: null,
      canLogin: true,
      detail: null,
    };
  }
  return null;
}

function usageLabel(durationMins: number | null, fallback: string): string {
  if (durationMins === 300) return "5-hour limit";
  if (durationMins === 1_440) return "Daily limit";
  if (durationMins === 10_080) return "Weekly limit";
  if (durationMins !== null && durationMins > 0 && durationMins % 60 === 0) {
    return `${String(durationMins / 60)}-hour limit`;
  }
  return fallback;
}

function usageWindow(value: unknown, fallback: string): ProviderUsageWindow | null {
  if (
    !isRecord(value) ||
    typeof value.usedPercent !== "number" ||
    !Number.isFinite(value.usedPercent)
  ) {
    return null;
  }
  const duration =
    typeof value.windowDurationMins === "number" && Number.isFinite(value.windowDurationMins)
      ? value.windowDurationMins
      : null;
  const resetsAt =
    typeof value.resetsAt === "number" && Number.isFinite(value.resetsAt) && value.resetsAt > 0
      ? value.resetsAt
      : null;
  return {
    label: usageLabel(duration, fallback),
    usedPercent: Math.min(100, Math.max(0, value.usedPercent)),
    resetsAt,
  };
}

/** Allowlist only the rolling percentage windows. Credit balances, internal
 * limit ids, and the rest of the provider payload stay provider-side. */
export function normalizeCodexUsage(value: unknown): ProviderUsage | null {
  if (!isRecord(value)) return null;
  const byId = isRecord(value.rateLimitsByLimitId) ? value.rateLimitsByLimitId.codex : null;
  const snapshot = isRecord(byId) ? byId : isRecord(value.rateLimits) ? value.rateLimits : null;
  if (snapshot === null) return null;
  const windows = [
    usageWindow(snapshot.primary, "Primary limit"),
    usageWindow(snapshot.secondary, "Secondary limit"),
  ].filter((window): window is ProviderUsageWindow => window !== null);
  return windows.length === 0 ? null : { windows };
}

function safeAuthUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const allowed =
      url.hostname === "openai.com" ||
      url.hostname.endsWith(".openai.com") ||
      url.hostname === "chatgpt.com" ||
      url.hostname.endsWith(".chatgpt.com");
    return url.protocol === "https:" && allowed ? url.toString() : null;
  } catch {
    return null;
  }
}

function failureDetail(error: unknown): string {
  if (error instanceof CodexAppServerFailure) {
    if (error.code === "missing") return "Codex is not installed yet.";
    if (error.code === "timeout") return "Codex did not answer the connection check. Try again.";
    if (error.code === "unsupported" || error.code === "protocol") {
      return "Codex answered in a format Lerience could not validate. Check again; if this continues, report the installed Codex and Lerience versions.";
    }
  }
  return "Codex could not report its connection state.";
}

function runtimeAfterFailure(
  current: ProviderReadiness["runtime"],
  error: unknown,
): ProviderReadiness["runtime"] {
  if (!(error instanceof CodexAppServerFailure)) {
    return { state: "temporarily-unavailable", version: current.version };
  }
  if (error.code === "missing") return { state: "not-installed", version: null };
  if (error.code === "unsupported" || error.code === "protocol") {
    return { state: "praxeum-update-required", version: current.version };
  }
  return { state: "temporarily-unavailable", version: current.version };
}

export interface CodexTutorProviderOptions {
  runtimeProbe: ProviderRuntimeProbe;
  openExternal: OpenExternal;
  appServer: CodexAppServerFactory | null;
  agent?: TutorAgent;
}

export class CodexTutorProvider implements TutorProvider {
  readonly id = "codex" as const;
  readonly label = "Codex";
  private activeLogin: PendingLogin | null = null;
  private readonly appServer: CodexAppServerFactory | null;
  private readonly agent: TutorAgent | null;

  constructor(private readonly options: CodexTutorProviderOptions) {
    this.appServer = options.appServer;
    this.agent =
      options.agent ?? (this.appServer === null ? null : new CodexTutorAgent(this.appServer));
  }

  async describeReadiness(): Promise<ProviderReadiness> {
    const runtime = await this.options.runtimeProbe();
    const blocked = readinessForRuntime(
      { id: this.id, label: this.label, description: DESCRIPTION },
      runtime,
    );
    if (blocked !== null) return blocked;
    if (this.appServer === null) {
      return unavailable("Codex could not be reached just now. Check again in a moment.", {
        state: "temporarily-unavailable",
        version: runtime.version,
      });
    }
    const client = this.appServer();
    try {
      await client.initialize();
      const readiness = await this.readReadiness(client, runtime);
      return (
        readiness ??
        unavailable(
          "Codex answered in a format Lerience could not validate. Check again; if this continues, report the installed Codex and Lerience versions.",
          { state: "praxeum-update-required", version: runtime.version },
        )
      );
    } catch (error) {
      return unavailable(failureDetail(error), runtimeAfterFailure(runtime, error));
    } finally {
      client.close();
    }
  }

  async beginLogin(): Promise<ProviderLoginReply> {
    if (this.activeLogin !== null) {
      const readiness = await this.describeReadiness();
      return { ok: false, reason: "failed", detail: "Codex sign-in is already open.", readiness };
    }
    const before = await this.describeReadiness();
    if (before.connection === "connected") return { ok: true, readiness: before };
    if (!before.canLogin) {
      return {
        ok: false,
        reason: "unavailable",
        detail: before.detail ?? "Codex is unavailable.",
        readiness: before,
      };
    }

    const appServer = this.appServer;
    if (appServer === null) {
      return {
        ok: false,
        reason: "unavailable",
        detail: before.detail ?? "Codex is unavailable.",
        readiness: before,
      };
    }
    const client = appServer();
    try {
      await client.initialize();
      const started = await client.request("account/login/start", {
        type: "chatgpt",
        codexStreamlinedLogin: true,
        useHostedLoginSuccessPage: true,
        appBrand: "codex",
      });
      if (!isRecord(started) || started.type !== "chatgpt" || typeof started.loginId !== "string") {
        throw new Error("invalid login response");
      }
      const authUrl = safeAuthUrl(started.authUrl);
      if (authUrl === null) throw new Error("invalid login URL");

      let settle: (completion: LoginCompletion) => void = () => undefined;
      const completion = new Promise<LoginCompletion>((resolve) => {
        settle = resolve;
      });
      const pending: PendingLogin = {
        client,
        loginId: started.loginId,
        cancelled: false,
        settle,
      };
      this.activeLogin = pending;
      const stopNotification = client.onNotification((method, params) => {
        if (method !== "account/login/completed" || !isRecord(params)) return;
        if (params.loginId !== pending.loginId || typeof params.success !== "boolean") return;
        settle({ success: params.success });
      });
      const timeout = setTimeout(() => settle({ success: false }), LOGIN_TIMEOUT_MS);
      await this.options.openExternal(authUrl);
      const result = await completion;
      clearTimeout(timeout);
      stopNotification();

      if (!pending.cancelled && result.success) {
        const runtime = await this.options.runtimeProbe();
        const readiness = await this.readReadiness(client, runtime);
        if (readiness?.connection === "connected") return { ok: true, readiness };
      }
      const readiness = await this.describeReadiness();
      return {
        ok: false,
        reason: pending.cancelled ? "cancelled" : "failed",
        detail: pending.cancelled
          ? "Codex sign-in was cancelled."
          : "Codex sign-in did not finish. You can try again.",
        readiness,
      };
    } catch {
      const readiness = await this.describeReadiness();
      return {
        ok: false,
        reason: "failed",
        detail: "Codex sign-in could not be opened. You can try again.",
        readiness,
      };
    } finally {
      if (this.activeLogin?.client === client) this.activeLogin = null;
      client.close();
    }
  }

  cancelLogin(): void {
    const pending = this.activeLogin;
    if (pending === null) return;
    pending.cancelled = true;
    pending.settle({ success: false });
    void pending.client
      .request("account/login/cancel", { loginId: pending.loginId })
      .catch(() => undefined);
  }

  async openSetupGuide(): Promise<void> {
    await this.options.openExternal(CODEX_SETUP_GUIDE);
  }

  createAgent(): TutorAgent {
    if (this.agent === null) {
      throw new Error("Codex is not available through an installed provider runtime.");
    }
    return this.agent;
  }

  private async readReadiness(
    client: CodexAppServerConnection,
    runtime: ProviderReadiness["runtime"],
  ): Promise<ProviderReadiness | null> {
    const readiness = normalizeCodexAccount(
      await client.request("account/read", { refreshToken: false }),
      runtime,
    );
    if (readiness?.connection !== "connected") return readiness;
    try {
      return {
        ...readiness,
        usage: normalizeCodexUsage(await client.request("account/rateLimits/read", undefined)),
      };
    } catch {
      // Usage is optional evidence. Auth readiness stays useful if the
      // provider cannot report rolling limits for this account.
      return readiness;
    }
  }
}
