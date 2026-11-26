import fs from "fs";
import path from "path";
import { test, expect, type Page } from "@playwright/test";

// start-test-server.sh points the backend at this folder, so the app reads the status file we seed here.
const STATUS = path.resolve(__dirname, "..", ".test-data", "backup-status.json");
const GB = 1_000_000_000;

async function openArchiveHealth(page: Page) {
  await page.goto("/");
  await page.getByText("Archive health", { exact: true }).click();
  await page.getByRole("button", { name: "Check archive now" }).click();
  await expect(page.getByTestId("storage-usage")).toBeVisible();
}

test.skip(() => !fs.existsSync(path.dirname(STATUS)), "Needs the local test server's data folder");
test.afterEach(() => { fs.rmSync(STATUS, { force: true }); });

test("Archive health shows storage as unknown until a backup records it", async ({ page }) => {
  fs.writeFileSync(STATUS, JSON.stringify({ status: "success", last_attempt: "2026-11-01T03:00:00+00:00", last_success: "2026-11-01T03:00:00+00:00" }));
  await openArchiveHealth(page);
  await expect(page.getByTestId("storage-backups")).toHaveText("Backups: unknown");
  await expect(page.getByTestId("storage-disk")).toHaveText("Server disk: unknown");
  await expect(page.getByTestId("storage-videos")).toHaveText("Exported videos: unknown");
  await expect(page.getByText("No numbers have been recorded yet.")).toBeVisible();
});

test("Archive health shows backup and disk usage without a warning under the limits", async ({ page }) => {
  fs.writeFileSync(STATUS, JSON.stringify({
    status: "success", last_success: "2026-11-26T03:00:00+00:00", last_attempt: "2026-11-26T03:00:00+00:00",
    repo_bytes: Math.round(4.24 * GB), backup_set_bytes: Math.round(4.25 * GB), disk_used_pct: 19.2, disk_free_bytes: 78 * GB,
    videos_bytes: Math.round(0.77 * GB), measured_at: "2026-11-26T03:10:00+00:00",
  }));
  await openArchiveHealth(page);
  await expect(page.getByTestId("storage-backups")).toHaveText("Backups: 4.2 of 10 GB free tier");
  await expect(page.getByTestId("storage-disk")).toHaveText("Server disk: 19% used · 78.0 GB free");
  await expect(page.getByTestId("storage-videos")).toHaveText("Exported videos: 770 MB · deleted after 7 days");
  await expect(page.getByText(/Storage measured by the backup on/)).toBeVisible();
  const warn = await page.getByTestId("storage-usage").locator("li").evaluateAll(
    items => items.map(item => getComputedStyle(item).backgroundColor));
  expect(new Set(warn).size).toBe(1); // none is tinted
});

test("Archive health warns at the alert thresholds", async ({ page }) => {
  fs.writeFileSync(STATUS, JSON.stringify({
    status: "success", last_success: "2026-11-26T03:00:00+00:00", last_attempt: "2026-11-26T03:00:00+00:00",
    repo_bytes: Math.round(8.3 * GB), disk_used_pct: 80, disk_free_bytes: 19 * GB, videos_bytes: 0, measured_at: "2026-11-26T03:10:00+00:00",
  }));
  await openArchiveHealth(page);
  await expect(page.getByTestId("storage-backups")).toHaveText("Backups: 8.3 of 10 GB free tier · close to the free tier limit");
  await expect(page.getByTestId("storage-disk")).toHaveText("Server disk: 80% used · 19.0 GB free · running low");
  await expect(page.getByTestId("storage-videos")).toHaveText("Exported videos: 0 MB · deleted after 7 days");
  const tint = (id: string) => page.getByTestId(id).evaluate(el => getComputedStyle(el).backgroundColor);
  expect(await tint("storage-backups")).not.toBe(await tint("storage-videos"));
  expect(await tint("storage-disk")).not.toBe(await tint("storage-videos"));
});
