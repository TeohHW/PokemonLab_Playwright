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
    return page.locator('button').filter({ hasText: /^#\d{3}\s*/ });
  }

  function plannerPageLabel(page: Page, currentPage: number, totalPages: number) {
    return page.getByText(new RegExp(`^Page ${currentPage} / ${totalPages}$`, 'i'));
  }

  // Locates one of the selected Pokemon move selectors.
  function moveSelect(page: Page, moveNumber: number) {
    return page.getByRole('combobox', { name: new RegExp(`^move ${moveNumber}$`, 'i') });
  }

  // Locates the Average Stats analysis panel for the currently selected team.
  function averageStatsPanel(page: Page) {
    return page
      .getByRole('article')
      .filter({ has: page.getByRole('heading', { name: /^average stats$/i }) });
  }

  function analysisTypeBadge(page: Page, label: string) {
    return page.getByRole('img', { name: new RegExp(`^${label}$`, 'i') });
  }

  // Reads Pokemon names from currently visible planner result buttons.
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

  test.describe('Station / Initial Load', () => {
    // Verifies the station opens with filters, empty team slots, and analysis panels.
    teamPlannerTest('Starts Team Planner station', async ({ page }) => {
      await expect(page.getByText(/^Pokemon$/i)).toBeVisible();
      await expect(page.getByPlaceholder('Filter by name or number...')).toBeVisible();
      await expect(gamePokedexSelect(page)).toBeVisible();
      await expect(sortPokemonSelect(page)).toHaveValue('entry');
      await expect(page.getByText('0/6 selected')).toBeVisible();
      await expect(page.getByRole('button', { name: /^remove all$/i })).toBeDisabled();
      await expect(plannerPageLabel(page, 1, 7)).toBeVisible();
      await expect(pokemonListButtons(page)).toHaveCount(24);
      await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeVisible();
      await expect(pokemonListButton(page, 24, 'Arbok')).toBeVisible();
      await expect(pokemonListButton(page, 25, 'Pikachu')).toBeHidden();
      await expect(page.getByText('Add Pokemon to scan team weaknesses.')).toBeVisible();
    });

    // Verifies the planner result pager advances one page and can return to the first page.
    teamPlannerTest('Navigates Pokemon result pages', async ({ page }) => {
      const previousPageButton = page.getByRole('button', { name: /^prev$/i });
      const nextPageButton = page.getByRole('button', { name: /^next$/i });

      await expect(plannerPageLabel(page, 1, 7)).toBeVisible();
      await expect(previousPageButton).toBeDisabled();
      await expect(nextPageButton).toBeEnabled();
      await expect(pokemonListButtons(page)).toHaveCount(24);
      await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeVisible();
      await expect(pokemonListButton(page, 24, 'Arbok')).toBeVisible();

      await nextPageButton.click();

      await expect(plannerPageLabel(page, 2, 7)).toBeVisible();
      await expect(previousPageButton).toBeEnabled();
      await expect(pokemonListButtons(page)).toHaveCount(24);
      await expect(pokemonListButton(page, 25, 'Pikachu')).toBeVisible();
      await expect(pokemonListButton(page, 48, 'Venonat')).toBeVisible();
      await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeHidden();

      await previousPageButton.click();

      await expect(plannerPageLabel(page, 1, 7)).toBeVisible();
      await expect(previousPageButton).toBeDisabled();
      await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeVisible();
      await expect(pokemonListButton(page, 25, 'Pikachu')).toBeHidden();
    });

    // Verifies the planner shell stays usable while Pokemon API responses are delayed.
    test('Shows stable loading state while Pokemon data is delayed', async ({ page }) => {
      let releasePokemonRequests!: () => void;
      const pokemonRequestsCanContinue = new Promise<void>((resolve) => {
        releasePokemonRequests = resolve;
      });

      await page.addInitScript(() => {
        localStorage.clear();
        sessionStorage.clear();
        void indexedDB
          .databases?.()
          .then((databases) =>
            databases.forEach(
              (database) => database.name && indexedDB.deleteDatabase(database.name)
            )
          );
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

    // Verifies numeric search narrows the planner list to the matching Pokedex number.
    teamPlannerTest('Search by Pokedex number finds the matching Pokemon', async ({ page }) => {
      await page.getByPlaceholder('Filter by name or number...').fill('25');

      await expect(pokemonListButton(page, 25, 'Pikachu')).toBeVisible();
      await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeHidden();
      await expect(page.getByText('0/6 selected')).toBeVisible();
    });

    // Verifies invalid search terms show the empty state while team controls remain stable.
    teamPlannerTest(
      'Invalid search shows an empty list without breaking controls',
      async ({ page }) => {
        await page.getByPlaceholder('Filter by name or number...').fill('invalid');

        await expect(pokemonListButton(page, 25, 'Pikachu')).toBeHidden();
        await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeHidden();
        await expect(page.getByText('0/6 selected')).toBeVisible();

        await expect(page.getByLabel('Pokemon team choices').getByRole('paragraph')).toContainText(
          'No Pokemon match this search.'
        );
      }
    );

    // Verifies Name sort alphabetizes the currently rendered Pokemon list.
    teamPlannerTest('Sort by name reorders visible Pokemon alphabetically', async ({ page }) => {
      await sortPokemonSelect(page).selectOption({ label: 'Name' });

      await expect(sortPokemonSelect(page)).toHaveValue('name');
      await expect
        .poll(() => visiblePokemonNames(page).then((names) => names.length))
        .toBeGreaterThan(1);

      const sortedPokemonNames = [...(await visiblePokemonNames(page))].sort((first, second) =>
        first.localeCompare(second)
      );

      await expect.poll(() => visiblePokemonNames(page)).toEqual(sortedPokemonNames);
    });

    // Verifies sorting filtered results keeps the search term applied.
    teamPlannerTest(
      'Sort while search is active keeps the search filter applied',
      async ({ page }) => {
        await page.getByPlaceholder('Filter by name or number...').fill('char');

        await expect(pokemonListButton(page, 4, 'Charmander')).toBeVisible();
        await expect(pokemonListButton(page, 5, 'Charmeleon')).toBeVisible();
        await expect(pokemonListButton(page, 6, 'Charizard')).toBeVisible();
        await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeHidden();

        await sortPokemonSelect(page).selectOption({ label: 'Name' });

        await expect(sortPokemonSelect(page)).toHaveValue('name');
        await expect(pokemonListButton(page, 4, 'Charmander')).toBeVisible();
        await expect(pokemonListButton(page, 5, 'Charmeleon')).toBeVisible();
        await expect(pokemonListButton(page, 6, 'Charizard')).toBeVisible();
        await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeHidden();

        const sortedPokemonNames = [...(await visiblePokemonNames(page))].sort((first, second) =>
          first.localeCompare(second)
        );

        await expect
          .poll(() => visiblePokemonNames(page))
          .toEqual(expect.arrayContaining(['Charmander', 'Charmeleon', 'Charizard']));
        await expect.poll(() => visiblePokemonNames(page)).toEqual(sortedPokemonNames);
      }
    );
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

    // Verifies returning to National Pokedex clears the regional pool restriction.
    teamPlannerTest('All/National Pokedex restores the full Pokemon list', async ({ page }) => {
      await gamePokedexSelect(page).selectOption({ label: 'Ruby / Sapphire / Emerald' });

      await expect(pokemonListButton(page, 1, 'Treecko')).toBeVisible();
      await expect(pokemonListButton(page, 4, 'Torchic')).toBeVisible();
      await expect(pokemonListButton(page, 7, 'Mudkip')).toBeVisible();
      await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeHidden();

      await gamePokedexSelect(page).selectOption({ label: 'National Pokedex' });
      await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeVisible();
      await expect(pokemonListButton(page, 1, 'Treecko')).toBeHidden();
      await expect(pokemonListButton(page, 4, 'Torchic')).toBeHidden();
      await expect(pokemonListButton(page, 7, 'Mudkip')).toBeHidden();
    });

    // Verifies sort changes preserve the active regional Pokedex selection.
    teamPlannerTest('Sorting does not clear an active game Pokedex filter', async ({ page }) => {
      await gamePokedexSelect(page).selectOption({ label: 'Ruby / Sapphire / Emerald' });

      await expect(pokemonListButton(page, 1, 'Treecko')).toBeVisible();
      await expect(pokemonListButton(page, 4, 'Torchic')).toBeVisible();
      await expect(pokemonListButton(page, 7, 'Mudkip')).toBeVisible();
      await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeHidden();

      await sortPokemonSelect(page).selectOption({ label: 'Name' });
      await expect(gamePokedexSelect(page).locator('option:checked')).toHaveText(
        'Ruby / Sapphire / Emerald'
      );
      await page.getByRole('searchbox', { name: 'Pokemon' }).fill('Treecko');
      await expect(pokemonListButton(page, 1, 'Treecko')).toBeVisible();
      await page.getByRole('searchbox', { name: 'Pokemon' }).fill('Torchic');
      await expect(pokemonListButton(page, 4, 'Torchic')).toBeVisible();
      await page.getByRole('searchbox', { name: 'Pokemon' }).fill('Mudkip');
      await expect(pokemonListButton(page, 7, 'Mudkip')).toBeVisible();
    });

    // Verifies searching within a regional Pokedex cannot reveal Pokemon outside that pool.
    teamPlannerTest(
      'Search outside an active Pokedex filter does not leak unrelated Pokemon',
      async ({ page }) => {
        await gamePokedexSelect(page).selectOption({ label: 'Ruby / Sapphire / Emerald' });
        await page.getByRole('searchbox', { name: 'Pokemon' }).fill('Bulbasaur');

        await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeHidden();
        await expect(page.getByLabel('Pokemon team choices').getByRole('paragraph')).toContainText(
          'No Pokemon match this search.'
        );
      }
    );
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
      await expect(analysisTypeBadge(page, 'Fire x1')).toBeVisible();
    });

    // Verifies a full team shows six occupied slots and disables additional Pokemon choices.
    teamPlannerTest(
      'Selecting six Pokemon fills all team slots and prevents overflow',
      async ({ page }) => {
        const teamPokemon = [
          [1, 'Bulbasaur'],
          [2, 'Ivysaur'],
          [3, 'Venusaur'],
          [4, 'Charmander'],
          [5, 'Charmeleon'],
          [6, 'Charizard']
        ] as const;

        for (const [pokedexNumber, pokemonName] of teamPokemon) {
          await pokemonListButton(page, pokedexNumber, pokemonName).click();
        }

        await expect(page.getByText('6/6 selected')).toBeVisible();
        await expect(page.getByText('7/6 selected')).toBeHidden();
        await expect(page.getByRole('button', { name: /^remove all$/i })).toBeEnabled();

        for (const [, pokemonName] of teamPokemon) {
          await expect(
            page.getByRole('button', { name: new RegExp(`^remove ${pokemonName}$`, 'i') })
          ).toBeVisible();
        }

        await expect(pokemonListButton(page, 7, 'Squirtle')).toBeDisabled();
        await expect(page.getByRole('button', { name: /^remove squirtle$/i })).toBeHidden();
      }
    );

    // Verifies removing one Pokemon frees a slot and recalculates the team summary.
    teamPlannerTest(
      'Remove deletes one selected Pokemon and recomputes team analysis',
      async ({ page }) => {
        await pokemonListButton(page, 1, 'Bulbasaur').click();
        await pokemonListButton(page, 4, 'Charmander').click();

        await expect(page.getByText('2/6 selected')).toBeVisible();
        await expect(averageStatsPanel(page).getByText(/^42$/).first()).toBeVisible();

        await page.getByRole('button', { name: /^remove charmander$/i }).click();

        await expect(page.getByText('1/6 selected')).toBeVisible();
        await expect(page.getByRole('button', { name: /^remove charmander$/i })).toBeHidden();
        await expect(page.getByRole('button', { name: /^remove bulbasaur$/i })).toBeVisible();
        await expect(averageStatsPanel(page).getByText(/^45$/).first()).toBeVisible();
      }
    );

    // Verifies Remove All clears every selected Pokemon and returns to the empty team state.
    teamPlannerTest('Remove All clears team slots and disables itself', async ({ page }) => {
      await pokemonListButton(page, 1, 'Bulbasaur').click();
      await pokemonListButton(page, 4, 'Charmander').click();

      await expect(page.getByText('2/6 selected')).toBeVisible();
      await expect(page.getByRole('button', { name: /^remove all$/i })).toBeEnabled();

      await page.getByRole('button', { name: /^remove all$/i }).click();

      await expect(page.getByText('0/6 selected')).toBeVisible();
      await expect(page.getByRole('button', { name: /^remove all$/i })).toBeDisabled();
      await expect(page.getByRole('button', { name: /^remove bulbasaur$/i })).toBeHidden();
      await expect(page.getByRole('button', { name: /^remove charmander$/i })).toBeHidden();
      await expect(page.getByText('Add Pokemon to scan team weaknesses.')).toBeVisible();
    });

    // Verifies Randomize Team fills all six slots with removable Pokemon.
    teamPlannerTest('Randomize Team fills a valid six-Pokemon team', async ({ page }) => {
      await page.getByRole('button', { name: /^randomize team$/i }).click();

      await expect(page.getByText('6/6 selected')).toBeVisible();
      await expect(page.getByText('7/6 selected')).toBeHidden();
      await expect(page.getByRole('button', { name: /^remove all$/i })).toBeEnabled();
      await expect(page.getByRole('button', { name: /^remove (?!all$).+/i })).toHaveCount(6);
      await expect(page.getByRole('heading', { name: /^average stats$/i })).toBeVisible();
    });
  });

  test.describe('Moves / Analysis', () => {
    // Verifies selected Pokemon expose move selectors and stat summaries.
    teamPlannerTest(
      'Selected Pokemon exposes move selectors and average stats',
      async ({ page }) => {
        await pokemonListButton(page, 1, 'Bulbasaur').click();

        await expect(page.getByText('MOVE 1')).toBeVisible();
        await expect(moveSelect(page, 1)).toContainText(/Vine Whip/i);

        await expect(averageStatsPanel(page)).toBeVisible();
        await expect(averageStatsPanel(page).getByText(/^HP$/)).toBeVisible();
        await expect(averageStatsPanel(page).getByText(/^45$/).first()).toBeVisible();
      }
    );

    // Verifies selected moves drive the Strong Against offensive coverage panel.
    teamPlannerTest('Choosing a move updates offensive strengths', async ({ page }) => {
      await pokemonListButton(page, 1, 'Bulbasaur').click();

      for (const moveNumber of [1, 2, 3, 4]) {
        await moveSelect(page, moveNumber).selectOption({ value: '' });
      }

      await moveSelect(page, 1).selectOption({ value: 'vine-whip' });

      await expect(moveSelect(page, 1).locator('option:checked')).toContainText(/Vine Whip/i);
      await expect(page.getByRole('heading', { name: /^strong against$/i })).toBeVisible();
      await expect(analysisTypeBadge(page, 'Ground')).toBeVisible();
      await expect(analysisTypeBadge(page, 'Rock')).toBeVisible();
      await expect(analysisTypeBadge(page, 'Water')).toBeVisible();
    });

    // Verifies clearing a selected move leaves the move slot empty.
    teamPlannerTest('Removing a move returns the slot to Empty Slot', async ({ page }) => {
      await pokemonListButton(page, 1, 'Bulbasaur').click();

      await expect(moveSelect(page, 1)).toHaveValue('tackle');
      await moveSelect(page, 1).selectOption({ value: '' });

      await expect(moveSelect(page, 1)).toHaveValue('');
      await expect(moveSelect(page, 1).locator('option:checked')).toHaveText('Empty Slot');
    });

    // Verifies adding multiple Pokemon combines weakness, resistance, and stat analysis.
    teamPlannerTest(
      'Team weaknesses and resistances update after multiple Pokemon',
      async ({ page }) => {
        await pokemonListButton(page, 1, 'Bulbasaur').click();
        await pokemonListButton(page, 4, 'Charmander').click();

        await expect(page.getByText('2/6 selected')).toBeVisible();
        await expect(page.getByRole('heading', { name: /^weaknesses$/i })).toBeVisible();
        await expect(analysisTypeBadge(page, 'Water x1')).toBeVisible();
        await expect(analysisTypeBadge(page, 'Rock x1')).toBeVisible();
        await expect(page.getByRole('heading', { name: /^resistances$/i })).toBeVisible();
        await expect(analysisTypeBadge(page, 'Fire resist 1')).toBeVisible();
        await expect(analysisTypeBadge(page, 'Grass resist 2')).toBeVisible();
        await expect(averageStatsPanel(page).getByText(/^42$/).first()).toBeVisible();
      }
    );
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

    // Verifies opening the station menu leaves the in-progress team intact underneath it.
    teamPlannerTest(
      'Menu during a partially built team preserves or intentionally resets state',
      async ({ page }) => {
        await pokemonListButton(page, 1, 'Bulbasaur').click();

        await expect(page.getByText('1/6 selected')).toBeVisible();
        await page.getByRole('button', { name: /^menu$/i }).click();

        await expect(page.getByRole('button', { name: /^home$/i })).toBeVisible();
        await expect(page.getByText('1/6 selected')).toBeVisible();
        await expect(page.getByRole('button', { name: /^remove bulbasaur$/i })).toBeVisible();
      }
    );

    // Verifies a browser reload returns to the station chooser and can reopen a clean planner.
    teamPlannerTest('Browser reload returns to a stable planner state', async ({ page }) => {
      await pokemonListButton(page, 1, 'Bulbasaur').click();

      await expect(page.getByText('1/6 selected')).toBeVisible();
      await page.reload();

      await expect(page.getByText(/choose your station/i)).toBeVisible();
      await page.getByRole('button', { name: /pokemon team planner/i }).click();

      await expect(page.getByRole('heading', { name: /pokemon team planner/i })).toBeVisible();
      await expect(page.getByText('0/6 selected')).toBeVisible();
      await expect(page.getByRole('button', { name: /^remove all$/i })).toBeDisabled();
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

    // Verifies repeated randomize and clear actions do not strand disabled controls.
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

      await page.addInitScript(() => {
        localStorage.clear();
        sessionStorage.clear();
        void indexedDB
          .databases?.()
          .then((databases) =>
            databases.forEach(
              (database) => database.name && indexedDB.deleteDatabase(database.name)
            )
          );
      });

      await page.route('**/pokeapi.co/**', async (route) => {
        await pokemonRequestsCanContinue;
        await route.continue();
      });

      await page.goto('/');
      await page.getByRole('button', { name: /pokemon team planner/i }).click();

      await expect(page.getByRole('heading', { name: /pokemon team planner/i })).toBeVisible();
      await expect(gamePokedexSelect(page)).toBeEnabled();
      await expect(sortPokemonSelect(page)).toBeVisible();
      await expect(sortPokemonSelect(page)).toHaveValue('entry');
      await expect(page.getByRole('button', { name: /^randomize team$/i })).toBeVisible();
      await expect(page.getByText('0/6 selected')).toBeVisible();
      await expect(pokemonListButtons(page)).toHaveCount(0);

      releasePokemonRequests();

      await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeVisible({ timeout: 30_000 });
      await expect(plannerPageLabel(page, 1, 7)).toBeVisible();
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
