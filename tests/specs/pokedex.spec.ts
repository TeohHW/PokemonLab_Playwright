import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/test';

test.describe('Pokemon Pokedex', () => {
  // Opens the Pokedex station from the home screen and waits for the list controls.
  async function openPokedex(page: Page) {
    await page.goto('/');
    await page.getByRole('button', { name: /search pokemon by name or number/i }).click();

    await expect(page.getByPlaceholder('Name or number...')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /^search$/i })).toBeEnabled();
  }

  // Locates a Pokemon list entry by National Pokedex number and display name.
  function pokemonListButton(page: Page, pokedexNumber: number, pokemonName: string) {
    const paddedNumber = String(pokedexNumber).padStart(3, '0');

    return page.getByRole('button', {
      name: new RegExp(`#${paddedNumber}\\s*${pokemonName}`, 'i')
    });
  }

  // Locates visible Pokemon list entries, which include a National Pokedex number.
  function pokemonListButtons(page: Page) {
    return page.getByRole('button', { name: /#\d{3}/ });
  }

  test.describe('Station / Initial Load', () => {
    // Verifies the Pokedex station opens with filters, search, sort, and the default list.
    test('Starts Pokedex station', async ({ page }) => {
      await openPokedex(page);

      await expect(page.getByRole('button', { name: /^all games/i })).toBeVisible();
      await expect(page.getByPlaceholder('Name or number...')).toBeVisible();
      await expect(page.getByRole('button', { name: /^random$/i })).toBeVisible();
      await expect(page.getByRole('combobox')).toHaveValue('entry');
      await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeVisible();
      await expect(pokemonListButton(page, 2, 'Ivysaur')).toBeVisible();
    });

    test.skip('Shows a stable loading state before the Pokemon list is ready', async () => {});
    test.skip('Menu returns from Pokedex station to the home station chooser', async () => {});
  });

  test.describe('Search', () => {
    // Verifies searching by name filters the list to the matching Pokemon.
    test('Search by Pokemon name', async ({ page }) => {
      await openPokedex(page);

      await page.getByPlaceholder('Name or number...').fill('pikachu');
      await page.getByRole('button', { name: /^search$/i }).click();

      await expect(pokemonListButton(page, 25, 'Pikachu')).toBeVisible();
      await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeHidden();
    });

    test.skip('Search by Pokedex number finds the matching Pokemon', async () => {});
    test.skip('Search is case-insensitive and trims extra spaces', async () => {});
    test.skip('Invalid search displays no results or an empty state', async () => {});
    test.skip('Clear button resets search and restores the default list', async () => {});
    test.skip('Pressing Enter in the search field submits the search', async () => {});
  });

  test.describe('Pokemon Details', () => {
    // Verifies selecting a Pokemon opens a detail panel with identity, type, and profile data.
    test('Opens Pokemon detail view', async ({ page }) => {
      await openPokedex(page);

      await pokemonListButton(page, 25, 'Pikachu').click();

      await expect(page.getByRole('img', { name: 'pikachu', exact: true })).toBeVisible();
      await expect(page.getByText('#025').last()).toBeVisible();
      await expect(page.getByText('Pikachu').last()).toBeVisible();
      await expect(page.getByText(/^Electric$/i)).toBeVisible();
      await expect(page.getByText(/Mouse Pok.mon/)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Play Pikachu cry' })).toBeVisible();
    });

    test.skip('Detail view can be closed or navigated away from without losing the list', async () => {});
    test.skip('Detail view opened from search shows the correct selected Pokemon', async () => {});
    test.skip('Pokemon detail images have valid image sources', async () => {});
  });

  test.describe('Game Pokedex / Region Filters', () => {
    // Verifies selecting a game Pokedex restricts the visible list to that game range.
    test('Kanto game Pokedex filter shows Kanto Pokemon', async ({ page }) => {
      await openPokedex(page);

      await page.getByRole('button', { name: /firered\s*\/\s*leafgreen/i }).click();

      await expect(pokemonListButton(page, 1, 'Bulbasaur')).toBeVisible();
      await expect(pokemonListButton(page, 151, 'Mew')).toBeVisible();
      await expect(pokemonListButton(page, 152, 'Chikorita')).toBeHidden();
    });

    test.skip('Johto filter includes Johto starters and excludes non-listed Pokemon', async () => {});
    test.skip('Hoenn filter includes Treecko, Torchic, and Mudkip', async () => {});
    test.skip('All Games restores the full Pokedex list after a region filter', async () => {});
    test.skip('Search and region filter work together predictably', async () => {});
  });

  test.describe('Sorting', () => {
    // Verifies sort controls reorder the Pokemon list.
    test('Sort by name reorders Pokemon alphabetically', async ({ page }) => {
      await openPokedex(page);

      await page.getByRole('combobox').selectOption({ label: 'Name' });

      await expect(pokemonListButtons(page).first()).not.toContainText('Bulbasaur');
      await expect(pokemonListButtons(page).first()).toContainText(/Abomasnow|Abra/i);
    });

    test.skip('Sort by Pokedex Number restores numerical order', async () => {});
    test.skip('Sort by Type groups Pokemon by type', async () => {});
    test.skip('Sort by stat changes the leading result', async () => {});
    test.skip('Sorting does not clear an active game Pokedex filter', async () => {});
  });

  test.describe('Random', () => {
    // Verifies Random selects a valid Pokemon and opens a populated detail view.
    test('Random opens a valid Pokemon detail', async ({ page }) => {
      await openPokedex(page);

      await page.getByRole('button', { name: /^random$/i }).click();

      await expect(page.getByText(/#\d{3}/).last()).toBeVisible();
      await expect(page.getByText('Base Stats')).toBeVisible();
      await expect(page.getByText('Profile')).toBeVisible();
    });

    test.skip('Repeated random clicks keep returning valid Pokemon details', async () => {});
    test.skip('Random result can be searched or cleared afterward', async () => {});
  });

  test.describe('Edge / Reliability', () => {
    // Verifies the visible Pokemon list does not render duplicate entries.
    test('Visible Pokemon list has no duplicate entries', async ({ page }) => {
      await openPokedex(page);

      const visiblePokemonNames = await pokemonListButtons(page).evaluateAll((buttons) =>
        buttons.map((button) => button.textContent?.trim() ?? '')
      );

      expect(new Set(visiblePokemonNames).size).toBe(visiblePokemonNames.length);
    });

    test.skip('Special-name Pokemon can be found from search', async () => {});
    test.skip('Pokemon list card images have valid sources when visible', async () => {});
    test.skip('Search handles leading and trailing spaces', async () => {});
  });
});
