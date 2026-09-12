# Definition of Ready — Bug

For an agent drafting a ClickUp ticket at intake, for a report that describes something broken.
Fill in each item directly in the ticket description as you draft it. Leave an item's checkbox
unticked if you cannot fill it in adequately — do not guess to make a box checkable.

Verification test for every item below: someone who did not write the ticket must be able to look
at what you filled in and tell, without asking you anything, whether it's adequately filled.
"Impact: medium" fails that test — it's not checkable by an outsider. "Blocks invoice creation for
the employee role" passes — it names who, and what they can't do.

- [ ] Reproduction steps — numbered, starting from a logged-in state (e.g. "1. Log in as an employee. 2. Open Invoices. 3. Click New Invoice."); adequately filled means another person could follow the numbered list and land on the same broken state without asking a follow-up question.
- [ ] Expected result — adequately filled means it states what should have happened at the point where reproduction steps end, in one or two concrete sentences, not a restatement of "it should work."
- [ ] Observed result — adequately filled means it states what actually happened at that same point — an error message (quoted), a wrong value, a crash, a blank screen — not just "it's broken."
- [ ] Where — screen/URL and user role — adequately filled means it names the specific screen or route (or URL) and the role of the user who hit it (e.g. "Invoices page, /pages/accounting/invoices, employee role"), not just "the app."
- [ ] Frequency — always / intermittent — adequately filled means it picks one of the two and, if intermittent, adds a rough rate or pattern if known (e.g. "intermittent, ~1 in 5 attempts"); "sometimes" alone is not adequate.
- [ ] Impact — who is blocked and from what — adequately filled means it names the affected role or user group and the specific action or workflow they cannot complete (e.g. "blocks invoice creation for the employee role"); a severity label alone ("high"/"medium") is not adequate.
