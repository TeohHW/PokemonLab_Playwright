# Pokemon Lab Playwright Tests

Playwright + TypeScript test suite for my Pokemon Lab web app. This is a personal QA automation project I use to practise end-to-end testing outside work, with coverage across multiple interactive stations rather than only simple happy-path checks.

The suite is written to be readable as a small portfolio project: tests are grouped by station and behavior, fixtures keep repetitive setup out of individual cases, and the scope includes negative, edge, and reliability scenarios where the app has meaningful state or async behavior.

## Test Scope

The app currently has five stations under test:

| Station               | Spec                                    | Unique tests | Current coverage                                                                                                                                                                    |
| --------------------- | --------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pokemon Pokedex       | `tests/specs/pokedex.spec.ts`           | 39           | Initial load, search, details, game Pokedex filters, sorting, random Pokemon, image fallback, and rapid action reliability                                                          |
| Pokemon TCG Simulator | `tests/specs/tcg-simulator.spec.ts`     | 38           | Session startup, pack opening, pack modal behavior, binder progress, collection clearing, set selection, set filtering/sorting, and Pokemon/card search                             |
| Who's That Pokemon    | `tests/specs/whos-that-pokemon.spec.ts` | 36           | Setup, trainer validation, region selection, gameplay, guessing flow, help choices, leaderboard handling, navigation, local storage reliability, and network/image failure behavior |
| Pokemon Team Planner  | `tests/specs/team-planner.spec.ts`      | 29           | Station startup, Pokemon search, sorting, game Pokedex filtering, team building/removal, random teams, move selection, matchup/stat analysis, navigation, and reliability checks    |
| Pokemon Quiz          | `tests/specs/pokemon-quiz.spec.ts`      | 27           | Station startup, quiz pool/category selection, playable questions, scoring panel updates, reset behavior, navigation, and rapid-start reliability                                   |

These station tests pass across the configured Chromium, desktop Firefox, desktop WebKit, and mobile Chrome Playwright projects, with the TCG simulator spec skipped only on CI WebKit because it is flaky there while remaining covered by the other browser projects and local WebKit runs.

## Coverage Themes

- Station entry and initial UI state from the shared home screen
- Search behavior, including valid terms, invalid terms, casing, clearing, and numeric lookup
- Filtering and sorting interactions, including combinations that should preserve active state
- Detail views, modals, and selected item panels
- State changes such as score updates, binder progress, team count, and leaderboard entries
- Negative and edge cases such as empty input, special characters, out-of-range values, corrupted local storage, failed image requests, and delayed data
- Reliability checks for rapid user actions such as repeated search/clear, random selection, help, guess, pack opening, and start/reset flows
- Navigation back to the station chooser

## Test Design Notes

- Uses Playwright's role-based locators where practical, so tests follow the user-facing UI instead of brittle implementation details.
- Uses station-level fixtures for repeated setup such as opening Pokedex, TCG Simulator, Team Planner, Pokemon Quiz, and Who's That Pokemon.
- Keeps assertions focused on behavior that matters to users: visible controls, updated counters, stable state, and usable recovery after edge cases.
- Normal test runs exclude `@live` specs and run across the configured Playwright projects: Chromium, Firefox, WebKit, and mobile Chrome.
- Live PokeAPI-backed specs are tagged `@live`, run separately in Chromium only, and use a persistent browser profile so IndexedDB cache can be reused between live runs.
- Normal UI tests block unmocked PokeAPI calls; add targeted route mocks for new non-live tests that need API-shaped data.
- The TCG simulator spec is quarantined at spec level only when `CI=true` and the Playwright project is WebKit, because CI WebKit flakes moved between unrelated TCG tests. This keeps required CI stable while preserving the same checks in Chromium, Firefox, and local WebKit runs.
- GitHub Actions CI is enabled through `.github/workflows/playwright.yml`; it runs `npm run verify` on pull requests, pushes to `main` or `master`, and manual workflow dispatch.

## Use of AI Tools

AI tools, including Codex, were used as part of the workflow to improve efficiency while building this project. They helped with tasks such as drafting testcase ideas, refining Playwright locators, organizing coverage gaps, and updating documentation. The test direction, app understanding, review decisions, and final validation remain my own.

## Quick Start

```powershell
npm.cmd install
npm.cmd run install:browsers
Copy-Item .env.example .env
npm.cmd test
```

Set the target site in `.env`:

```env
BASE_URL=https://pokemon-tcg-simulator-react.vercel.app/
```

## Common Commands

```powershell
npm.cmd test              # Run all tests headlessly
npm.cmd run test:live     # Run live PokeAPI-backed specs in Chromium
npm.cmd run test:persistent # Run tests with a persistent browser profile
npm.cmd run test:smoke    # Run smoke tests only
npm.cmd run test:headed   # Watch tests run in a browser
npm.cmd run test:live:headed # Watch live specs run in a browser
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
  fixtures/       Shared Playwright fixtures and exports
  pages/          Page objects, including the home station chooser
  specs/          Station-focused end-to-end specs
  smoke/          Fast confidence tests
  examples/       Copy-and-adapt examples, ignored by default
  utils/          Small test utilities
```

Reports and failure artifacts are written to `playwright-report/` and `test-results/`.
