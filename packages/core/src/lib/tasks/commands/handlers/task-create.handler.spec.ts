/**
 * Importing anything under `employee/**` pulls in `shared/validators`, which reaches
 * `employee.entity` -> `core/entities/internal` -> `dashboard.entity`, which applies
 * `@IsEmployeeBelongsToOrganization()` while `shared/validators` is still initializing. Entering
 * that cycle from this side leaves the decorator undefined and the suite dies at import time with
 * "IsEmployeeBelongsToOrganization is not a function". Loading the entity graph FIRST resolves the
 * cycle in the order the application itself uses, so this side-effect import must stay above the
 * others.
 */
import '../../../core/entities/internal';

import { RequestContext } from '../../../core/context';
import { TaskCreateHandler } from './task-create.handler';
import { TaskCreateCommand } from '../task-create.command';

/**
 * `task-create.handler.ts` falls back to assigning the creator as a member only when the caller
 * has no explicit members AND `RequestContext.currentEmployeeId()` resolves (i.e. the caller is an
 * Employee, not an Admin/Manager viewing on behalf of someone else - see request-context.ts:213-230).
 * These three branches - explicit members, empty members with a resolvable employee, and empty
 * members with none - are exercised directly against a fake `TaskService`, the same seam used by
 * `employee-recurring-expense.edit.handler.spec.ts`, so no NestJS module or database is needed.
 */

function makeFakeDeps() {
	return {
		eventBus: { publish: jest.fn() },
		cqrsEventBus: { publish: jest.fn() },
		taskService: {
			getMaxTaskNumberByProject: jest.fn().mockResolvedValue(0),
			create: jest.fn().mockResolvedValue({ id: 'task-1', title: 'Task' })
		},
		organizationProjectService: { findOneByIdString: jest.fn() },
		employeeService: { findActiveEmployeesByEmployeeIds: jest.fn().mockResolvedValue([]) },
		mentionService: { publishMention: jest.fn() },
		activityLogService: { logActivity: jest.fn() },
		employeeNotificationService: { publishNotificationEvent: jest.fn() }
	};
}

function makeHandler(deps: ReturnType<typeof makeFakeDeps>) {
	return new TaskCreateHandler(
		deps.eventBus as any,
		deps.cqrsEventBus as any,
		deps.taskService as any,
		deps.organizationProjectService as any,
		deps.employeeService as any,
		deps.mentionService as any,
		deps.activityLogService as any,
		deps.employeeNotificationService as any
	);
}

function execute(deps: ReturnType<typeof makeFakeDeps>, members: Array<{ id: string }>) {
	const handler = makeHandler(deps);

	return handler.execute(
		new TaskCreateCommand(
			{
				title: 'Task',
				organizationId: 'org-1',
				tenantId: 'tenant-1',
				members: members as any
			} as any,
			false
		)
	);
}

describe('TaskCreateHandler', () => {
	beforeEach(() => {
		jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1');
		jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ id: 'user-1', employeeId: 'creator-1' } as any);
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('leaves explicit members untouched, even for an Employee-role creator', async () => {
		jest.spyOn(RequestContext, 'currentEmployeeId').mockReturnValue('creator-1');
		const deps = makeFakeDeps();

		await execute(deps, [{ id: 'picked-employee' }]);

		const createdMembers = deps.taskService.create.mock.calls[0][0].members;
		expect(createdMembers.map((m: any) => m.id)).toEqual(['picked-employee']);
	});

	it('injects the creator when an Employee picks no members', async () => {
		jest.spyOn(RequestContext, 'currentEmployeeId').mockReturnValue('creator-1');
		const deps = makeFakeDeps();

		await execute(deps, []);

		const createdMembers = deps.taskService.create.mock.calls[0][0].members;
		expect(createdMembers.map((m: any) => m.id)).toEqual(['creator-1']);
	});

	it('leaves members empty when no employee can be resolved (Admin/Manager)', async () => {
		jest.spyOn(RequestContext, 'currentEmployeeId').mockReturnValue(null);
		const deps = makeFakeDeps();

		await execute(deps, []);

		const createdMembers = deps.taskService.create.mock.calls[0][0].members;
		expect(createdMembers).toEqual([]);
	});
});
