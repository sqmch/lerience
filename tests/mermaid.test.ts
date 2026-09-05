// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { diagramImage, mountDiagrams } from "../src/renderer/src/mermaid";

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async (_id: string, source: string) => {
      if (source === "broken") throw new Error("Syntax error");
      return {
        svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text>Diagram</text></svg>',
      };
    }),
  },
}));

it("survives effect teardown/remount and exposes source for an invalid diagram", async () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  const root = document.createElement("div");
  root.innerHTML =
    '<pre><code class="language-mermaid">graph LR; A--&gt;B</code></pre><pre><code class="language-mermaid">broken</code></pre>';
  document.body.append(root);
  const first = mountDiagrams(root);
  first();
  const dispose = mountDiagrams(root);
  await vi.waitFor(() => expect(root.querySelectorAll(".doc-mermaid img")).toHaveLength(1));
  await vi.waitFor(() => expect(root.querySelectorAll("details[open]")).toHaveLength(1));
  expect(root.querySelectorAll("figure")).toHaveLength(2);
  expect(root.textContent).toContain("Diagram could not be rendered");
  dispose();
  expect(root.querySelectorAll("figure")).toHaveLength(0);
  root.remove();
  vi.unstubAllGlobals();
});

it("isolates SVG as an image, strips active content and preserves intrinsic dimensions", () => {
  const src = diagramImage(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" style="max-width:800px"><script>alert(1)</script><foreignObject><div>HTML</div></foreignObject><image href="https://example.invalid/image"/><rect onclick="alert(1)"/><text>Input</text></svg>',
  );
  const svg = decodeURIComponent(src.split(",")[1]!);
  expect(src).toMatch(/^data:image\/svg\+xml/);
  expect(svg).toContain('width="800"');
  expect(svg).toContain('height="600"');
  expect(svg).toContain("Input");
  expect(svg).not.toMatch(/script|foreignObject|onclick|https:|<image/);
});
