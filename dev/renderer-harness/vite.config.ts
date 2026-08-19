/* Developer-only browser entrypoint for production renderer components with a
   synthetic preload bridge. It is validated from package scripts and excluded
   from the Electron package boundary.

   Two pages: `index.html` is the harness, `showcase.html` is the scripted
   course view the public landing site embeds. The relative base lets the built
   showcase be served from a subfolder of another site. */

import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: import.meta.dirname,
  base: "./",
  plugins: [react(), tailwindcss()],
  server: { port: 5199, strictPort: true },
  build: {
    outDir: "../../dist/renderer-harness",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        harness: path.join(import.meta.dirname, "index.html"),
        showcase: path.join(import.meta.dirname, "showcase.html"),
      },
    },
    // The harness intentionally mounts several full application surfaces in a
    // single developer-only entrypoint. It is not a learner download budget.
    chunkSizeWarningLimit: 700,
  },
});
