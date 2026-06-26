import { test, expect } from '@playwright/test';

test.describe('navigation examples', () => {
  test('can verify a custom path from BASE_URL', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('body')).toBeVisible();
  });

  test('can follow the first visible link when one exists', async ({ page }) => {
    await page.goto('/');

    const firstVisibleLink = page.getByRole('link').filter({ visible: true }).first();

    if ((await firstVisibleLink.count()) === 0) {
      test.skip(true, 'The configured page does not expose a visible link.');
    }

    await Promise.all([page.waitForLoadState('domcontentloaded'), firstVisibleLink.click()]);
    await expect(page.locator('body')).toBeVisible();
  });
});
