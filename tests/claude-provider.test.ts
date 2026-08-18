import { describe, expect, it, vi } from "vitest";
import {
  ClaudeTutorProvider,
  type ProviderCommandRunner,
} from "../src/main/provider/claude-provider";
import type { TutorAgent } from "../src/shared/seminar";

const readyProbe = async () => ({ state: "ready", version: "2.1.223" }) as const;

function provider(command: ProviderCommandRunner | null = null, agent: TutorAgent | null = null) {
  return new ClaudeTutorProvider({
    runtimeProbe: readyProbe,
    command,
    agent,
    openExternal: vi.fn(async () => undefined),
  });
}

function result(stdout: string, exitCode = 0) {
  return { stdout, exitCode, missing: false, timedOut: false, cancelled: false };
}

describe("ClaudeTutorProvider", () => {
  it("opens only the static official setup guide", async () => {
    const openExternal = vi.fn(async () => undefined);
    const subject = new ClaudeTutorProvider({
      runtimeProbe: readyProbe,
      command: null,
      agent: null,
      openExternal,
    });

    await subject.openSetupGuide();

    expect(openExternal).toHaveBeenCalledWith("https://code.claude.com/docs/en/installation");
  });

  it("cannot invent an SDK-bundled tutor when no installed runtime was injected", () => {
    expect(() => provider().createAgent()).toThrow(
      "Claude Code is not available through an installed provider runtime.",
    );
  });

  it("reports only safe connected account facts", async () => {
    const command: ProviderCommandRunner = vi.fn(async () =>
      result(
        JSON.stringify({
          loggedIn: true,
          authMethod: "claude.ai",
          apiProvider: "firstParty",
          email: "learner@example.com",
          orgId: "secret-provider-id",
          subscriptionType: "max",
        }),
      ),
    );
    const subject = provider(command, { providerId: "claude" } as TutorAgent);

    await expect(subject.describeReadiness()).resolves.toEqual({
      id: "claude",
      label: "Claude Code",
      description: "Use the Claude subscription already connected to Claude Code.",
      runtime: { state: "ready", version: "2.1.223" },
      connection: "connected",
      accountLabel: "learner@example.com",
      planLabel: "Claude Max",
      usage: null,
      canLogin: true,
      detail: null,
    });
  });

  it("distinguishes a missing CLI from a signed-out install", async () => {
    const missing: ProviderCommandRunner = vi.fn(async () => ({
      stdout: "",
      exitCode: null,
      missing: true,
      timedOut: false,
      cancelled: false,
    }));
    const signedOut: ProviderCommandRunner = vi.fn(async () => result('{"loggedIn":false}', 1));

    await expect(provider(missing).describeReadiness()).resolves.toMatchObject({
      runtime: { state: "not-installed", version: null },
      connection: "unavailable",
      canLogin: false,
      detail: "Claude Code is not installed yet.",
    });
    await expect(provider(signedOut).describeReadiness()).resolves.toMatchObject({
      connection: "signed-out",
      canLogin: true,
    });
  });

  it("runs vendor login only after an explicit call and re-probes before succeeding", async () => {
    const command = vi
      .fn<ProviderCommandRunner>()
      .mockResolvedValueOnce(result('{"loggedIn":false}', 1))
      .mockResolvedValueOnce(result(""))
      .mockResolvedValueOnce(
        result('{"loggedIn":true,"email":"learner@example.com","subscriptionType":"pro"}'),
      );
    const subject = provider(command);

    await expect(subject.beginLogin()).resolves.toMatchObject({
      ok: true,
      readiness: { connection: "connected", planLabel: "Claude Pro" },
    });
    expect(command.mock.calls.map(([args]) => args)).toEqual([
      ["auth", "status", "--json"],
      ["auth", "login", "--claudeai"],
      ["auth", "status", "--json"],
    ]);
  });

  it("does not forward malformed status output", async () => {
    const command: ProviderCommandRunner = vi.fn(async () =>
      result("token=provider-secret C:\\Users\\learner\\.claude"),
    );

    await expect(provider(command).describeReadiness()).resolves.toEqual({
      id: "claude",
      label: "Claude Code",
      description: "Use the Claude subscription already connected to Claude Code.",
      runtime: { state: "praxeum-update-required", version: "2.1.223" },
      connection: "unavailable",
      accountLabel: null,
      planLabel: null,
      usage: null,
      canLogin: false,
      detail:
        "This Claude Code version uses a connection format this Lerience build does not understand. Update Lerience, then check again.",
    });
  });

  it("cancels the active vendor login process", async () => {
    let loginSignal: AbortSignal | undefined;
    const command = vi.fn<ProviderCommandRunner>(async (args, options) => {
      if (args.includes("status")) return result('{"loggedIn":false}', 1);
      loginSignal = options.signal;
      return await new Promise((resolve) => {
        options.signal?.addEventListener(
          "abort",
          () => resolve({ ...result("", 1), cancelled: true }),
          { once: true },
        );
      });
    });
    const subject = provider(command);

    const login = subject.beginLogin();
    await vi.waitFor(() => expect(loginSignal).toBeDefined());
    subject.cancelLogin();

    await expect(login).resolves.toMatchObject({ ok: false, reason: "cancelled" });
    expect(loginSignal?.aborted).toBe(true);
  });
});
