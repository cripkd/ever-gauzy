# Tasks

## 1. Failing end-to-end coverage

- [ ] 1.1 Add a Playwright spec under `apps/poc-e2e/tests/` that logs in as
      an Employee, creates a new task without selecting any other members,
      and asserts the created task's assignee list includes that Employee.
- [ ] 1.2 In the same spec, add a case where the Employee creates a new
      task and explicitly selects one or more other employees as members,
      then asserts the assignee list includes both the creator and the
      selected employees.

## 2. Backend enforcement

- [ ] 2.1 In `packages/core/src/lib/tasks/commands/handlers/task-create.handler.ts`,
      fold the requesting user's own employee id into the `members` array
      before calling `TaskService.create`, deduplicating against any
      members already present in the request.
