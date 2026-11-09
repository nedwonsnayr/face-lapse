import { test, expect } from "@playwright/test";
import path from "path";
import { deleteAllImages, uploadAndStage, alignStagedImages, WITH_FACE } from "../utils/helpers";

const TWO_FACES = path.resolve(__dirname, "../fixtures/two_faces.jpg");

test.describe("Choose a face for one timelapse", () => {
  test.beforeEach(async ({ page }) => { await page.goto("/"); await deleteAllImages(page); await page.reload(); });
  test.afterEach(async ({ page }) => { await deleteAllImages(page); });

  test("multiple faces wait through reload, save a choice, and allow changing it", async ({ page }) => {
    await uploadAndStage(page, [TWO_FACES]);
    await alignStagedImages(page);
    await expect(page.getByTestId("face-review-queue")).toBeVisible();
    await expect(page.getByTestId("empty-timelapse-message")).toBeVisible();
    const image = (await (await page.request.get("/api/images")).json())[0];
    expect(image.needs_face_selection).toBe(true);
    const exported = await page.request.post("/api/video/generate");
    expect(exported.status()).toBe(400);
    await page.reload();
    await page.getByTestId(`choose-face-${image.id}`).click();
    await expect(page.getByTestId("face-option-0")).toBeVisible();
    await expect(page.getByTestId("face-option-1")).toBeVisible();
    await expect(page.getByTestId("confirm-face-selection")).toBeDisabled();
    await page.screenshot({ path: "test-results/face-picker-desktop.png" });
    await page.getByTestId("face-option-1").click();
    await page.getByTestId("confirm-face-selection").click();
    await expect(page.getByTestId("face-picker")).not.toBeVisible();
    await expect(page.getByTestId("face-review-queue")).not.toBeVisible();
    await expect(page.getByTestId("timelapse-frame")).toBeVisible();
    const selected = (await (await page.request.get("/api/images")).json())[0];
    expect(selected.selected_face_index).toBe(1);
    await page.reload();
    const card = page.getByTestId(`previous-image-card-${image.id}`);
    await card.hover();
    await card.getByTestId(`change-face-button-${image.id}`).click();
    await expect(page.getByTestId("face-option-1")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("face-option-0").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("face-option-0")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("confirm-face-selection").click();
    await expect(page.getByTestId("face-picker")).not.toBeVisible();
    const changed = (await (await page.request.get("/api/images")).json())[0];
    expect(changed.selected_face_index).toBe(0);
    expect(changed.content_hash).not.toBe(selected.content_hash);
    const realign = await page.request.post(`/api/images/${image.id}/realign`);
    expect(realign.ok()).toBeTruthy();
    expect((await (await page.request.get("/api/images")).json())[0].selected_face_index).toBe(0);
  });

  test("distant faces reach the picker and align without cropping the original", async ({ page }) => {
    await uploadAndStage(page, [path.resolve(__dirname, "../fixtures/distant_faces.jpg")]);
    await alignStagedImages(page);
    const image = (await (await page.request.get("/api/images")).json())[0];
    await page.getByTestId(`choose-face-${image.id}`).click();
    await expect(page.getByTestId("face-option-0")).toBeVisible();
    await expect(page.getByTestId("face-option-1")).toBeVisible();
    await expect(page.getByTestId("face-option-2")).toHaveCount(0);
    await page.getByTestId("face-option-1").click();
    await page.getByTestId("confirm-face-selection").click();
    await expect(page.getByTestId("timelapse-frame")).toBeVisible();
    expect((await (await page.request.get("/api/images")).json())[0].selected_face_index).toBe(1);
  });

  test("cancelling leaves a queued photo available and keeps an existing alignment", async ({ page }) => {
    await uploadAndStage(page, [TWO_FACES, WITH_FACE[0]]);
    await alignStagedImages(page);
    const images = await (await page.request.get("/api/images")).json();
    const queued = images.find((img: any) => img.needs_face_selection);
    const aligned = images.find((img: any) => img.has_aligned);
    await page.getByTestId(`choose-face-${queued.id}`).click();
    await expect(page.getByTestId("face-option-0")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId(`choose-face-${queued.id}`)).toBeVisible();
    const card = page.getByTestId(`previous-image-card-${aligned.id}`);
    await card.hover();
    await card.getByTestId(`change-face-button-${aligned.id}`).click();
    await expect(page.getByTestId("face-option-0")).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    expect((await (await page.request.get("/api/images")).json()).find((img: any) => img.id === aligned.id).content_hash).toBe(aligned.content_hash);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByTestId(`remove-face-review-${queued.id}`).click();
    await expect(page.getByTestId("face-review-queue")).not.toBeVisible();
    expect(await (await page.request.get("/api/images")).json()).toHaveLength(1);
  });

  test("face picker fits a phone and reports save errors without losing the choice", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await uploadAndStage(page, [TWO_FACES]);
    await alignStagedImages(page);
    const image = (await (await page.request.get("/api/images")).json())[0];
    await page.getByTestId(`choose-face-${image.id}`).click();
    await page.getByTestId("face-option-0").click();
    await page.route("**/select-face?*", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "Please retry alignment" }) }));
    await page.getByTestId("confirm-face-selection").click();
    await expect(page.getByRole("alert")).toHaveText("Please retry alignment");
    await expect(page.getByTestId("face-option-0")).toHaveAttribute("aria-pressed", "true");
    const bounds = await page.getByTestId("face-picker").boundingBox();
    expect(bounds!.width).toBeLessThan(390);
    await page.screenshot({ path: "test-results/face-picker-phone.png" });
    await page.unroute("**/select-face?*");
    await page.getByTestId("confirm-face-selection").click();
    await expect(page.getByTestId("timelapse-frame")).toBeVisible();
  });
});
