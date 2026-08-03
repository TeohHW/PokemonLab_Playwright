# Pokemon Lab Playwright Tests

Playwright + TypeScript test suite for my Pokemon Lab web app. This is a personal QA automation project I use to practise end-to-end testing outside work, with coverage across multiple interactive stations rather than only simple happy-path checks.

The suite is written to be readable as a small portfolio project: tests are grouped by station and behavior, fixtures keep repetitive setup out of individual cases, and the scope includes negative, edge, and reliability scenarios where the app has meaningful state or async behavior.

## Test Scope

The app currently has a shared application shell and six stations under test:

| Area                  | Spec                                    | Unique tests | Current coverage                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------- | --------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared app shell      | `tests/specs/application-shell.spec.ts` | 7            | Hash-route continuity, browser Back/Forward, Continue, four-item recent history, absence of empty/favorites panels, SVG favicon delivery, station-menu navigation, scroll lock, active-station initial focus, focus recovery and trapping, focus restoration, and persisted reduced-motion preference                                                                                                             |
| Pokemon Pokedex       | `tests/specs/pokedex.spec.ts`           | 48           | Direct-route and reload restoration, paged navigation, typeahead search and inline clearing, profiles, previous/next boundaries, comparison, ability/move dialogs, collapsible evolution/card/sprite sections, game Pokedex filters including Legends Z-A, sorting, random Pokemon, image fallback, responsive layouts, and rapid-action reliability                                                              |
| Pokemon TCG Simulator | `tests/specs/tcg-simulator.spec.ts`     | 56           | Data-load Retry, set routes and reload restoration, set/Pokemon search, pack preparation, Skip/Reveal All, keyboard card reveals, binder ownership/latest-pull filters, progress and clearing, rarity sorting, artwork candidates, Special / Limited sets, ten-entry pull history, collection persistence, and responsive layouts                                                                                 |
| Who's That Pokemon    | `tests/specs/whos-that-pokemon.spec.ts` | 38           | Setup and trainer validation, region selection, Easy/Normal/Hard behavior, answer choices, staged Region/Type/Pokedex hints and score penalties, ten-round and Endless sessions, guessing, leaderboard handling, responsive layouts, navigation, local-storage reliability, and network/image failures                                                                                                            |
| Pokemon Team Planner  | `tests/specs/team-planner.spec.ts`      | 53           | Separate Build/Analysis workspaces, collapsed member options, browsing/search/sorting, game Pokedex filters, manual/meta/random/champion teams, twelve-entry named-team save/load/update/delete library, battle-format legality, forms, abilities, natures, moves, base-species recommendation resolution, assistant scoring/recommendations, persistence, responsive layouts, navigation, and reliability checks |
| Pokemon Quiz          | `tests/specs/pokemon-quiz.spec.ts`      | 34           | Pool/category selection, Easy/Normal/Hard answer counts including constrained-answer categories, ten/twenty-question and Endless sessions, finite-session summaries and boundaries, scoring/streaks, personal-best restoration, reset and active-quiz leave behavior, responsive layouts, navigation, media failures, and rapid-action reliability                                                                |
| TrainerDex            | `tests/specs/trainerdex.spec.ts`        | 26           | Direct trainer/game/stage routes and reload restoration, invalid-route fallback, search, previous/next boundaries, region/game-version/battle-stage selection including Legends Z-A, trainer detail panels, featured TCG-card modals, responsive filter controls, failed artwork removal, delayed data, and rapid-action reliability                                                                              |

Normal tests run across configured Chromium, desktop Firefox, desktop WebKit, and mobile Chrome projects. Live PokeAPI suites run in Chromium. The only conditional skips are the two station-menu pointer-focus assertions on WebKit, whose click behavior does not establish the opener as the active element; those assertions continue to run in Chromium, Firefox, and mobile Chrome.

## Coverage Themes

- Station entry and initial UI state from the shared home screen
- Shared hash routing, direct links, browser history, Continue, recent items, and local preferences
- Search behavior, including valid terms, invalid terms, casing, clearing, and numeric lookup
- Filtering and sorting interactions, including combinations that should preserve active state
- Detail views, modals, and selected item panels
- State changes such as score updates, finite-session boundaries, binder progress/history, team count, and leaderboard entries
- Team Planner save-state coverage, including named-team library limits, save/load/update/delete, restored settings and build choices after reload, unsaved teams, and malformed local storage
- Responsive layout checks at representative web and mobile widths, including compact grids, horizontal scrollers, and page-overflow protection across all six stations
- Reference-only TCG sets, including disabled pack opening and complete-by-default binders
- Negative and edge cases such as empty input, special characters, out-of-range values, corrupted local storage, failed image requests, and delayed data
- Reliability checks for rapid user actions such as repeated search/clear, random selection, hints, guesses, pack opening, and start/reset flows
- Navigation back to the station chooser, including confirmation and state preservation when leaving an active game or quiz

## Test Design Notes

- Uses Playwright's role-based locators where practical, so tests follow the user-facing UI instead of brittle implementation details.
- Uses station-level fixtures for repeated setup such as opening Pokedex, TCG Simulator, Team Planner, Pokemon Quiz, Who's That Pokemon, and TrainerDex.
- Keeps assertions focused on behavior that matters to users: visible controls, updated counters, stable state, and usable recovery after edge cases.
- Normal test runs exclude `@live` specs and run across the configured Playwright projects: Chromium, Firefox, WebKit, and mobile Chrome.
- Live PokeAPI-backed specs are tagged `@live`, run separately in Chromium only, and use a persistent browser profile so IndexedDB cache can be reused between live runs.
- No application behavior is hidden behind `test.fixme`; supported behaviors are asserted directly. Only the two documented WebKit pointer-focus cases are conditionally skipped.
- Normal UI tests block unmocked PokeAPI calls; add targeted route mocks for new non-live tests that need API-shaped data.
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
BASE_URL=https://pokemon-lab-react.vercel.app/
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
