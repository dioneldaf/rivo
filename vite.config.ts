import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `base` is the subpath the app is served from. GitHub Pages serves a project
// repo at https://<user>.github.io/rivo/, so production assets need the /rivo/
// prefix; local dev stays at the root for a friction-free dev server + OAuth.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/rivo/" : "/",
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Split heavy libraries into separate, cacheable vendor chunks.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("/motion/") || id.includes("framer-motion")) return "motion";
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("react-router")) return "router";
          if (id.includes("/react") || id.includes("/react-dom") || id.includes("/scheduler")) return "react";
          return "vendor";
        },
      },
    },
  },
}));
