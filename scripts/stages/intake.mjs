#!/usr/bin/env node
// scripts/stages/intake.mjs
import { writeFileSync, mkdirSync, readFileSync, cpSync, existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
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
const RUNNER_TEMP = process.env.RUNNER_TEMP ?? tmpdir();

const task = await getTask(ticketId);

// Written unconditionally, before the guard branches — the original bash captures
// TICKET_TITLE the same way, right after its own "Fetch the task" step, regardless of
// which path the guard below takes. The workflow reads this for its run-record step;
// without it, TICKET_TITLE would silently go missing from every run-record this script
// produces, a real behavioral regression against the bash it replaces.
writeFileSync(`${RUNNER_TEMP}/ticket-meta.json`, JSON.stringify({ title: task.name ?? '' }));

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

const workdir = `${RUNNER_TEMP}/agent-intake-${ticketId}`;
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

const prompt = readFileSync('prompts/intake-rewrite.md', 'utf8');
const claudeOutput = await execFileAsync('claude', [
  '-p', prompt,
  '--model', CLAUDE_MODEL,
  '--allowed-tools', 'Read,Write',
  '--max-turns', '8',
  '--output-format', 'stream-json', '--verbose',
], { cwd: workdir, maxBuffer: 1024 * 1024 * 50 });

// Usage/cost capture for the workflow's run-record step — written as a file, not
// $GITHUB_ENV, so this script stays runnable with no GitHub Actions environment at all.
try {
  const lastLine = claudeOutput.stdout.trim().split('\n').pop();
  const parsed = JSON.parse(lastLine);
  const usage = {
    session_id: parsed.session_id ?? '',
    model: Object.keys(parsed.modelUsage ?? {}).pop() ?? '',
    cost_usd: parsed.total_cost_usd ?? '',
    input_tokens: parsed.usage?.input_tokens ?? '',
    output_tokens: parsed.usage?.output_tokens ?? '',
    cache_read_tokens: parsed.usage?.cache_read_input_tokens ?? '',
    cache_creation_tokens: parsed.usage?.cache_creation_input_tokens ?? '',
    num_turns: parsed.num_turns ?? '',
    duration_ms: parsed.duration_ms ?? '',
  };
  writeFileSync(`${RUNNER_TEMP}/claude-usage.json`, JSON.stringify(usage));
} catch {
  // Best-effort, matching the original bash's `|| true` on this same extraction —
  // losing usage data must never fail an otherwise-successful run.
}

if (!existsSync(`${workdir}/rewritten.md`)) {
  throw new Error(`rewritten.md was not produced (or is empty) for ticket ${ticketId}`);
}
const rewritten = readFileSync(`${workdir}/rewritten.md`, 'utf8');

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
