import { test, expect } from '@playwright/test';

const EMAIL = 'admin@ever.co';
const PASSWORD = 'admin';

test('super-admin can log in and reach the dashboard', async ({ page }) => {
	await page.goto('/');

	await page.locator('#input-email').fill(EMAIL);
	await page.locator('#input-password').fill(PASSWORD);
	await page.locator('button[type="submit"]').click();

	await expect(page.getByTestId('dashboard-container')).toBeVisible({ timeout: 60_000 });
});
