import type { APIResponse, Page } from '@playwright/test';

const pagesWithPokeApiRetries = new WeakSet<Page>();

function isRouteLifecycleError(page: Page, error: unknown): boolean {
  return (
    page.isClosed() ||
    /route is already handled|target page.*closed|browser has been closed|request context disposed|test ended/i.test(
      String(error)
    )
  );
}

// Retries transient PokeAPI failures while preserving non-transient responses for the app to handle.
export async function installPokeApiRetries(page: Page): Promise<void> {
  if (pagesWithPokeApiRetries.has(page)) {
    return;
  }

  pagesWithPokeApiRetries.add(page);

  await page.route('https://pokeapi.co/**', async (route) => {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      let response: APIResponse;

      try {
        response = await route.fetch({ timeout: 10_000 });
      } catch (error) {
        if (isRouteLifecycleError(page, error)) {
          return;
        }

        if (attempt === maxAttempts) {
          throw error;
        }

        continue;
      }

      const isTransientResponse = response.status() === 429 || response.status() >= 500;

      if (isTransientResponse && attempt < maxAttempts) {
        continue;
      }

      try {
        await route.fulfill({ response });
      } catch (error) {
        if (!isRouteLifecycleError(page, error)) {
          throw error;
        }
      }

      return;
    }
  });
}
