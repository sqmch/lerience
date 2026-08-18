import { useEffect, useMemo, useRef } from "react";
import { visualSrc } from "../../../shared/visuals";
import { renderCourseMarkdown, renderDocMarkdown } from "../markdown";

/** Sanitized course markdown (journal, notes). */
export function CourseMarkdown({
  markdown,
  className = "prose",
}: {
  markdown: string;
  className?: string;
}): React.JSX.Element {
  const html = useMemo(() => renderCourseMarkdown(markdown), [markdown]);
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

/**
 * Sanitized module document (lesson/brief) with `visual` fences mounted as
 * sandboxed iframes. The iframes are built with DOM APIs AFTER sanitizing —
 * the study's discipline, kept: the sanitizer never allows author-written
 * frames, and the sandbox (`allow-scripts`, never `allow-same-origin`) plus
 * the serving scheme's network-blocking CSP are what make the stage safe
 * (ADR-012).
 */
export function DocMarkdown({
  markdown,
  moduleId,
  className = "prose",
}: {
  markdown: string;
  moduleId: string;
  className?: string;
}): React.JSX.Element {
  const html = useMemo(() => renderDocMarkdown(markdown), [markdown]);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (root === null) return;
    for (const placeholder of root.querySelectorAll<HTMLElement>(".doc-visual-embed")) {
      if (placeholder.dataset["visualMounted"] === "true") continue;
      const file = placeholder.dataset["visualFile"] ?? "";
      if (file === "") continue;
      const iframe = document.createElement("iframe");
      iframe.className = "doc-visual-frame";
      iframe.src = visualSrc(moduleId, file);
      iframe.title = placeholder.dataset["visualLabel"] ?? "interactive visual";
      iframe.setAttribute("sandbox", "allow-scripts");
      iframe.setAttribute("loading", "lazy");
      iframe.style.height = `${placeholder.dataset["visualHeight"] ?? "420"}px`;
      placeholder.replaceChildren(iframe);
      placeholder.dataset["visualMounted"] = "true";
    }
  }, [html, moduleId]);

  return <div ref={rootRef} className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
