import type { Locator, Page } from '@playwright/test';

// A card's accessible name also includes its description, so match only its stable title prefix.
const homeStationNames = {
  pokedex: /^pokedex(?:\s|$)/i,
  tcg: /^pokemon tcg simulator(?:\s|$)/i,
  who: /^who's that pokemon\?(?:\s|$)/i,
  team: /^pokemon team planner(?:\s|$)/i,
  quiz: /^pokemon quiz(?:\s|$)/i,
  trainerdex: /^trainerdex(?:\s|$)/i
} as const;

export type HomeStation = keyof typeof homeStationNames;

export function homeStationButton(page: Page, station: HomeStation): Locator {
  return page.getByRole('button', { name: homeStationNames[station] });
}

export class HomePage {
  readonly page: Page;
  readonly body: Locator;

  constructor(page: Page) {
    this.page = page;
    this.body = page.locator('body');
  }

  async goto(path = '/'): Promise<void> {
    await this.page.goto(path);
  }

  async title(): Promise<string> {
    return this.page.title();
  }

  stationButton(station: HomeStation): Locator {
    return homeStationButton(this.page, station);
  }

  async openStation(station: HomeStation): Promise<void> {
    await this.stationButton(station).click();
  }
}
