import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiPort = process.env.VITE_API_PORT || "8000";

// Get repository name from environment or default
// For GitHub Pages, this should be the repository name (e.g., "face-lapse")
const repoName = process.env.VITE_GITHUB_REPO_NAME || "";
const base = repoName ? `/${repoName}/` : "/";

export default defineConfig({
  plugins: [react()],
  base: base,
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
  },
});
