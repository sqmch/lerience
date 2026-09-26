import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  assessmentCommand,
  assessmentView,
  type AssessmentCommand,
  type AssessmentReply,
} from "../shared/assessment";
import type { ProcessRunner } from "./scripts/process-runner";

/** Resolves only fixed engine paths. The caller supplies its current course,
 * never a renderer-selected write path. State and checking stay in the engine. */
export class AssessmentService {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly runner: ProcessRunner,
    private readonly send: (message: string) => Promise<void>,
    private readonly isCurrent: (root: string) => boolean,
  ) {}

  execute(root: string, input: unknown): Promise<AssessmentReply> {
    const parsed = assessmentCommand.safeParse(input);
    if (!parsed.success)
      return Promise.resolve({ ok: false, detail: "Invalid assessment request." });
    const work = this.queue.then(async () => {
      if (!this.isCurrent(root))
        return { ok: false, detail: "The course changed. Reopen its assessment." } as const;
      try {
        return parsed.data.operation === "review"
          ? await this.review(root, parsed.data)
          : await this.run(root, parsed.data);
      } catch {
        return {
          ok: false,
          detail: "Assessment storage is unavailable. Keep your answers and retry.",
        } as const;
      }
    });
    this.queue = work.catch(() => undefined);
    return work;
  }

  private async run(root: string, command: Record<string, unknown>): Promise<AssessmentReply> {
    // Old courses have no assessment script. Inspect capability before execution,
    // so even an unknown/new script cannot create state through this app.
    let capability: unknown = null;
    try {
      if ((await lstat(path.join(root, "assessment-capability.json"))).isSymbolicLink())
        throw new Error("Linked capability");
      capability = JSON.parse(
        await readFile(path.join(root, "assessment-capability.json"), "utf8"),
      ) as unknown;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (
      typeof capability !== "object" ||
      capability === null ||
      Object.keys(capability).length !== 2 ||
      !("schemaVersion" in capability) ||
      capability.schemaVersion !== 1 ||
      !("assessment" in capability) ||
      capability.assessment !== "numeric-explanation-v1"
    ) {
      if (command.operation !== "read")
        return { ok: false, detail: "This course does not support assessment writes." };
      let present = false;
      try {
        await lstat(path.join(root, "curriculum", String(command.moduleId), "assessment.json"));
        present = true;
      } catch {
        /* Optional in older courses. */
      }
      return {
        ok: true,
        view: {
          state: present ? "unsupported" : "none",
          detail: present
            ? "This course does not support this assessment. The Brief remains available."
            : "",
          question: null,
          sourceDigest: null,
          attempts: [],
        },
      };
    }
    for (const relative of ["scripts", "scripts/assessment.mjs"]) {
      const info = await lstat(path.join(root, relative));
      if (info.isSymbolicLink() || (info.isFile() && info.nlink !== 1))
        throw new Error("Linked engine script");
    }
    if (JSON.stringify(command).length > 64000)
      return { ok: false, detail: "Assessment input is too large." };
    const result = await this.runner.run({
      entryPoint: path.join(root, "scripts/assessment.mjs"),
      args: [root, String(command.moduleId), String(command.operation), "--ipc"],
      cwd: root,
      timeoutMs: 15000,
      maxOutputBytes: 2 * 1024 * 1024,
      serviceName: "Lerience assessment",
      input: command,
    });
    if (result.termination !== "exit" || result.exitCode !== 0)
      return {
        ok: false,
        detail: "Saving could not be confirmed. Keep these answers and retry the same action.",
      };
    const reply = JSON.parse(result.stdout) as unknown;
    if (typeof reply !== "object" || reply === null) throw new Error("Bad engine response");
    const value = reply as Record<string, unknown>;
    if (value.ok === true) return { ok: true, view: assessmentView.parse(value.view) };
    if (value.ok === false && typeof value.detail === "string") {
      const fields = value.fields;
      return {
        ok: false,
        detail: value.detail.slice(0, 2000),
        ...(typeof fields === "object" &&
        fields !== null &&
        Object.values(fields).every((v) => typeof v === "string")
          ? { fields: fields as Record<string, string> }
          : {}),
      };
    }
    throw new Error("Bad engine response");
  }

  private async review(
    root: string,
    command: Extract<AssessmentCommand, { operation: "review" }>,
  ): Promise<AssessmentReply> {
    const read = await this.run(root, { operation: "read", moduleId: command.moduleId });
    if (!read.ok) return read;
    const attempt = read.view.attempts.find((a) => a.id === command.id && a.status === "submitted");
    if (!attempt)
      return { ok: false, detail: "Submit these answers locally before requesting review." };
    if (attempt.events.some((e) => e.id === command.requestId))
      return { ok: true, view: read.view };
    const pending = await this.run(root, {
      operation: "event",
      moduleId: command.moduleId,
      id: command.id,
      eventId: command.requestId,
      kind: "review",
      text: "Review delivery uncertain. A request was prepared; only an accepted delivery entry confirms it was sent.",
    });
    if (!pending.ok) return pending;
    if (!this.isCurrent(root))
      return { ok: false, detail: "Course changed before review. Local submission is saved." };
    let delivery: string;
    try {
      await this.send(
        `Please review the locally submitted assessment attempt ${attempt.id} in module ${command.moduleId}, bound to source digest ${attempt.sourceDigest}. Read its immutable snapshot and assistance history in tutor/assessments/${attempt.id}.json. Follow the canonical assessment protocol and append criterion-bound feedback with scripts/assessment.mjs. Keep numeric checks separate from reasoning. This request does not authorize progress, mastery or quiz changes.`,
      );
      delivery = "Review request accepted by the tutor session. Feedback may still be pending.";
    } catch {
      delivery =
        "Review delivery was not confirmed. The local submission is saved. Check the seminar before explicitly requesting another review.";
    }
    return await this.run(root, {
      operation: "event",
      moduleId: command.moduleId,
      id: command.id,
      eventId: randomUUID(),
      kind: "review",
      text: delivery,
    });
  }
}
