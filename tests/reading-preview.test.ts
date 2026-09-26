// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderDocMarkdown } from "../src/renderer/src/markdown";
import { READING_LESSONS } from "../dev/renderer-harness/reading-material";
import {
  appendMark,
  makeMark,
  matchMark,
  passageRange,
  readPassages,
  selectedPassage,
  type ReadingRevision,
} from "../dev/renderer-harness/reading-state";

function lesson(revision: ReadingRevision) {
  const root = document.createElement("div");
  root.innerHTML = `<div class="prose">${renderDocMarkdown(READING_LESSONS[revision])}</div>`;
  document.body.replaceChildren(root);
  return readPassages(root);
}

function collectionMark() {
  const passage = lesson("original").find((entry) => entry.heading.endsWith("Collection"))!;
  const start = passage.text.indexOf("Collection alone");
  return makeMark(passage, start, passage.text.length, "original", 1)!;
}

describe("disposable reading anchors", () => {
  it("returns to unchanged text and relocates an exact paragraph after an insertion", () => {
    const mark = collectionMark();
    expect(matchMark(mark, lesson("original"), "original")?.index).toBe(mark.index);
    const relocated = matchMark(mark, lesson("inserted"), "inserted");
    expect(relocated?.index).toBe(mark.index + 1);
    expect(relocated?.text).toBe(mark.text);
    expect(mark.revision).toBe("original");
  });

  it.each(["changed", "ambiguous", "missing"] as const)(
    "retains a saved quote without attaching to %s material",
    (revision) => {
      const mark = collectionMark();
      const before = structuredClone(mark);
      expect(matchMark(mark, lesson(revision), revision)).toBeNull();
      expect(mark).toEqual(before);
      expect(mark.quote).toBe("Collection alone does not refill the tray.");
    },
  );

  it("uses the index only in the original snapshot, and refuses changed heading context", () => {
    const passages = lesson("ambiguous");
    const duplicates = passages.filter((entry) => entry.heading.endsWith("Collection"));
    const second = duplicates[1]!;
    const mark = makeMark(second, 0, second.text.length, "ambiguous", 2)!;
    expect(matchMark(mark, passages, "ambiguous")).toBe(second);
    expect(matchMark(mark, passages, "inserted")).toBeNull();
    expect(matchMark(mark, [{ ...second, heading: "Another heading" }], "ambiguous")).toBeNull();
  });

  it("maps selection across inline emphasis and links without altering the DOM", () => {
    const root = document.createElement("div");
    root.innerHTML =
      '<div class="prose"><h1>Words</h1><p>A <strong>parcel 📦</strong> follows <a href="BRIEF.md">this link</a>.</p><pre><code>excluded</code></pre><table><tr><td><p>excluded too</p></td></tr></table></div>';
    document.body.replaceChildren(root);
    const before = root.innerHTML;
    const passages = readPassages(root);
    expect(passages).toHaveLength(1);
    const passage = passages[0]!;
    const start = passage.text.indexOf("parcel");
    const end = passage.text.indexOf("link") + 4;
    const range = passageRange(passage, start, end)!;
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    expect(selectedPassage(passages, selection)).toMatchObject({ start, end });
    expect(range.toString()).toBe("parcel 📦 follows this link");
    expect(root.innerHTML).toBe(before);
    expect(root.querySelector("a")?.getAttribute("href")).toBe("BRIEF.md");
  });

  it("refuses cross-paragraph, blank and invalid ranges", () => {
    const passages = lesson("original");
    const first = passages[0]!;
    const second = passages[1]!;
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.setStart(first.element, 0);
    range.setEnd(second.element, 1);
    selection.removeAllRanges();
    selection.addRange(range);
    expect(selectedPassage(passages, selection)).toBeNull();
    for (const [start, end] of [
      [-1, 4],
      [0, 9999],
      [2, 2],
      [3, 1],
      [0.5, 4],
    ]) {
      expect(makeMark(first, start!, end!, "original", 1)).toBeNull();
    }
    const mark = collectionMark();
    expect(matchMark({ ...mark, quote: "different" }, lesson("original"), "original")).toBeNull();
  });

  it("deduplicates repeated saves but keeps independently removable overlapping marks", () => {
    const mark = collectionMark();
    const original = [mark];
    expect(appendMark(original, { ...mark, id: 2 })).toBe(original);
    const overlap = { ...mark, id: 3, start: mark.start + 1, quote: mark.quote.slice(1) };
    const both = appendMark(original, overlap);
    expect(both).toHaveLength(2);
    expect(both.filter((entry) => entry.id !== mark.id)).toEqual([overlap]);
  });
});
