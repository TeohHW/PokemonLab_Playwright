import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../fixtures/test';

test.describe('Pokemon TCG Simulator', () => {
  const ciWebkitFlakeReason =
    'Flaky on CI WebKit; covered by Chromium, Firefox, and local WebKit runs.';
  const transparentPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
    'base64'
  );

  function skipOnCiWebkit() {
    test.skip(
      ({ browserName }) => process.env.CI === 'true' && browserName === 'webkit',
      ciWebkitFlakeReason
    );
  }

  function openOnePackButton(page: Page): Locator {
    return page.getByRole('button', { name: /^open 1 pack$/i });
  }

  // Enters the simulator from the landing page and waits until pack controls are usable.
  async function openTcgSimulator(page: Page) {
    await page.goto('/');
    await page.getByRole('button', { name: /pokemon tcg simulator/i }).click();

    const packButton = openOnePackButton(page);
    await expect(packButton).toBeEnabled({ timeout: 30_000 });

    return packButton;
  }

  const tcgTest = test.extend<{ openTcgSimulatorStation: void }>({
    openTcgSimulatorStation: [
      async ({ context, page }, use) => {
        await context.route('https://images.pokemontcg.io/**', (route) =>
          route.fulfill({
            status: 200,
            contentType: 'image/png',
            body: transparentPng
          })
        );
        await page.goto('/');
        await page.evaluate(() => {
          localStorage.removeItem('pokemon-pack-simulator-collection');
        });
        await page.getByRole('button', { name: /pokemon tcg simulator/i }).click();
        await expect(openOnePackButton(page)).toBeEnabled({ timeout: 30_000 });
        await use();
      },
      { auto: true }
    ]
  });

  // Locates the currently opened pack modal by looking for the revealed-card grid inside it.
  function packDialog(page: Page) {
    return page.getByRole('dialog').filter({ has: page.locator('.pack-grid') });
  }

  // Opens the default Base pack and verifies the expected 10-card modal is ready.
  async function openDefaultPack(page: Page) {
    const packButton = openOnePackButton(page);

    await expect(packButton).toBeEnabled({ timeout: 30_000 });
    await packButton.click();
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
  function expansionSetButton(
    page: Page,
    setName: string,
    seriesName: string,
    releaseYear: number
  ) {
    return page.getByRole('button', {
      name: new RegExp(`${setName}\\s+${seriesName}\\s+${releaseYear}`, 'i')
    });
  }

  // Locates the shared top search that supports both expansion names and Pokemon names.
  function expansionSearchInput(page: Page) {
    return page.getByRole('textbox').first();
  }

  // Locates one Pokemon card search result by card name and expansion set.
  function pokemonCardResultButton(page: Page, cardName: string, setName: string) {
    return page.getByRole('button', {
      name: new RegExp(`${cardName}\\s+${setName}`, 'i')
    });
  }

  // Locates visible expansion-set tiles, which include a release year in their accessible name.
  function expansionSetButtons(page: Page) {
    return page.getByRole('button', { name: /\b\d{4}\b/ });
  }

  test.describe('TCG simulator station', () => {
    test.describe('Session', () => {
      // Verifies the simulator opens with default Base controls and an empty binder.
      tcgTest('Starts a new session', async ({ page }) => {
        const packButton = openOnePackButton(page);

        await expect(page.getByRole('button', { name: /^base$/i })).toBeEnabled();
        await expect(page.getByRole('button', { name: /^open 10 packs$/i })).toBeEnabled();
        await expect(page.getByRole('button', { name: /^open random pack$/i })).toBeEnabled();
        await expect(packButton).toBeEnabled();
        expect(await getCollectionProgress(page, 'Base', 102)).toBe(0);
        await expect(page.getByRole('heading', { name: /^binder$/i })).toBeVisible();
      });
    });

    test.describe('Pack opening', () => {
      test.describe.configure({ timeout: 60_000 });

      test.describe('CI WebKit flaky pack opening coverage', () => {
        skipOnCiWebkit();

        // Verifies a single default Base pack reveals 10 cards and updates binder progress.
        tcgTest('Opens default pack - Base', async ({ page }) => {
          await openDefaultPack(page);

          const newBadges = page.locator('.new-card-badge');
          await expect(newBadges.first()).toBeVisible();
          const newBadgeCount = await newBadges.count();
          expect(newBadgeCount).toBeGreaterThan(0);
          expect(newBadgeCount).toBeLessThanOrEqual(10);
          for (let i = 0; i < newBadgeCount; i++) {
            await expect(newBadges.nth(i)).toBeVisible();
          }
          await page.getByRole('button', { name: /^close$/i }).click();

          const baseProgress = await getCollectionProgress(page, 'Base', 102);
          expect(baseProgress).toBeGreaterThan(0);
          expect(baseProgress).toBeLessThanOrEqual(102);
          await expect(page.getByRole('button', { name: 'Clear This Binder' })).toBeEnabled();
        });

        // Verifies a god pack reveals 10 cards and every revealed card is marked holo.
        tcgTest('Open god pack', async ({ page }) => {
          await page.getByRole('button', { name: /^open god pack$/i }).click();

          const openedPack = page.locator('.pack-grid');
          await expect(openedPack).toBeVisible();
          await expectRevealedCardsWithImageSrc(page, 10);
          await expect(openedPack.locator('.holo-overlay')).toHaveCount(10);
        });
      });

      // Verifies the multi-pack action reveals 100 cards and enables binder clearing.
      tcgTest('Open 10 packs', async ({ page }) => {
        await page.getByRole('button', { name: /^open 10 packs$/i }).click();

        await expect(page.locator('.pack-grid')).toBeVisible();
        await expectRevealedCardsWithImageSrc(page, 100);

        await page.getByRole('button', { name: /^close$/i }).click();
        await expect(page.getByRole('button', { name: 'Clear This Binder' })).toBeEnabled();
      });

      // Verifies a god pack still contributes unique cards to the selected binder.
      tcgTest('Open god pack updates binder progress', async ({ page }) => {
        await page.getByRole('button', { name: /^open god pack$/i }).click();
        await expectRevealedCardsWithImageSrc(page, 10);
        await page.getByRole('button', { name: /^close$/i }).click();

        const baseProgress = await getCollectionProgress(page, 'Base', 102);
        expect(baseProgress).toBeGreaterThan(0);
        expect(baseProgress).toBeLessThanOrEqual(102);
      });

      // Verifies the random-pack action opens a pack with a visible set logo and 10 cards.
      tcgTest('Open random pack', async ({ page }) => {
        await page.getByRole('button', { name: /^open random pack$/i }).click();

        await expect(page.locator('.pack-grid')).toBeVisible();
        await expectRevealedCardsWithImageSrc(page, 10);
        await expect(page.locator('.pack-set-logo')).toBeVisible();
        await expect(page.getByRole('button', { name: /^close$/i })).toBeVisible();
      });

      // Verifies random-pack pulls are stored against the actual random set that opened.
      tcgTest('Open random pack stores cards for the opened set', async ({ page }) => {
        await page.getByRole('button', { name: /^open random pack$/i }).click();

        const openedSetName = (
          (await page.locator('.pack-set-logo').getAttribute('alt')) ?? ''
        ).replace(/\s+logo$/i, '');
        expect(openedSetName).toBeTruthy();

        await page.getByRole('button', { name: /^close$/i }).click();

        // The visible binder stays on Base, so persisted collection data is the source of truth here.
        const storedSetNames = await page.evaluate(() => {
          const collection = JSON.parse(
            localStorage.getItem('pokemon-pack-simulator-collection') ?? '{}'
          );

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
      tcgTest('Close hides the pack modal and grid', async ({ page }) => {
        const dialog = await openDefaultPack(page);

        await page.getByRole('button', { name: /^close$/i }).click();

        await expect(dialog).toBeHidden();
        await expect(page.locator('.pack-grid')).toBeHidden();
      });
    });

    test.describe('Binder', () => {
      test.describe('CI WebKit flaky binder coverage', () => {
        skipOnCiWebkit();

        // Verifies Base and Fossil progress are tracked independently as packs are opened.
        tcgTest('Binder collection update for selected set', async ({ page }) => {
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
          expect(await getCollectionProgress(page, 'Base', 102)).toBe(
            baseProgressAfterOpeningPacks
          );

          await page.getByRole('button', { name: /fossil/i }).click();
          expect(await getCollectionProgress(page, 'Fossil', 62)).toBe(
            fossilProgressAfterOpeningPacks
          );
        });

        // Verifies confirming "Clear This Binder" resets only the selected Base binder.
        tcgTest('Clear binder collection - Base', async ({ page }) => {
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
      });

      // Verifies a fully seeded Base binder remains capped after opening more packs.
      tcgTest('Base binder progress never exceeds total unique cards', async ({ page }) => {
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
      tcgTest('Collection does not exceed total unique cards', async ({ page }) => {
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

      // Verifies canceling the selected-binder clear dialog preserves Base progress.
      tcgTest('Cancel clear binder leaves selected binder unchanged', async ({ page }) => {
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
      tcgTest('Clear all binders', async ({ page }) => {
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
      tcgTest('Cancel clear all binders leaves every binder unchanged', async ({ page }) => {
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
      tcgTest(
        'Opening a pack persists binder progress after closing and reopening the page',
        async ({ context, page }) => {
          await openDefaultPack(page);
          await page.getByRole('button', { name: /^close$/i }).click();

          const baseProgress = await getCollectionProgress(page, 'Base', 102);
          expect(baseProgress).toBeGreaterThan(0);

          await page.close();
          // A new page in the same browser context should still see the persisted localStorage collection.
          const reloadedPage = await context.newPage();
          await openTcgSimulator(reloadedPage);

          expect(await getCollectionProgress(reloadedPage, 'Base', 102)).toBe(baseProgress);
        }
      );

      // Verifies cleared binder progress remains cleared after a reload.
      tcgTest('Cleared binder stays cleared after reload', async ({ page }) => {
        await openDefaultPack(page);
        await page.getByRole('button', { name: /^close$/i }).click();

        await clearSelectedBinderIfNeeded(page, 'Base', 102);
        expect(await getCollectionProgress(page, 'Base', 102)).toBe(0);

        await page.reload();
        await page.getByRole('button', { name: /pokemon tcg simulator/i }).click();

        expect(await getCollectionProgress(page, 'Base', 102)).toBe(0);
      });

      // Verifies duplicate copies increase owned count while unique-card progress counts only one card.
      tcgTest(
        'Duplicate cards increase owned count without increasing unique progress',
        async ({ page }) => {
          // Seed one Base card with count 2 to separate "owned copies" from unique progress.
          await seedDuplicatedBaseCard(page);
          await page.reload();
          await page.getByRole('button', { name: /pokemon tcg simulator/i }).click();

          expect(await getCollectionProgress(page, 'Base', 102)).toBe(1);
          await expect(page.getByLabel('Collection binder')).toContainText(/AbraOwned x 2/);
        }
      );

      // Verifies binder-card search filters the card list within the selected set.
      tcgTest('Binder card search filters cards within selected set', async ({ page }) => {
        await page.getByPlaceholder('Search Pokemon in this set...').fill('pika');

        await expect(page.getByText('PIKACHU')).toBeVisible();
        await expect(page.getByText('ABRA')).toBeHidden();
      });

      // Verifies invalid binder-card search hides card rows without affecting binder progress.
      tcgTest('Binder card search invalid term shows no cards', async ({ page }) => {
        await page.getByPlaceholder('Search Pokemon in this set...').fill('not-a-card');

        await expect(page.getByText('PIKACHU')).toBeHidden();
        await expect(page.getByText('ABRA')).toBeHidden();
        expect(await getCollectionProgress(page, 'Base', 102)).toBe(0);
      });

      // Verifies clearing binder-card search restores the selected set's full card list.
      tcgTest('Clearing binder card search restores all binder cards', async ({ page }) => {
        await page.getByPlaceholder('Search Pokemon in this set...').fill('pika');
        await expect(page.getByText('PIKACHU')).toBeVisible();
        await expect(page.getByText('ABRA')).toBeHidden();

        await page.getByPlaceholder('Search Pokemon in this set...').fill('');

        await expect(page.getByText('PIKACHU')).toBeVisible();
        await expect(page.getByText(/^ABRA$/i)).toBeVisible();
      });
    });

    test.describe('Set selection', () => {
      // Verifies choosing Jungle updates the binder and opens a Jungle pack.
      tcgTest('Select set by name', async ({ page }) => {
        await page.getByRole('button', { name: /jungle/i }).click();

        expect(await getCollectionProgress(page, 'Jungle', 64)).toBe(0);
        await expect(page.getByRole('button', { name: /^open 1 pack$/i })).toBeEnabled();

        await page.getByRole('button', { name: /^open 1 pack$/i }).click();

        await expect(page.locator('.pack-set-logo')).toHaveAttribute('alt', /^Jungle logo$/);
        await expectRevealedCardsWithImageSrc(page, 10);
      });

      // Verifies sort options reorder the visible expansion-set tiles.
      tcgTest('Sort sets by newest and by name', async ({ page }) => {
        // Newest-first should surface a 2026 set before older releases.
        await page.getByRole('combobox').selectOption({ label: 'Release year: newest first' });
        await expect(expansionSetButtons(page).first()).toContainText('2026');

        // Name sorting puts the numeric "151" expansion first.
        await page.getByRole('combobox').selectOption({ label: 'Name: A to Z' });
        await expect(expansionSetButtons(page).first()).toContainText(/^151/);
      });

      // Verifies selecting a series category filters out sets from other series.
      tcgTest('Series filter only shows matching sets', async ({ page }) => {
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

      // Verifies sorting a filtered category keeps the category filter applied.
      tcgTest('Sort sets while series filter is active', async ({ page }) => {
        await page.getByRole('button', { name: /^sun & moon$/i }).click();
        await page.getByRole('combobox').selectOption({ label: 'Release year: newest first' });

        const visibleSetTexts = await expansionSetButtons(page).evaluateAll((buttons) =>
          buttons.map((button) => button.textContent ?? '')
        );

        expect(visibleSetTexts.length).toBeGreaterThan(0);
        for (const visibleSetText of visibleSetTexts) {
          expect(visibleSetText.toUpperCase()).toContain('SUN & MOON');
        }
      });
    });

    test.describe('Search', () => {
      // Verifies expansion search narrows results and the selected result controls the opened pack.
      tcgTest('Search valid set', async ({ page }) => {
        const teamUpSet = expansionSetButton(page, 'Team Up', 'Sun & Moon', 2019);

        await expansionSearchInput(page).fill('Team up');
        await expect(teamUpSet).toBeVisible();
        await expect(expansionSetButton(page, 'Base', 'Base', 1999)).toBeHidden();

        await teamUpSet.click();

        await expect(page.getByLabel('Collection binder')).toContainText(
          'Team Up collection progress: 0 / 198 unique cards'
        );
        await page.getByRole('button', { name: 'Open 1 Pack' }).click();
        await expect(
          page.getByRole('dialog').getByRole('img', { name: 'Team Up logo' })
        ).toBeVisible();
        await expect(page.locator('.pack-grid')).toBeVisible();
        await expectRevealedCardsWithImageSrc(page, 10);
      });

      // Verifies an unmatched expansion search displays no expansion-set tiles.
      tcgTest('Search invalid set', async ({ page }) => {
        await expansionSearchInput(page).fill('Invalid');

        await expect(expansionSetButtons(page)).toHaveCount(0);
      });

      // Verifies an empty expansion search keeps the full set list visible.
      tcgTest('Search empty set keeps all sets visible', async ({ page }) => {
        await expansionSearchInput(page).fill('');

        await expect(expansionSetButton(page, 'Base', 'Base', 1999)).toBeVisible();
        await expect(expansionSetButton(page, 'Jungle', 'Base', 1999)).toBeVisible();
        await expect(expansionSetButton(page, 'Fossil', 'Base', 1999)).toBeVisible();
      });

      // Verifies special characters in expansion search fail safely by leaving the set list usable.
      tcgTest('Search special characters keeps all sets visible', async ({ page }) => {
        await expansionSearchInput(page).fill('@@@');

        await expect(expansionSearchInput(page)).toHaveValue('@@@');
        await expect(expansionSetButton(page, 'Base', 'Base', 1999)).toBeVisible();
        await expect(expansionSetButton(page, 'Jungle', 'Base', 1999)).toBeVisible();
        await expect(expansionSetButton(page, 'Fossil', 'Base', 1999)).toBeVisible();
      });

      // Verifies expansion search ignores case and supports partial search text.
      tcgTest('Search set is case-insensitive and supports partial matches', async ({ page }) => {
        await expansionSearchInput(page).fill('team');

        await expect(expansionSetButton(page, 'Team Up', 'Sun & Moon', 2019)).toBeVisible();
        await expect(expansionSetButton(page, 'Team Rocket', 'Base', 2000)).toBeVisible();
        await expect(expansionSetButton(page, 'Base', 'Base', 1999)).toBeHidden();
      });

      // Verifies clearing expansion search restores the full set list.
      tcgTest('Clear set', async ({ page }) => {
        await expansionSearchInput(page).fill('Team up');
        await expect(expansionSetButton(page, 'Team Up', 'Sun & Moon', 2019)).toBeVisible();
        await expect(expansionSetButton(page, 'Base', 'Base', 1999)).toBeHidden();

        await page.getByRole('button', { name: 'Clear expansion search' }).click();

        await expect(expansionSearchInput(page)).toHaveValue('');
        await expect(expansionSetButton(page, 'Base', 'Base', 1999)).toBeVisible();
        await expect(expansionSetButton(page, 'Jungle', 'Base', 1999)).toBeVisible();
        await expect(expansionSetButton(page, 'Fossil', 'Base', 1999)).toBeVisible();
      });

      // Verifies clearing an invalid expansion search recovers from the empty result state.
      tcgTest('Clear invalid set search restores set list', async ({ page }) => {
        await expansionSearchInput(page).fill('Invalid');
        await expect(expansionSetButtons(page)).toHaveCount(0);

        await page.getByRole('button', { name: 'Clear expansion search' }).click();

        await expect(expansionSearchInput(page)).toHaveValue('');
        await expect(expansionSetButton(page, 'Base', 'Base', 1999)).toBeVisible();
        await expect(expansionSetButton(page, 'Jungle', 'Base', 1999)).toBeVisible();
        await expect(expansionSetButton(page, 'Fossil', 'Base', 1999)).toBeVisible();
      });

      // Verifies clearing the search input does not reset the currently selected expansion.
      tcgTest(
        'Selecting a set from search keeps that set active after clearing search',
        async ({ page }) => {
          await expansionSearchInput(page).fill('Team up');
          await expansionSetButton(page, 'Team Up', 'Sun & Moon', 2019).click();

          expect(await getCollectionProgress(page, 'Team Up', 198)).toBe(0);

          await page.getByRole('button', { name: 'Clear expansion search' }).click();

          // The full list returns, but the binder and pack controls should remain on Team Up.
          await expect(expansionSetButton(page, 'Base', 'Base', 1999)).toBeVisible();
          expect(await getCollectionProgress(page, 'Team Up', 198)).toBe(0);
          await expect(page.getByRole('button', { name: /^open 1 pack$/i })).toBeEnabled();
        }
      );

      // Verifies expansion search respects the currently selected series filter.
      tcgTest('Search set while series filter is active', async ({ page }) => {
        await page.getByRole('button', { name: /^sun & moon$/i }).click();
        await expansionSearchInput(page).fill('team');

        await expect(expansionSetButton(page, 'Team Up', 'Sun & Moon', 2019)).toBeVisible();
        await expect(expansionSetButton(page, 'Team Rocket', 'Base', 2000)).toBeHidden();
      });

      // Verifies sorting a searched result set keeps the search filter active.
      tcgTest('Sort sets while search is active', async ({ page }) => {
        await expansionSearchInput(page).fill('Team up');
        await page.getByRole('combobox').selectOption({ label: 'Name: A to Z' });

        await expect(expansionSearchInput(page)).toHaveValue('Team up');
        await expect(expansionSetButton(page, 'Team Up', 'Sun & Moon', 2019)).toBeVisible();
        await expect(expansionSetButton(page, 'Base', 'Base', 1999)).toBeHidden();
      });

      // Verifies Pokemon search narrows expansion tiles to sets that contain that Pokemon.
      tcgTest('Search by Pokemon lists sets containing that Pokemon', async ({ page }) => {
        await expansionSearchInput(page).fill('Sirfetchd');

        await expect(page.getByText('4 cards found for Sirfetchd')).toBeVisible();
        await expect(expansionSetButton(page, 'Rebel Clash', 'Sword & Shield', 2020)).toBeVisible();
        await expect(
          expansionSetButton(page, 'Darkness Ablaze', 'Sword & Shield', 2020)
        ).toBeVisible();
        await expect(
          expansionSetButton(page, 'Vivid Voltage', 'Sword & Shield', 2020)
        ).toBeVisible();
        await expect(
          expansionSetButton(page, 'Chilling Reign', 'Sword & Shield', 2021)
        ).toBeVisible();
        await expect(expansionSetButton(page, 'Base', 'Base', 1999)).toBeHidden();
      });

      // Verifies Pokemon search renders matching card results grouped with their source set.
      tcgTest('Search by Pokemon lists matching cards', async ({ page }) => {
        await expansionSearchInput(page).fill('Sirfetchd');

        await expect(
          pokemonCardResultButton(page, "Galarian Sirfetch'd", 'Rebel Clash')
        ).toBeVisible();
        await expect(
          pokemonCardResultButton(page, "Galarian Sirfetch'd V", 'Vivid Voltage')
        ).toBeVisible();
      });

      // Verifies choosing a Pokemon search card opens that selected card from its set.
      tcgTest(
        'Selecting a Pokemon search result opens the selected card detail',
        async ({ page }) => {
          await expansionSearchInput(page).fill('Sirfetchd');

          const rebelClashResult = pokemonCardResultButton(
            page,
            "Galarian Sirfetch'd",
            'Rebel Clash'
          );

          await expect(rebelClashResult).toBeVisible();
          await rebelClashResult.click();

          await expect(page.getByText('REBEL CLASH').last()).toBeVisible();
          await expect(page.getByText("GALARIAN SIRFETCH'D").last()).toBeVisible();
          await expect(page.getByText('RARITY')).toBeVisible();
          await expect(page.getByText('Rare Holo')).toBeVisible();
          await expect(page.getByText('Meteor Assault -')).toBeVisible();
        }
      );
    });
  });
});
