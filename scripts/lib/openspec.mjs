// scripts/lib/openspec.mjs
import { readdirSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export function resolveChangeFromDirectoryListing(changesDir = 'openspec/changes') {
  const entries = readdirSync(changesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== 'archive');
  if (entries.length !== 1) {
    throw new Error(
      `Expected exactly one active OpenSpec change in ${changesDir}, found ${entries.length}: ` +
      entries.map((e) => e.name).join(', ')
    );
  }
  return entries[0].name;
}

export async function resolveChangeFromCli() {
  const { stdout } = await execFileAsync('openspec', ['list', '--json']);
  const parsed = JSON.parse(stdout);
  const changes = parsed.changes ?? [];
  if (changes.length !== 1) {
    throw new Error(
      `Expected exactly one active OpenSpec change, found ${changes.length}: ` +
      changes.map((c) => c.name).join(', ')
    );
  }
  return changes[0].name;
}
