import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readCourseIdentity } from "../src/main/course-identity";
import {
  CourseCreator,
  CourseTargetExistsError,
  HostGitRunner,
  type GitRunner,
  validateCourseName,
} from "../src/main/course-creator";
import { loadAssembledRuntime } from "./helpers/assembled-runtime";

const temporaryRoots: string[] = [];

function temporaryRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "praxeum-creator-test-"));
  temporaryRoots.push(root);
  return root;
}

function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", windowsHide: true }).trim();
}

function createCourseTemplate(root: string): void {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, ".gitignore"), "node_modules/\ndist/\n.env\n*.log\n");
  fs.writeFileSync(path.join(root, ".gitattributes"), "* text=auto eol=lf\n");
  fs.writeFileSync(path.join(root, "CLAUDE.md"), "# Tutor protocol\n");
  fs.mkdirSync(path.join(root, "docs"));
  fs.writeFileSync(path.join(root, "README.md"), "# Engine\n");
  fs.writeFileSync(path.join(root, "docs", "FORMAT.md"), "# Format\n");
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("validateCourseName", () => {
  it("accepts a readable plain folder name and rejects path-shaped or platform-unsafe names", () => {
    expect(validateCourseName("Applied AI Systems")).toEqual({
      ok: true,
      name: "Applied AI Systems",
    });

    for (const name of [
      "",
      "../escape",
      "nested/course",
      "nested\\course",
      ".",
      "..",
      "-flag",
      "CON",
      "con.txt",
      "bad:name",
      "trailing. ",
    ]) {
      expect(validateCourseName(name), name).toMatchObject({ ok: false });
    }
  });
});

describe("CourseCreator", () => {
  // This is a real filesystem/Git integration and can cross Vitest's 5-second
  // unit default when the full Windows suite is running in parallel.
  it("materializes the app-owned template and creates a clean two-commit course", async () => {
    const workspace = temporaryRoot();
    const engine = path.join(workspace, "engine");
    const parent = path.join(workspace, "courses");
    const courseId = "123e4567-e89b-42d3-a456-426614174000";
    createCourseTemplate(engine);
    fs.mkdirSync(parent);

    const creator = new CourseCreator({
      courseTemplateRoot: engine,
      git: new HostGitRunner(),
      createCourseId: () => courseId,
    });
    const created = await creator.create({ parentDirectory: parent, name: "Applied AI" });

    expect(created).toEqual({
      rootPath: path.join(parent, "Applied AI"),
      identity: { courseId, formatVersion: 0 },
    });
    await expect(readCourseIdentity(created.rootPath)).resolves.toEqual(created.identity);
    expect(fs.existsSync(path.join(created.rootPath, ".git"))).toBe(true);
    expect(git(["-C", created.rootPath, "rev-list", "--count", "HEAD"])).toBe("2");
    expect(git(["-C", created.rootPath, "log", "--format=%s"])).toBe(
      "Initialize Praxeum course identity\nInitialize Praxeum Course Engine",
    );
    expect(git(["-C", created.rootPath, "remote"])).toBe("");
    expect(fs.readFileSync(path.join(created.rootPath, "docs", "FORMAT.md"), "utf8")).toBe(
      "# Format\n",
    );
    expect(
      git(["-C", created.rootPath, "log", "-1", "--format=%an <%ae>", "--", ".praxeum.json"]),
    ).toBe("Lerience <noreply@lerience.local>");
    expect(git(["-C", created.rootPath, "status", "--porcelain"])).toBe("");

    fs.mkdirSync(path.join(created.rootPath, "node_modules", "fixture"), { recursive: true });
    fs.writeFileSync(path.join(created.rootPath, "node_modules", "fixture", "index.js"), "x\n");
    fs.writeFileSync(path.join(created.rootPath, ".env"), "SECRET=not-committed\n");
    fs.writeFileSync(path.join(created.rootPath, "tutor.log"), "ignored\n");
    expect(
      git([
        "-C",
        created.rootPath,
        "check-ignore",
        ".env",
        "node_modules/fixture/index.js",
        "tutor.log",
      ]),
    ).toBe(".env\nnode_modules/fixture/index.js\ntutor.log");
    expect(git(["-C", created.rootPath, "status", "--porcelain"])).toBe("");

    const localIdentity = spawnSync(
      "git",
      ["-C", created.rootPath, "config", "--local", "--get", "user.name"],
      { encoding: "utf8", windowsHide: true },
    );
    expect(localIdentity.status).toBe(1);
    expect(fs.readdirSync(parent).filter((name) => name.startsWith(".praxeum-create-"))).toEqual(
      [],
    );
  }, 15_000);

  it("refuses an existing final path without running Git or disturbing its contents", async () => {
    const parent = temporaryRoot();
    const target = path.join(parent, "Existing Course");
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, "keep.txt"), "learner data\n");
    let gitCalls = 0;
    const runner: GitRunner = {
      run: () => {
        gitCalls += 1;
        return Promise.resolve();
      },
    };

    const creator = new CourseCreator({ courseTemplateRoot: "unused", git: runner });
    await expect(
      creator.create({ parentDirectory: parent, name: "Existing Course" }),
    ).rejects.toBeInstanceOf(CourseTargetExistsError);

    expect(gitCalls).toBe(0);
    expect(fs.readFileSync(path.join(target, "keep.txt"), "utf8")).toBe("learner data\n");
  });

  it("refuses a course parent that aliases the app-owned template", async () => {
    const workspace = temporaryRoot();
    const engine = path.join(workspace, "engine");
    const alias = path.join(workspace, "template-alias");
    createCourseTemplate(engine);
    fs.symlinkSync(engine, alias, process.platform === "win32" ? "junction" : "dir");
    const creator = new CourseCreator({ courseTemplateRoot: engine, git: new HostGitRunner() });

    await expect(
      creator.create({ parentDirectory: alias, name: "Recursive Course" }),
    ).rejects.toThrow("inside the app's course template");
    expect(fs.existsSync(path.join(engine, "Recursive Course"))).toBe(false);
    expect(fs.readdirSync(engine).filter((name) => name.startsWith(".praxeum-create-"))).toEqual(
      [],
    );
  });

  it("removes only its unique temporary sibling when Git initialization fails", async () => {
    const workspace = temporaryRoot();
    const parent = path.join(workspace, "courses");
    const template = path.join(workspace, "template");
    fs.mkdirSync(parent);
    createCourseTemplate(template);
    const unrelated = path.join(parent, ".praxeum-create-keep");
    fs.mkdirSync(unrelated);
    fs.writeFileSync(path.join(unrelated, "keep.txt"), "not ours\n");
    let partialClonePath = "";
    const runner: GitRunner = {
      run: (_args, options) => {
        partialClonePath = options?.cwd ?? "";
        fs.writeFileSync(path.join(partialClonePath, "partial.txt"), "partial clone\n");
        return Promise.reject(new Error("git init failed"));
      },
    };
    const creator = new CourseCreator({ courseTemplateRoot: template, git: runner });

    await expect(creator.create({ parentDirectory: parent, name: "New Course" })).rejects.toThrow(
      "git init failed",
    );

    expect(partialClonePath).not.toBe(path.join(parent, "New Course"));
    expect(fs.existsSync(partialClonePath)).toBe(false);
    expect(fs.readFileSync(path.join(unrelated, "keep.txt"), "utf8")).toBe("not ours\n");
    expect(fs.existsSync(path.join(parent, "New Course"))).toBe(false);
  });

  it.runIf(process.env["PRAXEUM_RUNTIME_ROOT"] !== undefined)(
    "creates and inspects a course using the assembled native runtime",
    async () => {
      const runtime = loadAssembledRuntime();
      const workspace = temporaryRoot();
      const parent = path.join(workspace, "courses");
      fs.mkdirSync(parent);
      const creator = new CourseCreator({
        courseTemplateRoot: runtime.layout.courseTemplateRoot,
        git: new HostGitRunner(runtime.layout.gitExecutable),
      });
      const created = await creator.create({ parentDirectory: parent, name: "Packaged Course" });

      expect(
        execFileSync(
          runtime.layout.gitExecutable,
          ["-C", created.rootPath, "status", "--porcelain"],
          {
            encoding: "utf8",
            windowsHide: true,
          },
        ),
      ).toBe("");
      expect(
        execFileSync(runtime.layout.gitExecutable, ["-C", created.rootPath, "remote"], {
          encoding: "utf8",
          windowsHide: true,
        }),
      ).toBe("");

      const doctor = spawnSync(
        runtime.electronExecutable,
        [
          fs.realpathSync(path.join(created.rootPath, "scripts", "doctor.mjs")),
          created.rootPath,
          "--json",
        ],
        {
          cwd: created.rootPath,
          encoding: "utf8",
          windowsHide: true,
          env: runtime.environment,
        },
      );
      expect([0, 1]).toContain(doctor.status);
      expect(doctor.error).toBeUndefined();
      expect(() => JSON.parse(doctor.stdout)).not.toThrow();
      expect(doctor.stderr).toBe("");
    },
  );
});
