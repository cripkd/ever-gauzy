# Tasks

## 1. Failing test

- [x] 1.1 Write `apps/poc-e2e/tests/task-assignment.spec.ts`: log in as an
      Employee, open the task creation form, create a task without
      selecting any members, save it, then assert the created task's
      members include that employee (per the spec scenarios in
      `specs/task-assignment/spec.md`). Commit this spec alone, with no
      production code changes, and verify it fails (red) for the reason
      described in the ticket — the members list comes back empty.

## 2. Implementation

- [x] 2.1 Add `data-testid` attributes to
      `packages/ui-core/shared/src/lib/tasks/add-task-dialog/add-task-dialog.component.html`
      for the title input, members selector, and save button, and verify
      lint/build still pass.
- [x] 2.2 Fix task creation so the creating Employee ends up in the task's
      members when they selected none explicitly, and verify existing
      unit tests for the touched frontend/backend code still pass.
- [ ] 2.3 Run the spec from task 1.1 and verify it now passes (green).

## 3. Verify

- [ ] 3.1 Run lint, typecheck, and build for the changed paths and verify
      they pass.
- [ ] 3.2 Run the full `apps/poc-e2e` Playwright suite and verify every
      spec passes, including the pre-existing `login.spec.ts`.
