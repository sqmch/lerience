// Stub storage only. The harness renders the production ReadingLesson component.
import { READING_LESSONS, READING_MODULE } from "./reading-material";
import type { ReadingRevision } from "./reading-state";
import { renderDocMarkdown } from "../../src/renderer/src/markdown";
import { readPassages } from "../../src/renderer/src/course/reading-selection";
import type {
  ReadingCommand,
  ReadingMark,
  ReadingReply,
  ReadingView,
} from "../../src/shared/reading";
let revision: ReadingRevision = "original",
  recordRevision = 0;
let marks: ReadingMark[] = [];
export const readingPreviewStore = {
  onChange: () => {},
  setRevision(value: ReadingRevision) {
    revision = value;
    this.onChange();
  },
  markdown: () => READING_LESSONS[revision],
  async execute(command: ReadingCommand): Promise<ReadingReply> {
    const markdown = READING_LESSONS[revision];
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(markdown))),
    )
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("");
    const root = document.createElement("div");
    root.innerHTML = `<div class="prose">${renderDocMarkdown(markdown)}</div>`;
    const passages = readPassages(root).map(({ index, heading, text }) => ({
      index,
      heading,
      text,
    }));
    if (command.operation === "add" && !marks.some((m) => m.id === command.id)) {
      if (command.sourceDigest !== digest || command.revision !== recordRevision)
        return { ok: false, detail: "The lesson or highlights changed. Try again." };
      const { operation, revision: expected, ...mark } = command;
      void operation;
      void expected;
      marks = [
        ...marks,
        {
          ...mark,
          courseId: "00000000-0000-4000-8000-000000000015",
          lessonPath: `curriculum/${READING_MODULE}/LESSON.md`,
          createdAt: new Date().toISOString(),
        },
      ];
      recordRevision++;
    }
    if (command.operation === "remove") {
      marks = marks.filter((m) => m.id !== command.id);
      recordRevision++;
    }
    const matches: ReadingView["matches"] = {};
    for (const mark of marks) {
      const same = passages.filter((p) => p.text === mark.text && p.heading === mark.heading);
      const match =
        mark.sourceDigest === digest
          ? same.find((p) => p.index === mark.index)
          : same.length === 1
            ? same[0]
            : undefined;
      matches[mark.id] = match
        ? { index: match.index, changed: mark.sourceDigest !== digest }
        : null;
    }
    return {
      ok: true,
      view: {
        supported: true,
        revision: recordRevision,
        marks,
        source: { digest, markdown, passages },
        matches,
      },
    };
  },
};
