import { test, expect } from '@playwright/test';

/**
 * This spec proves `TaskCreateHandler`'s server-side auto-assignment
 * (packages/core/.../task-create.handler.ts) end to end through the real "Tasks" page UI.
 *
 * For a plain Employee, `AddTaskDialogComponent.ngOnInit()` already pushes the header's
 * default-selected employee into `selectedMembers` before this ticket's change, via
 * `store.selectedEmployee$` (populated by `HeaderComponent.checkEmployeeSelectorVisibility()`)
 * — so the dialog would submit a non-empty `members` list on this route even without the
 * server-side fix. To actually exercise the "Employee submits with no members" scenario, the
 * outgoing `POST /tasks` request is intercepted and its `members` field is forced to `[]`
 * before it reaches the server, regardless of what the dialog populated client-side. The
 * response is then asserted directly to confirm the server added the creator; the rendered
 * member chip is asserted too, to prove the create flow and the `data-testid`s wire up
 * correctly end to end.
 */

const EMAIL = 'employee@ever.co';
const PASSWORD = '12345678';

/**
 * Decodes the `employeeId` claim out of the app's JWT.
 * `AuthService` (packages/core/src/lib/auth/auth.service.ts) embeds it directly in the
 * token payload.
 */
function employeeIdFromToken(token: string): string | null {
	const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf-8'));
	return payload.employeeId ?? null;
}

test('creating a task with no explicit members self-assigns the logged-in employee', async ({ page }) => {
	await page.goto('/');

	await page.locator('#input-email').fill(EMAIL);
	await page.locator('#input-password').fill(PASSWORD);

	// The session token lives only in the login API response and in-memory Akita state
	// (`TokenInterceptor` reads `Store.token` to build the `Authorization` header) — it is
	// never written to localStorage or a cookie anywhere in the frontend, so the login
	// response body is the only reliable place to read it from.
	const [loginResponse] = await Promise.all([
		page.waitForResponse((res) => res.url().includes('/api/auth/login') && res.request().method() === 'POST'),
		page.locator('button[type="submit"]').click()
	]);
	const { token } = await loginResponse.json();
	const employeeId = employeeIdFromToken(token as string);
	expect(employeeId).toBeTruthy();

	await expect(page.getByTestId('dashboard-container')).toBeVisible({ timeout: 60_000 });

	// Force the create request's `members` to empty, regardless of what the dialog's
	// pre-existing header-driven self-select default populated client-side, so this exercises
	// the exact scenario in specs/task-assignment/spec.md ("Employee creates a task without
	// selecting any members") rather than a flow the client might already satisfy on its own.
	await page.route('**/api/tasks', async (route) => {
		const request = route.request();
		if (request.method() !== 'POST') {
			await route.continue();
			return;
		}
		const body = request.postDataJSON();
		await route.continue({ postData: JSON.stringify({ ...body, members: [] }) });
	});

	await page.goto('/#/pages/tasks/dashboard');
	await expect(page.getByTestId('add-task-trigger')).toBeVisible({ timeout: 60_000 });

	await page.getByTestId('add-task-trigger').click();

	const titleInput = page.getByTestId('add-task-title-input');
	await expect(titleInput).toBeVisible();
	const taskTitle = `Self-assign check ${Date.now()}`;
	await titleInput.fill(taskTitle);

	const [createResponse] = await Promise.all([
		page.waitForResponse((res) => res.url().includes('/api/tasks') && res.request().method() === 'POST'),
		page.getByTestId('add-task-save-button').click()
	]);
	const createdTask = await createResponse.json();
	const createdMemberIds = (createdTask.members ?? []).map((member: { id: string }) => member.id);
	expect(createdMemberIds).toContain(employeeId);

	const taskRow = page.locator('tr', { hasText: taskTitle }).first();
	await expect(taskRow).toBeVisible({ timeout: 60_000 });
	await expect(taskRow.getByTestId(`person-chip-${employeeId}`)).toBeVisible();
});
