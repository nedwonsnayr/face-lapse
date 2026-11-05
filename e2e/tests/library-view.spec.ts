import fs from "fs";
import { test, expect } from "@playwright/test";
import { alignStagedImages, deleteAllImages, uploadAndStage, WITH_FACE } from "../utils/helpers";

test.describe("Face Lapse – library list/grid view", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.removeItem("face-lapse:library-view"));
    await deleteAllImages(page);
    await page.reload();
    await uploadAndStage(page, WITH_FACE);
    await alignStagedImages(page);
    await page.reload(); // drop "Just uploaded" so each photo shows once
  });

  test.afterEach(async ({ page }) => {
    await deleteAllImages(page);
  });

  test("switches to list view, stays usable, and remembers the choice", async ({ page }) => {
    const items = page.getByTestId("previously-processed-group").getByTestId("library-items");
    await expect(items).toHaveAttribute("data-view", "grid");
    await expect(page.getByTestId("library-view-grid")).toHaveAttribute("aria-pressed", "true");

    await page.getByTestId("library-view-list").click();
    await expect(items).toHaveAttribute("data-view", "list");
    await expect(page.getByTestId("library-view-list")).toHaveAttribute("aria-pressed", "true");

    // Rows show the phone's original filename, and controls work without hover.
    const [first] = await (await page.request.get("/api/images")).json();
    const row = page.getByTestId(`previous-image-card-${first.id}`);
    await expect(row).toContainText("face_1.jpg");
    await expect(page.getByTestId(`delete-button-${first.id}`)).toBeVisible();
    await page.getByTestId(`toggle-include-button-${first.id}`).click();
    await expect(page.getByTestId(`toggle-include-button-${first.id}`)).toHaveText("Out");

    // Remembered on this device after a reload.
    await page.reload();
    await expect(items).toHaveAttribute("data-view", "list");

    await page.getByTestId("library-view-grid").click();
    await expect(items).toHaveAttribute("data-view", "grid");
  });

  for (const [name, size] of [
    ["phone", { width: 390, height: 844 }],
    ["desktop", { width: 1280, height: 900 }],
  ] as const) {
    test(`list view screenshot (${name})`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.getByTestId("library-view-list").click();
      const group = page.getByTestId("previously-processed-group");
      await group.scrollIntoViewIfNeeded();
      await group.screenshot({ path: `test-results/list-view-${name}.png` });
    });
  }
});

test.describe("Face Lapse – library view switching at scale", () => {
  test.setTimeout(180_000);

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.removeItem("face-lapse:library-view"));
    await deleteAllImages(page);
  });

  test.afterEach(async ({ page }) => {
    await deleteAllImages(page);
  });

  test("renders every photo after a switch (in batches) and drag-reorder works in both views", async ({ page }) => {
    // More photos than the first render batch. Trailing bytes after the JPEG
    // end marker give each copy its own hash without changing the image.
    const COUNT = 45;
    const ids: number[] = [];
    for (let i = 0; i < COUNT; i++) {
      const buffer = Buffer.concat([fs.readFileSync(WITH_FACE[i % WITH_FACE.length]), Buffer.from(`copy-${i}`)]);
      const res = await page.request.post("/api/images/upload", {
        multipart: { files: { name: `copy_${String(i).padStart(2, "0")}.jpg`, mimeType: "image/jpeg", buffer } },
      });
      expect(res.ok()).toBeTruthy();
      ids.push(...(await res.json()).map((img: { id: number }) => img.id));
    }
    expect(ids).toHaveLength(COUNT);
    const aligned = await page.request.post("/api/images/align", { data: { image_ids: ids } });
    expect(aligned.ok()).toBeTruthy();
    await aligned.body();

    await page.reload();
    const group = page.getByTestId("previously-processed-group");
    const cards = group.locator('[data-testid^="previous-image-card-"]');
    await expect(cards).toHaveCount(COUNT);

    await page.getByTestId("library-view-list").click();
    await expect(group.getByTestId("library-items")).toHaveAttribute("data-view", "list");
    await expect(cards).toHaveCount(COUNT);
    await page.getByTestId("library-view-grid").click();
    await expect(cards).toHaveCount(COUNT);

    // "All photos" is displayed by filename number, so a drag shows up in the
    // saved order (which the timelapse plays in), not in the on-screen order.
    const idAt = async (i: number) => Number((await cards.nth(i).getAttribute("data-testid"))!.split("-").pop());
    const savedOrder = async (): Promise<number[]> =>
      (await (await page.request.get("/api/images")).json()).map((i: { id: number }) => i.id);
    const dragFirstOnto = async (target: number) => {
      const [first, onto] = [await idAt(0), await idAt(target)];
      const handle = cards.first().locator('[title="Drag to reorder"]');
      await handle.scrollIntoViewIfNeeded();
      const from = (await handle.boundingBox())!;
      const to = (await cards.nth(target).boundingBox())!;
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
      await page.mouse.up();
      await expect.poll(async () => {
        const order = await savedOrder();
        return order.indexOf(first) - order.indexOf(onto);
      }).toBe(1); // dropped just after the target
    };

    await dragFirstOnto(2); // grid
    await page.getByTestId("library-view-list").click();
    await expect(cards).toHaveCount(COUNT);
    await dragFirstOnto(3); // list
  });
});
