import path from "node:path";
import { describe, expect, it } from "vitest";
import { createRuntimeEnvironment, resolveRuntimeLayout } from "../src/main/runtime-layout";

const development = {
  courseTemplateRoot: "C:/dev/praxeum-desktop/course-engine/template",
  npmCliPath: "C:/dev/praxeum/node_modules/npm/bin/npm-cli.js",
  gitExecutable: "C:/host/git.exe",
};

describe("runtime layout", () => {
  it("keeps development dependencies injectable", () => {
    expect(
      resolveRuntimeLayout({
        packaged: false,
        resourcesPath: "C:/installed/resources",
        platform: "win32",
        architecture: "x64",
        development,
      }),
    ).toMatchObject({
      mode: "development",
      root: null,
      manifestPath: null,
      courseTemplateRoot: development.courseTemplateRoot,
      gitExecutable: development.gitExecutable,
      npmCliPath: development.npmCliPath,
      nodeShimPath: "node",
      toolDirectories: [],
    });
  });

  it("prepends packaged tools without replacing learner environment values", () => {
    const environment = createRuntimeEnvironment(
      ["C:/runtime/git", "C:/runtime/node"],
      {
        Path: "C:/Windows/System32",
        HOME: "C:/Users/learner",
        PRAXEUM_TEST: "kept",
        praxeum_electron_executable: "C:/untrusted.exe",
      },
      "win32",
      "C:/Program Files/Lerience/Lerience.exe",
    );

    expect(environment).toEqual({
      Path: "C:/runtime/git;C:/runtime/node;C:/Windows/System32",
      HOME: "C:/Users/learner",
      PRAXEUM_TEST: "kept",
      PRAXEUM_ELECTRON_EXECUTABLE: "C:/Program Files/Lerience/Lerience.exe",
    });
  });

  it("uses installer-owned course tools but no provider or standalone Node payload", () => {
    const resourcesPath = "C:/Program Files/Lerience/resources";
    const layout = resolveRuntimeLayout({
      packaged: true,
      resourcesPath,
      platform: "win32",
      architecture: "x64",
      development,
    });

    expect(layout).toMatchObject({
      mode: "packaged",
      platform: "win32",
      architecture: "x64",
      root: path.join(resourcesPath, "runtime"),
      courseTemplateRoot: path.join(resourcesPath, "runtime", "course-engine", "template"),
      gitExecutable: path.join(resourcesPath, "runtime", "tools", "git", "cmd", "git.exe"),
      npmCliPath: path.join(resourcesPath, "runtime", "tools", "npm", "bin", "npm-cli.js"),
      nodeShimPath: path.join(resourcesPath, "runtime", "tools", "npm", "bin", "node.cmd"),
    });
    const packagedValues = [
      layout.courseTemplateRoot,
      layout.gitExecutable,
      layout.npmCliPath,
      layout.nodeShimPath,
    ];
    expect(packagedValues).not.toContain(development.courseTemplateRoot);
    expect(packagedValues).not.toContain(development.gitExecutable);
    expect(packagedValues).not.toContain(development.npmCliPath);
    expect(packagedValues).not.toContain("git");
    expect(packagedValues).not.toContain("node");
    expect(layout.toolDirectories).toEqual([
      path.join(resourcesPath, "runtime", "tools", "git", "cmd"),
      path.join(resourcesPath, "runtime", "tools", "npm", "bin"),
    ]);
  });

  it("lays out separate native macOS resources for each architecture", () => {
    for (const architecture of ["arm64", "x64"] as const) {
      const layout = resolveRuntimeLayout({
        packaged: true,
        resourcesPath: "/Applications/Lerience.app/Contents/Resources",
        platform: "darwin",
        architecture,
        development,
      });

      expect(layout.architecture).toBe(architecture);
      expect(layout.gitExecutable.endsWith(path.join("tools", "git", "bin", "git"))).toBe(true);
      expect(layout.nodeShimPath.endsWith(path.join("tools", "npm", "bin", "node"))).toBe(true);
    }
  });

  it("fails closed for a packaged target the release pipeline does not build", () => {
    expect(() =>
      resolveRuntimeLayout({
        packaged: true,
        resourcesPath: "/opt/praxeum/resources",
        platform: "linux",
        architecture: "x64",
        development,
      }),
    ).toThrow("Lerience has no packaged runtime for linux-x64.");
  });
});
