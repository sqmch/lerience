// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderCourseMarkdown, renderDocMarkdown } from "../src/renderer/src/markdown";

const fence = (body: string): string => "```visual\n" + body + "\n```";

describe("the visual fence (engine FORMAT.md rules)", () => {
  it("becomes a placeholder div with file, clamped height, and label", () => {
    const html = renderDocMarkdown(
      fence(`{ "file": "loop.html", "height": 2000, "title": "The loop" }`),
    );
    expect(html).toContain('class="doc-visual-embed"');
    expect(html).toContain('data-visual-file="loop.html"');
    expect(html).toContain('data-visual-height="900"'); // clamped from 2000
    expect(html).toContain('data-visual-label="The loop"');
    expect(html).not.toContain("<iframe"); // the component mounts frames, not the parser
  });

  it("defaults height to 420 and clamps the floor to 160", () => {
    expect(renderDocMarkdown(fence(`{ "file": "a.html" }`))).toContain('data-visual-height="420"');
    expect(renderDocMarkdown(fence(`{ "file": "a.html", "height": 10 }`))).toContain(
      'data-visual-height="160"',
    );
  });

  it("falls back to a plain code block on malformed specs — never crash the doc", () => {
    for (const body of ["not json at all", `{ "height": 420 }`, `{ "file": 17 }`]) {
      const html = renderDocMarkdown(fence(body));
      expect(html).not.toContain("doc-visual-embed");
      expect(html).toContain("<pre>");
    }
  });

  it("escapes html smuggled through spec fields", () => {
    const html = renderDocMarkdown(
      fence(`{ "file": "x.html", "title": "<img src=x onerror=alert(1)>" }`),
    );
    expect(html).not.toContain("<img");
  });

  it("stays out of the plain renderer — a journal visual fence is just code", () => {
    const html = renderCourseMarkdown(fence(`{ "file": "loop.html" }`));
    expect(html).not.toContain("doc-visual-embed");
  });
});

describe("sanitizing", () => {
  it("strips script and event handlers from course markdown", () => {
    const html = renderCourseMarkdown(`hello <script>alert(1)</script> <b onclick="x()">b</b>`);
    expect(html).not.toContain("script");
    expect(html).not.toContain("onclick");
  });

  it("highlights registered languages and escapes unknown ones", () => {
    expect(renderDocMarkdown("```ts\nconst x: number = 1;\n```")).toContain("hljs");
    expect(renderDocMarkdown("```brainfuck\n<+>\n```")).toContain("&lt;+&gt;");
  });
});
