/* Disposable reading preview. Records are memory-only and are not a course format. */
export const READING_REVISIONS = [
  "original",
  "inserted",
  "changed",
  "ambiguous",
  "missing",
] as const;
export type ReadingRevision = (typeof READING_REVISIONS)[number];

export interface Passage {
  index: number;
  heading: string;
  text: string;
  element: HTMLParagraphElement;
}
export interface ReadingMark {
  id: number;
  revision: ReadingRevision;
  index: number;
  heading: string;
  text: string;
  start: number;
  end: number;
  quote: string;
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

export function makeMark(
  passage: Passage,
  start: number,
  end: number,
  revision: ReadingRevision,
  id: number,
): ReadingMark | null {
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end > passage.text.length ||
    start >= end
  )
    return null;
  const quote = passage.text.slice(start, end);
  if (!quote.trim()) return null;
  return {
    id,
    revision,
    index: passage.index,
    heading: passage.heading,
    text: passage.text,
    start,
    end,
    quote,
  };
}

export function matchMark(
  mark: ReadingMark,
  passages: Passage[],
  revision: ReadingRevision,
): Passage | null {
  if (mark.text.slice(mark.start, mark.end) !== mark.quote) return null;
  const candidates = passages.filter(
    (passage) => passage.heading === mark.heading && passage.text === mark.text,
  );
  if (mark.revision === revision)
    return candidates.find((passage) => passage.index === mark.index) ?? null;
  return candidates.length === 1 ? (candidates[0] ?? null) : null;
}

export function appendMark(marks: ReadingMark[], mark: ReadingMark): ReadingMark[] {
  return marks.some(
    (entry) =>
      entry.revision === mark.revision &&
      entry.index === mark.index &&
      entry.start === mark.start &&
      entry.end === mark.end,
  )
    ? marks
    : [...marks, mark];
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
