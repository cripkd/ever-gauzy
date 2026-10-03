// scripts/lib/claude-runner.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractUsage } from './claude-runner.mjs';

test('extractUsage pulls fields from a one-shot json result', () => {
  const sample = {
    session_id: 's1', modelUsage: { 'claude-sonnet-5': {} }, total_cost_usd: 0.42,
    usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 1, cache_creation_input_tokens: 2 },
    num_turns: 3, duration_ms: 1000,
  };
  const usage = extractUsage(sample);
  assert.equal(usage.model, 'claude-sonnet-5');
  assert.equal(usage.cost_usd, 0.42);
  assert.equal(usage.input_tokens, 10);
});
