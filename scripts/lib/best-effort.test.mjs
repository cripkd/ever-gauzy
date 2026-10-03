// scripts/lib/best-effort.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestEffort } from './best-effort.mjs';

test('bestEffort returns the resolved value on success', async () => {
  const result = await bestEffort(() => Promise.resolve('ok'), 'test op');
  assert.equal(result, 'ok');
});

test('bestEffort swallows a rejection and returns undefined, not throwing', async () => {
  const result = await bestEffort(() => Promise.reject(new Error('boom')), 'test op');
  assert.equal(result, undefined);
});
