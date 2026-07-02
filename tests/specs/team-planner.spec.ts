import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/test';

test.describe('@live Pokemon Team Planner', () => {
  // Opens the Team Planner station from the home station chooser.
  async function openTeamPlanner(page: Page) {
    await page.goto('/');
    await page.getByRole('button', { name: /pokemon team planner/i }).click();

    await expect(page.getByRole('heading', { name: /pokemon team planner/i })).toBeVisible();
    await expect(page.getByText('GAME POKEDEX')).toBeVisible();
    await expect(page.getByRole('button', { name: /^randomize team$/i })).toBeVisible();
  }

  const teamPlannerTest = test.extend<{ openTeamPlannerStation: void }>({
    openTeamPlannerStation: [
      async ({ page }, use) => {
        await openTeamPlanner(page);
        await use();
      },
      { auto: true }
    ]
  });

  // Locates a Pokemon result button in the planner list.
  function pokemonListButton(page: Page, pokedexNumber: number, pokemonName: string) {
    const paddedNumber = String(pokedexNumber).padStart(3, '0');

    return page.getByRole('button', {
      name: new RegExp(`#${paddedNumber}\\s+${pokemonName}`, 'i')
    });
  }

  // Locates planner comboboxes by current order: game Pokedex, sort, then selected Pokemon moves.
  function gamePokedexSelect(page: Page) {
    return page.getByRole('combobox', { name: /game pokedex/i });
  }

  function sortPokemonSelect(page: Page) {
    return page.getByRole('combobox', { name: /sort pokemon/i });
  }

  function pokemonListButtons(page: Page) {
    return page.locator('button').filter({ hasText: /^#\d{3}\s+/ });
  }

  test.describe('Station / Initial Load', () => {
    // Verifies the station opens with filters, empty team slots, and analysis panels.
    teamPlannerTest('Starts Team Planner station', async ({ page }) => {
      await expect(page.getByText(/^Pokemon$/i)).toBeVisible();
      await expect(page.getByPlaceholder('Filter by name or number...')).toBeVisible();
      await expect(gamePokedexSelect(page)).toBeVisible();
      await expect(sortPokemonSelect(page)).toHaveValue('entry');
      await expect(page.getByText('0/6 selected')).toBeVisible();
      await expect(page.getByRole('button', { name: /^remove all$/i })).toBeDisabled();
      await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeVisible();
      await expect(page.getByText('Add Pokemon to scan team weaknesses.')).toBeVisible();
    });

    // Verifies the planner shell stays usable while Pokemon API responses are delayed.
    test('Shows stable loading state while Pokemon data is delayed', async ({ page }) => {
      let releasePokemonRequests!: () => void;
      const pokemonRequestsCanContinue = new Promise<void>((resolve) => {
        releasePokemonRequests = resolve;
      });

      await page.route('**/pokeapi.co/**', async (route) => {
        await pokemonRequestsCanContinue;
        await route.continue();
      });

      await page.goto('/');
      await page.getByRole('button', { name: /pokemon team planner/i }).click();

      await expect(page.getByRole('heading', { name: /pokemon team planner/i })).toBeVisible();
      await expect(page.getByText('GAME POKEDEX')).toBeVisible();
      await expect(page.getByPlaceholder('Filter by name or number...')).toBeVisible();
      await expect(gamePokedexSelect(page)).toBeVisible();
      await expect(sortPokemonSelect(page)).toHaveValue('entry');
      await expect(page.getByText('0/6 selected')).toBeVisible();
      await expect(page.getByRole('button', { name: /^remove all$/i })).toBeDisabled();
      await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeHidden();

      releasePokemonRequests();

      await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeVisible({ timeout: 30_000 });
    });

    // Verifies the initial planner controls remain reachable on a mobile viewport.
    test('Initial controls remain usable on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await openTeamPlanner(page);

      await expect(page.getByPlaceholder('Filter by name or number...')).toBeVisible();
      await expect(gamePokedexSelect(page)).toBeVisible();
      await expect(sortPokemonSelect(page)).toHaveValue('entry');
      await expect(page.getByRole('button', { name: /^randomize team$/i })).toBeEnabled();
      await expect(page.getByText('0/6 selected')).toBeVisible();
      await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeVisible();
    });
  });

  test.describe('Filtering / Sorting', () => {
    // Verifies name search narrows the Pokemon list without changing team state.
    teamPlannerTest('Search by Pokemon name filters the planner list', async ({ page }) => {
      await page.getByPlaceholder('Filter by name or number...').fill('Pikachu');

      await expect(pokemonListButton(page, 25, 'Pikachu')).toBeVisible();
      await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeHidden();
      await expect(page.getByText('0/6 selected')).toBeVisible();
    });

    test.skip('Search by Pokedex number finds the matching Pokemon', async ({ page }) => {
      void page;
    });
    test.skip('Invalid search shows an empty list without breaking controls', async ({ page }) => {
      void page;
    });
    test.skip('Sort by name reorders visible Pokemon alphabetically', async ({ page }) => {
      void page;
    });
    test.skip('Sort while search is active keeps the search filter applied', async ({ page }) => {
      void page;
    });
  });

  test.describe('Game Pokedex Filters', () => {
    // Verifies selecting a game Pokedex scopes the Pokemon list to that regional pool.
    teamPlannerTest('Hoenn game Pokedex filter shows Hoenn Pokemon', async ({ page }) => {
      await gamePokedexSelect(page).selectOption({ label: 'Ruby / Sapphire / Emerald' });

      await expect(pokemonListButton(page, 1, 'Treecko')).toBeVisible();
      await expect(pokemonListButton(page, 4, 'Torchic')).toBeVisible();
      await expect(pokemonListButton(page, 7, 'Mudkip')).toBeVisible();
      await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeHidden();
    });

    test.skip('All/National Pokedex restores the full Pokemon list', async ({ page }) => {
      void page;
    });
    test.skip('Sorting does not clear an active game Pokedex filter', async ({ page }) => {
      void page;
    });
    test.skip('Search outside an active Pokedex filter does not leak unrelated Pokemon', async ({
      page
    }) => {
      void page;
    });
  });

  test.describe('Team Building', () => {
    // Verifies adding one Pokemon fills a team slot and updates analysis panels.
    teamPlannerTest('Selecting a Pokemon adds it to the team', async ({ page }) => {
      await pokemonListButton(page, 1, 'Bulbasaur').click();

      await expect(page.getByText('1/6 selected')).toBeVisible();
      await expect(page.getByRole('button', { name: /^remove all$/i })).toBeEnabled();
      await expect(page.getByRole('button', { name: /^remove bulbasaur$/i })).toBeVisible();
      await expect(page.getByText('Bulbasaur').last()).toBeVisible();
      await expect(page.getByText('WEAKNESSES')).toBeVisible();
      await expect(page.getByText(/Fire x1/i)).toBeVisible();
    });

    test.skip('Selecting six Pokemon fills all team slots and prevents overflow', async ({
      page
    }) => {
      void page;
    });
    test.skip('Remove deletes one selected Pokemon and recomputes team analysis', async ({
      page
    }) => {
      void page;
    });
    test.skip('Remove All clears team slots and disables itself', async ({ page }) => {
      void page;
    });
    test.skip('Randomize Team fills a valid six-Pokemon team', async ({ page }) => {
      void page;
    });
  });

  test.describe('Moves / Analysis', () => {
    // Verifies selected Pokemon expose move selectors and stat summaries.
    teamPlannerTest(
      'Selected Pokemon exposes move selectors and average stats',
      async ({ page }) => {
        await pokemonListButton(page, 1, 'Bulbasaur').click();

        await expect(page.getByText('MOVE 1')).toBeVisible();
        await expect(page.getByRole('combobox', { name: /^move 1$/i })).toContainText(/Vine Whip/i);
        const averageStatsPanel = page
          .getByRole('article')
          .filter({ has: page.getByRole('heading', { name: /^average stats$/i }) });

        await expect(averageStatsPanel).toBeVisible();
        await expect(averageStatsPanel.getByText(/^HP$/)).toBeVisible();
        await expect(averageStatsPanel.getByText(/^45$/).first()).toBeVisible();
      }
    );

    test.skip('Choosing a move updates offensive strengths', async ({ page }) => {
      void page;
    });
    test.skip('Removing a move returns the slot to Empty Slot', async ({ page }) => {
      void page;
    });
    test.skip('Team weaknesses and resistances update after multiple Pokemon', async ({ page }) => {
      void page;
    });
  });

  test.describe('Navigation', () => {
    // Verifies Menu returns from Team Planner to the home station chooser.
    teamPlannerTest('Menu returns to the home station chooser', async ({ page }) => {
      await page.getByRole('button', { name: /^menu$/i }).click();
      await expect(page.getByRole('button', { name: /^home$/i })).toBeVisible();
      await page.getByRole('button', { name: /^home$/i }).click();

      await expect(page.getByText(/choose your station/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /pokemon team planner/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /pokemon quiz/i })).toBeVisible();
    });

    test.skip('Menu during a partially built team preserves or intentionally resets state', async ({
      page
    }) => {
      void page;
    });
    test.skip('Browser reload returns to a stable planner state', async ({ page }) => {
      void page;
    });
  });

  test.describe('Edge / Reliability', () => {
    // Verifies rapid selection attempts do not exceed the six-Pokemon team cap.
    teamPlannerTest('Rapid Pokemon selection does not exceed six team slots', async ({ page }) => {
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

      await expect(page.getByText('6/6 selected')).toBeVisible();
      await expect(page.getByText('7/6 selected')).toBeHidden();
      await expect(pokemonListButton(page, 7, 'Squirtle')).toBeDisabled();
      await expect(page.getByRole('button', { name: /^remove all$/i })).toBeEnabled();
    });

    teamPlannerTest(
      'Rapid Randomize and Remove All actions leave controls usable',
      async ({ page }) => {
        for (let actionCount = 0; actionCount < 3; actionCount += 1) {
          await page.getByRole('button', { name: /^randomize team$/i }).click();
          await expect(page.getByText('6/6 selected')).toBeVisible();
          await expect(page.getByText('7/6 selected')).toBeHidden();
          await expect(page.getByRole('button', { name: /^remove all$/i })).toBeEnabled();

          await page.getByRole('button', { name: /^remove all$/i }).click();
          await expect(page.getByText('0/6 selected')).toBeVisible();
          await expect(page.getByRole('button', { name: /^remove all$/i })).toBeDisabled();
        }

        await expect(page.getByRole('button', { name: /^randomize team$/i })).toBeEnabled();
        await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeEnabled();
      }
    );

    // Verifies broken image assets do not prevent team selection from working.
    test('Image request failures leave team selection controls usable', async ({ page }) => {
      await page.route('**/*.{png,jpg,jpeg,gif,webp,svg}', (route) => route.abort());
      await openTeamPlanner(page);

      await expect(page.getByPlaceholder('Filter by name or number...')).toBeVisible();
      await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeEnabled();

      await pokemonListButton(page, 1, 'Bulbasaur').click();

      await expect(page.getByText('1/6 selected')).toBeVisible();
      await expect(page.getByRole('button', { name: /^remove bulbasaur$/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /^remove all$/i })).toBeEnabled();
    });

    // Verifies delayed Pokemon data does not leave filters or team controls in a broken state.
    test('Delayed Pokemon data keeps a stable loading or empty state', async ({ page }) => {
      let releasePokemonRequests!: () => void;
      const pokemonRequestsCanContinue = new Promise<void>((resolve) => {
        releasePokemonRequests = resolve;
      });

      await page.route('**/pokeapi.co/**', async (route) => {
        await pokemonRequestsCanContinue;
        await route.continue();
      });

      await page.goto('/');
      await page.getByRole('button', { name: /pokemon team planner/i }).click();

      await expect(page.getByRole('heading', { name: /pokemon team planner/i })).toBeVisible();
      await expect(gamePokedexSelect(page)).toBeEnabled();
      await expect(sortPokemonSelect(page)).toBeDisabled();
      await expect(page.getByRole('button', { name: /^randomize team$/i })).toBeVisible();
      await expect(page.getByText('0/6 selected')).toBeVisible();
      await expect(pokemonListButtons(page)).toHaveCount(0);

      releasePokemonRequests();

      await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeVisible({ timeout: 30_000 });
      await expect(sortPokemonSelect(page)).toBeEnabled();
      await expect(page.getByRole('button', { name: /^randomize team$/i })).toBeEnabled();
    });

    // Verifies overlong search input reaches a safe empty state and controls remain usable.
    teamPlannerTest(
      'Very long search text fails safely without layout breakage',
      async ({ page }) => {
        const longSearchText = 'QWERTYUIOPASDFGHJKLZXCVBNM1234567890'.repeat(3);

        await page.getByPlaceholder('Filter by name or number...').fill(longSearchText);

        await expect(page.getByText('0/6 selected')).toBeVisible();
        await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeHidden();
        await expect(pokemonListButtons(page)).toHaveCount(0);
        await expect(page.getByRole('button', { name: /^randomize team$/i })).toBeEnabled();
        await expect(page.getByRole('button', { name: /^remove all$/i })).toBeDisabled();
      }
    );
  });
});
