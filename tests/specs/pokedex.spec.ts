import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/test';

test.describe('@live Pokemon Pokedex', () => {
  function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Opens the Pokedex station from the home screen and waits for the list controls.
  async function openPokedex(page: Page) {
    await page.goto('/');
    await page.getByRole('button', { name: /search pokemon by name or number/i }).click();

    await expect(page.getByPlaceholder('Name or number...')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /^search$/i })).toBeEnabled();
    await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeVisible({ timeout: 30_000 });
  }

  const pokedexTest = test.extend<{ openPokedexStation: void }>({
    openPokedexStation: [
      async ({ page }, use) => {
        await openPokedex(page);
        await use();
      },
      { auto: true }
    ]
  });

  // Locates a Pokemon list entry while supporting both numbered and name-only list cards.
  function pokemonListButton(page: Page, pokedexNumber: number, pokemonName: string) {
    const paddedNumber = String(pokedexNumber).padStart(3, '0');

    return page.locator('button.pokemon-list-item').filter({
      hasText: new RegExp(`^(?:#${paddedNumber}\\s*)?${escapeRegExp(pokemonName)}$`, 'i')
    });
  }

  // Locates visible Pokemon list entries in the current results grid.
  function pokemonListButtons(page: Page) {
    return page.locator('.pokemon-list-item');
  }

  // Clears the search field and waits until the default list has recovered from async updates.
  async function clearPokemonSearch(page: Page) {
    const searchInput = page.getByPlaceholder('Name or number...');
    const clearButton = page.getByRole('button', { name: /^clear$/i });

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await expect(clearButton).toBeEnabled();
      await clearButton.click();

      try {
        await expect(searchInput).toHaveValue('', { timeout: 1_500 });
        break;
      } catch (error) {
        if (attempt === 3) {
          throw error;
        }
      }
    }

    await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeVisible({ timeout: 30_000 });
  }

  // Reads the selected Pokemon identity from the populated detail panel.
  async function selectedPokemonIdentity(page: Page) {
    const selectedNumberText =
      (await page
        .locator('article')
        .getByText(/#\d{3,4}/)
        .first()
        .textContent()) ?? '';
    const selectedPokedexNumber = Number(selectedNumberText.replace(/\D/g, ''));
    const playCryButton = page.getByRole('button', { name: /^Play .+ cry$/i });

    await expect(playCryButton).toBeVisible();

    const playCryLabel = await playCryButton.evaluate(
      (button) => button.getAttribute('aria-label') ?? button.textContent ?? ''
    );
    const selectedPokemonName = playCryLabel.match(/^Play (.+) cry$/i)?.[1] ?? '';

    expect(selectedPokedexNumber).toBeGreaterThan(0);
    expect(selectedPokemonName).toBeTruthy();

    return {
      name: selectedPokemonName,
      pokedexNumber: selectedPokedexNumber
    };
  }

  // Reads the visible card image names from the Featured TCG Cards panel.
  async function featuredTcgCardNames(page: Page) {
    const featuredCardsHeading = page.getByRole('heading', { name: /featured tcg cards/i });

    await expect(featuredCardsHeading).toBeVisible();
    await expect
      .poll(() =>
        featuredCardsHeading.evaluate(
          (heading) =>
            [...document.querySelectorAll('button, [role="button"]')].filter(
              (button) =>
                Boolean(
                  heading.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING
                ) && Boolean(button.querySelector('img'))
            ).length
        )
      )
      .toBeGreaterThan(0);

    return featuredCardsHeading.evaluate((heading) =>
      [...document.querySelectorAll('button, [role="button"]')]
        .filter(
          (button) =>
            Boolean(heading.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING) &&
            Boolean(button.querySelector('img'))
        )
        .map((button) => button.querySelector('img')?.getAttribute('alt') ?? '')
    );
  }

  // Reads generation sprite image metadata from the selected Pokemon detail.
  async function generationSpriteImages(page: Page) {
    const generationSpritesHeading = page.getByRole('heading', { name: /generation sprites/i });

    await expect(generationSpritesHeading).toBeVisible();
    await expect
      .poll(() =>
        generationSpritesHeading.evaluate(
          (heading) =>
            heading.parentElement?.querySelectorAll('button img, [role="button"] img').length ?? 0
        )
      )
      .toBeGreaterThan(0);

    return generationSpritesHeading.evaluate((heading) =>
      [...(heading.parentElement?.querySelectorAll('button img, [role="button"] img') ?? [])].map(
        (image) => {
          const spriteImage = image as HTMLImageElement;

          return {
            alt: spriteImage.getAttribute('alt') ?? '',
            src: spriteImage.currentSrc || spriteImage.src
          };
        }
      )
    );
  }

  test.describe('Station / Initial Load', () => {
    // Verifies the Pokedex station opens with filters, search, sort, and the default list.
    pokedexTest('Starts Pokedex station', async ({ page }) => {
      await expect(page.getByRole('button', { name: /^all games/i })).toBeVisible();
      await expect(page.getByPlaceholder('Name or number...')).toBeVisible();
      await expect(page.getByRole('button', { name: /^random$/i })).toBeVisible();
      await expect(page.getByRole('combobox')).toHaveValue('entry');
      await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeVisible();
      await expect(pokemonListButton(page, 2, 'Ivysaur')).toBeVisible();
    });

    // Verifies the station shows a stable loading message while Pokemon data is delayed.
    test('Shows a stable loading state before the Pokemon list is ready', async ({ page }) => {
      let releasePokemonRequests!: () => void;
      const pokemonRequestsCanContinue = new Promise<void>((resolve) => {
        releasePokemonRequests = resolve;
      });

      await page.route('**/pokeapi.co/**', async (route) => {
        await pokemonRequestsCanContinue;
        await route.continue();
      });

      await page.goto('/');
      await page.getByRole('button', { name: /search pokemon by name or number/i }).click();

      await expect(page.getByText('Loading Pokemon...')).toBeVisible();
      await expect(page.getByText(/Choose a Pokemon from All Games/i)).toBeVisible();
      await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeHidden();

      releasePokemonRequests();

      await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText('Loading Pokemon...')).toBeHidden();
    });

    // Verifies the station menu can return to the home station chooser.
    pokedexTest(
      'Menu returns from Pokedex station to the home station chooser',
      async ({ page }) => {
        await page.getByRole('button', { name: /^menu$/i }).click();
        await expect(page.getByRole('button', { name: /^home$/i })).toBeVisible();
        await page.getByRole('button', { name: /^home$/i }).click();

        await expect(page.getByText(/choose your station/i)).toBeVisible();
        await expect(page.getByRole('button', { name: /pokemon tcg simulator/i })).toBeVisible();
        await expect(
          page.getByRole('button', { name: /search pokemon by name or number/i })
        ).toBeVisible();
      }
    );
  });

  test.describe('Search', () => {
    // Verifies searching by name filters the list to the matching Pokemon.
    pokedexTest('Search by Pokemon name', async ({ page }) => {
      await page.getByPlaceholder('Name or number...').fill('pikachu');
      await page.getByRole('button', { name: /^search$/i }).click();

      await expect(pokemonListButton(page, 25, 'Pikachu')).toBeVisible();
      await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeHidden();
    });

    // Verifies numeric search jumps directly to the matching Pokedex entry.
    pokedexTest('Search by Pokedex number finds the matching Pokemon', async ({ page }) => {
      await page.getByPlaceholder('Name or number...').fill('25');
      await page.getByRole('button', { name: /^search$/i }).click();

      await expect(pokemonListButton(page, 25, 'Pikachu')).toBeVisible();
      await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeHidden();
    });
    // Verifies search normalizes casing and surrounding whitespace before matching.
    pokedexTest('Search is case-insensitive and trims extra spaces', async ({ page }) => {
      await page.getByPlaceholder('Name or number...').fill('   PiKaChU   ');
      await page.getByRole('button', { name: /^search$/i }).click();

      await expect(pokemonListButton(page, 25, 'Pikachu')).toBeVisible();
      await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeHidden();
    });
    // Verifies unmatched search terms show both user feedback and an empty result state.
    pokedexTest('Invalid search displays no results or an empty state', async ({ page }) => {
      await page.getByPlaceholder('Name or number...').fill('testing');
      await page.getByRole('button', { name: /^search$/i }).click();

      await expect(page.getByText('Pokemon not found. Try a name')).toBeVisible();
      await expect(page.getByText('No Pokemon match this Pokedex')).toBeVisible();
    });
    // Verifies Clear removes the active search term and restores the initial Pokemon list.
    pokedexTest('Clear button resets search and restores the default list', async ({ page }) => {
      await page.getByPlaceholder('Name or number...').fill('Pikachu');
      await page.getByRole('button', { name: /^search$/i }).click();

      await expect(pokemonListButton(page, 25, 'Pikachu')).toBeVisible();
      await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeHidden();
      await clearPokemonSearch(page);
    });
    // Verifies keyboard submission behaves the same as clicking the Search button.
    pokedexTest('Pressing Enter in the search field submits the search', async ({ page }) => {
      await page.getByPlaceholder('Name or number...').fill('Pikachu');
      await page.keyboard.press('Enter');

      await expect(pokemonListButton(page, 25, 'Pikachu')).toBeVisible();
      await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeHidden();
    });
  });
  test.describe('Pokemon Details', () => {
    // Verifies selecting a Pokemon opens a detail panel with identity, type, and profile data.
    pokedexTest('Opens Pokemon detail view', async ({ page }) => {
      await pokemonListButton(page, 25, 'Pikachu').click();

      await expect(page.getByRole('img', { name: 'pikachu', exact: true })).toBeVisible();
      await expect(page.getByText('#025').last()).toBeVisible();
      await expect(page.getByText('Pikachu').last()).toBeVisible();
      await expect(page.locator('.type-badge').filter({ hasText: /^Electric$/i })).toBeVisible();
      await expect(page.getByText(/Mouse Pok.mon/)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Play Pikachu cry' })).toBeVisible();
    });
    // Verifies the featured TCG panel always shows cards corresponding to the random Pokemon.
    pokedexTest('Featured TCG cards belong to the random Pokemon detail', async ({ page }) => {
      await page.getByRole('button', { name: /^random$/i }).click();

      const randomPokemon = await selectedPokemonIdentity(page);
      await expect(page.getByText('FEATURED TCG CARDS')).toBeVisible();

      const featuredCardNames = await featuredTcgCardNames(page);
      expect(featuredCardNames.length).toBeGreaterThan(0);
      const expectedCardNamePart = randomPokemon.name.toLowerCase().split(/\s+/)[0];

      for (const featuredCardName of featuredCardNames) {
        expect(featuredCardName.toLowerCase()).toContain(expectedCardNamePart);
      }
    });
    // Verifies searching a Pokemon also selects and populates that Pokemon in the detail panel.
    pokedexTest(
      'Detail view opened from search shows the correct selected Pokemon',
      async ({ page }) => {
        await page.getByPlaceholder('Name or number...').fill('pikachu');
        await page.getByRole('button', { name: /^search$/i }).click();

        await expect(pokemonListButton(page, 25, 'Pikachu')).toBeVisible();
        await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeHidden();
        await expect(page.locator('.type-badge').filter({ hasText: /^Electric$/i })).toBeVisible();
        await expect(page.getByText(/Mouse Pok.mon/)).toBeVisible();
        await expect(page.getByRole('button', { name: 'Play Pikachu cry' })).toBeVisible();
      }
    );
    // Verifies the primary official artwork URL and loaded image dimensions match the selected Pokemon.
    pokedexTest('Pokemon detail images have valid image sources', async ({ page }) => {
      await page.getByRole('button', { name: /^random$/i }).click();
      const randomPokemon = await selectedPokemonIdentity(page);

      const primaryDetailImage = page.locator('article img[src*="/official-artwork/"]').first();

      await expect(primaryDetailImage).toBeVisible();
      await expect(primaryDetailImage).toHaveAttribute(
        'src',
        new RegExp(`/official-artwork/${randomPokemon.pokedexNumber}\\.png$`)
      );
      await expect
        .poll(() =>
          primaryDetailImage.evaluate((image) => {
            const detailImage = image as HTMLImageElement;

            return detailImage.naturalWidth + detailImage.naturalHeight;
          })
        )
        .toBeGreaterThan(0);
    });
    // Verifies generation sprite thumbnails use real PokeAPI sprite URLs and valid alt text.
    pokedexTest(
      'Generation sprites have valid image sources for a random Pokemon',
      async ({ page }) => {
        await page.getByRole('button', { name: /^random$/i }).click();
        await selectedPokemonIdentity(page);

        const spriteImages = await generationSpriteImages(page);

        expect(spriteImages.length).toBeGreaterThan(0);
        for (const spriteImage of spriteImages) {
          expect(spriteImage.alt).toMatch(/sprite/i);
          expect(spriteImage.src).toMatch(
            /^https:\/\/raw\.githubusercontent\.com\/PokeAPI\/sprites\/master\/sprites\/pokemon\/versions\/.+\.(png|gif)$/i
          );
          expect(spriteImage.src).not.toContain('undefined');
          expect(spriteImage.src).not.toContain('null');
        }
      }
    );
  });
  test.describe('Game Pokedex / Region Filters', () => {
    // Verifies selecting a game Pokedex restricts the visible list to that game range.
    pokedexTest('Kanto game Pokedex filter shows Kanto Pokemon', async ({ page }) => {
      await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeVisible();
      await expect(pokemonListButton(page, 152, 'Chikorita')).toBeVisible();

      await page.getByRole('button', { name: /firered\s*\/\s*leafgreen/i }).click();

      await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeVisible();
      await expect(pokemonListButton(page, 151, 'Mew')).toBeVisible();
      await expect(pokemonListButton(page, 152, 'Chikorita')).toBeHidden();
    });

    // Verifies the Johto filter includes Johto Pokemon and hides Pokemon outside that regional list.
    pokedexTest(
      'Johto filter includes Johto starters and excludes non-listed Pokemon',
      async ({ page }) => {
        await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeVisible();
        await page.getByRole('button', { name: 'HeartGold / SoulSilver Johto' }).click();
        await expect(pokemonListButton(page, 152, 'Chikorita')).toBeVisible();
        await expect(pokemonListButton(page, 155, 'Cyndaquil')).toBeVisible();
        await expect(pokemonListButton(page, 252, 'Treecko')).toBeHidden();
      }
    );
    // Verifies the Hoenn filter shows the Hoenn starter Pokemon and excludes earlier starters.
    pokedexTest('Hoenn filter includes Treecko, Torchic, and Mudkip', async ({ page }) => {
      await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeVisible();
      await page.getByRole('button', { name: 'Ruby / Sapphire / Emerald' }).click();
      await expect(pokemonListButton(page, 152, 'Chikorita')).toBeHidden();
      await expect(pokemonListButton(page, 155, 'Cyndaquil')).toBeHidden();
      await expect(pokemonListButton(page, 252, 'Treecko')).toBeVisible();
      await expect(pokemonListButton(page, 255, 'Torchic')).toBeVisible();
      await expect(pokemonListButton(page, 258, 'Mudkip')).toBeVisible();
    });
    // Verifies returning to All Games removes the active regional filter.
    pokedexTest(
      'All Games restores the full Pokedex list after a region filter',
      async ({ page }) => {
        await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeVisible();
        await page.getByRole('button', { name: 'Ruby / Sapphire / Emerald' }).click();
        await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeHidden();
        await page.getByRole('button', { name: 'All Games Every listed Pokedex' }).click();
        await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeVisible();
      }
    );
  });

  test.describe('Sorting', () => {
    // Verifies sort controls reorder the Pokemon list.
    pokedexTest('Sort by name reorders Pokemon alphabetically', async ({ page }) => {
      await page.getByRole('combobox').selectOption({ label: 'Name' });

      await expect(pokemonListButtons(page).first()).not.toContainText('Bulbasaur');
      await expect(pokemonListButtons(page).first()).toContainText(/Abomasnow|Abra/i);
    });

    // Verifies switching back to Pokedex Number restores the default numerical ordering.
    pokedexTest('Sort by Pokedex Number restores numerical order', async ({ page }) => {
      await page.getByRole('combobox').selectOption({ label: 'Name' });
      await expect(pokemonListButtons(page).first()).not.toContainText('Bulbasaur');
      await page.getByRole('combobox').selectOption({ label: 'Pokedex Number' });
      await expect(pokemonListButtons(page).first()).toContainText('Bulbasaur');
    });
    // Verifies Type sort can be applied while keeping expected Pokemon visible.
    pokedexTest('Sort by Type can be selected without dropping Pokemon', async ({ page }) => {
      await expect(pokemonListButtons(page).first()).toContainText('Bulbasaur');
      await page.getByRole('combobox').selectOption({ label: 'Type' });
      await expect(page.getByRole('combobox')).toHaveValue('type');
      await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeVisible();
      await expect(pokemonListButton(page, 10, 'Caterpie')).toBeVisible();
    });
    // Verifies HP stat sort can be applied while keeping expected Pokemon visible.
    pokedexTest('Sort by stat - HP can be selected without dropping Pokemon', async ({ page }) => {
      await expect(pokemonListButtons(page).first()).toContainText('Bulbasaur');
      await page.getByRole('combobox').selectOption({ label: 'HP' });
      await expect(page.getByRole('combobox')).toHaveValue('stat-hp');
      await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeVisible();
      await expect(pokemonListButton(page, 10, 'Caterpie')).toBeVisible();
    });
    // Verifies sorting preserves the currently selected game Pokedex filter.
    pokedexTest('Sorting does not clear an active game Pokedex filter', async ({ page }) => {
      await expect(pokemonListButton(page, 252, 'Treecko')).toBeVisible();

      await page.getByRole('button', { name: /ruby\s*\/\s*sapphire\s*\/\s*emerald/i }).click();

      await expect(pokemonListButton(page, 252, 'Treecko')).toBeVisible();
      await expect(pokemonListButton(page, 255, 'Torchic')).toBeVisible();
      await expect(pokemonListButton(page, 258, 'Mudkip')).toBeVisible();
      await expect(pokemonListButton(page, 152, 'Chikorita')).toBeHidden();

      await page.getByRole('combobox').selectOption({ label: 'Name' });

      await expect(pokemonListButton(page, 252, 'Treecko')).toBeVisible();
      await expect(pokemonListButton(page, 255, 'Torchic')).toBeVisible();
      await expect(pokemonListButton(page, 258, 'Mudkip')).toBeVisible();
      await expect(pokemonListButton(page, 152, 'Chikorita')).toBeHidden();
    });
  });

  test.describe('Random', () => {
    // Verifies Random selects a valid Pokemon and opens a populated detail view.
    pokedexTest('Random opens a valid Pokemon detail', async ({ page }) => {
      await page.getByRole('button', { name: /^random$/i }).click();

      await expect(page.getByText(/#\d{3}/).last()).toBeVisible();
      await expect(page.getByText('Base Stats')).toBeVisible();
      await expect(page.getByText('Profile')).toBeVisible();
    });

    // Verifies repeated Random actions always leave a populated valid detail view.
    pokedexTest('Repeated random clicks keep returning valid Pokemon details', async ({ page }) => {
      for (let clickCount = 0; clickCount < 3; clickCount += 1) {
        await page.getByRole('button', { name: /^random$/i }).click();

        const randomPokemon = await selectedPokemonIdentity(page);

        expect(randomPokemon.pokedexNumber).toBeGreaterThan(0);
        expect(randomPokemon.name).toBeTruthy();
        await expect(page.getByText('Base Stats')).toBeVisible();
        await expect(page.getByText('Profile')).toBeVisible();
      }
    });
    // Verifies a random result can be used as a search target and then cleared cleanly.
    pokedexTest('Random result can be searched or cleared afterward', async ({ page }) => {
      await page.getByRole('button', { name: /^random$/i }).click();
      const randomPokemon = await selectedPokemonIdentity(page);

      await page.getByPlaceholder('Name or number...').fill(String(randomPokemon.pokedexNumber));
      await page.getByRole('button', { name: /^search$/i }).click();

      await expect(
        pokemonListButton(page, randomPokemon.pokedexNumber, randomPokemon.name)
      ).toBeVisible();
      await clearPokemonSearch(page);
    });
  });

  test.describe('Edge / Reliability', () => {
    // Verifies the visible Pokemon list does not render duplicate entries.
    pokedexTest('Visible Pokemon list has no duplicate entries', async ({ page }) => {
      const visiblePokemonNames = await pokemonListButtons(page).evaluateAll((buttons) =>
        buttons.map((button) => button.textContent?.trim() ?? '')
      );

      expect(new Set(visiblePokemonNames).size).toBe(visiblePokemonNames.length);
    });
    // Verifies blank or whitespace-only search input validates without clearing current results.
    pokedexTest('Empty search submission keeps the current list stable', async ({ page }) => {
      await page.getByPlaceholder('Name or number...').fill(' ');
      await page.getByRole('button', { name: /^search$/i }).click();
      await expect(pokemonListButton(page, 25, 'Pikachu')).toBeVisible();
      await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeVisible();
      await expect(page.getByText('Please enter a valid Pokemon')).toBeVisible();
    });
    // Verifies a very long unmatched term reaches the empty state without breaking controls.
    pokedexTest(
      'Very long search text shows no results without breaking the page',
      async ({ page }) => {
        await page.getByPlaceholder('Name or number...').fill('QWERTYUIOPASDFGHJKLZXCVBNM');
        await page.getByRole('button', { name: /^search$/i }).click();
        await expect(page.getByText('No Pokemon match this Pokedex')).toBeVisible();
        await expect(page.getByText('Pokemon not found. Try a name')).toBeVisible();
      }
    );
    // Verifies special-character input validates safely and preserves the default list.
    pokedexTest(
      'Special-character search text shows no results without breaking the page',
      async ({ page }) => {
        await page.getByPlaceholder('Name or number...').fill('!@#$%');
        await page.getByRole('button', { name: /^search$/i }).click();
        await expect(page.getByText('Please enter a valid Pokemon')).toBeVisible();
        await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeVisible();
      }
    );
    // Verifies numeric values outside the supported Pokedex range show an empty state.
    pokedexTest('Out-of-range numeric search shows no results', async ({ page }) => {
      await page.getByPlaceholder('Name or number...').fill('99999');
      await page.getByRole('button', { name: /^search$/i }).click();

      await expect(page.getByText('No Pokemon match this Pokedex')).toBeVisible();
      await expect(pokemonListButtons(page)).toHaveCount(0);
      await expect(page.getByRole('button', { name: /^search$/i })).toBeEnabled();
      await expect(page.getByRole('button', { name: /^random$/i })).toBeEnabled();
    });
    // Verifies negative numeric input shows validation and does not clear visible Pokemon.
    pokedexTest(
      'Negative numeric search shows validation without clearing the list',
      async ({ page }) => {
        await page.getByPlaceholder('Name or number...').fill('-1');
        await page.getByRole('button', { name: /^search$/i }).click();

        await expect(page.getByText('Please enter a valid Pokemon')).toBeVisible();
        await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeVisible();
        await expect(pokemonListButton(page, 10, 'Caterpie')).toBeVisible();
      }
    );
    // Verifies Clear recovers the default list after an invalid search empties the results.
    pokedexTest('Clear after invalid search restores the default list', async ({ page }) => {
      await page.getByPlaceholder('Name or number...').fill('testing');
      await page.getByRole('button', { name: /^search$/i }).click();

      await expect(page.getByText('No Pokemon match this Pokedex')).toBeVisible();
      await expect(pokemonListButtons(page)).toHaveCount(0);

      await clearPokemonSearch(page);

      await expect(page.getByPlaceholder('Name or number...')).toHaveValue('');
      await expect(pokemonListButton(page, 25, 'Pikachu')).toBeVisible();
      await expect(page.getByText('No Pokemon match this Pokedex')).toBeHidden();
    });
    // Verifies sorting an empty search result keeps the empty state and selected sort stable.
    pokedexTest(
      'Sort while search has no results keeps the empty state stable',
      async ({ page }) => {
        await page.getByPlaceholder('Name or number...').fill('testing');
        await page.getByRole('button', { name: /^search$/i }).click();
        await expect(page.getByText('No Pokemon match this Pokedex')).toBeVisible();

        await page.getByRole('combobox').selectOption({ label: 'Name' });

        await expect(page.getByText('No Pokemon match this Pokedex')).toBeVisible();
        await expect(pokemonListButtons(page)).toHaveCount(0);
        await expect(page.getByRole('combobox')).toHaveValue('name');
      }
    );
    // Verifies searching outside an active region does not leak Pokemon from another Pokedex.
    pokedexTest(
      'Search outside the active region filter does not leak unrelated Pokemon',
      async ({ page }) => {
        await page.getByRole('button', { name: /firered\s*\/\s*leafgreen/i }).click();
        await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeVisible();
        await expect(pokemonListButton(page, 152, 'Chikorita')).toBeHidden();

        await page.getByPlaceholder('Name or number...').fill('Chikorita');
        await page.getByRole('button', { name: /^search$/i }).click();

        await expect(page.getByText('No Pokemon match this Pokedex')).toBeVisible();
        await expect(pokemonListButton(page, 152, 'Chikorita')).toBeHidden();
        await expect(pokemonListButtons(page)).toHaveCount(0);
      }
    );
    // Verifies rapid Random clicks settle on a single usable detail panel.
    pokedexTest('Rapid Random clicks leave one valid detail view visible', async ({ page }) => {
      for (let clickCount = 0; clickCount < 5; clickCount += 1) {
        await page.getByRole('button', { name: /^random$/i }).click();
      }

      const randomPokemon = await selectedPokemonIdentity(page);

      expect(randomPokemon.pokedexNumber).toBeGreaterThan(0);
      await expect(page.getByRole('button', { name: /^Play .+ cry$/i })).toHaveCount(1);
      await expect(page.getByText('Base Stats')).toBeVisible();
      await expect(page.getByText('Profile')).toBeVisible();
    });
    // Verifies repeated search and clear cycles leave search and random controls usable.
    pokedexTest('Rapid Search and Clear actions leave controls usable', async ({ page }) => {
      const searchInput = page.getByPlaceholder('Name or number...');
      const searchButton = page.getByRole('button', { name: /^search$/i });

      const searchCases = [
        {
          term: 'Pikachu',
          settled: () => expect(pokemonListButton(page, 25, 'Pikachu')).toBeVisible()
        },
        {
          term: 'testing',
          settled: () => expect(page.getByText('No Pokemon match this Pokedex')).toBeVisible()
        },
        {
          term: 'Bulbasaur',
          settled: () => expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeVisible()
        }
      ];

      for (const searchCase of searchCases) {
        await searchInput.fill(searchCase.term);
        await searchButton.click();
        await searchCase.settled();
        await clearPokemonSearch(page);
      }

      await expect(searchButton).toBeEnabled();
      await expect(page.getByRole('button', { name: /^random$/i })).toBeEnabled();
      await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeVisible();
      await expect(pokemonListButton(page, 10, 'Caterpie')).toBeVisible();
    });
    // Verifies Pokemon names with punctuation or spacing variants can open the correct profile.
    pokedexTest('Special-name Pokemon detail opens with the correct profile', async ({ page }) => {
      await page.getByPlaceholder('Name or number...').fill('Mr. Mime');
      await page.getByRole('button', { name: /^search$/i }).click();

      await expect(pokemonListButton(page, 122, 'Mr Mime')).toBeVisible();
      await pokemonListButton(page, 122, 'Mr Mime').click();

      await expect(page.getByText('#122').last()).toBeVisible();
      await expect(page.getByText('Mr Mime').last()).toBeVisible();
      await expect(page.locator('.type-badge').filter({ hasText: /^Psychic$/i })).toBeVisible();
      await expect(page.locator('.type-badge').filter({ hasText: /^Fairy$/i })).toBeVisible();
      await expect(page.getByText(/Barrier Pok.mon/)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Play Mr Mime cry' })).toBeVisible();
    });
    // Verifies failed image requests do not prevent identity, stats, and controls from rendering.
    test('Missing or failed image loads show a stable fallback state', async ({ page }) => {
      await page.route('**/*.{png,jpg,jpeg,gif,webp}', (route) => route.abort());
      await page.route('**/raw.githubusercontent.com/PokeAPI/sprites/**', (route) => route.abort());

      await openPokedex(page);

      await page.getByPlaceholder('Name or number...').fill('Pikachu');
      await page.getByRole('button', { name: /^search$/i }).click();

      await expect(pokemonListButton(page, 25, 'Pikachu')).toBeVisible();
      await expect(page.getByText('#025').last()).toBeVisible();
      await expect(page.getByText('Pikachu').last()).toBeVisible();
      await expect(page.locator('.type-badge').filter({ hasText: /^Electric$/i })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Play Pikachu cry' })).toBeVisible();
      await expect(page.getByText('Base Stats')).toBeVisible();
      await expect(page.getByText('Profile')).toBeVisible();

      const failedImages = await page
        .locator('img')
        .evaluateAll(
          (images) =>
            images.filter((image) => (image as HTMLImageElement).naturalWidth === 0).length
        );

      expect(failedImages).toBeGreaterThan(0);
    });
  });
});
