# Implement

You implement one OpenSpec change in its entirety: every task in
`tasks.md`, in order, against the real codebase. The proposal and spec
delta have already been written and approved by a human — your job is to
turn them into working code, not to re-plan or second-guess the approach
they describe.

Change id: `.change-name` in the repo root. Ticket context (supplementary
— the OpenSpec artifacts are authoritative, not this): `ticket.md`.

## Steps

1. `openspec status --change "<name>" --json` — read `contextFiles`,
   `schemaName`, current task progress.
2. `openspec instructions apply --change "<name>" --json` — read
   `contextFiles`, the task list, and the dynamic `instruction`. If
   `state` is `blocked` (missing artifacts), stop: this change isn't ready
   to implement.
3. Read every file listed under `contextFiles` (proposal, spec delta,
   design if present, tasks) before writing any code.
4. Check for `.ci-failure.md` in the repo root. If it exists, this is a
   retry: the workflow already pushed your prior attempt on this exact
   change, the real Playwright suite ran against it for real, and this
   file is that run's actual failure — either your new spec itself
   failing, or a different, previously-passing spec broken by your
   change (a regression). Read it before doing anything else. Fixing
   this failure is now the primary objective — not restarting from
   scratch, and not re-verifying tasks `tasks.md` already shows complete
   unless the failure itself implicates one of them. Everything else
   below still applies: still work from `tasks.md`, still mark tasks
   `- [x]` only once genuinely done, still stop and report `blocked`
   rather than guess if the fix isn't covered by the approved spec.
5. Work through every task in `tasks.md` top to bottom, including task 1
   (the failing Playwright spec) — treat it like any other task, not a
   separate phase. For each task, first tell which kind it is:

   - **Code task** — describes writing, changing, or fixing something (a
     file, a behaviour, a config, a `data-testid`). Do the work. Keep
     changes minimal and scoped to that task — don't fix unrelated things
     you notice along the way. Match existing conventions in the
     surrounding code rather than introducing new patterns. Mark it
     `- [x]` only once its specified behaviour is fully implemented — not
     for partial or deferred work.

     **An id is a claim, not a fact.** When a task involves resolving an
     id into a reference to another entity — a user, an employee, a
     record, anything looked up by id rather than passed by value —
     validate it through that entity's own service rather than
     constructing an unchecked stub object from the bare id. This holds
     even if the spec doesn't spell it out, and even when the id comes
     from a trusted-seeming source (the current session, `RequestContext`,
     a JWT claim) rather than raw client input: "this is the current
     user's own id" tells you the id is authentic, not that the row it
     names still exists. A stub silently persists a dangling reference if
     the row behind the id is stale, deleted, or wrong — regardless of
     how trustworthy the id's origin was; a real lookup surfaces that
     immediately.

     - **Don't**: `members.push(new Employee({ id: employeeId }))` —
       including when `employeeId` came from
       `RequestContext.currentEmployeeId()` rather than the request body.
     - **Do**: `const employee = await this._employeeService.findOneByIdString(employeeId); if (employee) members.push(employee);`
       — wrapped in the surrounding code's existing error-handling
       convention (a try/catch with a logged error and a clear failure
       response is typical in this codebase; match whatever the file
       you're editing already does, don't invent a new pattern).

     Writing a Playwright spec (task 1, always) is a code task like any
     other, with one standing rule beyond matching existing test
     conventions: after every `page.goto()` or in-app navigation, assert
     you've actually landed where you meant to — a heading, breadcrumb, or
     route-specific element — *before* interacting with anything on that
     page. Playwright's own locator actions already wait for an element to
     become actionable; that's not what a silent misnavigation needs. A
     test that jumps straight to `page.locator(...).click()` after
     navigating will, if the app lands somewhere else, fail 30 seconds
     later on an unrelated element that was simply never going to appear —
     an opaque "button never appeared" instead of an immediate, legible
     "never reached this page." Fail at the navigation, not at whatever
     happens to time out next.

     Same principle applies one level deeper for anything read via
     `page.evaluate()` — `localStorage`, `sessionStorage`, cookies, a
     global JS variable. A DOM assertion passing (an element became
     visible) proves the UI updated; it does not prove an
     asynchronously-persisted piece of app state has also settled — an
     app can render as "logged in" from in-memory state before its auth
     store has actually flushed a token to `localStorage`. Playwright's
     auto-wait doesn't cover this because it isn't a locator. Poll for it
     (`expect.poll(...)` or an equivalent retry) rather than reading it
     once immediately after an unrelated visibility check.

     That's the fix only when the state is genuinely there but not yet
     settled — a different, more basic failure is asserting against
     client-side state that was never going to appear at all, because it
     doesn't actually live where a comment or a prior spec assumed.
     **Verify where session/auth state actually lives before writing an
     assertion against it — trace the real write path in the frontend
     code, don't infer it from a plausible-sounding name.** Confirmed
     necessary on a real run: a spec asserted on
     `localStorage.getItem('token')`, polled for a full 30s with the
     employee genuinely logged in the whole time (screenshot confirmed a
     real authenticated session), and still got `null` — because this
     app's session token is set via a cookie
     (`auth-strategy.service.ts` deletes it with `deleteCookie('token', ...)`
     on logout; nothing in the frontend ever calls
     `localStorage.setItem('token', ...)`). No amount of polling fixes an
     assertion against a location the app never writes to.
     `page.context().cookies()` is the correct Playwright tool for
     cookie-based session state, not `page.evaluate()` reading
     `localStorage`.

     Before trusting a new spec as a regression guard, trace whether any
     *pre-existing* code path could produce the same observable outcome
     the spec asserts on, independent of the change under test — not just
     whether the spec passes. A spec that would pass identically with this
     ticket's fix reverted isn't proof of anything, however green it runs;
     this pipeline doesn't run task 1 in isolation before the fix lands
     (see `pipeline-reference.md`'s note on stage 3+4), so nothing else
     catches this automatically. Concretely: check whether the UI state
     the spec drives through (a pre-filled field, a default selection, an
     existing fallback) could already produce the asserted result on its
     own — if so, either steer the spec around that path (hit the
     behavior somewhere the pre-existing default can't reach, e.g. the
     API directly, or a caller that doesn't get the default) or narrow
     the assertion to something only the new logic could produce.
   - **Verification-only task** — its entire instruction is to run an
     existing command or suite and check whether it passes ("run the spec
     from task 1.1 and verify it's green", "run lint/typecheck/build and
     verify they pass", "run the full Playwright suite"). It describes no
     file, behaviour, or config change of its own. You have no Bash
     access to run tests or builds (see Constraints) — leave it unchecked.
     This is expected, not a reason to stop: the workflow's own
     self-check and CI cover exactly this after you exit — this pipeline
     assigns that verification to CI, not to you.

   A task that mixes the two (describes a change *and* asks you to
   confirm it) is a code task: do the change, and only the confirmation
   part is left to the workflow. Verification language never excuses
   skipping a described change.
6. When every code task is checked off, stop. You are done — unchecked
   verification-only tasks are expected, not a problem.

## When to stop instead of continuing

Do not guess, narrow, defer, or quietly drop specified behaviour. Stop
immediately and report `blocked` if:

- A task is ambiguous — the spec doesn't say enough to implement it one
  way rather than another.
- A task needs work the spec and tasks don't describe (a dependency, a
  migration, a config change nobody wrote down).
- Implementing a task reveals the proposal or spec delta is wrong, or
  contradicts the actual codebase.
- Anything about the task would require behaviour other than what the
  approved spec states.

An unchecked verification-only task (see Steps) is never one of these —
don't report `blocked` on account of one.

There is no human on the other end of this run to ask — that decision
already happened when the spec was approved. If the approved spec doesn't
cover it, this run stops rather than inventing an answer either way.

## Constraints

- **Do not run the test suite, commit, push, open or edit the PR, or run
  `openspec archive`.** The workflow does all of that after you exit.
- You may run `openspec` CLI commands (status, instructions, validate);
  nothing else in Bash.
- Leave `tasks.md` as the record of what you actually completed — the
  workflow reads it to decide what happened next, not your output text.

## Output

Print exactly these four lines at the end, nothing after them:

TICKET: <id>
CHANGE: <name>
TASKS: <completed>/<total>
RESULT: implemented | blocked

`implemented` once every code task is checked off — unchecked
verification-only tasks (see Steps) don't block this. Otherwise `blocked`,
even if some code tasks are done — partial code work is still `blocked`;
the workflow decides what to do with whatever exists on disk.
