import { defineConfig } from "@playwright/test";
import path from "path";

const PROJECT_ROOT = path.resolve(__dirname, "..");

export default defineConfig({
  testDir: "tests",
  testMatch: "*.spec.ts",
  timeout: 120_000, // 2 minutes for video generation in CI
  retries: 0,
  // Tests share backend state and API cleanup, so keep one worker to avoid cross-file interference.
  workers: 1,
  reporter: [["list"],["html", { outputFolder: "playwright-report" }]],
  use: {
    baseURL: "http://localhost:5111",
    headless: true,
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  webServer: {
    command: `bash ${path.join(__dirname, "start-test-server.sh")}`,
    port: 5111,
    reuseExistingServer: false,
    // CI can wait up to 120s for backend + 60s for Vite before port 5111 is ready
    timeout: 200_000,
    cwd: PROJECT_ROOT,
  },
});
