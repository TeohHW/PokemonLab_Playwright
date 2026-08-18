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
  test('Home hides Continue when local state has no valid station', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await expect(page.getByText(/choose (?:your|a) station/i)).toBeVisible();
    await expect(page.locator('.home-continue-panel')).toHaveCount(0);
    await expect(page.getByText(/favorites?/i)).toHaveCount(0);

    await page.evaluate((storageKey) => {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          lastStation: 'unknown-station',
          lastRoute: { station: 'unknown-station', params: {} },
          preferences: { reducedMotion: false }
        })
      );
    }, appStateStorageKey);
    await page.reload();

    await expect(page.locator('.home-continue-panel')).toHaveCount(0);
  });

  test('Continue shows only the latest station with station-specific context', async ({ page }) => {
    const continueCases = [
      {
        lastStation: 'pokedex',
        lastRoute: {
          station: 'pokedex',
          params: { dex: 'kanto', pokemon: 'bulbasaur' }
        },
        stationName: 'Pokedex',
        context: 'Last Pokemon: Bulbasaur'
      },
      {
        lastStation: 'trainerdex',
        lastRoute: {
          station: 'trainerdex',
          params: {
            trainer: 'misty-kanto',
            game: 'firered-leafgreen',
            stage: 'initial'
          }
        },
        stationName: 'TrainerDex',
        context: 'Last trainer: Misty Kanto'
      },
      {
        lastStation: 'tcg',
        lastRoute: { station: 'tcg', params: { set: 'base3' } },
        stationName: 'Pokemon TCG Simulator',
        context: 'Return to your selected set and binder'
      },
      {
        lastStation: 'team',
        lastRoute: { station: 'team', params: {} },
        stationName: 'Pokemon Team Planner',
        context: 'Return to your current team'
      },
      {
        lastStation: 'quiz',
        lastRoute: { station: 'quiz', params: {} },
        stationName: 'Pokemon Quiz',
        context: 'Return to the quiz'
      },
      {
        lastStation: 'who',
        lastRoute: { station: 'who', params: {} },
        stationName: "Who's That Pokemon?",
        context: 'Return to your challenge'
      }
    ];

    await page.goto('/');

    for (const continueCase of continueCases) {
      await page.evaluate(
        ({ storageKey, lastStation, lastRoute }) => {
          localStorage.setItem(
            storageKey,
            JSON.stringify({
              lastStation,
              lastRoute,
              preferences: { reducedMotion: false }
            })
          );
        },
        {
          storageKey: appStateStorageKey,
          lastStation: continueCase.lastStation,
          lastRoute: continueCase.lastRoute
        }
      );
      await page.reload();

      const panel = page.locator('.home-continue-panel');
      const task = panel.locator('.home-continue-task');
      const copy = task.locator('.home-continue-copy');

      await expect(panel).toBeVisible();
      await expect(task).toHaveCount(1);
      await expect(copy.locator('strong')).toHaveText(continueCase.stationName);
      await expect(copy.locator('small')).toHaveText(continueCase.context);
      await expect(task.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
    }
  });

  test('Resume restores saved route parameters from the far-right Continue action', async ({
    page
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await page.evaluate((storageKey) => {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          lastStation: 'pokedex',
          lastRoute: {
            station: 'pokedex',
            params: { dex: 'kanto', pokemon: 'bulbasaur' }
          },
          preferences: { reducedMotion: false }
        })
      );
    }, appStateStorageKey);
    await page.reload();

    const task = page.locator('.home-continue-task');
    const resume = task.getByRole('button', { name: 'Resume', exact: true });
    const [taskBox, resumeBox] = await Promise.all([task.boundingBox(), resume.boundingBox()]);

    expect(taskBox).not.toBeNull();
    expect(resumeBox).not.toBeNull();
    expect(Math.abs(taskBox!.x + taskBox!.width - (resumeBox!.x + resumeBox!.width))).toBeLessThan(
      1
    );

    await resume.click();

    await expect(page).toHaveURL(/#\/pokedex\?dex=kanto&pokemon=bulbasaur$/);
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
