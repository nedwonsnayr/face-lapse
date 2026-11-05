import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Runs the same suite against the production Docker image (SPA served by FastAPI).
// Build first: docker build -t face-lapse:test .
export default defineConfig({
  ...base,
  webServer: {
    command:
      "docker rm -f fl-e2e >/dev/null 2>&1; docker run --rm --name fl-e2e -p 127.0.0.1:5111:8000 --tmpfs /data:uid=1000 face-lapse:test",
    url: "http://127.0.0.1:5111/api/health",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
