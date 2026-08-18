import { appendFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  FileTranscriptStore,
  TranscriptCorruptionError,
  findActiveTranscript,
  transcriptPath,
} from "../src/main/session/transcript-store";

const COURSE_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const SECOND_SESSION_ID = "33333333-3333-4333-8333-333333333333";
const temporaryRoots: string[] = [];

async function temporaryUserData(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "praxeum-transcript-test-"));
  temporaryRoots.push(root);
  return root;
}

function clockFrom(start: string): () => Date {
  let next = Date.parse(start);
  return () => {
    const result = new Date(next);
    next += 1_000;
    return result;
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("FileTranscriptStore", () => {
  it("writes a v1 header and ordered normalized records, then rehydrates complete and partial turns", async () => {
    const userDataPath = await temporaryUserData();
    const store = await FileTranscriptStore.create({
      userDataPath,
      courseId: COURSE_ID,
      sessionId: SESSION_ID,
      clock: clockFrom("2026-08-12T00:00:00.000Z"),
    });

    await store.append({ kind: "operator", text: "start session" });
    await store.append({ kind: "tutor_delta", delta: "Opening " });
    await store.append({ kind: "tool_activity", name: "Read", summary: "Reading COURSE.md" });
    await store.append({ kind: "tutor_delta", delta: "question" });
    await store.append({ kind: "turn_complete" });
    await store.append({ kind: "learner", text: "My answer" });
    await store.append({
      kind: "approval",
      requestId: "tool-1",
      toolName: "Bash",
      summary: "Run checks",
      outcome: "requested",
    });
    await store.append({ kind: "usage", totalCostUsd: 0.03 });
    await store.append({ kind: "tutor_delta", delta: "Partial reply" });

    const reopened = await FileTranscriptStore.open({
      userDataPath,
      courseId: COURSE_ID,
      sessionId: SESSION_ID,
    });
    const snapshot = await reopened.snapshot();
    expect(snapshot.header).toMatchObject({
      kind: "session_opened",
      formatVersion: 1,
      courseId: COURSE_ID,
      sessionId: SESSION_ID,
    });
    expect(snapshot.entries.map((entry) => entry.sequence)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(snapshot.messages).toEqual([
      { id: "tutor-3", role: "tutor", content: "Opening question", partial: false },
      { id: "learner-7", role: "learner", content: "My answer", partial: false },
      { id: "tutor-10", role: "tutor", content: "Partial reply", partial: true },
    ]);
    expect(snapshot.lifecycle).toBe("open");
    expect(snapshot.active).toBe(true);
  });

  it("recovers only a malformed final line and truncates it before later appends", async () => {
    const userDataPath = await temporaryUserData();
    const store = await FileTranscriptStore.create({
      userDataPath,
      courseId: COURSE_ID,
      sessionId: SESSION_ID,
    });
    await store.append({ kind: "learner", text: "Kept" });
    await appendFile(store.artifactPath, '{"kind":"tutor_delta","sequence":3');

    const recovered = await FileTranscriptStore.open({
      userDataPath,
      courseId: COURSE_ID,
      sessionId: SESSION_ID,
    });
    expect((await recovered.snapshot()).recoveredMalformedTail).toBe(true);
    await recovered.append({ kind: "tutor_delta", delta: "Still valid" });

    expect(await readFile(store.artifactPath, "utf8")).not.toContain('"sequence":3{"kind"');
    await expect(
      FileTranscriptStore.open({ userDataPath, courseId: COURSE_ID, sessionId: SESSION_ID }),
    ).resolves.toBeInstanceOf(FileTranscriptStore);
  });

  it("fails closed on corruption before the final line", async () => {
    const userDataPath = await temporaryUserData();
    const store = await FileTranscriptStore.create({
      userDataPath,
      courseId: COURSE_ID,
      sessionId: SESSION_ID,
    });
    const original = await readFile(store.artifactPath, "utf8");
    await writeFile(
      store.artifactPath,
      `${original}{broken\n${JSON.stringify({
        kind: "learner",
        sequence: 2,
        recordedAt: new Date().toISOString(),
        text: "valid tail",
      })}\n`,
    );

    await expect(
      FileTranscriptStore.open({ userDataPath, courseId: COURSE_ID, sessionId: SESSION_ID }),
    ).rejects.toBeInstanceOf(TranscriptCorruptionError);
  });

  it("reopens a transcript whose redaction landed after a durable 'Bearer ' prefix", async () => {
    const userDataPath = await temporaryUserData();
    const store = await FileTranscriptStore.create({
      userDataPath,
      courseId: COURSE_ID,
      sessionId: SESSION_ID,
    });
    // A natural chunk split: delta 1 ends exactly at the word boundary and is
    // durably written verbatim; delta 2 carries the token and gets redacted.
    // The rehydrated message legitimately reads "Bearer [credential redacted]"
    // — reopening must accept the writer's own sanctioned output, not brick
    // the course (this is routine content in any course teaching HTTP auth).
    await store.append({ kind: "tutor_delta", delta: "Send the header as Bearer " });
    await store.append({ kind: "tutor_delta", delta: "sk-live-abcdef123456 in curl." });
    await store.append({ kind: "turn_complete" });

    const reopened = await FileTranscriptStore.open({
      userDataPath,
      courseId: COURSE_ID,
      sessionId: SESSION_ID,
    });
    const snapshot = await reopened.snapshot();
    expect(snapshot.messages[0]?.content).toContain("Bearer [credential redacted]");
    expect(snapshot.messages[0]?.content).not.toContain("sk-live");
  });

  it("quarantines a corrupt transcript instead of blocking the course's sessions", async () => {
    const userDataPath = await temporaryUserData();
    const store = await FileTranscriptStore.create({
      userDataPath,
      courseId: COURSE_ID,
      sessionId: SESSION_ID,
    });
    await store.append({ kind: "learner", text: "kept" });
    const original = await readFile(store.artifactPath, "utf8");
    const [headerLine] = original.split("\n");
    // Interior corruption (not a recoverable tail): header + garbage + valid line.
    await writeFile(
      store.artifactPath,
      `${String(headerLine)}\n{broken\n${JSON.stringify({
        kind: "learner",
        sequence: 2,
        recordedAt: new Date().toISOString(),
        text: "valid tail",
      })}\n`,
    );

    // The scan quarantines the unreadable file (renamed aside, preserved) and
    // reports no active session rather than failing every future open.
    await expect(findActiveTranscript({ userDataPath, courseId: COURSE_ID })).resolves.toBeNull();
    const directory = path.dirname(transcriptPath(userDataPath, COURSE_ID, SESSION_ID));
    const { readdir } = await import("node:fs/promises");
    const names = await readdir(directory);
    expect(names.some((name) => name.includes(".corrupt-"))).toBe(true);
    expect(names.some((name) => name === `${SESSION_ID}.jsonl`)).toBe(false);
  });

  it("redacts credential-shaped text, including shapes split across tutor deltas", async () => {
    const userDataPath = await temporaryUserData();
    const store = await FileTranscriptStore.create({
      userDataPath,
      courseId: COURSE_ID,
      sessionId: SESSION_ID,
    });
    await store.append({ kind: "learner", text: "password=hunter2 and sk-abcdefgh" });
    await store.append({ kind: "tutor_delta", delta: "OPENAI_API_" });
    await store.append({ kind: "tutor_delta", delta: "KEY=env-secret " });
    await store.append({ kind: "tutor_delta", delta: "Authoriz" });
    await store.append({ kind: "tutor_delta", delta: "ation: header-secret\nSafe" });
    await store.append({ kind: "tool_activity", name: "Read", summary: "Bearer tool-secret" });
    await store.append({ kind: "turn_complete" });

    const raw = await readFile(store.artifactPath, "utf8");
    for (const secret of ["hunter2", "sk-abcdefgh", "env-secret", "header-secret", "tool-secret"]) {
      expect(raw).not.toContain(secret);
    }
    expect(raw).toContain("[credential redacted]");
    const messages = (await store.snapshot()).messages.map((message) => message.content).join("\n");
    expect(messages).not.toMatch(/hunter2|env-secret|header-secret/);
  });

  it("rejects a manually poisoned credential record instead of tail-recovering it", async () => {
    const userDataPath = await temporaryUserData();
    const store = await FileTranscriptStore.create({
      userDataPath,
      courseId: COURSE_ID,
      sessionId: SESSION_ID,
    });
    await appendFile(
      store.artifactPath,
      `${JSON.stringify({
        kind: "learner",
        sequence: 2,
        recordedAt: new Date().toISOString(),
        text: "Bearer raw-secret",
      })}\n`,
    );

    await expect(
      FileTranscriptStore.open({ userDataPath, courseId: COURSE_ID, sessionId: SESSION_ID }),
    ).rejects.toBeInstanceOf(TranscriptCorruptionError);
  });

  it("finds the most recently lifecycle-touched non-closed session", async () => {
    const userDataPath = await temporaryUserData();
    const first = await FileTranscriptStore.create({
      userDataPath,
      courseId: COURSE_ID,
      sessionId: SESSION_ID,
      clock: clockFrom("2026-08-12T00:00:00.000Z"),
    });
    await first.markLifecycle("close_failed", "Doctor found an incomplete close");
    const second = await FileTranscriptStore.create({
      userDataPath,
      courseId: COURSE_ID,
      sessionId: SECOND_SESSION_ID,
      clock: clockFrom("2026-08-12T01:00:00.000Z"),
    });

    expect(
      (await findActiveTranscript({ userDataPath, courseId: COURSE_ID }))?.header.sessionId,
    ).toBe(SECOND_SESSION_ID);
    await second.markLifecycle("wrapping");
    await second.markLifecycle("closed");
    expect(
      (await findActiveTranscript({ userDataPath, courseId: COURSE_ID }))?.header.sessionId,
    ).toBe(SESSION_ID);
    await first.markLifecycle("wrapping");
    await first.markLifecycle("closed");
    await expect(findActiveTranscript({ userDataPath, courseId: COURSE_ID })).resolves.toBeNull();
  });

  it("validates course and session UUIDs before deriving transcript paths", () => {
    expect(transcriptPath("C:/data", COURSE_ID, SESSION_ID)).toBe(
      path.join("C:/data", "courses", COURSE_ID, "sessions", `${SESSION_ID}.jsonl`),
    );
    expect(() => transcriptPath("C:/data", "../course", SESSION_ID)).toThrow(/UUID/);
    expect(() => transcriptPath("C:/data", COURSE_ID, "../session")).toThrow(/UUID/);
  });
});
