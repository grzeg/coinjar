import type { Locator, Page } from '@playwright/test';

export class AppShellPage {
  readonly nav: Locator;

  constructor(private readonly page: Page) {
    this.nav = page.getByRole('navigation', { name: 'Główna nawigacja' });
  }

  async goto(path = '/') {
    await this.page.goto(path);
  }

  navLink(name: string): Locator {
    return this.nav.getByRole('link', { name });
  }

  heading(name: string): Locator {
    return this.page.getByRole('heading', { level: 1, name });
  }
}
