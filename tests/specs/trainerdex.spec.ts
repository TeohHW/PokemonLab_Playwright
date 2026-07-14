import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/test';

test.describe('@live TrainerDex', () => {
  // Opens TrainerDex from the home station chooser and waits for the initial Kanto trainer list.
  async function openTrainerDex(page: Page) {
    await page.goto('/');
    await page.getByRole('button', { name: /trainerdex/i }).click();

    await expect(page.getByRole('heading', { name: /^trainerdex$/i })).toBeVisible();
    await expect(page.getByText('GAME / REGION')).toBeVisible();
    await expect(searchInput(page)).toBeVisible();
    await expect(trainerButton(page, 'Brock')).toBeVisible({ timeout: 30_000 });
  }

  const trainerDexTest = test.extend<{ openTrainerDexStation: void }>({
    openTrainerDexStation: [
      async ({ page }, use) => {
        await openTrainerDex(page);
        await use();
      },
      { auto: true }
    ]
  });

  function searchInput(page: Page) {
    return page.getByPlaceholder('Name, role, Pokemon...');
  }

  function trainerButton(page: Page, trainerName: string) {
    return page
      .getByRole('complementary')
      .getByRole('button', { name: new RegExp(`^${trainerName}\\b`, 'i') })
      .first();
  }

  function regionButton(page: Page, regionName: string) {
    const regionCardNames: Record<string, RegExp> = {
      Kanto: /FireRed\s*\/\s*LeafGreen\s+Kanto/i,
      Johto: /HeartGold\s*\/\s*SoulSilver\s+Johto/i,
      Hoenn: /Omega Ruby\s*\/\s*Alpha Sapphire\s+Hoenn/i,
      Sinnoh: /Diamond\s*\/\s*Pearl\s*\/\s*Platinum\s+Sinnoh/i,
      Unova: /Black\s*\/\s*White\s*\/\s*Black 2\s*\/\s*White 2\s+Unova/i,
      Kalos: /X\s*\/\s*Y\s+Kalos/i,
      Alola: /Sun\s*\/\s*Moon\s+Alola/i,
      Galar: /Sword\s*\/\s*Shield\s+Galar/i,
      Paldea: /Scarlet\s*\/\s*Violet\s+Paldea/i
    };

    return page.getByRole('complementary').getByRole('button', {
      name: regionCardNames[regionName] ?? new RegExp(regionName, 'i')
    });
  }

  function gameVersionButton(page: Page, versionName: string) {
    return page.getByRole('complementary').getByRole('button', {
      name: new RegExp(`^${versionName}$`, 'i')
    });
  }

  function teamPokemonButton(page: Page, pokemonName: string) {
    return page
      .getByRole('main')
      .getByRole('button', { name: new RegExp(`^Open ${pokemonName} TCG cards$`, 'i') })
      .first();
  }

  function trainerTcgDialog(page: Page) {
    return page.getByRole('dialog', { name: /tcg cards/i });
  }

  function trainerDetailHeading(page: Page, trainerName: string) {
    return page
      .getByRole('main')
      .getByRole('heading', { name: new RegExp(`^${trainerName}$`, 'i'), level: 2 });
  }

  function trainerDetailText(page: Page, text: string | RegExp) {
    return page.getByRole('main').getByText(text);
  }

  async function clearTrainerSearch(page: Page) {
    const clearButton = page.getByRole('button', { name: /clear trainer search/i });

    await expect(clearButton).toBeEnabled();
    await clearButton.click();
    await expect(searchInput(page)).toHaveValue('');
    await expect(clearButton).toBeDisabled();
  }

  test.describe('Station / Initial Load', () => {
    // Verifies the station opens with region/version controls, trainer list, and Brock detail.
    trainerDexTest('Starts TrainerDex station', async ({ page }) => {
      await expect(regionButton(page, 'Kanto')).toBeVisible();
      await expect(gameVersionButton(page, 'FIRERED LEAFGREEN')).toBeVisible();
      await expect(gameVersionButton(page, 'HEARTGOLD SOULSILVER')).toBeVisible();
      await expect(page.getByText(/^TRAINERS$/i)).toBeVisible();
      await expect(trainerButton(page, 'Brock')).toBeVisible();
      await expect(trainerButton(page, 'Misty')).toBeVisible();
      await expect(trainerDetailHeading(page, 'Brock')).toBeVisible();
      await expect(trainerDetailText(page, 'Pewter City Gym Leader')).toBeVisible();
      await expect(trainerDetailText(page, 'POKEMON TEAM')).toBeVisible();
      await expect(teamPokemonButton(page, 'Geodude')).toBeVisible();
      await expect(teamPokemonButton(page, 'Onix')).toBeVisible();
    });

    // Verifies the station menu can return to the home station chooser.
    trainerDexTest('Menu returns from TrainerDex to the home station chooser', async ({ page }) => {
      await page.getByRole('button', { name: /^menu$/i }).click();
      await expect(page.getByRole('button', { name: /^home$/i })).toBeVisible();
      await page.getByRole('button', { name: /^home$/i }).click();

      await expect(page.getByText(/choose (?:your|a) station/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /trainerdex/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /pokemon team planner/i })).toBeVisible();
    });

    // Verifies the core controls remain usable on a narrow mobile viewport.
    test('Initial TrainerDex controls remain usable on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await openTrainerDex(page);

      await expect(searchInput(page)).toBeVisible();
      await expect(regionButton(page, 'Kanto')).toBeVisible();
      await expect(trainerButton(page, 'Brock')).toBeVisible();
      await expect(trainerDetailHeading(page, 'Brock')).toBeVisible();
    });
  });

  test.describe('Search', () => {
    // Verifies trainer-name search narrows the list and selects the matching trainer.
    trainerDexTest(
      'Search by trainer name selects the matching trainer detail',
      async ({ page }) => {
        await searchInput(page).fill('misty');

        await expect(trainerButton(page, 'Misty')).toBeVisible();
        await expect(trainerButton(page, 'Brock')).toBeHidden();
        await expect(trainerDetailHeading(page, 'Misty')).toBeVisible();
        await expect(trainerDetailText(page, 'Cerulean City Gym Leader')).toBeVisible();
        await expect(trainerDetailText(page, /Water-type Pokemon/i)).toBeVisible();
      }
    );

    // Verifies Pokemon-name search finds trainers whose teams include that Pokemon.
    trainerDexTest('Search by Pokemon name finds trainers using that Pokemon', async ({ page }) => {
      await searchInput(page).fill('onix');

      await expect(trainerButton(page, 'Brock')).toBeVisible();
      await expect(trainerButton(page, 'Bruno')).toBeVisible();
      await expect(trainerDetailHeading(page, 'Brock')).toBeVisible();
      await expect(teamPokemonButton(page, 'Onix')).toBeVisible();
    });

    // Verifies role search can find trainers across regions and categories.
    trainerDexTest('Search by role finds Elite Four trainers across regions', async ({ page }) => {
      await searchInput(page).fill('elite four');

      await expect(page.getByText(/^ELITE FOUR$/i)).toBeVisible();
      await expect(trainerButton(page, 'Lorelei')).toBeVisible();
      await expect(trainerButton(page, 'Will')).toBeVisible();
      await expect(trainerButton(page, 'Sidney')).toBeVisible();
      await expect(trainerDetailHeading(page, 'Lorelei')).toBeVisible();
    });

    // Verifies unmatched search text shows an empty state while the selected detail stays stable.
    trainerDexTest(
      'Invalid search shows no trainer matches without breaking detail view',
      async ({ page }) => {
        await searchInput(page).fill('zzzzzz');

        await expect(page.getByText('No trainers match this search.')).toBeVisible();
        await expect(trainerButton(page, 'Brock')).toBeHidden();
        await expect(trainerButton(page, 'Misty')).toBeHidden();
        await expect(trainerDetailHeading(page, 'Brock')).toBeVisible();
        await expect(trainerDetailText(page, 'POKEMON TEAM')).toBeVisible();
      }
    );

    // Verifies Clear restores the default trainer list after filtering.
    trainerDexTest('Clear search restores the trainer list', async ({ page }) => {
      await searchInput(page).fill('misty');
      await expect(trainerButton(page, 'Misty')).toBeVisible();
      await expect(trainerButton(page, 'Brock')).toBeHidden();

      await clearTrainerSearch(page);

      await expect(trainerButton(page, 'Brock')).toBeVisible();
      await expect(trainerButton(page, 'Misty')).toBeVisible();
    });

    // Verifies special-character input validates safely and preserves the current trainer list.
    trainerDexTest(
      'Special-character search text preserves the trainer list safely',
      async ({ page }) => {
        await searchInput(page).fill('!@#$%');

        await expect(trainerButton(page, 'Brock')).toBeVisible();
        await expect(trainerButton(page, 'Misty')).toBeVisible();
        await expect(page.getByRole('button', { name: /clear trainer search/i })).toBeEnabled();
      }
    );
  });

  test.describe('Regions / Versions', () => {
    // Verifies switching to Johto updates the trainer pool and selected trainer detail.
    trainerDexTest(
      'Johto region shows Johto trainers and hides Kanto-only trainers',
      async ({ page }) => {
        await regionButton(page, 'Johto').click();

        await expect(gameVersionButton(page, 'HEARTGOLD SOULSILVER')).toBeVisible();
        await expect(gameVersionButton(page, 'GOLD SILVER')).toBeVisible();
        await expect(trainerButton(page, 'Falkner')).toBeVisible();
        await expect(trainerButton(page, 'Red')).toBeVisible();
        await expect(trainerButton(page, 'Misty')).toBeHidden();
        await expect(trainerDetailHeading(page, 'Falkner')).toBeVisible();
        await expect(trainerDetailText(page, 'Violet City Gym Leader')).toBeVisible();
        await expect(teamPokemonButton(page, 'Pidgey')).toBeVisible();
      }
    );

    // Verifies switching to Hoenn exposes Hoenn versions and trainer categories.
    trainerDexTest('Hoenn region exposes Hoenn versions and trainers', async ({ page }) => {
      await regionButton(page, 'Hoenn').click();

      await expect(gameVersionButton(page, 'OMEGA RUBY ALPHA SAPPHIRE')).toBeVisible();
      await expect(gameVersionButton(page, 'EMERALD')).toBeVisible();
      await expect(gameVersionButton(page, 'RUBY SAPPHIRE')).toBeVisible();
      await expect(trainerButton(page, 'Roxanne')).toBeVisible();
      await expect(trainerButton(page, 'Wally')).toBeVisible();
      await expect(trainerButton(page, 'Zinnia')).toBeVisible();
      await expect(trainerDetailHeading(page, 'Roxanne')).toBeVisible();
      await expect(trainerDetailText(page, 'Rustboro City Gym Leader')).toBeVisible();
    });

    // Verifies game version switches keep the current region and refresh trainer detail data.
    trainerDexTest(
      'Game version switch keeps the active Hoenn trainer usable',
      async ({ page }) => {
        await regionButton(page, 'Hoenn').click();
        await expect(trainerDetailText(page, /^Omega Ruby Alpha Sapphire$/i)).toBeVisible();

        await gameVersionButton(page, 'EMERALD').click();

        await expect(trainerDetailText(page, /^Emerald$/i)).toBeVisible();
        await expect(trainerDetailHeading(page, 'Roxanne')).toBeVisible();
        await expect(teamPokemonButton(page, 'Geodude')).toBeVisible();
        await expect(page.getByText('AVERAGE LEVEL')).toBeVisible();

        await gameVersionButton(page, 'RUBY SAPPHIRE').click();

        await expect(trainerDetailText(page, /^Ruby Sapphire$/i)).toBeVisible();
        await expect(trainerDetailHeading(page, 'Roxanne')).toBeVisible();
        await expect(teamPokemonButton(page, 'Nosepass')).toBeVisible();
      }
    );

    // Verifies search can intentionally find trainers outside the currently selected region.
    trainerDexTest(
      'Search from an active region can find trainers across regions',
      async ({ page }) => {
        await regionButton(page, 'Hoenn').click();
        await searchInput(page).fill('Misty');

        await expect(trainerButton(page, 'Misty')).toBeVisible();
        await expect(trainerDetailHeading(page, 'Misty')).toBeVisible();
        await expect(trainerDetailText(page, 'Cerulean City Gym Leader')).toBeVisible();
      }
    );
  });

  test.describe('Trainer Details', () => {
    // Verifies selecting another trainer updates role, stats, team, and TCG panels.
    trainerDexTest('Selecting a trainer opens the correct detail view', async ({ page }) => {
      await trainerButton(page, 'Misty').click();

      await expect(trainerDetailHeading(page, 'Misty')).toBeVisible();
      await expect(trainerDetailText(page, 'Cerulean City Gym Leader')).toBeVisible();
      await expect(page.getByText('AVERAGE LEVEL')).toBeVisible();
      await expect(page.getByText('TEAM SIZE')).toBeVisible();
      await expect(page.getByText('TYPES USED')).toBeVisible();
      await expect(page.getByRole('heading', { name: /^Featured TCG Cards$/i })).toBeVisible();
      await expect(teamPokemonButton(page, 'Starmie')).toBeVisible();
    });

    // Verifies clicking a Pokemon opens the team-specific TCG modal and Close dismisses it.
    trainerDexTest('Team Pokemon opens and closes featured TCG card modal', async ({ page }) => {
      await teamPokemonButton(page, 'Onix').click();

      await expect(trainerTcgDialog(page)).toBeVisible();
      await expect(trainerTcgDialog(page).getByText(/ONIX TCG CARDS/i)).toBeVisible();
      await expect(trainerTcgDialog(page).getByText(/BROCK'S TEAM/i)).toBeVisible();

      await page.getByRole('button', { name: /close pokemon tcg cards/i }).click();

      await expect(trainerTcgDialog(page)).toBeHidden();
      await expect(trainerDetailHeading(page, 'Brock')).toBeVisible();
    });

    // Verifies trainers without local trainer-featured cards show a stable empty card panel.
    trainerDexTest(
      'Trainer without local featured cards shows an empty TCG state',
      async ({ page }) => {
        await searchInput(page).fill('Lorelei');

        await expect(trainerButton(page, 'Lorelei')).toBeVisible();
        await expect(trainerDetailHeading(page, 'Lorelei')).toBeVisible();
        await expect(
          page.getByText('No local trainer-featured TCG cards found for this trainer.')
        ).toBeVisible();
      }
    );
  });

  test.describe('Edge / Reliability', () => {
    // Verifies rapid search and clear cycles keep controls and details usable.
    trainerDexTest('Rapid search and clear actions leave TrainerDex usable', async ({ page }) => {
      const searchCases = [
        {
          term: 'Misty',
          settled: () => expect(trainerButton(page, 'Misty')).toBeVisible()
        },
        {
          term: 'zzzzzz',
          settled: () => expect(page.getByText('No trainers match this search.')).toBeVisible()
        },
        {
          term: 'Brock',
          settled: () => expect(trainerButton(page, 'Brock')).toBeVisible()
        }
      ];

      for (const searchCase of searchCases) {
        await searchInput(page).fill(searchCase.term);
        await searchCase.settled();
        await clearTrainerSearch(page);
        await expect(trainerButton(page, 'Brock')).toBeVisible();
      }

      await expect(searchInput(page)).toBeEnabled();
      await expect(regionButton(page, 'Kanto')).toBeEnabled();
      await expect(trainerDetailHeading(page, 'Brock')).toBeVisible();
    });

    // Verifies rapid region changes settle on a usable selected trainer and trainer list.
    trainerDexTest(
      'Rapid region changes leave one valid trainer detail visible',
      async ({ page }) => {
        await regionButton(page, 'Johto').click();
        await regionButton(page, 'Hoenn').click();
        await regionButton(page, 'Sinnoh').click();
        await regionButton(page, 'Kanto').click();

        await expect(trainerButton(page, 'Brock')).toBeVisible();
        await expect(trainerDetailHeading(page, 'Brock')).toBeVisible();
        await expect(trainerDetailText(page, 'POKEMON TEAM')).toBeVisible();
        await expect(teamPokemonButton(page, 'Onix')).toBeVisible();
      }
    );

    // Verifies broken external image assets do not block TrainerDex navigation or selection.
    test('Image request failures leave TrainerDex controls usable', async ({ page }) => {
      await page.route('**/*.{png,jpg,jpeg,gif,webp,svg}', (route) => route.abort());

      await openTrainerDex(page);

      await expect(searchInput(page)).toBeVisible();
      await expect(trainerButton(page, 'Brock')).toBeVisible();
      await trainerButton(page, 'Misty').click();
      await expect(trainerDetailHeading(page, 'Misty')).toBeVisible();
      await expect(teamPokemonButton(page, 'Starmie')).toBeVisible();
    });

    // Verifies delayed Pokemon API data leaves the station shell usable before analysis loads.
    test('Delayed Pokemon data keeps TrainerDex shell stable', async ({ page }) => {
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
      await page.getByRole('button', { name: /trainerdex/i }).click();

      await expect(page.getByRole('heading', { name: /^trainerdex$/i })).toBeVisible();
      await expect(searchInput(page)).toBeVisible();
      await expect(trainerButton(page, 'Brock')).toBeVisible();
      await expect(page.getByText('Loading team analysis...')).toBeVisible();

      releasePokemonRequests();

      await expect(page.getByText('Loading team analysis...')).toBeHidden({ timeout: 30_000 });
      await expect(page.getByText('AVERAGE STATS')).toBeVisible();
      await expect(teamPokemonButton(page, 'Onix')).toBeVisible();
    });
  });
});
