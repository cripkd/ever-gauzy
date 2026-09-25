# Proposal

## Why

An Employee who creates a task expects to see it on their own task list, but
today the creating employee is only added as a task member/assignee in one
of three task-creation entry points (`my-task-dialog`), incidentally in a
second (`add-task-dialog`, only when the global employee filter happens to
match the logged-in user), and not at all in the third
(`team-task-dialog`) or in the backend. The backend `TaskCreateHandler`
persists exactly the `members` list the client sends, with no
server-side guarantee that the creator is included. Result: an Employee can
create a task in the backend successfully and not be assigned to it,
matching the reported bug.

## What Changes

- The task-creation command handler always includes the requesting user's
  own employee in the created task's members/assignees, in addition to any
  other employees explicitly selected, regardless of which client/dialog
  issued the request.
- If the creator's employee id is already present in the submitted members
  list, it is not duplicated.
- No existing member-selection behavior is removed: explicitly selecting
  other employees as members continues to work exactly as before, additive
  to the creator.

## Capabilities

### New Capabilities

- `task-assignment`: Governs which employees become members/assignees of a
  task at creation time, including the guarantee that the creator is
  always one of them.

### Modified Capabilities

(none — no existing capability specs are defined yet in this project)

## Impact

- Backend: `packages/core/src/lib/tasks/commands/handlers/task-create.handler.ts`
  (and/or the `TaskCreateCommand`/`CreateTaskDTO` it consumes) — the create
  flow must fold the requesting user's employee id into `members` before
  persisting.
- Frontend: no dialog changes are required for correctness once the backend
  enforces the invariant, since `add-task-dialog` and `team-task-dialog`
  already forward whatever `members` list a client builds; the guarantee
  now holds even if a dialog omits the creator.
- New Playwright coverage under `apps/poc-e2e/tests/`.
