// scripts/lib/git-local.mjs
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';

// Appends `path` to the repo's .git/info/exclude — the same per-checkout, never-tracked
// ignore mechanism the original bash used for every derived/scratch file (ticket.md,
// .change-name, .review-comments.md, .ci-failure.md) so `git add -A` never sweeps them
// into a real commit. `root` defaults to the current working directory; tests pass a
// temp directory so this never touches the real repo's own exclude file.
export function excludeLocally(path, root = '.') {
  appendFileSync(join(root, '.git', 'info', 'exclude'), `${path}\n`);
}
