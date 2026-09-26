// @vitest-environment jsdom
import { expect, it } from "vitest";
import {
  readPassages,
  passageRange,
  selectedPassage,
} from "../src/renderer/src/course/reading-selection";
it("maps UTF16 selection across inline emphasis and links without rewriting teaching DOM", () => {
  const root = document.createElement("div");
  root.innerHTML =
    '<div class="prose"><h1>Rule</h1><p>A <strong>bold</strong> <a href="BRIEF.md">link</a> \u{1f600}.</p><pre>code</pre><p>Next</p></div>';
  document.body.append(root);
  const before = root.innerHTML,
    passages = readPassages(root);
  expect(passages).toHaveLength(2);
  const range = passageRange(passages[0]!, 2, 11)!;
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  expect(selectedPassage(passages, selection)).toMatchObject({ start: 2, end: 11 });
  expect(range.toString()).toBe("bold link");
  expect(root.innerHTML).toBe(before);
  range.setEnd(passages[1]!.element.firstChild!, 2);
  expect(selectedPassage(passages, selection)).toBeNull();
  root.remove();
});
