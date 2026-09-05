import DOMPurify from "dompurify";

let nextId = 0;
let pending: Promise<unknown> = Promise.resolve();

/** Serialize configuration and rendering: Mermaid has process-wide mutable config. */
export function renderDiagram(source: string, dark: boolean): Promise<string> {
  const render = async (): Promise<string> => {
    const { default: mermaid } = await import("mermaid");
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      suppressErrorRendering: true,
      htmlLabels: false,
      theme: dark ? "dark" : "neutral",
      fontFamily:
        getComputedStyle(document.documentElement).getPropertyValue("--sans").trim() ||
        "sans-serif",
      maxTextSize: 25000,
      maxEdges: 500,
      secure: [
        "secure",
        "securityLevel",
        "startOnLoad",
        "suppressErrorRendering",
        "htmlLabels",
        "theme",
        "fontFamily",
        "maxTextSize",
        "maxEdges",
      ],
    });
    const { svg } = await mermaid.render(`lesson-diagram-${++nextId}`, source);
    return diagramImage(svg);
  };
  const result = pending.then(render, render);
  pending = result.catch(() => undefined);
  return result;
}

/** Image mode also isolates diagram styles, links and script from the app document. */
export function diagramImage(svg: string): string {
  const clean = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ["foreignObject", "image", "a"],
  });
  const document = new DOMParser().parseFromString(clean, "image/svg+xml");
  const root = document.documentElement;
  if (root.localName !== "svg") throw new Error("No diagram was rendered.");
  const box = root.getAttribute("viewBox")?.split(/\s+/).map(Number);
  if (box?.length === 4 && box.every(Number.isFinite)) {
    root.setAttribute("width", String(box[2]));
    root.setAttribute("height", String(box[3]));
    root.removeAttribute("style");
  }
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(root))}`;
}

/** Mount once per document, retain sources, and cancel stale async renders on replacement. */
export function mountDiagrams(root: HTMLElement): () => void {
  let disposed = false;
  const records = Array.from(root.querySelectorAll<HTMLElement>("pre > code.language-mermaid")).map(
    (code) => {
      const pre = code.parentElement!;
      const figure = document.createElement("figure");
      figure.className = "doc-mermaid";
      const caption = document.createElement("figcaption");
      caption.textContent = "Rendering diagram…";
      const viewport = document.createElement("div");
      viewport.className = "doc-mermaid-viewport";
      viewport.tabIndex = 0;
      viewport.setAttribute("role", "region");
      viewport.setAttribute("aria-label", "Lesson diagram");
      const size = document.createElement("button");
      size.type = "button";
      size.textContent = "Actual size";
      size.hidden = true;
      size.setAttribute("aria-pressed", "false");
      size.onclick = () => {
        const actual = figure.dataset["actualSize"] !== "true";
        figure.dataset["actualSize"] = String(actual);
        size.textContent = actual ? "Fit to width" : "Actual size";
        size.setAttribute("aria-pressed", String(actual));
      };
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "Diagram source";
      pre.replaceWith(figure);
      details.append(summary, pre);
      figure.append(caption, viewport, size, details);
      return { source: code.textContent ?? "", caption, viewport, size, details, figure, pre };
    },
  );
  if (records.length === 0) return () => undefined;
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  let revision = 0;
  const refresh = (): void => {
    const current = ++revision;
    const theme = document.documentElement.dataset["theme"];
    const dark = theme === "dark" || (theme !== "light" && media.matches);
    for (const record of records) {
      void renderDiagram(record.source, dark).then(
        (src) => {
          if (disposed || current !== revision) return;
          const img = document.createElement("img");
          img.src = src;
          img.alt = "Lesson diagram. Its text is available under Diagram source.";
          record.viewport.replaceChildren(img);
          record.caption.textContent = "Diagram";
          record.size.hidden = false;
        },
        () => {
          if (disposed || current !== revision) return;
          record.caption.textContent = "Diagram could not be rendered. Source shown below.";
          record.details.open = true;
        },
      );
    }
  };
  const observer = new MutationObserver(refresh);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  media.addEventListener("change", refresh);
  refresh();
  return () => {
    disposed = true;
    observer.disconnect();
    media.removeEventListener("change", refresh);
    for (const record of records) record.figure.replaceWith(record.pre);
  };
}
