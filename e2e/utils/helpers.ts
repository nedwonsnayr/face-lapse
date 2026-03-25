/// <reference types="node" />
import { expect, type Page } from "@playwright/test";
import path from "path";
import fs from "fs";

const FIXTURES = path.resolve(__dirname, "..", "fixtures");

export const NO_FACE = [
  path.join(FIXTURES, "1.jpg"),
  path.join(FIXTURES, "2.jpg"),
  path.join(FIXTURES, "3.jpg"),
];

export const WITH_FACE = [
  path.join(FIXTURES, "face_1.jpg"),
  path.join(FIXTURES, "face_2.jpg"),
  path.join(FIXTURES, "face_3.jpg"),
];

export async function uploadAndStage(page: Page, files: string[]) {
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(files);
  await expect(page.getByTestId("staging-grid")).toBeVisible({
    timeout: 20_000,
  });
}

export async function alignStagedImages(page: Page) {
  await page.getByTestId("align-images-button").click();
  await expect(page.getByTestId("alignment-results")).toBeVisible({
    timeout: 60_000,
  });
}

export async function deleteAllImages(page: Page) {
  const res = await page.request.get("/api/images");
  if (!res.ok()) return;
  const images: { id: number }[] = await res.json();
  for (const img of images) {
    await page.request.delete(`/api/images/${img.id}`);
  }
}

export async function uploadFileViaAPI(
  page: Page,
  filePath: string
): Promise<any[]> {
  const fileBuffer = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);

  const result = await page.evaluate(
    async ({ buffer, name, baseUrl }) => {
      const form = new FormData();
      const blob = new Blob([new Uint8Array(buffer)], { type: "image/jpeg" });
      form.append("files", blob, name);

      const res = await fetch(`${baseUrl}/api/images/upload`, {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        throw new Error(`Upload failed: ${res.statusText}`);
      }

      return res.json();
    },
    {
      buffer: Array.from(fileBuffer) as number[],
      name: fileName,
      baseUrl: "http://localhost:5111",
    }
  );

  return result;
}
