# Merge triage

A ticket has already been implemented and reviewed. Your only job is to decide
whether it's actually ready to merge — not to review it yourself, not to fix
anything. You are answering one question: given the review that was posted and
the code as it stands right now, does anything concrete still need a code
change?

Change id: `.change-name` in the repo root. Ticket context (supplementary —
the OpenSpec artifacts are authoritative, not this): `ticket.md`. Review
content (required — the workflow guarantees this file exists and is
non-empty before you run; may be more than one round, may have already been
partly or fully addressed since it was posted): `.review-comments.md`.

## Why this exists

`in review` is the one ClickUp status where the same human gesture (re-adding
`for-ai`) has to route to two different next steps: apply the review feedback,
or merge because there's nothing left to apply. Nothing in this pipeline
posts a structured approve/request-changes signal (`agent-review.yml` always
posts via `gh pr review --comment`), so this decision has to come from
actually reading the review and the diff, not from a status field.

## Steps

1. `openspec status --change "<name>" --json` — read `contextFiles`.
2. Read the proposal and spec delta under `contextFiles` — the approved spec
   is what "correct" means here, same as `review.md`'s own framing.
3. Read `.review-comments.md` in full. It may contain more than one review
   round; read all of them, in order.
4. `git diff` against the default branch (`git log`/`git show` as needed) —
   look at the code **as it stands right now**, not as it stood when the
   review was posted. A concern may already have been fixed by a later
   apply-review pass.
5. Classify every concern raised in the review into one of three buckets:
   - **Already resolved** — the current diff does what the reviewer asked.
   - **Doesn't need a code change** — praise, a question you can answer in
     your own note below, something already true, explicitly out of scope,
     a style or phrasing preference, or (matching what `review.md` itself is
     told not to block on) a case where the implementation is narrower or
     wider than the approved spec without actually being wrong.
   - **A real, unaddressed, in-scope gap** — something concrete a Playwright
     test or a careful read of the diff would show still doesn't match the
     approved spec.
6. `RESULT: ready-to-merge` only if every concern falls into the first two
   buckets. `RESULT: needs-changes` if even one falls into the third.

## The bar for `needs-changes`

`ready-to-merge` is the common, expected outcome of a healthy pipeline —
not a fallback for when nothing else seems worth pointing at. A review with
nothing left to fix is success, not an incomplete triage pass. Do not
manufacture or stretch a concern into the third bucket just to have
something to report; when genuinely unsure whether something belongs in the
second or third bucket, that uncertainty itself is not grounds for
`needs-changes` — put it in the second bucket and say why in your note.
This mirrors `apply-review.md` ("a no-op is a valid successful outcome
here") and `propose-critique.md` ("a proposal with no real gaps is a
legitimate, common outcome — do not invent a change to have something to
point at").

## Constraints

- Read-only. No edits, no commits, no pushes, no PR or ClickUp actions —
  this is a triage decision, not a fix. If you conclude `needs-changes`, a
  separate, already-existing run (`apply-review.md`) does the actual work.
- `openspec` CLI (status, instructions) and `git diff`/`log`/`show` are the
  only Bash you have; nothing else.

## Output

Before the final contract lines, briefly note (a few lines, free text) how
each review concern was classified. Not machine-parsed, but what a human
skimming the run log sees.

Then print exactly these two lines at the end, nothing after them:

TICKET: <id>
RESULT: needs-changes | ready-to-merge
