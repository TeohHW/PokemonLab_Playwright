import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/test';
import { homeStationButton } from '../pages/HomePage';
import { installPokeApiRetries } from '../utils/network';

test.describe('@live Pokemon Team Planner', () => {
  test.describe.configure({ timeout: 60_000 });

  const teamPlannerStorageKey = 'pokemon-team-planner-saved-team';
  const teamPlannerLibraryKey = 'pokemon-team-planner-library-v1';

  async function openTeamPlanner(page: Page) {
    await installPokeApiRetries(page);
    await page.goto('/');
    await page.evaluate(
      ([snapshotKey, libraryKey]) => {
        localStorage.removeItem(snapshotKey);
        localStorage.removeItem(libraryKey);
      },
      [teamPlannerStorageKey, teamPlannerLibraryKey]
    );
    await homeStationButton(page, 'team').click();

    await expect(page.getByRole('heading', { name: /pokemon team planner/i })).toBeVisible();
    await expect(page.getByRole('combobox', { name: /game pokedex/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^fill from meta$/i })).toBeEnabled({
      timeout: 30_000
    });
    await expect(page.getByRole('button', { name: /^fill randomly$/i })).toBeEnabled();
    await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeVisible();
  }

  const teamPlannerTest = test.extend<{ openTeamPlannerStation: void }>({
    openTeamPlannerStation: [
      async ({ page }, use) => {
        await openTeamPlanner(page);
        await use();

        if (!page.isClosed()) {
          await page
            .evaluate(
              ([snapshotKey, libraryKey]) => {
                localStorage.removeItem(snapshotKey);
                localStorage.removeItem(libraryKey);
              },
              [teamPlannerStorageKey, teamPlannerLibraryKey]
            )
            .catch(() => {});
        }
      },
      { auto: true }
    ]
  });

  function pokemonListButton(page: Page, pokedexNumber: number, pokemonName: string) {
    const paddedNumber = String(pokedexNumber).padStart(3, '0');

    return page.getByRole('button', {
      name: new RegExp(`#${paddedNumber}\\s+${pokemonName}`, 'i')
    });
  }

  function pokemonListButtons(page: Page) {
    return page.getByLabel('Pokemon team choices').getByRole('button');
  }

  function gamePokedexSelect(page: Page) {
    return page.getByRole('combobox', { name: /game pokedex/i });
  }

  function battleFormatSelect(page: Page) {
    return page.getByRole('combobox', { name: /battle format/i });
  }

  function sortPokemonSelect(page: Page) {
    return page.getByRole('combobox', { name: /sort pokemon/i });
  }

  function teamSlots(page: Page) {
    return page.getByRole('region', { name: /team slots/i });
  }

  function occupiedTeamCards(page: Page) {
    return teamSlots(page)
      .getByRole('article')
      .filter({
        has: page.getByRole('button', { name: /^remove /i })
      });
  }

  function teamCard(page: Page, pokemonName: string) {
    return teamSlots(page)
      .getByRole('article')
      .filter({
        has: page.getByRole('heading', { name: new RegExp(`^${pokemonName}$`, 'i') })
      });
  }

  function moveSelect(page: Page, moveNumber: number) {
    return page.getByRole('combobox', { name: new RegExp(`^move ${moveNumber}$`, 'i') });
  }

  function scorePanel(page: Page) {
    return page.getByLabel(/team guidance score \d+ out of 100/i);
  }

  function recommendationButtons(page: Page) {
    return page.getByRole('button', { name: /^add recommendation$/i });
  }

  async function showPlannerView(page: Page, view: 'Build' | 'Analysis') {
    const viewButton = page.getByLabel('Team planner view').getByRole('button', {
      name: new RegExp(`^${view}$`, 'i')
    });
    await viewButton.click();
    await expect(viewButton).toHaveAttribute('aria-pressed', 'true');
  }

  async function openBuildOptions(page: Page, pokemonName: string) {
    const disclosure = teamCard(page, pokemonName).locator('details.team-member-build-disclosure');

    if (!(await disclosure.getAttribute('open'))) {
      await disclosure.locator('summary').click();
    }
    await expect(disclosure).toHaveAttribute('open', '');
  }

  async function visiblePokemonNames(page: Page) {
    return pokemonListButtons(page).evaluateAll((buttons) =>
      buttons
        .filter((button) => {
          const style = window.getComputedStyle(button);
          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            button.getClientRects().length > 0
          );
        })
        .map((button) => (button.textContent ?? '').replace(/^#\d+\s*/, '').trim())
    );
  }

  async function addPokemon(page: Page, pokedexNumber: number, pokemonName: string) {
    const button = pokemonListButton(page, pokedexNumber, pokemonName);
    await expect(button).toBeVisible();
    await button.click();
    await expect(
      page.getByRole('button', { name: new RegExp(`^remove ${pokemonName}`, 'i') })
    ).toBeVisible();
  }

  async function clearClientCaches(page: Page) {
    await page.goto('/');
    await page.evaluate(async () => {
      localStorage.clear();
      sessionStorage.clear();

      const databases = (await indexedDB.databases?.()) ?? [];
      await Promise.all(
        databases.map(
          (database) =>
            new Promise<void>((resolve, reject) => {
              if (!database.name) {
                resolve();
                return;
              }

              const deletion = indexedDB.deleteDatabase(database.name);
              deletion.onsuccess = () => resolve();
              deletion.onerror = () => reject(deletion.error);
              deletion.onblocked = () => reject(new Error(`Unable to clear ${database.name}`));
            })
        )
      );

      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
    });
  }

  test.describe('Station / Initial Load', () => {
    // Verifies the scenario: Starts with the complete planning workspace.
    teamPlannerTest('Starts with the complete planning workspace', async ({ page }) => {
      await expect(gamePokedexSelect(page)).toHaveValue('all');
      await expect(battleFormatSelect(page)).toHaveValue('open');
      await expect(sortPokemonSelect(page)).toHaveValue('entry');
      await expect(page.getByRole('searchbox', { name: 'Pokemon' })).toBeVisible();
      await expect(page.getByText('0/6 selected')).toBeVisible();
      await expect(page.getByRole('button', { name: /^save team$/i })).toBeDisabled();
      await expect(page.getByText('0/12 saved teams')).toBeVisible();
      await expect(page.getByRole('button', { name: /^fill from meta$/i })).toBeEnabled();
      await expect(page.getByRole('button', { name: /^fill randomly$/i })).toBeEnabled();
      await expect(page.getByRole('button', { name: /^remove all$/i })).toBeDisabled();
      await expect(page.getByRole('combobox', { name: /world champion team/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /^fill champion team$/i })).toBeEnabled();
      await expect(page.getByLabel('Team Pokemon pages')).toContainText('Page 1 / 43');
      await expect(pokemonListButtons(page)).toHaveCount(24);
      await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeVisible();
      await expect(pokemonListButton(page, 24, 'Arbok')).toBeVisible();
      await expect(teamSlots(page).getByRole('article')).toHaveCount(6);
    });

    // Verifies the scenario: Starts the assistant and analysis in an empty state.
    teamPlannerTest('Starts the assistant and analysis in an empty state', async ({ page }) => {
      await showPlannerView(page, 'Analysis');
      await expect(page.getByRole('heading', { name: /^team-building assistant$/i })).toBeVisible();
      await expect(page.getByLabel('Team guidance score 0 out of 100')).toBeVisible();
      await expect(page.getByLabel('Team score factors').getByRole('meter')).toHaveCount(6);
      await expect(page.getByRole('heading', { name: /^team functions$/i })).toBeVisible();
      await expect(page.getByText('Not currently covered')).toHaveCount(6);
      await expect(page.getByRole('heading', { name: /^recommended next picks$/i })).toBeVisible();
      await expect(recommendationButtons(page)).toHaveCount(4);
      await expect(page.getByRole('heading', { name: /^move profile$/i })).toBeVisible();
      await expect(page.getByRole('heading', { name: /^coverage strengths$/i })).toBeVisible();
      await expect(page.getByRole('heading', { name: /^coverage gaps$/i })).toBeVisible();
    });

    teamPlannerTest('Build and Analysis tabs separate editing from guidance', async ({ page }) => {
      const tabs = page.getByLabel('Team planner view');
      await expect(tabs).toHaveCSS('border-top-width', '0px');
      await expect(tabs.getByRole('button', { name: /^build$/i })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      await expect(teamSlots(page)).toBeVisible();
      await expect(page.getByRole('heading', { name: /^team-building assistant$/i })).toHaveCount(
        0
      );

      await showPlannerView(page, 'Analysis');
      await expect(teamSlots(page)).toHaveCount(0);
      await expect(page.getByRole('heading', { name: /^team-building assistant$/i })).toBeVisible();
    });

    teamPlannerTest(
      'Member build options start collapsed and toggle from the keyboard',
      async ({ page }) => {
        await addPokemon(page, 1, 'Bulbasaur');
        const disclosure = teamCard(page, 'Bulbasaur').locator(
          'details.team-member-build-disclosure'
        );
        const summary = disclosure.locator('summary');

        await expect(disclosure).not.toHaveAttribute('open', '');
        await expect(moveSelect(page, 1)).toBeHidden();
        await summary.focus();
        await summary.press('Enter');
        await expect(disclosure).toHaveAttribute('open', '');
        await expect(moveSelect(page, 1)).toBeVisible();
        await summary.press('Space');
        await expect(disclosure).not.toHaveAttribute('open', '');
      }
    );

    // Verifies the scenario: Navigates paged Pokemon results in both directions.
    teamPlannerTest('Navigates paged Pokemon results in both directions', async ({ page }) => {
      const pager = page.getByLabel('Team Pokemon pages');
      const previousButton = pager.getByRole('button', { name: /^prev$/i });
      const nextButton = pager.getByRole('button', { name: /^next$/i });

      await expect(previousButton).toBeDisabled();
      await nextButton.click();
      await expect(pager).toContainText('Page 2 / 43');
      await expect(previousButton).toBeEnabled();
      await expect(pokemonListButton(page, 25, 'Pikachu')).toBeVisible();
      await expect(pokemonListButton(page, 48, 'Venonat')).toBeVisible();

      await previousButton.click();
      await expect(pager).toContainText('Page 1 / 43');
      await expect(previousButton).toBeDisabled();
      await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeVisible();
    });

    // Verifies the scenario: Shows a stable shell while Pokemon data is delayed.
    test('Shows a stable shell while Pokemon data is delayed', async ({ page }) => {
      let releaseRequests!: () => void;
      const canContinue = new Promise<void>((resolve) => {
        releaseRequests = resolve;
      });

      await clearClientCaches(page);
      await page.route('**/pokeapi.co/**', async (route) => {
        await canContinue;
        await route.continue();
      });

      await page.goto('/');
      await homeStationButton(page, 'team').click();

      await expect(page.getByRole('heading', { name: /pokemon team planner/i })).toBeVisible();
      await expect(gamePokedexSelect(page)).toBeVisible();
      await expect(battleFormatSelect(page)).toBeVisible();
      await expect(page.getByText('0/6 selected')).toBeVisible();
      await expect(page.getByRole('button', { name: /^remove all$/i })).toBeDisabled();
      await expect(pokemonListButtons(page)).toHaveCount(0);

      releaseRequests();
      await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeVisible({ timeout: 30_000 });
    });

    // Verifies mobile slot selection shows one populated member while desktop retains all six slots.
    test('Adapts the planner workspace across web and mobile viewports', async ({ page }) => {
      const mobileSlotSelector = page.getByRole('navigation', {
        name: 'Choose a Pokemon team slot'
      });

      await page.setViewportSize({ width: 1024, height: 900 });
      await openTeamPlanner(page);

      await expect(page.locator('.team-planner-layout')).toHaveCSS(
        'grid-template-columns',
        /\d+(?:\.\d+)?px \d+(?:\.\d+)?px/
      );
      await expect(mobileSlotSelector).toBeHidden();
      await addPokemon(page, 1, 'Bulbasaur');
      await addPokemon(page, 2, 'Ivysaur');
      await expect(occupiedTeamCards(page)).toHaveCount(2);
      await expect(page.locator('.team-slot-grid .team-member-card:visible')).toHaveCount(6);

      await page.setViewportSize({ width: 390, height: 844 });

      await page.getByRole('button', { name: /^show team controls$/i }).click();
      await expect(page.getByRole('searchbox', { name: 'Pokemon' })).toBeVisible();
      await expect(gamePokedexSelect(page)).toBeVisible();
      await expect(battleFormatSelect(page)).toBeVisible();
      await expect(page.getByRole('button', { name: /^fill randomly$/i })).toBeEnabled();
      await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeVisible();
      await expect(page.locator('.team-planner-layout')).toHaveCSS(
        'grid-template-columns',
        /^\d+(?:\.\d+)?px$/
      );
      await expect(page.locator('.team-pokemon-list')).toHaveCSS(
        'grid-template-columns',
        /\d+(?:\.\d+)?px \d+(?:\.\d+)?px/
      );
      await expect(page.locator('.team-slot-grid')).toHaveCSS(
        'grid-template-columns',
        /^\d+(?:\.\d+)?px$/
      );
      await expect(page.locator('.team-save-row')).toHaveCSS(
        'grid-template-columns',
        /^(?:\d+(?:\.\d+)?px|1fr)$/
      );

      const slotButtons = mobileSlotSelector.getByRole('button');
      const bulbasaurSlot = mobileSlotSelector.getByRole('button', {
        name: 'Show slot 1: Bulbasaur'
      });
      const ivysaurSlot = mobileSlotSelector.getByRole('button', {
        name: 'Show slot 2: Ivysaur'
      });
      await expect(mobileSlotSelector).toBeVisible();
      await expect(mobileSlotSelector).toHaveCSS('position', 'sticky');
      await expect(slotButtons).toHaveCount(2);
      await expect(bulbasaurSlot).toHaveAttribute('aria-pressed', 'true');
      await expect(teamCard(page, 'Bulbasaur')).toBeVisible();
      await expect(teamCard(page, 'Ivysaur')).toBeHidden();
      await expect(page.locator('.team-slot-grid .team-member-card:visible')).toHaveCount(1);
      await expect(page.locator('.team-slot-grid .team-member-card.is-empty')).toHaveCount(4);
      await expect(page.locator('.team-slot-grid .team-member-card.is-empty:visible')).toHaveCount(
        0
      );

      await ivysaurSlot.click();
      await expect(ivysaurSlot).toHaveAttribute('aria-pressed', 'true');
      await expect(teamCard(page, 'Bulbasaur')).toBeHidden();
      await expect(teamCard(page, 'Ivysaur')).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
        )
      ).toBeTruthy();

      await page.setViewportSize({ width: 1024, height: 900 });
      await expect(mobileSlotSelector).toBeHidden();
      await expect(teamCard(page, 'Bulbasaur')).toBeVisible();
      await expect(teamCard(page, 'Ivysaur')).toBeVisible();
      await expect(page.locator('.team-slot-grid .team-member-card:visible')).toHaveCount(6);
    });
  });

  test.describe('Filtering / Sorting / Pokedex', () => {
    // Verifies the scenario: Searches by Pokemon name case-insensitively.
    teamPlannerTest('Searches by Pokemon name case-insensitively', async ({ page }) => {
      await page.getByRole('searchbox', { name: 'Pokemon' }).fill('pIkAcHu');
      await expect(pokemonListButton(page, 25, 'Pikachu')).toBeVisible();
      await expect(pokemonListButtons(page)).toHaveCount(1);
    });

    // Verifies the scenario: Searches by Pokedex number.
    teamPlannerTest('Searches by Pokedex number', async ({ page }) => {
      await page.getByRole('searchbox', { name: 'Pokemon' }).fill('25');
      await expect(pokemonListButton(page, 25, 'Pikachu')).toBeVisible();
      await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeHidden();
    });

    // Verifies the scenario: Invalid search reaches a safe empty state.
    teamPlannerTest('Invalid search reaches a safe empty state', async ({ page }) => {
      await page.getByRole('searchbox', { name: 'Pokemon' }).fill('not-a-real-pokemon');
      await expect(pokemonListButtons(page)).toHaveCount(0);
      await expect(page.getByLabel('Pokemon team choices')).toContainText(
        'No Pokemon match this search.'
      );
      await expect(page.getByText('0/6 selected')).toBeVisible();
    });

    // Verifies the scenario: Clearing search restores the first result page.
    teamPlannerTest('Clearing search restores the first result page', async ({ page }) => {
      const search = page.getByRole('searchbox', { name: 'Pokemon' });
      await search.fill('Pikachu');
      await expect(pokemonListButtons(page)).toHaveCount(1);
      await search.clear();
      await expect(pokemonListButtons(page)).toHaveCount(24);
      await expect(page.getByLabel('Team Pokemon pages')).toContainText('Page 1 / 43');
    });

    // Verifies the scenario: Sorts the visible Pokemon alphabetically.
    teamPlannerTest('Sorts the visible Pokemon alphabetically', async ({ page }) => {
      await sortPokemonSelect(page).selectOption({ label: 'Name' });
      await expect(sortPokemonSelect(page)).toHaveValue('name');
      const expected = [...(await visiblePokemonNames(page))].sort((a, b) => a.localeCompare(b));
      await expect.poll(() => visiblePokemonNames(page)).toEqual(expected);
    });

    // Verifies the scenario: Exposes type, legendary, and base-stat sorting choices.
    teamPlannerTest('Exposes type, legendary, and base-stat sorting choices', async ({ page }) => {
      const labels = await sortPokemonSelect(page).locator('option').allTextContents();
      expect(labels).toEqual(
        expect.arrayContaining([
          'Type',
          'Legendary',
          'HP',
          'Attack',
          'Defense',
          'Sp. Atk',
          'Sp. Def',
          'Speed'
        ])
      );
    });

    // Verifies the scenario: Scopes browsing and search to the selected game Pokedex.
    teamPlannerTest('Scopes browsing and search to the selected game Pokedex', async ({ page }) => {
      await gamePokedexSelect(page).selectOption({ label: 'Ruby / Sapphire / Emerald' });
      await expect(pokemonListButton(page, 1, 'Treecko')).toBeVisible();
      await expect(pokemonListButton(page, 4, 'Torchic')).toBeVisible();
      await expect(pokemonListButton(page, 7, 'Mudkip')).toBeVisible();

      await page.getByRole('searchbox', { name: 'Pokemon' }).fill('Bulbasaur');
      await expect(pokemonListButtons(page)).toHaveCount(0);
      await expect(page.getByLabel('Pokemon team choices')).toContainText(
        'No Pokemon match this search.'
      );
    });

    // Verifies the scenario: Changing game Pokedex preserves an in-progress team.
    teamPlannerTest('Changing game Pokedex preserves an in-progress team', async ({ page }) => {
      await addPokemon(page, 1, 'Bulbasaur');
      await gamePokedexSelect(page).selectOption({ label: 'Ruby / Sapphire / Emerald' });

      await expect(page.getByText('1/6 selected')).toBeVisible();
      await expect(page.getByRole('button', { name: /^remove bulbasaur$/i })).toBeVisible();
      await expect(pokemonListButton(page, 1, 'Treecko')).toBeVisible();
    });

    // Verifies the scenario: Supports the Legends Z-A Pokedex profile.
    teamPlannerTest('Supports the Legends Z-A Pokedex profile', async ({ page }) => {
      await gamePokedexSelect(page).selectOption({ label: 'Legends: Z-A' });
      await expect(gamePokedexSelect(page).locator('option:checked')).toHaveText('Legends: Z-A');
      await expect(page.getByLabel('Team Pokemon pages')).toContainText('Page 1 / 16', {
        timeout: 30_000
      });
      await expect(pokemonListButtons(page)).toHaveCount(24);
      await expect(pokemonListButton(page, 13, 'Weedle')).toBeVisible();
      await expect(pokemonListButton(page, 41, 'Zubat')).toBeVisible();
      await expect(page.getByText(/available in Legends: Z-A/i)).toBeVisible();
    });
  });

  test.describe('Manual and Automatic Team Building', () => {
    // Verifies the scenario: Adds and removes a Pokemon while recomputing the workspace.
    teamPlannerTest(
      'Adds and removes a Pokemon while recomputing the workspace',
      async ({ page }) => {
        await addPokemon(page, 1, 'Bulbasaur');

        await expect(page.getByText('1/6 selected')).toBeVisible();
        await expect(occupiedTeamCards(page)).toHaveCount(1);
        await showPlannerView(page, 'Analysis');
        await expect(scorePanel(page)).not.toHaveAccessibleName('Team guidance score 0 out of 100');
        await expect(page.getByRole('button', { name: /^remove all$/i })).toBeEnabled();

        await showPlannerView(page, 'Build');
        await page.getByRole('button', { name: /^remove bulbasaur$/i }).click();
        await expect(page.getByText('0/6 selected')).toBeVisible();
        await expect(occupiedTeamCards(page)).toHaveCount(0);
        await showPlannerView(page, 'Analysis');
        await expect(page.getByLabel('Team guidance score 0 out of 100')).toBeVisible();
      }
    );

    // Verifies the scenario: Caps manual selection at six Pokemon.
    teamPlannerTest('Caps manual selection at six Pokemon', async ({ page }) => {
      for (const pokemon of [
        [1, 'Bulbasaur'],
        [2, 'Ivysaur'],
        [3, 'Venusaur'],
        [4, 'Charmander'],
        [5, 'Charmeleon'],
        [6, 'Charizard']
      ] as const) {
        await addPokemon(page, pokemon[0], pokemon[1]);
      }

      await expect(page.getByText('6/6 selected')).toBeVisible();
      await expect(occupiedTeamCards(page)).toHaveCount(6);
      await expect(pokemonListButton(page, 7, 'Squirtle')).toBeDisabled();
    });

    // Verifies the scenario: Remove All restores every empty slot.
    teamPlannerTest('Remove All restores every empty slot', async ({ page }) => {
      await addPokemon(page, 1, 'Bulbasaur');
      await addPokemon(page, 4, 'Charmander');
      await page.getByRole('button', { name: /^remove all$/i }).click();

      await expect(page.getByText('0/6 selected')).toBeVisible();
      await expect(occupiedTeamCards(page)).toHaveCount(0);
      await expect(teamSlots(page).getByRole('article')).toHaveCount(6);
      await expect(page.getByRole('button', { name: /^remove all$/i })).toBeDisabled();
    });

    // Verifies the scenario: Open Planning asks before adding a duplicate species.
    teamPlannerTest('Open Planning asks before adding a duplicate species', async ({ page }) => {
      await addPokemon(page, 1, 'Bulbasaur');
      await pokemonListButton(page, 1, 'Bulbasaur').click();

      const dialog = page.getByRole('dialog');
      await expect(dialog.getByRole('heading', { name: /add another bulbasaur/i })).toBeVisible();
      await expect(dialog.getByRole('button', { name: /^keep one$/i })).toBeVisible();
      await expect(dialog.getByRole('button', { name: /^add duplicate$/i })).toBeVisible();

      await dialog.getByRole('button', { name: /^keep one$/i }).click();
      await expect(page.getByText('1/6 selected')).toBeVisible();
    });

    // Verifies the scenario: Can explicitly allow a duplicate in Open Planning.
    teamPlannerTest('Can explicitly allow a duplicate in Open Planning', async ({ page }) => {
      await addPokemon(page, 1, 'Bulbasaur');
      await pokemonListButton(page, 1, 'Bulbasaur').click();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: /^add duplicate$/i })
        .click();

      await expect(page.getByText('2/6 selected')).toBeVisible();
      await expect(page.getByRole('button', { name: /^remove bulbasaur$/i })).toHaveCount(2);
    });

    // Verifies the scenario: Fill Randomly preserves a manual pick and fills remaining slots.
    teamPlannerTest(
      'Fill Randomly preserves a manual pick and fills remaining slots',
      async ({ page }) => {
        await addPokemon(page, 1, 'Bulbasaur');
        await page.getByRole('button', { name: /^fill randomly$/i }).click();

        await expect(page.getByText('6/6 selected')).toBeVisible({ timeout: 30_000 });
        await expect(occupiedTeamCards(page)).toHaveCount(6);
        await expect(page.getByRole('button', { name: /^remove bulbasaur$/i })).toBeVisible();
      }
    );

    // Verifies the scenario: Fill from Meta preserves a manual pick and fills legal candidates.
    teamPlannerTest(
      'Fill from Meta preserves a manual pick and fills legal candidates',
      async ({ page }) => {
        await addPokemon(page, 1, 'Bulbasaur');
        await page.getByRole('button', { name: /^fill from meta$/i }).click();

        await expect(page.getByText('6/6 selected')).toBeVisible({ timeout: 30_000 });
        await expect(occupiedTeamCards(page)).toHaveCount(6);
        await expect(page.getByRole('button', { name: /^remove bulbasaur$/i })).toBeVisible();
        await expect(page.getByText(/cross-format competitive picks/i)).toBeVisible();
      }
    );
  });

  test.describe('Battle Formats and Legality', () => {
    // Verifies the scenario: Shows format-specific guidance and a legal status.
    teamPlannerTest('Shows format-specific guidance and a legal status', async ({ page }) => {
      await addPokemon(page, 1, 'Bulbasaur');
      await battleFormatSelect(page).selectOption({ label: 'Singles — Species Clause' });

      await expect(page.getByText(/one of each species/i)).toBeVisible();
      await expect(page.locator('.team-legality-status')).toHaveText(
        'Team composition is legal for this planner profile.'
      );
      await expect(page.getByText('1/6 selected')).toBeVisible();
    });

    // Verifies the scenario: Switching format reports duplicate issues without rewriting the team.
    teamPlannerTest(
      'Switching format reports duplicate issues without rewriting the team',
      async ({ page }) => {
        await addPokemon(page, 1, 'Bulbasaur');
        await pokemonListButton(page, 1, 'Bulbasaur').click();
        await page
          .getByRole('dialog')
          .getByRole('button', { name: /^add duplicate$/i })
          .click();

        await battleFormatSelect(page).selectOption({ label: 'Singles — Species Clause' });
        await expect(page.getByRole('alert')).toContainText(/legality issue/i);
        await expect(page.getByRole('alert')).toContainText(/appears more than once/i);
        await expect(page.getByText('2/6 selected')).toBeVisible();
        await expect(page.getByRole('button', { name: /^remove bulbasaur$/i })).toHaveCount(2);
      }
    );

    // Verifies the scenario: No Restricted VGC profile disables a restricted Pokemon.
    teamPlannerTest('No Restricted VGC profile disables a restricted Pokemon', async ({ page }) => {
      await battleFormatSelect(page).selectOption({ label: 'VGC Doubles — No Restricted' });
      await page.getByRole('searchbox', { name: 'Pokemon' }).fill('Mewtwo');

      await expect(pokemonListButton(page, 150, 'Mewtwo')).toBeVisible();
      await expect(pokemonListButton(page, 150, 'Mewtwo')).toBeDisabled();
      await expect(pokemonListButton(page, 150, 'Mewtwo')).toHaveAttribute(
        'title',
        /not allowed|restricted/i
      );
    });

    // Verifies the scenario: VGC format reports an existing Mega form without silently changing it.
    teamPlannerTest(
      'VGC format reports an existing Mega form without silently changing it',
      async ({ page }) => {
        await addPokemon(page, 6, 'Charizard');
        await openBuildOptions(page, 'Charizard');
        await page.getByRole('combobox', { name: /^forme$/i }).selectOption({
          label: 'Charizard Mega X'
        });
        await expect(teamCard(page, 'Charizard Mega X')).toBeVisible();

        await battleFormatSelect(page).selectOption({ label: 'VGC Doubles — No Restricted' });
        await expect(page.getByRole('alert')).toContainText(
          'Charizard Mega X is not available in this VGC profile.'
        );
        await expect(teamCard(page, 'Charizard Mega X')).toBeVisible();
        await expect(page.getByText('1/6 selected')).toBeVisible();
      }
    );
  });

  test.describe('World Champion Teams', () => {
    // Verifies the scenario: Loads the selected champion roster into an empty team.
    teamPlannerTest('Loads the selected champion roster into an empty team', async ({ page }) => {
      const championSelect = page.getByRole('combobox', { name: /world champion team/i });
      await expect(championSelect.locator('option')).toHaveCount(15);
      await expect(championSelect.locator('option:checked')).toContainText('2025');

      await page.getByRole('button', { name: /^fill champion team$/i }).click();
      await expect(page.getByText('6/6 selected')).toBeVisible({ timeout: 30_000 });
      await expect(occupiedTeamCards(page)).toHaveCount(6);
      await expect(page.getByRole('button', { name: /^remove koraidon$/i })).toBeVisible();
    });

    // Verifies the scenario: Offers safe choices when a champion roster would replace work.
    teamPlannerTest(
      'Offers safe choices when a champion roster would replace work',
      async ({ page }) => {
        await addPokemon(page, 1, 'Bulbasaur');
        await page.getByRole('button', { name: /^fill champion team$/i }).click();

        const dialog = page.getByRole('dialog');
        await expect(
          dialog.getByRole('heading', { name: /fill the remaining team slots/i })
        ).toBeVisible();
        await expect(dialog.getByRole('button', { name: /^cancel$/i })).toBeVisible();
        await expect(dialog.getByRole('button', { name: /^fill remaining$/i })).toBeVisible();
        await expect(dialog.getByRole('button', { name: /^replace team$/i })).toBeVisible();
        await expect(dialog.getByRole('link', { name: /winning roster source/i })).toBeVisible();

        await dialog.getByRole('button', { name: /^cancel$/i }).click();
        await expect(page.getByText('1/6 selected')).toBeVisible();
        await expect(page.getByRole('button', { name: /^remove bulbasaur$/i })).toBeVisible();
      }
    );

    // Verifies the scenario: Fill Remaining keeps the existing member.
    teamPlannerTest('Fill Remaining keeps the existing member', async ({ page }) => {
      await addPokemon(page, 1, 'Bulbasaur');
      await page.getByRole('button', { name: /^fill champion team$/i }).click();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: /^fill remaining$/i })
        .click();

      await expect(page.getByText('6/6 selected')).toBeVisible({ timeout: 30_000 });
      await expect(occupiedTeamCards(page)).toHaveCount(6);
      await expect(page.getByRole('button', { name: /^remove bulbasaur$/i })).toBeVisible();
    });
  });

  test.describe('Competitive recommendation identity', () => {
    test('Form-based evidence resolves through valid base-species API names', async ({ page }) => {
      const requestedPokemonNames: string[] = [];
      page.on('request', (request) => {
        const match = request.url().match(/pokeapi\.co\/api\/v2\/pokemon\/([^/?#]+)/i);
        if (match) requestedPokemonNames.push(decodeURIComponent(match[1]).toLowerCase());
      });

      await page.goto('/');
      await page.evaluate(
        () =>
          new Promise<void>((resolve, reject) => {
            const request = indexedDB.deleteDatabase('pokemon-pack-simulator-pokeapi-cache');
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error('PokeAPI cache database is still open'));
          })
      );
      await openTeamPlanner(page);
      await showPlannerView(page, 'Analysis');
      await expect(recommendationButtons(page)).toHaveCount(4, { timeout: 30_000 });

      const competitiveFormNames = [
        'calyrex-shadow',
        'indeedee-f',
        'landorus-therian',
        'thundurus-therian',
        'urshifu-rapid-strike'
      ];
      await expect
        .poll(() => requestedPokemonNames, { timeout: 30_000 })
        .toEqual(expect.arrayContaining(['indeedee', 'landorus', 'thundurus', 'urshifu']));
      expect(requestedPokemonNames).not.toEqual(expect.arrayContaining(competitiveFormNames));

      await page
        .getByRole('combobox', { name: /game pokedex/i })
        .selectOption({ label: 'Black 2 / White 2' });
      await expect(
        page.getByText(/therian forme with intimidate.*base landorus/i).first()
      ).toBeVisible();
    });
  });

  test.describe('Build Customization', () => {
    // Verifies the scenario: Shows sourced moves, abilities, nature, and analysis for a build.
    teamPlannerTest(
      'Shows sourced moves, abilities, nature, and analysis for a build',
      async ({ page }) => {
        await addPokemon(page, 1, 'Bulbasaur');
        await openBuildOptions(page, 'Bulbasaur');
        const card = teamCard(page, 'Bulbasaur');

        await expect(card.getByText(/ability — select one/i)).toBeVisible();
        await expect(
          card.getByRole('button', { name: /select overgrow ability/i })
        ).toHaveAttribute('aria-pressed', 'true');
        await expect(card.getByRole('button', { name: /hidden ability/i })).toBeVisible();
        await expect(card.getByText(/^nature$/i)).toBeVisible();
        await expect(card.getByRole('link', { name: /learnset/i })).toBeVisible();
        await expect(card.getByRole('combobox', { name: /^move \d$/i })).toHaveCount(4);
        await showPlannerView(page, 'Analysis');
        await expect(page.getByRole('heading', { name: /nature-adjusted stats/i })).toBeVisible();
      }
    );

    // Verifies the scenario: Ability selection opens an accessible detail dialog.
    teamPlannerTest('Ability selection opens an accessible detail dialog', async ({ page }) => {
      await addPokemon(page, 6, 'Charizard');
      await openBuildOptions(page, 'Charizard');
      await teamCard(page, 'Charizard')
        .getByRole('button', { name: /select solar power hidden ability/i })
        .click();

      const dialog = page.getByRole('dialog', { name: 'Solar Power' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText(/hidden ability · charizard/i)).toBeVisible();
      await expect(dialog.getByRole('heading', { name: /^what it does$/i })).toBeVisible();
      await expect(dialog.getByRole('heading', { name: /^in-game description$/i })).toBeVisible();
      await dialog.getByRole('button', { name: /^close ability details$/i }).click();
      await expect(dialog).toBeHidden();
    });

    // Verifies the scenario: Nature picker can search and apply a different nature.
    teamPlannerTest('Nature picker can search and apply a different nature', async ({ page }) => {
      await addPokemon(page, 1, 'Bulbasaur');
      await openBuildOptions(page, 'Bulbasaur');
      await page.getByRole('button', { name: /change bulbasaur's nature/i }).click();

      const dialog = page.getByRole('dialog');
      await expect(dialog.getByRole('heading', { name: /^choose a nature$/i })).toBeVisible();
      await dialog.getByRole('searchbox', { name: /find a nature/i }).fill('Jolly');
      await expect(dialog.getByRole('radio', { name: /^Jolly/i })).toBeVisible();
      await dialog.getByText('Jolly', { exact: true }).click();

      await expect(dialog).toBeHidden();
      await expect(teamCard(page, 'Bulbasaur').getByText(/^Jolly$/i)).toBeVisible();
      await expect(teamCard(page, 'Bulbasaur')).toContainText('+Speed / -Special Attack');
    });

    // Verifies the scenario: Changing form refreshes identity, typing, BST, and ability.
    teamPlannerTest(
      'Changing form refreshes identity, typing, BST, and ability',
      async ({ page }) => {
        await addPokemon(page, 6, 'Charizard');
        await openBuildOptions(page, 'Charizard');
        const formSelect = page.getByRole('combobox', { name: /^forme$/i });

        await expect(formSelect.locator('option')).toHaveCount(4);
        await formSelect.selectOption({ label: 'Charizard Mega X' });

        const card = teamCard(page, 'Charizard Mega X');
        await expect(card).toBeVisible();
        await expect(card.getByRole('img', { name: /^dragon$/i })).toBeVisible();
        await expect(card).toContainText('BST 634');
        await expect(
          card.getByRole('button', { name: /select tough claws ability/i })
        ).toHaveAttribute('aria-pressed', 'true');
      }
    );

    // Verifies the scenario: Move changes immediately update move and coverage analysis.
    teamPlannerTest(
      'Move changes immediately update move and coverage analysis',
      async ({ page }) => {
        await addPokemon(page, 1, 'Bulbasaur');
        await openBuildOptions(page, 'Bulbasaur');
        for (const moveNumber of [1, 2, 3, 4]) {
          await moveSelect(page, moveNumber).selectOption('');
        }
        await showPlannerView(page, 'Analysis');
        await expect(page.getByText(/choose moves to analyse/i)).toBeVisible();

        await showPlannerView(page, 'Build');
        await openBuildOptions(page, 'Bulbasaur');
        await moveSelect(page, 1).selectOption('vine-whip');
        await expect(moveSelect(page, 1).locator('option:checked')).toContainText(/Vine Whip/i);
        await showPlannerView(page, 'Analysis');
        await expect(
          page.getByText(/1 selected moves cover 3 of 18 defending types/i)
        ).toBeVisible();
        await expect(page.getByRole('heading', { name: /^strong against$/i })).toBeVisible();
        await expect(
          page
            .getByRole('article')
            .filter({ has: page.getByRole('heading', { name: /^coverage strengths$/i }) })
            .getByRole('img', { name: /^water$/i })
        ).toBeVisible();
      }
    );

    // Verifies the scenario: Nature effects toggle switches between adjusted and base stats.
    teamPlannerTest(
      'Nature effects toggle switches between adjusted and base stats',
      async ({ page }) => {
        await addPokemon(page, 1, 'Bulbasaur');
        await showPlannerView(page, 'Analysis');
        const toggle = page.getByRole('checkbox', { name: /nature effects on/i });

        await expect(toggle).toBeChecked();
        await toggle.press('Space');
        await expect(page.getByRole('heading', { name: /^base stats$/i })).toBeVisible();
        await expect(
          page.getByText(/selected natures are kept, but their stat effects are ignored/i)
        ).toBeVisible();
      }
    );
  });

  test.describe('Assistant and Recommendations', () => {
    // Verifies the scenario: Adding a Pokemon produces a bounded transparent score.
    teamPlannerTest('Adding a Pokemon produces a bounded transparent score', async ({ page }) => {
      await addPokemon(page, 6, 'Charizard');
      await showPlannerView(page, 'Analysis');

      await expect(scorePanel(page)).toBeVisible();
      const score = Number((await scorePanel(page).getByRole('strong').textContent()) ?? '-1');
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
      await expect(page.getByText(/not an objective verdict or guarantee/i)).toBeVisible();
      await expect(page.getByLabel('Team score factors').getByRole('meter')).toHaveCount(6);
    });

    // Verifies the scenario: Assistant reports roles and recommendation evidence.
    teamPlannerTest('Assistant reports roles and recommendation evidence', async ({ page }) => {
      await addPokemon(page, 6, 'Charizard');
      await showPlannerView(page, 'Analysis');

      await expect(page.getByRole('region', { name: /team functions/i })).toContainText(
        'Charizard'
      );
      await expect(recommendationButtons(page)).toHaveCount(4);
      await expect(page.getByText(/% fit$/i).first()).toBeVisible();
      await expect(page.getByText(/same generation evidence/i).first()).toBeVisible();
      await expect(
        page.getByRole('link', { name: /analytics|championships|teams/i }).first()
      ).toBeVisible();
    });

    // Verifies the scenario: Adds an individual recommendation to a partial team.
    teamPlannerTest('Adds an individual recommendation to a partial team', async ({ page }) => {
      await addPokemon(page, 1, 'Bulbasaur');
      await showPlannerView(page, 'Analysis');
      await recommendationButtons(page).first().click();

      await expect(page.getByText('2/6 selected')).toBeVisible({ timeout: 30_000 });
      await showPlannerView(page, 'Build');
      await expect(occupiedTeamCards(page)).toHaveCount(2);
      await expect(page.getByRole('button', { name: /^remove bulbasaur$/i })).toBeVisible();
    });

    // Verifies the scenario: Full-team recommendation previews, applies, and undoes a swap.
    teamPlannerTest(
      'Full-team recommendation previews, applies, and undoes a swap',
      async ({ page }) => {
        await page.getByRole('button', { name: /^fill champion team$/i }).click();
        await expect(page.getByText('6/6 selected')).toBeVisible({ timeout: 30_000 });
        await showPlannerView(page, 'Analysis');

        const impactButton = page.getByRole('button', { name: /^view estimated impact$/i }).first();
        const replaceButton = page.getByRole('button', { name: /^replace .+ with .+$/i }).first();
        const replaceButtonText = (await replaceButton.textContent())?.trim() ?? '';
        const replacementMatch = replaceButtonText.match(/^Replace (.+) with (.+)$/i);

        expect(replacementMatch).not.toBeNull();
        const replacedPokemon = replacementMatch?.[1] ?? '';
        const recommendedPokemon = replacementMatch?.[2] ?? '';

        await impactButton.click();
        const impactDialog = page.getByRole('dialog').filter({
          has: page.getByRole('heading', { name: /^estimated team impact$/i })
        });

        await expect(impactDialog).toContainText(/team score/i);
        await expect(impactDialog).toContainText(/weakness exposure/i);
        await expect(impactDialog).toContainText(/coverage/i);
        await expect(impactDialog).toContainText(/type variety/i);
        await impactDialog.getByRole('button', { name: /^close estimated team impact$/i }).click();

        await replaceButton.click();
        await expect(page.getByRole('button', { name: /^undo swap$/i })).toBeVisible();
        await showPlannerView(page, 'Build');
        await expect(
          page.getByRole('button', { name: new RegExp(`^remove ${recommendedPokemon}$`, 'i') })
        ).toBeVisible({ timeout: 30_000 });

        await showPlannerView(page, 'Analysis');
        await page.getByRole('button', { name: /^undo swap$/i }).click();
        await showPlannerView(page, 'Build');
        await expect(
          page.getByRole('button', { name: new RegExp(`^remove ${replacedPokemon}$`, 'i') })
        ).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText('6/6 selected')).toBeVisible();
      }
    );
  });

  test.describe('Navigation and State Lifetime', () => {
    // Verifies the scenario: Menu overlay preserves the in-progress team.
    teamPlannerTest('Menu overlay preserves the in-progress team', async ({ page }) => {
      await addPokemon(page, 1, 'Bulbasaur');
      await page.getByRole('button', { name: /^menu$/i }).click();

      await expect(page.getByRole('button', { name: /^home$/i })).toBeVisible();
      await expect(page.getByText('1/6 selected')).toBeVisible();
      await expect(page.getByRole('button', { name: /^remove bulbasaur$/i })).toBeVisible();
    });

    // Verifies the scenario: Menu can return to the station chooser.
    teamPlannerTest('Menu can return to the station chooser', async ({ page }) => {
      await page.getByRole('button', { name: /^menu$/i }).click();
      await page.getByRole('button', { name: /^home$/i }).click();

      await expect(page.getByText(/choose (?:your|a) station/i)).toBeVisible();
      await expect(homeStationButton(page, 'team')).toBeVisible();
    });

    // Verifies the routed planner remains open while an unsaved roster is still discarded.
    teamPlannerTest(
      'Reload keeps Team Planner open and discards an unsaved team',
      async ({ page }) => {
        await addPokemon(page, 1, 'Bulbasaur');
        await page.reload();

        await expect(page).toHaveURL(/#\/team$/);
        await expect(page.getByRole('heading', { name: /pokemon team planner/i })).toBeVisible();
        await expect(page.getByText('0/6 selected')).toBeVisible();
        await expect(occupiedTeamCards(page)).toHaveCount(0);
      }
    );

    teamPlannerTest(
      'Named teams can be saved, loaded, updated, started, and deleted',
      async ({ page }) => {
        const teamName = page.getByRole('textbox', { name: /^team name$/i });

        await addPokemon(page, 1, 'Bulbasaur');
        await teamName.fill('Kanto Starters');
        await page.getByRole('button', { name: /^save team$/i }).click();
        await expect(page.getByRole('combobox', { name: /load a saved team/i })).toContainText(
          'Kanto Starters'
        );

        await page.getByRole('button', { name: /^new$/i }).click();
        await expect(page.getByText('0/6 selected')).toBeVisible();
        await addPokemon(page, 4, 'Charmander');
        await teamName.fill('Fire Squad');
        await page.getByRole('button', { name: /^save team$/i }).click();

        const savedTeams = page.getByRole('combobox', { name: /load a saved team/i });
        await expect(savedTeams.locator('option')).toHaveCount(3);
        await savedTeams.selectOption({ label: 'Kanto Starters' });
        await expect(teamCard(page, 'Bulbasaur')).toBeVisible();
        await teamName.fill('Kanto Classics');
        await page.getByRole('button', { name: /^update team$/i }).click();
        await expect(savedTeams).toContainText('Kanto Classics');

        await savedTeams.selectOption({ label: 'Fire Squad' });
        await expect(teamCard(page, 'Charmander')).toBeVisible();
        await page.getByRole('button', { name: /^delete$/i }).click();
        await expect(savedTeams).not.toContainText('Fire Squad');
        await expect(page.getByText('1/12 saved teams')).toBeVisible();
      }
    );

    teamPlannerTest('Saved-team library keeps the twelve newest named teams', async ({ page }) => {
      const teamName = page.getByRole('textbox', { name: /^team name$/i });

      await addPokemon(page, 1, 'Bulbasaur');
      await teamName.fill('Template Team');
      await page.getByRole('button', { name: /^save team$/i }).click();
      await page.evaluate((libraryKey) => {
        const [template] = JSON.parse(localStorage.getItem(libraryKey) ?? '[]');
        const seededLibrary = Array.from({ length: 12 }, (_, index) => ({
          ...template,
          id: `seeded-team-${index + 1}`,
          name: `Saved Team ${index + 1}`,
          updatedAt: 12 - index
        }));
        localStorage.setItem(libraryKey, JSON.stringify(seededLibrary));
      }, teamPlannerLibraryKey);
      await page.reload();

      const savedTeams = page.getByRole('combobox', { name: /load a saved team/i });
      await expect(savedTeams.locator('option')).toHaveCount(13);
      await page.getByRole('button', { name: /^new$/i }).click();
      await addPokemon(page, 1, 'Bulbasaur');
      await teamName.fill('Newest Team');
      await page.getByRole('button', { name: /^save team$/i }).click();

      await expect(savedTeams.locator('option')).toHaveCount(13);
      await expect(savedTeams).toContainText('Newest Team');
      await expect(savedTeams).not.toContainText('Saved Team 12');
    });

    // Verifies the scenario: Saved planner choices and build customizations survive reload.
    teamPlannerTest(
      'Saved planner choices and build customizations survive reload',
      async ({ page }) => {
        await addPokemon(page, 1, 'Bulbasaur');
        await openBuildOptions(page, 'Bulbasaur');
        await moveSelect(page, 1).selectOption('vine-whip');
        await gamePokedexSelect(page).selectOption({ label: 'Ruby / Sapphire / Emerald' });

        const selectedDex = await gamePokedexSelect(page).inputValue();
        const selectedBattleFormat = await battleFormatSelect(page)
          .locator('option')
          .nth(1)
          .getAttribute('value');
        const selectedChampionYear = await page
          .getByRole('combobox', { name: /world champion team/i })
          .locator('option')
          .nth(1)
          .getAttribute('value');

        expect(selectedBattleFormat).toBeTruthy();
        expect(selectedChampionYear).toBeTruthy();
        await battleFormatSelect(page).selectOption(selectedBattleFormat ?? '');
        await page
          .getByRole('combobox', { name: /world champion team/i })
          .selectOption(selectedChampionYear ?? '');

        await showPlannerView(page, 'Analysis');
        const natureEffectsToggle = page.getByRole('checkbox', { name: /nature effects/i });
        await natureEffectsToggle.press('Space');
        await expect(natureEffectsToggle).not.toBeChecked();

        const saveButton = page.getByRole('button', { name: /^save team$/i });
        await expect(saveButton).toBeEnabled();
        await saveButton.click();

        await expect(page.getByRole('button', { name: /^update team$/i })).toBeEnabled();
        await expect(page.getByText(/this team will be restored after reload/i)).toBeVisible();
        await expect
          .poll(() =>
            page.evaluate((storageKey) => {
              const savedPlanner = JSON.parse(localStorage.getItem(storageKey) ?? '{}');

              return {
                memberCount: savedPlanner.teamMembers?.length,
                selectedBattleFormat: savedPlanner.selectedBattleFormat,
                selectedChampionYear: String(savedPlanner.selectedChampionYear),
                selectedDex: savedPlanner.selectedDex,
                selectedMoves: savedPlanner.teamMembers?.[0]?.selectedMoves,
                useNatureAdjustedStats: savedPlanner.useNatureAdjustedStats
              };
            }, teamPlannerStorageKey)
          )
          .toEqual({
            memberCount: 1,
            selectedBattleFormat,
            selectedChampionYear,
            selectedDex,
            selectedMoves: expect.arrayContaining(['vine-whip']),
            useNatureAdjustedStats: false
          });

        await page.reload();

        await expect(page).toHaveURL(/#\/team$/);
        await expect(page.getByText('1/6 selected')).toBeVisible();
        await expect(teamCard(page, 'Bulbasaur')).toBeVisible();
        await expect(gamePokedexSelect(page)).toHaveValue(selectedDex);
        await expect(battleFormatSelect(page)).toHaveValue(selectedBattleFormat ?? '');
        await expect(page.getByRole('combobox', { name: /world champion team/i })).toHaveValue(
          selectedChampionYear ?? ''
        );
        await showPlannerView(page, 'Analysis');
        await expect(natureEffectsToggle).not.toBeChecked();
        await showPlannerView(page, 'Build');
        await openBuildOptions(page, 'Bulbasaur');
        await expect(moveSelect(page, 1).locator('option:checked')).toContainText(/Vine Whip/i);
        await expect(page.getByText(/this team will be restored after reload/i)).toBeVisible();

        await moveSelect(page, 1).selectOption('');
        await expect(page.getByRole('button', { name: /^save team$/i })).toBeEnabled();
      }
    );

    // Verifies the scenario: Ignores a malformed saved planner snapshot.
    test('Ignores a malformed saved planner snapshot', async ({ page }) => {
      await page.goto('/');
      try {
        await page.evaluate((storageKey) => {
          localStorage.setItem(
            storageKey,
            JSON.stringify({
              selectedDex: 'hoenn',
              selectedBattleFormat: 'not-a-format',
              teamMembers: [{ id: 1, name: null }]
            })
          );
        }, teamPlannerStorageKey);
        await homeStationButton(page, 'team').click();

        await expect(gamePokedexSelect(page)).toHaveValue('all');
        await expect(battleFormatSelect(page)).toHaveValue('open');
        await expect(page.getByText('0/6 selected')).toBeVisible();
        await expect(occupiedTeamCards(page)).toHaveCount(0);
      } finally {
        await page
          .evaluate((storageKey) => localStorage.removeItem(storageKey), teamPlannerStorageKey)
          .catch(() => {});
      }
    });
  });

  test.describe('Edge / Reliability', () => {
    // Verifies the scenario: Rapid selection attempts never overflow six slots.
    teamPlannerTest('Rapid selection attempts never overflow six slots', async ({ page }) => {
      for (const pokemon of [
        [1, 'Bulbasaur'],
        [2, 'Ivysaur'],
        [3, 'Venusaur'],
        [4, 'Charmander'],
        [5, 'Charmeleon'],
        [6, 'Charizard']
      ] as const) {
        await pokemonListButton(page, pokemon[0], pokemon[1]).click();
      }

      await expect(page.getByText('6/6 selected')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText('7/6 selected')).toBeHidden();
      await expect(occupiedTeamCards(page)).toHaveCount(6);
      await expect(pokemonListButton(page, 7, 'Squirtle')).toBeDisabled();
    });

    // Verifies the scenario: Repeated fill and clear cycles leave controls usable.
    teamPlannerTest('Repeated fill and clear cycles leave controls usable', async ({ page }) => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await page.getByRole('button', { name: /^fill randomly$/i }).click();
        await expect(page.getByText('6/6 selected')).toBeVisible({ timeout: 30_000 });
        await page.getByRole('button', { name: /^remove all$/i }).click();
        await expect(page.getByText('0/6 selected')).toBeVisible();
      }

      await expect(page.getByRole('button', { name: /^fill randomly$/i })).toBeEnabled();
      await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeEnabled();
    });

    // Verifies the scenario: Image failures do not block planner interactions.
    test('Image failures do not block planner interactions', async ({ page }) => {
      await page.route('**/*.{png,jpg,jpeg,gif,webp,svg}', (route) => route.abort());
      await openTeamPlanner(page);
      await addPokemon(page, 1, 'Bulbasaur');
      await openBuildOptions(page, 'Bulbasaur');

      await expect(page.getByText('1/6 selected')).toBeVisible();
      await expect(moveSelect(page, 1)).toBeVisible();
      await expect(page.getByRole('button', { name: /^remove all$/i })).toBeEnabled();
    });

    // Verifies the scenario: Very long search text fails safely and remains recoverable.
    teamPlannerTest(
      'Very long search text fails safely and remains recoverable',
      async ({ page }) => {
        const search = page.getByRole('searchbox', { name: 'Pokemon' });
        await search.fill('QWERTYUIOPASDFGHJKLZXCVBNM1234567890'.repeat(3));

        await expect(pokemonListButtons(page)).toHaveCount(0);
        await expect(page.getByText('0/6 selected')).toBeVisible();
        await expect(page.getByRole('button', { name: /^fill randomly$/i })).toBeEnabled();

        await search.clear();
        await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeVisible();
      }
    );

    // Verifies the scenario: Closing the nature dialog leaves build controls unchanged.
    teamPlannerTest(
      'Closing the nature dialog leaves build controls unchanged',
      async ({ page }) => {
        await addPokemon(page, 1, 'Bulbasaur');
        await openBuildOptions(page, 'Bulbasaur');
        const card = teamCard(page, 'Bulbasaur');
        const originalNature = await card
          .getByText(/Modest|Adamant|Timid|Jolly|Bold|Calm/)
          .first()
          .textContent();
        await page.getByRole('button', { name: /change bulbasaur's nature/i }).click();
        await page.getByRole('button', { name: /^close build choice panel$/i }).click();

        await expect(page.getByRole('dialog')).toBeHidden();
        if (originalNature) {
          await expect(card.getByText(originalNature, { exact: true })).toBeVisible();
        }
        await expect(moveSelect(page, 1)).toBeEnabled();
      }
    );
  });
});
