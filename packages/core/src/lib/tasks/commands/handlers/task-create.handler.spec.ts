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
import { TaskCreateCommand } from '../task-create.command';
import { TaskCreateHandler } from './task-create.handler';

/**
 * Exercises `TaskCreateHandler.execute()` directly against fake collaborators — the CQRS/HTTP
 * layers are not needed to reach the auto-assignment logic. `RequestContext.currentEmployeeId()`
 * is mocked per-case rather than driven through a real request context, matching the sibling
 * `EmployeeRecurringExpenseEditHandler` spec's approach for the same primitive.
 */

function makeFakeDeps() {
	return {
		eventBus: { publish: jest.fn() },
		cqrsEventBus: { publish: jest.fn() },
		taskService: {
			getMaxTaskNumberByProject: jest.fn().mockResolvedValue(0),
			create: jest.fn().mockImplementation(async (data: any) => ({ id: 'task-1', ...data }))
		},
		organizationProjectService: { findOneByIdString: jest.fn() },
		employeeService: {
			findOneByIdString: jest.fn().mockImplementation(async (id: string) => ({ id })),
			findActiveEmployeesByEmployeeIds: jest.fn().mockResolvedValue([])
		},
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

async function createTask(deps: ReturnType<typeof makeFakeDeps>, members: Array<{ id: string }>) {
	const handler = makeHandler(deps);

	await handler.execute(
		new TaskCreateCommand(
			{
				organizationId: 'org-1',
				tenantId: 'tenant-1',
				title: 'Test task',
				members
			} as any,
			false // Skip the triggeredEvent branch; irrelevant to member assignment.
		)
	);

	return deps.taskService.create.mock.calls[0][0].members.map((member: { id: string }) => member.id);
}

describe('TaskCreateHandler', () => {
	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('an Employee creator (RequestContext.currentEmployeeId() resolves)', () => {
		beforeEach(() => {
			jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
				employeeId: 'emp-1',
				name: 'Test Employee',
				tenantId: 'tenant-1'
			} as any);
			jest.spyOn(RequestContext, 'currentEmployeeId').mockReturnValue('emp-1');
		});

		it('is self-added when the submitted members list is empty', async () => {
			const memberIds = await createTask(makeFakeDeps(), []);

			expect(memberIds).toEqual(['emp-1']);
		});

		it('is appended to explicit other members, not replacing them', async () => {
			const memberIds = await createTask(makeFakeDeps(), [{ id: 'emp-2' }]);

			expect(memberIds.sort()).toEqual(['emp-1', 'emp-2']);
		});

		it('is not duplicated when already included in the submitted members', async () => {
			const memberIds = await createTask(makeFakeDeps(), [{ id: 'emp-1' }]);

			expect(memberIds).toEqual(['emp-1']);
		});
	});

	describe('a caller with no resolvable current employee id', () => {
		beforeEach(() => {
			jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
				name: 'Admin Or System',
				tenantId: 'tenant-1'
			} as any);
			// Covers both an Admin/Manager acting on someone else's behalf, and an unauthenticated /
			// integration-sync context with no employee record at all — both resolve to `null` here.
			jest.spyOn(RequestContext, 'currentEmployeeId').mockReturnValue(null);
		});

		it('leaves an empty members list empty — nobody is guessed', async () => {
			const memberIds = await createTask(makeFakeDeps(), []);

			expect(memberIds).toEqual([]);
		});

		it('leaves an explicit members list exactly as supplied', async () => {
			const memberIds = await createTask(makeFakeDeps(), [{ id: 'emp-9' }]);

			expect(memberIds).toEqual(['emp-9']);
		});
	});
});
