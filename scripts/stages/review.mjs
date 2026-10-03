#!/usr/bin/env node
// scripts/stages/review.mjs
import { getTask, postPlainComment } from '../lib/clickup.mjs';
import { assertStatus } from '../lib/precondition.mjs';
import { resolveChangeFromDirectoryListing } from '../lib/openspec.mjs';
import { runClaude } from '../lib/claude-runner.mjs';
import { postPrReview, getPrUrl } from '../lib/github.mjs';
import { excludeLocally } from '../lib/git-local.mjs';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const ticketId = process.argv[2];
if (!ticketId) {
  console.error('Usage: node scripts/stages/review.mjs <ticket_id>');
  process.exit(1);
}

const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';
const RUNNER_TEMP = process.env.RUNNER_TEMP ?? tmpdir();
const GH_REPO = process.env.GH_REPO;
const ALLOWED_TOOLS = 'Read,Grep,Glob,Skill,Task,Bash(git diff:*),Bash(git log:*),Bash(git show:*)';
// Overridable: the ticket branch this script runs against may be older than the
// prompt file on the default branch — the original bash's "capture before the branch
// switch" step exists for exactly this reason (see agent-review.yml:138-147). A caller
// that switches branches before invoking this script should capture prompts/review.md
// to a stable path first and set REVIEW_PROMPT_PATH to it; the bare repo-relative
// default is only safe when the checked-out branch is known to be current.
const PROMPT_PATH = process.env.REVIEW_PROMPT_PATH || 'prompts/review.md';

if (!GH_REPO) {
  throw new Error('GH_REPO (owner/repo) must be set in the environment.');
}

// Dispatch lock already happened via `node scripts/lock-ticket.mjs <ticket_id> "in
// review"`, called before the branch checkout — not here, because this script needs
// the right branch already checked out (for resolveChangeFromDirectoryListing below),
// and the lock must happen before that checkout can be allowed to fail. See
// scripts/lock-ticket.mjs's own header comment. The precondition below checks the
// POST-lock status.
const task = await getTask(ticketId);
assertStatus(task, 'in review');

// Written for the workflow's run-record step, same pattern as intake.mjs's
// ticket-meta.json — this script doesn't write to $GITHUB_ENV itself (it must stay
// runnable with no GitHub Actions environment present at all).
writeFileSync(`${RUNNER_TEMP}/ticket-meta.json`, JSON.stringify({ title: task.name ?? '' }));

// Review never installs the openspec CLI (unlike propose/implement/merge) — it only
// reads the change's own files directly, same as the original.
const specId = resolveChangeFromDirectoryListing();
console.log(`Resolved OpenSpec change: ${specId}`);
writeFileSync(`${RUNNER_TEMP}/spec-id.txt`, specId);
// .change-name in the repo root: prompts/review.md instructs Claude to read it directly
// ("Change id: `.change-name` in the repo root") — the RUNNER_TEMP copy above is only
// for the workflow's own SPEC_ID capture, not for the agent.
writeFileSync('.change-name', specId);
excludeLocally('.change-name');

writeFileSync('ticket.md', task.description ?? '');
excludeLocally('ticket.md');

const reviewResult = await runClaude({
  promptPath: PROMPT_PATH,
  allowedTools: ALLOWED_TOOLS,
  model: CLAUDE_MODEL,
  cwd: '.',
});
console.log(reviewResult.resultText);
writeFileSync(`${RUNNER_TEMP}/claude-usage.json`, JSON.stringify(reviewResult.usage));

const resultMatch = /^RESULT: *(.+)$/m.exec(reviewResult.resultText);
const result = resultMatch?.[1]?.trim();

if (result !== 'reviewed') {
  throw new Error(`claude's output has no RESULT: reviewed line — cannot confirm the review completed. Got: "${result ?? '(none)'}"`);
}

// Review body = everything printed except the RESULT: line itself.
const reviewBody = reviewResult.resultText
  .split('\n')
  .filter((line) => !line.startsWith('RESULT:'))
  .join('\n');

const bodyFile = `${RUNNER_TEMP}/review-body.txt`;
writeFileSync(bodyFile, reviewBody);

const branch = `poc/${ticketId}`;
await postPrReview(branch, bodyFile, GH_REPO);
const prUrl = await getPrUrl(branch, GH_REPO);

await postPlainComment(ticketId, `AI review posted.\n\nPR: ${prUrl}`);

console.log(`Ticket ${ticketId}: review posted to ${prUrl}.`);
console.log('OUTCOME=reviewed');
