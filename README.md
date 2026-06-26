# Playwright Workspace

Production-ready starter workspace for testing any webpage with Playwright and TypeScript.

## Quick Start

```powershell
npm.cmd install
npm.cmd run install:browsers
Copy-Item .env.example .env
npm.cmd test
```

Set the target site in `.env`:

```env
BASE_URL=https://example.com
```

## Common Commands

```powershell
npm.cmd test              # Run all tests headlessly
npm.cmd run test:smoke    # Run smoke tests only
npm.cmd run test:headed   # Watch tests run in a browser
npm.cmd run test:debug    # Debug with Playwright Inspector
npm.cmd run test:ui       # Open Playwright UI mode
npm.cmd run codegen       # Generate locators while browsing
npm.cmd run report        # Open the HTML test report
npm.cmd run typecheck     # Verify TypeScript
npm.cmd run lint          # Run ESLint
npm.cmd run verify        # Run formatting, linting, typing, and tests
```

PowerShell may block the `npm` script shim on Windows. `npm.cmd` avoids that policy issue.

## Project Layout

```text
tests/
  fixtures/       Shared Playwright fixtures
  pages/          Page objects
  smoke/          Fast confidence tests
  examples/       Copy-and-adapt tests for navigation and forms, ignored by default
  utils/          Small test utilities
```

## Configuration

`playwright.config.ts` reads:

- `BASE_URL`: site under test, defaults to `https://example.com`
- `HEADED`: set to `true` to run browsers visibly
- `IGNORE_HTTPS_ERRORS`: set to `true` for local or test environments with invalid certs

Reports and failure artifacts are written to `playwright-report/` and `test-results/`.

## Writing Tests

Use role-based locators when possible:

```ts
await page.getByRole('button', { name: 'Submit' }).click();
await expect(page.getByRole('heading', { name: /welcome/i })).toBeVisible();
```

For a specific site, add page objects under `tests/pages/` and focused specs under `tests/`.
