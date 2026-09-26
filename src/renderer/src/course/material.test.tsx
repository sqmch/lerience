// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ASSESSMENT_COURSE } from "../../../../dev/renderer-harness/assessment-fixture";
import { MaterialPane } from "./material";

describe("Brief composition boundary", () => {
  const module = ASSESSMENT_COURSE.data.modules[1]!;
  const render = (briefContent?: React.ReactNode) =>
    renderToStaticMarkup(
      <MaterialPane
        activeModule={module}
        docs={{ [module.briefPath!]: "# Existing course brief" }}
        quiz={[]}
        labs={[]}
        courseDoc={null}
        tab="brief"
        onTab={() => undefined}
        onOpenLab={() => undefined}
        briefContent={briefContent}
      />,
    );

  it("keeps ordinary course documents as the default and confines composed content to Brief", () => {
    expect(render()).toContain("Existing course brief");
    expect(render()).not.toContain("Submit answers");
    const preview = render(<p>Development-only response area</p>);
    expect(preview).toContain("Development-only response area");
    expect(preview).not.toContain("Existing course brief");
    expect(preview).not.toContain("Run checks");
  });
});
