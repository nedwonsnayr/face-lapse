import fs from "fs";
import { test, expect } from "@playwright/test";
import { deleteAllImages, WITH_FACE } from "../utils/helpers";

async function seed(page: import("@playwright/test").Page) {
  const ids: number[] = [];
  for (const [i, file] of WITH_FACE.entries()) {
    const upload = await page.request.post('/api/images/upload', { multipart: { files: {
      name: `202${i + 1}1102_120000.jpg`, mimeType: 'image/jpeg', buffer: fs.readFileSync(file),
    } } });
    expect(upload.ok()).toBeTruthy();
    ids.push((await upload.json())[0].id);
  }
  await page.request.post('/api/images/align', { data: { image_ids: ids } });
  await page.reload();
  await expect(page.getByTestId('timelapse-frame')).toBeVisible();
  return ids;
}

test.beforeEach(async ({ page }) => { await page.goto('/'); await deleteAllImages(page); await page.reload(); });
test.afterEach(async ({ page }) => { await deleteAllImages(page); });

test('date navigation, selection, trash undo and permanent deletion', async ({ page }) => {
  const ids = await seed(page);
  await page.getByLabel('Jump to year or month').selectOption('2022');
  const main = page.getByTestId('previously-processed-group');
  await expect(main.locator('[data-testid^="previous-image-card-"]')).toHaveCount(1);
  await expect(page.getByTestId('frame-counter')).toContainText('/ 3');
  await page.getByRole('button', { name: 'Select photos', exact: true }).click();
  await page.getByRole('button', { name: 'Select filtered photos' }).click();
  await page.getByRole('button', { name: 'Move to Trash', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('1 photos moved to Trash.');
  await expect(main.locator('[data-testid^="previous-image-card-"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo trash' }).click();
  await expect(main.locator('[data-testid^="previous-image-card-"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Done selecting' }).click();
  page.on('dialog', dialog => dialog.accept());
  await main.getByTestId(`delete-button-${ids[1]}`).click();
  await page.getByText('Trash', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Restore', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(page.getByText('Trash is empty.')).toBeVisible();
});

test('comparison, scoped archive health and export presets', async ({ page }) => {
  await seed(page);
  await page.getByText('Then & now', { exact: true }).click();
  await expect(page.getByTestId('photo-comparison').locator('img')).toHaveCount(2);
  await page.getByRole('button', { name: 'Show comparison slider' }).click();
  await page.getByLabel('Comparison position').fill('30');
  await expect(page.getByLabel('Comparison position')).toHaveValue('30');
  await page.getByText('Archive health', { exact: true }).click();
  await page.getByRole('button', { name: 'Check archive now' }).click();
  await expect(page.getByText(/Backup status unknown/)).toBeVisible();
  await page.getByText('Choose photos & export presets').click();
  await page.getByLabel('Export start date').fill('2022-01-01');
  await page.getByLabel('Export end date').fill('2022-12-31');
  await expect(page.getByTestId('frame-counter')).toHaveText('1 / 1');
  await page.getByLabel('Export sampling').selectOption('month');
  await page.getByLabel('Export preset name').fill('A year of selfies');
  await page.getByRole('button', { name: 'Save preset' }).click();
  await page.getByRole('button', { name: 'Use all photos' }).click();
  await expect(page.getByTestId('frame-counter')).toContainText('/ 3');
  await page.reload();
  await page.getByText('Choose photos & export presets').click();
  await page.getByRole('button', { name: 'A year of selfies', exact: true }).click();
  await expect(page.getByTestId('frame-counter')).toHaveText('1 / 1');
  await expect(page.getByLabel('Export sampling')).toHaveValue('month');
  const generation = page.waitForRequest(r => r.url().includes('/api/video/generate'));
  await page.getByTestId('download-video-button').click();
  const request = await generation;
  expect(request.url()).toContain('date_from=2022-01-01');
  expect(request.url()).toContain('sampling=month');
  await expect(page.getByTestId('download-video-button')).toHaveText('Download Video', { timeout: 30000 });
});

test('bulk copy and move keep the destination independent', async ({ page }) => {
  const ids = await seed(page);
  const person = await (await page.request.post('/api/profiles', { data: { name: 'Transfer test', birthday: null } })).json();
  await page.reload();
  await page.getByRole('button', { name: 'Select photos', exact: true }).click();
  await page.getByTestId('previously-processed-group').getByRole('checkbox').first().check();
  await page.getByLabel('Destination person').selectOption(String(person.id));
  await page.getByRole('button', { name: 'Copy to person' }).click();
  await expect(page.getByRole('status')).toContainText('1 photos transferred.');
  const copy = await (await page.request.get(`/api/images?profile_id=${person.id}`)).json();
  expect(copy).toHaveLength(1);
  expect(copy[0].id).not.toEqual(ids[0]);
  await page.getByTestId('previously-processed-group').getByRole('checkbox').nth(1).check();
  await page.getByRole('button', { name: 'Move to person' }).click();
  await expect.poll(async () => (await (await page.request.get(`/api/images?profile_id=${person.id}`)).json()).length).toBe(2);
  expect((await (await page.request.get('/api/images')).json()).length).toBe(2);
});

test('slow frames retain the previous photo; failed thumbnails recover', async ({ page }) => {
  const ids = await seed(page);
  await page.getByTestId('play-pause-button').click();
  await page.getByTestId('timelapse-scrubber').fill('0');
  // Reload with a cold routed frame cache, holding the second frame on demand.
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/api/images/${ids[1]}/aligned?**`, async route => {
    if (route.request().url().includes('size=frame')) await held;
    await route.continue();
  });
  let thumbFailures = 0;
  await page.route(`**/api/images/${ids[2]}/aligned?**`, async route => {
    if (route.request().url().includes('size=thumb') && thumbFailures++ < 2) await route.fulfill({ status: 503, body: 'temporarily unavailable' });
    else await route.continue();
  });
  await page.reload();
  const frame = page.getByTestId('timelapse-frame');
  await expect(frame).toBeVisible();
  await expect(page.getByText('Loading frame…')).toBeVisible();
  await expect(frame).toHaveAttribute('src', new RegExp(`/images/${ids[0]}/`));
  expect(await frame.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  release();
  await expect.poll(async () => page.getByTestId(`previous-image-card-${ids[2]}`).locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expect.poll(async () => frame.getAttribute('src')).not.toContain(`/images/${ids[0]}/`);
});

test('a large archive mounts a bounded window and can reach the final photo', async ({ page }) => {
  await seed(page);
  const photos = await (await page.request.get('/api/images')).json();
  const many = Array.from({ length: 1200 }, (_, i) => ({ ...photos[i % 3], id: i + 10000, original_filename: `${i + 1}.jpg`, source_filename: `archive-${i + 1}.jpg` }));
  await page.route(/\/api\/images\?/, route => route.fulfill({ json: many }));
  const bytes = fs.readFileSync(WITH_FACE[0]);
  await page.route(/\/api\/images\/1\d{4}\/aligned/, route => route.fulfill({ contentType: 'image/jpeg', body: bytes }));
  await page.reload();
  const cards = page.getByTestId('previously-processed-group').locator('[data-testid^="previous-image-card-"]');
  await expect.poll(() => cards.count()).toBeGreaterThan(0);
  expect(await cards.count()).toBeLessThan(100);
  await page.getByText('Then & now', { exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByTestId('previous-image-card-11199')).toBeAttached();
  expect(await cards.count()).toBeLessThan(100);
  await page.getByTestId('library-view-list').scrollIntoViewIfNeeded();
  await page.getByTestId('library-view-list').click();
  expect(await cards.count()).toBeLessThan(100);
  await page.getByText('Then & now', { exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByTestId('previous-image-card-11199')).toBeAttached();
});

test('capture guide and timer cancel safely, then capture saves to the current person', async ({ page }) => {
  const ids = await seed(page);
  await page.evaluate(async id => {
    const image = new Image();
    image.src = `/api/images/${id}/original`;
    await image.decode();
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 800;
      const draw = () => canvas.getContext('2d')!.drawImage(image, 0, 0, 600, 800);
      draw(); const stream = canvas.captureStream(10); const interval = setInterval(draw, 100);
      stream.getTracks().forEach(track => { const stop = track.stop.bind(track); track.stop = () => { clearInterval(interval); stop(); }; });
      return stream;
    };
  }, ids[0]);
  let uploads = 0;
  page.on('request', request => { if (request.method() === 'POST' && request.url().includes('/images/upload')) uploads++; });
  await page.getByTestId('webcam-button').click();
  await expect(page.getByAltText('Previous selfie framing guide')).toBeVisible();
  await page.getByTestId('webcam-capture-button').click();
  await expect(page.getByRole('button', { name: 'Cancel countdown' })).toBeVisible();
  await page.getByTestId('webcam-close-button').click();
  await page.waitForTimeout(3200);
  expect(uploads).toBe(0);
  await page.getByTestId('webcam-button').click();
  await expect.poll(() => page.getByTestId('webcam-video').evaluate((video: HTMLVideoElement) => video.videoWidth)).toBeGreaterThan(0);
  await page.getByLabel('Capture timer').selectOption('0');
  await page.getByTestId('webcam-capture-button').click();
  await expect(page.getByTestId('staging-grid')).toBeVisible();
  expect(uploads).toBe(1);
  await page.getByTestId('align-images-button').click();
  await expect(page.getByTestId('alignment-result-success')).toContainText('Saved to Ryan');
});

test('archive controls fit phone and desktop layouts', async ({ page }) => {
  await seed(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByText('Then & now', { exact: true }).click();
  await page.getByTestId('photo-comparison').scrollIntoViewIfNeeded();
  await expect.poll(() => page.getByTestId('photo-comparison').locator('img').first().evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/archive-phone.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByText('Choose photos & export presets').click();
  await page.getByTestId('play-pause-button').click();
  await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('aside')?.scrollTo(0, 0); });
  await page.screenshot({ path: 'test-results/archive-desktop.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
});
