# POC pipeline — stages, gates, tools, status

One page. Stage definitions are fixed in Step 0; status changes as runs
happen.

---

## The seven stages

Same seven for both lanes. Bugs and features differ only in the wording
of the stage 3 gate. Built as GitHub Actions cron pollers (find eligible
tickets, dispatch) paired with `repository_dispatch` agents (do the work) —
see [Mechanism](#mechanism-what-actually-runs-this) below for why, and why
that's a real departure from the MCP-driven model this table originally
assumed.

| #   | Stage             | Mechanism                                                  | ClickUp status change                       | Artifact out                                              | Exit gate                                                                    | Decided by     |
| --- | ----------------- | ----------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------- |
| 1   | Intake            | `poll-clickup-intake.yml` → `agent-intake.yml`               | `to do` → `in spec`                          | Ticket rewritten to DoR form                               | DoR checklist complete; human sets priority and moves to `ready for spec`    | **Human**      |
| 2   | Spec              | `poll-clickup-propose.yml` → `agent-propose.yml`             | `ready for spec` → `spec proposed`           | OpenSpec change (proposal + spec delta + tasks) + draft PR | `openspec validate --strict` green, then you approve and move to `ready for dev` | CI + **Human** |
| 3+4 | Failing test + Implement (one agent — see note) | `poll-clickup-implement.yml` → `agent-implement.yml`         | `ready for dev` → `in progress`              | Branch pushed: failing spec + implementation together      | Self-check (lint/typecheck/build, scoped to directly-touched projects) passes | CI             |
| 5   | Verify            | `poc-e2e.yml` (CI) → `agent-react-to-e2e.yml` (reacts)       | `in progress` → `ready for review` (on green) | PR undrafted; screenshots/trace/HTML report on failure     | Whole accumulated Playwright suite green, for the exact pushed commit         | CI             |
| 6   | Review            | `poll-clickup-review.yml` → `agent-review.yml`               | `ready for review` → `in review`             | GitHub PR review (AI-authored comments)                    | Review posted; you decide                                                   | **Human**      |
| 6b  | Apply review feedback (optional) | `poll-clickup-apply-review.yml` → `agent-implement.yml` (`MODE=apply-review`) | `in review` → `in progress` → (via stage 5's reactor) `ready for review` | Same branch, review-comment-driven push (or a no-op if nothing was actionable) | Same as stage 3+4's self-check, then stage 5's e2e gate again | CI + **Human** |
| 7   | Merge             | **Not built yet**                                           | `in review` → `ready for deploy` → `complete`| —                                                            | —                                                                             | —              |

**Note on stage 6b:** Two ways to address review feedback, same human/AI choice pattern as
every other stage — no new status either way. A human can just push a fixed commit to
`poc/<ticket_id>` directly (the stage 5 reactor already reacts to any push on a ticket
branch regardless of who made it). Or they re-add `for-ai` while the ticket sits at
`in review`, and `agent-implement.yml` runs again in `apply-review` mode: same workflow,
a different prompt (`prompts/apply-review.md`), fetching the PR's actual review comments
fresh from GitHub rather than through the dispatch payload — agnostic to whether the
comments came from `agent-review.yml` or a human reviewing directly on GitHub. `in
progress` is reused as the transient state either way, which is why stage 5's reactor
needed no changes to also close this loop.

**Note on stage 3+4:** `propose.md` still writes `tasks.md` with task 1 as
the failing Playwright spec, ordered first, same as always — but
`agent-implement.yml` no longer commits it as a separate, isolated red
commit before continuing. Everything (spec + implementation) goes out in
one push. A deliberate simplification, not an oversight — CI never sees an
intermediate red run on this branch, only the final state.

### Stage 3 lane difference

- **Bug** — red for the symptom the ticket describes
- **Feature** — red because the behaviour does not exist yet

Both lanes: the failing spec is written before the fix, in the same task
ordering as always. A test that was never red proves nothing, which is
what makes stage 5 mean something.

### Stage 5 contents

`poc-e2e.yml`, triggered on every push to a `poc/<ticket_id>` branch:

- lint, typecheck, build (handled separately, by stage 3+4's own
  self-check — not part of this CI run)
- the entire Playwright suite — new spec plus every spec from every
  previous run

No separate regression gate. The accumulated suite _is_ the regression
run. Two outcomes, classified by `agent-react-to-e2e.yml` when it reacts
to a red result and decides what context to hand back for a retry:

- new test red → agent did not do the task
- new test green, older tests red → collateral breakage

A failure with no evident connection to the ticket's own changed files
(a pre-existing flake) isn't distinguished from either case today —
flaky-test triage is its own discipline, out of scope for now.

---

## Mechanism — what actually runs this

**Not MCP-driven.** The original plan here was Claude Code sessions using
ClickUp MCP, GitHub MCP, Playwright MCP, and Nx MCP interactively. What got
built instead, deliberately, across every agent workflow: plain `curl`
against the ClickUp REST API and the `gh` CLI against GitHub, run as
ordinary deterministic bash inside GitHub Actions — Claude never holds a
ClickUp or GitHub credential, and never touches either directly. Claude's
own role is scoped tightly per agent via `--allowed-tools`, run headless
(`claude -p`, no interactive session) with a fixed, explicit prompt file
under `prompts/`. What each agent's Claude invocation is actually allowed
to do:

| Agent               | `--allowed-tools`                                                          | Notably absent                          |
| ------------------- | ---------------------------------------------------------------------------- | ---------------------------------------- |
| `agent-intake.yml`    | `Read,Write` (isolated scratch dir, not the repo)                          | Bash, network, the repo itself           |
| `agent-propose.yml`   | `Read,Write,Edit,Glob,Grep,Bash(openspec:*)`                               | git, any other Bash                     |
| `agent-implement.yml` | `Read,Write,Edit,Glob,Grep,Bash(openspec:*)`                               | git, test/build commands, Plan Mode      |
| `agent-review.yml`    | `Read,Grep,Glob,Skill,Task,Bash(git diff/log/show:*)`                      | Write, Edit, any GitHub/ClickUp access  |

Every commit, push, PR operation, and ClickUp write happens in the
workflow's own bash, after Claude exits — a human-auditable script sits
between "Claude decided X" and "GitHub/ClickUp actually got written to,"
always.

**The `for-ai` tag** is the human opt-in gate, checked fresh by every
poller before it dispatches, and consumed (removed) by every agent the
moment its own dispatch lock succeeds. One tag, but single-use per stage —
tagging a ticket doesn't authorize the whole pipeline end-to-end, only the
next stage that's about to check for it. A human re-adds it deliberately
whenever they want the *next* stage to also run automatically; leaving it
off means a ticket just sits at its current status for a human to work by
hand. `agent-react-to-e2e.yml` is the one exception — it doesn't check
`for-ai` at all, because reacting to an e2e result isn't a new gate, it's
the automatic continuation of whatever implement run already got
authorized and pushed.

**Failure tags:** `needs-human` (generic — any agent's own catch-all, on
any unexpected failure) and `implement-blocked` (stage-3+4-specific —
set when `agent-implement.yml` stops rather than guess; also reverts
status to `ready for dev`, and is what keeps the poller from immediately
re-dispatching into the same blocker).

**Live ClickUp status chain** (confirmed against the actual list, not
assumed):

```
to do → in spec → ready for spec → spec proposed → ready for dev →
in progress → ready for review → in review → ready for deploy → complete
```

**OpenSpec CLI** — still load-bearing, unchanged from the original plan:
`agent-propose.yml` runs `openspec validate --strict`; every agent that
needs a change's artifacts resolves it via `openspec/changes/*` directly
(a plain directory listing, not the CLI) rather than installing the CLI
in workflows that never run it.

---

## Status

### Step 0 — target operating model

Done. Stages, gates, run-log schema, deferred decisions with triggers.

### Step 1 — substrate

| Item                                                                        | Status                          |
| --------------------------------------------------------------------------- | ------------------------------- |
| Fork prepared, 70 upstream workflows parked in `.github/workflows-upstream` | Done                            |
| Baseline SHA recorded                                                       | Done                            |
| Gauzy running locally (API + static bundle, sqlite)                         | Done                            |
| `apps/poc-e2e` Nx project, one hand-written login test                      | Done                            |
| First `data-testid`s in Angular source                                      | Done                            |
| CI workflow, test green in Actions (34 min, 24 of it install)               | Done — **Step 1 exit gate met** |
| ClickUp workspace, statuses mirroring client flow                           | Done                            |
| Bug task type + Source custom field                                         | Done                            |
| DoR templates in `docs/poc/templates/`                                      | Done                            |
| `CLAUDE.md` seeded                                                          | Done                            |
| `openspec init`                                                             | Done                            |
| ClickUp + GitHub MCPs verified in Claude Code                               | **N/A — superseded.** Pipeline automation deliberately never uses MCP; see [Mechanism](#mechanism-what-actually-runs-this). |

### Step 2 — walking skeleton

Superseded by building full automation directly (stages 1–6b) rather than
one manual, by-hand walkthrough. Ticket `869f5qg9d` (a real,
replayed-closed bug — task creation not assigning the creating employee)
is the live end-to-end exercise instead: intake, spec, implement, and e2e
verification done (including one real retry cycle after a self-check OOM
was found and fixed); a real AI review has now posted (raised a missing
unit-test-coverage concern and flagged the run's own unchecked
verification tasks); stage 6b (apply review feedback) is built but not
yet exercised on this ticket; stage 7 not built.

---

## Known, deferred, with triggers

| Item                                                                                                                                                                    | Status / trigger to revisit                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| CI bring-up: 24 of 34 min is dependency install. `node_modules` is 11.9 GB / 985k files, so the Actions cache (10 GB limit) is not viable as a raw directory. | **Partially addressed.** `agent-implement.yml` and `poc-e2e.yml` share one compressed archive via Actions cache (compression brings it under the 10 GB cap on a hit). A cache miss is still a full 1–3h bootstrap — unresolved. |
| `nx affected` / changed-path gating                                                                                                                                     | **Partially done, narrower than originally scoped.** `agent-implement.yml`'s self-check resolves only the project(s) directly containing the ticket's own changed files, not `nx affected`'s full dependent graph — found necessary after a real run touching `packages/core` computed 74 affected projects and OOM'd a standard runner. Changed-path gating for `poc-e2e.yml` itself is still open. |
| Speed-tiered pipeline                                                                                                                                                   | PR run > ~10 min _and_ being routed around                                                                     |
| Postgres instead of sqlite                                                                                                                                              | Step 3 surfaces migration/transaction/concurrency bugs                                                         |
| Step 3 corpus: replayed-closed vs open issues                                                                                                                           | Before building the corpus. Forked from current `develop`, so most closed issues are already fixed in the tree |
| ClickUp status ↔ pipeline stage mapping                                                                                                                                 | **Done** — live chain confirmed and recorded above; `ready for review` added this round specifically to give stage 5 a landing status distinct from `in review`. |

---

## Run log — fill one row per run

`run_id` · `date` · `ticket_id` · `lane` · `source` · `stage_reached` ·
`outcome` · `failing_gate` · `failure_cause` · `human_minutes` ·
`wall_clock_minutes` · `ci_minutes` · `bringup_minutes` · `rework_loops` ·
`flake` · `correctness`

Manual: `human_minutes`, `failure_cause` (cause not symptom),
`correctness` (n/a unless replaying a closed issue). Everything else is
derivable from Actions and ClickUp.
