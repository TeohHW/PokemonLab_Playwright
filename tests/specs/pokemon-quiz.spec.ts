import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/test';

test.describe('@live Pokemon Quiz', () => {
  // Opens the Pokemon Quiz station from the home station chooser.
  async function openPokemonQuiz(page: Page) {
    await page.goto('/');
    await page.getByRole('button', { name: /pokemon quiz/i }).click();

    await expect(page.getByRole('heading', { name: /pokemon quiz/i })).toBeVisible();
    await expect(page.getByText(/^Quiz Pool$/i)).toBeVisible();
  }

  const pokemonQuizTest = test.extend<{ openPokemonQuizStation: void }>({
    openPokemonQuizStation: [
      async ({ page }, use) => {
        await openPokemonQuiz(page);
        await use();
      },
      { auto: true }
    ]
  });

  function quizPoolSelect(page: Page) {
    return page.getByRole('combobox', { name: /quiz pool/i });
  }

  function quizCategorySelect(page: Page) {
    return page.getByRole('combobox', { name: /category/i });
  }

  function scoreMetric(page: Page, label: 'Score' | 'Rounds' | 'Streak') {
    return page.getByText(label, { exact: true }).locator('..');
  }

  function answerButtons(page: Page) {
    return page.locator('main button');
  }

  function quizAnswerButtons(page: Page) {
    return page.locator('.quiz-answer-button');
  }

  function pokeApiPokemonSlug(pokemonName: string) {
    const normalizedName = pokemonName
      .toLowerCase()
      .replace(/♀/g, '-f')
      .replace(/♂/g, '-m')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const specialNames: Record<string, string> = {
      farfetchd: 'farfetchd',
      'mr-mime': 'mr-mime',
      'nidoran-f': 'nidoran-f',
      'nidoran-m': 'nidoran-m'
    };

    return specialNames[normalizedName] ?? normalizedName;
  }

  async function getPokemonTypesFromPokeApi(pokemonName: string) {
    const response = await fetch(
      `https://pokeapi.co/api/v2/pokemon/${pokeApiPokemonSlug(pokemonName)}`
    );

    expect(response.ok, `PokeAPI should return type data for ${pokemonName}`).toBeTruthy();

    const pokemon = (await response.json()) as {
      types: Array<{ type: { name: string } }>;
    };

    return pokemon.types.map(({ type }) => type.name.toUpperCase());
  }

  function answerMatchesPokemonTypes(answer: string, pokemonTypes: string[]) {
    const answerTypes = answer.split('/').map((typeName) => typeName.trim());

    return (
      answerTypes.length === pokemonTypes.length &&
      answerTypes.every((answerType) => pokemonTypes.includes(answerType))
    );
  }

  async function typeAnswerIndex(page: Page, shouldMatch: boolean) {
    await expect.poll(async () => quizAnswerButtons(page).count()).toBe(4);

    const quizText = await page.locator('main').innerText();
    const pokemonNameMatch =
      quizText.match(/WHAT TYPE IS\s+(.+?)\?/i) ??
      quizText.match(/WHICH TYPE COMBINATION DOES\s+(.+?)\s+HAVE\?/i);
    expect(pokemonNameMatch, 'Type question should include the Pokemon name').not.toBeNull();

    const pokemonTypes = await getPokemonTypesFromPokeApi(pokemonNameMatch?.[1] ?? '');
    const availableAnswers = await quizAnswerButtons(page).evaluateAll((buttons) =>
      buttons.map((button) => button.textContent?.trim().toUpperCase() ?? '')
    );

    return availableAnswers.findIndex(
      (answer) => answerMatchesPokemonTypes(answer, pokemonTypes) === shouldMatch
    );
  }

  async function answerTypeQuestion(page: Page, shouldAnswerCorrectly: boolean) {
    const answerIndex = await typeAnswerIndex(page, shouldAnswerCorrectly);
    expect(answerIndex, 'One answer choice should match the requested correctness').toBeGreaterThanOrEqual(
      0
    );

    await quizAnswerButtons(page).nth(answerIndex).click();
  }

  async function expectPlayableQuestion(page: Page) {
    await expect(page.getByRole('button', { name: /^next question$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^reset$/i })).toBeEnabled();
    await expect(page.getByText(/READY CHECK/i)).toBeHidden();
    await expect.poll(async () => quizAnswerButtons(page).count()).toBeGreaterThanOrEqual(2);
  }

  async function clearBrowserDataCache(page: Page) {
    await page.goto('/');
    await page.evaluate(async () => {
      localStorage.clear();
      sessionStorage.clear();

      const databaseList = await indexedDB.databases?.();
      await Promise.all(
        (databaseList ?? [])
          .map((database) => database.name)
          .filter((name): name is string => Boolean(name))
          .map(
            (name) =>
              new Promise<void>((resolve) => {
                const request = indexedDB.deleteDatabase(name);
                request.onsuccess = () => resolve();
                request.onerror = () => resolve();
                request.onblocked = () => resolve();
              })
          )
      );
    });
  }

  test.describe('Station / Initial Load', () => {
    // Verifies the quiz station opens with pool/category selectors and ready state.
    pokemonQuizTest('Starts Pokemon Quiz station', async ({ page }) => {
      await expect(quizPoolSelect(page)).toHaveValue('all');
      await expect(quizCategorySelect(page)).toHaveValue('mixed');
      await expect(page.getByText('Score')).toBeVisible();
      await expect(page.getByText('Rounds')).toBeVisible();
      await expect(page.getByText('Streak')).toBeVisible();
      await expect(page.getByRole('button', { name: /^reset$/i })).toBeDisabled();
      await expect(page.getByText('READY CHECK')).toBeVisible();
      await expect(page.getByText(/Choose a pool and category/i)).toBeVisible();
    });

    // Verifies the quiz shell stays stable while Pokemon data is still loading.
    test('Shows stable loading state while quiz data is delayed', async ({ page }) => {
      let releasePokemonRequests!: () => void;
      const pokemonRequestsCanContinue = new Promise<void>((resolve) => {
        releasePokemonRequests = resolve;
      });

      await page.route('**/pokeapi.co/**', async (route) => {
        await pokemonRequestsCanContinue;
        await route.continue();
      });

      await clearBrowserDataCache(page);
      await page.goto('/');
      await page.getByRole('button', { name: /pokemon quiz/i }).click();

      await expect(page.getByRole('heading', { name: /pokemon quiz/i })).toBeVisible();
      await expect(page.getByText(/^Quiz Pool$/i)).toBeVisible();
      await expect(quizPoolSelect(page)).toHaveValue('all');
      await expect(quizCategorySelect(page)).toHaveValue('mixed');
      await expect(page.getByRole('button', { name: /^reset$/i })).toBeDisabled();
      await expect(page.getByText('READY CHECK')).toBeVisible();

      releasePokemonRequests();
    });

    // Verifies the initial quiz controls remain reachable on a narrow mobile viewport.
    test('Initial controls remain visible on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await openPokemonQuiz(page);

      await expect(quizPoolSelect(page)).toBeVisible();
      await expect(quizCategorySelect(page)).toBeVisible();
      await expect(page.getByRole('button', { name: /^start quiz$/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /^reset$/i })).toBeVisible();
      await expect(page.getByText('Score')).toBeVisible();
      await expect(page.getByText('Rounds')).toBeVisible();
      await expect(page.getByText('Streak')).toBeVisible();
      await expect(page.getByText('READY CHECK')).toBeVisible();
    });
  });

  test.describe('Pool / Category Selection', () => {
    // Verifies choosing Type category starts a type-specific question.
    pokemonQuizTest('Type category starts a type question', async ({ page }) => {
      await quizCategorySelect(page).selectOption({ label: 'Type' });
      await page.getByRole('button', { name: /^start quiz$/i }).click();

      await expect(page.getByText(/POKEMON TYPE|DUAL TYPE/i)).toBeVisible();
      await expect(page.getByText(/WHAT TYPE IS|WHICH TYPE COMBINATION DOES/i)).toBeVisible();
      await expect(page.locator('.quiz-answer-button')).toHaveCount(4);
    });

    // Verifies every quiz category can transition from setup to a playable question.
    pokemonQuizTest('Each quiz category can start a question', async ({ page }) => {
      const categories = [
        'Type',
        'Evolution',
        'Generation',
        'Legendary',
        'Pokedex Entry',
        'Ability',
        'Comparisons',
        'Strongest Stat',
        'Effectiveness',
        'Moves',
        'Number / Region',
        'Cry / Sprite',
        'Starter / Evolution Line'
      ];

      for (const category of categories) {
        await quizCategorySelect(page).selectOption({ label: category });
        await page.getByRole('button', { name: /^start quiz$/i }).click();

        await expectPlayableQuestion(page);

        await page.getByRole('button', { name: /^reset$/i }).click();
      }
    });

    // Verifies starting a quiz uses the final selected Pokedex pool after multiple changes.
    pokemonQuizTest('Changing pool before start uses the most recent selected pool', async ({
      page
    }) => {
      await quizPoolSelect(page).selectOption({ label: 'FireRed / LeafGreen' });
      await expect(quizPoolSelect(page)).toHaveValue('kanto');

      await quizPoolSelect(page).selectOption({ label: 'Ruby / Sapphire / Emerald' });
      await expect(quizPoolSelect(page)).toHaveValue('hoenn');

      await quizPoolSelect(page).selectOption({ label: 'Sword / Shield' });
      await expect(quizPoolSelect(page)).toHaveValue('galar');

      await quizCategorySelect(page).selectOption({ label: 'Number / Region' });
      await page.getByRole('button', { name: /^start quiz$/i }).click();

      await expectPlayableQuestion(page);
      await expect(quizPoolSelect(page)).toHaveValue('galar');
      await expect(quizCategorySelect(page)).toHaveValue('number-region');
    });

    // Verifies representative regional Pokedex pools can each launch a playable quiz round.
    pokemonQuizTest('Regional Pokedex pools can each start a quiz question', async ({
      page
    }) => {
      for (const pokemonPool of [
        { label: 'FireRed / LeafGreen', value: 'kanto' },
        { label: 'Ruby / Sapphire / Emerald', value: 'hoenn' },
        { label: 'HeartGold / SoulSilver', value: 'updated-johto' },
        { label: 'Sword / Shield', value: 'galar' },
        { label: 'Scarlet / Violet', value: 'paldea' }
      ]) {
        await quizPoolSelect(page).selectOption({ label: pokemonPool.label });
        await expect(quizPoolSelect(page)).toHaveValue(pokemonPool.value);

        await quizCategorySelect(page).selectOption({ label: 'Number / Region' });
        await page.getByRole('button', { name: /^start quiz$/i }).click();

        await expectPlayableQuestion(page);
        await expect(quizPoolSelect(page)).toHaveValue(pokemonPool.value);
        await expect(quizCategorySelect(page)).toHaveValue('number-region');

        await page.getByRole('button', { name: /^reset$/i }).click();
      }
    });
  });

  test.describe('Quiz Gameplay', () => {
    // Verifies Start Quiz renders one active question and answer choices.
    pokemonQuizTest('Start Quiz renders a playable question', async ({ page }) => {
      await page.getByRole('button', { name: /^start quiz$/i }).click();

      await expect(page.getByRole('button', { name: /^next question$/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /^reset$/i })).toBeEnabled();
      await expect(page.getByText(/READY CHECK/i)).toBeHidden();
      await expect.poll(async () => answerButtons(page).count()).toBeGreaterThanOrEqual(2);
    });

    // Verifies answer selection resolves the round and reveals answer feedback.
    pokemonQuizTest('Selecting an answer resolves the current question', async ({ page }) => {
      await page.getByRole('button', { name: /^start quiz$/i }).click();
      await expectPlayableQuestion(page);

      await page.locator('.quiz-answer-button').first().click();

      await expect(scoreMetric(page, 'Rounds')).toContainText('1');
      await expect(page.getByRole('button', { name: /^next question$/i })).toBeEnabled();
      await expect(page.locator('.quiz-answer-button.is-success')).toHaveCount(1);
    });
    // Verifies Next Question replaces the resolved prompt with a fresh question.
    pokemonQuizTest('Next Question advances to a fresh unresolved question', async ({ page }) => {
      await page.getByRole('button', { name: /^start quiz$/i }).click();
      await expectPlayableQuestion(page);

      const question = page.locator('h2');
      const firstQuestionText = await question.textContent();
      await page.getByRole('button', { name: /^next question$/i }).click();
      await expect(question).not.toHaveText(firstQuestionText ?? '');
      await expectPlayableQuestion(page);
    });
    // Verifies answered choices are disabled and marked after a round is resolved.
    pokemonQuizTest('Answered question disables or marks choices consistently', async ({ page }) => {
      await page.getByRole('button', { name: /^start quiz$/i }).click();
      await expectPlayableQuestion(page);

      await page.locator('.quiz-answer-button').first().click();

      await expect(scoreMetric(page, 'Rounds')).toContainText('1');
      await expect(page.getByRole('button', { name: /^next question$/i })).toBeEnabled();
      const answers = page.locator('.quiz-answer-button');
      const answerCount = await answers.count();
      await expect.poll(async () => page.locator('.quiz-answer-button').count()).toBeGreaterThanOrEqual(1);
      for (let i = 0; i < answerCount; i += 1) {
      await page.locator('.quiz-answer-button').nth(i).isDisabled();
      }
    });
  });

  test.describe('Scoring', () => {
    // Verifies answering one choice increments the completed round count and leaves controls usable.
    pokemonQuizTest('Answering a question updates score panel state', async ({ page }) => {
      await page.getByRole('button', { name: /^start quiz$/i }).click();
      await answerButtons(page).first().click();

      await expect(scoreMetric(page, 'Rounds')).toContainText('1');
      await expect(scoreMetric(page, 'Score')).toContainText(/[01]/);
      await expect(scoreMetric(page, 'Streak')).toContainText(/\d+/);
      await expect(page.getByRole('button', { name: /^next question$/i })).toBeEnabled();
    });

    // Verifies a known-correct type answer increments both score and streak.
    pokemonQuizTest('Correct answer increases score and streak', async ({ page }) => {
      await quizPoolSelect(page).selectOption({ label: 'FireRed / LeafGreen' });
      await quizCategorySelect(page).selectOption({ label: 'Type' });
      await expect(quizCategorySelect(page)).toHaveValue('type');
      await page.getByRole('button', { name: /^start quiz$/i }).click();

      await answerTypeQuestion(page, true);

      await expect(page.locator('.quiz-answer-button.is-success')).toHaveCount(1);
      await expect(scoreMetric(page, 'Rounds')).toContainText('1');
      await expect(scoreMetric(page, 'Score')).toContainText('1');
      await expect(scoreMetric(page, 'Streak')).toContainText('1');
    });

    // Verifies a known-wrong type answer increments rounds without adding score.
    pokemonQuizTest('Wrong answer increments rounds without increasing score', async ({ page }) => {
      await quizPoolSelect(page).selectOption({ label: 'FireRed / LeafGreen' });
      await quizCategorySelect(page).selectOption({ label: 'Type' });
      await expect(quizCategorySelect(page)).toHaveValue('type');
      await page.getByRole('button', { name: /^start quiz$/i }).click();

      await answerTypeQuestion(page, false);

      await expect(page.locator('.quiz-answer-button.is-error')).toHaveCount(1);
      await expect(page.locator('.quiz-answer-button.is-success')).toHaveCount(1);
      await expect(scoreMetric(page, 'Rounds')).toContainText('1');
      await expect(scoreMetric(page, 'Score')).toContainText('0');
      await expect(scoreMetric(page, 'Streak')).toContainText('0');
    });

    // Verifies consecutive correct answers accumulate score and streak across rounds.
    pokemonQuizTest('Score and streak persist across multiple questions', async ({ page }) => {
      await quizPoolSelect(page).selectOption({ label: 'FireRed / LeafGreen' });
      await quizCategorySelect(page).selectOption({ label: 'Type' });
      await expect(quizCategorySelect(page)).toHaveValue('type');
      await page.getByRole('button', { name: /^start quiz$/i }).click();

      await answerTypeQuestion(page, true);
      await expect(scoreMetric(page, 'Score')).toContainText('1');
      await expect(scoreMetric(page, 'Rounds')).toContainText('1');
      await expect(scoreMetric(page, 'Streak')).toContainText('1');

      await page.getByRole('button', { name: /^next question$/i }).click();
      await expect.poll(async () => quizAnswerButtons(page).first().isEnabled()).toBeTruthy();

      await answerTypeQuestion(page, true);
      await expect(scoreMetric(page, 'Score')).toContainText('2');
      await expect(scoreMetric(page, 'Rounds')).toContainText('2');
      await expect(scoreMetric(page, 'Streak')).toContainText('2');
    });
  });

  test.describe('Controls / Reset', () => {
    // Verifies Reset returns the quiz to the initial ready state.
    pokemonQuizTest('Reset returns quiz to ready state', async ({ page }) => {
      await page.getByRole('button', { name: /^start quiz$/i }).click();
      await answerButtons(page).first().click();
      await expect(page.getByRole('button', { name: /^reset$/i })).toBeEnabled();

      await page.getByRole('button', { name: /^reset$/i }).click();

      await expect(page.getByRole('button', { name: /^reset$/i })).toBeDisabled();
      await expect(page.getByText('READY CHECK')).toBeVisible();
      await expect(scoreMetric(page, 'Score')).toContainText('0');
      await expect(scoreMetric(page, 'Rounds')).toContainText('0');
      await expect(scoreMetric(page, 'Streak')).toContainText('0');
    });

    // Verifies Auto Continue can be changed before gameplay and advances after an answer.
    pokemonQuizTest('Auto Continue can be toggled before starting a quiz', async ({ page }) => {
      const autoContinueToggle = page.getByRole('checkbox', { name: /auto continue/i });

      await expect(autoContinueToggle).not.toBeChecked();
      await autoContinueToggle.check();
      await expect(autoContinueToggle).toBeChecked();
      await autoContinueToggle.uncheck();
      await expect(autoContinueToggle).not.toBeChecked();
      await autoContinueToggle.check();

      await page.getByRole('button', { name: /^start quiz$/i }).click();
      await expectPlayableQuestion(page);

      await quizAnswerButtons(page).first().click();

      await expect(scoreMetric(page, 'Rounds')).toContainText('1');
      await expect
        .poll(async () => {
          const answerStates = await quizAnswerButtons(page).evaluateAll((buttons) =>
            buttons.map((button) => ({
              disabled: (button as HTMLButtonElement).disabled,
              className: button.className
            }))
          );

          return (
            answerStates.length >= 2 &&
            answerStates.every(({ disabled }) => !disabled) &&
            answerStates.every(
              ({ className }) =>
                !String(className).includes('is-success') &&
                !String(className).includes('is-error')
            )
          );
        })
        .toBeTruthy();
    });
    // Verifies Reset exits an unanswered active question cleanly.
    pokemonQuizTest('Reset while a question is unanswered returns to ready state', async ({ page }) => {
      await page.getByRole('button', { name: /^start quiz$/i }).click();
      await answerButtons(page).first().click();
      await expect(page.getByRole('button', { name: /^reset$/i })).toBeEnabled();

      await expect(page.locator('.quiz-answer-button.is-success')).toHaveCount(1);
      await expect(page.locator('.quiz-answer-button')).toHaveCount(4);
      for (let i = 0; i < 4; i += 1) {
      await page.locator('.quiz-answer-button').nth(i).isEnabled();
      }
      await page.getByRole('button', { name: /^reset$/i }).click();

      await expect(page.getByRole('button', { name: /^reset$/i })).toBeDisabled();
      await expect(page.getByText('READY CHECK')).toBeVisible();
      await expect(scoreMetric(page, 'Score')).toContainText('0');
      await expect(scoreMetric(page, 'Rounds')).toContainText('0');
      await expect(scoreMetric(page, 'Streak')).toContainText('0');
    });
    // Verifies repeated Reset clicks do not break quiz controls.
    pokemonQuizTest('Rapid reset clicks leave controls usable', async ({ page }) => {
      for (let i = 0; i < 5; i += 1) {
      await page.getByRole('button', { name: /^start quiz$/i }).click();
      await answerButtons(page).first().click();
      await expect(page.getByRole('button', { name: /^reset$/i })).toBeEnabled();
      const answers = page.locator('.quiz-answer-button');
      const answerCount = await answers.count();
      await expect.poll(async () => page.locator('.quiz-answer-button').count()).toBeGreaterThanOrEqual(1);
      for (let i = 0; i < answerCount; i += 1) {
      await page.locator('.quiz-answer-button').nth(i).isEnabled();
      }
      await page.getByRole('button', { name: /^reset$/i }).click();

      await expect(page.getByRole('button', { name: /^reset$/i })).toBeDisabled();
      await expect(page.getByText('READY CHECK')).toBeVisible();
      await expect(scoreMetric(page, 'Score')).toContainText('0');
      await expect(scoreMetric(page, 'Rounds')).toContainText('0');
      await expect(scoreMetric(page, 'Streak')).toContainText('0');
    }
    });
  });

  test.describe('Navigation', () => {
    // Verifies Menu returns from Quiz to the home station chooser.
    pokemonQuizTest('Menu returns to the home station chooser', async ({ page }) => {
      await page.getByRole('button', { name: /^menu$/i }).click();
      await expect(page.getByRole('button', { name: /^home$/i })).toBeVisible();
      await page.getByRole('button', { name: /^home$/i }).click();

      await expect(page.getByText(/choose your station/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /pokemon team planner/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /pokemon quiz/i })).toBeVisible();
    });
    // Verifies Menu behavior while a quiz round is in progress.
    pokemonQuizTest('Menu during an active quiz preserves state', async ({
      page
    }) => {
       await page.getByRole('button', { name: /^start quiz$/i }).click();

       await page.getByRole('button', { name: 'Menu' }).click();
       await expect(page.getByRole('dialog', { name: 'Pokemon Quiz' })).toBeVisible();
       await expect(page.getByRole('button', { name: 'Close station menu' })).toBeVisible();
       await page.getByText('Pokemon QuizNow').click();
       await expectPlayableQuestion(page);
    });
    // Verifies reloading from Quiz returns to the station chooser instead of a broken partial quiz.
    pokemonQuizTest('Browser reload returns to a stable quiz state', async ({ page }) => {
      await page.getByRole('button', { name: /^start quiz$/i }).click();
      await expectPlayableQuestion(page);

      await page.reload();

      await expect(page.getByText(/choose your station/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /pokemon quiz/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /pokemon tcg simulator/i })).toBeVisible();

      await page.getByRole('button', { name: /pokemon quiz/i }).click();

      await expect(page.getByRole('heading', { name: /pokemon quiz/i })).toBeVisible();
      await expect(quizPoolSelect(page)).toHaveValue('all');
      await expect(quizCategorySelect(page)).toHaveValue('mixed');
    });
  });

  test.describe('Edge / Reliability', () => {
    // Verifies repeated Start Quiz clicks do not create duplicate active questions.
    pokemonQuizTest('Rapid Start Quiz clicks leave one active question', async ({ page }) => {
      const startButton = page.getByRole('button', { name: /^start quiz$/i });

      for (let clickCount = 0; clickCount < 3; clickCount += 1) {
        if (await startButton.isVisible()) {
          await startButton.click();
        }
      }

      await expect(page.getByRole('button', { name: /^next question$/i })).toHaveCount(1);
      await expect.poll(async () => answerButtons(page).count()).toBeGreaterThanOrEqual(2);
      await expect(page.getByRole('button', { name: /^reset$/i })).toBeEnabled();
    });

    // Verifies repeated answer clicks only complete the current round once.
    pokemonQuizTest('Rapid answer clicks settle to one completed round', async ({ page }) => {
      await page.getByRole('button', { name: /^start quiz$/i }).click();

      const firstAnswer = answerButtons(page).first();
      await firstAnswer.click();

      for (let clickCount = 0; clickCount < 3; clickCount += 1) {
        if (await firstAnswer.isEnabled()) {
          await firstAnswer.click();
        }
      }

      await expect(scoreMetric(page, 'Rounds')).toContainText('1');
      await expect(page.getByRole('button', { name: /^next question$/i })).toBeEnabled();
      await expect(answerButtons(page)).not.toHaveCount(0);
      await expect.poll(async () => {
        const disabledStates = await answerButtons(page).evaluateAll((buttons) =>
          buttons.map((button) => (button as HTMLButtonElement).disabled)
        );

        return disabledStates.every(Boolean);
      }).toBeTruthy();
    });

    // Verifies missing sprite or cry assets do not prevent answering a quiz question.
    test('Image and audio request failures leave quiz controls usable', async ({ page }) => {
      await page.route(/\.(png|jpe?g|gif|webp|svg|mp3|ogg|wav)(\?.*)?$/i, (route) =>
        route.abort()
      );
      await openPokemonQuiz(page);

      await quizCategorySelect(page).selectOption({ label: 'Cry / Sprite' });
      await page.getByRole('button', { name: /^start quiz$/i }).click();

      await expect(page.getByRole('button', { name: /^next question$/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /^reset$/i })).toBeEnabled();
      await expect.poll(async () => page.locator('.quiz-answer-button').count()).toBeGreaterThanOrEqual(2);
      await page.locator('.quiz-answer-button').first().click();
      await expect(scoreMetric(page, 'Rounds')).toContainText('1');
    });

    // Verifies delayed Pokemon data still recovers into a playable quiz state.
    test('Delayed quiz data keeps stable loading or ready state', async ({ page }) => {
      let releasePokemonRequests!: () => void;
      const pokemonRequestsCanContinue = new Promise<void>((resolve) => {
        releasePokemonRequests = resolve;
      });

      await page.route('**/pokeapi.co/**', async (route) => {
        await pokemonRequestsCanContinue;
        await route.continue();
      });

      await clearBrowserDataCache(page);
      await page.goto('/');
      await page.getByRole('button', { name: /pokemon quiz/i }).click();

      await expect(page.getByRole('heading', { name: /pokemon quiz/i })).toBeVisible();
      await expect(quizPoolSelect(page)).toBeVisible();
      await expect(quizCategorySelect(page)).toBeVisible();
      await expect(page.getByText('READY CHECK')).toBeVisible();

      releasePokemonRequests();
      await page.getByRole('button', { name: /^start quiz$/i }).click();
      await expect.poll(async () => answerButtons(page).count()).toBeGreaterThanOrEqual(2);
      await expect(page.getByRole('button', { name: /^reset$/i })).toBeEnabled();
    });

    // Verifies repeated category changes leave Start Quiz wired to the latest category.
    pokemonQuizTest('Changing category repeatedly before start leaves Start Quiz usable', async ({
      page
    }) => {
      for (const categoryLabel of [
        'Type',
        'Evolution',
        'Generation',
        'Legendary',
        'Mixed Quiz'
      ]) {
        await quizCategorySelect(page).selectOption({ label: categoryLabel });
      }

      await expect(quizCategorySelect(page)).toHaveValue('mixed');
      await page.getByRole('button', { name: /^start quiz$/i }).click();
      await expect(page.getByRole('button', { name: /^next question$/i })).toBeVisible();
      await expect.poll(async () => answerButtons(page).count()).toBeGreaterThanOrEqual(2);
    });
  });
});
