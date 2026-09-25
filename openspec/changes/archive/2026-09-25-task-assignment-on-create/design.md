# Design

## Context

See proposal.md - Why/Impact. Single-file change inside `TaskCreateHandler.execute()`, which already has `RequestContext` imported and already reads `RequestContext.currentUser()` at line 60.

## Goals / Non-Goals

**Goals:**
- Auto-assign the creator when they are acting as a plain Employee, without changing the DTO or requiring a frontend change.

**Non-Goals:**
- Changing `ScreeningTasksService` or `AutomationTaskSyncHandler`, which build `Task` rows outside `TaskCreateHandler` (see proposal.md - Impact, "Explicitly excluded").
- Adding a UI affordance (e.g. a "assign me" checkbox) — the backend guarantees this regardless of caller.

## Decisions

**Use `RequestContext.currentEmployeeId()` rather than an explicit `RequestContext.hasRole(RolesEnum.EMPLOYEE)` check.**

`OrganizationTeamService.create()` and `OrganizationSprintService.create()` both do a role-service round trip (`roleService.findOneByIdString(currentRoleId, { where: { name: RolesEnum.EMPLOYEE } })`) to decide whether to auto-add the creator. `currentEmployeeId()` (`request-context.ts:213-230`) already encodes the equivalent distinction more cheaply: it returns the current user's `employeeId` unless they hold `PermissionsEnum.CHANGE_SELECTED_EMPLOYEE` (the permission that marks Admin/Manager as able to act on other employees' behalf), in which case it returns `null`. That's a JWT-derived check with no DB round trip, and it's the same primitive `organization-strategic-initiative.service.ts` and `resource-link.service.ts` already use for their own creator-defaulting. No role-service dependency needs to be injected into `TaskCreateHandler`.

**Add the creator by mutating the `members` array before it's mapped to `Employee` entities (task-create.handler.ts:85), not after task creation.**

Doing it before persistence means the creator is included in the same `_taskService.create()` call, and automatically flows into the existing post-create subscription/notification loop (lines 128-171) with no separate code path — the creator gets the same `ASSIGNMENT` subscription and notification as any other member, for free.

## Risks / Trade-offs

- **Risk**: An Employee who explicitly removes themselves from an already-created task would get re-added if they re-save through a "create" flow (not expected — this only affects the create command, not update). → Mitigation: none needed; this is create-time-only behavior, matching the ticket's scope. Update/edit flows are untouched.
- **Risk**: `currentEmployeeId()` swallows internal errors and returns `null` (see its try/catch). → Mitigation: acceptable — that's already the existing fail-safe behavior this code inherits; a failure here degrades to "no auto-assignment," not a broken task creation.
