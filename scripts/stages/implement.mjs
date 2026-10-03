#!/usr/bin/env node
// scripts/stages/implement.mjs
//
// Scope note: like propose.mjs, this script assumes the repo is already checked out on
// poc/<ticket_id> and does not itself handle branch checkout — that stays the workflow's
// job for now. Not yet wired into agent-implement.yml (same deferred-wiring pattern as
// Task 3's propose.mjs).
import { getTask, putStatus, addTag, postMarkdownComment } from '../lib/clickup.mjs';
import { assertStatus } from '../lib/precondition.mjs';
import { resolveChangeFromCli } from '../lib/openspec.mjs';
import { runClaude } from '../lib/claude-runner.mjs';
import { resolveChangedProjects, runSelfCheck } from '../lib/self-check.mjs';
import { writeFileSync, readFileSync, appendFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const ticketId = process.argv[2];
if (!ticketId) {
  console.error('Usage: node scripts/stages/implement.mjs <ticket_id>');
  process.exit(1);
}

const MODE = process.env.MODE === 'apply-review' ? 'apply-review' : 'implement';
const CI_FAILURE = process.env.CI_FAILURE || '';
const ATTEMPT_NUMBER = process.env.ATTEMPT_NUMBER || '';
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';
const ALLOWED_TOOLS = 'Read,Write,Edit,Glob,Grep,Bash(openspec:*)';
const GH_REPO = process.env.GH_REPO; // owner/repo, for gh CLI calls

async function gitStatusPorcelain() {
  const { stdout } = await execFileAsync('git', ['status', '--porcelain']);
  return stdout;
}

async function excludeLocally(path) {
  appendFileSync('.git/info/exclude', `${path}\n`);
}

// --- Precondition -----------------------------------------------------------------
// Dispatch lock already happened via `node scripts/lock-ticket.mjs <ticket_id> "in
// progress"`, called before the branch checkout — not here, for the same reason as
// review.mjs: this script needs the right branch already checked out (for
// resolveChangeFromCli and the self-check below), and the lock must happen before that
// checkout can be allowed to fail. See scripts/lock-ticket.mjs's own header comment.
//
// Unlike review.mjs, there's only one post-lock status to check here, not one per
// dispatch kind: the lock always PUTs "in progress" unconditionally — on a fresh
// dispatch, a retry (where it's already there), or an apply-review dispatch alike —
// matching the original bash's own lock step, which has no pre-check of its own either
// (agent-implement.yml:140-166).
const task = await getTask(ticketId);
assertStatus(task, 'in progress');

// --- Mode-specific context ----------------------------------------------------------
if (MODE === 'apply-review') {
  if (!GH_REPO) {
    throw new Error('GH_REPO (owner/repo) must be set in the environment for MODE=apply-review.');
  }
  const { stdout } = await execFileAsync('gh', ['pr', 'view', `poc/${ticketId}`, '--json', 'reviews', '-R', GH_REPO]);
  const reviewsJson = JSON.parse(stdout);
  const reviewsWithBody = (reviewsJson.reviews ?? []).filter((r) => r.body !== '');
  const body = reviewsWithBody
    .map((r) => `### ${r.author.login} (${r.state}) — ${r.submittedAt}\n\n${r.body}`)
    .join('\n\n---\n\n');
  if (!body) {
    throw new Error(
      `No PR review found on poc/${ticketId} — nothing to apply. (for-ai may have been re-added without leaving a review comment first.)`
    );
  }
  writeFileSync('.review-comments.md', `${body}\n`);
  await excludeLocally('.review-comments.md');
  console.log(`Wrote .review-comments.md (${reviewsWithBody.length} review(s)).`);
}

if (CI_FAILURE) {
  writeFileSync('.ci-failure.md', `${CI_FAILURE}\n`);
  await excludeLocally('.ci-failure.md');
  console.log(`Wrote .ci-failure.md (attempt ${ATTEMPT_NUMBER}).`);
}

const specId = await resolveChangeFromCli();
console.log(`Resolved OpenSpec change: ${specId}`);
writeFileSync('.change-name', specId);
await excludeLocally('.change-name');

writeFileSync('ticket.md', task.description ?? '');
await excludeLocally('ticket.md');

// --- Run the implement agent ---------------------------------------------------------
// Overridable for the same reason as review.mjs's PROMPT_PATH: the ticket branch this
// script runs against may predate this prompt file entirely (see
// agent-implement.yml:189-218's "capture before the branch switch" step). A caller that
// switches branches before invoking this script should capture the right prompt file
// to a stable path first and set IMPLEMENT_PROMPT_PATH to it.
const promptPath = process.env.IMPLEMENT_PROMPT_PATH
  || (MODE === 'apply-review' ? 'prompts/apply-review.md' : 'prompts/implement.md');
const agentResult = await runClaude({
  promptPath,
  allowedTools: ALLOWED_TOOLS,
  model: CLAUDE_MODEL,
  cwd: '.',
});
console.log(agentResult.resultText);

const resultMatch = /^RESULT: *(.+)$/m.exec(agentResult.resultText);
const result = resultMatch?.[1]?.trim();
const tasksMatch = /^TASKS: *(.+)$/m.exec(agentResult.resultText);
const tasks = tasksMatch?.[1]?.trim() ?? '';

if (!result) {
  throw new Error("claude's output has no RESULT: line — cannot determine outcome.");
}

// --- RESULT: blocked -----------------------------------------------------------------
if (result === 'blocked') {
  const porcelain = await gitStatusPorcelain();
  if (porcelain.trim() !== '') {
    try {
      await execFileAsync('git', ['config', 'user.name', 'github-actions[bot]']);
      await execFileAsync('git', ['config', 'user.email', 'github-actions[bot]@users.noreply.github.com']);
      await execFileAsync('git', ['add', '-A']);
      await execFileAsync('git', ['commit', '-m', `WIP: ${ticketId} — implementation blocked, left for inspection`]);
      await execFileAsync('git', ['push', 'origin', `poc/${ticketId}`]);
    } catch (err) {
      console.warn(`::warning::WIP commit/push of blocked progress failed, continuing with status revert and tagging anyway: ${err.message}`);
    }
  }

  const revertStatus = MODE === 'apply-review' ? 'in review' : 'ready for dev';
  const actionDesc = MODE === 'apply-review' ? 'Applying review feedback' : 'Implementation';

  await putStatus(ticketId, revertStatus);
  await addTag(ticketId, 'needs-human');
  if (MODE !== 'apply-review') {
    await addTag(ticketId, 'implement-blocked');
  }

  const progressFragment = tasks ? ` (${tasks} tasks done)` : '';
  const commentText = `${actionDesc} blocked${progressFragment} — reasoning below.\n\n${agentResult.resultText.slice(0, 3000)}`;
  await postMarkdownComment(ticketId, commentText);

  console.log(`Ticket ${ticketId}: ${actionDesc.toLowerCase()} blocked — reverted to "${revertStatus}", tagged, commented.`);
  console.log('OUTCOME=blocked');
  process.exit(0);
}

// --- RESULT: implemented --------------------------------------------------------------
if (result === 'implemented') {
  const { stdout: defaultBranchRef } = await execFileAsync('git', ['symbolic-ref', 'refs/remotes/origin/HEAD']);
  const defaultBranch = defaultBranchRef.trim().replace('refs/remotes/origin/', '');
  const { stdout: baseSha } = await execFileAsync('git', ['merge-base', `origin/${defaultBranch}`, 'HEAD']);
  const { stdout: diffOut } = await execFileAsync('git', ['diff', '--name-only', baseSha.trim(), 'HEAD']);
  const changedFiles = diffOut.split('\n').filter((f) => f.length > 0);
  const { pairs, projects } = resolveChangedProjects(changedFiles);

  console.log(`Self-check scoped to: ${projects.length ? projects.join(', ') : '(no owning project found for any changed file — nothing to check)'}`);
  const selfCheck = await runSelfCheck(pairs, projects);
  console.log(selfCheck.output);

  if (!selfCheck.passed) {
    const porcelain = await gitStatusPorcelain();
    if (porcelain.trim() !== '') {
      await execFileAsync('git', ['config', 'user.name', 'github-actions[bot]']);
      await execFileAsync('git', ['config', 'user.email', 'github-actions[bot]@users.noreply.github.com']);
      await execFileAsync('git', ['add', '-A']);
      await execFileAsync('git', ['commit', '-m', `WIP: ${ticketId} — implementation complete but self-check failed, left for inspection`]);
      await execFileAsync('git', ['push', 'origin', `poc/${ticketId}`]);
    }
    console.log('OUTCOME=self-check-failed');
    console.log(`FAILURE_CLASS=${selfCheck.failureClass}`);
    process.exit(1);
  }

  // MODE=apply-review with nothing actually changed is a legitimate, non-error outcome
  // (every review comment was praise, already addressed, or out of scope) — NOT the
  // MODE=implement anomaly it would be otherwise (that path always writes at minimum
  // the failing spec file).
  const porcelainAfterCheck = await gitStatusPorcelain();
  if (MODE === 'apply-review' && porcelainAfterCheck.trim() === '') {
    await putStatus(ticketId, 'ready for review');
    const commentText = `Review feedback required no code changes — PR unchanged, back to "ready for review".\n\n${agentResult.resultText.slice(0, 3000)}`;
    await postMarkdownComment(ticketId, commentText);
    console.log(`Ticket ${ticketId}: apply-review made no changes — moved straight back to "ready for review".`);
    console.log('OUTCOME=implemented');
    process.exit(0);
  }

  await execFileAsync('git', ['config', 'user.name', 'github-actions[bot]']);
  await execFileAsync('git', ['config', 'user.email', 'github-actions[bot]@users.noreply.github.com']);

  let commitMessage;
  if (CI_FAILURE) {
    commitMessage = `Fix e2e failure: ${ticketId} (attempt ${ATTEMPT_NUMBER})`;
  } else if (MODE === 'apply-review') {
    commitMessage = `Address review feedback: ${ticketId}`;
  } else {
    commitMessage = `Implement ${ticketId}`;
  }

  await execFileAsync('git', ['add', '-A']);
  await execFileAsync('git', ['commit', '-m', commitMessage]);
  await execFileAsync('git', ['push', 'origin', `poc/${ticketId}`]);

  console.log(`Ticket ${ticketId}: pushed. PR stays in draft until agent-react-to-e2e.yml confirms a green e2e run.`);
  console.log('OUTCOME=implemented');
  process.exit(0);
}

throw new Error(`Unexpected RESULT: "${result}" — expected "blocked" or "implemented".`);
