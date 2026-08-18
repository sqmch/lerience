import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { scanPublicationText } from "./publication-hygiene.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX_SCANNED_BYTES = 2 * 1024 * 1024;

const listed = spawnSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
  cwd: repositoryRoot,
  encoding: "utf8",
});
if (listed.status !== 0) {
  throw new Error(listed.stderr.trim() || "Could not enumerate the publication tree.");
}

const findings = [];
for (const relativePath of listed.stdout.split("\0").filter(Boolean)) {
  const absolutePath = path.join(repositoryRoot, relativePath);
  let bytes;
  try {
    bytes = readFileSync(absolutePath);
  } catch {
    continue;
  }
  if (bytes.length > MAX_SCANNED_BYTES || bytes.includes(0)) continue;

  const source = bytes.toString("utf8");
  for (const finding of scanPublicationText(relativePath, source)) {
    findings.push(`${relativePath}:${finding.line} contains ${finding.label}`);
  }
}

if (findings.length > 0) {
  process.stderr.write(
    `Publication preflight found private current-tree remnants:\n${findings
      .slice(0, 25)
      .map((finding) => `- ${finding}`)
      .join("\n")}\n`,
  );
  if (findings.length > 25) {
    process.stderr.write(`- and ${findings.length - 25} more\n`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write("Publication preflight passed for the tracked and untracked source tree.\n");
}
