// Unit tests for the pure heuristics in scripts/qa-module.mjs: the vitest-output
// classifier, the relative-timing detector, the learner's-eye review checklist,
// the answer-contract and untaught-terms lints, and the visuals external-URL
// linter.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  answerContract,
  classify,
  detectRelativeTiming,
  lintVisualHtml,
  lessonScope,
  reviewChecklist,
  untaughtTerms,
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

test("reviewChecklist: all four headings with items pass; missing and empty ones are named", () => {
  const complete = [
    "# Learner's-eye review — 00",
    "## Terms before use",
    "- `folder_number` — LESSON.md, block A.",
    "## Answer form",
    "- Task 1 → answers.json `count`: a number.",
    "## Doable from the page",
    "- Task 1 needs the April workbook — LESSON.md lists it.",
    "## Assumptions about the learner",
    "- Reads a CSV header — progress.json note 2026-09-05.",
  ].join("\n");
  assert.deepEqual(reviewChecklist(complete), { missing: [], empty: [] });
  const partial = "## Terms before use\n\n## Answer form\n- ok\n";
  assert.deepEqual(reviewChecklist(partial), {
    missing: ["Doable from the page", "Assumptions about the learner"],
    empty: ["Terms before use"],
  });
  // Free wording of the heading still matches on its key phrase.
  assert.deepEqual(reviewChecklist(complete.replace("## Answer form", "## Answer form per task")), {
    missing: [],
    empty: [],
  });
});

test("answerContract: null placeholders pass, wrong types fail, unnamed fields fail", () => {
  // The module-00 shape that failed live: a "" where a number goes, and status
  // fields the brief never named.
  const scaffold = {
    instructions: "Fill every value.",
    A: { distinct_workbooks: "", expected_slots: null },
    B: { raw_status: null },
  };
  const reference = {
    instructions: "Fill every value.",
    A: { distinct_workbooks: 4, expected_slots: 6 },
    B: { raw_status: "missing" },
  };
  const brief = "Enter `distinct_workbooks` and `expected_slots` as numbers.";
  assert.deepEqual(answerContract(scaffold, reference, brief), {
    typeMismatch: ["A.distinct_workbooks: placeholder is string, a correct answer is number"],
    notInBrief: ["B.raw_status"],
  });
  // Without a reference only the naming rule can run; `instructions` is prose.
  assert.deepEqual(answerContract(scaffold, null, brief), {
    typeMismatch: [],
    notInBrief: ["B.raw_status"],
  });
  // A leaf the reference has and the scaffold lacks is a contract hole too.
  assert.deepEqual(
    answerContract({ A: { x: null } }, { A: { x: 1, y: 2 } }, "`x` and `y`").typeMismatch,
    ["A.y: absent from the scaffold (a correct answer is number)"],
  );
});

test("untaughtTerms: flags brief-only labels, skips paths, commands, literals and fenced code", () => {
  const brief = [
    "Choose one of `flag_without_assignment`, `infer_from_folder` or `create_building`.",
    'Run `npm run check` in `scaffold/` and read `answers.json`; enter `null` or `"W-23"` or `42`.',
    "```json",
    '{ "unrelated_in_fence": true }',
    "```",
  ].join("\n");
  const lesson = "The resolver may `create_building` when no owner is registered.";
  const scaffold = ['{ "action": "infer_from_folder" }'];
  assert.deepEqual(untaughtTerms(brief, lesson, scaffold), ["flag_without_assignment"]);
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
