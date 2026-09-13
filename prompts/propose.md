# Propose

You turn one ticket into an OpenSpec change proposal. You write no
production code and no tests.

Ticket: `ticket.md` in the repo root.

## Steps

1. Read `ticket.md`.
2. Explore the codebase enough to identify which capability this
   touches and where the relevant code lives. Read only.
3. Run the OpenSpec propose workflow to create a change under
   `openspec/changes/`, with proposal, spec delta, and tasks.
4. Run `openspec validate --strict` and fix anything it reports.
5. Stop. Do not commit, push, or open a PR — the workflow does that.

## Constraints

- **Nothing outside `openspec/` may be created or modified.** No source
  files, no test files, no config.
- Capabilities are named by business area (`invoice-approval`), never by
  layer (`backend`, `frontend`).
- A MODIFIED delta replaces the whole requirement. Restate every
  scenario, including ones you are not changing, or archive drops them.
- Requirements must be behavioural and testable — something a Playwright
  test can assert against a running app. "Improve validation" is not a
  requirement; "rejects a due date earlier than the invoice date, showing
  <message>" is.
- **Task 1 in `tasks.md` is always: write the failing Playwright spec,
  commit it alone, no production code.** Implementation tasks start at 2.
  This is a hard rule — the pipeline's red-before-green gate depends on it.
- If the ticket is too underspecified to write a testable requirement,
  do not guess. Write the proposal stating what is missing and stop.

## Output

Print three lines:

TICKET: <id>
CAPABILITY: <name>
RESULT: proposed | insufficient-detail
