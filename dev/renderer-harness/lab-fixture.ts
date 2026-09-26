/* Synthetic repeated claims and same-title, module-owned visuals for LB-010.
 * Feed the real assembler, so this fixture cannot bypass lab identity. */
import { assembleCourseData, type CourseFileMap } from "../../src/shared/course-data";

export function labFixtureFiles(): CourseFileMap {
  const contents: Record<string, string> = {};
  for (const [id, title, axisX] of [
    ["00-position", "Position", "East"],
    ["01-velocity", "Velocity", "Speed"],
    ["02-force", "Force", "Newtons"],
  ] as const) {
    contents[`curriculum/${id}/module.json`] = JSON.stringify({
      id,
      title,
      phase: 0,
      prerequisites: [],
      runtime: "node",
      estimatedHours: 1,
      provenance: "core",
      volatileLayer: "present",
    });
    contents[`curriculum/${id}/lab.json`] = JSON.stringify({
      vectors: { axisX },
      visuals: [
        { file: "loop.html", title: "The loop", blurb: "Explore the loop." },
        { file: "visuals/loop.html", title: "The loop", blurb: "Explore the loop." },
      ],
    });
  }
  return { files: Object.keys(contents), contents };
}

export function labFixtureCourse() {
  return assembleCourseData(labFixtureFiles());
}
