import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CourseEngineUpdater,
  type CandidateValidation,
  type CourseEngineUpdaterOptions,
} from "../src/main/course-engine-updater";
import { CourseCreator, HostGitRunner } from "../src/main/course-creator";
import { loadAssembledRuntime } from "./helpers/assembled-runtime";

const temporaryRoots: string[] = [];

function temporaryRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "praxeum-engine-updater-test-"));
  temporaryRoots.push(root);
  return root;
}

function git(root: string, args: readonly string[]): string {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    windowsHide: true,
  }).trim();
}

function write(root: string, relativePath: string, contents: string): void {
  const target = path.join(root, ...relativePath.split("/"));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

function createTemplate(root: string, version: "old" | "new"): void {
  write(root, ".gitattributes", "* text=auto eol=lf\n");
  write(root, ".gitignore", "node_modules/\n.env\n*.log\n");
  write(root, "AGENTS.md", "Read CLAUDE.md.\n");
  write(root, "CLAUDE.md", version === "old" ? "# Tutor protocol v1\n" : "# Tutor protocol v2\n");
  write(root, "LICENSE", "MIT\n");
  write(root, "package.json", '{"private":true,"type":"module"}\n');
  write(root, "docs/FORMAT.md", "# Format v0\n");
  write(root, "scripts/doctor.mjs", version === "old" ? "// doctor v1\n" : "// doctor v2\n");
  write(root, "templates/tutor/progress.json", '{"modules":{}}\n');
  if (version === "old") {
    write(root, "README.md", "# Old engine readme\n");
  } else {
    write(root, "docs/UPDATE-NOTES.md", "# Engine update notes\n");
  }
}

async function createCourse(workspace: string): Promise<{
  courseRoot: string;
  oldTemplate: string;
  newTemplate: string;
}> {
  const oldTemplate = path.join(workspace, "old-template");
  const newTemplate = path.join(workspace, "new-template");
  const courses = path.join(workspace, "courses");
  createTemplate(oldTemplate, "old");
  createTemplate(newTemplate, "new");
  fs.mkdirSync(courses);
  const creator = new CourseCreator({
    courseTemplateRoot: oldTemplate,
    git: new HostGitRunner(),
    createCourseId: () => "123e4567-e89b-42d3-a456-426614174000",
  });
  const created = await creator.create({ parentDirectory: courses, name: "Existing Course" });
  return { courseRoot: created.rootPath, oldTemplate, newTemplate };
}

function commitLearnerContent(courseRoot: string): void {
  write(courseRoot, "COURSE.md", "# Learner-owned course arc\n");
  write(courseRoot, "tutor/progress.json", '{"currentModule":null,"modules":{}}\n');
  execFileSync(
    "git",
    [
      "-C",
      courseRoot,
      "-c",
      "user.name=Learner",
      "-c",
      "user.email=learner@example.invalid",
      "-c",
      "commit.gpgSign=false",
      "add",
      "--all",
    ],
    { windowsHide: true },
  );
  execFileSync(
    "git",
    [
      "-C",
      courseRoot,
      "-c",
      "user.name=Learner",
      "-c",
      "user.email=learner@example.invalid",
      "-c",
      "commit.gpgSign=false",
      "commit",
      "--no-verify",
      "-m",
      "Start learner course",
    ],
    { windowsHide: true },
  );
}

function updater(
  newTemplate: string,
  validateCandidate: CourseEngineUpdaterOptions["validateCandidate"] = async () => ({ ok: true }),
): CourseEngineUpdater {
  return new CourseEngineUpdater({
    courseTemplateRoot: newTemplate,
    targetEngineVersion: "0.2.0",
    gitExecutable: "git",
    validateCandidate,
  });
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("CourseEngineUpdater", { timeout: 30_000 }, () => {
  it("previews and applies an isolated engine commit without touching learner content", async () => {
    const workspace = temporaryRoot();
    const { courseRoot, newTemplate } = await createCourse(workspace);
    commitLearnerContent(courseRoot);
    const beforeHead = git(courseRoot, ["rev-parse", "HEAD"]);
    const beforeCourse = fs.readFileSync(path.join(courseRoot, "COURSE.md"), "utf8");
    const beforeProgress = fs.readFileSync(path.join(courseRoot, "tutor", "progress.json"), "utf8");
    const seenCandidates: string[] = [];
    const engineUpdater = updater(newTemplate, async (candidateRoot) => {
      seenCandidates.push(candidateRoot);
      expect(fs.readFileSync(path.join(candidateRoot, "CLAUDE.md"), "utf8")).toBe(
        "# Tutor protocol v2\n",
      );
      expect(fs.existsSync(path.join(candidateRoot, "README.md"))).toBe(false);
      expect(fs.readFileSync(path.join(candidateRoot, "COURSE.md"), "utf8")).toBe(beforeCourse);
      return { ok: true };
    });

    const preview = await engineUpdater.preview(courseRoot);
    expect(preview).toMatchObject({
      status: "ready",
      head: beforeHead,
      branch: "main",
      courseDirty: false,
      targetVersion: "0.2.0",
      changes: [
        { path: "CLAUDE.md", kind: "update" },
        { path: "docs/UPDATE-NOTES.md", kind: "add" },
        { path: "README.md", kind: "remove" },
        { path: "scripts/doctor.mjs", kind: "update" },
      ],
    });

    const result = await engineUpdater.apply(courseRoot);
    expect(result).toMatchObject({
      status: "updated",
      fromHead: beforeHead,
      targetVersion: "0.2.0",
      changedPaths: ["CLAUDE.md", "docs/UPDATE-NOTES.md", "README.md", "scripts/doctor.mjs"],
    });
    expect(seenCandidates).toHaveLength(1);
    expect(fs.existsSync(seenCandidates[0] ?? "")).toBe(false);
    expect(fs.readFileSync(path.join(courseRoot, "COURSE.md"), "utf8")).toBe(beforeCourse);
    expect(fs.readFileSync(path.join(courseRoot, "tutor", "progress.json"), "utf8")).toBe(
      beforeProgress,
    );
    expect(fs.readFileSync(path.join(courseRoot, "CLAUDE.md"), "utf8")).toBe(
      "# Tutor protocol v2\n",
    );
    expect(fs.existsSync(path.join(courseRoot, "README.md"))).toBe(false);
    expect(git(courseRoot, ["status", "--porcelain"])).toBe("");
    expect(git(courseRoot, ["remote"])).toBe("");
    expect(git(courseRoot, ["log", "-1", "--format=%an <%ae>%n%s%n%b"])).toContain(
      "Lerience <noreply@lerience.local>\nUpdate Praxeum Course Engine to 0.2.0\nPraxeum-Engine-Update: 1",
    );

    const after = await engineUpdater.preview(courseRoot);
    expect(after.status, JSON.stringify(after)).toBe("current");
    expect(after).toMatchObject({
      status: "current",
      head: git(courseRoot, ["rev-parse", "HEAD"]),
      branch: "main",
      courseDirty: false,
      changes: [],
    });
  }, 60_000);

  it("refuses a modified engine file and a learner-owned collision without changing Git", async () => {
    const workspace = temporaryRoot();
    const { courseRoot, newTemplate } = await createCourse(workspace);
    const beforeHead = git(courseRoot, ["rev-parse", "HEAD"]);
    write(courseRoot, "CLAUDE.md", "# Learner modified the protocol\n");
    write(courseRoot, "docs/UPDATE-NOTES.md", "learner file at a future engine path\n");
    const engineUpdater = updater(newTemplate);

    const preview = await engineUpdater.preview(courseRoot);
    expect(preview).toMatchObject({
      status: "blocked",
      reason: "engine-conflicts",
      conflicts: ["CLAUDE.md", "docs/UPDATE-NOTES.md"],
    });
    await expect(engineUpdater.apply(courseRoot)).resolves.toMatchObject({
      status: "refused",
      reason: "engine-conflicts",
      conflicts: ["CLAUDE.md", "docs/UPDATE-NOTES.md"],
    });
    expect(git(courseRoot, ["rev-parse", "HEAD"])).toBe(beforeHead);
    expect(fs.readFileSync(path.join(courseRoot, "CLAUDE.md"), "utf8")).toBe(
      "# Learner modified the protocol\n",
    );
  });

  it("requires the whole learner repository to be clean before apply", async () => {
    const workspace = temporaryRoot();
    const { courseRoot, newTemplate } = await createCourse(workspace);
    const beforeHead = git(courseRoot, ["rev-parse", "HEAD"]);
    write(courseRoot, "COURSE.md", "# Uncommitted learner work\n");
    const engineUpdater = updater(newTemplate);

    await expect(engineUpdater.preview(courseRoot)).resolves.toMatchObject({
      status: "ready",
      courseDirty: true,
    });
    await expect(engineUpdater.apply(courseRoot)).resolves.toEqual({
      status: "refused",
      reason: "course-dirty",
      detail: "Finish or close the current course work before updating its Course Engine.",
    });
    expect(git(courseRoot, ["rev-parse", "HEAD"])).toBe(beforeHead);
    expect(fs.readFileSync(path.join(courseRoot, "CLAUDE.md"), "utf8")).toBe(
      "# Tutor protocol v1\n",
    );
    expect(fs.readFileSync(path.join(courseRoot, "COURSE.md"), "utf8")).toBe(
      "# Uncommitted learner work\n",
    );
  });

  it("validates a temporary candidate and leaves the source untouched when validation fails", async () => {
    const workspace = temporaryRoot();
    const { courseRoot, newTemplate } = await createCourse(workspace);
    const beforeHead = git(courseRoot, ["rev-parse", "HEAD"]);
    const candidates: string[] = [];
    const invalid: CandidateValidation = { ok: false, detail: "candidate doctor failed" };
    const engineUpdater = updater(newTemplate, async (candidateRoot) => {
      candidates.push(candidateRoot);
      return invalid;
    });

    await expect(engineUpdater.apply(courseRoot)).resolves.toEqual({
      status: "refused",
      reason: "candidate-invalid",
      detail: "candidate doctor failed",
    });
    expect(candidates).toHaveLength(1);
    expect(fs.existsSync(candidates[0] ?? "")).toBe(false);
    expect(git(courseRoot, ["rev-parse", "HEAD"])).toBe(beforeHead);
    expect(git(courseRoot, ["status", "--porcelain"])).toBe("");
  });

  it("keeps a legacy or unrelated Git history compatible but ineligible for automatic updates", async () => {
    const workspace = temporaryRoot();
    const courseRoot = path.join(workspace, "legacy-course");
    const newTemplate = path.join(workspace, "new-template");
    fs.mkdirSync(courseRoot);
    createTemplate(newTemplate, "new");
    write(courseRoot, "CLAUDE.md", "# Legacy tutor protocol\n");
    git(courseRoot, ["init", "--initial-branch=main"]);
    git(courseRoot, ["add", "--all"]);
    execFileSync(
      "git",
      [
        "-C",
        courseRoot,
        "-c",
        "user.name=Legacy learner",
        "-c",
        "user.email=legacy@example.invalid",
        "-c",
        "commit.gpgSign=false",
        "commit",
        "--no-verify",
        "-m",
        "Create legacy course",
      ],
      { windowsHide: true },
    );

    const preview = await updater(newTemplate).preview(courseRoot);
    expect(preview).toMatchObject({
      status: "blocked",
      reason: "unsupported-course",
    });
    if (preview.status !== "blocked") throw new Error("Expected a blocked preview");
    expect(preview.detail).toContain("remains compatible");
    expect(git(courseRoot, ["status", "--porcelain"])).toBe("");
  });

  it("refuses target templates that overlap learner-owned course paths", async () => {
    const workspace = temporaryRoot();
    const { courseRoot, newTemplate } = await createCourse(workspace);
    write(newTemplate, "tutor/progress.json", '{"shouldNever":"ship"}\n');

    await expect(updater(newTemplate).preview(courseRoot)).resolves.toMatchObject({
      status: "blocked",
      reason: "unsafe-template",
      conflicts: [],
    });
  });

  it.runIf(process.env["PRAXEUM_RUNTIME_ROOT"] !== undefined)(
    "applies and validates an update using the assembled native runtime",
    async () => {
      const runtime = loadAssembledRuntime();
      const workspace = temporaryRoot();
      const oldTemplate = path.join(workspace, "old-template");
      const courses = path.join(workspace, "courses");
      const targetTemplate = runtime.layout.courseTemplateRoot;
      const manifest = JSON.parse(
        fs.readFileSync(path.join(runtime.root, "course-engine", "manifest.json"), "utf8"),
      ) as { engineVersion?: unknown };
      if (typeof manifest.engineVersion !== "string") {
        throw new Error("The assembled Course Engine version is unavailable");
      }
      createTemplate(oldTemplate, "old");
      fs.mkdirSync(courses);
      const creator = new CourseCreator({
        courseTemplateRoot: oldTemplate,
        git: new HostGitRunner(runtime.layout.gitExecutable),
      });
      const created = await creator.create({ parentDirectory: courses, name: "Runtime Update" });
      const engineUpdater = new CourseEngineUpdater({
        courseTemplateRoot: targetTemplate,
        targetEngineVersion: manifest.engineVersion,
        gitExecutable: runtime.layout.gitExecutable,
        validateCandidate: async (candidateRoot) => {
          const doctor = spawnSync(
            runtime.electronExecutable,
            [path.join(candidateRoot, "scripts", "doctor.mjs"), candidateRoot, "--json"],
            {
              cwd: candidateRoot,
              encoding: "utf8",
              windowsHide: true,
              env: runtime.environment,
            },
          );
          if (
            ![0, 1].includes(doctor.status ?? -1) ||
            doctor.error !== undefined ||
            doctor.stderr !== ""
          ) {
            return { ok: false, detail: "the assembled candidate doctor could not run" };
          }
          try {
            JSON.parse(doctor.stdout);
            return { ok: true };
          } catch {
            return { ok: false, detail: "the assembled candidate doctor returned invalid JSON" };
          }
        },
      });

      await expect(engineUpdater.apply(created.rootPath)).resolves.toMatchObject({
        status: "updated",
        targetVersion: manifest.engineVersion,
      });
      await expect(engineUpdater.preview(created.rootPath)).resolves.toMatchObject({
        status: "current",
        courseDirty: false,
      });
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
    },
    60_000,
  );
});
