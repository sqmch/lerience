import { describe, expect, it } from "vitest";
import {
  CODEX_APP_SERVER_SCHEMA_VERSION,
  CodexAppServerClient,
  type CodexAppServerFailure,
  type CodexAppServerTransport,
} from "../src/main/provider/codex-app-server";

class FakeTransport implements CodexAppServerTransport {
  readonly writes: string[] = [];
  readonly lineListeners = new Set<(line: string) => void>();
  readonly exitListeners = new Set<(failure: CodexAppServerFailure) => void>();
  closed = false;

  write(line: string): void {
    this.writes.push(line);
  }

  close(): void {
    this.closed = true;
  }

  onLine(listener: (line: string) => void): () => void {
    this.lineListeners.add(listener);
    return () => this.lineListeners.delete(listener);
  }

  onExit(listener: (failure: CodexAppServerFailure) => void): () => void {
    this.exitListeners.add(listener);
    return () => this.exitListeners.delete(listener);
  }

  receive(value: unknown): void {
    for (const listener of this.lineListeners) listener(JSON.stringify(value));
  }
}

describe("CodexAppServerClient", () => {
  it("negotiates only stable capabilities against the pinned schema", async () => {
    const transport = new FakeTransport();
    const client = new CodexAppServerClient(transport);
    const initializing = client.initialize();
    const request = JSON.parse(transport.writes[0] ?? "null") as Record<string, unknown>;

    expect(request).toEqual({
      id: 1,
      method: "initialize",
      params: {
        clientInfo: { name: "lerience-desktop", title: "Lerience", version: "0.0.1" },
        capabilities: { experimentalApi: false, requestAttestation: false },
      },
    });
    transport.receive({
      id: 1,
      result: {
        userAgent: `codex-cli/${CODEX_APP_SERVER_SCHEMA_VERSION}`,
        codexHome: "C:/Users/learner/.codex",
        platformFamily: "windows",
        platformOs: "windows",
      },
    });

    await initializing;
    expect(JSON.parse(transport.writes[1] ?? "null")).toEqual({ method: "initialized" });
  });

  it("fails closed on a different protocol version", async () => {
    const transport = new FakeTransport();
    const client = new CodexAppServerClient(transport);
    const initializing = client.initialize();
    transport.receive({ id: 1, result: { userAgent: "codex-cli/9.9.9" } });

    await expect(initializing).rejects.toMatchObject({ code: "unsupported" });
  });

  it("never forwards a raw JSON-RPC error", async () => {
    const transport = new FakeTransport();
    const client = new CodexAppServerClient(transport);
    const request = client.request("account/read", { refreshToken: false });
    transport.receive({
      id: 1,
      error: { code: -32000, message: "token=secret C:/Users/learner/.codex/auth.json" },
    });

    await expect(request).rejects.toThrow("Codex rejected the request.");
    await expect(request).rejects.not.toThrow(/secret|auth\.json/);
  });
});
