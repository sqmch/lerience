import { readFileSync } from "node:fs";
import path from "node:path";

export interface FrameOverlayColors {
  color: string;
  symbolColor: string;
}

export interface FrameColors {
  dark: FrameOverlayColors;
  light: FrameOverlayColors;
}

/* Resolved from the working directory rather than from this module: the config
   that calls it is bundled before it runs, so `import.meta` points at the
   bundle rather than at this file. Every build entry point runs from the
   repository root, and a wrong root fails the build loudly. */
const TOKENS = path.resolve(process.cwd(), "src/renderer/src/design/tokens.css");

/** The OS draws the caption buttons into the reserved strip of a bar the app
 * owns (ADR-016), and it needs their colours before any renderer exists: the
 * packaged runtime check shows a window for seconds, and every launch paints a
 * frame before React's first commit. The renderer still owns the colours at
 * runtime — it reads the resolved tokens and pushes them over IPC — so these
 * are read from the same token file at build time rather than restated in the
 * main process, where they would be a second source of truth for colour
 * (ADR-017). Reading the wrong token, or reading none, fails the build. */
export function readFrameColors(source: string = readFileSync(TOKENS, "utf8")): FrameColors {
  return {
    dark: overlayColors(source, ":root {"),
    light: overlayColors(source, ':root[data-theme="light"]'),
  };
}

function overlayColors(source: string, selector: string): FrameOverlayColors {
  const block = paletteBlock(source, selector);
  return {
    color: token(block, "chrome", selector),
    symbolColor: token(block, "ink-dim", selector),
  };
}

function paletteBlock(source: string, selector: string): string {
  const start = source.indexOf(selector);
  if (start < 0) throw new Error(`tokens.css has no ${selector} palette block.`);
  const open = source.indexOf("{", start);
  let depth = 1;
  let index = open + 1;
  while (depth > 0 && index < source.length) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    index += 1;
  }
  return source.slice(open + 1, index - 1);
}

function token(block: string, name: string, selector: string): string {
  const match = new RegExp(String.raw`--${name}:\s*(#[0-9a-fA-F]{6})\b`, "u").exec(block);
  if (match?.[1] === undefined) {
    throw new Error(`tokens.css does not define --${name} as a hex in ${selector}.`);
  }
  return match[1];
}
