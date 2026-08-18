import { describe, expect, it, vi } from "vitest";
import {
  CodexTutorProvider,
  normalizeCodexAccount,
  normalizeCodexUsage,
} from "../src/main/provider/codex-provider";
import type {
  CodexAppServerConnection,
  CodexAppServerFactory,
} from "../src/main/provider/codex-app-server";
import type { TutorAgent } from "../src/shared/seminar";

const readyProbe = async () => ({ state: "ready", version: "0.144.6" }) as const;

function provider(
  openExternal: (url: string) => Promise<unknown>,
  appServer: CodexAppServerFactory,
  agent: TutorAgent,
) {
  return new CodexTutorProvider({ runtimeProbe: readyProbe, openExternal, appServer, agent });
}

class FakeConnection implements CodexAppServerConnection {
  readonly calls: Array<{ method: string; params: unknown }> = [];
  readonly responses = new Map<string, unknown>();
  readonly notifications = new Set<(method: string, params: unknown) => void>();
  closed = false;

  async initialize(): Promise<void> {}
  async request(method: string, params: unknown): Promise<unknown> {
    this.calls.push({ method, params });
    return this.responses.get(method);
  }
  notify(): void {}
  respond(): void {}
  onNotification(listener: (method: string, params: unknown) => void): () => void {
    this.notifications.add(listener);
    return () => this.notifications.delete(listener);
  }
  onRequest(): () => void {
    return () => undefined;
  }
  onExit(): () => void {
    return () => undefined;
  }
  close(): void {
    this.closed = true;
  }
  emit(method: string, params: unknown): void {
    for (const listener of this.notifications) listener(method, params);
  }
}

function factory(...connections: FakeConnection[]): CodexAppServerFactory {
  let cursor = 0;
  return () => {
    const connection = connections[cursor++];
    if (connection === undefined) throw new Error("No fake connection left");
    return connection;
  };
}

describe("CodexTutorProvider", () => {
  it("opens only the static official setup guide", async () => {
    const openExternal = vi.fn(async () => undefined);
    const subject = new CodexTutorProvider({
      runtimeProbe: readyProbe,
      openExternal,
      appServer: null,
    });

    await subject.openSetupGuide();

    expect(openExternal).toHaveBeenCalledWith("https://developers.openai.com/codex/cli");
  });

  it("reads account status without refreshing or exposing provider internals", async () => {
    const connection = new FakeConnection();
    connection.responses.set("account/read", {
      account: {
        type: "chatgpt",
        email: "learner@example.com",
        planType: "plus",
        accessToken: "secret",
      },
      requiresOpenaiAuth: true,
    });
    const subject = provider(
      vi.fn(async () => undefined),
      factory(connection),
      { providerId: "codex" } as TutorAgent,
    );

    await expect(subject.describeReadiness()).resolves.toEqual({
      id: "codex",
      label: "Codex",
      description: "Use your existing ChatGPT plan through Codex.",
      runtime: { state: "ready", version: "0.144.6" },
      connection: "connected",
      accountLabel: "learner@example.com",
      planLabel: "ChatGPT Plus",
      usage: null,
      canLogin: true,
      detail: null,
    });
    expect(connection.calls).toEqual([
      { method: "account/read", params: { refreshToken: false } },
      { method: "account/rateLimits/read", params: undefined },
    ]);
    expect(connection.closed).toBe(true);
  });

  it("opens only the provider-owned ChatGPT authorization URL after an explicit login", async () => {
    const before = new FakeConnection();
    before.responses.set("account/read", { account: null, requiresOpenaiAuth: true });
    const login = new FakeConnection();
    login.responses.set("account/login/start", {
      type: "chatgpt",
      loginId: "login-1",
      authUrl: "https://auth.openai.com/oauth/authorize?client_id=public",
    });
    login.responses.set("account/read", {
      account: { type: "chatgpt", email: "learner@example.com", planType: "pro" },
      requiresOpenaiAuth: true,
    });
    const openExternal = vi.fn(async () => undefined);
    const subject = provider(openExternal, factory(before, login), {
      providerId: "codex",
    } as TutorAgent);

    const result = subject.beginLogin();
    await vi.waitFor(() => expect(openExternal).toHaveBeenCalledOnce());
    login.emit("account/login/completed", { loginId: "login-1", success: true, error: null });

    await expect(result).resolves.toMatchObject({
      ok: true,
      readiness: { connection: "connected", planLabel: "ChatGPT Pro" },
    });
    expect(openExternal).toHaveBeenCalledWith(
      "https://auth.openai.com/oauth/authorize?client_id=public",
    );
    expect(login.calls[0]).toEqual({
      method: "account/login/start",
      params: {
        type: "chatgpt",
        codexStreamlinedLogin: true,
        useHostedLoginSuccessPage: true,
        appBrand: "codex",
      },
    });
  });

  it("does not accept arbitrary login URLs", async () => {
    const before = new FakeConnection();
    before.responses.set("account/read", { account: null, requiresOpenaiAuth: true });
    const login = new FakeConnection();
    login.responses.set("account/login/start", {
      type: "chatgpt",
      loginId: "login-1",
      authUrl: "https://attacker.example/collect",
    });
    const after = new FakeConnection();
    after.responses.set("account/read", { account: null, requiresOpenaiAuth: true });
    const openExternal = vi.fn(async () => undefined);
    const subject = provider(openExternal, factory(before, login, after), {
      providerId: "codex",
    } as TutorAgent);

    await expect(subject.beginLogin()).resolves.toMatchObject({ ok: false, reason: "failed" });
    expect(openExternal).not.toHaveBeenCalled();
  });

  it("cancels the matching App Server login without logging the account out", async () => {
    const before = new FakeConnection();
    before.responses.set("account/read", { account: null, requiresOpenaiAuth: true });
    const login = new FakeConnection();
    login.responses.set("account/login/start", {
      type: "chatgpt",
      loginId: "login-7",
      authUrl: "https://auth.openai.com/oauth/authorize",
    });
    const after = new FakeConnection();
    after.responses.set("account/read", { account: null, requiresOpenaiAuth: true });
    const openExternal = vi.fn(async () => undefined);
    const subject = provider(openExternal, factory(before, login, after), {
      providerId: "codex",
    } as TutorAgent);

    const result = subject.beginLogin();
    await vi.waitFor(() => expect(openExternal).toHaveBeenCalledOnce());
    subject.cancelLogin();

    await expect(result).resolves.toMatchObject({ ok: false, reason: "cancelled" });
    expect(login.calls).toContainEqual({
      method: "account/login/cancel",
      params: { loginId: "login-7" },
    });
    expect(login.calls.some((call) => call.method === "account/logout")).toBe(false);
  });
});

describe("Codex account normalization", () => {
  it("reuses existing API-key auth without reading or rendering the key", () => {
    expect(normalizeCodexAccount({ account: { type: "apiKey", apiKey: "secret" } })).toEqual({
      id: "codex",
      label: "Codex",
      description: "Use your existing ChatGPT plan through Codex.",
      runtime: { state: "ready", version: null },
      connection: "connected",
      accountLabel: "API key",
      planLabel: null,
      usage: null,
      canLogin: true,
      detail: null,
    });
  });

  it("allowlists direct rolling-limit percentages and drops credit data", () => {
    expect(
      normalizeCodexUsage({
        rateLimits: {
          primary: { usedPercent: 36.4, windowDurationMins: 300, resetsAt: 1_800_000_000 },
          secondary: { usedPercent: 11, windowDurationMins: 10_080, resetsAt: null },
          credits: { balance: "private-balance" },
          limitId: "internal-limit-id",
        },
        rateLimitsByLimitId: null,
      }),
    ).toEqual({
      windows: [
        { label: "5-hour limit", usedPercent: 36.4, resetsAt: 1_800_000_000 },
        { label: "Weekly limit", usedPercent: 11, resetsAt: null },
      ],
    });
  });
});
