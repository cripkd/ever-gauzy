#!/usr/bin/env node
// scripts/lock-ticket.mjs
//
// The dispatch lock every stage performs: optionally verify the ticket is at an expected
// status, PUT a new status, then remove the for-ai tag. Deliberately separate from the
// stage scripts themselves — this needs only the ClickUp API, no git/filesystem access,
// which is exactly why the original bash always runs it BEFORE switching to the ticket's
// own (possibly nonexistent or stale) branch. If the branch switch fails afterward, the
// ticket is already locked, so a poller can't re-dispatch into the same failure forever;
// it falls through to a needs-human flag instead. Run this before any branch checkout,
// right after the initial checkout of the default branch (which is what makes
// scripts/lib/clickup.mjs importable at all).
//
// --expect <status>: the spec's locally-required precondition check (no poller to guard
// this path otherwise) — MUST run here, before the PUT, not in the stage script that
// runs after the branch switch: by the time that script's own assertStatus call fires,
// this lock has usually already changed the status, making a later check tautological.
// Omit --expect only when the caller has no meaningful pre-lock status to check.
//
// Usage: node scripts/lock-ticket.mjs <ticket_id> [--expect <status>] [--set <status>]
import { getTask, putStatus, removeTag } from './lib/clickup.mjs';
import { assertStatus } from './lib/precondition.mjs';
import { parseLockArgs } from './lib/lock-args.mjs';

let ticketId, expectStatus, setStatus;
try {
  ({ ticketId, expectStatus, setStatus } = parseLockArgs(process.argv.slice(2)));
} catch {
  console.error('Usage: node scripts/lock-ticket.mjs <ticket_id> [--expect <status>] [--set <status>]');
  process.exit(1);
}

if (expectStatus) {
  const task = await getTask(ticketId);
  assertStatus(task, expectStatus);
}

if (setStatus) {
  await putStatus(ticketId, setStatus);
  console.log(`Ticket ${ticketId}: moved to "${setStatus}".`);
}

// Best-effort, matching the original bash's `|| true` on every tag-removal call: a
// failed DELETE here must not suppress the workflow's own "flag for a human" catch-all,
// which is gated on this step having succeeded.
try {
  const tagCode = await removeTag(ticketId, 'for-ai');
  console.log(`Ticket ${ticketId}: removed "for-ai" tag (HTTP ${tagCode}).`);
} catch (err) {
  console.warn(`::warning::removeTag failed, continuing: ${err.message}`);
}
