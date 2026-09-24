import { expect, test } from '@playwright/test';
import { AppShellPage } from './pages/app-shell.page.js';

test.describe('navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 8, 24, 12));
  });

  test('redirects / to the current month dashboard', async ({ page }) => {
    const app = new AppShellPage(page);

    await app.goto('/');

    await expect(page).toHaveURL('/month/2026-09');
    await expect(app.heading('Pulpit')).toBeVisible();
  });

  test('opens a deep link directly', async ({ page }) => {
    const app = new AppShellPage(page);

    await app.goto('/month/2026-05/plan');

    await expect(app.heading('Plan budżetu')).toBeVisible();
    await expect(app.navLink('Plan')).toHaveAttribute('aria-current', 'page');
  });

  test('keeps the selected month between sections', async ({ page }) => {
    const app = new AppShellPage(page);
    await app.goto('/month/2026-05');

    await app.navLink('Transakcje').click();

    await expect(page).toHaveURL('/month/2026-05/transactions');
    await expect(app.heading('Transakcje')).toBeVisible();

    await app.navLink('Rok').click();

    await expect(page).toHaveURL('/year/2026');
    await expect(app.heading('Podsumowanie roczne')).toBeVisible();
  });
});
