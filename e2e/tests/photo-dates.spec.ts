import { test, expect } from '@playwright/test';
import { deleteAllImages, WITH_FACE, uploadAndStage, alignStagedImages } from '../utils/helpers';

test.use({ timezoneId: 'America/New_York' });
test.beforeEach(async ({ page }) => { await page.goto('/'); await deleteAllImages(page); await page.reload(); });
test.afterEach(async ({ page }) => { await deleteAllImages(page); });

test('unknown date is labelled, editable in both views, and refreshes a paused caption', async ({ page }) => {
  await uploadAndStage(page, [WITH_FACE[0]]);
  await expect(page.getByTestId('staging-grid')).toContainText('Upload date');
  const [uploaded] = await (await page.request.get('/api/images')).json();
  expect(uploaded.date_source).toBe('upload');
  const uploadDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(uploaded.created_at + 'Z'));
  expect(uploaded.photo_taken_at.slice(0, 10)).toBe(uploadDay);
  await alignStagedImages(page);
  const group = page.getByTestId('previously-processed-group');
  const edit = group.getByRole('button', { name: /Edit photo date:/ });
  await expect(edit).toContainText('Upload date');
  const play = page.getByTestId('play-pause-button');
  if (await play.getAttribute('aria-label') === 'Pause') await play.click();
  await expect(page.getByTestId('timelapse-frame')).toBeVisible();
  const frameSrc = await page.getByTestId('timelapse-frame').getAttribute('src');
  await edit.click();
  const dialog = page.getByRole('dialog', { name: 'Photo date' });
  await expect(dialog).toContainText('Capture date unknown');
  await dialog.getByLabel('Date taken').fill('2001-02-03');
  await dialog.getByRole('button', { name: 'Save date' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(edit).toContainText('Feb 3, 2001');
  await expect(edit).not.toContainText('Upload date');
  await expect(page.getByTestId('timelapse-date-overlay')).toHaveText('February 3, 2001');
  await expect(page.getByTestId('timelapse-frame')).toHaveAttribute('src', frameSrc!);
  await expect(play).toHaveAttribute('aria-label', 'Play');
  await page.reload();
  await page.getByTestId('library-view-list').click();
  await expect(edit).toContainText('Feb 3, 2001');
  await page.setViewportSize({ width: 390, height: 844 });
  await edit.click();
  await expect(dialog).toContainText('Date set manually');
  await expect(dialog.getByLabel('Date taken')).toHaveValue('2001-02-03');
  await page.screenshot({ path: test.info().outputPath('photo-date-editor-mobile.png') });
  await dialog.getByRole('button', { name: 'Use upload date' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(edit).toContainText('Upload date');
  const [reset] = await (await page.request.get('/api/images')).json();
  expect(reset.photo_taken_at).toBe(uploaded.photo_taken_at);
  expect(reset.date_source).toBe('upload');
});

test('a failed date save stays open and can be retried without altering the photo', async ({ page }) => {
  await uploadAndStage(page, [WITH_FACE[1]]);
  await alignStagedImages(page);
  const edit = page.getByTestId('previously-processed-group').getByRole('button', { name: /Edit photo date:/ });
  await edit.click();
  const dialog = page.getByRole('dialog', { name: 'Photo date' });
  await dialog.getByLabel('Date taken').fill('2005-08-19');
  await page.route('**/api/images/*/date?*', route => route.fulfill({ status: 503,
    contentType: 'application/json', body: JSON.stringify({ detail: 'Please retry' }) }));
  await dialog.getByRole('button', { name: 'Save date' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Please retry');
  expect((await (await page.request.get('/api/images')).json())[0].date_source).toBe('upload');
  await page.unroute('**/api/images/*/date?*');
  await dialog.getByRole('button', { name: 'Save date' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(edit).toContainText('Aug 19, 2005');
});
