/* ADR-017 clears Tailwind's stock namespaces so a non-token value cannot
   compile. That is the right rule and it has a sharp edge: a utility whose
   name is NOT declared in the theme compiles to NOTHING, silently, and the
   markup still looks correct in review.

   It has bitten three times now:

   - round 6: `--breakpoint-*: initial` killed every `md:`/`lg:` variant in the
     app, including the dashboard's `md:grid-cols-2`, for a day.
   - ADR-019: `--blur-*: initial` killed `backdrop-blur-sm` on the material
     pane's sticky head.
   - ADR-019: `duration-slow` was invented out of thin air — Tailwind's duration
     scale is numeric, so there was never a `--duration-slow` to find.

   So: every NAMED value a utility reaches for must be declared. Numeric and
   custom-property forms (`duration-150`, `duration-(--dur-slow)`,
   `text-[13px]`) are Tailwind built-ins or resolve at runtime and are fine —
   this only polices the named ones, which are the ones that can vanish. */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(import.meta.dirname, "../src/renderer/src");
const THEME = readFileSync(path.join(SRC, "design", "index.css"), "utf8");

/** Utility prefixes whose named value must exist in a theme namespace.
 *  `namespace` is the `--<namespace>-<name>` the value has to be declared as. */
const POLICED: { prefix: string; namespaces: string[]; builtins: string[] }[] = [
  // `text-*` is overloaded: it is BOTH the size scale and a colour utility, so
  // either namespace satisfies it. Splitting them would need a value list, and
  // a wrong name still fails both.
  { prefix: "text", namespaces: ["text", "color"], builtins: [] },
  { prefix: "leading", namespaces: ["leading"], builtins: [] },
  { prefix: "rounded", namespaces: ["radius"], builtins: ["none", "full"] },
  { prefix: "shadow", namespaces: ["shadow", "color"], builtins: ["none"] },
  { prefix: "blur", namespaces: ["blur"], builtins: ["none"] },
  { prefix: "backdrop-blur", namespaces: ["blur"], builtins: ["none"] },
  { prefix: "duration", namespaces: ["duration"], builtins: ["initial"] },
  { prefix: "animate", namespaces: ["animate"], builtins: ["none"] },
  { prefix: "font", namespaces: ["font"], builtins: [] },
];

/** `text-*` and `font-*` are overloaded: they also carry alignment, wrapping,
 *  weight and colour, none of which answer to the size/family namespaces. */
const NOT_A_SCALE_VALUE = new Set([
  // text-*: alignment, wrapping, transform, overflow, decoration
  "left",
  "center",
  "right",
  "justify",
  "start",
  "end",
  "wrap",
  "nowrap",
  "balance",
  "pretty",
  "ellipsis",
  "clip",
  // font-*: weights and styles
  "thin",
  "extralight",
  "light",
  "normal",
  "medium",
  "semibold",
  "bold",
  "extrabold",
  "black",
  "italic",
  "not-italic",
  "stretch",
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(full) && !/\.test\.tsx?$/.test(full) ? [full] : [];
  });
}

/** Class-shaped tokens out of every string literal in the renderer. */
function classTokens(): Map<string, string> {
  const found = new Map<string, string>();
  for (const file of sourceFiles(SRC)) {
    const rel = path.relative(SRC, file);
    for (const chunk of readFileSync(file, "utf8").split(/["'`]/)) {
      for (const token of chunk.split(/\s+/)) {
        if (!/^[a-z@][a-z0-9@:[\]().,/%_-]*$/.test(token)) continue;
        if (!found.has(token)) found.set(token, rel);
      }
    }
  }
  return found;
}

/** Strip any leading variants (`hover:`, `@max-pane:`, `data-[x=y]:`). */
function bare(token: string): string {
  let rest = token;
  for (;;) {
    const match = /^(?:[a-z@][a-z0-9@-]*(?:-\[[^\]]*\])?):(?!:)/.exec(rest);
    if (match === null) return rest;
    rest = rest.slice(match[0].length);
  }
}

describe("named theme values every utility reaches for are declared", () => {
  const tokens = classTokens();

  it("finds classes to police", () => {
    expect(tokens.size).toBeGreaterThan(100);
  });

  for (const { prefix, namespaces, builtins } of POLICED) {
    it(`${prefix}-*`, () => {
      const undeclared: string[] = [];
      for (const [token, file] of tokens) {
        const value = bare(token);
        if (!value.startsWith(`${prefix}-`)) continue;
        let name = value.slice(prefix.length + 1);
        // `rounded-l-pill`, `rounded-tr-md`: the side is Tailwind's, the
        // value is still a `--radius-*` lookup.
        if (prefix === "rounded") name = name.replace(/^(?:[trbl]|[tb][lr]|[se]|[se][se])-/, "");
        // Arbitrary values, custom properties, numbers, fractions and opacity
        // modifiers are not named theme lookups.
        if (name === "" || /^[[(]/.test(name) || /^\d/.test(name)) continue;
        if (name.includes("/") || name.includes("[") || name.includes("(")) continue;
        if (builtins.includes(name) || NOT_A_SCALE_VALUE.has(name)) continue;
        if (namespaces.some((space) => THEME.includes(`--${space}-${name}:`))) continue;
        undeclared.push(
          `${token} (${file}) → ${namespaces.map((s) => `--${s}-${name}`).join(" / ")} not declared`,
        );
      }
      expect(undeclared).toEqual([]);
    });
  }

  /* Container-query variants (`@max-pane:`, `@pane:`) and breakpoint variants
     (`md:`) resolve at BUILD time, so their sizes must be literals in the
     @theme block — a `var(...)` there produces an invalid query that Tailwind
     drops without a word. This is exactly how the pane gutters shipped dead. */
  it("container-query and breakpoint variants name a declared, literal size", () => {
    const undeclared: string[] = [];
    for (const [token, file] of tokens) {
      for (const match of token.matchAll(/(?:^|:)@(?:max-|min-)?([a-z][a-z0-9-]*):/g)) {
        const name = match[1];
        const declaration = new RegExp(`--container-${name}:\\s*([^;]+);`).exec(THEME);
        if (declaration === null) {
          undeclared.push(`${token} (${file}) → --container-${name} is not declared`);
        } else if (declaration[1]?.includes("var(") === true) {
          undeclared.push(
            `${token} (${file}) → --container-${name} must be a literal, not a var()`,
          );
        }
      }
      // The variant has to be followed by a utility; a bare `sm:` is object
      // syntax that the string-splitting tokenizer swept up.
      const breakpoint = /^(md|lg|sm|xl|2xl):[a-z@[(]/.exec(token);
      if (breakpoint !== null && !THEME.includes(`--breakpoint-${breakpoint[1]}:`)) {
        undeclared.push(`${token} (${file}) → --breakpoint-${breakpoint[1]} is not declared`);
      }
    }
    expect(undeclared).toEqual([]);
  });
});
