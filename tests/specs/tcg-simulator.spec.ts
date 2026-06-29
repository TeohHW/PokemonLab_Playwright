import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/test';

test.describe('Pokemon TCG Simulator', () => {
  // Starts each test with a clean persisted collection so cases stay independent.
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('pokemon-pack-simulator-collection');
    });
  });

  // Enters the simulator from the landing page and waits until pack controls are usable.
  async function openTcgSimulator(page: Page) {
    await page.goto('/');
    await page.getByRole('button', { name: /pokemon tcg simulator/i }).click();

    const openOnePackButton = page.getByRole('button', { name: /^open 1 pack$/i });
    await expect(openOnePackButton).toBeEnabled({ timeout: 30_000 });

    return openOnePackButton;
  }

  // Locates the currently opened pack modal by looking for the revealed-card grid inside it.
  function packDialog(page: Page) {
    return page.getByRole('dialog').filter({ has: page.locator('.pack-grid') });
  }

  // Opens the default Base pack and verifies the expected 10-card modal is ready.
  async function openDefaultPack(page: Page) {
    const openOnePackButton = await openTcgSimulator(page);

    await openOnePackButton.click();
    await expect(packDialog(page)).toBeVisible();
    await expectRevealedCardsWithImageSrc(page, 10);

    return packDialog(page);
  }

  // Reads the selected set's binder progress number from the collection panel.
  async function getCollectionProgress(page: Page, setName: string, totalCards: number) {
    const binder = page.getByLabel('Collection binder');
    await expect(binder).toContainText(
      new RegExp(`${setName} collection progress: \\d+ / ${totalCards} unique cards`, 'i')
    );

    const binderText = (await binder.textContent()) ?? '';
    const progressMatch = binderText.match(
      new RegExp(`${setName} collection progress: (\\d+) / ${totalCards} unique cards`, 'i')
    );

    expect(progressMatch, `${setName} collection progress should be visible`).not.toBeNull();

    return Number(progressMatch?.[1]);
  }

  // Resets the active set binder only when existing localStorage progress is present.
  async function clearSelectedBinderIfNeeded(page: Page, setName: string, totalCards: number) {
    const currentProgress = await getCollectionProgress(page, setName, totalCards);

    if (currentProgress === 0) {
      return;
    }

    await page.getByRole('button', { name: 'Clear This Binder' }).click();
    const clearBinderDialog = page.getByRole('dialog', { name: 'Clear This Binder?' });
    await expect(clearBinderDialog).toBeVisible();
    await clearBinderDialog.getByRole('button', { name: 'Clear This Binder' }).click();
    await expect(page.getByLabel('Collection binder')).toContainText(
      `${setName} collection progress: 0 / ${totalCards} unique cards`
    );
  }

  // Seeds localStorage with every Base card so cap behavior can be tested without random pulls.
  async function seedFullBaseBinder(page: Page) {
    const fullBaseCollection = Object.fromEntries(
      Array.from({ length: 102 }, (_, index) => {
        const cardNumber = index + 1;
        const id = `base1-${cardNumber}`;

        return [
          id,
          {
            id,
            name: `Seeded Base Card ${cardNumber}`,
            image: `https://images.pokemontcg.io/base1/${cardNumber}.png`,
            setId: 'base1',
            setName: 'Base',
            count: 1
          }
        ];
      })
    );

    await page.evaluate((collection) => {
      localStorage.setItem('pokemon-pack-simulator-collection', JSON.stringify(collection));
    }, fullBaseCollection);
  }

  // Seeds two binders so tests can verify selected-binder and all-binder clearing separately.
  async function seedBaseAndFossilBinders(page: Page) {
    await page.evaluate(() => {
      localStorage.setItem(
        'pokemon-pack-simulator-collection',
        JSON.stringify({
          'base1-1': {
            id: 'base1-1',
            name: 'Seeded Base Card',
            image: 'https://images.pokemontcg.io/base1/1.png',
            setId: 'base1',
            setName: 'Base',
            count: 1
          },
          'base3-1': {
            id: 'base3-1',
            name: 'Seeded Fossil Card',
            image: 'https://images.pokemontcg.io/base3/1.png',
            setId: 'base3',
            setName: 'Fossil',
            count: 1
          }
        })
      );
    });
  }

  // Seeds one duplicated Base card so owned count and unique progress can be checked directly.
  async function seedDuplicatedBaseCard(page: Page) {
    await page.evaluate(() => {
      localStorage.setItem(
        'pokemon-pack-simulator-collection',
        JSON.stringify({
          'base1-43': {
            id: 'base1-43',
            name: 'Abra',
            image: 'https://images.pokemontcg.io/base1/43.png',
            setId: 'base1',
            setName: 'Base',
            count: 2
          }
        })
      );
    });
  }

  // Verifies revealed card images are present and point to real image sources.
  async function expectRevealedCardsWithImageSrc(page: Page, expectedCardCount: number) {
    const revealedCards = page.locator('.pack-grid img:not(.card-back-image)');

    await expect(revealedCards).toHaveCount(expectedCardCount);

    const imageSources = await revealedCards.evaluateAll((cards) =>
      cards.map((card) => card.getAttribute('src'))
    );

    expect(imageSources).toHaveLength(expectedCardCount);
    for (const imageSource of imageSources) {
      expect(imageSource).toBeTruthy();
    }
  }

  // Locates one expansion-set tile by its accessible button name.
  function expansionSetButton(page: Page, setName: string, seriesName: string, releaseYear: number) {
    return page.getByRole('button', {
      name: new RegExp(`${setName}\\s+${seriesName}\\s+${releaseYear}`, 'i')
    });
  }

  // Locates visible expansion-set tiles, which include a release year in their accessible name.
  function expansionSetButtons(page: Page) {
    return page.getByRole('button', { name: /\b\d{4}\b/ });
  }

  test.describe('TCG simulator station', () => {
    test.describe('Session', () => {
      // Verifies the simulator opens with default Base controls and an empty binder.
      test('Starts a new session', async ({ page }) => {
        const openOnePackButton = await openTcgSimulator(page);

        await expect(page.getByRole('button', { name: /^base$/i })).toBeEnabled();
        await expect(page.getByRole('button', { name: /^open 10 packs$/i })).toBeEnabled();
        await expect(page.getByRole('button', { name: /^open random pack$/i })).toBeEnabled();
        await expect(openOnePackButton).toBeEnabled();
        expect(await getCollectionProgress(page, 'Base', 102)).toBe(0);
        await expect(page.getByRole('heading', { name: /^binder$/i })).toBeVisible();
      });
    });

    test.describe('Pack opening', () => {
      // Verifies a single default Base pack reveals 10 cards and updates binder progress.
      test('Opens default pack - Base', async ({ page }) => {
        await openDefaultPack(page);

        const newBadges = page.locator('.new-card-badge');
        await expect(newBadges).toHaveCount(10);
        for (let i = 0; i < 10; i++) {
          await expect(newBadges.nth(i)).toBeVisible();
        }
        await page.getByRole('button', { name: /^close$/i }).click();

        const baseProgress = await getCollectionProgress(page, 'Base', 102);
        expect(baseProgress).toBeGreaterThan(0);
        expect(baseProgress).toBeLessThanOrEqual(102);
        await expect(page.getByRole('button', { name: 'Clear This Binder' })).toBeEnabled();
      });

      // Verifies the multi-pack action reveals 100 cards and enables binder clearing.
      test('Open 10 packs', async ({ page }) => {
        await openTcgSimulator(page);

        await page.getByRole('button', { name: /^open 10 packs$/i }).click();

        await expect(page.locator('.pack-grid')).toBeVisible();
        await expectRevealedCardsWithImageSrc(page, 100);

        await page.getByRole('button', { name: /^close$/i }).click();
        await expect(page.getByRole('button', { name: 'Clear This Binder' })).toBeEnabled();
      });

      // Verifies a god pack reveals 10 cards and every revealed card is marked holo.
      test('Open god pack', async ({ page }) => {
        await openTcgSimulator(page);

        await page.getByRole('button', { name: /^open god pack$/i }).click();

        const openedPack = page.locator('.pack-grid');
        await expect(openedPack).toBeVisible();
        await expectRevealedCardsWithImageSrc(page, 10);
        await expect(openedPack.locator('.holo-overlay')).toHaveCount(10);
      });

      // Verifies the random-pack action opens a pack with a visible set logo and 10 cards.
      test('Open random pack', async ({ page }) => {
        await openTcgSimulator(page);

        await page.getByRole('button', { name: /^open random pack$/i }).click();

        await expect(page.locator('.pack-grid')).toBeVisible();
        await expectRevealedCardsWithImageSrc(page, 10);
        await expect(page.locator('.pack-set-logo')).toBeVisible();
        await expect(page.getByRole('button', { name: /^close$/i })).toBeVisible();
      });

      // Verifies random-pack pulls are stored against the actual random set that opened.
      test('Open random pack stores cards for the opened set', async ({ page }) => {
        await openTcgSimulator(page);

        await page.getByRole('button', { name: /^open random pack$/i }).click();

        const openedSetName = ((await page.locator('.pack-set-logo').getAttribute('alt')) ?? '').replace(
          /\s+logo$/i,
          ''
        );
        expect(openedSetName).toBeTruthy();

        await page.getByRole('button', { name: /^close$/i }).click();

        // The visible binder stays on Base, so persisted collection data is the source of truth here.
        const storedSetNames = await page.evaluate(() => {
          const collection = JSON.parse(localStorage.getItem('pokemon-pack-simulator-collection') ?? '{}');

          return [
            ...new Set(
              Object.values(collection).map((card) => (card as { setName: string }).setName)
            )
          ];
        });

        expect(storedSetNames).toEqual([openedSetName]);
      });
    });

    test.describe('Pack modal', () => {
      // Verifies the modal close action removes both the dialog and the pack grid.
      test('Close hides the pack modal and grid', async ({ page }) => {
        const dialog = await openDefaultPack(page);

        await page.getByRole('button', { name: /^close$/i }).click();

        await expect(dialog).toBeHidden();
        await expect(page.locator('.pack-grid')).toBeHidden();
      });
    });

    test.describe('Binder', () => {
      // Verifies Base and Fossil progress are tracked independently as packs are opened.
      test('Binder collection update for selected set', async ({ page }) => {
        await openTcgSimulator(page);

        expect(await getCollectionProgress(page, 'Base', 102)).toBe(0);

        await page.getByRole('button', { name: /fossil/i }).click();
        expect(await getCollectionProgress(page, 'Fossil', 62)).toBe(0);

        await page.getByRole('button', { name: /base\s+base\s+1999/i }).click();
        expect(await getCollectionProgress(page, 'Base', 102)).toBe(0);

        await page.getByRole('button', { name: /^open 10 packs$/i }).click();
        await expectRevealedCardsWithImageSrc(page, 100);
        await page.getByRole('button', { name: /^close$/i }).click();

        const baseProgressAfterOpeningPacks = await getCollectionProgress(page, 'Base', 102);
        expect(baseProgressAfterOpeningPacks).toBeGreaterThan(0);
        expect(baseProgressAfterOpeningPacks).toBeLessThanOrEqual(102);

        await page.getByRole('button', { name: /fossil/i }).click();
        expect(await getCollectionProgress(page, 'Fossil', 62)).toBe(0);

        await page.getByRole('button', { name: /^open 10 packs$/i }).click();
        await expectRevealedCardsWithImageSrc(page, 100);
        await page.getByRole('button', { name: /^close$/i }).click();

        const fossilProgressAfterOpeningPacks = await getCollectionProgress(page, 'Fossil', 62);
        expect(fossilProgressAfterOpeningPacks).toBeGreaterThan(0);
        expect(fossilProgressAfterOpeningPacks).toBeLessThanOrEqual(62);

        await page.getByRole('button', { name: /base\s+base\s+1999/i }).click();
        await expect(page.getByText(/Fossil collection progress/i)).toBeHidden();
        expect(await getCollectionProgress(page, 'Base', 102)).toBe(baseProgressAfterOpeningPacks);

        await page.getByRole('button', { name: /fossil/i }).click();
        expect(await getCollectionProgress(page, 'Fossil', 62)).toBe(fossilProgressAfterOpeningPacks);
      });

      // Verifies a fully seeded Base binder remains capped after opening more packs.
      test('Base binder progress never exceeds total unique cards', async ({ page }) => {
        await openTcgSimulator(page);
        // Seed all Base cards directly to avoid relying on random pulls to complete the set.
        await seedFullBaseBinder(page);
        await page.reload();
        await page.getByRole('button', { name: /pokemon tcg simulator/i }).click();

        expect(await getCollectionProgress(page, 'Base', 102)).toBe(102);

        await page.getByRole('button', { name: /^open 10 packs$/i }).click();
        await expectRevealedCardsWithImageSrc(page, 100);
        await page.getByRole('button', { name: /^close$/i }).click();

        expect(await getCollectionProgress(page, 'Base', 102)).toBe(102);
      });

      // Verifies unique progress stays capped even after opening another pack from a full binder.
      test('Collection does not exceed total unique cards', async ({ page }) => {
        await openTcgSimulator(page);
        // Start at the exact collection cap so any overflow would be visible immediately.
        await seedFullBaseBinder(page);
        await page.reload();
        await page.getByRole('button', { name: /pokemon tcg simulator/i }).click();

        expect(await getCollectionProgress(page, 'Base', 102)).toBe(102);
        await page.getByRole('button', { name: 'Open 1 Pack' }).click();
        await page.getByRole('button', { name: 'Close' }).click();
        await expect(page.getByLabel('Collection binder')).toContainText(
          'Base collection progress: 102 / 102 unique cards'
        );
      });

      // Verifies confirming "Clear This Binder" resets only the selected Base binder.
      test('Clear binder collection - Base', async ({ page }) => {
        await openDefaultPack(page);
        await page.getByRole('button', { name: /^close$/i }).click();

        const baseProgress = await getCollectionProgress(page, 'Base', 102);
        expect(baseProgress).toBeGreaterThan(0);
        expect(baseProgress).toBeLessThanOrEqual(102);

        await expect(page.getByRole('button', { name: 'Clear This Binder' })).toBeEnabled();
        await page.getByRole('button', { name: 'Clear This Binder' }).click();
        await expect(page.getByRole('dialog', { name: 'Clear This Binder?' })).toBeVisible();
        await expect(page.getByLabel('Clear This Binder?')).toContainText(
          /This will remove \d+ owned cards? from Base only\./
        );

        await page
          .getByLabel('Clear This Binder?')
          .getByRole('button', { name: 'Clear This Binder' })
          .click();
        expect(await getCollectionProgress(page, 'Base', 102)).toBe(0);
      });

      // Verifies canceling the selected-binder clear dialog preserves Base progress.
      test('Cancel clear binder leaves selected binder unchanged', async ({ page }) => {
        await openDefaultPack(page);
        await page.getByRole('button', { name: /^close$/i }).click();

        const baseProgress = await getCollectionProgress(page, 'Base', 102);
        expect(baseProgress).toBeGreaterThan(0);

        await page.getByRole('button', { name: 'Clear This Binder' }).click();

        // Cancel should dismiss the dialog without mutating localStorage or visible progress.
        const clearThisBinderDialog = page.getByRole('dialog', { name: 'Clear This Binder?' });
        await expect(clearThisBinderDialog).toBeVisible();
        await clearThisBinderDialog.getByRole('button', { name: 'Cancel' }).click();

        await expect(clearThisBinderDialog).toBeHidden();
        expect(await getCollectionProgress(page, 'Base', 102)).toBe(baseProgress);
      });

      // Verifies "Clear This Binder" affects one set, then "Clear All Binders" removes every set.
      test('Clear all binders', async ({ page }) => {
        await openTcgSimulator(page);
        // Seed two sets so the test can prove single-binder and all-binder clearing differ.
        await seedBaseAndFossilBinders(page);
        await page.reload();
        await page.getByRole('button', { name: /pokemon tcg simulator/i }).click();

        expect(await getCollectionProgress(page, 'Base', 102)).toBe(1);

        await page.getByRole('button', { name: 'Fossil logo Fossil Base' }).click();
        expect(await getCollectionProgress(page, 'Fossil', 62)).toBe(1);

        await page.getByRole('button', { name: 'Base logo Base Base' }).click();
        await expect(page.getByRole('button', { name: 'Clear This Binder' })).toBeEnabled();
        await page.getByRole('button', { name: 'Clear This Binder' }).click();

        const clearThisBinderDialog = page.getByRole('dialog', { name: 'Clear This Binder?' });
        await expect(clearThisBinderDialog).toBeVisible();
        await expect(clearThisBinderDialog).toContainText(
          /This will remove \d+ owned cards? from Base only\./
        );
        await clearThisBinderDialog.getByRole('button', { name: 'Clear This Binder' }).click();

        expect(await getCollectionProgress(page, 'Base', 102)).toBe(0);

        await page.getByRole('button', { name: 'Fossil logo Fossil Base' }).click();
        expect(await getCollectionProgress(page, 'Fossil', 62)).toBe(1);

        await expect(page.getByRole('button', { name: 'Clear All Binders' })).toBeEnabled();
        await page.getByRole('button', { name: 'Clear All Binders' }).click();

        const clearAllBindersDialog = page.getByRole('dialog', { name: 'Clear All Binders?' });
        await expect(clearAllBindersDialog).toBeVisible();
        await expect(clearAllBindersDialog).toContainText(
          'This will remove every card from every binder collection.'
        );
        await clearAllBindersDialog.getByRole('button', { name: 'Clear All Binders' }).click();

        expect(await getCollectionProgress(page, 'Fossil', 62)).toBe(0);
      });

      // Verifies canceling the all-binders dialog preserves progress across multiple binders.
      test('Cancel clear all binders leaves every binder unchanged', async ({ page }) => {
        await openTcgSimulator(page);
        // Use deterministic seeded cards so both Base and Fossil have known progress.
        await seedBaseAndFossilBinders(page);
        await page.reload();
        await page.getByRole('button', { name: /pokemon tcg simulator/i }).click();

        expect(await getCollectionProgress(page, 'Base', 102)).toBe(1);

        await page.getByRole('button', { name: 'Clear All Binders' }).click();

        const clearAllBindersDialog = page.getByRole('dialog', { name: 'Clear All Binders?' });
        await expect(clearAllBindersDialog).toBeVisible();
        await clearAllBindersDialog.getByRole('button', { name: 'Cancel' }).click();

        await expect(clearAllBindersDialog).toBeHidden();
        expect(await getCollectionProgress(page, 'Base', 102)).toBe(1);

        await page.getByRole('button', { name: 'Fossil logo Fossil Base' }).click();
        expect(await getCollectionProgress(page, 'Fossil', 62)).toBe(1);
      });

      // Verifies binder progress survives closing the page and opening a new page in the same context.
      test('Opening a pack persists binder progress after closing and reopening the page', async ({
        context,
        page
      }) => {
        await openDefaultPack(page);
        await page.getByRole('button', { name: /^close$/i }).click();

        const baseProgress = await getCollectionProgress(page, 'Base', 102);
        expect(baseProgress).toBeGreaterThan(0);

        await page.close();
        // A new page in the same browser context should still see the persisted localStorage collection.
        const reloadedPage = await context.newPage();
        await openTcgSimulator(reloadedPage);

        expect(await getCollectionProgress(reloadedPage, 'Base', 102)).toBe(baseProgress);
      });

      // Verifies cleared binder progress remains cleared after a reload.
      test('Cleared binder stays cleared after reload', async ({ page }) => {
        await openDefaultPack(page);
        await page.getByRole('button', { name: /^close$/i }).click();

        await clearSelectedBinderIfNeeded(page, 'Base', 102);
        expect(await getCollectionProgress(page, 'Base', 102)).toBe(0);

        await page.reload();
        await page.getByRole('button', { name: /pokemon tcg simulator/i }).click();

        expect(await getCollectionProgress(page, 'Base', 102)).toBe(0);
      });

      // Verifies duplicate copies increase owned count while unique-card progress counts only one card.
      test('Duplicate cards increase owned count without increasing unique progress', async ({ page }) => {
        await openTcgSimulator(page);
        // Seed one Base card with count 2 to separate "owned copies" from unique progress.
        await seedDuplicatedBaseCard(page);
        await page.reload();
        await page.getByRole('button', { name: /pokemon tcg simulator/i }).click();

        expect(await getCollectionProgress(page, 'Base', 102)).toBe(1);
        await expect(page.getByLabel('Collection binder')).toContainText(/AbraOwned x 2/);
      });

      // Verifies binder-card search filters the card list within the selected set.
      test('Binder card search filters cards within selected set', async ({ page }) => {
        await openTcgSimulator(page);

        await page.getByPlaceholder('Search Pokemon in this set...').fill('pika');

        await expect(page.getByText('PIKACHU')).toBeVisible();
        await expect(page.getByText('ABRA')).toBeHidden();
      });
    });

    test.describe('Set selection', () => {
      // Verifies choosing Jungle updates the binder and opens a Jungle pack.
      test('Select set by name', async ({ page }) => {
        await openTcgSimulator(page);

        await page.getByRole('button', { name: /jungle/i }).click();

        expect(await getCollectionProgress(page, 'Jungle', 64)).toBe(0);
        await expect(page.getByRole('button', { name: /^open 1 pack$/i })).toBeEnabled();

        await page.getByRole('button', { name: /^open 1 pack$/i }).click();

        await expect(page.locator('.pack-set-logo')).toHaveAttribute('alt', /^Jungle logo$/);
        await expectRevealedCardsWithImageSrc(page, 10);
      });

      // Verifies sort options reorder the visible expansion-set tiles.
      test('Sort sets by newest and by name', async ({ page }) => {
        await openTcgSimulator(page);

        // Newest-first should surface a 2026 set before older releases.
        await page.getByRole('combobox').selectOption({ label: 'Release year: newest first' });
        await expect(expansionSetButtons(page).first()).toContainText('2026');

        // Name sorting puts the numeric "151" expansion first.
        await page.getByRole('combobox').selectOption({ label: 'Name: A to Z' });
        await expect(expansionSetButtons(page).first()).toContainText(/^151/);
      });

      // Verifies selecting a series category filters out sets from other series.
      test('Series filter only shows matching sets', async ({ page }) => {
        await openTcgSimulator(page);

        await page.getByRole('button', { name: /^sun & moon$/i }).click();

        const visibleSetTexts = await expansionSetButtons(page).evaluateAll((buttons) =>
          buttons.map((button) => button.textContent ?? '')
        );

        // Check every visible expansion tile, not just one sample, so mixed-series leakage is caught.
        expect(visibleSetTexts.length).toBeGreaterThan(0);
        for (const visibleSetText of visibleSetTexts) {
          expect(visibleSetText.toUpperCase()).toContain('SUN & MOON');
        }
      });
    });

    test.describe('Search', () => {
      // Verifies expansion search narrows results and the selected result controls the opened pack.
      test('Search valid set', async ({ page }) => {
        await openTcgSimulator(page);

        const teamUpSet = expansionSetButton(page, 'Team Up', 'Sun & Moon', 2019);

        await page.getByPlaceholder('Search by set name...').fill('Team up');
        await expect(teamUpSet).toBeVisible();
        await expect(expansionSetButton(page, 'Base', 'Base', 1999)).toBeHidden();

        await teamUpSet.click();

        await expect(page.getByLabel('Collection binder')).toContainText(
          'Team Up collection progress: 0 / 198 unique cards'
        );
        await page.getByRole('button', { name: 'Open 1 Pack' }).click();
        await expect(page.getByRole('dialog').getByRole('img', { name: 'Team Up logo' })).toBeVisible();
        await expect(page.locator('.pack-grid')).toBeVisible();
        await expectRevealedCardsWithImageSrc(page, 10);
      });

      // Verifies an unmatched expansion search displays no expansion-set tiles.
      test('Search invalid set', async ({ page }) => {
        await openTcgSimulator(page);

        await page.getByPlaceholder('Search by set name...').fill('Invalid');

        await expect(expansionSetButtons(page)).toHaveCount(0);
      });

      // Verifies expansion search ignores case and supports partial search text.
      test('Search set is case-insensitive and supports partial matches', async ({ page }) => {
        await openTcgSimulator(page);

        await page.getByPlaceholder('Search by set name...').fill('team');

        await expect(expansionSetButton(page, 'Team Up', 'Sun & Moon', 2019)).toBeVisible();
        await expect(expansionSetButton(page, 'Team Rocket', 'Base', 2000)).toBeVisible();
        await expect(expansionSetButton(page, 'Base', 'Base', 1999)).toBeHidden();
      });

      // Verifies clearing expansion search restores the full set list.
      test('Clear set', async ({ page }) => {
        await openTcgSimulator(page);

        await page.getByPlaceholder('Search by set name...').fill('Team up');
        await expect(expansionSetButton(page, 'Team Up', 'Sun & Moon', 2019)).toBeVisible();
        await expect(expansionSetButton(page, 'Base', 'Base', 1999)).toBeHidden();

        await page.getByRole('button', { name: 'Clear expansion search' }).click();

        await expect(page.getByPlaceholder('Search by set name...')).toHaveValue('');
        await expect(expansionSetButton(page, 'Base', 'Base', 1999)).toBeVisible();
        await expect(expansionSetButton(page, 'Jungle', 'Base', 1999)).toBeVisible();
        await expect(expansionSetButton(page, 'Fossil', 'Base', 1999)).toBeVisible();
      });

      // Verifies clearing the search input does not reset the currently selected expansion.
      test('Selecting a set from search keeps that set active after clearing search', async ({ page }) => {
        await openTcgSimulator(page);

        await page.getByPlaceholder('Search by set name...').fill('Team up');
        await expansionSetButton(page, 'Team Up', 'Sun & Moon', 2019).click();

        expect(await getCollectionProgress(page, 'Team Up', 198)).toBe(0);

        await page.getByRole('button', { name: 'Clear expansion search' }).click();

        // The full list returns, but the binder and pack controls should remain on Team Up.
        await expect(expansionSetButton(page, 'Base', 'Base', 1999)).toBeVisible();
        expect(await getCollectionProgress(page, 'Team Up', 198)).toBe(0);
        await expect(page.getByRole('button', { name: /^open 1 pack$/i })).toBeEnabled();
      });
    });
  });
});
