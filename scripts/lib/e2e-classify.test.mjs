// scripts/lib/e2e-classify.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyFailure } from './e2e-classify.mjs';

test('new spec failing classifies as did-not-do-task', () => {
  const failures = [{ file: 'new.spec.ts', title: 'x', error: 'boom' }];
  const { failureClass } = classifyFailure(failures, 'new.spec.ts');
  assert.equal(failureClass, 'did-not-do-task');
});

test('a different spec failing classifies as collateral-breakage', () => {
  const failures = [{ file: 'other.spec.ts', title: 'x', error: 'boom' }];
  const { failureClass } = classifyFailure(failures, 'new.spec.ts');
  assert.equal(failureClass, 'collateral-breakage');
});
