import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/test';
import { homeStationButton } from '../pages/HomePage';

const appStateStorageKey = 'pokemon-lab-app-state-v1';

async function openTcgRoute(page: Page, setId = 'base1') {
  await page.goto(`/#/tcg?set=${setId}`);
  await expect(page.locator('.brand-home-button h1')).toContainText(/TCG Simulator/i);
  await expect(page.getByRole('button', { name: /^open 1 pack$/i })).toBeEnabled({
    timeout: 30_000
  });
}

test.describe('Shared application continuity and accessibility', () => {
  test('Empty local state leaves no blank Continue, recent, or favorites panels', async ({
    page
  }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await expect(page.getByText(/choose (?:your|a) station/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: /^continue$/i })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /^recently viewed$/i })).toHaveCount(0);
    await expect(page.getByText(/favorites?/i)).toHaveCount(0);
  });

  test('Continue restores the saved route and Home shows only four newest recent items', async ({
    page
  }) => {
    await page.goto('/');
    await page.evaluate((storageKey) => {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          lastStation: 'tcg',
          lastRoute: { station: 'tcg', params: { set: 'base3' } },
          recent: {
            pokemon: [
              { id: 'pikachu', label: 'Pikachu', viewedAt: 500 },
              { id: 'bulbasaur', label: 'Bulbasaur', viewedAt: 100 }
            ],
            trainers: [{ id: 'misty', label: 'Misty', viewedAt: 400 }],
            cards: [
              { id: 'base1-4', label: 'Charizard', setId: 'base1', viewedAt: 300 },
              { id: 'base1-10', label: 'Mewtwo', setId: 'base1', viewedAt: 200 }
            ]
          },
          preferences: { reducedMotion: false }
        })
      );
    }, appStateStorageKey);
    await page.reload();

    await expect(page.getByRole('heading', { name: /^pokemon tcg simulator$/i })).toBeVisible();
    const recentItems = page.locator('.home-library-item');
    await expect(recentItems).toHaveCount(4);
    await expect(recentItems).toHaveText([
      /PokemonPikachu/,
      /TrainerMisty/,
      /CardCharizard/,
      /CardMewtwo/
    ]);
    await expect(page.getByRole('button', { name: /bulbasaur/i })).toHaveCount(0);

    await page.getByRole('button', { name: /^resume$/i }).click();

    await expect(page).toHaveURL(/#\/tcg\?set=base3$/);
    await expect(page.getByLabel('Collection binder')).toContainText('Fossil collection progress', {
      timeout: 30_000
    });
  });

  test('Direct station routes participate in browser Back and Forward navigation', async ({
    page
  }) => {
    await openTcgRoute(page, 'base3');
    await expect(page.getByLabel('Collection binder')).toContainText('Fossil collection progress');

    await page.locator('.brand-home-button').click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.getByText(/choose (?:your|a) station/i)).toBeVisible();

    await homeStationButton(page, 'tcg').click();
    await expect(page).toHaveURL(/#\/tcg$/);
    await expect(page.getByRole('button', { name: /^open 1 pack$/i })).toBeEnabled();

    await page.goBack();
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.getByText(/choose (?:your|a) station/i)).toBeVisible();

    await page.goForward();
    await expect(page).toHaveURL(/#\/tcg$/);
    await expect(page.getByRole('button', { name: /^open 1 pack$/i })).toBeEnabled();
  });

  test('The themed SVG favicon is linked and served successfully', async ({ page }) => {
    await page.goto('/');

    const favicon = page.locator('link[rel~="icon"]');
    await expect(favicon).toHaveAttribute('href', '/favicon.svg');

    const faviconUrl = await favicon.evaluate(
      (link) => new URL((link as HTMLLinkElement).href, document.baseURI).href
    );
    const response = await page.request.get(faviconUrl);

    expect(response.ok()).toBeTruthy();
    expect(response.headers()['content-type']).toContain('image/svg+xml');
    expect(await response.text()).toContain('<svg');
  });

  test('Station menu restores focus, locks scroll, and persists reduced motion', async ({
    page,
    browserName
  }) => {
    test.skip(
      browserName === 'webkit',
      'WebKit does not focus a button after pointer activation, so the generic opener cannot be restored.'
    );

    await openTcgRoute(page);
    const menuButton = page.getByRole('button', { name: /^menu$/i });
    await menuButton.click();

    const dialog = page.getByRole('dialog');
    const motionToggle = dialog.getByRole('checkbox', { name: /limit animations/i });
    await expect(dialog).toBeVisible();
    await expect(page.locator('body')).toHaveClass(/has-open-dialog/);
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');

    await motionToggle.focus();
    await motionToggle.press('Space');
    await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'true');
    await expect(dialog.getByRole('tooltip')).toContainText(/shortens interface animations/i);
    await expect
      .poll(() =>
        page.evaluate((storageKey) => {
          const state = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
          return state.preferences?.reducedMotion;
        }, appStateStorageKey)
      )
      .toBe(true);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(menuButton).toBeFocused();
    await expect(page.locator('body')).not.toHaveClass(/has-open-dialog/);

    await menuButton.click();
    await expect(
      page.getByRole('dialog').getByRole('checkbox', {
        name: /limit animations/i
      })
    ).toBeChecked();
  });

  test('Station menu focuses its initial action and traps keyboard focus', async ({ page }) => {
    await openTcgRoute(page);
    const menuButton = page.getByRole('button', { name: /^menu$/i });
    await menuButton.click();

    const dialog = page.getByRole('dialog');
    const activeStationItem = dialog.getByRole('button', { name: /^tcg simulator/i });
    const pokedexItem = dialog.getByRole('button', { name: /^pokedex$/i });
    const initialFocusItem = dialog.locator('[data-dialog-initial-focus="true"]');
    const scrimCloseButton = page.locator('.station-menu-scrim');
    const focusableItems = dialog.locator(
      'button:visible:not(:disabled), a[href]:visible, input:visible:not(:disabled), [tabindex]:visible:not([tabindex="-1"])'
    );
    const focusedModalItems = page.locator('.station-menu-scrim:focus, [role="dialog"] :focus');

    await expect(initialFocusItem).toHaveAccessibleName(/^home$/i);
    await expect(initialFocusItem).toBeFocused();
    await expect(activeStationItem).toHaveClass(/is-active/);

    await initialFocusItem.press('Tab');
    await expect(pokedexItem).toBeFocused();

    await pokedexItem.press('Tab');
    await expect(activeStationItem).toBeFocused();

    await activeStationItem.press('Shift+Tab');
    await expect(pokedexItem).toBeFocused();

    await pokedexItem.press('Shift+Tab');
    await expect(initialFocusItem).toBeFocused();

    await initialFocusItem.press('Shift+Tab');
    await expect(scrimCloseButton).toBeFocused();

    await scrimCloseButton.press('Tab');
    await expect(initialFocusItem).toBeFocused();

    await focusableItems.last().focus();
    await focusableItems.last().press('Tab');
    await expect(focusedModalItems).toHaveCount(1);

    await menuButton.focus();
    await expect(menuButton).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(initialFocusItem).toBeFocused();
  });

  test('Station menu selection closes the dialog and performs navigation', async ({ page }) => {
    await openTcgRoute(page);
    await page.getByRole('button', { name: /^menu$/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /^home$/i }).click();

    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.getByText(/choose (?:your|a) station/i)).toBeVisible();
    await expect(page.locator('body')).not.toHaveClass(/has-open-dialog/);
  });
});
