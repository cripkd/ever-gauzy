# Proposal

## Why

An Employee who creates a task expects to end up assigned to it. Today the task
is created but its members list can end up empty, so the creator has to find
the task afterward and add themselves manually. This is reported as a bug
(ticket: Task Creation — Bug) reproduced by logging in as an Employee, creating
a task, and observing that it is not assigned to the logged-in employee.

## What Changes

- Add a behavioral requirement: a task created by an Employee-role user, with
  no members explicitly added in the creation form, must have that employee
  in its members list once created.
- No requirement change to what happens when the creator explicitly adds
  members (their own choices are respected as-is).

## Capabilities

### New Capabilities

- `task-assignment`: Ensures a newly created task always includes its creator
  among its assigned members when the creator did not explicitly pick members.

### Modified Capabilities

_None — no existing capability specs exist for this domain yet
(`openspec list --specs` returns none)._

## Impact

- Frontend: `packages/ui-core/shared/src/lib/tasks/add-task-dialog/add-task-dialog.component.ts`
  currently relies on the store's `selectedEmployee$` (an admin-oriented
  "currently viewed employee" context, populated in
  `packages/ui-core/theme/src/lib/components/header/header.component.ts`) to
  pre-seed `selectedMembers`. This is not reliably the logged-in employee for
  an Employee-role user, which is the likely source of the bug.
- Backend: `packages/core/src/lib/tasks/task.service.ts` (`TaskService.create()`)
  and `packages/core/src/lib/tasks/task.controller.ts` (`create` endpoint) do
  no fallback assignment — they persist whatever `members` array (possibly
  empty) is in the request body (`packages/core/src/lib/tasks/dto/create-task.dto.ts`).
  Where the fix actually lands (frontend default-selection vs. a
  backend-side fallback that adds the authenticated user's employee when
  `members` is empty) is a design decision for implementation, not fixed by
  this proposal.
- New e2e coverage lives in `apps/poc-e2e/tests/` (Playwright, see existing
  `login.spec.ts`). The task-creation form
  (`add-task-dialog.component.html`) currently has no `data-testid`
  attributes; implementation will need to add them for the members list and
  save action.
