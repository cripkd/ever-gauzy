## 1. Failing Playwright spec (no production code)

- [ ] 1.1 Write `apps/poc-e2e/tests/expense-edit-assign-to.spec.ts` covering the spec
      scenarios: a saved contact and project are shown when the Edit Expense modal opens;
      saving an untouched "Assign to" section preserves both; changing each one persists;
      clearing each one persists; an unassigned expense shows placeholders; Add Expense opens
      empty. The spec must create the expense it asserts against through the UI (log in,
      Accounting → Expenses, ADD, fill amount/category/vendor, pick a contact and a project,
      save) rather than depend on a seeded row — a spec that is red because no suitable seed
      row exists proves nothing. Locate the two controls with the structural selectors that
      exist today (`ga-contact-select` and `ga-project-selector` inside the Edit Expense
      dialog); `data-testid`s arrive in task 3. Follow `apps/poc-e2e/tests/login.spec.ts` for
      login and config. Verify: `pnpm nx e2e poc-e2e` runs the new spec and it fails on the
      assertion that the Contact and Project fields show the saved names — read the failure
      output and confirm it is that assertion and not a locator timeout, a login failure, or
      a failure to create the fixture expense.
- [ ] 1.2 Commit the spec file alone. Verify: `git show --stat HEAD` lists only
      `apps/poc-e2e/tests/expense-edit-assign-to.spec.ts` and no file under `packages/` or
      `apps/gauzy/`.

## 2. Pin the Project field's cause

- [ ] 2.1 With the app running, open the Edit Expense modal for an expense that has a project
      and determine why `ga-project-selector` renders nothing: whether
      `initializeProjectSelection()` overrides the written value from
      `ActivatedRoute.queryParams.projectId` (the Expenses page's own header project filter
      writes that param), whether the option list arrives after `writeValue` without the
      selection being re-mapped, or both. Verify: the finding is recorded in this file under
      task 2.2 with the specific line(s) in
      `packages/ui-core/shared/src/lib/selectors/project/project/project.component.ts` that
      cause it, and it reproduces on demand.
- [ ] 2.2 Record the finding here and confirm it answers the Open Question in `design.md`.
      Verify: `design.md`'s Open Questions section is updated to state the answer. If the
      cause turns out to also make the Project dropdown's option list empty, note it — per
      `proposal.md` that is a separate defect for the ticket, not for this change.

## 3. Test hooks

- [ ] 3.1 Add `data-testid` attributes to the Contact and Project controls in
      `packages/ui-core/shared/src/lib/expenses/expenses-mutation/expenses-mutation.component.html`
      (on the wrappers in the "Assign to" section, not inside the shared selector templates),
      following the `dashboard-container` precedent in
      `apps/gauzy/src/app/pages/dashboard/dashboard.component.html`. Verify: the attributes
      are present in the rendered DOM with the modal open.
- [ ] 3.2 Re-point the locators in `expense-edit-assign-to.spec.ts` to the new testids without
      changing any assertion. Verify: `git diff` on the spec touches locator lines only, and
      `pnpm nx e2e poc-e2e` still fails on the same assertion as in task 1.1.

## 4. Fix the Contact field

- [ ] 4.1 Make `ga-contact-select` match a written contact against its fetched option list —
      add a `compareWith` that compares by `id` in
      `packages/ui-core/shared/src/lib/contact-select/contact-select.component.{ts,html}`.
      Do not switch to `bindValue="id"`: eleven call sites read a whole `IOrganizationContact`
      out of their form control. Verify: the Edit Expense modal shows the saved contact name,
      and the "Contact is shown", "Both fields are shown together" and "Partially assigned"
      scenarios pass.
- [ ] 4.2 Make `ContactSelectComponent.writeValue` honour a falsy value so a cleared or reset
      control clears the displayed selection (today `if (value)` keeps the stale one). Verify:
      the "Clearing a populated contact" and "Add after selecting an assigned expense"
      scenarios pass.

## 5. Fix the Project field

- [ ] 5.1 Fix the cause found in task 2 in
      `packages/ui-core/shared/src/lib/selectors/project/project/project.component.ts`. If the
      cause is the query-param coupling, narrow it to selectors that participate in global
      change rather than removing it — the modal's instance already passes
      `skipGlobalChange=true` while the page header's does not. Verify: the "Project is shown",
      "Both fields are shown together" and "Partially assigned" scenarios pass.
- [ ] 5.2 Confirm selecting a different project and clearing the project both persist through
      save and reopen. Verify: the "Selecting a different project" and "Clearing a populated
      project" scenarios pass.

## 6. Regression check on the shared selectors

- [ ] 6.1 Exercise the other heavy callers of the two selectors by hand: Invoices → Add
      Invoice and Edit Invoice, and the Edit Time Log modal. Verify: contact and project
      selection, display, and save behave as they did before the change in each.
- [ ] 6.2 Run the full checks. Verify: `pnpm nx e2e poc-e2e` is green for the whole suite
      (the new spec plus `login.spec.ts`), and lint, typecheck and build pass for the changed
      projects.

## 7. Close out

- [ ] 7.1 Run `openspec validate fix-expense-edit-assign-to-prefill --strict`. Verify: it
      reports no errors.
