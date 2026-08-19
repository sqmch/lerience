/* Publication hygiene for the prose that becomes repository content.
 *
 * `publication-preflight.mjs` scans the tracked tree. It cannot see a pull
 * request body or a commit message, and both of those are published: GitHub
 * writes the body into the merge commit, so `git log --first-parent` carries
 * it as the raw material for release notes. A resolved home path pasted into
 * a PR body is exactly as public as one committed to a file, and until this
 * script existed nothing checked it.
 *
 * Same rules, same scanner: this only points `scanPublicationText` at text
 * that arrives from somewhere other than a file. Prose is easy to reword, so
 * a finding fails rather than warns.
 *
 * Usage: PROSE_<label>=<text> ... node scripts/publication-prose.mjs
 * Every environment variable named `PROSE_*` is scanned under its label. Text
 * arrives by environment rather than by argument so a body containing shell
 * metacharacters cannot reach a command line.
 */

import { scanPublicationText } from "./publication-hygiene.mjs";

const sources = Object.entries(process.env)
  .filter(([name, value]) => name.startsWith("PROSE_") && typeof value === "string")
  .map(([name, value]) => ({ label: name.slice("PROSE_".length).toLowerCase(), text: value }));

if (sources.length === 0) {
  process.stdout.write("No PROSE_* text was supplied; nothing to scan.\n");
  process.exit(0);
}

const findings = [];
for (const { label, text } of sources) {
  // The label stands in for a repository path. It never starts with an
  // approved fixture root, so synthetic identities are refused here too:
  // published prose has no test fixtures to exempt.
  for (const finding of scanPublicationText(label, text)) {
    findings.push(`${label} line ${String(finding.line)} contains ${finding.label}`);
  }
}

if (findings.length === 0) {
  process.stdout.write(
    `Publication prose check passed for: ${sources.map((entry) => entry.label).join(", ")}.\n`,
  );
  process.exit(0);
}

process.stderr.write(
  `Publication prose check found private remnants in text that will be published:\n${findings
    .map((finding) => `- ${finding}`)
    .join(
      "\n",
    )}\n\nRewrite the text. Name a path by its environment variable (%LOCALAPPDATA%, $HOME), or elide the identity in angle brackets (C:\\Users\\<name>\\...), rather than resolving a home directory. A synthetic identity earns no exemption here: published prose is not a test fixture.\n`,
);
process.exitCode = 1;
