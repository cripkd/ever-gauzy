#!/usr/bin/env node
// scripts/stages/merge.mjs
//
// Scope note: like review.mjs, this script assumes the dispatch lock already happened
// via `node scripts/lock-ticket.mjs <ticket_id>` (no status arg — merge's own lock is
// tag-removal only, status stays "in review" for the whole run, same as the original),
// called before the branch checkout. See scripts/lock-ticket.mjs's header comment and
// Task 5's ledger ruling for why the lock can't live inside a script that needs the
// branch already checked out.
import { getTask, putStatus, addTag, postMarkdownComment } from '../lib/clickup.mjs';
import { assertStatus } from '../lib/precondition.mjs';
import { resolveChangeFromCli } from '../lib/openspec.mjs';
import { runClaude } from '../lib/claude-runner.mjs';
import { getPrReviews, getPrUrl, mergePr } from '../lib/github.mjs';
import { dispatchEvent } from '../lib/dispatch.mjs';
import { writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const RUNNER_TEMP = process.env.RUNNER_TEMP ?? '.';

function writeState(state) {
  writeFileSync(`${RUNNER_TEMP}/merge-state.json`, JSON.stringify(state));
}

const ticketId = process.argv[2];
if (!ticketId) {
  console.error('Usage: node scripts/stages/merge.mjs <ticket_id>');
  process.exit(1);
}

const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';
const GH_REPO = process.env.GH_REPO;
const DISPATCH_TOKEN = process.env.DISPATCH_PAT;
const CAUSED_BY_RUN_ID = process.env.CAUSED_BY_RUN_ID || '';
const MAX_APPLY_REVIEW_ROUNDS = Number(process.env.MAX_APPLY_REVIEW_ROUNDS || '3');
const ALLOWED_TOOLS = 'Read,Grep,Glob,Bash(openspec:*),Bash(git diff:*),Bash(git log:*),Bash(git show:*)';
const MERGE_TRIAGE_PROMPT_PATH = process.env.MERGE_TRIAGE_PROMPT_PATH || 'prompts/merge-triage.md';

if (!GH_REPO) {
  throw new Error('GH_REPO (owner/repo) must be set in the environment.');
}

const task = await getTask(ticketId);
assertStatus(task, 'in review');
writeFileSync(`${RUNNER_TEMP}/ticket-meta.json`, JSON.stringify({ title: task.name ?? '' }));

const branch = `poc/${ticketId}`;

const reviewsJson = await getPrReviews(branch, GH_REPO);
const reviewsWithBody = (reviewsJson.reviews ?? []).filter((r) => r.body !== '');
const body = reviewsWithBody
  .map((r) => `### ${r.author.login} (${r.state}) — ${r.submittedAt}\n\n${r.body}`)
  .join('\n\n---\n\n');
if (!body) {
  throw new Error(
    `No PR review found on ${branch} — nothing to triage. (for-ai may have been re-added without leaving a review comment first.)`
  );
}
writeFileSync('.review-comments.md', `${body}\n`);
console.log(`Wrote .review-comments.md (${reviewsWithBody.length} review(s)).`);

const specId = await resolveChangeFromCli();
console.log(`Resolved OpenSpec change: ${specId}`);
writeFileSync(`${RUNNER_TEMP}/spec-id.txt`, specId);

writeFileSync('ticket.md', task.description ?? '');

const triageResult = await runClaude({
  promptPath: MERGE_TRIAGE_PROMPT_PATH,
  allowedTools: ALLOWED_TOOLS,
  model: CLAUDE_MODEL,
  cwd: '.',
});
console.log(triageResult.resultText);
writeFileSync(`${RUNNER_TEMP}/claude-usage.json`, JSON.stringify(triageResult.usage));

const resultMatch = /^RESULT: *(.+)$/m.exec(triageResult.resultText);
const result = resultMatch?.[1]?.trim();

if (!result) {
  throw new Error("claude's output has no RESULT: line — cannot determine outcome.");
}

if (result === 'needs-changes') {
  const { stdout: logOut } = await execFileAsync('git', ['log', '--oneline']);
  const count = logOut.split('\n').filter((line) => line.includes(`Address review feedback: ${ticketId}`)).length;

  if (count >= MAX_APPLY_REVIEW_ROUNDS) {
    await addTag(ticketId, 'needs-human');
    const commentText = `Merge triage still found actionable review feedback after ${count} apply-review round(s) (cap: ${MAX_APPLY_REVIEW_ROUNDS}) — stopping instead of looping. Reasoning below.\n\n${triageResult.resultText.slice(0, 3000)}`;
    await postMarkdownComment(ticketId, commentText);
    console.log(`Ticket ${ticketId}: apply-review rounds exhausted (${count}/${MAX_APPLY_REVIEW_ROUNDS}) — tagged needs-human, not dispatching again.`);
    writeState({ outcome: 'failed', failureClass: 'apply-review-rounds-exhausted', statusAfter: 'in review' });
    process.exit(0);
  }

  if (!DISPATCH_TOKEN) {
    throw new Error('DISPATCH_PAT must be set in the environment to dispatch clickup-apply-review.');
  }
  // triggered_by: "poller" is the original's own literal value here (agent-merge.yml's
  // "Route needs-changes" step) even though this dispatch is triggered by merge triage,
  // not a poller — preserved verbatim, not "fixed", since changing it would be an
  // unrequested behavior change.
  await dispatchEvent(
    'clickup-apply-review',
    { ticket_id: ticketId, caused_by_run_id: CAUSED_BY_RUN_ID, triggered_by: 'poller' },
    GH_REPO,
    DISPATCH_TOKEN
  );
  console.log(`Ticket ${ticketId}: triage found actionable feedback (round ${count + 1}/${MAX_APPLY_REVIEW_ROUNDS}) — dispatched clickup-apply-review.`);
  writeState({ outcome: 'routed-to-apply-review', statusAfter: 'in review' });
  process.exit(0);
}

if (result === 'ready-to-merge') {
  await execFileAsync('openspec', ['archive', specId, '--yes', '--json']);

  await execFileAsync('git', ['config', 'user.name', 'github-actions[bot]']);
  await execFileAsync('git', ['config', 'user.email', 'github-actions[bot]@users.noreply.github.com']);
  await execFileAsync('git', ['add', '-A']);
  await execFileAsync('git', ['commit', '-m', `Archive OpenSpec change: ${ticketId}`]);
  await execFileAsync('git', ['push', 'origin', branch]);
  const { stdout: commitSha } = await execFileAsync('git', ['rev-parse', 'HEAD']);

  const prUrl = await getPrUrl(branch, GH_REPO);
  await mergePr(branch, GH_REPO);
  await putStatus(ticketId, 'ready for deploy');

  const commentText = `Archived OpenSpec change \`${specId}\` and merged the PR into develop.\n\n${prUrl}`;
  await postMarkdownComment(ticketId, commentText);

  console.log(`Ticket ${ticketId}: archived and merged — moved to "ready for deploy".`);
  writeState({ outcome: 'merged', statusAfter: 'ready for deploy', commitSha: commitSha.trim() });
  process.exit(0);
}

throw new Error(`Unexpected RESULT: "${result}" — expected "needs-changes" or "ready-to-merge".`);
