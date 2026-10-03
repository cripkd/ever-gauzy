#!/usr/bin/env node
// scripts/stages/react-to-e2e.mjs
//
// Unlike every other stage, this one isn't gated by precondition.assertStatus the same
// way — its own two guards (status must be "in progress", commit must still be the
// branch tip) already serve that role, and for a different reason: there's no poller
// in front of this stage at all (it's a continuation of an already-authorized implement
// run, not a new dispatch gate — see the design spec's note that agent-react-to-e2e.yml
// never checked for-ai in the first place). Both guard failures are clean skips
// (exit 0), not errors — a propose-stage push producing a green e2e result, or a stale
// superseded result, isn't this reactor's business to act on.
import { getTask, putStatus, addTag, postPlainComment } from '../lib/clickup.mjs';
import { bestEffort } from '../lib/best-effort.mjs';
import { getPrReady } from '../lib/github.mjs';
import { dispatchEvent } from '../lib/dispatch.mjs';
import { classifyFailure } from '../lib/e2e-classify.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const execFileAsync = promisify(execFile);
const RUNNER_TEMP = process.env.RUNNER_TEMP ?? tmpdir();

const ticketId = process.argv[2];
if (!ticketId) {
  console.error('Usage: node scripts/stages/react-to-e2e.mjs <ticket_id>');
  process.exit(1);
}

const RUN_HEAD_SHA = process.env.RUN_HEAD_SHA;
const CONCLUSION = process.env.CONCLUSION; // 'success' | 'failure' | other (no-op)
const RUN_URL = process.env.RUN_URL || '';
const RUN_ID = process.env.RUN_ID;
const GH_REPO = process.env.GH_REPO;
const DISPATCH_TOKEN = process.env.DISPATCH_PAT;
const CAUSED_BY_RUN_ID = process.env.CAUSED_BY_RUN_ID || '';
const MAX_E2E_RETRIES = Number(process.env.MAX_E2E_RETRIES || '3');
const branch = `poc/${ticketId}`;

// --- Guards --------------------------------------------------------------------------
let task;
try {
  task = await getTask(ticketId);
} catch (err) {
  console.warn(`::warning::ClickUp GET task failed (${err.message}) — skipping quietly.`);
  process.exit(0);
}

// Written even on a quiet skip below — matches the original's own comment: harmless,
// and the workflow only actually uses it when the run-record step fires anyway.
writeFileSync(`${RUNNER_TEMP}/ticket-meta.json`, JSON.stringify({ title: task.name ?? '' }));

if (task.status?.status !== 'in progress') {
  console.log(`Ticket ${ticketId} is at "${task.status?.status}", not "in progress" (e.g. a propose-stage PR push, not an implement one) — skipping quietly.`);
  process.exit(0);
}

if (!GH_REPO) {
  throw new Error('GH_REPO (owner/repo) must be set in the environment.');
}
const { stdout: refOut } = await execFileAsync('gh', ['api', `/repos/${GH_REPO}/git/refs/heads/${branch}`, '--jq', '.object.sha']);
const currentSha = refOut.trim();
if (currentSha !== RUN_HEAD_SHA) {
  console.log(`This run's commit (${RUN_HEAD_SHA}) is no longer ${branch}'s tip (${currentSha}) — superseded by a newer push already. Skipping quietly.`);
  process.exit(0);
}

// Both guards passed — printed as its own marker (distinct from the OUTCOME= lines
// below) so the workflow can gate run-record emission on it exactly like the original's
// steps.guard.outputs.proceed: true the moment guards pass, regardless of which
// conclusion branch (or the cancelled/skipped/timed_out no-op) runs after it.
console.log('PROCEED=true');

// --- Green: mark ready for review -----------------------------------------------------
if (CONCLUSION === 'success') {
  await putStatus(ticketId, 'ready for review');
  await getPrReady(branch, GH_REPO);
  // Best-effort, matching the original bash's `|| true` (agent-react-to-e2e.yml:219-224)
  // — the status PUT and `gh pr ready` above already succeeded.
  await bestEffort(() => postPlainComment(ticketId, `e2e passed — PR marked ready for review.\n\nRun: ${RUN_URL}`), 'ClickUp comment (e2e green)');
  console.log(`Ticket ${ticketId}: e2e green — moved to "ready for review", PR undrafted.`);
  console.log('OUTCOME=success');
  console.log('CLICKUP_STATUS_AFTER=ready for review');
  process.exit(0);
}

// --- Red: count retries, then cap or dispatch a fix -----------------------------------
if (CONCLUSION === 'failure') {
  await execFileAsync('git', ['fetch', 'origin', branch]);
  await execFileAsync('git', ['checkout', '-B', branch, `origin/${branch}`]);

  const { stdout: logOut } = await execFileAsync('git', ['log', '--oneline']);
  const count = logOut.split('\n').filter((line) => line.includes(`Fix e2e failure: ${ticketId}`)).length;
  console.log(`Prior e2e-fix retry attempts on ${branch}: ${count}`);

  if (count >= MAX_E2E_RETRIES) {
    await addTag(ticketId, 'needs-human');
    // Best-effort, matching the original bash's `|| true` (agent-react-to-e2e.yml:270-275)
    // — if this throws, the OUTCOME/FAILURE_CLASS/CLICKUP_STATUS_AFTER markers below
    // must still print; the workflow greps stdout for them.
    await bestEffort(() => postPlainComment(ticketId, `e2e failed ${count} times — attempts exhausted, needs a human.\n\nRun: ${RUN_URL}`), 'ClickUp comment (retries exhausted)');
    console.log(`Ticket ${ticketId}: e2e retries exhausted (${count}/${MAX_E2E_RETRIES}) — tagged needs-human, status left at "in progress", not retrying.`);
    console.log('OUTCOME=failed');
    console.log('FAILURE_CLASS=retries-exhausted');
    console.log('CLICKUP_STATUS_AFTER=in progress');
    process.exit(0);
  }

  // Which spec is THIS change's own new one (task 1's output)? Same informal
  // resolution the original uses — no CLI needed, exactly one non-archived change dir
  // exists by the time a ticket reaches "in progress".
  let newSpecBasename = '';
  if (existsSync('openspec/changes')) {
    const changeDir = readdirSync('openspec/changes', { withFileTypes: true })
      .find((e) => e.isDirectory() && e.name !== 'archive');
    if (changeDir) {
      const tasksPath = `openspec/changes/${changeDir.name}/tasks.md`;
      if (existsSync(tasksPath)) {
        const tasksMd = readFileSync(tasksPath, 'utf8');
        const match = /`([^`]+\.spec\.ts)`/.exec(tasksMd);
        if (match) newSpecBasename = match[1].split('/').pop();
      }
    }
  }

  let failures = [];
  try {
    await execFileAsync('gh', ['run', 'download', RUN_ID, '--repo', GH_REPO, '--name', 'e2e-results-json', '--dir', '.e2e-results']);
    const resultsPath = '.e2e-results/results.json';
    if (existsSync(resultsPath)) {
      const results = JSON.parse(readFileSync(resultsPath, 'utf8'));
      const allSpecs = (suite) => [...(suite.specs ?? []), ...((suite.suites ?? []).flatMap(allSpecs))];
      failures = (results.suites ?? [])
        .flatMap(allSpecs)
        .filter((s) => s.ok === false)
        .map((s) => ({
          file: s.file,
          title: s.title,
          error: s.tests?.[0]?.results?.[0]?.error?.message ?? 'no error message',
        }));
    }
  } catch (err) {
    console.warn(`::warning::Could not download e2e-results-json for run ${RUN_ID} — falling back to a generic failure note: ${err.message}`);
  }

  let ciFailure;
  let failureClass = null;
  if (failures.length === 0) {
    ciFailure = `poc-e2e.yml failed (run ${RUN_URL}) but no specific failing test could be extracted from its results — check the run log directly.`;
  } else {
    const { failureClass: fc, detail } = classifyFailure(failures, newSpecBasename);
    failureClass = fc;
    const kind = fc === 'did-not-do-task'
      ? "Your own new spec is failing — the implementation doesn't satisfy it yet."
      : 'Your new spec passes, but this change broke a different, previously-passing test — a regression.';
    ciFailure = `${kind}\n\nRun: ${RUN_URL}\n\n${detail}`;
  }
  ciFailure = ciFailure.slice(0, 3000);

  if (!DISPATCH_TOKEN) {
    throw new Error('DISPATCH_PAT must be set in the environment to dispatch clickup-implement.');
  }
  await dispatchEvent(
    'clickup-implement',
    { ticket_id: ticketId, ci_failure: ciFailure, attempt_number: count + 1, caused_by_run_id: CAUSED_BY_RUN_ID, triggered_by: 'reactor' },
    GH_REPO,
    DISPATCH_TOKEN
  );

  console.log(`Ticket ${ticketId}: e2e red (attempt ${count + 1}/${MAX_E2E_RETRIES}) — dispatched a fix retry with real failure context.`);
  console.log('OUTCOME=e2e-red-retrying');
  console.log(`FAILURE_CLASS=${failureClass ?? ''}`);
  console.log('CLICKUP_STATUS_AFTER=in progress');
  process.exit(0);
}

// Anything else (cancelled, skipped, timed_out): a human-initiated cancel isn't
// evidence the code is broken — no-op, matching the original exactly.
console.log(`Conclusion "${CONCLUSION}" is neither success nor failure — no-op.`);
process.exit(0);
