import { test, expect } from '@playwright/test';

test.describe('form examples', () => {
  test('can fill a search box when the page has one', async ({ page }) => {
    await page.goto('/');

    const searchBox = page
      .getByRole('searchbox')
      .or(page.getByRole('textbox', { name: /search|query|keyword/i }))
      .first();

    if ((await searchBox.count()) === 0) {
      test.skip(true, 'The configured page does not expose a recognizable search input.');
    }

    await searchBox.fill('playwright');
    await expect(searchBox).toHaveValue('playwright');
  });
});
