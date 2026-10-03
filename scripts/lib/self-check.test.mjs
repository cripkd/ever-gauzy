// scripts/lib/self-check.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveChangedProjects } from './self-check.mjs';

test('a file under openspec/ resolves to the repo root pseudo-project, not crashed on', () => {
  // Confirmed against this repo's real state: the root project.json (name "ever-gauzy")
  // is the nearest ancestor for any openspec/ path — matches agent-implement.yml's own
  // comment exactly ("resolves only as far as the workspace root's own 'ever-gauzy'
  // pseudo-project... harmless to include", since that pseudo-project defines no
  // lint/typecheck/build target for runSelfCheck to act on).
  const { pairs, projects } = resolveChangedProjects(['openspec/changes/does-not-matter/proposal.md']);
  assert.deepEqual(projects, ['ever-gauzy']);
  assert.deepEqual(pairs, [{ project: 'ever-gauzy', file: 'openspec/changes/does-not-matter/proposal.md' }]);
});

test('a file under a real project resolves to that project name', () => {
  const { pairs, projects } = resolveChangedProjects(['apps/poc-e2e/tests/login.spec.ts']);
  assert.deepEqual(projects, ['poc-e2e']);
  assert.deepEqual(pairs, [{ project: 'poc-e2e', file: 'apps/poc-e2e/tests/login.spec.ts' }]);
});

test('files from two different projects both resolve, each to their own project', () => {
  const { projects } = resolveChangedProjects([
    'apps/poc-e2e/tests/login.spec.ts',
    'openspec/changes/does-not-matter/proposal.md',
  ]);
  assert.deepEqual(projects, ['poc-e2e', 'ever-gauzy']);
});
