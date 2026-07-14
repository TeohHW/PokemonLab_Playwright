import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/test';

test.describe("@live Who's That Pokemon", () => {
  const leaderboardStorageKeys = [
    'whos-that-pokemon-leaderboard',
    'who-is-that-pokemon-leaderboard',
    'pokemon-who-leaderboard'
  ];
  const displayedTrainerNameMaxLength = 24;

  // Opens the Who's That Pokemon station from the home station chooser.
  async function openWhosThatPokemon(page: Page) {
    await page.goto('/');
    await page.getByRole('button', { name: /who's that pokemon/i }).click();

    await expect(page.getByRole('heading', { name: /who's that pokemon/i })).toBeVisible();
    await expect(page.getByText('TRAINER SETUP')).toBeVisible();
  }

  const whosThatPokemonTest = test.extend<{ openWhosThatPokemonStation: void }>({
    openWhosThatPokemonStation: [
      async ({ page }, use) => {
        await openWhosThatPokemon(page);
        await use();
      },
      { auto: true }
    ]
  });

  // Clears persisted leaderboard data so leaderboard tests do not leak scores into each other.
  async function clearWhosThatPokemonLeaderboard(page: Page) {
    await page.evaluate((storageKeys) => {
      for (const storageKey of storageKeys) {
        localStorage.removeItem(storageKey);
      }
    }, leaderboardStorageKeys);
  }

  const whosThatPokemonLeaderboardTest = test.extend<{ openCleanWhosThatPokemonStation: void }>({
    openCleanWhosThatPokemonStation: [
      async ({ page }, use) => {
        await page.goto('/');
        await clearWhosThatPokemonLeaderboard(page);
        await page.getByRole('button', { name: /who's that pokemon/i }).click();

        await expect(page.getByRole('heading', { name: /who's that pokemon/i })).toBeVisible();
        await expect(page.getByText('TRAINER SETUP')).toBeVisible();

        await use();

        if (!page.isClosed()) {
          await clearWhosThatPokemonLeaderboard(page);
        }
      },
      { auto: true }
    ]
  });

  // Starts a new game with a default trainer name.
  async function startGame(page: Page, trainerName = 'Ash') {
    await page.getByRole('textbox').fill(trainerName);
    await page.getByRole('button', { name: /^start game$/i }).click();

    await expect(page.getByPlaceholder('Pokemon name...')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /^guess$/i })).toBeEnabled();
  }

  // Reads the active silhouette image ID and resolves it to the Pokemon name used for guesses.
  async function currentMysteryPokemonName(page: Page) {
    const officialArtworkSrc =
      (await page.locator('img[src*="/official-artwork/"]').first().getAttribute('src')) ?? '';
    const pokemonId = officialArtworkSrc.match(/official-artwork\/(\d+)\.png/i)?.[1];

    expect(pokemonId).toBeTruthy();

    return page.evaluate(async (id) => {
      const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
      const pokemon = (await response.json()) as { name: string };

      return pokemon.name;
    }, pokemonId);
  }

  // Verifies the compact score panel shows the expected score and completed round count.
  async function expectScoreAndRounds(page: Page, score: number, rounds: number) {
    await expect(page.getByLabel('Current score')).toContainText(
      new RegExp(`Score\\s*${score}\\s*Rounds\\s*${rounds}`, 'i')
    );
  }

  function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function uniqueTrainerName(prefix: string) {
    const uniqueSuffix = `${test.info().workerIndex}${Date.now().toString(36)}`;

    return `${prefix}${uniqueSuffix}`.slice(0, displayedTrainerNameMaxLength);
  }

  async function answerCurrentRoundCorrectly(page: Page) {
    const correctGuess = await currentMysteryPokemonName(page);

    await page.getByPlaceholder('Pokemon name...').fill(correctGuess);
    await page.getByRole('button', { name: /^guess$/i }).click();
    await expect(page.getByText(/Correct! Click the Pokemon to open its entry\./i)).toBeVisible();
  }

  async function openGameMenu(page: Page) {
    await page.getByRole('button', { name: /^open game menu$/i }).click();
    await expect(page.getByLabel('Leaderboard')).toBeVisible();
  }

  async function startNewPlayerFromMenu(page: Page) {
    await page.getByRole('button', { name: /^new player$/i }).click();
    await expect(page.getByText('TRAINER SETUP')).toBeVisible();
  }

  // Generates an overlong trainer name made from safe visible characters.
  function randomLongTrainerName() {
    const randomSuffix = Math.random().toString(36).slice(2).toUpperCase();

    return `TRAINER${randomSuffix}QWERTYUIOPASDFGHJKLZXCVBNM1234567890`;
  }

  // Reads non-system buttons that appear as help choices.
  async function helpChoiceLabels(page: Page) {
    return page
      .locator('button')
      .evaluateAll((buttons) =>
        buttons
          .map((button) => button.textContent?.trim() ?? '')
          .filter(
            (label) =>
              label.length > 0 &&
              !/^(who's that pokemon\?|menu|help|guess|next pokemon)$/i.test(label)
          )
      );
  }

  test.describe('Station / Initial Load', () => {
    // Verifies the station opens on the trainer setup screen with region choices and leaderboard.
    whosThatPokemonLeaderboardTest('Starts Who That Pokemon station', async ({ page }) => {
      await expect(page.getByText('CHOOSE YOUR CHALLENGE')).toBeVisible();
      await expect(page.getByRole('textbox')).toBeVisible();
      await expect(page.getByRole('button', { name: /^start game$/i })).toBeVisible();
      await expect(page.getByText(/^region$/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /^random region/i })).toBeVisible();
      await expect(page.getByText('LEADERBOARD')).toBeVisible();
      await expect(page.getByText('No scores yet.')).toBeVisible();
    });

    // Verifies the setup screen remains usable before a round has started.
    whosThatPokemonTest(
      'Shows a stable setup state before game data is loaded',
      async ({ page }) => {
        await expect(page.getByText('TRAINER SETUP')).toBeVisible();
        await expect(page.getByText('CHOOSE YOUR CHALLENGE')).toBeVisible();
        await expect(page.getByRole('textbox')).toBeEnabled();
        await expect(page.getByRole('button', { name: /^start game$/i })).toBeEnabled();
        await expect(page.getByPlaceholder('Pokemon name...')).toBeHidden();
        await expect(page.getByRole('button', { name: /^guess$/i })).toBeHidden();
      }
    );

    // Verifies setup controls remain available when the station is opened on a mobile viewport.
    test('Setup controls remain visible on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/');
      await clearWhosThatPokemonLeaderboard(page);
      await openWhosThatPokemon(page);

      await expect(page.getByText('TRAINER SETUP')).toBeVisible();
      await expect(page.getByRole('textbox')).toBeVisible();
      await expect(page.getByRole('button', { name: /^start game$/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /^random region/i })).toBeVisible();
      await expect(page.getByText('LEADERBOARD')).toBeVisible();
    });
  });

  test.describe('Trainer Setup / Validation', () => {
    // Verifies starting without a trainer name shows validation and keeps the setup form available.
    whosThatPokemonTest('Trainer name is required before starting', async ({ page }) => {
      await page.getByRole('button', { name: /^start game$/i }).click();

      await expect(page.getByText('NAME REQUIRED')).toBeVisible();
      await expect(page.getByText(/Trainer name cannot be empty/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /^ok$/i })).toBeVisible();
      await expect(page.getByText('TRAINER SETUP')).toBeVisible();
    });

    // Verifies a padded trainer name is saved to the leaderboard without surrounding spaces.
    whosThatPokemonLeaderboardTest(
      'Trainer name trims leading and trailing whitespace',
      async ({ page }) => {
        await startGame(page, '   Ash   ');

        await page.getByPlaceholder('Pokemon name...').fill('notapokemon');
        await page.getByRole('button', { name: /^guess$/i }).click();
        await expect(page.getByText('NEXT POKEMON')).toBeVisible();

        await page.getByRole('button', { name: /^menu$/i }).click();
        await page.getByRole('button', { name: /^home$/i }).click();
        await expect(page.getByText('LEAVE GAME?')).toBeVisible();
        await page.getByRole('button', { name: /^leave$/i }).click();

        await page.getByRole('button', { name: /who's that pokemon/i }).click();

        await expect(page.getByText('LEADERBOARD')).toBeVisible();
        await expect(page.getByText(/^Ash$/)).toBeVisible();
        await expect(page.getByText(/^\s+Ash\s+$/)).toHaveCount(0);
      }
    );
    whosThatPokemonLeaderboardTest(
      'Very long trainer name is handled without breaking layout',
      async ({ page }) => {
        const longTrainerName = randomLongTrainerName();
        const displayedTrainerName = longTrainerName.slice(0, displayedTrainerNameMaxLength);

        await startGame(page, longTrainerName);

        await page.getByPlaceholder('Pokemon name...').fill('notapokemon');
        await page.getByRole('button', { name: /^guess$/i }).click();
        await expect(page.getByText('NEXT POKEMON')).toBeVisible();

        await page.getByRole('button', { name: /^menu$/i }).click();
        await page.getByRole('button', { name: /^home$/i }).click();
        await expect(page.getByText('LEAVE GAME?')).toBeVisible();
        await page.getByRole('button', { name: /^leave$/i }).click();

        await page.getByRole('button', { name: /who's that pokemon/i }).click();

        await expect(page.getByText('LEADERBOARD')).toBeVisible();
        await expect(page.getByText(displayedTrainerName, { exact: true })).toBeVisible();
        await expect(page.getByText(longTrainerName, { exact: true })).toHaveCount(0);
      }
    );
    whosThatPokemonLeaderboardTest(
      'Special-character trainer name is either accepted or validated consistently',
      async ({ page }) => {
        const trainerNamewithSpecialChars = 'Ash!@#$%^&*()_+{}|:"<>?`~';
        const displayedTrainerName = trainerNamewithSpecialChars.slice(
          0,
          displayedTrainerNameMaxLength
        );
        await startGame(page, trainerNamewithSpecialChars);

        await page.getByPlaceholder('Pokemon name...').fill('notapokemon');
        await page.getByRole('button', { name: /^guess$/i }).click();
        await expect(page.getByText('NEXT POKEMON')).toBeVisible();

        await page.getByRole('button', { name: /^menu$/i }).click();
        await page.getByRole('button', { name: /^home$/i }).click();
        await expect(page.getByText('LEAVE GAME?')).toBeVisible();
        await page.getByRole('button', { name: /^leave$/i }).click();

        await page.getByRole('button', { name: /who's that pokemon/i }).click();

        await expect(page.getByText('LEADERBOARD')).toBeVisible();
        await expect(page.getByText(displayedTrainerName, { exact: true })).toBeVisible();
        await expect(page.getByText(trainerNamewithSpecialChars, { exact: true })).toHaveCount(0);
      }
    );
  });

  test.describe('Region Selection', () => {
    // Verifies selecting Kanto starts a Kanto-scoped game.
    whosThatPokemonTest('Kanto region starts a Kanto challenge', async ({ page }) => {
      await page.getByRole('button', { name: /^kanto/i }).click();
      await startGame(page);

      await expect(page.getByText(/KANTO POKEMON/i)).toBeVisible();
      await expect(page.getByText('Score')).toBeVisible();
      await expect(page.getByText('Rounds')).toBeVisible();
    });

    // Verifies Random Region starts one of the configured regional challenges.
    whosThatPokemonTest('Random region starts one listed regional challenge', async ({ page }) => {
      await page.getByRole('button', { name: /^random region/i }).click();
      await startGame(page);

      await expect(
        page.getByText(/^(KANTO|HOENN|JOHTO|SINNOH|UNOVA|KALOS|ALOLA|GALAR|PALDEA) POKEMON$/i)
      ).toBeVisible();
      await expect(page.getByPlaceholder('Pokemon name...')).toBeVisible();
      await expect(page.getByRole('button', { name: /^guess$/i })).toBeEnabled();
    });

    // Verifies every configured region button can start a matching regional challenge.
    whosThatPokemonTest('Each configured region can be selected from setup', async ({ page }) => {
      const regionCases = [
        {
          buttonName: /^kanto\s+firered\s*\/\s*leafgreen$/i,
          challengeName: /KANTO POKEMON/i
        },
        {
          buttonName: /^hoenn\s+ruby\s*\/\s*sapphire\s*\/\s*emerald$/i,
          challengeName: /HOENN POKEMON/i
        },
        {
          buttonName: /^johto\s+heartgold\s*\/\s*soulsilver$/i,
          challengeName: /JOHTO POKEMON/i
        },
        {
          buttonName: /^sinnoh\s+diamond\s*\/\s*pearl\s*\/\s*platinum$/i,
          challengeName: /SINNOH POKEMON/i
        },
        {
          buttonName: /^unova\s+black 2\s*\/\s*white 2$/i,
          challengeName: /UNOVA POKEMON/i
        },
        {
          buttonName: /^kalos\s+x\s*\/\s*y$/i,
          challengeName: /KALOS POKEMON/i
        },
        {
          buttonName: /^hoenn\s+omega ruby\s*\/\s*alpha sapphire$/i,
          challengeName: /HOENN POKEMON/i
        },
        {
          buttonName: /^alola\s+sun\s*\/\s*moon$/i,
          challengeName: /ALOLA POKEMON/i
        },
        {
          buttonName: /^galar\s+sword\s*\/\s*shield$/i,
          challengeName: /GALAR POKEMON/i
        },
        {
          buttonName: /^paldea\s+scarlet\s*\/\s*violet$/i,
          challengeName: /PALDEA POKEMON/i
        }
      ];

      for (const regionCase of regionCases) {
        await openWhosThatPokemon(page);
        await page.getByRole('button', { name: regionCase.buttonName }).click();
        await startGame(page);

        await expect(page.getByText(regionCase.challengeName)).toBeVisible();
        await expect(page.getByPlaceholder('Pokemon name...')).toBeVisible();
      }
    });

    // Verifies the final selected region is the one used when the game starts.
    whosThatPokemonTest(
      'Changing region before start uses the most recent selected region',
      async ({ page }) => {
        await page.getByRole('button', { name: /^kanto\s+firered\s*\/\s*leafgreen$/i }).click();
        await page.getByRole('button', { name: /^paldea\s+scarlet\s*\/\s*violet$/i }).click();
        await startGame(page);

        await expect(page.getByText(/PALDEA POKEMON/i)).toBeVisible();
        await expect(page.getByText(/KANTO POKEMON/i)).toBeHidden();
      }
    );
  });

  test.describe('Gameplay', () => {
    // Verifies starting a game renders the core guessing controls with zeroed score state.
    whosThatPokemonTest('Starts a new guessing round', async ({ page }) => {
      await startGame(page);

      await expect(page.getByText('Score')).toBeVisible();
      await expect(page.getByText('Rounds')).toBeVisible();
      await expect(page.getByText('0')).toHaveCount(2);
      await expect(page.getByPlaceholder('Pokemon name...')).toBeVisible();
      await expect(page.getByRole('button', { name: /^help$/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /^guess$/i })).toBeVisible();
    });

    whosThatPokemonTest('Next Pokemon starts a fresh unresolved round', async ({ page }) => {
      await startGame(page);
      await expect(page.getByText('Score')).toBeVisible();
      await expect(page.getByText('Rounds')).toBeVisible();
      await expect(page.getByText('0')).toHaveCount(2);
      await expect(page.getByLabel('Current score')).toContainText('0');
      await expect(page.getByPlaceholder('Pokemon name...')).toBeVisible();
      await expect(page.getByRole('button', { name: /^help$/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /^guess$/i })).toBeVisible();
      await page.getByRole('searchbox', { name: 'Pokemon name...' }).fill('Test');
      await page.getByRole('button', { name: 'Guess' }).click();
      await page.getByRole('button', { name: 'Next Pokemon' }).click();
      await expect(page.getByPlaceholder('Pokemon name...')).toBeVisible();
      await expect(page.getByRole('button', { name: /^help$/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /^guess$/i })).toBeVisible();

      await expect(page.getByLabel('Current score')).toContainText('1');
    });
    whosThatPokemonTest(
      'Score and rounds persist correctly across multiple rounds',
      async ({ page }) => {
        await startGame(page);
        await expectScoreAndRounds(page, 0, 0);

        const firstCorrectGuess = await currentMysteryPokemonName(page);
        await page.getByPlaceholder('Pokemon name...').fill(firstCorrectGuess);
        await page.getByRole('button', { name: /^guess$/i }).click();

        await expect(
          page.getByText(/Correct! Click the Pokemon to open its entry\./i)
        ).toBeVisible();
        await expectScoreAndRounds(page, 1, 1);

        await page.getByRole('button', { name: /^next pokemon$/i }).click();
        await expect(page.getByPlaceholder('Pokemon name...')).toBeVisible();

        await page.getByPlaceholder('Pokemon name...').fill('notapokemon');
        await page.getByRole('button', { name: /^guess$/i }).click();

        await expect(
          page.getByText(/It was .+\. Click the Pokemon to learn more\./i)
        ).toBeVisible();
        await expectScoreAndRounds(page, 1, 2);

        await page.getByRole('button', { name: /^next pokemon$/i }).click();
        await expect(page.getByPlaceholder('Pokemon name...')).toBeVisible();

        const secondCorrectGuess = await currentMysteryPokemonName(page);
        await page.getByPlaceholder('Pokemon name...').fill(secondCorrectGuess);
        await page.getByRole('button', { name: /^guess$/i }).click();

        await expect(
          page.getByText(/Correct! Click the Pokemon to open its entry\./i)
        ).toBeVisible();
        await expectScoreAndRounds(page, 2, 3);
      }
    );
    whosThatPokemonTest('Pokemon silhouette becomes inspectable after reveal', async ({ page }) => {
      await startGame(page);

      const hiddenSilhouette = page.getByRole('button', {
        name: /mystery pokemon silhouette/i
      });

      await expect(hiddenSilhouette).toBeVisible();
      await expect(hiddenSilhouette).toBeDisabled();
      await hiddenSilhouette.click({ force: true });

      await expectScoreAndRounds(page, 0, 0);
      await expect(page.getByPlaceholder('Pokemon name...')).toBeVisible();
      await expect(page.getByRole('button', { name: /^guess$/i })).toBeEnabled();
      await expect(page.getByRole('button', { name: /^next pokemon$/i })).toBeHidden();

      await page.getByPlaceholder('Pokemon name...').fill('notapokemon');
      await page.getByRole('button', { name: /^guess$/i }).click();

      await expect(page.getByText(/It was .+\. Click the Pokemon to learn more\./i)).toBeVisible();

      const revealedSilhouette = page.getByRole('button', {
        name: /open .* pokedex entry/i
      });

      await expect(revealedSilhouette).toBeVisible();
      await revealedSilhouette.click();

      const pokedexEntryDialog = page.getByRole('dialog');

      await expect(pokedexEntryDialog).toBeVisible();
      await expect(pokedexEntryDialog.getByRole('button', { name: /back/i })).toBeVisible();
      await expect(pokedexEntryDialog.locator('img').first()).toBeVisible();
      await expect(
        pokedexEntryDialog.getByRole('heading', { name: /featured tcg cards/i })
      ).toBeVisible();
    });
  });

  test.describe('Guessing', () => {
    // Verifies an incorrect guess reveals the answer, keeps score at zero, and advances the round.
    whosThatPokemonTest(
      'Incorrect guess reveals the Pokemon and advances the round',
      async ({ page }) => {
        await startGame(page);

        await page.getByPlaceholder('Pokemon name...').fill('notapokemon');
        await page.getByRole('button', { name: /^guess$/i }).click();

        await expect(
          page.getByText(/It was .+\. Click the Pokemon to learn more\./i)
        ).toBeVisible();
        await expect(page.getByText('Score')).toBeVisible();
        await expect(page.getByText('Rounds')).toBeVisible();
        await expect(page.getByText('NEXT POKEMON')).toBeVisible();
      }
    );

    whosThatPokemonTest(
      'Correct guess increases score and advances the round',
      async ({ page }) => {
        await startGame(page);
        await expectScoreAndRounds(page, 0, 0);

        const correctGuess = await currentMysteryPokemonName(page);

        await page.getByPlaceholder('Pokemon name...').fill(correctGuess);
        await page.getByRole('button', { name: /^guess$/i }).click();

        await expect(
          page.getByText(/Correct! Click the Pokemon to open its entry\./i)
        ).toBeVisible();

        await expectScoreAndRounds(page, 1, 1);
        await expect(page.getByRole('button', { name: /^next pokemon$/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /^guess$/i })).toBeHidden();
      }
    );
    whosThatPokemonTest('Guessing is case-insensitive and trims extra spaces', async ({ page }) => {
      await startGame(page);

      const correctGuess = await currentMysteryPokemonName(page);

      await page.getByPlaceholder('Pokemon name...').fill(`   ${correctGuess.toUpperCase()}   `);
      await page.getByRole('button', { name: /^guess$/i }).click();

      await expect(page.getByText(/Correct! Click the Pokemon to open its entry\./i)).toBeVisible();

      await expectScoreAndRounds(page, 1, 1);
    });
    whosThatPokemonTest(
      'Empty guess shows validation without revealing the Pokemon',
      async ({ page }) => {
        await startGame(page);

        await page.getByPlaceholder('Pokemon name...').fill(` `);
        await page.getByRole('button', { name: /^guess$/i }).click();
        await expect(page.locator('form')).toContainText('Enter a Pokemon name to guess.');
        const hiddenSilhouette = page.getByRole('button', {
          name: /mystery pokemon silhouette/i
        });

        await expect(hiddenSilhouette).toBeVisible();
        await expectScoreAndRounds(page, 0, 0);
      }
    );
    whosThatPokemonTest(
      'Special-character guess fails safely without breaking the round',
      async ({ page }) => {
        await startGame(page);

        await page.getByPlaceholder('Pokemon name...').fill('!@#$%^&*()_+');
        await page.getByRole('button', { name: /^guess$/i }).click();

        await expect(
          page.getByText(/It was .+\. Click the Pokemon to learn more\./i)
        ).toBeVisible();
        await expect(page.getByText('Score')).toBeVisible();
        await expect(page.getByText('Rounds')).toBeVisible();
        await expect(page.getByText('NEXT POKEMON')).toBeVisible();
      }
    );
  });

  test.describe('Help / Hints', () => {
    // Verifies Help reveals selectable answer choices for the active round.
    whosThatPokemonTest('Help shows multiple answer choices', async ({ page }) => {
      await startGame(page);

      await page.getByRole('button', { name: /^help$/i }).click();

      await expect
        .poll(() => helpChoiceLabels(page))
        .toEqual(expect.arrayContaining([expect.any(String)]));
      expect((await helpChoiceLabels(page)).length).toBeGreaterThan(0);
    });

    whosThatPokemonTest(
      'Selecting a help choice submits or fills the guess consistently',
      async ({ page }) => {
        await startGame(page);

        for (let i = 1; i <= 3; i++) {
          const correctGuess = await currentMysteryPokemonName(page);
          await page.getByRole('button', { name: /^help$/i }).click();
          await page.getByRole('button', { name: correctGuess }).click();
          await expectScoreAndRounds(page, i, i);

          await expect(page.locator('form')).toContainText(
            'Correct! Click the Pokemon to open its entry.'
          );
          if (i < 3) {
            await page.getByRole('button', { name: 'Next Pokemon' }).click();
          }
        }
      }
    );
    whosThatPokemonTest('Help shows valid selectable choices', async ({ page }) => {
      await startGame(page);
      await page.getByRole('button', { name: /^help$/i }).click();

      const choiceLabels = await helpChoiceLabels(page);

      expect(choiceLabels.length).toBeGreaterThan(0);
      for (const choiceLabel of choiceLabels) {
        expect(choiceLabel).toMatch(/[A-Za-z]/);
        await expect(page.getByRole('button', { name: choiceLabel })).toBeEnabled();
      }
    });
  });

  test.describe('Leaderboard', () => {
    // Verifies an empty leaderboard starts in a readable resettable state.
    whosThatPokemonLeaderboardTest('Empty leaderboard is shown on first load', async ({ page }) => {
      await expect(page.getByText('LEADERBOARD')).toBeVisible();
      await expect(page.getByRole('button', { name: /^reset$/i })).toBeVisible();
      await expect(page.getByText('No scores yet.')).toBeVisible();
    });

    whosThatPokemonLeaderboardTest(
      'Leaderboard updates score after each successful guess',
      async ({ page }) => {
        const trainerName = uniqueTrainerName('TU');
        await startGame(page, trainerName);

        await expectScoreAndRounds(page, 0, 0);

        const correctGuess = await currentMysteryPokemonName(page);

        await page.getByPlaceholder('Pokemon name...').fill(correctGuess);
        await page.getByRole('button', { name: /^guess$/i }).click();
        await expectScoreAndRounds(page, 1, 1);
        await page.getByRole('button', { name: 'Next Pokemon' }).click();
        await page.getByRole('button', { name: 'Open game menu' }).click();
        await expect(page.getByRole('article')).toContainText(`#1${trainerName}`);
      }
    );

    whosThatPokemonLeaderboardTest(
      'Leaderboard orders higher scores before lower scores',
      async ({ page }) => {
        const lowScoreTrainerName = uniqueTrainerName('L');
        const highScoreTrainerName = uniqueTrainerName('H');

        await startGame(page, lowScoreTrainerName);
        await answerCurrentRoundCorrectly(page);
        await expectScoreAndRounds(page, 1, 1);
        await page.getByRole('button', { name: /^next pokemon$/i }).click();
        await openGameMenu(page);
        await startNewPlayerFromMenu(page);

        await startGame(page, highScoreTrainerName);
        await answerCurrentRoundCorrectly(page);
        await expectScoreAndRounds(page, 1, 1);
        await page.getByRole('button', { name: /^next pokemon$/i }).click();
        await answerCurrentRoundCorrectly(page);
        await expectScoreAndRounds(page, 2, 2);
        await page.getByRole('button', { name: /^next pokemon$/i }).click();
        await openGameMenu(page);

        const leaderboard = page.getByLabel('Leaderboard');
        const leaderboardText = await leaderboard.innerText();
        const highScorePosition = leaderboardText.indexOf(highScoreTrainerName);
        const lowScorePosition = leaderboardText.indexOf(lowScoreTrainerName);

        expect(highScorePosition).toBeGreaterThanOrEqual(0);
        expect(lowScorePosition).toBeGreaterThanOrEqual(0);
        expect(highScorePosition).toBeLessThan(lowScorePosition);
        await expect(leaderboard).toContainText(
          new RegExp(`#1\\s*${escapeRegExp(highScoreTrainerName)}[\\s\\S]*2`)
        );
        await expect(leaderboard).toContainText(
          new RegExp(`#2\\s*${escapeRegExp(lowScoreTrainerName)}[\\s\\S]*1`)
        );
      }
    );

    whosThatPokemonLeaderboardTest(
      'Leaderboard updates after reset while a game is still active',
      async ({ page }) => {
        const trainerName = uniqueTrainerName('TR');

        await startGame(page, trainerName);
        await answerCurrentRoundCorrectly(page);
        await expectScoreAndRounds(page, 1, 1);
        await page.getByRole('button', { name: /^next pokemon$/i }).click();
        await openGameMenu(page);

        await page.getByRole('button', { name: /^reset$/i }).click();
        await page
          .getByLabel('Reset Leaderboard?')
          .getByRole('button', { name: /^reset$/i })
          .click();
        await expect(page.getByLabel('Leaderboard').getByRole('paragraph')).toContainText(
          'No scores yet.'
        );

        await page.getByRole('button', { name: /^resume$/i }).click();
        await answerCurrentRoundCorrectly(page);
        await expectScoreAndRounds(page, 2, 2);
        await page.getByRole('button', { name: /^next pokemon$/i }).click();
        await openGameMenu(page);

        await expect(page.getByLabel('Leaderboard')).toContainText(
          new RegExp(`#1\\s*${escapeRegExp(trainerName)}[\\s\\S]*2`)
        );
      }
    );

    whosThatPokemonLeaderboardTest('Reset clears leaderboard scores', async ({ page }) => {
      const trainerName = uniqueTrainerName('TC');
      await startGame(page, trainerName);

      await expectScoreAndRounds(page, 0, 0);

      const correctGuess = await currentMysteryPokemonName(page);

      await page.getByPlaceholder('Pokemon name...').fill(correctGuess);
      await page.getByRole('button', { name: /^guess$/i }).click();
      await expectScoreAndRounds(page, 1, 1);
      await page.getByRole('button', { name: 'Next Pokemon' }).click();
      await page.getByRole('button', { name: 'Open game menu' }).click();
      await page.getByRole('button', { name: 'Reset' }).click();
      await page.getByLabel('Reset Leaderboard?').getByRole('button', { name: 'Reset' }).click();
      await expect(page.getByLabel('Leaderboard').getByRole('paragraph')).toContainText(
        'No scores yet.'
      );

      //Verify that leaderboard is still empty after starting a new game as new player
      await page.getByRole('button', { name: 'New Player' }).click();
      await expect(page.getByLabel('Leaderboard').getByRole('paragraph')).toContainText(
        'No scores yet.'
      );
    });
  });

  test.describe('Navigation', () => {
    // Verifies Menu returns from the station to the home station chooser.
    whosThatPokemonTest('Menu returns to the home station chooser', async ({ page }) => {
      await page.getByRole('button', { name: /^menu$/i }).click();
      await expect(page.getByRole('button', { name: /^home$/i })).toBeVisible();
      await page.getByRole('button', { name: /^home$/i }).click();

      await expect(page.getByText(/choose (?:your|a) station/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /pokemon tcg simulator/i })).toBeVisible();
      await expect(
        page.getByRole('button', { name: /search pokemon by name or number/i })
      ).toBeVisible();
      await expect(page.getByRole('button', { name: /who's that pokemon/i })).toBeVisible();
    });

    // Verifies leaving an active round requires confirmation and returns to the station chooser.
    whosThatPokemonTest(
      'Menu during an active round confirms before returning home',
      async ({ page }) => {
        await startGame(page);

        await page.getByRole('button', { name: /^menu$/i }).click();
        await expect(page.getByRole('button', { name: /^home$/i })).toBeVisible();
        await page.getByRole('button', { name: /^home$/i }).click();

        await expect(page.getByText('LEAVE GAME?')).toBeVisible();
        await page.getByRole('button', { name: /^leave$/i }).click();

        await expect(page.getByText(/choose (?:your|a) station/i)).toBeVisible();
        await expect(page.getByRole('button', { name: /pokemon tcg simulator/i })).toBeVisible();
        await expect(
          page.getByRole('button', { name: /search pokemon by name or number/i })
        ).toBeVisible();
        await expect(page.getByRole('button', { name: /who's that pokemon/i })).toBeVisible();
      }
    );

    // Verifies a browser reload returns to the app's station chooser instead of a partial game.
    whosThatPokemonTest('Browser reload returns to the station chooser', async ({ page }) => {
      await startGame(page);

      await page.reload();

      await expect(page.getByText(/choose (?:your|a) station/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /pokemon tcg simulator/i })).toBeVisible();
      await expect(
        page.getByRole('button', { name: /search pokemon by name or number/i })
      ).toBeVisible();
      await expect(page.getByRole('button', { name: /who's that pokemon/i })).toBeVisible();
    });
  });

  test.describe('Edge / Reliability', () => {
    // Verifies repeated Help clicks leave the current round usable and avoid duplicate choice spam.
    whosThatPokemonTest('Rapid Help clicks leave one usable set of choices', async ({ page }) => {
      await startGame(page);

      for (let clickCount = 0; clickCount < 3; clickCount += 1) {
        await page.getByRole('button', { name: /^help$/i }).click();
      }

      const choiceLabels = await helpChoiceLabels(page);

      expect(choiceLabels.length).toBeGreaterThan(0);
      expect(new Set(choiceLabels).size).toBe(choiceLabels.length);
      await expect(page.getByPlaceholder('Pokemon name...')).toBeVisible();
      await expect(page.getByRole('button', { name: /^guess$/i })).toBeEnabled();
    });

    // Verifies repeated Guess attempts settle to one revealed result and next-round action.
    whosThatPokemonTest('Rapid Guess clicks settle to one revealed result', async ({ page }) => {
      await startGame(page);
      await page.getByPlaceholder('Pokemon name...').fill('notapokemon');

      for (let clickCount = 0; clickCount < 3; clickCount += 1) {
        const guessButton = page.getByRole('button', { name: /^guess$/i });

        if (await guessButton.isVisible()) {
          await guessButton.click();
        }
      }

      await expect(page.getByText(/It was .+\. Click the Pokemon to learn more\./i)).toHaveCount(1);
      await expect(page.getByText('NEXT POKEMON')).toBeVisible();
      await expect(page.getByRole('button', { name: /^guess$/i })).toBeHidden();
    });

    // Verifies blocked image assets do not prevent the guessing controls from rendering.
    test('Image request failures leave guess controls usable', async ({ page }) => {
      await page.route('**/*.{png,jpg,jpeg,gif,webp,svg}', (route) => route.abort());
      await openWhosThatPokemon(page);
      await startGame(page);

      await expect(page.getByPlaceholder('Pokemon name...')).toBeVisible();
      await expect(page.getByRole('button', { name: /^help$/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /^guess$/i })).toBeEnabled();
    });

    // Verifies delayed Pokemon API responses do not break the setup screen before a round starts.
    test('Network delay during Pokemon data load shows stable setup UI', async ({ page }) => {
      let releasePokemonRequests!: () => void;
      const pokemonRequestsCanContinue = new Promise<void>((resolve) => {
        releasePokemonRequests = resolve;
      });

      await page.route('**/pokeapi.co/**', async (route) => {
        await pokemonRequestsCanContinue;
        await route.continue();
      });

      await openWhosThatPokemon(page);

      await expect(page.getByText('TRAINER SETUP')).toBeVisible();
      await expect(page.getByRole('textbox')).toBeEnabled();
      await expect(page.getByRole('button', { name: /^start game$/i })).toBeEnabled();
      await expect(page.getByText('LEADERBOARD')).toBeVisible();

      releasePokemonRequests();
    });

    // Verifies malformed saved leaderboard data does not prevent the station from rendering.
    test('Local storage corruption does not break leaderboard rendering', async ({ page }) => {
      await page.goto('/');
      await clearWhosThatPokemonLeaderboard(page);
      await page.evaluate(() => {
        localStorage.setItem('whos-that-pokemon-leaderboard', '{not valid json');
        localStorage.setItem('who-is-that-pokemon-leaderboard', '{not valid json');
        localStorage.setItem('pokemon-who-leaderboard', '{not valid json');
      });

      await page.getByRole('button', { name: /who's that pokemon/i }).click();

      await expect(page.getByText('TRAINER SETUP')).toBeVisible();
      await expect(page.getByText('LEADERBOARD')).toBeVisible();
      await expect(page.getByRole('button', { name: /^reset$/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /^start game$/i })).toBeEnabled();

      await clearWhosThatPokemonLeaderboard(page);
    });
  });
});
