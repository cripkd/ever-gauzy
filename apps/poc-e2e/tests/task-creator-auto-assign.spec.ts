import { test, expect, Page, Locator } from '@playwright/test';

// Seeded via packages/core/src/lib/employee/default-employees.ts /
// packages/core/src/lib/user/default-users.ts - present regardless of seed type
// (see packages/core/src/lib/core/seeds/seed-data.service.ts#seedBasicDefaultData).
const EMPLOYEE_EMAIL = 'employee@ever.co';
const EMPLOYEE_PASSWORD = '12345678';
const EMPLOYEE_NAME = 'Default Employee';
const OTHER_EMPLOYEE_NAME = 'Super Admin';

async function loginAsEmployee(page: Page): Promise<void> {
	await page.goto('/');
	await page.locator('#input-email').fill(EMPLOYEE_EMAIL);
	await page.locator('#input-password').fill(EMPLOYEE_PASSWORD);
	await page.locator('button[type="submit"]').click();
	await expect(page.getByTestId('dashboard-container')).toBeVisible({ timeout: 60_000 });
}

function taskRow(page: Page, title: string): Locator {
	return page.locator('table > tbody > tr.angular2-smart-row', { hasText: title });
}

test('Employee creating a task without selecting other members is auto-assigned to it', async ({ page }) => {
	const title = `Auto-assign self ${Date.now()}`;

	await loginAsEmployee(page);
	await page.goto('/pages/tasks/me');

	await page.locator('.gauzy-button-container button[status="success"]').click();
	await page.locator('[formControlName="title"]').fill(title);
	await page.locator('nb-card-footer > button[status="success"]').click();

	const row = taskRow(page, title);
	await expect(row).toBeVisible({ timeout: 30_000 });
	await expect(row.locator('.person-name', { hasText: EMPLOYEE_NAME })).toBeVisible();
});

test('Employee creating a task and selecting another member is assigned alongside them', async ({ page }) => {
	const title = `Auto-assign plus member ${Date.now()}`;

	await loginAsEmployee(page);
	await page.goto('/pages/tasks/dashboard');

	await page.locator('.gauzy-button-container button[status="success"]').click();
	await page.locator('[formControlName="title"]').fill(title);

	await page.locator('ga-employee-multi-select nb-select button.select-button').click();
	await page.locator('.option-list nb-option', { hasText: OTHER_EMPLOYEE_NAME }).click();
	// NOT Escape: ngx-add-task-dialog opens with NbDialog defaults (closeOnEsc=true), so a
	// document-level Escape closes the whole dialog, not just the open nb-select panel (same
	// gotcha as apps/gauzy-e2e/src/support/Base/pageobjects/PaymentsPageObject.ts). Clicking the
	// inert dialog title closes the dropdown without touching the dialog.
	await page.locator('ngx-add-task-dialog nb-card-header .title').click();

	await page.locator('nb-card-footer > button[status="success"]').click();

	const row = taskRow(page, title);
	await expect(row).toBeVisible({ timeout: 30_000 });
	await expect(row.locator('.person-name', { hasText: EMPLOYEE_NAME })).toBeVisible();
	await expect(row.locator('.person-name', { hasText: OTHER_EMPLOYEE_NAME })).toBeVisible();
});
