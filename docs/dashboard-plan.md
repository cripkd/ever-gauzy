# Observability: structured run records + a cost/timeline dashboard

**Status: parked.** Designed but not started — revisit and re-approve before building
any of it. Not reflected in `docs/poc/pipeline-reference.md` yet; do that once this is
actually underway.

## Context

The pipeline (intake → propose → implement → e2e → review → apply-review) now has real
stage coverage, but "what happened, when, why, who triggered it, what did it cost" is
currently answerable only by manually stitching together GitHub Actions run history,
ClickUp comments, and commit messages by hand — three systems, no shared key, no cost
data at all. The ask: harden this with a real run identifier, a spec identifier, explicit
run-to-run relationships, chronological ordering, and AI cost tracking — read-only for
now (aggregate + audit), with an eye toward later actionable controls (stop, replay) the
user explicitly isn't asking for yet.

Two phases, doable independently but B depends on A's output:

- **Phase A — instrumentation.** Every agent workflow already has almost everything
  needed implicitly (a GitHub Actions `run_id`, a ticket ID, an OpenSpec change name, a
  Claude invocation). This phase makes it explicit: emit one structured JSON record per
  agent run, and capture the one genuinely missing piece — Claude's own cost/token/session
  data, free from `claude -p --output-format json` (verified locally against a real
  invocation: gives `session_id`, `total_cost_usd`, per-token `usage`, `num_turns`,
  `duration_ms`, and — crucially — a `.result` field containing the exact same text every
  agent already greps `RESULT:`/`TASKS:` out of today, so the existing output contract
  doesn't change, only where it's read from).
- **Phase B — the dashboard.** A published Artifact with a real database, ingesting those
  records. Chosen (over a static committed page or ClickUp-only) specifically because it's
  the one option with a real growth path toward the actionable controls mentioned as a
  later goal.

## Phase A — instrumentation

### A1. Shared record-assembly script: `.github/scripts/record-run.mjs`

Same pattern this repo already uses for `.github/scripts/markdown-to-clickup-comment.mjs`
— one small shared script rather than duplicating the same JSON-assembly logic across 5
workflow files. Takes every field as an env var (empty string where a given workflow has
nothing to report — e.g. `agent-react-to-e2e.yml` never invokes Claude, so its Claude
fields are blank), writes one JSON object to a fixed path (`run-record.json`). Schema:

```jsonc
{
  "run_id": "<github.run_id>-<github.run_attempt>",   // globally unique, already exists
  "run_url": "...",
  "workflow": "agent-implement",                        // which file
  "event_type": "clickup-implement",                    // or clickup-apply-review, etc.
  "ticket_id": "869f5qg9d",
  "spec_id": "task-assignment",                          // OpenSpec change name, blank if N/A
  "mode": "apply-review",                                // implement.yml only; else blank
  "caused_by_run_id": "...",                             // the dispatching run's id, if any
  "triggered_by": "poller" | "reactor" | "manual",
  "started_at": "...", "finished_at": "...",
  "outcome": "implemented" | "blocked" | "reviewed" | "failed" | ...,
  "clickup_status_before": "ready for dev", "clickup_status_after": "in progress",
  "claude": {                                            // null when no Claude call this run
    "session_id", "model", "cost_usd", "input_tokens", "output_tokens",
    "cache_read_tokens", "cache_creation_tokens", "num_turns", "duration_ms"
  }
}
```

### A2. Claude invocation: add `--output-format json`, applied identically in all 4
Claude-invoking agents (`agent-intake.yml`, `agent-propose.yml`, `agent-implement.yml`,
`agent-review.yml`)

Pattern (describe once, apply verbatim at each of the 4 sites):
```bash
claude -p "$prompt" --model "$model" --output-format json \
  --allowed-tools "..." > "$output_file" 2>&1 || claude_exit=$?
# claude_exit handling UNCHANGED — a crash still means $output_file may not be valid
# JSON, and the existing check already exits before anything below ever reads it.

jq -r '.result' "$output_file" > "${RUNNER_TEMP}/claude-result.txt"
echo "--- Claude's final result ---"
cat "${RUNNER_TEMP}/claude-result.txt"   # keeps a human-readable summary in the Actions
                                          # log; the moment-to-moment tool-call narration
                                          # --output-format text streamed is genuinely
                                          # lost by this switch — accepted trade-off, not
                                          # silently dropped: the final result text is
                                          # what every existing failure-reason.txt/tail
                                          # snippet already relies on, not the narration.

jq -c '{session_id, model: .modelUsage | keys | last, cost_usd: .total_cost_usd,
        input_tokens: .usage.input_tokens, output_tokens: .usage.output_tokens,
        cache_read_tokens: .usage.cache_read_input_tokens,
        cache_creation_tokens: .usage.cache_creation_input_tokens,
        num_turns, duration_ms}' "$output_file" > "${RUNNER_TEMP}/claude-usage.json"
```
Every existing `grep -m1 '^RESULT:' "$output_file"`-style line then simply targets
`${RUNNER_TEMP}/claude-result.txt` instead of the raw (now-JSON) `$output_file` —
one-line change at each of the ~6 existing grep sites (agent-implement.yml has 2,
agent-review.yml's body-extraction `grep -v` also moves to this file). No other parsing
logic changes.

### A3. `caused_by_run_id` + `triggered_by`: one-line addition to all 6 dispatch payloads

`poll-clickup-intake.yml`, `poll-clickup-propose.yml`, `poll-clickup-implement.yml`,
`poll-clickup-review.yml`, `poll-clickup-apply-review.yml` (all identical
`jq -n --arg ticket_id ... '{event_type: ..., client_payload: {ticket_id: $ticket_id}}'`
today — confirmed by direct grep) each gain two more fields in that same `client_payload`
object:
```
caused_by_run_id: "${{ github.run_id }}-${{ github.run_attempt }}", triggered_by: "poller"
```
`agent-react-to-e2e.yml`'s retry dispatch gets the same two fields, `triggered_by:
"reactor"`. Receiving agents read `github.event.client_payload.caused_by_run_id` /
`.triggered_by` (falling back to `"manual"` when absent — a `workflow_dispatch` run)
straight into their own record — no new logic beyond a field read.

### A4. Emit the record: one new step per agent workflow, `if: always()`

Added as the last step in each of `agent-intake.yml`, `agent-propose.yml`,
`agent-implement.yml`, `agent-review.yml`, `agent-react-to-e2e.yml`. `if: always()` (not
gated on prior success) so a failed run still produces a record — that's exactly the kind
of event an audit trail exists to show. Runs `record-run.mjs` with whatever env vars this
workflow has available (blank for the rest), then `actions/upload-artifact@v4`, name
`run-record-${{ github.run_id }}-${{ github.run_attempt }}` (unique per run, same
uniqueness reasoning as the record's own `run_id`), retention 90 days — same
`actions/upload-artifact` mechanism `poc-e2e.yml` already uses for e2e artifacts, just a
longer retention since this is the durable side, not a debugging-only side channel.

### A5. `clickup_status_before`/`after`

No new API calls — every agent already knows both literally: "before" is whatever status
its own poller's filter just matched (a fixed string per workflow), "after" is whatever
each outcome branch already PUTs (also already a fixed string per branch). Just also
assign each to a shell var that flows into the record-run call at the end.

## Phase B — the dashboard (published Artifact, database-backed)

### Ingestion — on-demand, not scheduled (for now)

A scheduled/always-fresh version needs a recurring Claude session polling on a timer —
real recurring cost and complexity for a "read-only, not actionable yet" POC tool.
Starting on-demand instead: when asked to refresh, walk each of the 5 record-emitting
workflows via `gh run list --workflow <file> --json databaseId,conclusion,...`, compare
against a small cursor document (`collection: meta, doc_id: ingest-cursor` — last-seen
`run_id` per workflow) already in the dashboard's own db, `gh run download <id> --name
run-record-<id>` for anything newer, and `write_db` (batched, `collection: runs`, `doc_id:
run_id`) each new record, updating the cursor last. Promoting this to a scheduled loop
later (`ScheduleWakeup`/`CronCreate`) is a small, separate follow-up once the on-demand
version is actually useful — not built now.

Rejected alternative, worth naming: having the dashboard's own client-side JS fetch
directly from GitHub/ClickUp APIs on load. Rejected because that needs real API
credentials (a GitHub token, the ClickUp token) embedded in client-side code the page
serves to any viewer — not safe for a page that starts private but is shareable. The
ingest-via-me path never exposes a credential to the page at all.

### Views

- **Recent runs** (landing view): flat, newest-first table — run, workflow/stage, ticket,
  outcome, cost, duration, links to the GitHub run and the ClickUp task.
- **Per-ticket timeline**: `runs` grouped by `ticket_id`, ordered by `started_at`, showing
  the full chain (intake → propose → implement → e2e retries → review → apply-review →
  …) via `caused_by_run_id` — this is the concrete answer to "what ran, when, why,
  related to what."
- **Cost rollup**: sum of `claude.cost_usd`, grouped by `ticket_id` and grand total —
  the concrete answer to "track costs with AI."

Read-only: no write-capable UI (no stop/replay controls) — matches what was asked for.
Load the `artifact-capabilities` skill before writing it (required for any page declaring
a `db` capability) — a build-time step, not a planning decision.

## Files touched

- New: `.github/scripts/record-run.mjs`
- Modified (Phase A2 + A4, same pattern each time): `agent-intake.yml`,
  `agent-propose.yml`, `agent-implement.yml`, `agent-review.yml`,
  `agent-react-to-e2e.yml`
- Modified (Phase A3, one-line addition each): `poll-clickup-intake.yml`,
  `poll-clickup-propose.yml`, `poll-clickup-implement.yml`, `poll-clickup-review.yml`,
  `poll-clickup-apply-review.yml`
- New: the dashboard Artifact (published once Phase A has produced at least one real
  record to ingest)
- `docs/poc/pipeline-reference.md`: new section describing the record schema and where
  the dashboard lives, once published

## Verification

- `actionlint` + `shellcheck` on every touched workflow file (same as every prior change
  this session).
- Before touching any real agent file: dry-run the exact `jq -r '.result'` /
  `jq -c '{...}'` extraction against a real sample invocation (already done once during
  design — a fresh `claude -p ... --output-format json` call locally, piped through the
  same `jq` expressions above); re-confirm against the extraction exactly as it will
  appear in the shared script.
- Roll out to one agent first (`agent-review.yml` — cheapest/fastest to re-trigger) before
  applying the identical change to the other three, specifically because this touches the
  live `RESULT:` parsing contract every agent's success/failure branching depends on — a
  mistake here breaks more than observability.
- End-to-end: exercise `agent-review.yml` for real (e.g. the still-pending apply-review
  retry on `869f5qg9d`), confirm a `run-record-*` artifact appears with real cost/session
  data, then ingest it into a freshly published dashboard and confirm the numbers match
  what the run actually cost.
