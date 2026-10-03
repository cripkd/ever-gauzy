#!/usr/bin/env node
// scripts/stages/propose.mjs
//
// Scope note: this script assumes it is invoked AFTER the ticket branch already exists
// and is checked out, and it does NOT commit/push/open a PR itself — those remain the
// workflow's job for now (agent-propose.yml's branch-creation API dance and PR-opening
// bash are not ported in this round; see the plan's "Explicitly deferred" section).
// This script is accordingly not yet wired into agent-propose.yml — it stands alone,
// ready for that follow-up to call it.
import { getTask, putStatus, postMarkdownComment } from '../lib/clickup.mjs';
import { assertStatus } from '../lib/precondition.mjs';
import { runClaude } from '../lib/claude-runner.mjs';
import { writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const ticketId = process.argv[2];
if (!ticketId) {
  console.error('Usage: node scripts/stages/propose.mjs <ticket_id>');
  process.exit(1);
}

const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';
const RUNNER_TEMP = process.env.RUNNER_TEMP ?? '.';
const ALLOWED_TOOLS = 'Read,Write,Edit,Glob,Grep,Bash(openspec:*)';

// This script assumes it runs AFTER the dispatch-lock status PUT (today's
// agent-propose.yml:96-135, left in the workflow) — the precondition here checks for
// the POST-lock status, exactly as today's bash does before it ever reaches the
// "Run the propose agent" step.
const task = await getTask(ticketId);
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
  // A second, separately-framed pass over the just-written proposal — see
  // prompts/propose-critique.md's own header for why. Only meaningful against a real
  // proposal, matching agent-propose.yml:404's `if: steps.agent.outputs.result == 'proposed'`.
  const critiqueResult = await runClaude({
    promptPath: 'prompts/propose-critique.md',
    allowedTools: ALLOWED_TOOLS,
    model: CLAUDE_MODEL,
    cwd: '.',
  });
  console.log(critiqueResult.resultText);
}

// Resolve SPEC_ID the same lenient way agent-propose.yml:486 does: whichever
// non-archive change dir exists first, or empty string if none at all — deliberately
// NOT scripts/lib/openspec.mjs's resolveChangeFromDirectoryListing, which requires
// exactly one and throws otherwise. At this point in the flow a scope violation or an
// early Claude failure may have left zero or more than one change dir, and the original
// bash still wants to record whatever it finds, not throw.
function resolveSpecIdLeniently() {
  if (!existsSync('openspec/changes')) return '';
  const entries = readdirSync('openspec/changes', { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== 'archive');
  return entries[0]?.name ?? '';
}
const specId = resolveSpecIdLeniently();
console.log(`SPEC_ID=${specId}`);

// Verify nothing changed outside openspec/ (agent-propose.yml:476-516) — a safety check
// independent of what Claude claims to have done, run regardless of the proposal's
// outcome above.
const { stdout: statusOut } = await execFileAsync('git', ['status', '--porcelain', '--untracked-files=all']);
const outOfScope = statusOut
  .split('\n')
  .filter((line) => line.length > 0)
  .map((line) => line.slice(3))
  .filter((path) => !path.startsWith('openspec/'));

if (outOfScope.length > 0) {
  console.error('Files changed outside openspec/:');
  console.error(outOfScope.join('\n'));
  await execFileAsync('git', ['config', 'user.name', 'github-actions[bot]']);
  await execFileAsync('git', ['config', 'user.email', 'github-actions[bot]@users.noreply.github.com']);
  await execFileAsync('git', ['add', '-A']);
  await execFileAsync('git', ['commit', '-m', `Scope violation for ${ticketId} — left for inspection, not opened as a PR`]);
  await execFileAsync('git', ['push', 'origin', `poc/${ticketId}`]);
  throw new Error(`Scope violation: files changed outside openspec/ — committed and pushed to poc/${ticketId} for inspection.`);
}

if (result === 'insufficient-detail') {
  // Prefer the actual proposal.md this run wrote (if any) over the raw Claude output,
  // same preference order as agent-propose.yml:525-530 — a real written artifact is
  // more useful to a human than the model's own narration about writing one.
  const { stdout: statusOut2 } = await execFileAsync('git', ['status', '--porcelain', '--untracked-files=all']);
  const proposalPath = statusOut2
    .split('\n')
    .map((line) => line.slice(3))
    .find((path) => path.endsWith('/proposal.md'));

  const commentSource = (proposalPath && existsSync(proposalPath))
    ? readFileSync(proposalPath, 'utf8')
    : proposeResult.resultText;
  const commentText = commentSource.slice(0, 3000);

  await putStatus(ticketId, 'in spec');
  await postMarkdownComment(ticketId, commentText);

  console.log(`Ticket ${ticketId}: insufficient detail — reverted to "in spec", commented, no PR.`);
  console.log('OUTCOME=insufficient-detail');
  process.exit(0);
}

console.log(`result=${result}`);
console.log('OUTCOME=proposed-pending-pr');
