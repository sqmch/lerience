/* The stage's serving side (ADR-012). Course visuals are self-contained HTML;
   this scheme serves them with the engine study's exact network-blocking CSP,
   and the renderer mounts them in null-origin iframes (sandbox="allow-scripts",
   never allow-same-origin). The CSP makes "visuals must be self-contained"
   mechanical: no external scripts, styles, fonts, fetches, or images. */

import fs from "node:fs";
import { protocol } from "electron";
import { VISUAL_SCHEME } from "../shared/ipc";
import { guardVisualFile } from "./guards";

/** Must run before app ready. */
export function registerVisualScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: VISUAL_SCHEME,
      privileges: { standard: true, secure: true },
    },
  ]);
}

const VISUAL_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
  "img-src data: blob:; media-src data: blob:; font-src data:";

/** Must run after app ready. `courseRoot` resolves per request so the handler
 *  survives course switches. */
export function handleVisualScheme(courseRoot: () => string | null): void {
  protocol.handle(VISUAL_SCHEME, (request) => {
    const root = courseRoot();
    if (root === null) return new Response("no course open", { status: 404 });

    // praxeum-visual://<module-id>/<file>.html — the module id is the host.
    const url = new URL(request.url);
    const moduleId = url.hostname;
    const file = decodeURIComponent(url.pathname.replace(/^\//, ""));

    const { abs, ok } = guardVisualFile(root, moduleId, file);
    if (!ok) return new Response("forbidden", { status: 403 });
    if (!fs.existsSync(abs)) return new Response("not found", { status: 404 });

    return new Response(fs.readFileSync(abs, "utf8"), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": VISUAL_CSP,
      },
    });
  });
}
