#!/usr/bin/env node
// scripts/lock-ticket.mjs
//
// The dispatch lock every stage performs: optionally PUT a new status, then remove the
// for-ai tag. Deliberately separate from the stage scripts themselves — this needs only
// the ClickUp API, no git/filesystem access, which is exactly why the original bash
// always runs it BEFORE switching to the ticket's own (possibly nonexistent or stale)
// branch. If the branch switch fails afterward, the ticket is already locked, so a
// poller can't re-dispatch into the same failure forever; it falls through to a
// needs-human flag instead. Run this before any branch checkout, right after the
// initial checkout of the default branch (which is what makes scripts/lib/clickup.mjs
// importable at all).
import { putStatus, removeTag } from './lib/clickup.mjs';

const ticketId = process.argv[2];
const status = process.argv[3]; // optional — agent-merge.yml's own lock has no status PUT
if (!ticketId) {
  console.error('Usage: node scripts/lock-ticket.mjs <ticket_id> [status]');
  process.exit(1);
}

if (status) {
  await putStatus(ticketId, status);
  console.log(`Ticket ${ticketId}: moved to "${status}".`);
}

const tagCode = await removeTag(ticketId, 'for-ai');
console.log(`Ticket ${ticketId}: removed "for-ai" tag (HTTP ${tagCode}).`);
