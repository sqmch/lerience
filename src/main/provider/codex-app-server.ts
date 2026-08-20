import { spawn } from "node:child_process";
import { PRODUCT_CLIENT_ID, PRODUCT_NAME } from "../../shared/product";

const MAX_LINE_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const INITIALIZE_TIMEOUT_MS = 10_000;

/** Oldest provider-owned Codex build covered by Lerience's stable App Server
 * contract. Newer builds are admitted through the real stable handshake. */
export const CODEX_APP_SERVER_MINIMUM_VERSION = "0.144.6";

type JsonRpcId = string | number;
type NotificationListener = (method: string, params: unknown) => void;
type RequestListener = (id: JsonRpcId, method: string, params: unknown) => void;
type ExitListener = (failure: CodexAppServerFailure) => void;

export class CodexAppServerFailure extends Error {
  constructor(
    readonly code: "missing" | "unsupported" | "protocol" | "timeout" | "exited",
    message: string,
  ) {
    super(message);
    this.name = "CodexAppServerFailure";
  }
}

export interface CodexAppServerTransport {
  write(line: string): void;
  close(): void;
  onLine(listener: (line: string) => void): () => void;
  onExit(listener: (failure: CodexAppServerFailure) => void): () => void;
}

/** The deliberately tiny protocol surface consumed by readiness, login, and
 * TutorAgent. Provider JSON never leaves the main process. */
export interface CodexAppServerConnection {
  initialize(): Promise<void>;
  request(method: string, params: unknown, timeoutMs?: number): Promise<unknown>;
  notify(method: string, params?: unknown): void;
  respond(id: JsonRpcId, result: unknown): void;
  onNotification(listener: NotificationListener): () => void;
  onRequest(listener: RequestListener): () => void;
  onExit(listener: ExitListener): () => void;
  close(): void;
}

export type CodexAppServerFactory = () => CodexAppServerConnection;

export interface CodexAppServerFactoryOptions {
  executable: string;
  clientVersion: string;
  environment?: Readonly<Record<string, string>>;
}

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: CodexAppServerFailure): void;
  timer: ReturnType<typeof setTimeout>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRpcId(value: unknown): value is JsonRpcId {
  return typeof value === "string" || (typeof value === "number" && Number.isFinite(value));
}

/** JSONL/JSON-RPC client for the stable App Server surface Lerience consumes. */
export class CodexAppServerClient implements CodexAppServerConnection {
  private nextId = 1;
  private closed = false;
  private readonly pending = new Map<JsonRpcId, PendingRequest>();
  private readonly notifications = new Set<NotificationListener>();
  private readonly requests = new Set<RequestListener>();
  private readonly exits = new Set<ExitListener>();

  constructor(
    private readonly clientVersion: string,
    private readonly transport: CodexAppServerTransport = createStdioTransport(),
  ) {
    transport.onLine((line) => this.receive(line));
    transport.onExit((failure) => this.fail(failure));
  }

  async initialize(): Promise<void> {
    const response = await this.request(
      "initialize",
      {
        clientInfo: { name: PRODUCT_CLIENT_ID, title: PRODUCT_NAME, version: this.clientVersion },
        capabilities: { experimentalApi: false, requestAttestation: false },
      },
      INITIALIZE_TIMEOUT_MS,
    );
    if (!isRecord(response) || typeof response.userAgent !== "string") {
      throw new CodexAppServerFailure("protocol", "Codex returned an invalid handshake.");
    }
    this.notify("initialized");
  }

  request(method: string, params: unknown, timeoutMs = REQUEST_TIMEOUT_MS): Promise<unknown> {
    if (this.closed) {
      return Promise.reject(new CodexAppServerFailure("exited", "Codex App Server is closed."));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new CodexAppServerFailure("timeout", "Codex App Server did not answer in time."));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.transport.write(`${JSON.stringify({ id, method, params })}\n`);
      } catch {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new CodexAppServerFailure("exited", "Codex App Server stopped unexpectedly."));
      }
    });
  }

  notify(method: string, params?: unknown): void {
    if (this.closed) return;
    const message = params === undefined ? { method } : { method, params };
    this.transport.write(`${JSON.stringify(message)}\n`);
  }

  respond(id: JsonRpcId, result: unknown): void {
    if (this.closed) return;
    this.transport.write(`${JSON.stringify({ id, result })}\n`);
  }

  onNotification(listener: NotificationListener): () => void {
    this.notifications.add(listener);
    return () => this.notifications.delete(listener);
  }

  onRequest(listener: RequestListener): () => void {
    this.requests.add(listener);
    return () => this.requests.delete(listener);
  }

  onExit(listener: ExitListener): () => void {
    this.exits.add(listener);
    return () => this.exits.delete(listener);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.transport.close();
    this.rejectPending(new CodexAppServerFailure("exited", "Codex App Server was closed."));
  }

  private receive(line: string): void {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      this.fail(new CodexAppServerFailure("protocol", "Codex emitted malformed protocol data."));
      return;
    }
    if (!isRecord(message)) {
      this.fail(new CodexAppServerFailure("protocol", "Codex emitted malformed protocol data."));
      return;
    }

    if (typeof message.method === "string") {
      if (isRpcId(message.id)) {
        for (const listener of this.requests) listener(message.id, message.method, message.params);
      } else {
        for (const listener of this.notifications) listener(message.method, message.params);
      }
      return;
    }

    if (!isRpcId(message.id)) {
      this.fail(new CodexAppServerFailure("protocol", "Codex emitted malformed protocol data."));
      return;
    }
    const pending = this.pending.get(message.id);
    if (pending === undefined) return;
    clearTimeout(pending.timer);
    this.pending.delete(message.id);
    if ("error" in message) {
      pending.reject(new CodexAppServerFailure("protocol", "Codex rejected the request."));
      return;
    }
    pending.resolve(message.result);
  }

  private fail(failure: CodexAppServerFailure): void {
    if (this.closed) return;
    this.closed = true;
    this.rejectPending(failure);
    for (const listener of this.exits) listener(failure);
  }

  private rejectPending(failure: CodexAppServerFailure): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(failure);
    }
    this.pending.clear();
  }
}

export function createCodexAppServerFactory(
  options: CodexAppServerFactoryOptions,
): CodexAppServerFactory {
  return () =>
    new CodexAppServerClient(
      options.clientVersion,
      createStdioTransport(options.executable, options.environment),
    );
}

/** Spawn with the learner's canonical Codex environment preserved; packaged
 * tools may be prepended to PATH. stdout is bounded JSONL, stderr is drained
 * and discarded, and no shell participates. */
export function createStdioTransport(
  executable = "codex",
  environment?: Readonly<Record<string, string>>,
): CodexAppServerTransport {
  const child = spawn(executable, ["app-server"], {
    shell: false,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
    ...(environment === undefined ? {} : { env: environment }),
  });
  const lines = new Set<(line: string) => void>();
  const exits = new Set<(failure: CodexAppServerFailure) => void>();
  let buffer = "";
  let finished = false;

  const finish = (failure: CodexAppServerFailure): void => {
    if (finished) return;
    finished = true;
    for (const listener of exits) listener(failure);
  };
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    if (finished) return;
    buffer += chunk;
    if (Buffer.byteLength(buffer, "utf8") > MAX_LINE_BYTES) {
      child.kill();
      finish(new CodexAppServerFailure("protocol", "Codex emitted an oversized protocol frame."));
      return;
    }
    for (;;) {
      const newline = buffer.indexOf("\n");
      if (newline < 0) break;
      const line = buffer.slice(0, newline).trimEnd();
      buffer = buffer.slice(newline + 1);
      if (line !== "") for (const listener of lines) listener(line);
    }
  });
  child.stderr.resume();
  child.stdin.on("error", () => {
    finish(new CodexAppServerFailure("exited", "Codex App Server stopped unexpectedly."));
  });
  child.once("error", (error) => {
    const missing = "code" in error && error.code === "ENOENT";
    finish(
      new CodexAppServerFailure(
        missing ? "missing" : "exited",
        missing ? "Codex is not installed yet." : "Codex App Server could not start.",
      ),
    );
  });
  child.once("close", () => {
    finish(new CodexAppServerFailure("exited", "Codex App Server stopped unexpectedly."));
  });

  return {
    write(line) {
      if (finished || child.stdin.destroyed) {
        throw new CodexAppServerFailure("exited", "Codex App Server is closed.");
      }
      child.stdin.write(line);
    },
    close() {
      if (finished) return;
      child.stdin.end();
      child.kill();
      finished = true;
    },
    onLine(listener) {
      lines.add(listener);
      return () => lines.delete(listener);
    },
    onExit(listener) {
      exits.add(listener);
      return () => exits.delete(listener);
    },
  };
}
