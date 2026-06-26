import { test, expect } from '../fixtures/test';

test.describe('homepage smoke checks', () => {
  test('@smoke loads the configured base page', async ({ homePage, page }) => {
    await homePage.goto();

    await expect(page).toHaveURL(/.+/);
    await expect(homePage.body).toBeVisible();
    await expect(homePage.body).not.toBeEmpty();
  });

  test('@smoke has a usable document title', async ({ homePage }) => {
    await homePage.goto();

    await expect.poll(() => homePage.title()).not.toHaveLength(0);
  });
});
