// scripts/lib/e2e-classify.mjs
//
// Ports agent-react-to-e2e.yml:314-349's classification. `detail` is the bullet-point
// list only (file/title/error per failure) — the caller assembles the final message
// around it (kind sentence + "Run: <url>" + this detail), since the kind text is a
// pure function of failureClass and the run URL isn't this module's concern.
export function classifyFailure(failures, newSpecBasename) {
  const newSpecFailing = newSpecBasename
    ? failures.some((f) => f.file === newSpecBasename)
    : false;

  const failureClass = newSpecFailing ? 'did-not-do-task' : 'collateral-breakage';
  const relevant = newSpecFailing ? failures.filter((f) => f.file === newSpecBasename) : failures;

  // Matches the original's `sed -E 's/\x1b\[[0-9;]*m//g'` — strip ANSI color codes
  // Playwright's own error output can carry.
  const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
  const detail = relevant
    .map((f) => strip(`- ${f.file} — ${f.title}\n  ${f.error}`))
    .join('\n');

  return { failureClass, detail };
}
