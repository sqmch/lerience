export interface Passage {
  index: number;
  heading: string;
  text: string;
  element: HTMLParagraphElement;
}
/** A deliberately narrow extraction: direct prose paragraphs, UTF-16 textContent offsets.
 * Inline emphasis/links contribute text; tables, code, lists and visuals do not. */
export function readPassages(root: HTMLElement): Passage[] {
  const prose = root.querySelector(".prose");
  if (!prose) return [];
  const headings: string[] = [];
  const result: Passage[] = [];
  for (const element of Array.from(prose.children)) {
    if (/^H[1-6]$/.test(element.tagName)) {
      const level = Number(element.tagName.slice(1));
      headings.length = level;
      headings[level - 1] = element.textContent ?? "";
    } else if (element instanceof HTMLParagraphElement) {
      result.push({
        index: result.length,
        heading: headings.filter(Boolean).join(" / "),
        text: element.textContent ?? "",
        element,
      });
    }
  }
  return result;
}

/** Maps offsets back across inline nodes without rewriting the markdown DOM. */
export function passageRange(passage: Passage, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(passage.element, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let offset = 0;
  let hasStart = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;
    if (!hasStart && start <= offset + length) {
      range.setStart(node, start - offset);
      hasStart = true;
    }
    if (hasStart && end <= offset + length) {
      range.setEnd(node, end - offset);
      return range;
    }
    offset += length;
  }
  return null;
}

export function selectedPassage(
  passages: Passage[],
  selection: Selection,
): { passage: Passage; start: number; end: number; range: Range } | null {
  if (selection.isCollapsed || selection.rangeCount !== 1) return null;
  const range = selection.getRangeAt(0);
  const passage = passages.find(
    (entry) =>
      entry.element.contains(range.startContainer) && entry.element.contains(range.endContainer),
  );
  if (!passage) return null;
  const before = range.cloneRange();
  before.selectNodeContents(passage.element);
  before.setEnd(range.startContainer, range.startOffset);
  const start = before.toString().length;
  return { passage, start, end: start + range.toString().length, range };
}
