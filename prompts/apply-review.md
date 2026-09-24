# Apply review feedback

You are revisiting an OpenSpec change you (or a prior run) already implemented in
full. A reviewer has since read the diff and left comments. Your job is to address
those comments — not to re-plan, not to redesign, and not to re-verify `tasks.md`
items the review doesn't implicate.

Change id: `.change-name` in the repo root. Ticket context (supplementary — the
OpenSpec artifacts are authoritative, not this): `ticket.md`. Review content
(required — the workflow guarantees this file exists and is non-empty before you
run): `.review-comments.md`.

## Steps

1. `openspec status --change "<name>" --json` — read `contextFiles`, `schemaName`.
2. `openspec instructions apply --change "<name>" --json` — read `contextFiles`
   (proposal, spec delta, design if present, tasks).
3. Read every file listed under `contextFiles` before touching anything — the
   approved spec is still what "correct" means here. The review is a report on
   where the last attempt fell short of it, not a new source of requirements.
4. Read `.review-comments.md` in full. It may contain more than one review round;
   read all of them, in order.
5. For each concern raised:
   - If it's clear and actionable, and satisfying it stays within what the approved
     spec already describes: fix it. Keep the change scoped to what the comment
     actually asks — don't use this as an opportunity to also fix unrelated things
     you notice, and don't touch tasks.md checkboxes for items the comment doesn't
     implicate.
   - If it's unclear, asks for a judgment call, or conflicts with the approved spec
     (e.g. "I think this should work differently" when the spec already specifies
     the behavior you implemented): do not guess or pick a side. See "When to stop
     instead of continuing" below.
   - If, after reading every comment, none of them actually require a code change
     (pure praise, a question you can answer in your summary, something already
     true, or explicitly out of scope for this change) — that's a legitimate
     outcome. Don't invent a change just to have something to point at.

## When to stop instead of continuing

Same discipline as any other run in this pipeline. Stop and report `blocked`,
rather than guess, if:

- A comment is ambiguous — it doesn't say enough to act on one way rather than
  another.
- A comment asks for something the approved spec doesn't cover or contradicts.
- Addressing a comment would require behavior other than what the approved spec
  states.

There is no human on the other end of this run to ask. If the approved spec and
the review comment can't both be satisfied, this run stops rather than inventing
an answer either way — a human reads the reasoning and decides.

## Constraints

- **Do not run the test suite, commit, push, open or edit the PR, or run
  `openspec archive`.** The workflow does all of that after you exit.
- You may run `openspec` CLI commands (status, instructions, validate); nothing
  else in Bash.
- Do not re-check or un-check `tasks.md` items the review doesn't implicate —
  it's already an accurate record of the original implementation pass.

## Output

Before the final contract lines, briefly note (a few lines, free text) which
comments you addressed and which, if any, you left unaddressed and why. This
isn't machine-parsed, but it's what a human reads to understand what happened.

Then print exactly these three lines at the end, nothing after them:

TICKET: <id>
CHANGE: <name>
RESULT: implemented | blocked

`implemented` once every actionable comment has been addressed (or, if none were
actionable, immediately — a no-op is a valid successful outcome here). Otherwise
`blocked`, even if some comments were already addressed — partial progress is
still `blocked`; the workflow decides what to do with whatever exists on disk.
