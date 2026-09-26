import { marked } from "./vendor/marked.mjs";
// Versioned narrow projection. Unsupported inline HTML/images/entities refuse
// a paragraph; teaching material still renders normally in the app.
export const EXTRACTION = "marked18-prose-v1";
const entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };
function decode(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (raw, name) => {
    if (name[0] !== "#") return entities[name] ?? raw;
    const n = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : Number(name.slice(1));
    return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : raw;
  });
}
function plain(tokens) {
  let text = "";
  for (const t of tokens ?? []) {
    if (["html", "image"].includes(t.type)) return null;
    if (t.tokens) {
      const child = plain(t.tokens);
      if (child === null) return null;
      text += child;
    } else if (t.type === "br") text += "";
    else if (["text", "escape", "codespan"].includes(t.type)) text += decode(t.text);
    else return null;
  }
  return text;
}
export function extractPassages(markdown) {
  const headings = [],
    passages = [];
  let index = 0;
  for (const token of marked.lexer(markdown)) {
    if (token.type === "heading") {
      headings.length = token.depth;
      headings[token.depth - 1] = plain(token.tokens);
    } else if (token.type === "paragraph") {
      const text = plain(token.tokens);
      const heading = headings.filter((h) => h !== undefined && h !== "").join(" / ");
      if (
        text !== null &&
        text.length <= 16000 &&
        heading.length <= 2000 &&
        !headings.includes(null)
      )
        passages.push({ index, heading, text });
      index++;
    }
  }
  return passages;
}
export function matchPassage(mark, source) {
  if (
    !source ||
    mark.extractionVersion !== EXTRACTION ||
    mark.text.slice(mark.start, mark.end) !== mark.quote
  )
    return null;
  const candidates = source.passages.filter(
    (p) => p.heading === mark.heading && p.text === mark.text,
  );
  return source.digest === mark.sourceDigest
    ? (candidates.find((p) => p.index === mark.index) ?? null)
    : candidates.length === 1
      ? candidates[0]
      : null;
}
