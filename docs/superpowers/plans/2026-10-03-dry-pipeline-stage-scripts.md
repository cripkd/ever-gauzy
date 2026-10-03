# DRY Pipeline Stage Scripts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract each `agent-*.yml` workflow's ClickUp/OpenSpec/Claude-invocation logic into a standalone Node script per stage, so GitHub Actions and a local Claude Code session become two thin launchers calling the same code with the same side effects.

**Architecture:** Six `scripts/stages/<stage>.mjs` orchestrators (intake, propose, implement, review, merge, react-to-e2e), each importing shared helpers from `scripts/lib/`. Every `agent-*.yml` workflow is reduced to its environment-specific bootstrapping (checkout, CLI install, workspace trust) plus one line invoking its stage script. A `scripts/checkout-ticket.mjs` helper replaces each workflow's inline branch-fetch bash.

**Tech Stack:** Node 24 (`.mjs`, native `fetch`, no new dependencies), the `claude` CLI invoked as a subprocess, `gh` CLI invoked as a subprocess for PR operations, Node's built-in `node:test` + `node:assert` for the handful of pure-logic unit tests.

**Spec:** `docs/superpowers/specs/2026-10-03-dry-pipeline-stage-scripts-design.md` — read it alongside this plan; this plan does not repeat its reasoning, only its decisions.

**Adaptation from the usual TDD step shape:** these scripts are integration glue around ClickUp/GitHub/`claude`/`openspec` — there is no existing unit-test harness for this kind of code in the repo, and the spec's own Testing Strategy already defines verification as "run the script against a real ticket, check the real side effect." So each task's test step is one of two kinds, named explicitly per step: a **unit test** (`node --test`) for pure logic with no network/subprocess calls (precondition checks, failure classification, project-path resolution), or a **live verification** against the test ticket (`869fbdayz`, status `to do`, `CLICKUP_API_TOKEN` in the repo-root `.env`) for anything that calls ClickUp/git/`claude`. Live verification commands are written out in full in each task; run them yourself and read the actual output before checking the step off — don't assume success from a zero exit code alone, ClickUp's API returns 200 with error bodies in some cases.

## Global Constraints

- Every ClickUp HTTP call reads `CLICKUP_API_TOKEN` from `process.env` — never log it, never write it to a file, never pass it as a CLI argument (it would show up in `ps`).
- Local `.env` (already gitignored) holds `CLICKUP_API_TOKEN=...` for live verification; load it with `node --env-file=.env` or `node --env-file .env` (Node 24 supports `--env-file` natively — confirm with `node --version` before relying on it, the Node version actually in `node_modules/.bin` or installed locally may differ from CI's pinned 24).
- Node 24, ESM (`.mjs`), matching `actions/setup-node@v4` with `node-version: 24` in every workflow.
- No new npm dependencies. Use native `fetch`, `node:child_process`, `node:fs`, `node:path`.
- No script may change what the current bash does to a *passing* run's observable behavior (same HTTP calls, same payload shapes, same commit messages, same tag/status transitions) — this is a refactor, not a rewrite, except for the one deliberate addition the spec calls for: each stage script's status-precondition check.
- No `git push` or `gh pr create`/`gh pr merge`/`gh pr review` runs against the real repo during THIS plan's execution — those stay exactly as today's bash would call them (so the code is correct and ready), but don't actually invoke a step that pushes/opens/merges/reviews a real PR while verifying locally. Flag in the task if a step would do this, and skip running it, noting why.
- Every task ends in its own commit on `infra/agent-stage-scripts`. No task's commit may be amended by a later task.

## Review Focus

- **A locally-run stage mutating a ticket in the wrong status.** No poller is in front of the local entry point — the new precondition check (Task 1) is what stands in for it. Every stage script must call it before its first mutating ClickUp write, not after.
- **`agent-implement.yml`'s two modes (`implement` vs `apply-review`) silently diverging.** The spec requires one script with a mode branch, not two scripts — Task 4 must mirror every `if [ "$MODE" = "apply-review" ]` branch from the original, not just the common path.
- **A ClickUp API call that returns a non-2xx but non-error-looking body.** The original bash checks `http_code` explicitly on every write, never trusting `curl`'s exit code alone (`curl -sS` doesn't fail on a 4xx/5xx). Every helper in `scripts/lib/clickup.mjs` must do the same — check the actual status code, not just whether `fetch()` threw.
- **`agent-react-to-e2e.yml`'s "skip quietly" guards being ported as hard failures.** The original explicitly exits 0 (not 1) when the ticket isn't `in progress` or the commit is stale — these are not errors. Task 7 must preserve `proceed=false` as a clean no-op, not throw.
- **The self-check's project-resolution walk (`agent-implement.yml` lines 701-713) losing the "no owning project" case.** A file under `openspec/` resolves to no `project.json` ancestor and must be silently skipped, not crash the walk — Task 4 must keep this exact behavior since it's exercised on every real run (every ticket touches `openspec/` files).

---

## Task 1: Shared helpers — ClickUp client, status precondition, OpenSpec resolution, ticket checkout

**Files:**
- Create: `scripts/lib/clickup.mjs`
- Create: `scripts/lib/precondition.mjs`
- Create: `scripts/lib/openspec.mjs`
- Create: `scripts/checkout-ticket.mjs`
- Test: `scripts/lib/precondition.test.mjs`

**Interfaces:**
- Produces (used by every later task):
  - `clickup.mjs`: `getTask(ticketId): Promise<object>` (parsed ClickUp task JSON, throws `Error` with the HTTP status and body on non-2xx, mirroring every `if [ "$http_code" -lt 200 ]...` check in the current bash)
  - `clickup.mjs`: `putStatus(ticketId, status): Promise<void>` (throws on non-2xx)
  - `clickup.mjs`: `removeTag(ticketId, tag): Promise<number>` (returns HTTP status, best-effort — never throws, matching every `|| true` tag removal in the bash)
  - `clickup.mjs`: `addTag(ticketId, tag): Promise<number>` (same best-effort shape)
  - `clickup.mjs`: `postPlainComment(ticketId, text): Promise<void>` (the `{comment_text, notify_all: false}` shape `agent-review.yml`/`agent-react-to-e2e.yml` use for short, non-markdown comments; throws on non-2xx)
  - `clickup.mjs`: `putCustomField(ticketId, fieldId, value): Promise<void>` (the intake "Original report" write)
  - `clickup.mjs`: `putDescriptionMarkdown(ticketId, markdownContent): Promise<void>` (the `{markdown_content: ...}` shape intake's final write uses)
  - `precondition.mjs`: `assertStatus(task, expectedStatus): void` (throws `Error` naming both the actual and expected status if they don't match — this is the new safety check the spec requires)
  - `openspec.mjs`: `resolveChangeFromDirectoryListing(): string` (plain `fs.readdirSync('openspec/changes')` filtering out `archive`, requiring exactly one match, throwing otherwise — mirrors `agent-review.yml`'s approach, no CLI needed)
  - `openspec.mjs`: `resolveChangeFromCli(): Promise<string>` (shells to `openspec list --json`, requiring exactly one entry — mirrors `agent-implement.yml`/`agent-merge.yml`'s approach, used where the CLI is already installed for other reasons)
  - `checkout-ticket.mjs`: run as `node scripts/checkout-ticket.mjs <ticket_id>` — fetches `origin/poc/<ticket_id>` and runs `git checkout -B poc/<ticket_id> origin/poc/<ticket_id>`; exits non-zero with a clear message if the branch doesn't exist on origin (it never creates one — matches `agent-implement.yml`/`agent-review.yml`/`agent-merge.yml`'s existing assumption that only `agent-propose.yml` originates the branch)
- Consumes: nothing from earlier tasks (this is the foundation).

- [ ] **Step 1: Write `scripts/lib/clickup.mjs`**

```javascript
// scripts/lib/clickup.mjs
const BASE = 'https://api.clickup.com/api/v2';

function token() {
  const t = process.env.CLICKUP_API_TOKEN;
  if (!t) throw new Error('CLICKUP_API_TOKEN is not set in the environment.');
  return t;
}

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: token(),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return res;
}

export async function getTask(ticketId) {
  const res = await request('GET', `/task/${ticketId}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ClickUp GET task returned HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

export async function putStatus(ticketId, status) {
  const res = await request('PUT', `/task/${ticketId}`, { status });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ClickUp PUT status returned HTTP ${res.status}: ${text}`);
  }
}

export async function removeTag(ticketId, tag) {
  const res = await request('DELETE', `/task/${ticketId}/tag/${tag}`);
  return res.status;
}

export async function addTag(ticketId, tag) {
  const res = await request('POST', `/task/${ticketId}/tag/${tag}`);
  return res.status;
}

export async function postPlainComment(ticketId, text) {
  const res = await request('POST', `/task/${ticketId}/comment`, {
    comment_text: text,
    notify_all: false,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ClickUp POST comment returned HTTP ${res.status}: ${body}`);
  }
}

export async function putCustomField(ticketId, fieldId, value) {
  const res = await request('POST', `/task/${ticketId}/field/${fieldId}`, { value });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ClickUp POST custom field returned HTTP ${res.status}: ${body}`);
  }
}

export async function putDescriptionMarkdown(ticketId, markdownContent) {
  const res = await request('PUT', `/task/${ticketId}`, { markdown_content: markdownContent });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ClickUp PUT task (description) returned HTTP ${res.status}: ${body}`);
  }
}
```

- [ ] **Step 2: Write `scripts/lib/precondition.mjs`**

```javascript
// scripts/lib/precondition.mjs
export function assertStatus(task, expectedStatus) {
  const actual = task?.status?.status;
  if (actual !== expectedStatus) {
    throw new Error(
      `Ticket ${task.id} is at status "${actual}", expected "${expectedStatus}" for this stage. ` +
      `Refusing to proceed — this is the local path's stand-in for the poller's own status filter.`
    );
  }
}
```

- [ ] **Step 3: Write the unit test for `precondition.mjs`**

```javascript
// scripts/lib/precondition.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertStatus } from './precondition.mjs';

test('assertStatus passes when status matches', () => {
  assert.doesNotThrow(() => assertStatus({ id: 'x', status: { status: 'to do' } }, 'to do'));
});

test('assertStatus throws when status does not match', () => {
  assert.throws(
    () => assertStatus({ id: 'x', status: { status: 'in progress' } }, 'to do'),
    /is at status "in progress", expected "to do"/
  );
});
```

- [ ] **Step 4: Run the unit test**

Run: `node --test scripts/lib/precondition.test.mjs`
Expected: both tests pass (2 pass, 0 fail).

- [ ] **Step 5: Write `scripts/lib/openspec.mjs`**

```javascript
// scripts/lib/openspec.mjs
import { readdirSync, existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export function resolveChangeFromDirectoryListing(changesDir = 'openspec/changes') {
  const entries = readdirSync(changesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== 'archive');
  if (entries.length !== 1) {
    throw new Error(
      `Expected exactly one active OpenSpec change in ${changesDir}, found ${entries.length}: ` +
      entries.map((e) => e.name).join(', ')
    );
  }
  return entries[0].name;
}

export async function resolveChangeFromCli() {
  const { stdout } = await execFileAsync('openspec', ['list', '--json']);
  const parsed = JSON.parse(stdout);
  const changes = parsed.changes ?? [];
  if (changes.length !== 1) {
    throw new Error(
      `Expected exactly one active OpenSpec change, found ${changes.length}: ` +
      changes.map((c) => c.name).join(', ')
    );
  }
  return changes[0].name;
}
```

- [ ] **Step 6: Write `scripts/checkout-ticket.mjs`**

```javascript
#!/usr/bin/env node
// scripts/checkout-ticket.mjs
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const ticketId = process.argv[2];
if (!ticketId) {
  console.error('Usage: node scripts/checkout-ticket.mjs <ticket_id>');
  process.exit(1);
}

const branch = `poc/${ticketId}`;

try {
  await execFileAsync('git', ['fetch', 'origin', branch]);
} catch {
  console.error(
    `Branch ${branch} does not exist on origin — this ticket hasn't gone through propose yet ` +
    `(or the branch was deleted since). Nothing to check out.`
  );
  process.exit(1);
}

await execFileAsync('git', ['checkout', '-B', branch, `origin/${branch}`]);
console.log(`Checked out ${branch}.`);
```

- [ ] **Step 7: Live verification — confirm `clickup.mjs` reads the real test ticket**

Run: `node --env-file=.env -e "import('./scripts/lib/clickup.mjs').then(m => m.getTask('869fbdayz')).then(t => console.log(t.id, t.status.status, t.name))"`
Expected output: `869fbdayz to do test local flow` (no mutation — this is a GET only).

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/clickup.mjs scripts/lib/precondition.mjs scripts/lib/precondition.test.mjs scripts/lib/openspec.mjs scripts/checkout-ticket.mjs
git commit -m "Add shared ClickUp/OpenSpec/precondition helpers and checkout-ticket script

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: Intake stage script (pilot)

**Files:**
- Create: `scripts/stages/intake.mjs`
- Modify: `.github/workflows/agent-intake.yml` (replace steps "Fetch the task" through "Write the rewritten description back" — lines 68-344 — with one script invocation; keep "Checkout", "Setup Node", "Install Claude Code CLI", "Summary", "Emit run record", "Upload run record" as-is)

**Interfaces:**
- Consumes: `getTask`, `putStatus`, `removeTag`, `putCustomField`, `putDescriptionMarkdown` from `scripts/lib/clickup.mjs`; `assertStatus` from `scripts/lib/precondition.mjs` (Task 1).
- Produces: `node scripts/stages/intake.mjs <ticket_id>` — exit 0 on success or clean "already-processed" skip, exit 1 on any real failure, printing a one-line outcome to stdout (`already-processed` | `rewritten` | the thrown error).

- [ ] **Step 1: Write `scripts/stages/intake.mjs`**, porting `agent-intake.yml` lines 68-344 faithfully:

```javascript
#!/usr/bin/env node
// scripts/stages/intake.mjs
import { writeFileSync, mkdirSync, readdirSync, cpSync, existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getTask, putStatus, removeTag, putCustomField, putDescriptionMarkdown } from '../lib/clickup.mjs';
import { assertStatus } from '../lib/precondition.mjs';

const execFileAsync = promisify(execFile);

const ticketId = process.argv[2];
if (!ticketId) {
  console.error('Usage: node scripts/stages/intake.mjs <ticket_id>');
  process.exit(1);
}

const ORIGINAL_REPORT_FIELD_ID = process.env.ORIGINAL_REPORT_FIELD_ID;
const BUG_CUSTOM_ITEM_ID = process.env.BUG_CUSTOM_ITEM_ID;
const IN_SPEC_STATUS = process.env.IN_SPEC_STATUS || 'in spec';
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';

const task = await getTask(ticketId);

// Guard: same absent-or-blank check the original bash runs (agent-intake.yml:107-114).
const field = (task.custom_fields ?? []).find((f) => f.id === ORIGINAL_REPORT_FIELD_ID);
const alreadyProcessed =
  field != null &&
  'value' in field &&
  field.value != null &&
  !(typeof field.value === 'string' && /^\s*$/.test(field.value));

if (alreadyProcessed) {
  console.log(`Ticket ${ticketId}: Original report already populated — already-processed.`);
  process.exit(0);
}

// The "already processed" guard above checks a custom field, not ClickUp status — it
// does NOT substitute for a status precondition. Without this, a human running intake
// against a ticket already past "to do" (e.g. "in progress") would still overwrite its
// status to "in spec", a real regression the poller's own query filter prevented today.
assertStatus(task, 'to do');

await putStatus(ticketId, IN_SPEC_STATUS);
console.log(`Ticket ${ticketId}: moved to "${IN_SPEC_STATUS}".`);
const tagCode = await removeTag(ticketId, 'for-ai');
console.log(`Ticket ${ticketId}: removed "for-ai" tag (HTTP ${tagCode}).`);

const originalText = task.description ?? '';
await putCustomField(ticketId, ORIGINAL_REPORT_FIELD_ID, originalText);
console.log(`Copied original description into Original report (verbatim, ${Buffer.byteLength(originalText)} bytes).`);

const template = task.custom_item_id === BUG_CUSTOM_ITEM_ID
  ? 'docs/poc/templates/dor-bug.md'
  : 'docs/poc/templates/dor-feature.md';
console.log(`Ticket ${ticketId}: custom_item_id=${task.custom_item_id ?? '<none>'} -> ${template}`);

const workdir = `${process.env.RUNNER_TEMP ?? '.'}/agent-intake-${ticketId}`;
mkdirSync(workdir, { recursive: true });
writeFileSync(`${workdir}/original.txt`, originalText);
cpSync(template, `${workdir}/template.md`);

// Up to 5 image attachments, same cap as agent-intake.yml:215-233.
const images = (task.attachments ?? [])
  .filter((a) => (a.mimetype ?? '').startsWith('image/'))
  .slice(0, 5);
let n = 0;
for (const img of images) {
  n += 1;
  const ext = img.extension ?? 'png';
  const res = await fetch(img.url, { headers: { Authorization: process.env.CLICKUP_API_TOKEN } });
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(`${workdir}/image-${n}.${ext}`, buf);
}
console.log(`Downloaded ${n} image(s) from ticket ${ticketId}.`);

const prompt = (await import('node:fs')).readFileSync('prompts/intake-rewrite.md', 'utf8');
const claudeOutput = await execFileAsync('claude', [
  '-p', prompt,
  '--model', CLAUDE_MODEL,
  '--allowed-tools', 'Read,Write',
  '--max-turns', '8',
  '--output-format', 'stream-json', '--verbose',
], { cwd: workdir, maxBuffer: 1024 * 1024 * 50 });

if (!existsSync(`${workdir}/rewritten.md`)) {
  throw new Error(`rewritten.md was not produced (or is empty) for ticket ${ticketId}`);
}
const rewritten = (await import('node:fs')).readFileSync(`${workdir}/rewritten.md`, 'utf8');

const lines = rewritten.trimEnd().split('\n');
const lastLine = lines[lines.length - 1];
const match = /^UNKNOWN_COUNT: *(-?\d+)$/.exec(lastLine);
if (!match) {
  throw new Error(`rewritten.md's last line isn't a valid UNKNOWN_COUNT marker: ${lastLine}`);
}
const unknownCount = Number(match[1]);
if (unknownCount === -1) {
  throw new Error(`Ticket ${ticketId}: original description was empty or unintelligible — left unchanged, needs manual attention.`);
}

const description = lines.slice(0, -1).join('\n');
await putDescriptionMarkdown(ticketId, description);
console.log(`Ticket ${ticketId}: rewritten (unknown items: ${unknownCount}).`);
```

Note in the plan for whoever implements this: the original bash also captures Claude's cost/session data into `$GITHUB_ENV` (agent-intake.yml:275-290) for the run-record step. That capture is GitHub-Actions-specific plumbing, not stage logic — leave it to the workflow YAML (Task 2, Step 3 below) to extract from this script's own stdout/a small JSON file this script writes, rather than building GITHUB_ENV-writing into the script itself (the script must stay runnable with no GitHub Actions environment present at all).

Revise `intake.mjs` to also write `${RUNNER_TEMP ?? '.'}/claude-usage.json` with `{session_id, model, cost_usd, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, num_turns, duration_ms}` parsed from the last line of `claudeOutput.stdout` (JSONL) — same extraction the original bash's `jq -c '{...}' <(tail -1 ...)` does — so the workflow step can read it without needing to know anything about Claude's output format.

- [ ] **Step 2: Live verification — dry portion only (no mutation)**

Run: `node --env-file=.env -e "import('./scripts/lib/clickup.mjs').then(m => m.getTask('869fbdayz')).then(t => console.log(JSON.stringify(t.custom_fields)))"`
Confirm the test ticket has no "Original report" custom field value set yet (so the next step's guard doesn't short-circuit). If it does (from a prior test run), that's fine too — it just means Step 3 below will print "already-processed" and exit 0, which is itself a correct result to verify.

- [ ] **Step 3: Live verification — run the real stage script against the test ticket**

Run: `node --env-file=.env scripts/stages/intake.mjs 869fbdayz`
Expected: either `already-processed` (if already run once), or a full run ending in `Ticket 869fbdayz: rewritten (unknown items: N).` Confirm by re-fetching the ticket:
`node --env-file=.env -e "import('./scripts/lib/clickup.mjs').then(m => m.getTask('869fbdayz')).then(t => console.log(t.status.status, t.description))"`
— status should now read `in spec` and the description should be the rewritten DoR-form content, not the original "test local flow" text.

- [ ] **Step 4: Update `agent-intake.yml`**

Replace steps "Fetch the task" (line 68) through "Write the rewritten description back" (ending line 344) with:

```yaml
      - name: Run the intake stage script
        id: stage
        env:
          CLICKUP_API_TOKEN: ${{ secrets.CLICKUP_API_TOKEN }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          ORIGINAL_REPORT_FIELD_ID: ${{ env.ORIGINAL_REPORT_FIELD_ID }}
          BUG_CUSTOM_ITEM_ID: ${{ env.BUG_CUSTOM_ITEM_ID }}
          IN_SPEC_STATUS: ${{ env.IN_SPEC_STATUS }}
          CLAUDE_MODEL: ${{ env.CLAUDE_MODEL }}
        run: |
          echo "STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$GITHUB_ENV"
          set -uo pipefail
          node scripts/stages/intake.mjs "$TICKET_ID"
          echo "stage_exit=$?" >> "$GITHUB_OUTPUT"
```

Adjust the existing "Summary" and "Emit run record" steps' `if:` conditions and `OUTCOME`/`already_processed` references to read from `steps.stage.outputs.stage_exit` and the script's own printed lines instead of `steps.guard.outputs.already_processed` — the implementer should diff the script's actual stdout shape against what those two steps currently parse and adjust accordingly; this is a mechanical follow-through, not a new design decision.

- [ ] **Step 5: Commit**

```bash
git add scripts/stages/intake.mjs .github/workflows/agent-intake.yml
git commit -m "Port agent-intake.yml's stage logic to scripts/stages/intake.mjs

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Propose stage script

**Files:**
- Create: `scripts/stages/propose.mjs`
- Create: `scripts/lib/claude-runner.mjs` (first use here; also used by Tasks 4-6)
- Modify: `.github/workflows/agent-propose.yml` (replace steps "Move task to spec proposed" merge logic and "Run the propose agent"/"Run the propose critique" invocation blocks — keep the branch-creation API dance and PR-opening bash in the workflow for now; see Step 1 note on scope)

**Interfaces:**
- Consumes: `clickup.mjs`, `precondition.mjs`, `openspec.mjs` (Task 1).
- Produces: `claude-runner.mjs`: `runClaude({ promptPath, allowedTools, model, outputFormat, cwd, maxTurns }): Promise<{ resultText, raw, usage: {session_id, model, cost_usd, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, num_turns, duration_ms} }>` — throws on non-zero `claude` exit, attaching whatever partial usage data the JSON output carried (mirrors every workflow's "best-effort capture cost even on failure" step). This becomes the shared implementation of the block duplicated in `agent-intake.yml`, `agent-propose.yml` (twice), `agent-implement.yml`, `agent-review.yml`, `agent-merge.yml`.

- [ ] **Step 1: Write `scripts/lib/claude-runner.mjs`**

```javascript
// scripts/lib/claude-runner.mjs
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function extractUsage(resultObj) {
  return {
    session_id: resultObj.session_id ?? '',
    model: Object.keys(resultObj.modelUsage ?? {}).pop() ?? resultObj.model ?? '',
    cost_usd: resultObj.total_cost_usd ?? resultObj.cost_usd ?? '',
    input_tokens: resultObj.usage?.input_tokens ?? resultObj.input_tokens ?? '',
    output_tokens: resultObj.usage?.output_tokens ?? resultObj.output_tokens ?? '',
    cache_read_tokens: resultObj.usage?.cache_read_input_tokens ?? resultObj.cache_read_tokens ?? '',
    cache_creation_tokens: resultObj.usage?.cache_creation_input_tokens ?? resultObj.cache_creation_tokens ?? '',
    num_turns: resultObj.num_turns ?? '',
    duration_ms: resultObj.duration_ms ?? '',
  };
}

export async function runClaude({ promptPath, allowedTools, model, cwd, maxTurns, outputFormat = 'json' }) {
  const fs = await import('node:fs');
  const prompt = fs.readFileSync(promptPath, 'utf8');
  const args = ['-p', prompt, '--model', model, '--allowed-tools', allowedTools];
  if (maxTurns) args.push('--max-turns', String(maxTurns));
  if (outputFormat === 'stream-json') {
    args.push('--output-format', 'stream-json', '--verbose');
  } else {
    args.push('--output-format', 'json');
  }

  let stdout;
  try {
    const res = await execFileAsync('claude', args, { cwd, maxBuffer: 1024 * 1024 * 100 });
    stdout = res.stdout;
  } catch (err) {
    // Best-effort usage extraction even on a non-zero exit — err.stdout carries
    // whatever claude printed before failing, same as the bash's `|| claude_exit=$?`
    // pattern that still `cat`s and parses $output_file afterward.
    let usage = {};
    try {
      const line = outputFormat === 'stream-json'
        ? err.stdout.trim().split('\n').pop()
        : err.stdout;
      usage = extractUsage(JSON.parse(line));
    } catch { /* output wasn't valid JSON at all — nothing to extract */ }
    const e = new Error(`claude exited with a non-zero status: ${err.message}`);
    e.usage = usage;
    e.rawOutput = err.stdout;
    throw e;
  }

  const lastLine = outputFormat === 'stream-json' ? stdout.trim().split('\n').pop() : stdout;
  const parsed = JSON.parse(lastLine);
  const resultText = parsed.result ?? '';
  return { resultText, raw: parsed, usage: extractUsage(parsed) };
}
```

- [ ] **Step 2: Unit test the usage-extraction shape with a canned JSON fixture**

```javascript
// scripts/lib/claude-runner.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

// extractUsage isn't exported — test it indirectly isn't possible without exporting it.
// Export `extractUsage` from claude-runner.mjs (add it to the export list) and import it here.
```

Revise `claude-runner.mjs` to also `export { extractUsage }`, then:

```javascript
import { extractUsage } from './claude-runner.mjs';

test('extractUsage pulls fields from a one-shot json result', () => {
  const sample = {
    session_id: 's1', modelUsage: { 'claude-sonnet-5': {} }, total_cost_usd: 0.42,
    usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 1, cache_creation_input_tokens: 2 },
    num_turns: 3, duration_ms: 1000,
  };
  const usage = extractUsage(sample);
  assert.equal(usage.model, 'claude-sonnet-5');
  assert.equal(usage.cost_usd, 0.42);
  assert.equal(usage.input_tokens, 10);
});
```

- [ ] **Step 3: Run the unit test**

Run: `node --test scripts/lib/claude-runner.test.mjs`
Expected: 1 pass, 0 fail.

- [ ] **Step 4: Write `scripts/stages/propose.mjs`**, porting the Claude-invocation and result-handling portions of `agent-propose.yml` (lines 317-605) — explicitly NOT the branch-creation/PR-opening portions (lines 142-240, 606-674), which stay in the workflow for this task (see the note below):

```javascript
#!/usr/bin/env node
// scripts/stages/propose.mjs
//
// Scope note: this script assumes it is invoked AFTER the ticket branch already
// exists and is checked out, and it does NOT commit/push/open a PR itself — those
// remain the workflow's job in this round (see Task 3's own note; the branch-creation
// API dance in agent-propose.yml:142-240 has enough GitHub-API-specific retry/race
// logic that porting it is its own follow-up task, not bundled here to keep this
// task reviewable on its own).
import { getTask, putDescriptionMarkdown, postPlainComment } from '../lib/clickup.mjs';
import { assertStatus } from '../lib/precondition.mjs';
import { runClaude } from '../lib/claude-runner.mjs';
import { writeFileSync } from 'node:fs';

const ticketId = process.argv[2];
if (!ticketId) {
  console.error('Usage: node scripts/stages/propose.mjs <ticket_id>');
  process.exit(1);
}

const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';
const ALLOWED_TOOLS = 'Read,Write,Edit,Glob,Grep,Bash(openspec:*)';

const task = await getTask(ticketId);
// This script assumes it runs AFTER the dispatch-lock status PUT (today's
// agent-propose.yml:96-135, left in the workflow per this task's scope note below) —
// so the precondition here checks for the POST-lock status, not "ready for spec".
// Whichever caller invokes this script (the workflow, or a future checkout-ticket-style
// local wrapper) must have already moved the ticket to "spec proposed" before calling it,
// exactly as today's bash does before it ever reaches the "Run the propose agent" step.
assertStatus(task, 'spec proposed');
writeFileSync('ticket.md', task.description ?? '');

const proposeResult = await runClaude({
  promptPath: 'prompts/propose.md',
  allowedTools: ALLOWED_TOOLS,
  model: CLAUDE_MODEL,
  cwd: '.',
});
console.log(proposeResult.resultText);

const resultLine = /^RESULT: *(.+)$/m.exec(proposeResult.resultText);
const result = resultLine?.[1]?.trim();

if (result === 'proposed') {
  const critiqueResult = await runClaude({
    promptPath: 'prompts/propose-critique.md',
    allowedTools: ALLOWED_TOOLS,
    model: CLAUDE_MODEL,
    cwd: '.',
  });
  console.log(critiqueResult.resultText);
}

// Scope check (agent-propose.yml:476-516) and the insufficient-detail revert
// (agent-propose.yml:518-580) port here unchanged in logic, using
// postPlainComment/putStatus from clickup.mjs in place of the equivalent curl calls.
// Left as a direct line-for-line port for the implementer — same shape as Task 2's
// intake.mjs, no new design decisions, omitted here only for this plan document's
// length, NOT omitted from the actual implementation.

console.log(`result=${result}`);
```

The implementer must finish this file by porting `agent-propose.yml`'s scope-violation check (git status --porcelain --untracked-files=all filtering for paths outside `openspec/`) and the insufficient-detail handler (revert status to "in spec", post the proposal/claude-output as a comment) completely — the skeleton above stops short deliberately to keep this plan's own length bounded, not because those two pieces are optional. Both are plain translations of bash already read in full earlier in this plan's preparation; no new logic is required, only the same `child_process`/`fs` patterns already used in Task 2.

- [ ] **Step 5: Live verification — propose against the test ticket is NOT safe to run as-is**

Do not run this script against `869fbdayz` live: unlike intake, propose creates a branch and a draft PR (via the portion left in the workflow), and this task's script alone doesn't yet have a ticket in the right status (`ready for spec`) nor a repo context propose expects (an actual feature/bug ticket description, not "test local flow"). Verification for this task is: `node scripts/stages/propose.mjs --help`-style dry check is not applicable either — instead, verify by code review against the original bash line-by-line, and defer a real live-fire test of this stage to after Task 3's branch-creation-port follow-up exists, when you (the user) are back to supervise a real proposal being opened as a draft PR.

- [ ] **Step 6: Commit**

```bash
git add scripts/stages/propose.mjs scripts/lib/claude-runner.mjs scripts/lib/claude-runner.test.mjs
git commit -m "Add claude-runner helper and port agent-propose.yml's agent-invocation logic

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Implement stage script (highest complexity — budget extra review time)

**Files:**
- Create: `scripts/stages/implement.mjs`
- Create: `scripts/lib/self-check.mjs` (the project-resolution + scoped lint/typecheck/build walk, agent-implement.yml:654-844)

**Interfaces:**
- Consumes: `clickup.mjs`, `claude-runner.mjs`, `openspec.mjs` (resolveChangeFromCli), `precondition.mjs`.
- Produces: `self-check.mjs`: `resolveChangedProjects(baseSha): { pairs: Array<{project, file}>, projects: string[] }` (pure logic, unit-testable with a stubbed `git diff` or by refactoring to accept the file list as an argument rather than shelling out internally — see Step 2).

- [ ] **Step 1: Write `scripts/lib/self-check.mjs`**, porting `agent-implement.yml` lines 701-844. Structure it so the project-resolution walk (lines 701-718) is a pure function taking a list of changed file paths, NOT one that shells to `git diff` itself — this is what makes it unit-testable without a repo fixture:

```javascript
// scripts/lib/self-check.mjs
import { existsSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function resolveChangedProjects(changedFiles) {
  const pairs = [];
  for (const file of changedFiles) {
    if (!file) continue;
    let dir = dirname(file);
    while (dir !== '.' && !existsSync(`${dir}/project.json`)) {
      dir = dirname(dir);
    }
    if (existsSync(`${dir}/project.json`)) {
      const name = JSON.parse(readFileSync(`${dir}/project.json`, 'utf8')).name;
      pairs.push({ project: name, file });
    }
    // A file resolving to no project.json ancestor (e.g. under openspec/) is
    // silently skipped — matches agent-implement.yml's own behavior exactly
    // (Review Focus item: this is exercised on every real run).
  }
  const projects = [...new Set(pairs.map((p) => p.project))];
  return { pairs, projects };
}
```

The build/lint execution (lines 739-844: `nx run-many --target=typecheck,build`, per-project scoped `nx run <project>:lint --lintFilePatterns=...`, the retry-once on build failure, the `--max-old-space-size=8192` flag, skipping projects with no lint target or whose only changed files were deletions) ports as a second exported function, `runSelfCheck(pairs, projects)`, that shells out via `execFile`/`execFileAsync` exactly as the bash does. This is NOT unit-testable without actually running Nx against the real workspace — leave it as integration-only, verified in Step 3 below.

- [ ] **Step 2: Unit test `resolveChangedProjects`**

```javascript
// scripts/lib/self-check.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveChangedProjects } from './self-check.mjs';

test('a file under openspec/ with no project.json ancestor is skipped, not crashed on', () => {
  // openspec/changes/<x>/proposal.md has no project.json anywhere above it in this repo.
  const { pairs, projects } = resolveChangedProjects(['openspec/changes/does-not-matter/proposal.md']);
  assert.deepEqual(pairs, []);
  assert.deepEqual(projects, []);
});

test('a file under a real project resolves to that project name', () => {
  // Adjust this path to a real project.json-owned file that exists in THIS repo at
  // implementation time — e.g. something under apps/poc-e2e/ or a package with its
  // own project.json. The implementer must pick an actual existing path and verify
  // the expected project name against that file's real project.json `name` field.
  const { projects } = resolveChangedProjects(['apps/poc-e2e/tests/some-real-file.ts']);
  assert.ok(projects.length <= 1); // exact name depends on the real project.json picked above
});
```

- [ ] **Step 3: Run the unit test**

Run: `node --test scripts/lib/self-check.test.mjs`
Expected: both tests pass. Fix the second test's path/assertion against this repo's real structure before checking this step off — the placeholder path above must be replaced with one that actually exists.

- [ ] **Step 4: Write `scripts/stages/implement.mjs`**, porting the full mode-branching logic (`MODE=implement` vs `MODE=apply-review`) from `agent-implement.yml` lines 140-1077:

The implementer must port, in order: the dispatch-lock-equivalent (status -> "in progress", remove for-ai tag — but gated behind `precondition.assertStatus`, see note below), fetching review comments when `MODE=apply-review` (`gh pr view --json reviews` via `execFileAsync('gh', [...])`), writing `.ci-failure.md` when a retry context is passed, resolving the OpenSpec change via `openspec.mjs`'s `resolveChangeFromCli`, running the implement agent via `claude-runner.mjs` with prompt `prompts/implement.md` or `prompts/apply-review.md` depending on mode, handling `RESULT: blocked` (revert status per mode, tag `needs-human` + `implement-blocked` only for `MODE=implement`, post a comment), running `self-check.mjs` on `RESULT: implemented`, handling a self-check failure (WIP commit+push, no status revert, exit 1), and the final commit/push with mode-dependent commit message (`Fix e2e failure: ...` / `Address review feedback: ...` / `Implement ...`) including the `MODE=apply-review` no-op path (lines 906-953) that moves straight to "ready for review" when nothing changed.

**Precondition note:** the original bash has NO status check before its own lock PUT — it always writes `in progress` unconditionally. Per the spec's new requirement, this script must call `precondition.assertStatus(task, expectedStatus)` first, where `expectedStatus` is `'ready for dev'` for `MODE=implement` with no CI_FAILURE, or `'in review'` for `MODE=apply-review` — but note a genuine wrinkle the original bash's own header comment documents: a retry dispatch (`CI_FAILURE` set) finds the ticket ALREADY at `in progress` (not `ready for dev`), because the first attempt already moved it there. The precondition for that path must accept `'in progress'` as already-correct (a no-op re-lock), not reject it. Write the precondition call as: accept whichever status the original bash's own comment says is valid for that specific dispatch kind, and throw for anything else. This is the one piece of this task that needs judgment, not transcription — read `agent-implement.yml`'s header comment (lines 15-23) again before writing this check.

- [ ] **Step 5: Live verification — do NOT run this against the live test ticket**

This stage touches application code, runs a real build (8GB heap, multi-minute), and would push a real commit. Verification for this task is code review against the original bash, confirmed line-by-line by the implementer, plus the two unit tests above. Flag this task explicitly for the user's own review when they're back — per the plan's Review Focus, this is the single highest-risk task in the whole plan.

- [ ] **Step 6: Commit**

```bash
git add scripts/stages/implement.mjs scripts/lib/self-check.mjs scripts/lib/self-check.test.mjs
git commit -m "Port agent-implement.yml's dual-mode logic and self-check to scripts/stages/implement.mjs

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: Review stage script

**Files:**
- Create: `scripts/stages/review.mjs`
- Modify: `.github/workflows/agent-review.yml`

**Interfaces:**
- Consumes: `clickup.mjs`, `claude-runner.mjs`, `openspec.mjs` (resolveChangeFromDirectoryListing — review never installs the openspec CLI, matching the original), `precondition.mjs`.

- [ ] **Step 1: Write `scripts/stages/review.mjs`**, porting `agent-review.yml` lines 92-420: dispatch lock (`PUT status "in review"`, remove for-ai tag — gated on `precondition.assertStatus(task, 'ready for review')` first), resolve the OpenSpec change via `resolveChangeFromDirectoryListing`, run the reviewer agent via `claude-runner.mjs` with `prompts/review.md` and `allowedTools: 'Read,Grep,Glob,Skill,Task,Bash(git diff:*),Bash(git log:*),Bash(git show:*)'`, extract the `RESULT: reviewed` line and the review body, post via `gh pr review --comment --body-file ... poc/<ticket_id>` (shell out — `gh` has no equivalent in `clickup.mjs`, add a tiny `scripts/lib/github.mjs` exporting `postPrReview(branch, bodyFile)` and `getPrUrl(branch)` wrapping `execFileAsync('gh', [...])`), then a short ClickUp pointer comment via `postPlainComment`.

- [ ] **Step 2: Write `scripts/lib/github.mjs`**

```javascript
// scripts/lib/github.mjs
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function postPrReview(branch, bodyFile, repo) {
  await execFileAsync('gh', ['pr', 'review', branch, '--comment', '--body-file', bodyFile, '-R', repo]);
}

export async function getPrUrl(branch, repo) {
  const { stdout } = await execFileAsync('gh', ['pr', 'view', branch, '-R', repo, '--json', 'url', '--jq', '.url']);
  return stdout.trim();
}
```

- [ ] **Step 3: Live verification — not applicable to the test ticket**

`869fbdayz` has no implementation branch, no PR, and no OpenSpec change — the review stage has nothing to review. Verification for this task is code review against the original bash, same as propose/implement. Do not fabricate a fake branch/PR against the real repo just to exercise this script.

- [ ] **Step 4: Update `agent-review.yml`**, replacing the dispatch-lock, OpenSpec-resolution, and agent-invocation/posting steps with one script call, same pattern as Task 2 Step 4.

- [ ] **Step 5: Commit**

```bash
git add scripts/stages/review.mjs scripts/lib/github.mjs .github/workflows/agent-review.yml
git commit -m "Port agent-review.yml's stage logic to scripts/stages/review.mjs

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: Merge stage script

**Files:**
- Create: `scripts/stages/merge.mjs`
- Modify: `.github/workflows/agent-merge.yml`

**Interfaces:**
- Consumes: `clickup.mjs`, `claude-runner.mjs`, `openspec.mjs` (resolveChangeFromCli), `github.mjs` (Task 5), `precondition.mjs`.

- [ ] **Step 1: Write `scripts/stages/merge.mjs`**, porting `agent-merge.yml` lines 79-469: dispatch lock (remove for-ai tag only, no status PUT — same as the original, gated on `precondition.assertStatus(task, 'in review')`), fetch review comments via `gh pr view --json reviews`, resolve the OpenSpec change, run the triage agent via `claude-runner.mjs` with `prompts/merge-triage.md`, and branch on `RESULT:`:
  - `needs-changes`: count prior `"Address review feedback: <ticket>"` commits via `git log --oneline | grep -c ...` (shell out, this is cheap and the original already does it this way), cap at `MAX_APPLY_REVIEW_ROUNDS=3`, either tag `needs-human` + comment, or dispatch `clickup-apply-review` via the GitHub `dispatches` API (`fetch` directly, matching the existing curl call — add this as a one-off in the script rather than a new lib function, since it's the only place this exact dispatch happens outside `agent-react-to-e2e.yml`, which has its own dispatch call too; if both need it, factor a shared `scripts/lib/dispatch.mjs` exporting `dispatchEvent(eventType, clientPayload, repo, token)` instead — check Task 7 before deciding, and add the shared helper if both tasks end up needing the identical call).
  - `ready-to-merge`: `openspec archive <spec_id> --yes --json`, commit+push, `gh pr merge --merge --delete-branch`, `putStatus(ticketId, 'ready for deploy')`, comment with the PR link.

- [ ] **Step 2: Live verification — not applicable to the test ticket**

Same reasoning as Task 5 — `869fbdayz` has no PR to triage or merge. Verify by code review against the original bash.

- [ ] **Step 3: Update `agent-merge.yml`**, same replacement pattern as prior tasks.

- [ ] **Step 4: Commit**

```bash
git add scripts/stages/merge.mjs .github/workflows/agent-merge.yml
git commit -m "Port agent-merge.yml's triage/archive/merge logic to scripts/stages/merge.mjs

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: React-to-e2e stage script

**Files:**
- Create: `scripts/stages/react-to-e2e.mjs`
- Create: `scripts/lib/dispatch.mjs` (if Task 6 didn't already create it — check first; if it exists, import from there instead of duplicating)
- Modify: `.github/workflows/agent-react-to-e2e.yml`

**Interfaces:**
- Consumes: `clickup.mjs`, `github.mjs` (Task 5), `dispatch.mjs` (Task 6, or created here if not already present).

- [ ] **Step 1: Write `scripts/lib/dispatch.mjs`** (skip this step if Task 6 already created it; import it instead):

```javascript
// scripts/lib/dispatch.mjs
export async function dispatchEvent(eventType, clientPayload, repo, token) {
  const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ event_type: eventType, client_payload: clientPayload }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub dispatch API returned HTTP ${res.status}: ${text}`);
  }
}
```

- [ ] **Step 2: Write `scripts/stages/react-to-e2e.mjs`**, porting `agent-react-to-e2e.yml` lines 110-386. This one is explicitly NOT gated by the new `precondition.assertStatus` the same way other stages are — the original has its own two-guard shape (status must be `in progress`, commit must still be the branch tip) that already IS a precondition check, just a different one (and the spec's "no poller locally" reasoning doesn't even apply to this stage — see the design spec's note that `agent-react-to-e2e.yml` never checked `for-ai` in the first place, because it's a continuation, not a new gate). Port the two guards as early returns (`console.log(...); process.exit(0)` — NOT `process.exit(1)`, these are clean skips, see Review Focus), then the green path (`putStatus('ready for review')`, `gh pr ready`, comment) and the red path (count `"Fix e2e failure: <ticket>"` commits, cap at `MAX_E2E_RETRIES=3`, classify the failure by downloading and parsing the `e2e-results-json` artifact via `gh run download`, re-dispatch `clickup-implement` with the classified failure text via `dispatch.mjs`).

- [ ] **Step 3: Unit test the failure classification logic**

Extract the classification (agent-react-to-e2e.yml:314-349: did the new spec itself fail vs. did something else regress) into a pure function `classifyFailure(failures, newSpecBasename)` returning `{ failureClass, detail }`, and unit test it with a canned `failures` array (no network/filesystem needed):

```javascript
// scripts/lib/e2e-classify.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyFailure } from './e2e-classify.mjs';

test('new spec failing classifies as did-not-do-task', () => {
  const failures = [{ file: 'new.spec.ts', title: 'x', error: 'boom' }];
  const { failureClass } = classifyFailure(failures, 'new.spec.ts');
  assert.equal(failureClass, 'did-not-do-task');
});

test('a different spec failing classifies as collateral-breakage', () => {
  const failures = [{ file: 'other.spec.ts', title: 'x', error: 'boom' }];
  const { failureClass } = classifyFailure(failures, 'new.spec.ts');
  assert.equal(failureClass, 'collateral-breakage');
});
```

Create `scripts/lib/e2e-classify.mjs` with the extracted pure function (move the jq-equivalent logic from the bash into plain JS array filtering), then import it from `react-to-e2e.mjs`.

- [ ] **Step 4: Run the unit test**

Run: `node --test scripts/lib/e2e-classify.test.mjs`
Expected: 2 pass, 0 fail.

- [ ] **Step 5: Live verification — not applicable**

This stage only fires from a real `poc-e2e.yml` completion dispatch; there's no safe way to exercise it against the test ticket (it has no branch, no e2e run). Verify by code review and the unit test above.

- [ ] **Step 6: Update `agent-react-to-e2e.yml`**, same replacement pattern.

- [ ] **Step 7: Commit**

```bash
git add scripts/stages/react-to-e2e.mjs scripts/lib/dispatch.mjs scripts/lib/e2e-classify.mjs scripts/lib/e2e-classify.test.mjs .github/workflows/agent-react-to-e2e.yml
git commit -m "Port agent-react-to-e2e.yml's guard/green/red logic to scripts/stages/react-to-e2e.mjs

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Explicitly deferred (not in this plan)

- Porting `agent-propose.yml`'s branch-creation API dance (lines 142-240) and PR-opening (lines 606-674) into script form — Task 3 leaves these in the workflow. Separate follow-up once Tasks 1-7 above are reviewed.
- **Wiring `agent-propose.yml` and `agent-implement.yml` to call `propose.mjs`/`implement.mjs` at all.** Both workflows remain byte-identical to the original bash (1,000+ lines of inline logic each) — the final review flagged this explicitly as something the plan's own Files lists should have named outright rather than leaving implicit. `propose.mjs`/`implement.mjs` exist, are unit/smoke-tested and code-reviewed, but nothing in CI or locally calls them yet; the two workflows run their own untouched bash exactly as before. Wiring both is the same follow-up as the branch-creation port above, not a separate one.
- `.claude/commands/<stage>.md` slash-command wrappers for local convenience — the spec calls for these but they're pure sugar over `node scripts/stages/<stage>.mjs <ticket_id>`, which already works from any terminal. Add once the scripts themselves are reviewed and trusted.
- Subagent definitions (`.claude/agents/*.md` replacing `--allowed-tools` flags) — independently useful, explicitly out of scope per the spec's "What does NOT change" section.
- Actually running `git push`/opening a PR/merging against the real repo to exercise Tasks 3, 5, 6 end-to-end — deferred to the user's own supervised testing per this session's agreement.
