# POC pipeline — stages, gates, tools, status

One page. Stage definitions are fixed in Step 0; status changes as runs
happen.

---

## The seven stages

Same seven for both lanes. Bugs and features differ only in the wording
of the stage 3 gate.

| #   | Stage        | Who                      | Artifact out                             | Exit gate                                                         | Decided by     | Tools needed                             |
| --- | ------------ | ------------------------ | ---------------------------------------- | ----------------------------------------------------------------- | -------------- | ---------------------------------------- |
| 1   | Intake       | Agent drafts, you decide | Ticket meeting DoR, priority set         | DoR checklist complete, priority approved                         | **Human**      | ClickUp MCP                              |
| 2   | Spec         | Agent                    | OpenSpec change (delta + tasks)          | `openspec validate --strict` green, then you approve the proposal | CI + **Human** | OpenSpec CLI                             |
| 3   | Failing test | Agent                    | Committed `.spec.ts`, no production code | Test red at this commit, for the stated reason                    | CI             | Playwright MCP (optional, for exploring) |
| 4   | Implement    | Agent                    | Branch, code, `data-testid`s             | Lint, typecheck, build pass                                       | CI             | —                                        |
| 5   | Verify       | Agent                    | PR with run evidence                     | Whole suite green on the PR merge commit                          | CI             | GitHub MCP                               |
| 6   | Review       | AI reviewer, then you    | Comments, approval                       | Your approval                                                     | **Human**      | GitHub MCP                               |
| 7   | Merge        | Agent                    | Merged PR, archived OpenSpec change      | `openspec validate --archived`, smoke run on main                 | CI             | GitHub MCP                               |

### Stage 3 lane difference

- **Bug** — red for the symptom the ticket describes
- **Feature** — red because the behaviour does not exist yet

Both lanes: test committed before any production code. A test that was
never red proves nothing, which is what makes stage 5 mean something.

### Stage 5 contents

One CI run on the PR merge commit:

- lint, typecheck, build (changed paths)
- unit / integration for touched code
- the entire Playwright suite — new spec plus every spec from every
  previous run

No separate regression gate. The accumulated suite _is_ the regression
run. Two outcomes reported separately in the log:

- new test red → agent did not do the task
- new test green, older tests red → collateral breakage

---

## Tools — what each is actually for

| Tool           | Where it runs | Needed for                                    | Load-bearing?                           |
| -------------- | ------------- | --------------------------------------------- | --------------------------------------- |
| ClickUp MCP    | Claude Code   | Reading/writing tickets, stages 1–2           | Yes                                     |
| GitHub MCP     | Claude Code   | PR creation, reading Actions runs, stages 5–7 | Yes                                     |
| Playwright MCP | Claude Code   | Driving a live browser while authoring a test | No — gate runs committed specs via `nx` |
| Nx MCP         | Claude Code   | Project graph, "what does this change affect" | No — matters from Step 3                |
| OpenSpec       | CLI in repo   | Stage 2 and 7 validation                      | Yes                                     |

MCPs for Claude Code are configured from the terminal, not the desktop
app: `claude mcp add --transport http --scope project <name> <url>`.
`--scope project` writes `.mcp.json` into the repo so the config is
versioned. `/mcp` inside a session shows status.

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
| `openspec init`                                                             | Open                            |
| ClickUp + GitHub MCPs verified in Claude Code                               | Open                            |

### Step 2 — walking skeleton

Not started. One trivial change through all seven stages, each invoked
by hand. Once as a feature, once as a synthetic bug.

---

## Known, deferred, with triggers

| Item                                                                                                                                                                    | Trigger to revisit                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| CI bring-up: 24 of 34 min is dependency install. `node_modules` is 11.9 GB / 985k files, so the Actions cache (10 GB limit) is not viable. Prebuilt image is the lever. | Step 4 — it is measured and annoying                                                                           |
| Speed-tiered pipeline                                                                                                                                                   | PR run > ~10 min _and_ being routed around                                                                     |
| `nx affected` / changed-path gating                                                                                                                                     | No upstream implementation to copy; build when the suite is big enough to matter                               |
| Postgres instead of sqlite                                                                                                                                              | Step 3 surfaces migration/transaction/concurrency bugs                                                         |
| Step 3 corpus: replayed-closed vs open issues                                                                                                                           | Before building the corpus. Forked from current `develop`, so most closed issues are already fixed in the tree |
| ClickUp status ↔ pipeline stage mapping (`qa` sits before `in review` in ClickUp; CI verify is stage 5 and review is stage 6)                                           | Before Step 2 run 1, or `stage_reached` won't line up                                                          |

---

## Run log — fill one row per run

`run_id` · `date` · `ticket_id` · `lane` · `source` · `stage_reached` ·
`outcome` · `failing_gate` · `failure_cause` · `human_minutes` ·
`wall_clock_minutes` · `ci_minutes` · `bringup_minutes` · `rework_loops` ·
`flake` · `correctness`

Manual: `human_minutes`, `failure_cause` (cause not symptom),
`correctness` (n/a unless replaying a closed issue). Everything else is
derivable from Actions and ClickUp.
