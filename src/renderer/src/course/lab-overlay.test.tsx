// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { labFixtureCourse } from "../../../../dev/renderer-harness/lab-fixture";
import { LabOverlay } from "./lab-overlay";
import type { CourseData } from "../../../shared/course-data";

function renderChoice(course: CourseData, selectedKey: string) {
  document.body.innerHTML = renderToStaticMarkup(
    <LabOverlay
      open
      course={course}
      contextModuleId="00-position"
      selectedKey={selectedKey}
      onSelect={() => undefined}
      onOpenChange={() => undefined}
    />,
  );
  return document.querySelector('[aria-label="Which visualization is on the stage"]')?.textContent;
}

describe("lab choice labels", () => {
  it("distinguishes module-owned visuals with the same title without changing the selected file", () => {
    const course = labFixtureCourse();
    for (const [key, label] of [
      ["00-position/loop.html", "The loop · Position"],
      ["01-velocity/loop.html", "The loop · Velocity"],
      ["02-force/loop.html", "The loop · Force"],
    ] as const) {
      expect(renderChoice(course, key)).toBe(label);
      expect(document.querySelector("iframe")?.getAttribute("src")).toBe(`praxeum-visual://${key}`);
    }
  });

  it("keeps unique titles compact and selection stable when another title changes", () => {
    const course = labFixtureCourse();
    expect(renderChoice(course, "vectors")).toBe("Vectors & Similarity");
    course.labs.find((entry) => entry.key === "01-velocity/loop.html")!.title = "Velocity loop";
    expect(renderChoice(course, "01-velocity/loop.html")).toBe("Velocity loop");
    expect(document.querySelector("iframe")?.getAttribute("src")).toBe(
      "praxeum-visual://01-velocity/loop.html",
    );
  });

  it("distinguishes files even when module titles are also identical", () => {
    const course = labFixtureCourse();
    course.modules.forEach((module) => {
      module.title = "Repeated module title";
    });
    for (const entry of course.labs.filter((entry) => entry.visual !== undefined)) {
      expect(renderChoice(course, entry.key)).toBe(
        `The loop · Repeated module title · ${entry.key}`,
      );
    }
  });
});
