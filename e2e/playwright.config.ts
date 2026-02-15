import { defineConfig } from "@playwright/test";
import path from "path";

const PROJECT_ROOT = path.resolve(__dirname, "..");

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  timeout: 60_000,
  retries: 0,
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
