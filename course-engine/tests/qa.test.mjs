// Unit tests for the pure heuristics in scripts/qa-module.mjs: the vitest-output
// classifier, the relative-timing detector, the hint-2 fence detector, and the
// visuals external-URL linter.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classify,
  detectRelativeTiming,
  hint2Fences,
  lintVisualHtml,
  lessonScope,
} from "../template/scripts/qa-module.mjs";

test("lesson scope flags excessive required prose or total work, excluding fenced references", () => {
  assert.deepEqual(lessonScope("word ".repeat(1500), 1), { words: 1500, review: false });
  assert.equal(lessonScope("word ".repeat(1501), 0.75).review, true);
  assert.equal(lessonScope("A short lesson", 1.75).review, true);
  assert.deepEqual(
    lessonScope(
      "Read [this example](reference/example.md).\n```js\n" +
        "code ".repeat(1600) +
        "\n```\n[ref]: file.md",
      0.5,
    ),
    { words: 3, review: false },
  );
});

// vitest prints a per-test "Tests …" summary distinct from "Test Files …".
const passOut =
  " ✓ checks/store.test.ts (10)\n\n Test Files  1 passed (1)\n      Tests  10 passed (10)\n";
const failOut =
  " ❯ checks/store.test.ts (10)\n\n Test Files  1 failed (1)\n      Tests  3 failed | 7 passed (10)\n";
const assertionRaw = `${failOut}\nAssertionError: expected 2 to be 3\n`;

test("classify: all-pass reads the totals off the Tests line, not Test Files", () => {
  const c = classify({ out: passOut, raw: passOut });
  assert.equal(c.verdict, "all-pass");
  assert.equal(c.total, 10);
  assert.equal(c.failed, 0);
  assert.equal(c.passed, 10);
});

test("classify: assertion-fail vs error-fail turns on AssertionError in raw output", () => {
  const a = classify({ out: failOut, raw: assertionRaw });
  assert.equal(a.verdict, "assertion-fail");
  assert.equal(a.failed, 3);
  assert.equal(a.total, 10);
  // same summary, but nothing threw an AssertionError → a crash, not the intended red
  assert.equal(classify({ out: failOut, raw: failOut }).verdict, "error-fail");
});

test("classify: no test files, no summary, zero tests, and timeout are all no-results", () => {
  assert.equal(
    classify({ out: "No test files found, exiting with code 1", raw: "" }).verdict,
    "no-results",
  );
  assert.equal(
    classify({ out: "noise, but no summary line was ever printed", raw: "" }).verdict,
    "no-results",
  );
  assert.equal(classify({ out: "      Tests  0 passed (0)\n", raw: "" }).verdict, "no-results");
  assert.equal(classify({ timedOut: true }).verdict, "no-results");
});

test("detectRelativeTiming: flags measured-vs-measured, ignores absolute bounds and non-clock", () => {
  // the real 2026-06-13 flake: one measured duration compared to another (÷2)
  const measuredVsMeasured = [
    "const firstMs = Date.now();",
    "await pipeline();",
    "const t1 = Date.now();",
    "const secondMs = t1 - firstMs;",
    "expect(secondMs).toBeLessThan(firstMs / 2);",
  ].join("\n");
  assert.equal(detectRelativeTiming([{ rel: "warm.test.ts", text: measuredVsMeasured }]).length, 1);

  // one measured duration vs an absolute bound — the sanctioned pattern
  const absoluteBound = [
    "const t0 = performance.now();",
    "run();",
    "const elapsed = performance.now() - t0;",
    "expect(elapsed).toBeLessThan(1000);",
  ].join("\n");
  assert.equal(detectRelativeTiming([{ rel: "abs.test.ts", text: absoluteBound }]).length, 0);

  // a comparison with no clocks at all is not a timing assertion
  assert.equal(
    detectRelativeTiming([
      { rel: "plain.test.ts", text: "expect(results.length).toBeGreaterThan(2);" },
    ]).length,
    0,
  );

  // empty / missing text is skipped, not crashed
  assert.equal(
    detectRelativeTiming([
      { rel: "empty.test.ts", text: "" },
      { rel: "n.test.ts", text: null },
    ]).length,
    0,
  );
});

test("hint2Fences: reports opening fence lines; prose and inline code are clean", () => {
  assert.deepEqual(hint2Fences("Just prose with `inline` code and no fences."), []);
  assert.deepEqual(hint2Fences("intro\n```js\ncode()\n```\nmore"), [2]);
  assert.deepEqual(hint2Fences("~~~\nblock\n~~~"), [1]);
  assert.deepEqual(hint2Fences("a\n```\none\n```\nb\n```\ntwo\n```"), [2, 6]);
});

test("lintVisualHtml: external fails, relative warns, data/inline/anchors pass, net API flagged", () => {
  const ext = lintVisualHtml('<script src="https://cdn.example.com/x.js"></script>');
  assert.deepEqual(ext.external, ["https://cdn.example.com/x.js"]);
  assert.equal(ext.relative.length, 0);
  assert.equal(ext.usesNetworkApi, false);

  const fetchy = lintVisualHtml('<script>fetch("https://api.example.com/data")</script>');
  assert.equal(fetchy.external.includes("https://api.example.com/data"), true);
  assert.equal(fetchy.usesNetworkApi, true);

  const rel = lintVisualHtml('<link href="styles.css"><img src="pic.png">');
  assert.deepEqual([...rel.relative].sort(), ["pic.png", "styles.css"]);
  assert.equal(rel.external.length, 0);

  const inline = lintVisualHtml(
    '<img src="data:image/png;base64,AAAA"><a href="#top">x</a><style>body{color:#000}</style>',
  );
  assert.equal(inline.external.length, 0);
  assert.equal(inline.relative.length, 0);
  assert.equal(inline.usesNetworkApi, false);

  // protocol-relative and ws:// count as external
  const proto = lintVisualHtml(
    '<script src="//evil.example.com/x.js"></script><script>new WebSocket("wss://x/y")</script>',
  );
  assert.equal(proto.external.includes("//evil.example.com/x.js"), true);
  assert.equal(proto.external.includes("wss://x/y"), true);
  assert.equal(proto.usesNetworkApi, true);
});
