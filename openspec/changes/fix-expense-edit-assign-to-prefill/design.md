## Context

See `proposal.md` — Why.

What the read-only investigation established:

- The Expenses page already requests the `project` and `organizationContact` relations for
  the paginated list (`apps/gauzy/src/app/pages/expenses/expenses.component.ts`), and passes
  the selected row straight into the modal as `context: { expense }`. The data is present in
  the modal.
- `ExpensesMutationComponent._initializeForm()` patches `organizationContact` (the whole
  object), `organizationContactId`, `project` (the whole object) and `projectId`. So the
  form controls are populated. The failure is between the form control and what the selector
  renders.
- `ga-contact-select` binds `[items]="contacts"` with `[(ngModel)]="organizationContact"`,
  no `bindValue` and no `compareWith`. `ng-select` falls back to identity comparison, and the
  contact object patched in from the expense is a different instance from the one in the
  option list fetched by `OrganizationContactService.getAll`. Identity never matches, so
  nothing is rendered as selected and the placeholder stays. Its `writeValue` also ignores
  falsy values (`if (value)`), so a control reset to `null` leaves the previous selection in
  place.
- `ga-project-selector` binds `bindValue="id"`, which should survive the option list arriving
  after `writeValue`. Its root cause is not established by reading alone. Two candidates
  worth checking first: (a) `initializeProjectSelection()` combines `subject$` with
  `ActivatedRoute.queryParams` and calls `selectProjectById(queryParams.projectId)` — and the
  Expenses page's own header project filter writes `projectId` into those query params, so
  the modal's selector can be driven by the page filter rather than by the expense; (b) the
  option list is replaced asynchronously after `writeValue` and the selected value is not
  re-mapped.

Constraint: both selectors are shared. `ga-contact-select` has eleven other call sites
(invoices, income, timesheets, payments, proposals, time tracker) and `ga-project-selector`
has more. Whatever changes cannot alter their behaviour for those callers.

## Goals / Non-Goals

**Goals:**

- Find the actual cause in each selector before changing it, and fix the cause rather than
  re-patching the form after the fact.
- Keep the fix inside the two selector components where possible, so every caller benefits.
- Give the "Assign to" controls stable `data-testid` hooks.

**Non-Goals:**

- No API, entity, or database change — the data already arrives correctly.
- No redesign of either selector's public API. New inputs, if any, must be optional and
  default to today's behaviour.
- Not resolving whether the dropdown option lists are also empty (see `proposal.md` — Open
  question). Task 2 will observe it; if it is a separate defect it goes back to the ticket.

## Decisions

**Diagnose before fixing.** The contact cause is established by reading; the project cause is
not. Task 2 pins the project cause with the app running before task 4 touches the selector.
The alternative — patching both selectors on a guess — risks a change that makes the symptom
disappear for the wrong reason and leaves the real defect for the next caller.

**Fix the selector, not the caller.** For the contact field the natural fix is to give
`ng-select` a way to match the written value against the fetched options — a `compareWith`
by `id`, or `bindValue="id"` with the surrounding call sites adjusted. Preferred:
`compareWith`, because it is additive and leaves every existing caller's control value shape
(a whole `IOrganizationContact`) untouched. `bindValue="id"` would change what each of the
eleven call sites reads out of its form control, which is a much larger blast radius for the
same visible result.

The alternative of fixing it only in `ExpensesMutationComponent` — for instance by looking
the contact up in the option list and re-patching — was rejected: it leaves the same defect
in the other ten call sites and adds a second source of truth for the selection.

**Keep clearing working.** `ContactSelectComponent.writeValue` currently ignores `null`. Any
fix has to make a cleared control actually clear the displayed selection, otherwise the
"clearing a populated contact" scenarios cannot pass. This is why those scenarios are in the
spec even though the ticket only asks for population.

**Test hooks.** Add `data-testid` on the Contact and Project controls in the Edit Expense
modal markup, following `dashboard-container` in
`apps/gauzy/src/app/pages/dashboard/dashboard.component.html` — the only existing precedent.
Put them on the wrapper in `expenses-mutation.component.html` rather than inside the shared
selector templates, so the id identifies the field in this modal and not every selector in
the app.

## Risks / Trade-offs

- **A `compareWith` on `ga-contact-select` changes selection semantics for ten other call
  sites** → Comparing by `id` is strictly more permissive than identity: anything that
  matched before still matches. Task 5 spot-checks Invoices (add/edit) and the Edit Time Log
  modal, the two heaviest callers.
- **The project selector's query-param coupling may be load-bearing for the page-level
  filter** → The modal's instance already passes `skipGlobalChange=true`; any fix should
  narrow the query-param behaviour to selectors that participate in global change, not remove
  it. Confirm against the header selector before changing it.
- **The Playwright spec needs an expense that has both a contact and a project** → Seed data
  may not contain one. The spec should create the expense it asserts against, through the UI,
  rather than depend on a seeded row; otherwise it is red for the wrong reason and the
  stage 3 gate proves nothing.
- **Fixing display could regress Add Expense** → If the fix leans on stale component state,
  the Add modal could open pre-filled from the previously selected row. The spec covers this
  explicitly.

## Open Questions

- Whether the Project field's cause is the query-param coupling, the async option list, or
  both. Deferrable: it changes which lines task 4 edits, not the requirements, the approach,
  or the task breakdown. Task 2 answers it.
