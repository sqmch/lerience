/* Mechanizes the binding rules of the design system (ADR-008, ADR-015, ADR-017):

   1. "A raw hex, rgb(), oklch(), or magic px outside the token file is a
      review reject." The design layer itself (tokens.css, index.css, plus
      base.css and fonts.css, imported as part of the system) is the only
      exemption.
   2. "Keep the three palette blocks in sync" — dark, explicit light, and the
      OS-preference light mirror must define token-for-token the same set.
   3. No Tailwind stock-palette utilities. ADR-017 clears those namespaces so
      they cannot compile, which is the real enforcement; this is the guard
      against a future config quietly restoring them. Note that rule 1 already
      covers arbitrary-value utilities for free — `bg-[#0d0e10]` and `p-[13px]`
      put the raw value in the source line, where the scanners below find it. */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(import.meta.dirname, "../src");
const DESIGN_LAYER = ["tokens.css", "index.css", "base.css", "fonts.css"].map((name) =>
  path.join(SRC, "renderer", "src", "design", name),
);
// The labs directory is the engine study's stock labs, ported faithfully
// (ADR-012): their geometry answers to the visualizations' content, not to
// the token ladder, and staying byte-close to the engine source outranks
// re-cutting their values.
const ENGINE_PORT_DIR = path.join(SRC, "renderer", "src", "labs") + path.sep;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const checkable = walk(SRC).filter(
  (file) =>
    /\.(css|tsx|ts|html)$/.test(file) &&
    !DESIGN_LAYER.includes(file) &&
    !file.startsWith(ENGINE_PORT_DIR),
);

describe("token discipline outside the design layer", () => {
  it("finds the files it is supposed to police", () => {
    expect(checkable.length).toBeGreaterThan(0);
  });

  /** Comments explain values; they don't set them. Strip before scanning. */
  const stripComments = (source: string): string =>
    source
      .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, " "))
      .replace(/(^|\s)\/\/[^\n]*/g, "$1");

  const offenders = (pattern: RegExp, allowLine?: RegExp): string[] =>
    checkable.flatMap((file) => {
      const lines = stripComments(readFileSync(file, "utf8")).split("\n");
      return lines
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => pattern.test(line) && !(allowLine?.test(line) ?? false))
        .map(({ line, i }) => `${path.relative(SRC, file)}:${String(i + 1)} ${line.trim()}`);
    });

  it("has no raw hex colors", () => {
    expect(offenders(/#[0-9a-fA-F]{3,8}\b/)).toEqual([]);
  });

  it("has no raw color functions", () => {
    expect(offenders(/\b(?:rgba?|hsla?|oklch|oklab)\(/)).toEqual([]);
  });

  it("has no magic px values (breakpoint preludes answer to content, not rhythm)", () => {
    expect(offenders(/\b\d+(?:\.\d+)?px\b/, /@(?:media|container)\s/)).toEqual([]);
  });

  /* Tailwind's stock palette is a second source of truth for colour, which is
     exactly what the token architecture exists to prevent (ADR-017). The build
     already refuses these because the namespace is cleared; this fails louder
     and closer to the mistake. */
  const STOCK_PALETTE =
    "slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|" +
    "teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
  const COLOUR_UTILITIES =
    "bg|text|border|ring|fill|stroke|from|via|to|outline|decoration|shadow|accent|caret|divide|placeholder";

  it("has no Tailwind stock-palette utilities", () => {
    const pattern = new RegExp(
      `\\b(?:${COLOUR_UTILITIES})-(?:${STOCK_PALETTE})-\\d{2,3}\\b|\\b(?:${COLOUR_UTILITIES})-(?:white|black)\\b`,
    );
    expect(offenders(pattern)).toEqual([]);
  });
});

/* Contrast is a design rule like any other, and it failed silently until a
   human squinted at a laptop in a bright room: --ink-faint shipped at 3.81:1
   on dark and 3.01:1 on light. Every ink token is text somewhere, so every ink
   token answers to the 4.5:1 floor for normal text. */
describe("ink contrast against the grounds text sits on", () => {
  const tokens = readFileSync(path.join(SRC, "renderer", "src", "design", "tokens.css"), "utf8");

  function block(selector: string): string {
    const start = tokens.indexOf(selector);
    const open = tokens.indexOf("{", start);
    let depth = 1;
    let i = open + 1;
    while (depth > 0 && i < tokens.length) {
      if (tokens[i] === "{") depth += 1;
      if (tokens[i] === "}") depth -= 1;
      i += 1;
    }
    return tokens.slice(open + 1, i - 1);
  }

  const value = (source: string, name: string): string => {
    const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(source);
    if (match?.[1] === undefined) throw new Error(`--${name} not found or not a hex`);
    return match[1];
  };

  const luminance = (hex: string): number => {
    const channel = (offset: number): number => {
      const raw = parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return raw <= 0.03928 ? raw / 12.92 : Math.pow((raw + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  };

  const contrast = (a: string, b: string): number => {
    const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
    return (light + 0.05) / (dark + 0.05);
  };

  const INK = ["hi", "ink", "ink-dim", "ink-faint"];
  // The grounds text actually sits on. --bg-deep is chrome behind panels and
  // --bg-input is a field's own fill; both carry text in practice.
  const GROUNDS = ["bg", "bg-raised", "bg-panel", "bg-read", "bg-input", "chrome"];

  for (const [name, selector] of [
    ["dark", ":root {"],
    ["light", ':root[data-theme="light"]'],
    ["light (OS preference)", ":root:not([data-theme])"],
  ] as const) {
    it(`${name}: every ink token clears 4.5:1 on every ground`, () => {
      const source = block(selector);
      const failures: string[] = [];
      for (const ink of INK) {
        for (const ground of GROUNDS) {
          const ratio = contrast(value(source, ink), value(source, ground));
          if (ratio < 4.5) failures.push(`--${ink} on --${ground}: ${ratio.toFixed(2)}:1`);
        }
      }
      expect(failures).toEqual([]);
    });

    /* The floor alone is not enough. Raising --ink-faint to meet it once left
       it ABOVE --ink-dim in the light palette, so supporting text was fainter
       than the furniture around it and the two tokens stopped meaning
       different things. The scale has to stay ordered, and the tier people
       actually read has to clear more than the bare minimum. */
    it(`${name}: the ink scale stays ordered, and supporting text clears 7:1`, () => {
      const source = block(selector);
      const worst = (ink: string): number =>
        Math.min(...GROUNDS.map((ground) => contrast(value(source, ink), value(source, ground))));

      const hi = worst("hi");
      const ink = worst("ink");
      const dim = worst("ink-dim");
      const faint = worst("ink-faint");

      expect({ ordered: hi > ink && ink > dim && dim > faint }).toEqual({ ordered: true });
      // --ink-dim is ledes and captions: legible at a glance, not merely legal.
      expect(dim).toBeGreaterThanOrEqual(7);
    });
  }
});

describe("the three palette blocks of tokens.css", () => {
  const tokens = readFileSync(path.join(SRC, "renderer", "src", "design", "tokens.css"), "utf8");

  function blockAfter(selector: string): string {
    const start = tokens.indexOf(selector);
    expect(start, `selector not found: ${selector}`).toBeGreaterThanOrEqual(0);
    const open = tokens.indexOf("{", start);
    let depth = 1;
    let i = open + 1;
    while (depth > 0 && i < tokens.length) {
      if (tokens[i] === "{") depth += 1;
      if (tokens[i] === "}") depth -= 1;
      i += 1;
    }
    return tokens.slice(open + 1, i - 1);
  }

  const properties = (block: string): string[] =>
    [...block.matchAll(/--[\w-]+(?=\s*:)/g)].map((match) => match[0]).sort();

  it("mirror token-for-token", () => {
    const dark = properties(blockAfter(":root {"));
    const lightExplicit = properties(blockAfter(':root[data-theme="light"]'));
    const lightMedia = properties(blockAfter(":root:not([data-theme])"));
    expect(dark.length).toBeGreaterThan(0);
    expect(lightExplicit).toEqual(dark);
    expect(lightMedia).toEqual(dark);
  });
});
