import { defineConfig } from "vite";

const debug = process.env.QH_DEBUG === "1";

export default defineConfig({
  // Relative asset paths so the same build works at a domain root, under /<repo>/ on GitHub Pages,
  // or in any subfolder (DESIGN §16.2).
  base: process.env.QH_BASE ?? "./",
  define: {
    __QH_DEBUG__: JSON.stringify(debug),
    __QH_BUILD_ID__: JSON.stringify(process.env.QH_BUILD_ID ?? "dev"),
  },
  build: { chunkSizeWarningLimit: 2500 },
});
