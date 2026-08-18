/* Developer-only browser entrypoint for production renderer components with a
   synthetic preload bridge. It is validated from package scripts and excluded
   from the Electron package boundary. */

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react(), tailwindcss()],
  server: { port: 5199, strictPort: true },
  build: {
    outDir: "../../dist/renderer-harness",
    emptyOutDir: true,
    // The harness intentionally mounts several full application surfaces in a
    // single developer-only entrypoint. It is not a learner download budget.
    chunkSizeWarningLimit: 700,
  },
});
