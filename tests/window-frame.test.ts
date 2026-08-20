/* The window frame is the one surface where the design layer has to reach the
   MAIN process: the OS draws the caption buttons, and it needs their height
   and colours before a renderer exists to ask (ADR-016). Both values are
   therefore duplicates of tokens, and both are checked here against the token
   file so the duplication cannot rot into a second source of truth. Re-cutting
   the palette must keep passing — only reading the WRONG token, or letting the
   bar height drift, may fail. */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readFrameColors } from "../build/frame-colors";
import {
  TITLE_BAR_HEIGHT,
  WINDOWS_CAPTION_WIDTH,
  windowTitleBarOptions,
} from "../src/main/window-frame";

const TOKENS = readFileSync(
  path.resolve(import.meta.dirname, "../src/renderer/src/design/tokens.css"),
  "utf8",
);
const APP_SHELL = readFileSync(
  path.resolve(import.meta.dirname, "../src/renderer/src/shell/app-shell.tsx"),
  "utf8",
);
const MAIN = readFileSync(path.resolve(import.meta.dirname, "../src/main/index.ts"), "utf8");

/** The value a named token carries in the first palette block at or after
 *  `selector`, read straight off the file rather than through the module under
 *  test. */
function declared(selector: string, name: string): string {
  const from = TOKENS.indexOf(selector);
  expect(from).toBeGreaterThanOrEqual(0);
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`, "u").exec(TOKENS.slice(from));
  return match?.[1] ?? "";
}

describe("the frame the OS draws before the renderer exists", () => {
  it("reserves exactly the bar the renderer draws", () => {
    expect(/--titlebar-h:\s*(\d+)px/u.exec(TOKENS)?.[1]).toBe(String(TITLE_BAR_HEIGHT));
    expect(/--caption-w:\s*(\d+)px/u.exec(TOKENS)?.[1]).toBe(String(WINDOWS_CAPTION_WIDTH));
  });

  it("keeps the Windows overlay and uses native inset traffic lights on macOS", () => {
    const overlay = { color: "#131313", symbolColor: "#b4b4b4", height: TITLE_BAR_HEIGHT };
    expect(windowTitleBarOptions("win32", overlay)).toEqual({
      titleBarStyle: "hidden",
      titleBarOverlay: overlay,
    });
    expect(windowTitleBarOptions("darwin", overlay)).toEqual({
      titleBarStyle: "hiddenInset",
      titleBarOverlay: true,
    });
  });

  it("lays out both title bars from the OS-reported control rectangle", () => {
    expect(TOKENS).toContain("env(titlebar-area-x, 0px)");
    expect(TOKENS).toContain("env(titlebar-area-width, calc(100vw - var(--caption-w)))");
    expect(APP_SHELL).toContain("pl-(--titlebar-inset-start)");
    expect(APP_SHELL).toContain("pr-(--titlebar-inset-end)");
    expect(MAIN).toContain("env(titlebar-area-x,0)");
    expect(MAIN).toContain("env(titlebar-area-width");
    expect(MAIN).toContain("WINDOWS_CAPTION_WIDTH");
  });

  it("takes the caption colours from the palette the renderer resolves", () => {
    expect(readFrameColors(TOKENS)).toEqual({
      dark: {
        color: declared(":root {", "chrome"),
        symbolColor: declared(":root {", "ink-dim"),
      },
      light: {
        color: declared(':root[data-theme="light"]', "chrome"),
        symbolColor: declared(':root[data-theme="light"]', "ink-dim"),
      },
    });
  });

  it("separates the two themes rather than compiling one palette twice", () => {
    const colors = readFrameColors(TOKENS);
    expect(colors.dark.color).not.toBe(colors.light.color);
    expect(colors.dark.symbolColor).not.toBe(colors.light.symbolColor);
  });

  it("fails the build rather than compiling a guessed colour", () => {
    expect(() => readFrameColors(":root { --chrome: #131313; }")).toThrow(/--ink-dim/u);
    expect(() => readFrameColors("/* no palette here */")).toThrow(/palette block/u);
  });
});
