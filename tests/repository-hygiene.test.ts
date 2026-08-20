import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function filesUnder(relativeRoot: string): string[] {
  const absoluteRoot = path.join(root, relativeRoot);
  return fs.readdirSync(absoluteRoot, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(relativeRoot, entry.name);
    return entry.isDirectory() ? filesUnder(relativePath) : [relativePath];
  });
}

describe("repository publication hygiene", () => {
  it("pins every third-party workflow action to a full commit SHA", () => {
    const workflowRoot = path.join(root, ".github", "workflows");
    const workflows = fs.readdirSync(workflowRoot).filter((name) => name.endsWith(".yml"));
    expect(workflows.length).toBeGreaterThan(0);

    for (const workflow of workflows) {
      const source = fs.readFileSync(path.join(workflowRoot, workflow), "utf8");
      expect(source).not.toContain("pull_request_target:");
      expect(source).not.toMatch(/permissions:\s*write-all/u);
      for (const match of source.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s*#.*)?$/gmu)) {
        const reference = match[1];
        if (reference === undefined || reference.startsWith("./")) continue;
        expect(reference, `${workflow} contains an unpinned action`).toMatch(
          /^[^@\s]+@[a-f0-9]{40}$/u,
        );
      }
    }
  });

  it("keeps credentials and generated packages outside source control", () => {
    const ignore = read(".gitignore");
    for (const entry of ["node_modules/", "dist/", "out/", ".env", "*.pem", "*.p12"]) {
      expect(ignore).toContain(entry);
    }
    expect(ignore).toContain("!distribution/release-public-key.pem");
  });

  it("scopes the packaged runtime input to the package step", () => {
    const workflow = read(".github/workflows/distribution-rehearsal.yml");
    const stepsIndex = workflow.indexOf("    steps:");
    expect(stepsIndex).toBeGreaterThan(0);
    expect(workflow.slice(0, stepsIndex)).not.toContain("PRAXEUM_RUNTIME_ROOT");
    expect(workflow).toContain(
      "run: pnpm runtime:assemble -- --output dist/runtime/win32-x64-rehearsal",
    );
    expect(workflow).toMatch(
      /- name: Build rehearsal installer\r?\n\s+env:\r?\n\s+PRAXEUM_RUNTIME_ROOT: dist\/runtime\/win32-x64-rehearsal\r?\n\s+run: pnpm package:windows/u,
    );
    expect(workflow).toContain(
      "run: pnpm runtime:assemble -- --output dist/runtime/darwin-arm64-rehearsal",
    );
    expect(workflow).toMatch(
      /- name: Build unsigned arm64 rehearsal DMG\r?\n\s+env:\r?\n\s+PRAXEUM_RUNTIME_ROOT: dist\/runtime\/darwin-arm64-rehearsal\r?\n\s+run: pnpm package:macos:arm64/u,
    );
    expect(workflow).toContain(
      "run: pnpm runtime:assemble -- --output dist/runtime/darwin-x64-rehearsal",
    );
    expect(workflow).toMatch(
      /- name: Build unsigned x64 rehearsal DMG\r?\n\s+env:\r?\n\s+PRAXEUM_RUNTIME_ROOT: dist\/runtime\/darwin-x64-rehearsal\r?\n\s+run: pnpm package:macos:x64/u,
    );
    expect(workflow).toContain(
      '"dist/package/macos-arm64/mac-arm64/LeriencePreview.app/Contents/MacOS/LeriencePreview"',
    );
    expect(workflow).toContain(
      '"dist/package/macos-x64/mac/LeriencePreview.app/Contents/MacOS/LeriencePreview"',
    );
  });

  it("records complete artifact hash and filename pairs", () => {
    const workflow = read(".github/workflows/distribution-rehearsal.yml");
    expect(workflow).toContain("Get-FileHash -Algorithm SHA256");
    expect(workflow).toContain("ForEach-Object");
    expect(workflow).toContain("$([IO.Path]::GetFileName($_.Path))");
    expect(workflow).not.toContain("Format-Table");
  });

  it("keeps production release automation draft-only in the canonical source repository", () => {
    const workflow = read(".github/workflows/desktop-release-candidate.yml");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("default: false");
    expect(workflow).toContain("if: inputs.create_draft");
    expect(workflow).toContain(
      "PRAXEUM_RELEASE_REPOSITORY_URL: https://github.com/${{ github.repository }}/releases/",
    );
    expect(workflow).toContain("PRAXEUM_PRODUCT_NAME: Lerience");
    expect(workflow).toContain("PRAXEUM_APP_ID: io.github.sqmch.lerience");
    expect(workflow).toContain("PRAXEUM_EXECUTABLE_NAME: Lerience");
    expect(workflow).not.toContain("product_name:");
    expect(workflow).not.toContain("executable_name:");
    expect(workflow).not.toContain("app_id:");
    expect(workflow).not.toContain("release_repository:");
    expect(workflow).not.toContain("RELEASE_REPOSITORY_TOKEN");
    expect(workflow).toContain("GH_TOKEN: ${{ github.token }}");
    expect(workflow).toContain("contents: write");
    expect(workflow).toContain("gh release create");
    expect(workflow).toContain("--draft");
    expect(workflow).not.toContain("--draft=false");
    expect(workflow).not.toContain("gh release edit");
    expect(workflow).toContain(
      "Release drafts may be created only in the canonical public source repository.",
    );
    expect(workflow).toContain("The canonical source repository must be public.");
    expect(workflow).toContain("exactly the seven approved uploads");
    expect(workflow).toContain("runs-on: macos-latest");
    expect(workflow).toContain("runs-on: macos-15-intel");
    expect(workflow).toContain("--artifacts dist/release-artifacts");
    const staging = read("scripts/stage-desktop-release.mjs");
    expect(staging).toContain("-corresponding-source.tar.gz");
    expect(staging).not.toContain("-Setup-x64.exe");
    expect(staging).not.toContain("-Portable-x64.exe");
    expect(staging).not.toContain('"release-bundle.json"');
  });

  it("keeps active release documentation on the single public source repository topology", () => {
    const activeDocuments = [
      "README.md",
      "docs/STATUS.md",
      "distribution/README.md",
      "distribution/RELEASE-OPERATIONS.md",
    ];
    for (const document of activeDocuments) {
      expect(read(document), document).not.toContain("separate public binary repository");
    }
  });

  it("repeats course creation and engine maintenance against the exact package runtime", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      scripts?: Record<string, string>;
    };
    expect(packageJson.scripts?.["package:windows:preflight"]).toContain("--target win32-x64");
    expect(packageJson.scripts?.["package:macos:preflight"]).toBe(
      "pnpm package:macos:arm64:preflight",
    );
    expect(packageJson.scripts?.["package:macos:dir"]).toBe("pnpm package:macos:arm64:dir");
    expect(packageJson.scripts?.["package:macos"]).toBe("pnpm package:macos:arm64");
    expect(packageJson.scripts?.["package:macos:arm64:preflight"]).toContain(
      "--target darwin-arm64 --preflight",
    );
    expect(packageJson.scripts?.["package:macos:arm64:dir"]).toContain(
      "--target darwin-arm64 --dir",
    );
    expect(packageJson.scripts?.["package:macos:arm64"]).toContain("--target darwin-arm64");
    expect(packageJson.scripts?.["package:macos:x64:preflight"]).toContain(
      "--target darwin-x64 --preflight",
    );
    expect(packageJson.scripts?.["package:macos:x64:dir"]).toContain("--target darwin-x64 --dir");
    expect(packageJson.scripts?.["package:macos:x64"]).toContain("--target darwin-x64");
    const builder = read("scripts/build-desktop-artifact.mjs");
    expect(builder).toContain('installElectron: path.join(repositoryRoot, "node_modules"');
    expect(builder).toContain('"tests/runtime-manifest.test.ts"');
    expect(builder).toContain('"tests/course-creator.test.ts"');
    expect(builder).toContain('"tests/course-engine-updater.test.ts"');
  });

  it("keeps automated dependency maintenance below deliberate major migrations", () => {
    const dependabot = read(".github/dependabot.yml");
    const workspace = read("pnpm-workspace.yaml");
    expect(dependabot.match(/version-update:semver-major/gu)).toHaveLength(2);
    expect(dependabot).toContain("development-minor-and-patch:");
    expect(dependabot).toContain("production-patch:");
    expect(workspace).toMatch(/^minimumReleaseAge: 4320$/mu);
    expect(workspace).toMatch(/^minimumReleaseAgeStrict: false$/mu);
    expect(workspace).not.toMatch(/^trustLockfile: true$/mu);
  });

  it("declares the selected root license without relicensing the Course Engine template", () => {
    const packageJson = JSON.parse(read("package.json")) as { private?: boolean; license?: string };
    expect(packageJson).toMatchObject({ private: true, license: "MIT" });
    expect(read("LICENSE")).toContain("MIT License");
    expect(read("LICENSE")).toContain("Copyright (c) 2026 sqmch and contributors");
    expect(read("course-engine/template/LICENSE")).toContain("MIT License");
    expect(read("README.md")).toContain("MIT License");
  });

  it("keeps public contributor metadata on the Lerience repository", () => {
    const publicSurfaces = [
      "README.md",
      "CONTRIBUTING.md",
      "SECURITY.md",
      "SUPPORT.md",
      "CODE_OF_CONDUCT.md",
      "package.json",
      ".github/ISSUE_TEMPLATE/config.yml",
      ".github/ISSUE_TEMPLATE/bug_report.yml",
      ".github/ISSUE_TEMPLATE/feature_request.yml",
      "docs/STATUS.md",
      "docs/DECISIONS/ADR-032-lerience-public-identity.md",
    ];
    for (const publicSurface of publicSurfaces) {
      expect(read(publicSurface), publicSurface).not.toMatch(
        /sqmch\/praxeum-desktop|private internal alpha|not yet accepting unsolicited|for invited testing/iu,
      );
    }

    const packageJson = JSON.parse(read("package.json")) as Record<string, unknown>;
    expect(packageJson).toMatchObject({
      name: "lerience",
      repository: { type: "git", url: "https://github.com/sqmch/lerience.git" },
      bugs: { url: "https://github.com/sqmch/lerience/issues" },
      homepage: "https://github.com/sqmch/lerience#readme",
    });
    expect(read("CONTRIBUTING.md")).toContain("Contributions are welcome");
    expect(read("SECURITY.md")).toContain("Report a vulnerability");
    expect(read("SUPPORT.md")).toContain("reproducible application defects");
    expect(read(".github/ISSUE_TEMPLATE/config.yml").trim()).toBe("blank_issues_enabled: false");
  });

  it("keeps the current-tree publication preflight in the normal validation path", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      scripts?: Record<string, string>;
    };
    expect(packageJson.scripts?.["publication:preflight"]).toBe(
      "node scripts/publication-preflight.mjs",
    );
    expect(packageJson.scripts?.["check"]).toContain("pnpm publication:preflight");
    expect(read("scripts/publication-preflight.mjs")).toContain(
      '"--cached", "--others", "--exclude-standard"',
    );
    expect(read("scripts/publication-preflight.mjs")).toContain("scanPublicationText");
    expect(read("scripts/publication-hygiene.mjs")).toContain("APPROVED_FIXTURE_ROOTS");
    expect(read("docs/STATUS.md")).toContain("publication hygiene");
  });

  it("publishes durable interface rules without the internal design diary", () => {
    expect(fs.existsSync(path.join(root, "docs", "DESIGN-PHASE.md"))).toBe(false);
    expect(read("CLAUDE.md")).toContain("docs/DESIGN.md");
    expect(read("README.md")).toContain("docs/DESIGN.md");
    expect(read("docs/DESIGN.md")).toContain("## Product posture");
    expect(read("docs/DESIGN.md")).toContain("## Course lifecycle surfaces");
    expect(read("docs/DESIGN.md")).toContain("## Conversation, controls, and consent");
    expect(read("docs/DESIGN.md")).toContain("## Implementation boundaries");
    expect(read("docs/DESIGN.md")).toContain("## Verification");
  });

  it("keeps release evidence exact and omits private rehearsal records", () => {
    const evidenceRoot = path.join(root, "distribution", "evidence");
    const evidenceFiles = fs.readdirSync(evidenceRoot).sort();
    expect(evidenceFiles).toContain("README.md");
    for (const fileName of evidenceFiles.filter((candidate) => candidate !== "README.md")) {
      expect(fileName).toMatch(/^v\d+\.\d+\.\d+-windows-x64\.md$/u);
    }

    const policy = read("distribution/evidence/README.md");
    expect(policy).toContain("exact release-candidate evidence");
    expect(policy).toContain("source tag, commit, and tree digest");
    expect(policy).toContain("exact draft assets downloaded from GitHub");
    expect(policy).toContain("Do not record credentials");
  });

  it("keeps source rationale independent of private review sessions", () => {
    for (const sourceFile of filesUnder("src").filter((file) => /\.(?:css|ts|tsx)$/u.test(file))) {
      const source = read(sourceFile);
      expect(source, sourceFile).not.toMatch(
        /\bfounder\b|five live runs|live run showed|at the audit/iu,
      );
    }
  });

  it("ships notices for the fonts it uses and no obsolete font binaries", () => {
    expect(fs.existsSync(path.join(root, "src", "renderer", "src", "design", "fonts"))).toBe(false);
    expect(read("src/renderer/src/design/fonts.css")).not.toContain("Satoshi");
    expect(read("src/renderer/src/design/tokens.css")).not.toContain("Satoshi");

    const notices = read("distribution/THIRD-PARTY-NOTICES.md").replaceAll("\r\n", "\n");
    const licenseMarker = "-----------------------------------------------------------";
    for (const fontPackage of [
      "@fontsource-variable/inter",
      "@fontsource-variable/literata",
      "@fontsource-variable/jetbrains-mono",
    ]) {
      const packageRoot = path.join("node_modules", ...fontPackage.split("/"));
      const metadata = JSON.parse(read(path.join(packageRoot, "package.json"))) as {
        name?: string;
        version?: string;
        license?: string;
      };
      expect(metadata).toMatchObject({ name: fontPackage, license: "OFL-1.1" });
      expect(metadata.version).toBeTypeOf("string");
      expect(notices).toContain(`${fontPackage} ${metadata.version ?? ""}`);

      const packageLicense = read(path.join(packageRoot, "LICENSE")).replaceAll("\r\n", "\n");
      const licenseStart = packageLicense.indexOf(licenseMarker);
      expect(licenseStart).toBeGreaterThanOrEqual(0);
      const commonLicense = packageLicense.slice(licenseStart).trim();
      expect(notices).toContain(commonLicense);
    }
  });

  it("keeps the renderer harness synthetic, documented, validated, and outside the package", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      scripts?: Record<string, string>;
    };
    expect(fs.existsSync(path.join(root, ".claude", "harness"))).toBe(false);
    expect(read("dev/renderer-harness/README.md")).toContain(
      "written specifically for the public harness",
    );
    expect(read("dev/renderer-harness/course-fixture.ts")).toContain(
      "Nothing was copied from a learner course",
    );
    expect(read("dev/renderer-harness/main.tsx")).toContain("purpose-authored synthetic data");
    expect(packageJson.scripts?.["harness:typecheck"]).toContain(
      "dev/renderer-harness/tsconfig.json",
    );
    expect(packageJson.scripts?.["harness:build"]).toContain("dev/renderer-harness/vite.config.ts");
    expect(packageJson.scripts?.["check"]).toContain("pnpm harness:check");
    expect(read("electron-builder.config.mjs")).not.toContain("dev/");
  });

  it("keeps the isolated rehearsal identity and trusted feed inputs explicit", () => {
    const workflow = read(".github/workflows/distribution-rehearsal.yml");
    expect(workflow).toContain("PRAXEUM_PRODUCT_NAME: Lerience Preview");
    expect(workflow).toContain("PRAXEUM_APP_ID: io.github.sqmch.lerience.preview");
    expect(workflow).toContain("PRAXEUM_EXECUTABLE_NAME: LeriencePreview");
    expect(workflow).toContain(
      "PRAXEUM_RELEASE_REPOSITORY_URL: https://github.com/${{ github.repository }}/releases/",
    );
    expect(workflow).toContain(
      "PRAXEUM_RELEASE_PUBLIC_KEY_PATH: distribution/release-public-key.pem",
    );
    const publicKey = read("distribution/release-public-key.pem");
    expect(publicKey).toContain("BEGIN PUBLIC KEY");
    expect(publicKey).not.toContain("PRIVATE KEY");
  });

  it("centralizes the public display name without migrating compatibility namespaces", () => {
    const product = read("src/shared/product.ts");
    expect(product).toContain('PRODUCT_NAME = "Lerience"');
    expect(product).toContain('PRODUCT_CLIENT_ID = "lerience-desktop"');
    expect(read("src/renderer/src/shell/app-shell.tsx")).toContain("PRODUCT_WORDMARK");
    expect(read("src/shared/ipc.ts")).toContain('PING_CHANNEL = "praxeum:ping"');
    expect(read("src/main/course-identity.ts")).toContain('COURSE_MARKER_NAME = ".praxeum.json"');
    expect(read("src/main/update/release-manifest.ts")).toContain(
      'productId: z.literal("praxeum-desktop")',
    );
  });

  it("uses the repository-owned Lerience icon for Windows packages", () => {
    expect(fs.existsSync(path.join(root, "build", "icon.svg"))).toBe(true);
    expect(fs.existsSync(path.join(root, "build", "icon.png"))).toBe(true);
    expect(fs.existsSync(path.join(root, "build", "icon.ico"))).toBe(true);
    expect(read("electron-builder.config.mjs")).toContain('icon: "build/icon.ico"');
  });

  it("keeps the public status aligned with the published release", () => {
    const status = read("docs/STATUS.md");
    expect(status).toContain("Public unsigned Windows x64 community releases are available");
    expect(status).toContain("https://github.com/sqmch/lerience/releases/latest");
    expect(status).toContain("stable application ID is `io.github.sqmch.lerience`");
    expect(status).toContain("five-upload release");
    expect(status).toContain("downloaded-byte signature");
    expect(status).toContain("Encrypted recovery of the release key has been confirmed");
    expect(status).toMatch(/normal Windows learner-path smoke/);
    expect(status).toContain("publication are complete");
    expect(status).not.toContain("No binary is public yet");
    expect(status).not.toContain("private development-history");
    expect(status).not.toMatch(/Lerience v\d+\.\d+\.\d+ is public/);
  });

  it("keeps public-facing local documentation links resolvable", () => {
    const documents = [
      "README.md",
      "CONTRIBUTING.md",
      "SECURITY.md",
      "SUPPORT.md",
      "CODE_OF_CONDUCT.md",
      "docs/STATUS.md",
      "distribution/README.md",
      "distribution/RELEASE-OPERATIONS.md",
    ];
    for (const document of documents) {
      const source = read(document);
      for (const match of source.matchAll(/\]\((?!https?:\/\/|#)([^)#]+)(?:#[^)]+)?\)/gu)) {
        const target = match[1];
        if (target === undefined || target.startsWith("mailto:")) continue;
        const absolutePath = path.resolve(root, path.dirname(document), decodeURIComponent(target));
        expect(fs.existsSync(absolutePath), `${document} links to missing ${target}`).toBe(true);
      }
    }
  });
});
