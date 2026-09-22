# Proposal

## Why

An Employee who creates a task ends up with a task nobody owns: the task is
persisted, but its assignee list is empty, so it does not appear as the
creator's work anywhere. The creator has no way to notice this at save time
either — the Add Task dialog is supposed to pre-select them (the code reaches
for the logged-in employee, and the sibling "My Tasks" dialog carries a
`select default id of logged in user` comment), but the pre-selection never
reaches the assignee control. Assigning yourself is the overwhelmingly common
case for a user who can only act on their own behalf, so the default being
silently dropped makes self-service task creation useless.

## What Changes

- When a user who can only act as themselves (an Employee — someone without the
  ability to pick a different employee in the global employee filter) opens the
  Add Task dialog on the Tasks Dashboard, their own employee profile is
  pre-selected in the assignee control and visible before saving.
- Saving that dialog without touching the assignee control creates a task
  assigned to the creator, and the created task shows the creator in the task
  list's members column.
- The pre-selection stays a default, not a rule: the creator can remove it
  (creating an unassigned task) or replace it with other employees, and what
  they leave in the control is what gets saved.
- Users who can act for other employees (Admin / Super Admin) keep today's
  behaviour: no assignee is pre-selected, because they routinely create tasks
  on someone else's behalf.

Not breaking: no existing assignment is changed, no API contract changes, and
every assignee combination a creator can express today remains expressible.

### Scoping decisions

Two points the ticket leaves open, decided here rather than guessed at silently:

- **Which creation surface.** The ticket says "Task Creation section" without
  naming a screen. This change covers the Add Task dialog on the Tasks
  Dashboard (`/pages/tasks/dashboard`), which is the task-creation entry point
  an Employee's navigation menu exposes.
- **Team's Tasks is out of scope.** The Team's Tasks page has its own creation
  dialog, which also pre-selects nothing. A task created there is normally
  assigned to a *team*, so defaulting it to the creating individual is a
  product decision, not a bug fix. It needs reporter confirmation and is left
  for a separate change.

## Capabilities

### New Capabilities

- `task-assignment`: who a task is assigned to — the assignee defaults applied
  when a task is created, and how an explicit assignee choice overrides them.

### Modified Capabilities

None — this is the project's first spec.

## Impact

- **Task creation dialog** — `packages/ui-core/shared/src/lib/tasks/add-task-dialog/`
  (`add-task-dialog.component.ts`, `.html`). The dialog already pushes
  `store.selectedEmployee.id` into `selectedMembers`, but mutates the array
  in place after it has been bound to `ga-employee-multi-select`, so the
  child's `selectedEmployeeIds` setter never re-runs and the control renders
  empty.
- **Employee multi-select** —
  `packages/ui-core/shared/src/lib/employee/employee-multi-select/`. Its
  `preSelected` snapshot and the `select.setValue(this.preSelected)` it
  performs once its date range resolves are the other half of the timing
  problem.
- **No API change.** `TaskCreateHandler`
  (`packages/core/src/lib/tasks/commands/handlers/task-create.handler.ts`)
  already persists exactly the `members` it is given and already fires the
  assignment subscription and notification events for them, so a correct
  payload from the dialog is enough. Keeping the default in the dialog also
  keeps it visible and overridable, which a server-side default could not be.
- **Tests** — a new Playwright spec in `apps/poc-e2e/tests/`, logging in as the
  seeded Employee (`employee@ever.co`).
