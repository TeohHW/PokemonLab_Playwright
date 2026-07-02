import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const baseURL = process.env.BASE_URL ?? 'https://example.com';
const isCI = Boolean(process.env.CI);
const isLive = process.env.LIVE === 'true';
const showAllTests = process.env.PW_SHOW_ALL_TESTS === 'true';

export default defineConfig({
  testDir: './tests',
  testIgnore: ['**/examples/**'],
  timeout: 30_000,
  expect: {
    timeout: 7_500
  },
  fullyParallel: !isLive,
  grep: showAllTests ? undefined : isLive ? /@live/ : undefined,
  grepInvert: showAllTests ? undefined : isLive ? undefined : /@live/,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isLive ? 1 : isCI ? 2 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'test-results/junit.xml' }]
  ],
  use: {
    baseURL,
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: process.env.HEADED === 'true' ? false : true,
    ignoreHTTPSErrors: process.env.IGNORE_HTTPS_ERRORS === 'true'
  },
  projects: [
    ...(isLive
      ? [
          {
            name: 'live-chromium',
            use: { ...devices['Desktop Chrome'] }
          }
        ]
      : [
          {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] }
          },
          {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] }
          },
          {
            name: 'webkit',
            use: { ...devices['Desktop Safari'] }
          },
          {
            name: 'mobile-chrome',
            use: { ...devices['Pixel 7'] }
          }
        ])
  ],
  outputDir: 'test-results/artifacts'
});
