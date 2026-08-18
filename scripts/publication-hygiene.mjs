const APPROVED_FIXTURE_ROOTS = ["tests/", "course-engine/tests/"];
const APPROVED_SYNTHETIC_IDENTITIES = new Set(["example", "learner", "user"]);

const windowsHomePattern =
  /[A-Za-z]:[\\/]+Users[\\/]+(?<identity>[^\\/\s"'`<>]+)(?:[\\/]+[^\s"'`<>]*)?/giu;
const unixHomePattern =
  /(?<![A-Za-z]:)\/(?:Users|home)\/(?<identity>[^/\s"'`<>]+)(?:\/[^\s"'`<>]*)?/gu;

const contentRules = [
  {
    id: "private-contact",
    label: "the maintainer's private contact address",
    pattern: /sqmchh@gmail\.com/giu,
  },
  {
    id: "retired-sibling-repository",
    label: "a retired sibling repository path",
    pattern:
      /\.\.(?:\\|\/)(?:praxeum-app(?:-local-runtime|-codex-app-server)?|learning-harness|courses)(?:\\|\/|\b)/giu,
  },
];

function normalizeRepositoryPath(relativePath) {
  return relativePath.replaceAll("\\", "/").replace(/^\.\//u, "");
}

function isApprovedFixtureFile(relativePath) {
  const normalized = normalizeRepositoryPath(relativePath);
  return APPROVED_FIXTURE_ROOTS.some((root) => normalized.startsWith(root));
}

function lineForMatch(source, index) {
  return source.slice(0, index).split(/\r?\n/u).length;
}

function scanHomePaths(relativePath, source, kind, pattern) {
  const findings = [];
  pattern.lastIndex = 0;

  for (const match of source.matchAll(pattern)) {
    const identity = match.groups?.identity?.toLowerCase();
    const syntheticIdentity = identity !== undefined && APPROVED_SYNTHETIC_IDENTITIES.has(identity);

    if (syntheticIdentity && isApprovedFixtureFile(relativePath)) continue;

    findings.push({
      ruleId: `${kind}-home-path`,
      line: lineForMatch(source, match.index),
      label: syntheticIdentity
        ? `a synthetic ${kind} home path outside an approved test fixture`
        : `an unapproved ${kind} home path`,
    });
  }

  return findings;
}

/**
 * Scan one UTF-8 source file as it will appear in the publication tree.
 * Synthetic home paths are allowed only for known identities in declared test roots.
 *
 * @param {string} relativePath repository-relative path
 * @param {string} source UTF-8 file contents
 * @returns {Array<{ruleId: string, line: number, label: string}>}
 */
export function scanPublicationText(relativePath, source) {
  const findings = [
    ...scanHomePaths(relativePath, source, "Windows", windowsHomePattern),
    ...scanHomePaths(relativePath, source, "Unix", unixHomePattern),
  ];

  for (const rule of contentRules) {
    rule.pattern.lastIndex = 0;
    for (const match of source.matchAll(rule.pattern)) {
      findings.push({
        ruleId: rule.id,
        line: lineForMatch(source, match.index),
        label: rule.label,
      });
    }
  }

  return findings.sort((left, right) => left.line - right.line);
}
