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
- **Task 1 in `tasks.md` is always: write the failing Playwright spec.**
  Write it before any implementation task, so it describes the intended
  behaviour rather than being reverse-engineered from code that already
  satisfies it. Implementation tasks start at 2. Do not instruct committing
  it separately or verifying it fails in isolation — the implement stage
  does every task in one combined push, not two, so there is no isolated
  red run to describe.
- **`tasks.md` only lists things a human or the implement agent actually
  does** — writing code, a test, a config change, a `data-testid`. Never a
  task whose entire content is "run X and confirm it passes" (lint,
  typecheck, build, the test suite, re-running the spec from task 1). The
  pipeline already runs all of that unconditionally on every push,
  regardless of what `tasks.md` says — nothing in this pipeline reads
  `tasks.md` to decide whether to run those checks, and nothing is wired
  to check such a box off, so it can never legitimately close and doesn't
  belong there.
- If the ticket is too underspecified to write a testable requirement,
  do not guess. Write the proposal stating what is missing and stop.

## Output

Print three lines:

TICKET: <id>
CAPABILITY: <name>
RESULT: proposed | insufficient-detail
