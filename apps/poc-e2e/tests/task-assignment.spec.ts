import { test, expect } from '@playwright/test';

const EMAIL = 'employee@ever.co';
const PASSWORD = '12345678';
const EMPLOYEE_NAME = 'Default Employee';

test('a task created by an Employee is assigned to that employee by default', async ({ page }) => {
	const taskTitle = `Task assignment check ${Date.now()}`;

	await page.goto('/');
	await page.locator('#input-email').fill(EMAIL);
	await page.locator('#input-password').fill(PASSWORD);
	await page.locator('button[type="submit"]').click();
	await expect(page.getByTestId('dashboard-container')).toBeVisible({ timeout: 60_000 });

	// Opens the task creation form directly, without needing to know the
	// "Tasks" page's own trigger button (see TaskComponent#ngOnInit).
	await page.goto('/#/pages/tasks/dashboard?openAddDialog=true');

	await page.getByTestId('task-title-input').fill(taskTitle);
	// Leave the members selector untouched — no member is picked explicitly.
	await page.getByTestId('task-save-button').click();

	const taskRow = page.locator('tr', { hasText: taskTitle });
	await expect(taskRow).toBeVisible({ timeout: 60_000 });
	await expect(taskRow.locator('.person-name')).toContainText(EMPLOYEE_NAME);
});
