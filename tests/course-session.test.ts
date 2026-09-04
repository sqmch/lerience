import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { inspectCourse, unwatchCourse, watchCourse } from "../src/main/course-session";
import { moduleParts } from "../src/renderer/src/onboarding/build-parts";

vi.mock("../src/main/settings", () => ({
  readSettings: () => ({}),
  updateSettings: vi.fn(),
}));

let root: string | undefined;

afterEach(() => {
  unwatchCourse();
  vi.restoreAllMocks();
  vi.useRealTimers();
  if (root !== undefined) fs.rmSync(root, { recursive: true, force: true });
  root = undefined;
});

describe("course watch invalidation", () => {
  it.each([null, "curriculum", "curriculum\\00-synthetic"])(
    "refreshes actual module files after a coarse Windows notification: %s",
    (filename) => {
      vi.useFakeTimers();
      root = fs.mkdtempSync(path.join(os.tmpdir(), "lerience-watch-"));
      const courseRoot = root;
      let notify!: (event: string, filename: string | null) => void;
      vi.spyOn(fs, "watch").mockImplementation((...args: unknown[]) => {
        notify = args[2] as typeof notify;
        return { close: vi.fn() } as unknown as fs.FSWatcher;
      });
      const refresh = vi.fn(() => moduleParts(inspectCourse(courseRoot).data.files, null));
      watchCourse(courseRoot, refresh);
      const stagedRoot = path.join(courseRoot, "staging", "00-synthetic");
      fs.mkdirSync(path.join(stagedRoot, "scaffold"), { recursive: true });
      for (const file of ["module.json", "LESSON.md", "scaffold/package.json"]) {
        fs.writeFileSync(path.join(stagedRoot, file), "{}");
      }
      expect(moduleParts(inspectCourse(courseRoot).data.files, null).landed.size).toBe(0);
      const curriculum = path.join(courseRoot, "curriculum");
      fs.mkdirSync(curriculum);
      const moduleRoot = path.join(curriculum, "00-synthetic");
      fs.renameSync(stagedRoot, moduleRoot);
      // Recursive fs.watch can report the directory, not each file created
      // inside it. The notification is an invalidation, never an inventory.
      notify("rename", filename);
      vi.advanceTimersByTime(300);
      expect(refresh).toHaveBeenCalledOnce();
      expect(refresh.mock.results[0]?.value?.landed.size).toBe(3);

      fs.unlinkSync(path.join(moduleRoot, "LESSON.md"));
      notify("rename", filename);
      vi.advanceTimersByTime(300);
      expect(refresh.mock.results[1]?.value?.landed.size).toBe(2);
    },
  );

  it("cancels a queued refresh when the course closes", () => {
    vi.useFakeTimers();
    let notify!: (event: string, filename: string | null) => void;
    vi.spyOn(fs, "watch").mockImplementation((...args: unknown[]) => {
      notify = args[2] as typeof notify;
      return { close: vi.fn() } as unknown as fs.FSWatcher;
    });
    const refresh = vi.fn();
    watchCourse("synthetic-course", refresh);
    notify("rename", "COURSE.md");
    unwatchCourse();
    vi.advanceTimersByTime(300);
    expect(refresh).not.toHaveBeenCalled();
  });
});
