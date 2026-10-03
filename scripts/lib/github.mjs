// scripts/lib/github.mjs
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function postPrReview(branch, bodyFile, repo) {
  await execFileAsync('gh', ['pr', 'review', branch, '--comment', '--body-file', bodyFile, '-R', repo]);
}

export async function getPrUrl(branch, repo) {
  const { stdout } = await execFileAsync('gh', ['pr', 'view', branch, '-R', repo, '--json', 'url', '--jq', '.url']);
  return stdout.trim();
}
