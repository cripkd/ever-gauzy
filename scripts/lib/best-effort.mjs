// scripts/lib/best-effort.mjs
//
// Wraps a call the original bash made with `|| true` — a failure there must not abort
// the run, only get logged. Every clickup.mjs/github.mjs helper throws on a real
// failure by design (so a genuine, should-fail call reports clearly); this is for the
// specific call sites where the ORIGINAL bash deliberately ignored the failure because
// the real work was already done (e.g. posting a pointer comment after a merge already
// succeeded) or because losing this one side effect isn't worth aborting an otherwise-
// successful run.
export async function bestEffort(fn, label) {
  try {
    return await fn();
  } catch (err) {
    console.warn(`::warning::${label} failed, continuing: ${err.message}`);
    return undefined;
  }
}
