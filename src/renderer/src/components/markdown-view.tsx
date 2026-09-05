import { useEffect, useMemo, useRef, useState } from "react";
import { visualSrc } from "../../../shared/visuals";
import { renderCourseMarkdown, renderDocMarkdown } from "../markdown";
import { mountDiagrams } from "../mermaid";

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
  // React compares this object by identity. Recreating it on a parent render
  // resets innerHTML, removing frames mounted by the effect without rerunning it.
  const markup = useMemo(() => ({ __html: html }), [html]);
  const rootRef = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState<{ moduleId: string; html: string; text: string } | null>(
    null,
  );

  const openLink = (event: React.MouseEvent<HTMLDivElement>): void => {
    const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
    const href = anchor?.getAttribute("href");
    if (href === undefined || href === null || href.startsWith("#")) return;
    event.preventDefault();
    setNotice(null);
    void window.praxeum.openInEditor({ kind: "document-link", moduleId, href }).then(
      (reply) => {
        if (!reply.ok) setNotice({ moduleId, html, text: reply.detail });
      },
      () => setNotice({ moduleId, html, text: "This link could not be opened. Try again." }),
    );
  };

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
    return mountDiagrams(root);
  }, [html, moduleId]);

  return (
    <>
      {notice?.moduleId === moduleId && notice.html === html && (
        <div
          role="status"
          className="mb-4 flex items-start gap-3 rounded-md border border-line p-3 text-sm text-ink-dim"
        >
          <span>{notice.text}</span>
          <button type="button" className="ml-auto underline" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </div>
      )}
      <div
        key={moduleId}
        ref={rootRef}
        className={className}
        onClick={openLink}
        dangerouslySetInnerHTML={markup}
      />
    </>
  );
}
