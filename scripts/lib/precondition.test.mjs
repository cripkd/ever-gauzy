// scripts/lib/precondition.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertStatus } from './precondition.mjs';

test('assertStatus passes when status matches', () => {
  assert.doesNotThrow(() => assertStatus({ id: 'x', status: { status: 'to do' } }, 'to do'));
});

test('assertStatus throws when status does not match', () => {
  assert.throws(
    () => assertStatus({ id: 'x', status: { status: 'in progress' } }, 'to do'),
    /is at status "in progress", expected "to do"/
  );
});
