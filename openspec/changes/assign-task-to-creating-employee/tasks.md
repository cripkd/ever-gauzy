# Tasks

## 1. Failing Playwright spec, committed alone

- [ ] 1.1 Write `apps/poc-e2e/tests/task-assignment.spec.ts` covering the spec's
      first three scenarios, and **no production code of any kind** — not a
      `data-testid`, not a component change. Log in as the seeded Employee
      (`employee@ever.co` / `12345678`, display name "Default Employee"),
      navigate to `/pages/tasks/dashboard`, open the Add Task dialog, and assert:
      (a) the employee assignee control shows "Default Employee" selected before
      anything is filled in; (b) entering a unique title and saving without
      touching the assignee control produces a list row for that title whose
      members cell contains "Default Employee"; (c) clearing the assignee
      control before saving produces a row whose members cell is empty. Address
      the dialog and grid through DOM that exists today — the dialog's i18n
      labels and placeholders, and the members cell's `.person-name` text
      rendered by the `people-list` component — so the spec's only reason to
      fail is the missing assignment. Verify by reading the spec back and
      confirming `git status` shows exactly one added file under
      `apps/poc-e2e/tests/`.
- [ ] 1.2 Run `pnpm nx e2e poc-e2e` against a locally served app and verify the
      new spec is **red**, and red for the ticket's symptom: assertions (a) and
      (b) fail because no employee is selected and the created task has no
      member, while (c) — the already-correct unassigned case — passes. Capture
      the failure output for the run log. If a failure is instead a locator or
      navigation error, fix the spec's selectors and re-run until the only
      failures are the assignment assertions.
- [ ] 1.3 Commit the spec on its own, with a message naming the ticket and
      stating the test is expected to fail. Verify with `git show --stat HEAD`
      that the commit touches only `apps/poc-e2e/tests/task-assignment.spec.ts`.

## 2. Default the assignee to the creator

- [ ] 2.1 In `AddTaskDialogComponent`
      (`packages/ui-core/shared/src/lib/tasks/add-task-dialog/add-task-dialog.component.ts`),
      replace the `store.selectedEmployee$` pre-selection with one derived from
      `store.user?.employee?.id`, applied only when the dialog is opening for a
      new task (`!this.selectedTask`) and the user lacks
      `PermissionsEnum.CHANGE_SELECTED_EMPLOYEE`, and **assigned as a new array**
      (`this.selectedMembers = [employeeId]`) rather than pushed, so the
      `[selectedEmployeeIds]` input setter on `ga-employee-multi-select` re-runs.
      Guard against a missing employee profile so `selectedMembers` never holds
      `undefined`. Verify assertion (a) of the spec from task 1 now passes.
- [ ] 2.2 Make `onSave` resilient to the pre-selected creator being absent from
      the asynchronously loaded `this.employees` list — today it maps ids
      through `this.employees.find(...)` and silently drops anything missing, so
      the form could show the default while the saved task has no member. Verify
      assertion (b) passes, i.e. the created task's members cell names the
      creator.
- [ ] 2.3 Verify the override paths still work: run the spec from task 1 in full
      and confirm assertion (c) (assignee cleared → unassigned task) still
      passes alongside (a) and (b).

## 3. Verify the untested scenarios and the wider suite

- [ ] 3.1 Manually verify the spec's two remaining scenarios against a running
      app, and record the result in the change's notes: signing in as
      `admin@ever.co` shows **no** pre-selected assignee in the Add Task dialog,
      and a signed-in user with no employee profile likewise sees none and can
      save an unassigned task. Extend `task-assignment.spec.ts` with the Admin
      case if a seeded Admin login is available in the e2e environment.
- [ ] 3.2 Run `pnpm nx lint ui-core-shared` (or the lint target that owns the
      edited file) and `pnpm nx build gauzy`, and verify both pass.
- [ ] 3.3 Run the whole Playwright suite — `pnpm nx e2e poc-e2e` — and verify
      every spec including `login.spec.ts` is green, confirming no collateral
      breakage in the other screens that bind `ga-employee-multi-select`.
- [ ] 3.4 Run `openspec validate assign-task-to-creating-employee --strict` and
      verify it reports no issues.
