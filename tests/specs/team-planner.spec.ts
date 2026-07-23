import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/test';

test.describe('@live Pokemon Team Planner', () => {
  async function openTeamPlanner(page: Page) {
    await page.goto('/');
    await page.getByRole('button', { name: /pokemon team planner/i }).click();

    await expect(page.getByRole('heading', { name: /pokemon team planner/i })).toBeVisible();
    await expect(page.getByRole('combobox', { name: /game pokedex/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^fill randomly$/i })).toBeVisible();
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
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
      void indexedDB
        .databases?.()
        .then((databases) =>
          databases.forEach((database) => database.name && indexedDB.deleteDatabase(database.name))
        );
    });
  }

  test.describe('Station / Initial Load', () => {
    teamPlannerTest('Starts with the complete planning workspace', async ({ page }) => {
      await expect(gamePokedexSelect(page)).toHaveValue('all');
      await expect(battleFormatSelect(page)).toHaveValue('open');
      await expect(sortPokemonSelect(page)).toHaveValue('entry');
      await expect(page.getByRole('searchbox', { name: 'Pokemon' })).toBeVisible();
      await expect(page.getByText('0/6 selected')).toBeVisible();
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

    teamPlannerTest('Starts the assistant and analysis in an empty state', async ({ page }) => {
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
      await page.getByRole('button', { name: /pokemon team planner/i }).click();

      await expect(page.getByRole('heading', { name: /pokemon team planner/i })).toBeVisible();
      await expect(gamePokedexSelect(page)).toBeVisible();
      await expect(battleFormatSelect(page)).toBeVisible();
      await expect(page.getByText('0/6 selected')).toBeVisible();
      await expect(page.getByRole('button', { name: /^remove all$/i })).toBeDisabled();
      await expect(pokemonListButtons(page)).toHaveCount(0);

      releaseRequests();
      await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeVisible({ timeout: 30_000 });
    });

    test('Keeps primary controls usable on a mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await openTeamPlanner(page);

      await expect(page.getByRole('searchbox', { name: 'Pokemon' })).toBeVisible();
      await expect(gamePokedexSelect(page)).toBeVisible();
      await expect(battleFormatSelect(page)).toBeVisible();
      await expect(page.getByRole('button', { name: /^fill randomly$/i })).toBeEnabled();
      await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeVisible();
    });
  });

  test.describe('Filtering / Sorting / Pokedex', () => {
    teamPlannerTest('Searches by Pokemon name case-insensitively', async ({ page }) => {
      await page.getByRole('searchbox', { name: 'Pokemon' }).fill('pIkAcHu');
      await expect(pokemonListButton(page, 25, 'Pikachu')).toBeVisible();
      await expect(pokemonListButtons(page)).toHaveCount(1);
    });

    teamPlannerTest('Searches by Pokedex number', async ({ page }) => {
      await page.getByRole('searchbox', { name: 'Pokemon' }).fill('25');
      await expect(pokemonListButton(page, 25, 'Pikachu')).toBeVisible();
      await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeHidden();
    });

    teamPlannerTest('Invalid search reaches a safe empty state', async ({ page }) => {
      await page.getByRole('searchbox', { name: 'Pokemon' }).fill('not-a-real-pokemon');
      await expect(pokemonListButtons(page)).toHaveCount(0);
      await expect(page.getByLabel('Pokemon team choices')).toContainText(
        'No Pokemon match this search.'
      );
      await expect(page.getByText('0/6 selected')).toBeVisible();
    });

    teamPlannerTest('Clearing search restores the first result page', async ({ page }) => {
      const search = page.getByRole('searchbox', { name: 'Pokemon' });
      await search.fill('Pikachu');
      await expect(pokemonListButtons(page)).toHaveCount(1);
      await search.clear();
      await expect(pokemonListButtons(page)).toHaveCount(24);
      await expect(page.getByLabel('Team Pokemon pages')).toContainText('Page 1 / 43');
    });

    teamPlannerTest('Sorts the visible Pokemon alphabetically', async ({ page }) => {
      await sortPokemonSelect(page).selectOption({ label: 'Name' });
      await expect(sortPokemonSelect(page)).toHaveValue('name');
      const expected = [...(await visiblePokemonNames(page))].sort((a, b) => a.localeCompare(b));
      await expect.poll(() => visiblePokemonNames(page)).toEqual(expected);
    });

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

    teamPlannerTest('Changing game Pokedex preserves an in-progress team', async ({ page }) => {
      await addPokemon(page, 1, 'Bulbasaur');
      await gamePokedexSelect(page).selectOption({ label: 'Ruby / Sapphire / Emerald' });

      await expect(page.getByText('1/6 selected')).toBeVisible();
      await expect(page.getByRole('button', { name: /^remove bulbasaur$/i })).toBeVisible();
      await expect(pokemonListButton(page, 1, 'Treecko')).toBeVisible();
    });

    teamPlannerTest('Supports the Legends Z-A Pokedex profile', async ({ page }) => {
      await gamePokedexSelect(page).selectOption({ label: 'Legends: Z-A' });
      await expect(gamePokedexSelect(page).locator('option:checked')).toHaveText('Legends: Z-A');
      await expect(pokemonListButtons(page)).toHaveCount(24);
      await expect(page.getByText(/available in Legends: Z-A/i)).toBeVisible();
    });
  });

  test.describe('Manual and Automatic Team Building', () => {
    teamPlannerTest(
      'Adds and removes a Pokemon while recomputing the workspace',
      async ({ page }) => {
        await addPokemon(page, 1, 'Bulbasaur');

        await expect(page.getByText('1/6 selected')).toBeVisible();
        await expect(occupiedTeamCards(page)).toHaveCount(1);
        await expect(scorePanel(page)).not.toHaveAccessibleName('Team guidance score 0 out of 100');
        await expect(page.getByRole('button', { name: /^remove all$/i })).toBeEnabled();

        await page.getByRole('button', { name: /^remove bulbasaur$/i }).click();
        await expect(page.getByText('0/6 selected')).toBeVisible();
        await expect(occupiedTeamCards(page)).toHaveCount(0);
        await expect(page.getByLabel('Team guidance score 0 out of 100')).toBeVisible();
      }
    );

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

    teamPlannerTest('Remove All restores every empty slot', async ({ page }) => {
      await addPokemon(page, 1, 'Bulbasaur');
      await addPokemon(page, 4, 'Charmander');
      await page.getByRole('button', { name: /^remove all$/i }).click();

      await expect(page.getByText('0/6 selected')).toBeVisible();
      await expect(occupiedTeamCards(page)).toHaveCount(0);
      await expect(teamSlots(page).getByRole('article')).toHaveCount(6);
      await expect(page.getByRole('button', { name: /^remove all$/i })).toBeDisabled();
    });

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
    teamPlannerTest('Shows format-specific guidance and a legal status', async ({ page }) => {
      await addPokemon(page, 1, 'Bulbasaur');
      await battleFormatSelect(page).selectOption({ label: 'Singles — Species Clause' });

      await expect(page.getByText(/one of each species/i)).toBeVisible();
      await expect(page.getByRole('status')).toHaveText(
        'Team composition is legal for this planner profile.'
      );
      await expect(page.getByText('1/6 selected')).toBeVisible();
    });

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

    teamPlannerTest(
      'VGC format reports an existing Mega form without silently changing it',
      async ({ page }) => {
        await addPokemon(page, 6, 'Charizard');
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
    teamPlannerTest('Loads the selected champion roster into an empty team', async ({ page }) => {
      const championSelect = page.getByRole('combobox', { name: /world champion team/i });
      await expect(championSelect.locator('option')).toHaveCount(15);
      await expect(championSelect.locator('option:checked')).toContainText('2025');

      await page.getByRole('button', { name: /^fill champion team$/i }).click();
      await expect(page.getByText('6/6 selected')).toBeVisible({ timeout: 30_000 });
      await expect(occupiedTeamCards(page)).toHaveCount(6);
      await expect(
        page.getByRole('link', { name: /winning roster source|world championships/i })
      ).toBeVisible();
    });

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

  test.describe('Build Customization', () => {
    teamPlannerTest(
      'Shows sourced moves, abilities, nature, and analysis for a build',
      async ({ page }) => {
        await addPokemon(page, 1, 'Bulbasaur');
        const card = teamCard(page, 'Bulbasaur');

        await expect(card.getByText(/ability — select one/i)).toBeVisible();
        await expect(
          card.getByRole('button', { name: /select overgrow ability/i })
        ).toHaveAttribute('aria-pressed', 'true');
        await expect(card.getByRole('button', { name: /hidden ability/i })).toBeVisible();
        await expect(card.getByText(/^nature$/i)).toBeVisible();
        await expect(card.getByRole('link', { name: /learnset/i })).toBeVisible();
        await expect(card.getByRole('combobox', { name: /^move \d$/i })).toHaveCount(4);
        await expect(page.getByRole('heading', { name: /nature-adjusted stats/i })).toBeVisible();
      }
    );

    teamPlannerTest('Ability selection opens an accessible detail dialog', async ({ page }) => {
      await addPokemon(page, 6, 'Charizard');
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

    teamPlannerTest('Nature picker can search and apply a different nature', async ({ page }) => {
      await addPokemon(page, 1, 'Bulbasaur');
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

    teamPlannerTest(
      'Changing form refreshes identity, typing, BST, and ability',
      async ({ page }) => {
        await addPokemon(page, 6, 'Charizard');
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

    teamPlannerTest(
      'Move changes immediately update move and coverage analysis',
      async ({ page }) => {
        await addPokemon(page, 1, 'Bulbasaur');
        for (const moveNumber of [1, 2, 3, 4]) {
          await moveSelect(page, moveNumber).selectOption('');
        }
        await expect(page.getByText(/choose moves to analyse/i)).toBeVisible();

        await moveSelect(page, 1).selectOption('vine-whip');
        await expect(moveSelect(page, 1).locator('option:checked')).toContainText(/Vine Whip/i);
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

    teamPlannerTest(
      'Nature effects toggle switches between adjusted and base stats',
      async ({ page }) => {
        await addPokemon(page, 1, 'Bulbasaur');
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
    teamPlannerTest('Adding a Pokemon produces a bounded transparent score', async ({ page }) => {
      await addPokemon(page, 6, 'Charizard');

      await expect(scorePanel(page)).toBeVisible();
      const score = Number((await scorePanel(page).getByRole('strong').textContent()) ?? '-1');
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
      await expect(page.getByText(/not an objective verdict or guarantee/i)).toBeVisible();
      await expect(page.getByLabel('Team score factors').getByRole('meter')).toHaveCount(6);
    });

    teamPlannerTest('Assistant reports roles and recommendation evidence', async ({ page }) => {
      await addPokemon(page, 6, 'Charizard');

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

    teamPlannerTest('Adds an individual recommendation to a partial team', async ({ page }) => {
      await addPokemon(page, 1, 'Bulbasaur');
      await recommendationButtons(page).first().click();

      await expect(page.getByText('2/6 selected')).toBeVisible({ timeout: 30_000 });
      await expect(occupiedTeamCards(page)).toHaveCount(2);
      await expect(page.getByRole('button', { name: /^remove bulbasaur$/i })).toBeVisible();
    });

    teamPlannerTest(
      'Full-team recommendation previews, applies, and undoes a swap',
      async ({ page }) => {
        await page.getByRole('button', { name: /^fill champion team$/i }).click();
        await expect(page.getByText('6/6 selected')).toBeVisible({ timeout: 30_000 });

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
        await expect(
          page.getByRole('button', { name: new RegExp(`^remove ${recommendedPokemon}$`, 'i') })
        ).toBeVisible({ timeout: 30_000 });
        await expect(page.getByRole('button', { name: /^undo swap$/i })).toBeVisible();

        await page.getByRole('button', { name: /^undo swap$/i }).click();
        await expect(
          page.getByRole('button', { name: new RegExp(`^remove ${replacedPokemon}$`, 'i') })
        ).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText('6/6 selected')).toBeVisible();
      }
    );
  });

  test.describe('Navigation and State Lifetime', () => {
    teamPlannerTest('Menu overlay preserves the in-progress team', async ({ page }) => {
      await addPokemon(page, 1, 'Bulbasaur');
      await page.getByRole('button', { name: /^menu$/i }).click();

      await expect(page.getByRole('button', { name: /^home$/i })).toBeVisible();
      await expect(page.getByText('1/6 selected')).toBeVisible();
      await expect(page.getByRole('button', { name: /^remove bulbasaur$/i })).toBeVisible();
    });

    teamPlannerTest('Menu can return to the station chooser', async ({ page }) => {
      await page.getByRole('button', { name: /^menu$/i }).click();
      await page.getByRole('button', { name: /^home$/i }).click();

      await expect(page.getByText(/choose (?:your|a) station/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /pokemon team planner/i })).toBeVisible();
    });

    teamPlannerTest('Reload resets memory-only team state', async ({ page }) => {
      await addPokemon(page, 1, 'Bulbasaur');
      await page.reload();
      await expect(page.getByText(/choose (?:your|a) station/i)).toBeVisible();
      await page.getByRole('button', { name: /pokemon team planner/i }).click();

      await expect(page.getByText('0/6 selected')).toBeVisible();
      await expect(occupiedTeamCards(page)).toHaveCount(0);
    });
  });

  test.describe('Edge / Reliability', () => {
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

    test('Image failures do not block planner interactions', async ({ page }) => {
      await page.route('**/*.{png,jpg,jpeg,gif,webp,svg}', (route) => route.abort());
      await openTeamPlanner(page);
      await addPokemon(page, 1, 'Bulbasaur');

      await expect(page.getByText('1/6 selected')).toBeVisible();
      await expect(moveSelect(page, 1)).toBeVisible();
      await expect(page.getByRole('button', { name: /^remove all$/i })).toBeEnabled();
    });

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

    teamPlannerTest(
      'Closing the nature dialog leaves build controls unchanged',
      async ({ page }) => {
        await addPokemon(page, 1, 'Bulbasaur');
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
