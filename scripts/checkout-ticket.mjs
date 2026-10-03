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
