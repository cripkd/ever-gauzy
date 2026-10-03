// scripts/lib/git-local.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { excludeLocally } from './git-local.mjs';

function makeFakeRepo() {
  const root = mkdtempSync(join(tmpdir(), 'git-local-test-'));
  mkdirSync(join(root, '.git', 'info'), { recursive: true });
  writeFileSync(join(root, '.git', 'info', 'exclude'), '');
  return root;
}

test('excludeLocally appends the given path to .git/info/exclude', () => {
  const root = makeFakeRepo();
  excludeLocally('ticket.md', root);
  const contents = readFileSync(join(root, '.git', 'info', 'exclude'), 'utf8');
  assert.match(contents, /^ticket\.md$/m);
});

test('excludeLocally can append more than one path without clobbering the first', () => {
  const root = makeFakeRepo();
  excludeLocally('ticket.md', root);
  excludeLocally('.change-name', root);
  const contents = readFileSync(join(root, '.git', 'info', 'exclude'), 'utf8');
  assert.match(contents, /^ticket\.md$/m);
  assert.match(contents, /^\.change-name$/m);
});
