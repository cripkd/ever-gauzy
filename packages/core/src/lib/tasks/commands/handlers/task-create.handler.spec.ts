/**
 * Importing anything under `employee/**` pulls in `shared/validators`, which reaches
 * `employee.entity` -> `core/entities/internal` -> `dashboard.entity`, which applies
 * `@IsEmployeeBelongsToOrganization()` while `shared/validators` is still initializing. Entering
 * that cycle from this side leaves the decorator undefined and the suite dies at import time with
 * "IsEmployeeBelongsToOrganization is not a function" (see the sibling spec in
 * `employee-recurring-expense/commands/handlers/employee-recurring-expense.edit.handler.spec.ts`).
 * Loading the entity graph FIRST resolves the cycle in the order the application itself uses, so
 * this side-effect import must stay above the others.
 */
import '../../../core/entities/internal';

import { RequestContext } from '../../../core/context';
import { TaskCreateHandler } from './task-create.handler';
import { TaskCreateCommand } from '../task-create.command';

/**
 * Covers spec.md's "Creator explicitly re-selects themselves as a member" scenario, which had no
 * test coverage: `task-create.handler.ts` folds `RequestContext.currentUser().employeeId` into the
 * submitted `members` via a `Set`, so re-selecting the creator must not duplicate them. Also
 * exercises the two already-covered-by-e2e scenarios so a regression here fails fast in a unit
 * test rather than only in Playwright.
 */

function makeHandler() {
	const taskService = {
		getMaxTaskNumberByProject: jest.fn().mockResolvedValue(0),
		create: jest.fn().mockImplementation(async (input: any) => ({ id: 'task-1', ...input }))
	};
	const organizationProjectService = {
		findOneByIdString: jest.fn().mockResolvedValue(null)
	};
	const employeeService = {
		findActiveEmployeesByEmployeeIds: jest.fn().mockResolvedValue([])
	};
	const eventBus = { publish: jest.fn() };
	const cqrsEventBus = { publish: jest.fn() };
	const mentionService = { publishMention: jest.fn() };
	const activityLogService = { logActivity: jest.fn() };
	const employeeNotificationService = { publishNotificationEvent: jest.fn() };

	const handler = new TaskCreateHandler(
		eventBus as any,
		cqrsEventBus as any,
		taskService as any,
		organizationProjectService as any,
		employeeService as any,
		mentionService as any,
		activityLogService as any,
		employeeNotificationService as any
	);

	return { handler, taskService };
}

async function createTask(members: Array<{ id: string }>) {
	const { handler, taskService } = makeHandler();

	await handler.execute(
		new TaskCreateCommand(
			{
				title: 'Test task',
				organizationId: 'org-1',
				tenantId: 'tenant-1',
				members
			} as any,
			false
		)
	);

	const persisted = taskService.create.mock.calls[0][0];
	return (persisted.members as Array<{ id: string }>).map((member) => member.id);
}

describe('TaskCreateHandler', () => {
	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('adds the creator when no other members were selected', async () => {
		jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ employeeId: 'employee-1' } as any);
		jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1');

		const memberIds = await createTask([]);

		expect(memberIds).toEqual(['employee-1']);
	});

	it('adds the creator alongside explicitly selected members', async () => {
		jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ employeeId: 'employee-1' } as any);
		jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1');

		const memberIds = await createTask([{ id: 'employee-2' }]);

		expect(memberIds).toEqual(expect.arrayContaining(['employee-1', 'employee-2']));
		expect(memberIds).toHaveLength(2);
	});

	it('does not duplicate the creator when they are already an explicitly selected member', async () => {
		jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ employeeId: 'employee-1' } as any);
		jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1');

		const memberIds = await createTask([{ id: 'employee-1' }]);

		expect(memberIds).toEqual(['employee-1']);
	});
});
