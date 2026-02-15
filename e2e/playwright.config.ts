import { defineConfig } from "@playwright/test";
import path from "path";

const PROJECT_ROOT = path.resolve(__dirname, "..");

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  timeout: 120_000, // 2 minutes for video generation in CI
  retries: 0,
  reporter: [["html", { outputFolder: "playwright-report" }]],
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
    timeout: 30_000,
    cwd: PROJECT_ROOT,
  },
});
