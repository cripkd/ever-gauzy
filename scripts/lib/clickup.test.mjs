// scripts/lib/clickup.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markdownToBlocks } from './clickup.mjs';

test('markdownToBlocks converts a heading to a bold block, matching the shared converter script', async () => {
  // Expected shape confirmed by running the real .github/scripts/markdown-to-clickup-comment.mjs
  // directly against this exact input — this pins markdownToBlocks to that script's real
  // behavior (including the trailing-newline-produces-an-extra-blank-block quirk of a
  // plain split('\n') on a string ending in \n), not a guessed shape.
  const blocks = await markdownToBlocks('# Title\n');
  assert.deepEqual(blocks, [
    { text: 'Title', attributes: { bold: true } },
    { text: '\n', attributes: {} },
    { text: '\n', attributes: {} },
  ]);
});
