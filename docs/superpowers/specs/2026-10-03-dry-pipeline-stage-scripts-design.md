# DRY pipeline stage scripts — design

## Problem

Each `agent-*.yml` workflow embeds its entire stage logic — ClickUp REST
calls, OpenSpec change resolution, the `claude -p` invocation, result
posting, failure tagging — as inline bash in `run:` blocks. That logic
can't be exercised outside a GitHub Actions runner. A human who checks
out a ticket's branch locally (the intended fallback when `for-ai` is
left off) has no way to run "what this stage would do" short of hand-
reconstructing the bash from the YAML. Any future second entry point
(a Claude Code command, say) would duplicate this logic and drift from
it over time — the opposite of what we want.

## Goal

One script per pipeline stage is the single source of truth for that
stage's behavior. GitHub Actions and a local Claude Code session become
two thin launchers calling the same script with the same side effects —
full parity, no dry-run mode. A human-triggered run mutates ClickUp/
GitHub exactly as a CI-triggered run would.

## Scope

- **In scope:** the six `agent-*.yml` workflows — intake, propose,
  implement, review, merge, react-to-e2e.
- **Out of scope:** the `poll-clickup-*.yml` pollers. Their job is
  "find eligible tickets to dispatch," not something a human runs
  against one ticket — they stay GH-Actions-only, unchanged.
- **Pilot:** `agent-intake.yml`, ported first; the rest follow once the
  pattern is validated once.

## Architecture

Each stage becomes one Node script, `scripts/stages/<stage>.mjs`,
taking a ticket id (and a mode flag where a workflow already has dual
use, e.g. `agent-implement.yml`'s `MODE=apply-review`) as its argument.
The script does everything the workflow's `run:` steps currently do for
that stage's core logic:

- ClickUp reads/writes, via small helpers in `scripts/lib/clickup.mjs`
- OpenSpec change resolution, via `scripts/lib/openspec.mjs`
- Spawning `claude -p` as a subprocess, with the same
  `--allowed-tools`/model/output-format it uses today
- Posting results (`gh pr review`, ClickUp comments)
- Failure-tag handling

What stays **outside** the script, per environment:

- **GH Actions:** checkout, Node/CLI install, workspace trust, and the
  workflow-level `concurrency:` guard (a GH Actions primitive, not
  business logic — the ClickUp-side dispatch lock itself moves into the
  script).
- **Local:** the human has already checked out the right branch and
  has the CLI installed. Invocation is a thin `.claude/commands/<stage>.md`
  slash command whose body is "run `node scripts/stages/<stage>.mjs
  <ticket_id>`" — or the human runs that line directly from a terminal;
  no Claude Code session is actually required to trigger it.

Run-record emission (the dashboard artifact) stays conditional on
`process.env.GITHUB_ACTIONS` — it's tied to a run URL and artifact
upload that don't exist for a local invocation. Local runs skip it
rather than emit a record with no meaningful run URL.

## What does NOT change in this round

- Subagent definitions (`.claude/agents/*.md` replacing `--allowed-tools`
  flags) — discussed separately, independently useful, not required for
  this refactor. Can layer in after, stage by stage, once this lands.
- The dispatch-lock *design* (`for-ai` tag semantics, status
  transitions) — unchanged, only relocated from YAML bash into the
  script.
- Application code, Playwright specs, or Nx project config — this is
  pipeline-orchestration-only.

## Testing strategy

No live app or Playwright run is needed — this touches orchestration
code, not application behavior. Verification per stage: the script
runs against a real ticket and produces the same ClickUp/GitHub side
effects the current workflow produces, and the ported `agent-*.yml`
still passes when actually triggered. `agent-implement.yml`'s
self-check and `poc-e2e.yml` are untouched — only the orchestration
code that invokes/reacts to them moves.

## Risks / open items carried into the plan

- `agent-react-to-e2e.yml` doesn't check `for-ai` (continuation, not a
  new gate) — its script must preserve that exception explicitly.
- `agent-implement.yml`'s two modes share one workflow today — the
  script keeps that branching rather than splitting into two scripts
  that could drift apart.
- Locally, `CLICKUP_API_TOKEN` must be in the human's shell env for the
  script's ClickUp calls to work (same variable name GH Actions secrets
  use already) — one-time local setup, not part of this change's code.

## Delivery

- Branch: `infra/agent-stage-scripts` (off `develop`); opens as a PR
  against `develop` when done.
- Plan granularity: one task per stage port (6 tasks), each ending in
  its own commit. Beyond hygiene, this is what makes a mid-plan
  interruption cleanly resumable: git state plus the plan file's
  checkboxes tell any resumed session — this one or a fresh one —
  exactly which stages are done, without depending on conversation
  memory surviving the gap.
