// scripts/lib/lock-args.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLockArgs } from './lock-args.mjs';

test('parses ticket id alone (merge: tag-only, no expect/set)', () => {
  assert.deepEqual(parseLockArgs(['869fbdayz']), { ticketId: '869fbdayz', expectStatus: null, setStatus: null });
});

test('parses --expect and --set (review/implement: guarded status transition)', () => {
  assert.deepEqual(
    parseLockArgs(['869fbdayz', '--expect', 'ready for review', '--set', 'in review']),
    { ticketId: '869fbdayz', expectStatus: 'ready for review', setStatus: 'in review' }
  );
});

test('parses --expect alone (merge: guarded, but no status change)', () => {
  assert.deepEqual(
    parseLockArgs(['869fbdayz', '--expect', 'in review']),
    { ticketId: '869fbdayz', expectStatus: 'in review', setStatus: null }
  );
});

test('throws when ticket id is missing', () => {
  assert.throws(() => parseLockArgs([]), /ticket_id is required/);
});
