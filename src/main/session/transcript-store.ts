/* Append-only session evidence in app-data (ADR-007, ADR-009, ADR-010).
   The file contains normalized app vocabulary, never provider payloads. */

import { randomUUID } from "node:crypto";
import { chmod, mkdir, open, readFile, readdir, rename } from "node:fs/promises";
import path from "node:path";
import { assertUuid, courseDataDirectory } from "../course-identity";

export const TRANSCRIPT_FORMAT_VERSION = 1 as const;
const TRANSCRIPT_DIRECTORY = "sessions";
const REDACTION = "[credential redacted]";
const STREAM_CONTEXT_LENGTH = 512;

export type TranscriptLifecycleState = "open" | "wrapping" | "close_failed" | "closed";

export interface TranscriptHeader {
  kind: "session_opened";
  formatVersion: typeof TRANSCRIPT_FORMAT_VERSION;
  courseId: string;
  sessionId: string;
  createdAt: string;
}

interface EntryBase {
  sequence: number;
  recordedAt: string;
}

export interface OperatorEntry extends EntryBase {
  kind: "operator";
  text: string;
}

export interface LearnerEntry extends EntryBase {
  kind: "learner";
  text: string;
}

export interface TutorDeltaEntry extends EntryBase {
  kind: "tutor_delta";
  delta: string;
}

export interface ToolActivityEntry extends EntryBase {
  kind: "tool_activity";
  name: string;
  summary: string;
}

export interface ApprovalEntry extends EntryBase {
  kind: "approval";
  requestId: string;
  toolName: string;
  summary: string;
  outcome: "requested" | "allowed" | "denied";
  reason?: string;
}

export interface UsageEntry extends EntryBase {
  kind: "usage";
  totalCostUsd: number;
}

export interface TurnCompleteEntry extends EntryBase {
  kind: "turn_complete";
}

export interface AgentEndedEntry extends EntryBase {
  kind: "agent_ended";
  reason: "ended" | "died";
}

export interface LifecycleEntry extends EntryBase {
  kind: "lifecycle";
  state: TranscriptLifecycleState;
  detail?: string;
}

export type TranscriptEntry =
  | OperatorEntry
  | LearnerEntry
  | TutorDeltaEntry
  | ToolActivityEntry
  | ApprovalEntry
  | UsageEntry
  | TurnCompleteEntry
  | AgentEndedEntry
  | LifecycleEntry;

export type TranscriptEntryInput = TranscriptEntry extends infer Entry
  ? Entry extends TranscriptEntry
    ? Omit<Entry, keyof EntryBase>
    : never
  : never;

export interface RehydratedMessage {
  id: string;
  role: "learner" | "tutor";
  content: string;
  /** True only for a tutor message whose turn_complete record never landed. */
  partial: boolean;
}

export interface TranscriptSnapshot {
  artifactPath: string;
  header: TranscriptHeader;
  entries: TranscriptEntry[];
  messages: RehydratedMessage[];
  lifecycle: TranscriptLifecycleState;
  lifecycleAt: string;
  active: boolean;
  recoveredMalformedTail: boolean;
}

interface StoreLocation {
  userDataPath: string;
  courseId: string;
  sessionId: string;
}

export interface CreateTranscriptOptions {
  userDataPath: string;
  courseId: string;
  sessionId?: string;
  createId?: () => string;
  clock?: () => Date;
}

export interface OpenTranscriptOptions extends StoreLocation {
  clock?: () => Date;
}

export interface FindActiveTranscriptOptions {
  userDataPath: string;
  courseId: string;
  clock?: () => Date;
}

export class TranscriptCorruptionError extends Error {
  constructor(
    message: string,
    readonly artifactPath: string,
    readonly lineNumber: number | null,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "TranscriptCorruptionError";
  }
}

class UnsafeStoredTextError extends Error {}

interface StreamRedactionState {
  tail: string;
  suppression: "token" | "line" | null;
}

interface ReadResult {
  header: TranscriptHeader;
  entries: TranscriptEntry[];
  recoveredMalformedTail: boolean;
  missingFinalNewline: boolean;
  validByteLength: number;
}

export class FileTranscriptStore {
  readonly artifactPath: string;
  readonly courseId: string;
  readonly sessionId: string;

  readonly #clock: () => Date;
  #header: TranscriptHeader;
  #entries: TranscriptEntry[];
  #recoveredMalformedTail: boolean;
  #operationTail: Promise<void> = Promise.resolve();
  #tutorRedaction: StreamRedactionState = { tail: "", suppression: null };

  private constructor(options: {
    artifactPath: string;
    courseId: string;
    sessionId: string;
    clock: () => Date;
    header: TranscriptHeader;
    entries: TranscriptEntry[];
    recoveredMalformedTail: boolean;
  }) {
    this.artifactPath = options.artifactPath;
    this.courseId = options.courseId;
    this.sessionId = options.sessionId;
    this.#clock = options.clock;
    this.#header = options.header;
    this.#entries = options.entries;
    this.#recoveredMalformedTail = options.recoveredMalformedTail;
    this.#seedTutorRedaction();
  }

  static async create(options: CreateTranscriptOptions): Promise<FileTranscriptStore> {
    assertUuid(options.courseId, "course ID");
    const sessionId = options.sessionId ?? options.createId?.() ?? randomUUID();
    assertUuid(sessionId, "session ID");
    const courseId = options.courseId.toLowerCase();
    const normalizedSessionId = sessionId.toLowerCase();
    const clock = options.clock ?? (() => new Date());
    const artifactPath = transcriptPath(options.userDataPath, courseId, normalizedSessionId);
    await makePrivateDirectory(path.dirname(artifactPath));

    const header: TranscriptHeader = {
      kind: "session_opened",
      formatVersion: TRANSCRIPT_FORMAT_VERSION,
      courseId,
      sessionId: normalizedSessionId,
      createdAt: timestamp(clock),
    };
    const opened: LifecycleEntry = {
      kind: "lifecycle",
      sequence: 1,
      recordedAt: timestamp(clock),
      state: "open",
    };
    const content = `${JSON.stringify(header)}\n${JSON.stringify(opened)}\n`;

    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(artifactPath, "wx", 0o600);
      await handle.writeFile(content, "utf8");
      await handle.sync();
    } finally {
      await handle?.close();
    }
    await makePrivateFile(artifactPath);

    return new FileTranscriptStore({
      artifactPath,
      courseId,
      sessionId: normalizedSessionId,
      clock,
      header,
      entries: [opened],
      recoveredMalformedTail: false,
    });
  }

  static async open(options: OpenTranscriptOptions): Promise<FileTranscriptStore> {
    assertUuid(options.courseId, "course ID");
    assertUuid(options.sessionId, "session ID");
    const courseId = options.courseId.toLowerCase();
    const sessionId = options.sessionId.toLowerCase();
    const artifactPath = transcriptPath(options.userDataPath, courseId, sessionId);
    const result = await readTranscript(artifactPath, courseId, sessionId);
    if (result.recoveredMalformedTail) {
      await truncateDurably(artifactPath, result.validByteLength);
    } else if (result.missingFinalNewline) {
      await appendDurably(artifactPath, "\n");
    }
    await makePrivateFile(artifactPath);

    return new FileTranscriptStore({
      artifactPath,
      courseId,
      sessionId,
      clock: options.clock ?? (() => new Date()),
      header: result.header,
      entries: result.entries,
      recoveredMalformedTail: result.recoveredMalformedTail,
    });
  }

  /** Returns the most recently lifecycle-touched session whose latest state
   *  is not closed. A corrupt transcript file is quarantined aside (renamed
   *  `*.corrupt-<stamp>`, never deleted) rather than bricking the course. */
  static async openActive(
    options: FindActiveTranscriptOptions,
  ): Promise<FileTranscriptStore | null> {
    assertUuid(options.courseId, "course ID");
    const directory = transcriptDirectory(options.userDataPath, options.courseId);
    let names: string[];
    try {
      names = (await readdir(directory, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
        .map((entry) => entry.name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }

    const candidates: Array<{ store: FileTranscriptStore; lifecycleAt: string }> = [];
    const clock = options.clock ?? (() => new Date());
    for (const name of names) {
      const artifactPath = path.join(directory, name);
      try {
        const sessionId = name.slice(0, -".jsonl".length);
        assertUuid(sessionId, "session ID");
        const store = await FileTranscriptStore.open({
          userDataPath: options.userDataPath,
          courseId: options.courseId,
          sessionId,
          ...(options.clock === undefined ? {} : { clock: options.clock }),
        });
        const snapshot = await store.snapshot();
        if (snapshot.active) candidates.push({ store, lifecycleAt: snapshot.lifecycleAt });
      } catch (cause) {
        // One unreadable transcript must cost its own evidence only — never
        // the course's ability to open sessions again (ADR-010's blast
        // radius). Quarantine it aside, preserved for repair, and continue;
        // if even the rename fails, the original error is the honest one.
        try {
          const stamp = clock().toISOString().replace(/[:.]/gu, "-");
          await rename(artifactPath, `${artifactPath}.corrupt-${stamp}`);
        } catch {
          throw cause;
        }
      }
    }

    candidates.sort((left, right) => right.lifecycleAt.localeCompare(left.lifecycleAt));
    return candidates[0]?.store ?? null;
  }

  /** Appends one normalized record, fsyncs it, then makes it visible in the
   *  in-memory snapshot. Concurrent callers are serialized in call order. */
  async append(input: TranscriptEntryInput): Promise<TranscriptEntry> {
    return await this.#enqueue(async () => {
      if (this.#latestLifecycle().state === "closed") {
        throw new Error("A closed transcript is immutable");
      }
      const redactionBeforeAppend = { ...this.#tutorRedaction };
      let entry: TranscriptEntry;
      try {
        entry = this.#prepareEntry(input);
        await appendDurably(this.artifactPath, `${JSON.stringify(entry)}\n`);
      } catch (error) {
        // A failed fsync did not commit a logical entry. Keep the streaming
        // redactor aligned with the last record callers can actually replay.
        this.#tutorRedaction = redactionBeforeAppend;
        throw error;
      }
      this.#entries.push(entry);
      if (entry.kind === "turn_complete") {
        this.#tutorRedaction = { tail: "", suppression: null };
      }
      return structuredClone(entry);
    });
  }

  async markLifecycle(state: TranscriptLifecycleState, detail?: string): Promise<LifecycleEntry> {
    const entry = await this.append({
      kind: "lifecycle",
      state,
      ...(detail === undefined ? {} : { detail }),
    });
    if (entry.kind !== "lifecycle") throw new TypeError("Lifecycle append returned another kind");
    return entry;
  }

  async snapshot(): Promise<TranscriptSnapshot> {
    return await this.#enqueue(async () => this.#snapshotNow());
  }

  #snapshotNow(): TranscriptSnapshot {
    const lifecycle = this.#latestLifecycle();
    return {
      artifactPath: this.artifactPath,
      header: structuredClone(this.#header),
      entries: structuredClone(this.#entries),
      messages: rehydrateMessages(this.#entries),
      lifecycle: lifecycle.state,
      lifecycleAt: lifecycle.recordedAt,
      active: lifecycle.state !== "closed",
      recoveredMalformedTail: this.#recoveredMalformedTail,
    };
  }

  #prepareEntry(input: TranscriptEntryInput): TranscriptEntry {
    const base: EntryBase = {
      sequence: (this.#entries.at(-1)?.sequence ?? 0) + 1,
      recordedAt: timestamp(this.#clock),
    };

    let candidate: TranscriptEntry;
    switch (input.kind) {
      case "operator":
        candidate = { ...base, kind: input.kind, text: redactCredentialText(input.text) };
        break;
      case "learner":
        candidate = { ...base, kind: input.kind, text: redactCredentialText(input.text) };
        break;
      case "tutor_delta": {
        const redacted = redactStreamingText(this.#tutorRedaction, input.delta);
        this.#tutorRedaction = redacted.state;
        candidate = { ...base, kind: input.kind, delta: redacted.text };
        break;
      }
      case "tool_activity":
        candidate = {
          ...base,
          kind: input.kind,
          name: redactCredentialText(input.name),
          summary: redactCredentialText(input.summary),
        };
        break;
      case "approval":
        candidate = {
          ...base,
          kind: input.kind,
          requestId: input.requestId,
          toolName: redactCredentialText(input.toolName),
          summary: redactCredentialText(input.summary),
          outcome: input.outcome,
          ...(input.reason === undefined ? {} : { reason: redactCredentialText(input.reason) }),
        };
        break;
      case "usage":
        candidate = { ...base, kind: input.kind, totalCostUsd: input.totalCostUsd };
        break;
      case "turn_complete":
        candidate = { ...base, kind: input.kind };
        break;
      case "agent_ended":
        candidate = { ...base, kind: input.kind, reason: input.reason };
        break;
      case "lifecycle":
        candidate = {
          ...base,
          kind: input.kind,
          state: input.state,
          ...(input.detail === undefined ? {} : { detail: redactCredentialText(input.detail) }),
        };
        break;
    }

    return parseEntry(candidate);
  }

  #latestLifecycle(): LifecycleEntry {
    for (let index = this.#entries.length - 1; index >= 0; index -= 1) {
      const entry = this.#entries[index];
      if (entry?.kind === "lifecycle") return entry;
    }
    throw new TranscriptCorruptionError(
      "Transcript has no lifecycle record",
      this.artifactPath,
      null,
    );
  }

  #seedTutorRedaction(): void {
    const latestTurn: string[] = [];
    for (let index = this.#entries.length - 1; index >= 0; index -= 1) {
      const entry = this.#entries[index];
      if (entry?.kind === "turn_complete") break;
      if (entry?.kind === "tutor_delta") latestTurn.unshift(entry.delta);
    }
    this.#tutorRedaction = {
      tail: latestTurn.join("").slice(-STREAM_CONTEXT_LENGTH),
      suppression: null,
    };
  }

  async #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.#operationTail.then(operation, operation);
    this.#operationTail = pending.then(
      () => undefined,
      () => undefined,
    );
    return await pending;
  }
}

export async function findActiveTranscript(
  options: FindActiveTranscriptOptions,
): Promise<TranscriptSnapshot | null> {
  const store = await FileTranscriptStore.openActive(options);
  return store === null ? null : await store.snapshot();
}

export function transcriptDirectory(userDataPath: string, courseId: string): string {
  return path.join(courseDataDirectory(userDataPath, courseId), TRANSCRIPT_DIRECTORY);
}

export function transcriptPath(userDataPath: string, courseId: string, sessionId: string): string {
  assertUuid(courseId, "course ID");
  assertUuid(sessionId, "session ID");
  return path.join(transcriptDirectory(userDataPath, courseId), `${sessionId.toLowerCase()}.jsonl`);
}

export function rehydrateMessages(entries: readonly TranscriptEntry[]): RehydratedMessage[] {
  const messages: RehydratedMessage[] = [];
  let tutor: RehydratedMessage | null = null;
  for (const entry of entries) {
    if (entry.kind === "learner") {
      tutor = null;
      messages.push({
        id: `learner-${String(entry.sequence)}`,
        role: "learner",
        content: entry.text,
        partial: false,
      });
    } else if (entry.kind === "tutor_delta") {
      if (tutor === null) {
        tutor = {
          id: `tutor-${String(entry.sequence)}`,
          role: "tutor",
          content: entry.delta,
          partial: true,
        };
        messages.push(tutor);
      } else {
        tutor.content += entry.delta;
      }
    } else if (entry.kind === "turn_complete") {
      if (tutor !== null) tutor.partial = false;
      tutor = null;
    }
  }
  return messages;
}

async function readTranscript(
  artifactPath: string,
  expectedCourseId: string,
  expectedSessionId: string,
): Promise<ReadResult> {
  const bytes = await readFile(artifactPath);
  let header: TranscriptHeader | null = null;
  const entries: TranscriptEntry[] = [];
  let offset = 0;
  let recoveredMalformedTail = false;
  let missingFinalNewline = false;
  let validByteLength = 0;
  let lineNumber = 0;

  while (offset < bytes.length) {
    lineNumber += 1;
    const lineStart = offset;
    const newline = bytes.indexOf(0x0a, offset);
    const hasNewline = newline !== -1;
    const lineEnd = hasNewline ? newline : bytes.length;
    let lineBytes = bytes.subarray(lineStart, lineEnd);
    if (lineBytes.at(-1) === 0x0d) lineBytes = lineBytes.subarray(0, -1);
    const isFinalPhysicalLine = !hasNewline || lineEnd + 1 === bytes.length;

    try {
      const value = JSON.parse(lineBytes.toString("utf8")) as unknown;
      if (header === null) {
        header = parseHeader(value);
        if (header.courseId !== expectedCourseId || header.sessionId !== expectedSessionId) {
          throw new TypeError("Transcript header identity does not match its app-data path");
        }
      } else {
        const entry = parseEntry(value);
        if (entry.sequence !== entries.length + 1) {
          throw new TypeError("Transcript entry sequence is not contiguous");
        }
        entries.push(entry);
      }
      validByteLength = hasNewline ? lineEnd + 1 : lineEnd;
    } catch (cause) {
      const recoverableTail =
        header !== null && isFinalPhysicalLine && !(cause instanceof UnsafeStoredTextError);
      if (!recoverableTail) {
        throw new TranscriptCorruptionError(
          header === null ? "Transcript header is corrupt" : "Transcript history is corrupt",
          artifactPath,
          lineNumber,
          { cause },
        );
      }
      recoveredMalformedTail = true;
      validByteLength = lineStart;
      break;
    }

    offset = hasNewline ? lineEnd + 1 : lineEnd;
    if (!hasNewline) missingFinalNewline = true;
  }

  if (header === null) {
    throw new TranscriptCorruptionError("Transcript is empty", artifactPath, null);
  }
  try {
    validateEntryChain(entries);
    for (const message of rehydrateMessages(entries)) {
      assertRehydratedText(message.content, "message");
    }
  } catch (cause) {
    throw new TranscriptCorruptionError(
      "Transcript ordering or stored text is corrupt",
      artifactPath,
      null,
      { cause },
    );
  }

  return {
    header,
    entries,
    recoveredMalformedTail,
    missingFinalNewline,
    validByteLength,
  };
}

function parseHeader(value: unknown): TranscriptHeader {
  if (!isRecord(value)) throw new TypeError("Transcript header must be an object");
  requireKeys(value, ["kind", "formatVersion", "courseId", "sessionId", "createdAt"]);
  if (value.kind !== "session_opened") throw new TypeError("Transcript header kind is invalid");
  if (value.formatVersion !== TRANSCRIPT_FORMAT_VERSION) {
    throw new TypeError("Transcript format version is unsupported");
  }
  assertUuid(value.courseId, "course ID");
  assertUuid(value.sessionId, "session ID");
  assertTimestamp(value.createdAt, "header timestamp");
  return {
    kind: "session_opened",
    formatVersion: TRANSCRIPT_FORMAT_VERSION,
    courseId: value.courseId.toLowerCase(),
    sessionId: value.sessionId.toLowerCase(),
    createdAt: value.createdAt,
  };
}

function parseEntry(value: unknown): TranscriptEntry {
  if (!isRecord(value)) throw new TypeError("Transcript entry must be an object");
  const baseKeys = ["kind", "sequence", "recordedAt"];
  if (!Number.isSafeInteger(value.sequence) || Number(value.sequence) <= 0) {
    throw new TypeError("Transcript sequence is invalid");
  }
  assertTimestamp(value.recordedAt, "entry timestamp");
  if (typeof value.kind !== "string") throw new TypeError("Transcript entry kind is invalid");
  const base: EntryBase = { sequence: Number(value.sequence), recordedAt: value.recordedAt };

  if (value.kind === "operator") {
    requireKeys(value, [...baseKeys, "text"]);
    assertStoredText(value.text, "operator text");
    return { ...base, kind: value.kind, text: value.text };
  }
  if (value.kind === "learner") {
    requireKeys(value, [...baseKeys, "text"]);
    assertStoredText(value.text, "learner text");
    return { ...base, kind: value.kind, text: value.text };
  }
  if (value.kind === "tutor_delta") {
    requireKeys(value, [...baseKeys, "delta"]);
    assertStoredText(value.delta, "tutor delta", true);
    return { ...base, kind: value.kind, delta: value.delta };
  }
  if (value.kind === "tool_activity") {
    requireKeys(value, [...baseKeys, "name", "summary"]);
    assertStoredText(value.name, "tool name");
    assertStoredText(value.summary, "tool summary");
    return { ...base, kind: value.kind, name: value.name, summary: value.summary };
  }
  if (value.kind === "approval") {
    requireKeys(value, [...baseKeys, "requestId", "toolName", "summary", "outcome"], ["reason"]);
    assertIdentifier(value.requestId, "approval request ID");
    assertStoredText(value.toolName, "approval tool name");
    assertStoredText(value.summary, "approval summary");
    if (
      value.outcome !== "requested" &&
      value.outcome !== "allowed" &&
      value.outcome !== "denied"
    ) {
      throw new TypeError("Approval outcome is invalid");
    }
    if (value.reason !== undefined) assertStoredText(value.reason, "approval reason");
    return {
      ...base,
      kind: value.kind,
      requestId: value.requestId,
      toolName: value.toolName,
      summary: value.summary,
      outcome: value.outcome,
      ...(value.reason === undefined ? {} : { reason: value.reason }),
    };
  }
  if (value.kind === "usage") {
    requireKeys(value, [...baseKeys, "totalCostUsd"]);
    if (
      typeof value.totalCostUsd !== "number" ||
      !Number.isFinite(value.totalCostUsd) ||
      value.totalCostUsd < 0
    ) {
      throw new TypeError("Transcript usage is invalid");
    }
    return { ...base, kind: value.kind, totalCostUsd: value.totalCostUsd };
  }
  if (value.kind === "turn_complete") {
    requireKeys(value, baseKeys);
    return { ...base, kind: value.kind };
  }
  if (value.kind === "agent_ended") {
    requireKeys(value, [...baseKeys, "reason"]);
    if (value.reason !== "ended" && value.reason !== "died") {
      throw new TypeError("Agent end reason is invalid");
    }
    return { ...base, kind: value.kind, reason: value.reason };
  }
  if (value.kind === "lifecycle") {
    requireKeys(value, [...baseKeys, "state"], ["detail"]);
    if (!isLifecycleState(value.state)) throw new TypeError("Lifecycle state is invalid");
    if (value.detail !== undefined) assertStoredText(value.detail, "lifecycle detail");
    return {
      ...base,
      kind: value.kind,
      state: value.state,
      ...(value.detail === undefined ? {} : { detail: value.detail }),
    };
  }
  throw new TypeError("Transcript entry kind is unsupported");
}

function validateEntryChain(entries: readonly TranscriptEntry[]): void {
  if (entries[0]?.kind !== "lifecycle" || entries[0].state !== "open") {
    throw new TypeError("Transcript must begin with the open lifecycle record");
  }
  let lifecycle: TranscriptLifecycleState = "open";
  for (const [index, entry] of entries.entries()) {
    if (entry.sequence !== index + 1) throw new TypeError("Transcript sequence is not contiguous");
    if (lifecycle === "closed" && index > 0) {
      throw new TypeError("Transcript contains entries after close");
    }
    if (entry.kind === "lifecycle") {
      if (entry.state === "open" && index !== 0) {
        throw new TypeError("Transcript repeats its open lifecycle record");
      }
      lifecycle = entry.state;
    }
  }
}

function isLifecycleState(value: unknown): value is TranscriptLifecycleState {
  return value === "open" || value === "wrapping" || value === "close_failed" || value === "closed";
}

function assertStoredText(
  value: unknown,
  label: string,
  allowEmpty = false,
): asserts value is string {
  if (
    typeof value !== "string" ||
    (!allowEmpty && value.length === 0) ||
    value.length > 256 * 1024
  ) {
    throw new TypeError(`Stored ${label} is invalid`);
  }
  if (redactCredentialText(value) !== value) {
    throw new UnsafeStoredTextError(`Stored ${label} contains credential-shaped data`);
  }
}

/**
 * The read-side re-check for REHYDRATED (concatenated) messages. The streaming
 * redactor can only redact the unflushed part of a match — a delta ending
 * "Bearer " is already durable when the next delta's token gets redacted — so
 * legitimate stored text can read "Bearer [credential redacted]", which the
 * raw-secret patterns would flag. Check each segment BETWEEN sanctioned
 * redaction markers instead: a real secret inside a segment still throws,
 * while the writer's own output never does. (No per-entry length cap here —
 * a long streamed turn legitimately concatenates past it.)
 */
function assertRehydratedText(value: string, label: string): void {
  for (const segment of value.split(REDACTION)) {
    if (redactCredentialText(segment) !== segment) {
      throw new UnsafeStoredTextError(`Stored ${label} contains credential-shaped data`);
    }
  }
}

function assertIdentifier(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u.test(value)) {
    throw new TypeError(`The ${label} is invalid`);
  }
}

function assertTimestamp(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new TypeError(`Transcript ${label} is invalid`);
  }
}

function timestamp(clock: () => Date): string {
  const value = clock();
  if (Number.isNaN(value.getTime()))
    throw new TypeError("Transcript clock returned an invalid date");
  return value.toISOString();
}

interface CredentialMatch {
  start: number;
  end: number;
  suppression: "token" | "line";
}

function redactCredentialText(value: string): string {
  const matches = credentialMatches(value);
  if (matches.length === 0) return value;
  let output = "";
  let cursor = 0;
  for (const match of matches) {
    output += value.slice(cursor, match.start);
    output += REDACTION;
    cursor = match.end;
  }
  return output + value.slice(cursor);
}

function redactStreamingText(
  state: StreamRedactionState,
  input: string,
): { text: string; state: StreamRedactionState } {
  let candidate = input;
  if (state.suppression !== null) {
    const delimiter = suppressionDelimiter(candidate, state.suppression);
    if (delimiter === -1) return { text: "", state };
    candidate = candidate.slice(delimiter);
    state = { tail: "", suppression: null };
  }

  const combined = state.tail + candidate;
  const boundary = state.tail.length;
  const matches = credentialMatches(combined);
  let output = "";
  let cursor = boundary;
  let suppression: StreamRedactionState["suppression"] = null;
  for (const match of matches) {
    if (match.end <= boundary) continue;
    const visibleStart = Math.max(match.start, boundary);
    if (visibleStart > cursor) output += combined.slice(cursor, visibleStart);
    output += REDACTION;
    cursor = Math.max(cursor, match.end);
    if (match.end === combined.length) suppression = match.suppression;
  }
  output += combined.slice(cursor);

  return {
    text: output,
    state:
      suppression === null
        ? { tail: combined.slice(-STREAM_CONTEXT_LENGTH), suppression: null }
        : { tail: "", suppression },
  };
}

function credentialMatches(value: string): CredentialMatch[] {
  const matches: CredentialMatch[] = [];
  const collect = (expression: RegExp, suppression: CredentialMatch["suppression"]): void => {
    for (const match of value.matchAll(expression)) {
      if (match.index === undefined || match[0].length === 0) continue;
      matches.push({ start: match.index, end: match.index + match[0].length, suppression });
    }
  };

  collect(
    /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY-----|$)/giu,
    "line",
  );
  collect(/\bsk-[A-Za-z0-9_-]{8,}/gu, "token");
  collect(/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/gu, "token");
  collect(/\bAKIA[0-9A-Z]{16}\b/gu, "token");
  collect(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu, "token");
  collect(/\bBearer\s+[^\s,;]+/giu, "token");
  collect(/\b(?:Authorization|Cookie|Set-Cookie)\s*:\s*[^\r\n]+/giu, "line");
  collect(
    /["']?(?:authorization|cookie|credential|password|secret|access[_-]?token|refresh[_-]?token|api[_-]?key)["']?\s*[:=]\s*["']?[^"',;\s}\]]+["']?/giu,
    "token",
  );
  collect(
    /\b[A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|CREDENTIAL|COOKIE|API_KEY)\s*=\s*[^\s]+/gu,
    "token",
  );

  matches.sort((left, right) => left.start - right.start || right.end - left.end);
  const merged: CredentialMatch[] = [];
  for (const match of matches) {
    const previous = merged.at(-1);
    if (previous !== undefined && match.start < previous.end) {
      previous.end = Math.max(previous.end, match.end);
      if (match.suppression === "line") previous.suppression = "line";
    } else {
      merged.push({ ...match });
    }
  }
  return merged;
}

function suppressionDelimiter(value: string, suppression: "token" | "line"): number {
  const match = suppression === "token" ? /[\s,;]/u.exec(value) : /[\r\n]/u.exec(value);
  return match?.index ?? -1;
}

function requireKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): void {
  const actual = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !(key in value)) || actual.some((key) => !allowed.has(key))) {
    throw new TypeError("Transcript record contains missing or unsupported fields");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function appendDurably(filePath: string, text: string): Promise<void> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(filePath, "a", 0o600);
    await handle.writeFile(text, "utf8");
    await handle.sync();
  } finally {
    await handle?.close();
  }
  await makePrivateFile(filePath);
}

async function truncateDurably(filePath: string, length: number): Promise<void> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(filePath, "r+");
    await handle.truncate(length);
    await handle.sync();
  } finally {
    await handle?.close();
  }
}

async function makePrivateDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await applyPrivateMode(directory, 0o700);
}

async function makePrivateFile(filePath: string): Promise<void> {
  await applyPrivateMode(filePath, 0o600);
}

async function applyPrivateMode(target: string, mode: number): Promise<void> {
  try {
    await chmod(target, mode);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (
      process.platform !== "win32" ||
      (code !== "EPERM" && code !== "ENOSYS" && code !== "EINVAL")
    ) {
      throw error;
    }
  }
}
