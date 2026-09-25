import { test, expect } from '@playwright/test';

/**
 * This spec exercises the create-task UI flow end to end and asserts the created task
 * renders a member chip for the logged-in employee. It is NOT an isolated regression guard
 * for `TaskCreateHandler`'s auto-assignment logic (packages/core/.../task-create.handler.ts):
 * for a plain Employee, `AddTaskDialogComponent.ngOnInit()` already pushes the header's
 * default-selected employee into `selectedMembers` before this ticket's change, via
 * `store.selectedEmployee$` (populated by `HeaderComponent.checkEmployeeSelectorVisibility()`)
 * — so the dialog is likely to submit a non-empty `members` list on this route today,
 * independent of the server-side default. The isolated regression coverage for the
 * auto-assignment behavior itself (empty list, append, dedupe, no-op for non-employees) is
 * `task-create.handler.spec.ts`. This spec still has value: it proves the create flow and the
 * new `data-testid`s wire up correctly end to end.
 */

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

test('creating a task from the Tasks page renders a member chip for the logged-in employee', async ({ page }) => {
	await page.goto('/');

	await page.locator('#input-email').fill(EMAIL);
	await page.locator('#input-password').fill(PASSWORD);
	await page.locator('button[type="submit"]').click();

	await expect(page.getByTestId('dashboard-container')).toBeVisible({ timeout: 60_000 });

	// The dashboard can render from in-memory state before the auth store has flushed the
	// token to localStorage, so poll rather than reading it once right after the DOM check.
	await expect
		.poll(() => page.evaluate(() => localStorage.getItem('token')), { timeout: 60_000 })
		.toBeTruthy();
	const token = await page.evaluate(() => localStorage.getItem('token'));
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
