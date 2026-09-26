import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { readingCommand, readingView, type ReadingReply } from "../shared/reading";
import type { ProcessRunner } from "./scripts/process-runner";
/** Fixed course-local writer, resolved only after validating the current course. */
export class ReadingService {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly runner: ProcessRunner,
    private readonly isCurrent: (root: string) => boolean,
  ) {}
  execute(root: string, input: unknown): Promise<ReadingReply> {
    const parsed = readingCommand.safeParse(input);
    if (!parsed.success)
      return Promise.resolve({ ok: false, detail: "Invalid highlight request." });
    const work = this.queue.then(async (): Promise<ReadingReply> => {
      if (!this.isCurrent(root))
        return { ok: false, detail: "The course changed. Reopen its highlights." };
      try {
        let capability: unknown = null;
        try {
          const info = await lstat(path.join(root, "reading-capability.json"));
          if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 1024)
            throw new Error("Invalid capability");
          capability = JSON.parse(
            await readFile(path.join(root, "reading-capability.json"), "utf8"),
          );
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        const cap = capability as Record<string, unknown> | null;
        if (
          !cap ||
          Object.keys(cap).length !== 2 ||
          cap.schemaVersion !== 1 ||
          cap.reading !== "passage-marks-v1"
        )
          return parsed.data.operation === "read"
            ? {
                ok: true,
                view: { supported: false, revision: 0, marks: [], source: null, matches: {} },
              }
            : { ok: false, detail: "This course does not support highlight writes." };
        for (const relative of [
          "scripts",
          "scripts/reading.mjs",
          "scripts/reading-extract.mjs",
          "scripts/validate.mjs",
          "scripts/vendor",
          "scripts/vendor/marked.mjs",
          "docs",
          "docs/schema",
          "docs/schema/reading-marks.schema.json",
        ]) {
          const info = await lstat(path.join(root, relative));
          if (info.isSymbolicLink() || (info.isFile() && info.nlink !== 1))
            throw new Error("Linked reading engine");
        }
        if (JSON.stringify(parsed.data).length > 64000) throw new Error("Oversized request");
        const result = await this.runner.run({
          entryPoint: path.join(root, "scripts/reading.mjs"),
          args: [root, "--ipc"],
          cwd: root,
          timeoutMs: 15000,
          maxOutputBytes: 4 * 1024 * 1024,
          serviceName: "Lerience highlights",
          input: parsed.data,
          ipcReply: true,
        });
        if (result.termination !== "exit" || result.exitCode !== 0)
          return {
            ok: false,
            detail:
              "Saving could not be confirmed. Retry the same action to check its saved result.",
          };
        const reply = JSON.parse(result.stdout) as Record<string, unknown>;
        if (reply.ok === true) return { ok: true, view: readingView.parse(reply.view) };
        if (reply.ok === false && typeof reply.detail === "string")
          return { ok: false, detail: reply.detail.slice(0, 2000) };
        throw new Error("Invalid reply");
      } catch {
        return {
          ok: false,
          detail: "Highlight storage is unavailable. Keep the unsaved quote and retry.",
        };
      }
    });
    this.queue = work.catch(() => undefined);
    return work;
  }
}
