import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/test';
import { homeStationButton } from '../pages/HomePage';

test.describe('@live TrainerDex', () => {
  // Opens TrainerDex from the home station chooser and waits for the initial Kanto trainer list.
  async function openTrainerDex(page: Page) {
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('pokemon-lab-trainerdex-view-v1'));
    await homeStationButton(page, 'trainerdex').click();

    await expect(page.getByRole('heading', { name: /^trainerdex$/i })).toBeVisible();
    await expect(page.getByText('GAME / REGION')).toBeVisible();
    await expect(searchInput(page)).toBeVisible();
    await expect(trainerButton(page, 'Brock')).toBeVisible({ timeout: 30_000 });
    await gameVersionButton(page, 'FIRERED LEAFGREEN').click();
    await expect(gameVersionButton(page, 'FIRERED LEAFGREEN')).toHaveClass(/is-selected/);
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
      Paldea: /Scarlet\s*\/\s*Violet\s+Paldea/i,
      'Lumiose City': /Legends:\s*Z-A\s+Lumiose City/i
    };

    return page.getByRole('complementary').getByRole('button', {
      name: regionCardNames[regionName] ?? new RegExp(regionName, 'i')
    });
  }

  function gameVersionButton(page: Page, versionName: string) {
    return page.getByRole('main').getByRole('button', {
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

    test('Direct trainer route opens the intended trainer and survives reload', async ({
      page
    }) => {
      await page.goto('/#/trainerdex?trainer=misty-kanto&game=firered-leafgreen&stage=initial');

      await expect(page.getByRole('heading', { name: /^trainerdex$/i })).toBeVisible();
      await expect(trainerDetailHeading(page, 'Misty')).toBeVisible({ timeout: 30_000 });
      await expect(trainerDetailText(page, 'Cerulean City Gym Leader')).toBeVisible();
      await expect(page).toHaveURL(
        /#\/trainerdex\?trainer=misty-kanto&game=firered-leafgreen&stage=initial$/
      );

      await page.reload();

      await expect(trainerDetailHeading(page, 'Misty')).toBeVisible({ timeout: 30_000 });
      await expect(teamPokemonButton(page, 'Starmie')).toBeVisible();
    });

    test('Invalid routed game and stage fall back to valid trainer defaults', async ({ page }) => {
      await page.goto(
        '/#/trainerdex?trainer=brock-kanto&game=unavailable-game&stage=unavailable-stage'
      );

      await expect(page.getByRole('heading', { name: /^trainerdex$/i })).toBeVisible();
      await expect(trainerDetailHeading(page, 'Brock')).toBeVisible({ timeout: 30_000 });
      await expect(gameVersionButton(page, 'HEARTGOLD SOULSILVER')).toHaveClass(/is-selected/);
      await expect(teamPokemonButton(page, 'Onix')).toBeVisible();
      await expect(page).toHaveURL(
        /#\/trainerdex\?trainer=brock-kanto&game=heartgold-soulsilver&stage=initial$/
      );
    });

    // Verifies the station menu can return to the home station chooser.
    trainerDexTest('Menu returns from TrainerDex to the home station chooser', async ({ page }) => {
      await page.getByRole('button', { name: /^menu$/i }).click();
      await expect(page.getByRole('button', { name: /^home$/i })).toBeVisible();
      await page.getByRole('button', { name: /^home$/i }).click();

      await expect(page.getByText(/choose (?:your|a) station/i)).toBeVisible();
      await expect(homeStationButton(page, 'trainerdex')).toBeVisible();
      await expect(homeStationButton(page, 'team')).toBeVisible();
    });

    // Verifies the complete desktop dossier becomes tabbed mobile sections with a team carousel.
    test('Adapts TrainerDex across web and mobile viewports', async ({ page }) => {
      const sectionTabs = page.getByRole('navigation', { name: 'Trainer dossier sections' });
      const overviewTab = sectionTabs.getByRole('button', { name: 'Overview', exact: true });
      const teamTab = sectionTabs.getByRole('button', { name: 'Team', exact: true });
      const cardsTab = sectionTabs.getByRole('button', { name: 'Cards', exact: true });
      const overview = page.locator('.trainerdex-hero');
      const team = page.locator('.trainerdex-team-section');
      const cards = page.locator('.trainerdex-tcg-section');

      await page.setViewportSize({ width: 1024, height: 900 });
      await openTrainerDex(page);

      await expect(page.locator('.trainerdex-layout')).toHaveCSS(
        'grid-template-columns',
        /\d+(?:\.\d+)?px \d+(?:\.\d+)?px/
      );
      await expect(sectionTabs).toBeHidden();
      await expect(overview).toBeVisible();
      await expect(team).toBeVisible();
      await expect(cards).toBeVisible();

      await page.setViewportSize({ width: 390, height: 844 });

      await page.getByRole('button', { name: /^show trainer filters$/i }).click();
      await expect(searchInput(page)).toBeVisible();
      await expect(regionButton(page, 'Kanto')).toBeVisible();
      await expect(trainerButton(page, 'Brock')).toBeVisible();
      await expect(trainerDetailHeading(page, 'Brock')).toBeVisible();
      await expect(page.locator('.trainerdex-layout')).toHaveCSS(
        'grid-template-columns',
        /^\d+(?:\.\d+)?px$/
      );
      await expect(page.locator('.trainerdex-region-grid')).toHaveCSS('grid-auto-flow', 'column');
      await expect(page.locator('.trainerdex-region-grid')).toHaveCSS('overflow-x', 'auto');
      await expect(sectionTabs).toBeVisible();
      await expect(sectionTabs).toHaveCSS('position', 'sticky');
      await expect(overviewTab).toHaveAttribute('aria-pressed', 'true');
      await expect(overview).toBeVisible();
      await expect(team).toBeHidden();
      await expect(cards).toBeHidden();

      await teamTab.click();
      await expect(teamTab).toHaveAttribute('aria-pressed', 'true');
      await expect(overview).toBeHidden();
      await expect(team).toBeVisible();
      await expect(cards).toBeHidden();
      await expect(page.locator('.trainerdex-team-panel')).toHaveCSS('grid-auto-flow', 'column');
      await expect(page.locator('.trainerdex-team-panel')).toHaveCSS('overflow-x', 'auto');
      expect(await page.locator('.trainerdex-team-row').count()).toBeGreaterThan(1);
      await expect(page.locator('.trainerdex-move-list li').first()).toBeVisible();
      expect(
        await page
          .locator('.trainerdex-move-list li')
          .first()
          .evaluate((move) => Number.parseFloat(getComputedStyle(move).fontSize))
      ).toBeGreaterThanOrEqual(14);

      await cardsTab.click();
      await expect(cardsTab).toHaveAttribute('aria-pressed', 'true');
      await expect(overview).toBeHidden();
      await expect(team).toBeHidden();
      await expect(cards).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
        )
      ).toBeTruthy();
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

    // Verifies the new Legends: Z-A selection loads its Lumiose trainers and team data.
    trainerDexTest('Legends Z-A exposes Lumiose City trainers and teams', async ({ page }) => {
      await regionButton(page, 'Lumiose City').click();

      await expect(trainerButton(page, 'Urbain')).toBeVisible();
      await expect(trainerButton(page, 'Canari')).toBeVisible();
      await expect(trainerDetailHeading(page, 'Urbain')).toBeVisible();
      await expect(trainerDetailText(page, /^Legends: Z-A$/i)).toBeVisible();
      await expect(teamPokemonButton(page, 'Croconaw')).toBeVisible();
      await expect(teamPokemonButton(page, 'Pignite')).toBeVisible();
      await expect(teamPokemonButton(page, 'Mega Manectric')).toBeVisible();
    });

    // Verifies game version switches keep the current region and refresh trainer detail data.
    trainerDexTest(
      'Game version switch keeps the active Hoenn trainer usable',
      async ({ page }) => {
        await regionButton(page, 'Hoenn').click();
        await expect(
          page
            .getByRole('main')
            .getByRole('paragraph')
            .filter({ hasText: /^Omega Ruby Alpha Sapphire$/i })
        ).toBeVisible();

        await gameVersionButton(page, 'EMERALD').click();

        await expect(
          page
            .getByRole('main')
            .getByRole('paragraph')
            .filter({ hasText: /^Emerald$/i })
        ).toBeVisible();
        await expect(trainerDetailHeading(page, 'Roxanne')).toBeVisible();
        await expect(teamPokemonButton(page, 'Geodude')).toBeVisible();
        await expect(page.getByText('AVERAGE LEVEL')).toBeVisible();

        await gameVersionButton(page, 'RUBY SAPPHIRE').click();

        await expect(
          page
            .getByRole('main')
            .getByRole('paragraph')
            .filter({ hasText: /^Ruby Sapphire$/i })
        ).toBeVisible();
        await expect(trainerDetailHeading(page, 'Roxanne')).toBeVisible();
        await expect(teamPokemonButton(page, 'Nosepass')).toBeVisible();
      }
    );

    // Verifies a recorded rematch stage refreshes the selected trainer's team overview.
    trainerDexTest('Battle stage switch updates a trainer rematch team', async ({ page }) => {
      await page
        .getByRole('main')
        .getByRole('button', { name: /^heartgold soulsilver$/i })
        .click();

      const battleStages = page.getByLabel('Pokemon team battle stage');
      await expect(battleStages.getByRole('button', { name: /^initial team$/i })).toBeVisible();
      await expect(
        battleStages.getByRole('button', { name: /^fighting dojo rematch$/i })
      ).toBeVisible();

      await battleStages.getByRole('button', { name: /^fighting dojo rematch$/i }).click();
      await expect(teamPokemonButton(page, 'Golem')).toBeVisible();
      await expect(teamPokemonButton(page, 'Rampardos')).toBeVisible();
      await expect(page.getByRole('region', { name: /trainer team overview/i })).toBeVisible();
    });

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
    trainerDexTest(
      'Previous and Next browse adjacent trainers and respect boundaries',
      async ({ page }) => {
        const navigation = page.getByLabel('Browse adjacent trainers');
        const previous = navigation.getByRole('button', { name: /previous/i });
        const nextMisty = navigation.getByRole('button', { name: /misty/i });

        await expect(previous).toBeDisabled();
        await nextMisty.click();
        await expect(trainerDetailHeading(page, 'Misty')).toBeVisible();
        await expect(page).toHaveURL(
          /#\/trainerdex\?trainer=misty-kanto&game=firered-leafgreen&stage=initial$/
        );
        await expect(navigation.getByRole('button', { name: /brock/i })).toBeEnabled();

        await navigation.getByRole('button', { name: /brock/i }).click();
        await expect(trainerDetailHeading(page, 'Brock')).toBeVisible();
        await expect(previous).toBeDisabled();
      }
    );

    trainerDexTest('Selected game and battle stage are restored after reload', async ({ page }) => {
      await gameVersionButton(page, 'HEARTGOLD SOULSILVER').click();
      const battleStages = page.getByLabel('Pokemon team battle stage');
      await battleStages.getByRole('button', { name: /^fighting dojo rematch$/i }).click();
      await expect(teamPokemonButton(page, 'Rampardos')).toBeVisible();
      await expect(page).toHaveURL(
        /#\/trainerdex\?trainer=brock-kanto&game=heartgold-soulsilver&stage=rematch$/
      );

      await page.reload();

      await expect(gameVersionButton(page, 'HEARTGOLD SOULSILVER')).toHaveClass(/is-selected/);
      await expect(
        page
          .getByLabel('Pokemon team battle stage')
          .getByRole('button', { name: /^fighting dojo rematch$/i })
      ).toHaveClass(/is-selected/);
      await expect(teamPokemonButton(page, 'Rampardos')).toBeVisible();
    });

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

    // Verifies failed card fronts are removed instead of being replaced by card backs.
    test('Failed card artwork is removed while TrainerDex controls remain usable', async ({
      page
    }) => {
      await page.route('https://images.pokemontcg.io/**', (route) => route.abort());
      await page.route('https://images.scrydex.com/**', (route) => route.abort());

      await openTrainerDex(page);

      await expect(searchInput(page)).toBeVisible();
      await expect(trainerButton(page, 'Brock')).toBeVisible();
      await trainerButton(page, 'Misty').click();
      await expect(trainerDetailHeading(page, 'Misty')).toBeVisible();
      await expect(teamPokemonButton(page, 'Starmie')).toBeVisible();
      await page.locator('.trainerdex-tcg-section').scrollIntoViewIfNeeded();
      await expect(
        page.getByText('No local trainer-featured TCG cards found for this trainer.')
      ).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('.trainerdex-tcg-section .binder-card:visible')).toHaveCount(0);
      await expect(page.locator('.trainerdex-tcg-section .card-back-image')).toHaveCount(0);
    });

    // Verifies delayed Pokemon API data leaves the station shell usable before the team loads.
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
      await homeStationButton(page, 'trainerdex').click();

      await expect(page.getByRole('heading', { name: /^trainerdex$/i })).toBeVisible();
      await expect(searchInput(page)).toBeVisible();
      await expect(trainerButton(page, 'Brock')).toBeVisible();
      const loadingTeamStatus = page.getByText('Loading Pokemon team...');
      const recommendedTypesPlaceholder = page.getByText(
        'Recommended types load with the Pokemon team.'
      );
      await expect(loadingTeamStatus).toBeVisible();
      await expect(recommendedTypesPlaceholder).toBeVisible();

      releasePokemonRequests();

      await expect(loadingTeamStatus).toBeHidden({ timeout: 30_000 });
      await expect(recommendedTypesPlaceholder).toBeHidden();
      await expect(page.getByText('AVERAGE STATS')).toBeVisible();
      await expect(teamPokemonButton(page, 'Onix')).toBeVisible();
    });
  });
});
