# Proposal

## Why

When a user with the Employee role creates a task, the task is persisted but no one is assigned to it — the creating employee has to go back and manually add themselves. `TaskCreateHandler.execute()` (`packages/core/src/lib/tasks/commands/handlers/task-create.handler.ts:54,83-90`) builds the task's `members` list solely from the client-supplied `input.members` array, never from who is actually making the request. The Angular "Add Task" dialog defaults `members: []` and only populates it from a manual multi-select (`packages/ui-core/shared/src/lib/tasks/add-task-dialog/add-task-dialog.component.ts:75,196`) — there's no "select self" default, so an Employee who doesn't think to add themselves gets an unassigned task.

## What Changes

- `TaskCreateHandler.execute()` auto-adds the requesting employee to the task's `members` list when the request is made by a plain Employee (not an Admin/Manager acting on someone else's behalf), using `RequestContext.currentEmployeeId()` — the same idiom already used for this purpose in `OrganizationTeamService.create()` and `OrganizationSprintService.create()`.
- No change to the request/response DTO shape: `members` still accepts an explicit list (e.g. an Employee assigning collaborators alongside themselves); the server only adds the creator if they're not already present.
- No UI change: the dialog does not need a "select self" checkbox because the backend now guarantees the assignment regardless of which caller (dialog, duplicate-task action, direct API client) hits `POST /tasks`.

## Capabilities

### New Capabilities
- `task-assignment`: governs who gets assigned to a task at creation time, including the creator's own default assignment.

### Modified Capabilities
(none — no existing spec covers task creation/assignment yet)

## Impact

- **Affected code**: `packages/core/src/lib/tasks/commands/handlers/task-create.handler.ts` (the only change needed).
- **Covered callers** (all reach `TaskCreateHandler` via `TaskCreateCommand`, so all get the fix uniformly). There are three separate frontend dialogs that create a task, one per Tasks route, all POSTing to the same `POST /tasks` endpoint (`packages/core/src/lib/tasks/task.controller.ts:253-255`):
  - `AddTaskDialogComponent` (`packages/ui-core/shared/src/lib/tasks/add-task-dialog/`) — opened from the generic "Tasks" page (`ComponentEnum.ALL_TASKS`). Defaults `members: []`; no self-assign logic at all today.
  - `TeamTaskDialogComponent` (`apps/gauzy/src/app/pages/tasks/components/team-task-dialog/`) — opened from the "Team Tasks" page. Same as above: `selectedMembers = (members || []).map(...)`, no self-assign default.
  - `MyTaskDialogComponent` (`apps/gauzy/src/app/pages/tasks/components/my-task-dialog/my-task-dialog.component.ts:140-150`) — opened from the "My Tasks" page. This one already has a **partial, frontend-only** default: `if (members === null) { this.selectedMembers = [this.employeeId]; }`. It only self-assigns on this one route, is only as reliable as `this.store.user?.employee?.id` being populated by the time the dialog initializes, and provides no defense if the current user later removes themselves from the multi-select before saving. This is exactly the kind of single-dialog, frontend-only patch the fix in this proposal supersedes with a uniform, server-side guarantee — after this change, that block becomes redundant (harmless: the server dedups) rather than load-bearing.
  - The "duplicate task" UI action and any other direct API client also submit through the same `POST /tasks` endpoint.
  - `IntegrationMapSyncIssueHandler` / `IntegrationMapSyncTaskHandler` (`packages/core/src/lib/integration-map/commands/handlers/integration-map.sync-{issue,task}.handler.ts`) also dispatch `TaskCreateCommand` for inbound synced issues/tasks, but run with no authenticated Employee request context, so `RequestContext.currentEmployeeId()` returns `null` there and this change is a no-op for them — behavior for synced tasks is unchanged.
- **Explicitly excluded** (bypass `TaskCreateHandler` entirely, building `Task` rows through their own code paths — a different feature from "an Employee creates their own task," not addressed by this change):
  - `ScreeningTasksService.create()` (`packages/core/src/lib/tasks/screening-tasks/screening-tasks.service.ts:48-96`) — candidate-screening task creation.
  - `AutomationTaskSyncHandler.createTask()` (`packages/core/src/lib/tasks/commands/handlers/automation-task.sync.handler.ts:91-213`) — GitHub-automation-synced tasks, created via a raw TypeORM repository.
- **Roles affected**: only requests where `RequestContext.currentEmployeeId()` resolves to a non-null id (a plain Employee acting for themselves) gain the new default. Admin/Manager callers are unaffected: `currentEmployeeId()` already returns `null` for any caller holding `PermissionsEnum.CHANGE_SELECTED_EMPLOYEE`, which is the codebase's existing way of distinguishing an Employee acting for themselves from an Admin/Manager acting on someone else's behalf.
- **No API/DTO changes**: `CreateTaskDTO` is unchanged; this is purely server-side default-filling logic.
