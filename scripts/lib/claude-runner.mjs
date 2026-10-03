// scripts/lib/claude-runner.mjs
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';

const execFileAsync = promisify(execFile);

export function extractUsage(resultObj) {
  return {
    session_id: resultObj.session_id ?? '',
    model: Object.keys(resultObj.modelUsage ?? {}).pop() ?? resultObj.model ?? '',
    cost_usd: resultObj.total_cost_usd ?? resultObj.cost_usd ?? '',
    input_tokens: resultObj.usage?.input_tokens ?? resultObj.input_tokens ?? '',
    output_tokens: resultObj.usage?.output_tokens ?? resultObj.output_tokens ?? '',
    cache_read_tokens: resultObj.usage?.cache_read_input_tokens ?? resultObj.cache_read_tokens ?? '',
    cache_creation_tokens: resultObj.usage?.cache_creation_input_tokens ?? resultObj.cache_creation_tokens ?? '',
    num_turns: resultObj.num_turns ?? '',
    duration_ms: resultObj.duration_ms ?? '',
  };
}

export async function runClaude({ promptPath, allowedTools, model, cwd, maxTurns, outputFormat = 'json' }) {
  const prompt = readFileSync(promptPath, 'utf8');
  const args = ['-p', prompt, '--model', model, '--allowed-tools', allowedTools];
  if (maxTurns) args.push('--max-turns', String(maxTurns));
  if (outputFormat === 'stream-json') {
    args.push('--output-format', 'stream-json', '--verbose');
  } else {
    args.push('--output-format', 'json');
  }

  let stdout;
  try {
    const res = await execFileAsync('claude', args, { cwd, maxBuffer: 1024 * 1024 * 100 });
    stdout = res.stdout;
  } catch (err) {
    // Best-effort usage extraction even on a non-zero exit — err.stdout carries
    // whatever claude printed before failing, same as the bash's `|| claude_exit=$?`
    // pattern that still `cat`s and parses $output_file afterward.
    let usage = {};
    try {
      const line = outputFormat === 'stream-json'
        ? err.stdout.trim().split('\n').pop()
        : err.stdout;
      usage = extractUsage(JSON.parse(line));
    } catch { /* output wasn't valid JSON at all — nothing to extract */ }
    const e = new Error(`claude exited with a non-zero status: ${err.message}`);
    e.usage = usage;
    e.rawOutput = err.stdout;
    throw e;
  }

  const lastLine = outputFormat === 'stream-json' ? stdout.trim().split('\n').pop() : stdout;
  const parsed = JSON.parse(lastLine);
  const resultText = parsed.result ?? '';
  return { resultText, raw: parsed, usage: extractUsage(parsed) };
}
