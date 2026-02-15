import { test, expect } from "@playwright/test";
import path from "path";

const FIXTURES = path.resolve(__dirname, "fixtures");
const NO_FACE = [
  path.join(FIXTURES, "1.jpg"),
  path.join(FIXTURES, "2.jpg"),
  path.join(FIXTURES, "3.jpg"),
];
const WITH_FACE = [
  path.join(FIXTURES, "face_1.jpg"),
  path.join(FIXTURES, "face_2.jpg"),
  path.join(FIXTURES, "face_3.jpg"),
];

/* ── Helpers ──────────────────────────────────────────── */

/** Upload files via the hidden input, wait for staging area. */
async function uploadAndStage(
  page: import("@playwright/test").Page,
  files: string[]
) {
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(files);
  await expect(page.getByText("ready to align")).toBeVisible({
    timeout: 20_000,
  });
}

/** Click "Align Images" and wait for alignment to finish (back to idle). */
async function alignStagedImages(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Align Images" }).click();
  // Wait for alignment to complete — the Upload returns to idle and shows
  // a result summary. Both messages can appear, so wait for the results container.
  await expect(
    page.locator("text=/aligned successfully|face not detected/").first()
  ).toBeVisible({ timeout: 60_000 });
}

/** Delete every image via the API so the next test starts clean. */
async function deleteAllImages(page: import("@playwright/test").Page) {
  const res = await page.request.get("/api/images");
  if (!res.ok()) return;
  const images: { id: number }[] = await res.json();
  for (const img of images) {
    await page.request.delete(`/api/images/${img.id}`);
  }
}

/* ── Tests ────────────────────────────────────────────── */

test.describe("Face Lapse – empty state", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await deleteAllImages(page);
    await page.reload();
  });

  test("shows empty library and timelapse prompts", async ({ page }) => {
    await expect(page.getByText("No images yet")).toBeVisible();
    await expect(page.getByText("No aligned images yet")).toBeVisible();
  });
});

test.describe("Face Lapse – upload & staging", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await deleteAllImages(page);
    await page.reload();
  });

  test.afterEach(async ({ page }) => {
    await deleteAllImages(page);
  });

  test("upload files shows staging area with correct count", async ({
    page,
  }) => {
    await uploadAndStage(page, NO_FACE);
    await expect(page.getByText("3 images ready to align")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Cancel" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Align Images" })
    ).toBeVisible();
  });

  test("cancel staged uploads returns to idle", async ({ page }) => {
    await uploadAndStage(page, [NO_FACE[0]]);
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(
      page.getByText("Drop images here or click to browse")
    ).toBeVisible();
  });
});

test.describe("Face Lapse – no face detected", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await deleteAllImages(page);
    await page.reload();
  });

  test.afterEach(async ({ page }) => {
    await deleteAllImages(page);
  });

  test("aligning faceless images shows no-face result and library group", async ({
    page,
  }) => {
    // Upload & align the plain-colored test images (no face)
    await uploadAndStage(page, NO_FACE);
    await alignStagedImages(page);

    // Result summary should report all 3 as "face not detected"
    await expect(page.getByText("3 face not detected")).toBeVisible();

    // Wait for the library to update (handleAlignComplete triggers fetchImages)
    // The "No Face Detected" group should appear in the library
    await expect(page.getByText("No Face Detected")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("(3)")).toBeVisible();

    // "Dismiss All" button should be available
    await expect(
      page.getByRole("button", { name: "Dismiss All" })
    ).toBeVisible();

    // Timelapse should still show empty message (no aligned images)
    await expect(page.getByText("No aligned images yet")).toBeVisible();
  });

  test("dismiss all removes no-face images", async ({ page }) => {
    await uploadAndStage(page, NO_FACE);
    await alignStagedImages(page);

    // Accept the confirm dialog
    page.on("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Dismiss All" }).click();

    // "No Face Detected" group should disappear
    await expect(page.getByText("No Face Detected")).not.toBeVisible({
      timeout: 10_000,
    });
  });
});

test.describe("Face Lapse – face detected (real images)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await deleteAllImages(page);
    await page.reload();
  });

  test.afterEach(async ({ page }) => {
    await deleteAllImages(page);
  });

  test("aligning real face images succeeds and populates timelapse", async ({
    page,
  }) => {
    await uploadAndStage(page, WITH_FACE);
    await alignStagedImages(page);

    // Should report successful alignment
    await expect(page.getByText(/\d+ aligned successfully/)).toBeVisible();

    // Wait for library to update (handleAlignComplete triggers fetchImages)
    // Images will appear in "Just Uploaded" (since handleAlignComplete sets recentUploadIds)
    // or "Previously Processed" group
    await expect(
      page.getByText(/Just Uploaded|Previously Processed/)
    ).toBeVisible({ timeout: 10_000 });

    // Timelapse should now have a play/pause button and scrubber
    await expect(page.getByRole("button", { name: /⏸|▶/ })).toBeVisible();
    await expect(page.getByText(/\d+ \/ \d+/)).toBeVisible(); // frame counter

    // Download Video button should be present
    await expect(
      page.getByRole("button", { name: "Download Video" })
    ).toBeVisible();
  });

  test("toggle image exclusion removes it from timelapse count", async ({
    page,
  }) => {
    // Upload and align 2 face images
    await uploadAndStage(page, [WITH_FACE[0], WITH_FACE[1]]);
    await alignStagedImages(page);

    // Wait for library to update, then get the initial frame count text (e.g. "1 / 2")
    const scrubLabel = page.getByText(/\d+ \/ \d+/);
    await expect(scrubLabel).toBeVisible({ timeout: 10_000 });
    const initialText = await scrubLabel.textContent();
    const initialTotal = parseInt(initialText!.split("/")[1].trim(), 10);

    // Click the first "In" button to exclude an image
    const inButtons = page.getByRole("button", { name: "In" });
    await inButtons.first().click();
    await page.waitForTimeout(500);

    // Frame counter should now show one fewer
    await expect(scrubLabel).toContainText(`${initialTotal - 1}`);
  });

  test("download video generates and downloads MP4 file", async ({ page }) => {
    // Upload and align face images
    await uploadAndStage(page, [WITH_FACE[0], WITH_FACE[1]]);
    await alignStagedImages(page);

    // Wait for timelapse to be ready
    await expect(page.getByRole("button", { name: "Download Video" })).toBeVisible({
      timeout: 10_000,
    });

    // Set up download listener
    const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });

    // Click Download Video button
    await page.getByRole("button", { name: "Download Video" }).click();

    // Wait for download to complete
    const download = await downloadPromise;

    // Verify filename matches expected pattern (face-lapse-MM-DD-YYYY.mp4)
    const filename = download.suggestedFilename();
    expect(filename).toMatch(/^face-lapse-\d{2}-\d{2}-\d{4}\.mp4$/);
  });
});

test.describe("Face Lapse – mixed upload (face + no face)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await deleteAllImages(page);
    await page.reload();
  });

  test.afterEach(async ({ page }) => {
    await deleteAllImages(page);
  });

  test("mixed batch shows both aligned and no-face groups", async ({
    page,
  }) => {
    // Upload 1 faceless + 1 face image together
    await uploadAndStage(page, [NO_FACE[0], WITH_FACE[0]]);
    await alignStagedImages(page);

    // Should show both results
    await expect(page.getByText(/\d+ aligned successfully/)).toBeVisible();
    await expect(page.getByText(/\d+ face not detected/)).toBeVisible();

    // Wait for library to update (handleAlignComplete triggers fetchImages)
    // Library should have the "No Face Detected" group
    await expect(page.getByText("No Face Detected")).toBeVisible({
      timeout: 10_000,
    });

    // Timelapse should work with the 1 aligned image
    await expect(page.getByRole("button", { name: /⏸|▶/ })).toBeVisible();
  });
});
