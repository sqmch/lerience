import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { copyNpmTree } from "../scripts/assemble-runtime.mjs";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("runtime input normalization", () => {
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
});
