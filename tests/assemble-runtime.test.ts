import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  assembleRuntime,
  copyNpmTree,
  writeJavaScriptToolShims,
} from "../scripts/assemble-runtime.mjs";
import { createRuntimeEnvironment } from "../src/main/runtime-layout";
import { loadAssembledRuntime } from "./helpers/assembled-runtime";

const temporaryRoots: string[] = [];
const require = createRequire(import.meta.url);
let electron: string;

beforeAll(() => {
  // A fresh dependency install downloads Electron on first require. Keep that
  // setup separate from the bounded native launcher checks.
  if (process.platform === "win32") electron = require("electron") as string;
}, 120_000);

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("runtime input normalization", () => {
  it.skipIf(process.platform !== "win32")(
    "runs packaged npm and npx from PowerShell without host Node",
    async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "praxeum npm launch test "));
      temporaryRoots.push(root);
      const assembled = process.env.PRAXEUM_RUNTIME_ROOT ? loadAssembledRuntime() : undefined;
      const npmRoot = assembled
        ? path.join(assembled.root, "tools", "npm")
        : path.join(root, "npm");
      if (!assembled) {
        await copyNpmTree(path.dirname(require.resolve("npm/package.json")), npmRoot);
        await writeJavaScriptToolShims(npmRoot, "win32");
      }
      const environment = createRuntimeEnvironment(
        [path.join(npmRoot, "bin")],
        {
          SystemRoot: process.env.SystemRoot,
          TEMP: root,
          TMP: root,
          PATHEXT: ".COM;.EXE;.BAT;.CMD",
          PATH: path.join(process.env.SystemRoot!, "System32"),
        },
        "win32",
        electron,
      );
      fs.writeFileSync(
        path.join(root, "package.json"),
        JSON.stringify({
          name: "offline-launch-fixture",
          version: "1.0.0",
          private: true,
          scripts: { fixture: "node fixture.cjs", stdin: "node stdin.cjs" },
        }),
      );
      fs.writeFileSync(
        path.join(root, "fixture.cjs"),
        'console.log("runtime=" + process.execPath); console.log(JSON.stringify(process.argv.slice(2))); process.exitCode = Number(process.env.FIXTURE_EXIT || 0);',
      );
      fs.writeFileSync(
        path.join(root, "stdin.cjs"),
        'console.log("received=" + require("node:fs").readFileSync(0, "utf8").trim());',
      );
      const powershell = path.join(
        process.env.SystemRoot!,
        "System32",
        "WindowsPowerShell",
        "v1.0",
        "powershell.exe",
      );
      const run = (command: string, env = environment) =>
        spawnSync(
          powershell,
          ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command],
          { cwd: root, env, encoding: "utf8", timeout: 30000 },
        );
      for (const command of [
        "npm --version",
        "npx --version",
        "npm.cmd --version",
        "npx.cmd --version",
      ]) {
        const result = run(command);
        expect(result.stderr).toBe("");
        expect(result.status, JSON.stringify({ command, ...result })).toBe(0);
        expect(result.stdout.trim()).toBe(require("npm/package.json").version);
      }
      const script = run("npm run fixture -- 'argument with spaces'; exit $LASTEXITCODE");
      expect(script.status).toBe(0);
      expect(script.stdout).toContain(`runtime=${electron}`);
      expect(script.stdout).toContain('["argument with spaces"]');
      const failedScript = run("npm run fixture; exit $LASTEXITCODE", {
        ...environment,
        FIXTURE_EXIT: "7",
      });
      expect(failedScript, JSON.stringify(failedScript)).toHaveProperty("status", 7);
      for (const command of ["npm run stdin", 'npx --offline -c "node stdin.cjs"']) {
        const piped = run(`'piped input with spaces' | ${command}; exit $LASTEXITCODE`);
        expect(piped.stderr).toBe("");
        expect(piped.status).toBe(0);
        expect(piped.stdout).toContain("received=piped input with spaces");
      }
      const dependency = path.join(root, "local-dependency");
      fs.mkdirSync(dependency);
      fs.writeFileSync(
        path.join(dependency, "package.json"),
        JSON.stringify({ name: "local-dependency", version: "1.0.0" }),
      );
      const install = run(
        "npm install --offline --ignore-scripts --no-audit --no-fund ./local-dependency; exit $LASTEXITCODE",
      );
      expect(install.stderr).toBe("");
      expect(install.status).toBe(0);
      expect(
        fs.existsSync(path.join(root, "node_modules", "local-dependency", "package.json")),
      ).toBe(true);
      const shell = path.join(
        assembled
          ? path.join(assembled.root, "tools", "git")
          : path.join(path.dirname(require.resolve("dugite/package.json")), "git"),
        "usr",
        "bin",
        "sh.exe",
      );
      for (const command of ["npm", "npx"]) {
        const result = spawnSync(shell, ["-c", `${command} --version`], {
          cwd: root,
          env: environment,
          encoding: "utf8",
          timeout: 30000,
        });
        expect(result.stderr).toBe("");
        expect(result.status).toBe(0);
        expect(result.stdout.trim()).toBe(require("npm/package.json").version);
      }
      for (const command of ["npm", "npx", "npm.cmd", "npx.cmd"]) {
        expect(
          run(`${command} --version; exit $LASTEXITCODE`, {
            ...environment,
            PRAXEUM_ELECTRON_EXECUTABLE: "",
          }).status,
        ).toBe(1);
      }
    },
    // Fifteen native shell launches share this test; each still has a 30s cap.
    120000,
  );

  it("excludes package-manager shims nested inside the npm package", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "praxeum-npm-copy-test-"));
    temporaryRoots.push(root);
    const source = path.join(root, "source");
    const destination = path.join(root, "destination");
    fs.mkdirSync(path.join(source, "bin"), { recursive: true });
    fs.mkdirSync(path.join(source, "node_modules", ".bin"), { recursive: true });
    fs.mkdirSync(path.join(source, "node_modules", "kept"), { recursive: true });
    fs.writeFileSync(path.join(source, "bin", "npm-cli.js"), "npm");
    fs.writeFileSync(path.join(source, "node_modules", ".bin", "npm.cmd"), "generated");
    fs.writeFileSync(path.join(source, "node_modules", "kept", "index.js"), "kept");

    await copyNpmTree(source, destination);

    expect(fs.readFileSync(path.join(destination, "bin", "npm-cli.js"), "utf8")).toBe("npm");
    expect(
      fs.readFileSync(path.join(destination, "node_modules", "kept", "index.js"), "utf8"),
    ).toBe("kept");
    expect(fs.existsSync(path.join(destination, "node_modules", ".bin"))).toBe(false);
  });

  it("reports every candidate tree and removes an unaccepted target without a manifest", async () => {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "praxeum-runtime-candidate-test-"));
    temporaryRoots.push(fixtureRoot);
    const sourcesRoot = path.join(fixtureRoot, "sources");
    const courseEngineRoot = path.join(sourcesRoot, "course-engine");
    const gitRoot = path.join(sourcesRoot, "git");
    const npmRoot = path.join(sourcesRoot, "npm");
    const licensesRoot = path.join(sourcesRoot, "licenses");
    const outputRoot = path.join(fixtureRoot, "runtime-output");
    fs.mkdirSync(path.join(courseEngineRoot, "template", "scripts"), { recursive: true });
    fs.mkdirSync(path.join(gitRoot, "bin"), { recursive: true });
    fs.mkdirSync(path.join(npmRoot, "bin"), { recursive: true });
    fs.mkdirSync(licensesRoot, { recursive: true });
    fs.writeFileSync(
      path.join(courseEngineRoot, "manifest.json"),
      JSON.stringify({
        engineVersion: "1.0.0",
        source: { repository: "https://example.test/course-engine", commit: "abc123" },
      }),
    );
    fs.writeFileSync(path.join(courseEngineRoot, "template", "CLAUDE.md"), "course");
    fs.writeFileSync(path.join(courseEngineRoot, "template", "scripts", "doctor.mjs"), "doctor");
    fs.writeFileSync(path.join(gitRoot, "bin", "git"), "git");
    fs.writeFileSync(path.join(npmRoot, "bin", "npm-cli.js"), "npm");
    const licenseSources = Object.fromEntries(
      ["dugite", "git", "npm", "notices"].map((name) => {
        const filePath = path.join(licensesRoot, `${name}.txt`);
        fs.writeFileSync(filePath, `${name} license`);
        return [name, filePath];
      }),
    );
    const ledger = {
      acceptedComponentTrees: {},
      components: {
        git: {
          nativeVersion: "1.0.0",
          license: "test",
          targets: { "darwin-arm64": { url: "https://example.test/git.tar.gz" } },
        },
        npm: {
          version: "1.0.0",
          license: "test",
          url: "https://example.test/npm.tgz",
        },
      },
    };

    let failure: Error | undefined;
    try {
      await assembleRuntime({
        platform: "darwin",
        architecture: "arm64",
        targetKey: "darwin-arm64",
        ledger,
        sources: {
          courseEngineRoot,
          gitRoot,
          npmRoot,
          licenseSources,
          remoteLicenses: { "remote.txt": Buffer.from("remote license") },
        },
        outputRoot,
      });
    } catch (error) {
      failure = error as Error;
    }

    expect(failure?.message).toContain(
      "The reviewed ledger has no accepted component trees for darwin-arm64.",
    );
    expect(failure?.message).toMatch(
      /"course-engine":\{"fileCount":\d+,"treeSha256":"[a-f0-9]{64}"\}/u,
    );
    expect(failure?.message).toMatch(/"git":\{"fileCount":\d+,"treeSha256":"[a-f0-9]{64}"\}/u);
    expect(failure?.message).toMatch(/"npm":\{"fileCount":\d+,"treeSha256":"[a-f0-9]{64}"\}/u);
    expect(fs.existsSync(outputRoot)).toBe(false);
    expect(fs.existsSync(path.join(outputRoot, "manifest.json"))).toBe(false);
  });
});
