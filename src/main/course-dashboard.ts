/* Dashboard projection only. Registry identity/path facts remain app-owned;
   all learning facts are re-derived from course files on every list. */

import fs from "node:fs";
import path from "node:path";
import { dueItems } from "../shared/course-data";
import type { DashboardCourse } from "../shared/ipc";
import type { CourseRegistryEntry } from "./course-registry";
import { inspectCourse, looksLikeCourse } from "./course-session";

export function describeRegisteredCourse(entry: CourseRegistryEntry): DashboardCourse {
  const base = {
    courseId: entry.courseId,
    rootPath: entry.rootPath,
    folderName: path.basename(entry.rootPath),
    lastOpenedAt: entry.lastOpenedAt,
  };

  if (!fs.existsSync(entry.rootPath) || !looksLikeCourse(entry.rootPath)) {
    return { ...base, available: false };
  }

  try {
    const { data } = inspectCourse(entry.rootPath);
    return {
      ...base,
      available: true,
      title: data.title,
      currentModuleId: data.currentModuleId,
      completedModules: data.modules.filter((module) => module.status === "completed").length,
      totalModules: data.modules.length,
      dueCount: dueItems(data.quiz).length,
      onboarding: data.modules.length === 0,
    };
  } catch {
    // A permission-denied/offline/removable location is recoverable from the
    // dashboard just like a moved folder; never discard its registry entry.
    return { ...base, available: false };
  }
}
