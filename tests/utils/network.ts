import type { Page } from '@playwright/test';

const pagesWithPokeApiRetries = new WeakSet<Page>();

// Retries transient PokeAPI failures while preserving non-transient responses for the app to handle.
export async function installPokeApiRetries(page: Page): Promise<void> {
  if (pagesWithPokeApiRetries.has(page)) {
    return;
  }

  pagesWithPokeApiRetries.add(page);

  await page.route('https://pokeapi.co/**', async (route) => {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await route.fetch({ timeout: 10_000 });
        const isTransientResponse = response.status() === 429 || response.status() >= 500;

        if (!isTransientResponse || attempt === maxAttempts) {
          await route.fulfill({ response });
          return;
        }
      } catch {
        if (attempt === maxAttempts) {
          await route.continue();
          return;
        }
      }
    }
  });
}
