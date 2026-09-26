// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ASSESSMENT_COURSE,
  readAssessmentDoc,
} from "../../../../dev/renderer-harness/assessment-fixture";
import type { CourseModule } from "../../../shared/course-data";
import { MaterialPane } from "./material";

describe("Brief composition boundary", () => {
  const render = (module: CourseModule, briefSupplement?: React.ReactNode) =>
    renderToStaticMarkup(
      <MaterialPane
        activeModule={module}
        docs={{ [module.briefPath!]: readAssessmentDoc(module.briefPath!)! }}
        quiz={[]}
        labs={[]}
        courseDoc={null}
        tab="brief"
        onTab={() => undefined}
        onOpenLab={() => undefined}
        briefSupplement={briefSupplement}
      />,
    );

  it("leaves an ordinary non-form activity intact without adding assessment", () => {
    const ordinary = render(ASSESSMENT_COURSE.data.modules[0]!);
    expect(ordinary).toContain("Read a state, describe a change");
    expect(ordinary).toContain("Sketch two snapshots");
    expect(ordinary).not.toContain("Submit answers");
    expect(ordinary).not.toContain("Run checks");
  });

  it("adds a response area while retaining the authored question and scenario", () => {
    const preview = render(
      ASSESSMENT_COURSE.data.modules[1]!,
      <p>Development-only response area</p>,
    );
    expect(preview).toContain("Development-only response area");
    expect(preview).toContain("Trace the token bin");
    expect(preview).toContain("Additions spill when the bin is full");
    expect(preview).not.toContain("Run checks");
  });

  it("preserves mixed Brief prose, code, commands and Run checks beside the optional activity", () => {
    document.body.innerHTML = render(
      ASSESSMENT_COURSE.data.modules[2]!,
      <p>Development-only response area</p>,
    );
    expect(document.body.textContent).toContain("Implement the bin rule");
    expect(document.body.textContent).toContain("Open in editor");
    expect(document.body.textContent).toContain(
      "Passing its number checks does not verify your code",
    );
    expect(document.body.textContent).toContain("Development-only response area");
    const code = [...document.querySelectorAll("pre code")].map((element) => element.textContent);
    expect(code.some((text) => text?.includes("step(stored, event, capacity)"))).toBe(true);
    expect(code.some((text) => text?.includes("npm test"))).toBe(true);
    expect(
      [...document.querySelectorAll("button")].some(
        (button) => button.textContent === "Run checks",
      ),
    ).toBe(true);
  });
});
