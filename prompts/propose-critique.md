# Propose critique

A proposal for one OpenSpec change was just written — by a separate,
already-finished run, not by you in this conversation. Your only job is to
find what it missed and either fix it or flag it. You are not drafting a
proposal; one already exists. Read it as an adversarial reviewer would,
not as its author.

Change id: `.change-name` in the repo root. Ticket context (supplementary —
the OpenSpec artifacts are authoritative, not this): `ticket.md`.

## Why this exists

Two independent proposal runs against the very same bug report produced two
different, each-incompletely-scoped fixes — one missed that the fix should
apply to every entry point into the affected code, not just the one the
reporter used; the other missed that the fix needed to exclude a role the
first one happened to exclude, by accident, as a side effect of an unrelated
utility function. Neither proposal's own author caught its own gap — a
proposal reviewing itself in the same pass it was written in is exactly what
already didn't work. This is the second, differently-framed pass that does
what the first one couldn't do for itself.

## Steps

1. `openspec status --change "<name>" --json` — read `contextFiles`.
2. Read every file listed under `contextFiles` (proposal, spec delta,
   design if present, tasks) in full before forming any opinion.
3. Check specifically for these three gap classes — not a general
   "does this look reasonable" pass:

   - **Uncovered entry points.** Does "Impact" name every caller of the
     affected function/command/handler, or only the one path the ticket's
     reproduction steps happened to describe? Grep for other callers
     yourself; don't take the proposal's own account of its scope as
     complete.
   - **Unstated role/permission scoping.** If the fix's behaviour could
     plausibly differ by role, permission, or caller identity, does the
     proposal say so explicitly — as a requirement — or does it leave that
     to whichever utility function an implementation happens to reach for?
   - **Unhandled failure modes.** Does "Impact" (or the spec delta's
     scenarios) address what happens when a referenced entity doesn't
     exist, a lookup fails, or an input is invalid — or does it only
     describe the happy path? Check this as **two separate questions**,
     not one: (1) can the id ever be missing/null, and (2) can the id be
     present and still fail to resolve to a real row. A spec that only
     answers (1) — e.g. "this id always comes from the authenticated
     session, so it's never missing" — has not answered (2); a
     session-derived id is authentic, not proof the row behind it still
     exists. Confirmed necessary, not theoretical: a real critique run
     checked only (1), concluded the failure-mode gap class didn't apply,
     and missed that the implementation it approved never validated the
     id against a real lookup at all.
4. For each gap found, decide which of two things it is:

   - **An objective completeness gap** — a real entry point, role
     distinction, or failure mode the proposal should have addressed and
     didn't, where the right fix is uncontroversial (name the missing
     entry point; state the role scoping the ticket's own framing already
     implies; add a "when the lookup fails" scenario). Fix it directly:
     revise `proposal.md`, the spec delta, and `tasks.md` so they're
     internally consistent with the fix. This is still editing an
     existing proposal, not writing a new one — keep everything else
     about it intact.
   - **A genuine open design question** — a tradeoff a human should
     decide, not something you can resolve by reading the ticket more
     carefully. Do not guess. Add (or append to) an "## Open Questions"
     section in `proposal.md` stating the question and why it matters,
     for the human to resolve when they review this proposal. Do not
     revise the spec delta or tasks around a guessed answer to it.
5. If, after checking all three gap classes, none apply, make no changes.
   A proposal with no real gaps is a legitimate, common outcome — do not
   invent a change to have something to point at.
6. Run `openspec validate --strict` if you changed anything, and fix
   anything it reports.

## Constraints

- **Nothing outside `openspec/` may be created or modified.** Same rule
  the original proposal followed.
- Do not redesign the proposal's fundamental approach (e.g. swap a
  backend fix for a frontend one) — critique and complete the scope it
  already chose, don't replace it. A disagreement that deep is itself an
  open design question (step 4), not something to silently rewrite.
- Do not touch requirements, scenarios, or tasks that aren't implicated
  by one of the three gap classes above. This is a targeted completeness
  pass, not a second full review of writing quality or style.
- Do not commit, push, or open a PR — the workflow does that regardless
  of whether you changed anything.
- You may run `openspec` CLI commands (status, instructions, validate);
  nothing else in Bash.

## Output

Before the final contract line, briefly note what you checked and what,
if anything, you found — free text, not machine-parsed, but what a human
skimming the run log sees.

Then print exactly these two lines at the end, nothing after them:

TICKET: <id>
RESULT: revised | no-changes-needed
