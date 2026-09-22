# Design

## Context

See `proposal.md` — Why. The design-relevant facts:

- The Tasks Dashboard opens `AddTaskDialogComponent`
  (`packages/ui-core/shared/src/lib/tasks/add-task-dialog/`). Its `ngOnInit`
  already intends the default: on `store.selectedEmployee$` it does
  `this.selectedMembers.push(employee.id)` when no task is being edited.
- `selectedMembers` is bound into the child control as
  `[selectedEmployeeIds]="selectedMembers"`. `push` mutates the array in place,
  so the array reference never changes, so Angular never re-invokes the child's
  `selectedEmployeeIds` setter, so the control renders with nothing selected.
- `EmployeeSelectComponent` (`ga-employee-multi-select`) snapshots that input
  into `preSelected` and applies it once — `select.setValue(this.preSelected)`
  — when its date range resolves. An in-place mutation is invisible to both
  halves of that handshake.
- `store.selectedEmployee` for an Employee is populated asynchronously by the
  header (`checkEmployeeSelectorVisibility`), which fetches the employee by id
  before setting it. The dialog can therefore open before that value exists.
- `CHANGE_SELECTED_EMPLOYEE` is granted only to `SUPER_ADMIN` and `ADMIN`
  (`packages/core/src/lib/role-permission/default-role-permissions.ts`). It is
  the existing line between "can act for other employees" and "can only act as
  myself", and it is already what decides whether the header shows an employee
  picker at all.
- `TaskCreateHandler` persists exactly the `members` array it receives, and
  already emits the assignment subscription and notification events for each
  member. A correct payload from the dialog needs no server change.

## Goals / Non-Goals

**Goals:**

- Make the pre-selection survive into the rendered control, so the creator can
  see and override it before saving.
- Derive the default from state that is available synchronously when the dialog
  opens, so the behaviour does not depend on a race with the header's fetch.

**Non-Goals:**

- No change to `EmployeeSelectComponent`. It is bound by 20+ templates across
  the app; widening the blast radius of a single-dialog bug fix is not worth
  it, and its contract (take a reference, apply it once resolved) is usable as
  is once the caller respects it.
- No server-side default in `TaskCreateHandler`. A default applied there would
  be invisible in the form and unremovable by the creator, which contradicts
  the requirement that the creator can clear it, and would silently change
  task creation for every other caller of the create command (integrations,
  automation sync, the desktop app).
- No change to the Team's Tasks dialog or the My Tasks dialog.

## Decisions

**Pre-select from `store.user.employee.id`, not `store.selectedEmployee`.**
The requirement is "the employee who created the task", which is exactly
`store.user.employee`. `store.selectedEmployee` is a *filter* value that
happens to equal the current employee for an Employee-role user, and only
after an async fetch resolves. Reading the identity directly removes the race
and expresses the intent. The sibling `MyTaskDialogComponent` already does this
(`this.store.user?.employee?.id`), so this also makes the two dialogs agree.
Alternative considered: keep using `store.selectedEmployee$` and only fix the
mutation. Rejected — it would still leave the default missing whenever the
dialog opens before the header's fetch resolves, which is precisely the
`?openAddDialog=true` deep-link path the nav menu's "add" shortcut uses.

**Gate the default on lacking `CHANGE_SELECTED_EMPLOYEE`.** This reuses the
permission that already means "this user can only act as themselves", so an
Admin creating a task on someone else's behalf sees no surprise pre-selection.
Alternative considered: pre-select for everyone who has an employee profile.
Rejected — most Admins have an employee profile, so it would silently assign
admin-created tasks to the admin, a regression the ticket does not ask for.
Alternative considered: check `RolesEnum.EMPLOYEE` by name. Rejected — role
permissions are tenant-configurable in this product, so the permission is the
real predicate and the role name is a proxy for it.

**Assign a new array reference, never mutate.** `this.selectedMembers = [id]`
rather than `.push(id)`. This is what makes the child's input setter re-run.
The same rule applies anywhere else the dialog revises the selection.

**Assert through the rendered list, not through the API.** The Tasks Dashboard
members column renders assignee names as visible text (`people-list`
component's `.person-name`), so the Playwright spec can assert the created
task's assignee from the UI without new test hooks. This keeps the failing-test
commit free of production changes, which the red-before-green gate requires.

## Risks / Trade-offs

- **The default is applied in one dialog, so the other creation surfaces stay
  inconsistent.** → Deliberate and recorded in the proposal: the Team's Tasks
  dialog assigns to a team by design and needs a product decision. The
  inconsistency is pre-existing, not introduced here.
- **A user whose account has no employee profile gets no default.** → Correct
  by the spec: there is no employee to assign. Guarded by an explicit check so
  it cannot produce a `[undefined]` members array.
- **`onSave` maps selected ids against `this.employees`, loaded asynchronously
  by `loadEmployees()`.** If that list does not contain the creator, the
  pre-selected id is dropped at save time and the fix appears to work in the
  form but not in the result. → The implementation must make the save path
  resilient to the creator being absent from the fetched list rather than
  relying on it, and the Playwright spec asserts the created row, not the form,
  so this failure mode cannot pass silently.
- **Pre-selection changes what an Employee sees on a screen they use daily.** →
  It is visible before saving and removable, and a scenario covers clearing it.
