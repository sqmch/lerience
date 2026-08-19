/* The prose check is a thin runner over `scanPublicationText`, so these tests
   cover what the runner itself decides: which environment variables it reads,
   that a label is never an approved fixture root, and its exit status. The
   scanning rules themselves are covered by publication-hygiene.test.ts.

   Every private-looking string here is assembled from parts, the same way
   publication-hygiene.test.ts does it, so this file can state what the check
   refuses without the tracked-tree preflight refusing this file. */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const script = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "scripts",
  "publication-prose.mjs",
);

const windowsHome = ["C:", "Users", "learner", "Lerience", "Java"].join("\\");
const unixHome = ["", "home", "learner", "lerience"].join("/");
const privateContact = ["sqmchh", "gmail.com"].join("@");

function run(prose: Record<string, string>): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [script], {
    encoding: "utf8",
    // A clean environment: the runner reads every PROSE_* variable it can see,
    // and whoever runs these tests must not contribute one of their own.
    env: { ...prose, PATH: process.env["PATH"] ?? "" },
  });
  return { status: result.status ?? 0, stdout: result.stdout, stderr: result.stderr };
}

describe("published prose check", () => {
  it("passes prose that names a path by its environment variable", () => {
    const result = run({
      PROSE_PR_BODY: [
        "Discovery resolves a Zed install under `%LOCALAPPDATA%\\Programs\\Zed`",
        "and the detached spawn returns in 21ms.",
      ].join("\n"),
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("pr_body");
  });

  it("passes a path whose identity is elided, which is the escape for prose about paths", () => {
    // The shared patterns exclude `<` and `>` from an identity, so a bracketed
    // placeholder is not a home path. The failure message names this escape,
    // because a PR that discusses path handling has to be able to show one.
    const placeholder = ["C:", "Users", "<name>", "Lerience"].join("\\");
    expect(run({ PROSE_PR_BODY: `Courses live under ${placeholder}.` }).status).toBe(0);
  });

  it("refuses the resolved home path the tracked-tree preflight would have caught in a file", () => {
    const result = run({
      PROSE_PR_BODY: ["## Validation", "", `Opened ${windowsHome} without trouble.`].join("\n"),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("pr_body line 3");
    expect(result.stderr).toContain("Windows home path");
  });

  it("refuses a Unix home path and the maintainer's private address", () => {
    expect(run({ PROSE_PR_TITLE: `Fix ${unixHome}` }).status).toBe(1);
    expect(run({ PROSE_PR_BODY: `ping ${privateContact}` }).status).toBe(1);
  });

  it("gives published prose no fixture exemption, unlike a file under tests/", () => {
    // A synthetic identity is allowed in a file under an approved test root.
    // A PR body is not a test fixture wherever its words came from, so the
    // same string is refused when it arrives as published prose.
    expect(run({ PROSE_TESTS_X_TS: windowsHome }).status).toBe(1);
  });

  it("scans every supplied source and reports each by its own label", () => {
    const result = run({ PROSE_PR_TITLE: "A clean title", PROSE_PR_BODY: unixHome });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("pr_body");
    expect(result.stderr).not.toContain("pr_title line");
  });

  it("passes when there is nothing to scan, so a run outside a PR is not a failure", () => {
    const result = run({});
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("nothing to scan");
  });
});
