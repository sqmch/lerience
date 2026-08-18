import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import type { Plugin } from "vite";
import { readReleaseBuildInputs } from "./build/release-build-inputs";

/* The renderer never loads remote content (SPEC §4). The CSP is injected here
   rather than hard-coded in index.html because dev needs two allowances the
   packaged app must not have: Vite's react-refresh preamble is an inline
   script, and HMR speaks over a websocket. */
function csp(): Plugin {
  let dev = false;
  return {
    name: "praxeum-csp",
    configResolved(config) {
      dev = config.command === "serve";
    },
    transformIndexHtml() {
      const policy = [
        "default-src 'self'",
        `script-src 'self'${dev ? " 'unsafe-inline'" : ""}`,
        "style-src 'self' 'unsafe-inline'",
        "font-src 'self'",
        "img-src 'self' data:",
        `connect-src 'self'${dev ? " ws:" : ""}`,
        // The lab stage: course visuals frame in on the dedicated scheme only.
        "frame-src praxeum-visual:",
        "object-src 'none'",
      ].join("; ");
      return [
        {
          tag: "meta",
          attrs: { "http-equiv": "Content-Security-Policy", content: policy },
          injectTo: "head-prepend" as const,
        },
      ];
    },
  };
}

export default defineConfig({
  main: {
    define: {
      __PRAXEUM_RELEASE_CONFIG__: JSON.stringify(readReleaseBuildInputs()),
    },
  },
  preload: {
    build: {
      rollupOptions: {
        /* Sandboxed preload scripts cannot be ESM; with "type": "module" in
           package.json the output must be explicitly .cjs. */
        output: { format: "cjs", entryFileNames: "[name].cjs" },
      },
    },
  },
  renderer: {
    plugins: [react(), tailwindcss(), csp()],
    build: {
      /* Fonts must stay real files. Vite inlines assets under 4 kB as data:
         URIs, which silently collides with the production CSP's `font-src
         'self'` — the small font subsets get blocked and never render. Keeping
         the strict CSP and emitting the file is the right way round. */
      assetsInlineLimit: (filePath: string): boolean | undefined =>
        /\.(?:woff2?|ttf|otf|eot)$/i.test(filePath) ? false : undefined,
    },
  },
});
