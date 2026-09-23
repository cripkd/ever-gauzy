import { test, expect } from '@playwright/test';

const EMAIL = 'employee@ever.co';
const PASSWORD = '12345678';

test('a task created by an Employee with no members picked is assigned to that employee', async ({ page }) => {
	await page.goto('/');

	await page.locator('#input-email').fill(EMAIL);
	await page.locator('#input-password').fill(PASSWORD);
	await page.locator('button[type="submit"]').click();

	await expect(page.getByTestId('dashboard-container')).toBeVisible({ timeout: 60_000 });

	const taskTitle = `Assignment check ${Date.now()}`;

	await page.goto('/pages/tasks/dashboard');
	await page.getByRole('button', { name: 'Add' }).click();

	await page.getByTestId('task-title-input').fill(taskTitle);
	// Members deliberately left unselected — `task-members-selector` is not touched.
	await page.getByTestId('task-save-button').click();

	// The employee never picked any members, so the only way this task can show up
	// under "My Tasks" (server-side filtered to the logged-in employee) is if the
	// backend assigned the creator by default.
	await page.goto('/pages/tasks/me');
	await expect(page.getByText(taskTitle)).toBeVisible({ timeout: 60_000 });
});
