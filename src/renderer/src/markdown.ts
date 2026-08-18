/* Course markdown → sanitized HTML. Carried from the previous project's
   lib/markdown.ts, plus the engine study's `visual` fence renderer.

   Two Marked instances on purpose (the study's rule): the DOC instance knows
   the ```visual fence; the plain instance is for journal entries and notes,
   where a visual fence is not a thing and must render as ordinary code. */

import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import http from "highlight.js/lib/languages/http";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import typescript from "highlight.js/lib/languages/typescript";
import { Marked, type MarkedExtension } from "marked";
import { markedHighlight } from "marked-highlight";

hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("http", http);

const languageAliases: Readonly<Record<string, string>> = {
  jsonc: "json",
  sh: "bash",
  shell: "bash",
  ts: "typescript",
  js: "javascript",
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlighting(): MarkedExtension {
  return markedHighlight({
    langPrefix: "hljs language-",
    highlight(code, language) {
      const resolved = languageAliases[language] ?? language;
      if (resolved !== "" && hljs.getLanguage(resolved) !== undefined) {
        try {
          return hljs.highlight(code, { language: resolved }).value;
        } catch {
          // Unknown or malformed language input falls back to escaped plain code.
        }
      }
      return escapeHtml(code);
    },
  });
}

const plain = new Marked(highlighting());

/* The ```visual fence (engine FORMAT.md): a JSON spec claiming an embedded
   sandboxed visual. `file` required; height clamped 160–900, default 420. A
   malformed spec renders as a plain code block — never crash the doc. The
   fence becomes a PLACEHOLDER div; the component mounts the iframe with DOM
   APIs after sanitizing, so the sanitizer never has to allow iframes. */
const docs = new Marked(highlighting());
docs.use({
  renderer: {
    code(token: { text: string; lang?: string }): string | false {
      if ((token.lang ?? "").trim() !== "visual") return false;
      try {
        const spec = JSON.parse(token.text) as Record<string, unknown>;
        if (typeof spec["file"] !== "string") return false;
        const height = Math.max(160, Math.min(900, Number(spec["height"]) || 420));
        const title = typeof spec["title"] === "string" ? spec["title"] : "interactive visual";
        return (
          `<div class="doc-visual-embed" data-visual-file="${escapeHtml(spec["file"])}"` +
          ` data-visual-height="${String(height)}" data-visual-label="${escapeHtml(title)}"></div>`
        );
      } catch {
        return false;
      }
    },
  },
});

/** Journal entries, tutor notes — no visual fences. */
export function renderCourseMarkdown(raw: string): string {
  return DOMPurify.sanitize(plain.parse(raw, { async: false }));
}

/** Lessons and briefs — visual fences become sandboxed-embed placeholders. */
export function renderDocMarkdown(raw: string): string {
  return DOMPurify.sanitize(docs.parse(raw, { async: false }));
}
