import { test as base, expect } from '@playwright/test';
import path from 'node:path';
import { HomePage } from '../pages/HomePage';

type TestFixtures = {
  preventUnmockedPokeApi: void;
  homePage: HomePage;
};

const usePersistentProfile =
  process.env.LIVE === 'true' || process.env.PERSISTENT_PROFILE === 'true';
const isLive = process.env.LIVE === 'true';

export const test = base.extend<TestFixtures>({
  context: async ({ browserName, contextOptions, launchOptions, playwright }, use, testInfo) => {
    const browserType = playwright[browserName];

    if (usePersistentProfile) {
      const profileRoot = process.env.PW_PROFILE_DIR ?? '.playwright-profiles';
      const profileName = `${testInfo.project.name}-${testInfo.workerIndex}`.replace(
        /[^a-z0-9.-]/gi,
        '-'
      );
      const profileDir = path.resolve(profileRoot, profileName);
      const context = await browserType.launchPersistentContext(profileDir, {
        ...launchOptions,
        ...contextOptions
      });

      await use(context);
      await context.close();
      return;
    }

    const browser = await browserType.launch(launchOptions);
    const context = await browser.newContext(contextOptions);

    await use(context);
    await context.close();
    await browser.close();
  },

  preventUnmockedPokeApi: [
    async ({ page }, use) => {
      if (!isLive) {
        await page.route('**/pokeapi.co/**', (route) =>
          route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({
              error:
                'PokeAPI is disabled in normal UI tests. Mock this route or run with LIVE=true.'
            })
          })
        );
      }

      await use();
    },
    { auto: true }
  ],

  homePage: async ({ page }, use) => {
    await use(new HomePage(page));
  }
});

export { expect };
