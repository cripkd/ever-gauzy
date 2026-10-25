## Why

An expense that was saved with a Contact and a Project loses sight of both when it is
reopened for editing: the "Assign to" section of the Edit Expense modal (Accounting →
Expenses → EDIT) shows placeholder text instead of the saved values. A user editing an
existing expense cannot tell what it is assigned to, and has no way to confirm the
assignment short of cancelling and reading the table. The expense list already loads the
`project` and `organizationContact` relations, so the data reaches the modal — it is the
modal's two selectors that fail to display it.

No spec covers the expense area yet, so the corrective behaviour is being written down for
the first time rather than amended.

## What Changes

- The Edit Expense modal shows the expense's saved Contact and Project as the selected
  values of the two "Assign to" fields when the modal opens.
- Saving an edited expense without touching the "Assign to" fields keeps the existing
  Contact and Project assignment.
- Clearing either field and saving removes that assignment, so the display fix does not
  make a populated field impossible to empty.
- An expense saved with no Contact or no Project keeps showing placeholder text for the
  field that has no value.
- `data-testid` attributes are added to the Edit Expense modal's Contact and Project
  controls so the behaviour is assertable from Playwright.

Not in scope: the Add Expense and Duplicate Expense flows beyond keeping their current
behaviour intact, the expense list/grid rendering, and the page-level Contact and Project
filters above the table.

## Capabilities

### New Capabilities

- `expense-management`: recording and editing an organization's expenses, including the
  assignment of an expense to a client contact and to a project.

### Modified Capabilities

<!-- None. There is no existing spec for this area. -->

## Impact

Affected code:

- `packages/ui-core/shared/src/lib/expenses/expenses-mutation/expenses-mutation.component.{ts,html}`
  — the Edit Expense modal, its form, and the "Assign to" markup.
- `packages/ui-core/shared/src/lib/contact-select/contact-select.component.{ts,html}` —
  `ga-contact-select` binds whole contact objects through `ng-select` with no `bindValue`
  or `compareWith`, so a contact patched in from a loaded expense is never matched against
  the fetched option list.
- `packages/ui-core/shared/src/lib/selectors/project/project/project.component.{ts,html}` —
  `ga-project-selector`, which is written with the expense's `projectId` before its own
  project list has loaded and which also reacts to a `projectId` route query parameter that
  the Expenses page itself sets.

Both selectors are shared components used elsewhere (timesheets, invoices, proposals), so
any change to them has to preserve their current behaviour for existing callers.

Not affected: the API, the `expense` entity, and the database.

## Open question carried from the ticket

The ticket records the dropdown *contents* as UNKNOWN — the screenshot shows both dropdowns
closed, so whether the option lists are also empty was never established. The requirements
below are written against the established symptom (a saved value not displayed). If
investigation in task 2 shows the option lists are empty too, that is a separate defect and
should go back to the ticket rather than be absorbed here.
