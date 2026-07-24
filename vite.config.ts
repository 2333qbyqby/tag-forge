import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  publicDir: ".tmp/public",
  build: {
    target: "es2022",
    sourcemap: true,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "lucide-react", "motion"],
          graph: ["d3-force"],
        },
      },
    },
  },
});
