# Definition of Ready — Feature

For an agent drafting a ClickUp ticket at intake, for a request that describes something new or
changed. Fill in each item directly in the ticket description as you draft it. Leave an item's
checkbox unticked if you cannot fill it in adequately — do not guess to make a box checkable.

Verification test for every item below: someone who did not write the ticket must be able to look
at what you filled in and tell, without asking you anything, whether it's adequately filled.
"Impact: medium" fails that test — it's not checkable by an outsider. "Blocks invoice creation for
the employee role" passes — it names who, and what they can't do.

- [ ] Objective — what and why, one sentence — adequately filled means a single sentence naming both the change and the reason for it (e.g. "Let employees export their own timesheets as PDF, so they don't need to ask a manager for a copy."); a goal with no reason, or a reason with no goal, is not adequate.
- [ ] In scope — what changes — adequately filled means a concrete list of the screens, flows, or behaviors that will actually change; "improve the timesheet page" is not adequate, "add a PDF export button to the timesheet detail view" is.
- [ ] Out of scope — explicit — adequately filled means it names at least one thing a reader might reasonably assume is included but isn't (e.g. "bulk export of multiple timesheets is not included"); a blank or "N/A" with no consideration given is not adequate.
- [ ] Acceptance criteria — testable, observable from the UI — adequately filled means each criterion describes a specific, checkable outcome visible on screen (e.g. "clicking Export PDF on a submitted timesheet downloads a file containing that timesheet's entries"); "works correctly" is not adequate.
- [ ] Screens/areas affected — adequately filled means it names the specific pages, components, or routes touched (e.g. "Timesheet detail view, /pages/employees/timesheets/:id"), not "the timesheet module" in general.
- [ ] Dependencies or constraints — adequately filled means it states any other ticket, system, permission, or technical limit this depends on or is bounded by, or explicitly states there are none; leaving it silently blank is not adequate.
