import { test, expect } from '@playwright/test';

const EMAIL = 'employee@ever.co';
const PASSWORD = '12345678';

/**
 * Decodes the `employeeId` claim out of the app's JWT, without a network round trip.
 * `AuthService` (packages/core/src/lib/auth/auth.service.ts) embeds it directly in the
 * token payload, and the frontend stores that token verbatim under localStorage `token`.
 */
function employeeIdFromToken(token: string): string | null {
	const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf-8'));
	return payload.employeeId ?? null;
}

test('employee creating a task with no members selected is self-assigned', async ({ page }) => {
	await page.goto('/');

	await page.locator('#input-email').fill(EMAIL);
	await page.locator('#input-password').fill(PASSWORD);
	await page.locator('button[type="submit"]').click();

	await expect(page.getByTestId('dashboard-container')).toBeVisible({ timeout: 60_000 });

	const token = await page.evaluate(() => localStorage.getItem('token'));
	expect(token).toBeTruthy();
	const employeeId = employeeIdFromToken(token as string);
	expect(employeeId).toBeTruthy();

	await page.goto('/pages/tasks/dashboard');
	await expect(page.getByTestId('add-task-trigger')).toBeVisible({ timeout: 60_000 });

	await page.getByTestId('add-task-trigger').click();

	const titleInput = page.getByTestId('add-task-title-input');
	await expect(titleInput).toBeVisible();
	const taskTitle = `Self-assign check ${Date.now()}`;
	await titleInput.fill(taskTitle);

	await page.getByTestId('add-task-save-button').click();

	const taskRow = page.locator('tr', { hasText: taskTitle }).first();
	await expect(taskRow).toBeVisible({ timeout: 60_000 });
	await expect(taskRow.getByTestId(`task-member-${employeeId}`)).toBeVisible();
});
