import path from "node:path";
import { describe, expect, it } from "vitest";
import { discoverEditors } from "../src/main/editor/discovery";

describe("editor discovery", () => {
  it("finds Windows installs in their installers' own locations, in catalog order", () => {
    const local = "C:/Users/learner/AppData/Local";
    const zed = path.join(local, "Programs", "Zed", "Zed.exe");
    const code = path.join(local, "Programs", "Microsoft VS Code", "Code.exe");
    const present = new Set([zed, code]);
    expect(
      discoverEditors({
        platform: "win32",
        environment: { LOCALAPPDATA: local, ProgramFiles: "C:/Program Files", Path: "" },
        isFile: (candidate) => present.has(candidate),
        isDirectory: () => false,
      }),
    ).toEqual([
      { id: "vscode", label: "Visual Studio Code", launch: { kind: "executable", path: code } },
      { id: "zed", label: "Zed", launch: { kind: "executable", path: zed } },
    ]);
  });

  it("follows a PATH command wrapper to the real program instead of launching the wrapper", () => {
    const install = "D:/Tools/VS Code";
    const wrapper = path.join(install, "bin", "code.cmd");
    const program = path.resolve(install, "Code.exe");
    const present = new Set([wrapper, program]);
    const found = discoverEditors({
      platform: "win32",
      environment: { Path: `C:/nothing;"${path.join(install, "bin")}"` },
      isFile: (candidate) => present.has(candidate),
      isDirectory: () => false,
    });
    expect(found).toEqual([
      { id: "vscode", label: "Visual Studio Code", launch: { kind: "executable", path: program } },
    ]);
  });

  it("does not report an editor whose wrapper is on PATH but whose program is gone", () => {
    const wrapper = path.join("D:/Tools/VS Code/bin", "code.cmd");
    expect(
      discoverEditors({
        platform: "win32",
        environment: { Path: "D:/Tools/VS Code/bin" },
        isFile: (candidate) => candidate === wrapper,
        isDirectory: () => false,
      }),
    ).toEqual([]);
  });

  it("reports macOS apps as bundles to hand to `open`", () => {
    const bundle = path.join("/Users/learner/Applications", "Zed.app");
    expect(
      discoverEditors({
        platform: "darwin",
        environment: { HOME: "/Users/learner", PATH: "/usr/bin" },
        isFile: () => false,
        isDirectory: (candidate) => candidate === bundle,
      }),
    ).toEqual([{ id: "zed", label: "Zed", launch: { kind: "mac-app", bundlePath: bundle } }]);
  });

  it("falls back to PATH executables on Linux", () => {
    const subl = path.join("/home/learner/.local/bin", "subl");
    expect(
      discoverEditors({
        platform: "linux",
        environment: { HOME: "/home/learner", PATH: "/usr/bin:/home/learner/.local/bin" },
        isFile: (candidate) => candidate === subl,
        isDirectory: () => false,
      }),
    ).toEqual([
      { id: "sublime", label: "Sublime Text", launch: { kind: "executable", path: subl } },
    ]);
  });

  it("reports nothing found as an empty list rather than a guess", () => {
    expect(
      discoverEditors({
        platform: "linux",
        environment: { PATH: "/usr/bin" },
        isFile: () => false,
        isDirectory: () => false,
      }),
    ).toEqual([]);
  });
});
