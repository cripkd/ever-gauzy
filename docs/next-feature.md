# Built: `propose.md` now consults `openspec/specs/` before exploring from scratch

**Status: shipped 2026-09-26**, as step 2 in `prompts/propose.md`. Bounded to
three cheap steps regardless of spec count (cheap id list → `## Purpose`-only
check for plausible name matches → full read only for the confirmed one) —
the scaling concern raised when this was discussed is addressed in the
prompt itself, not just this doc.

**Not yet done: real end-to-end verification.** No ticket has been proposed
against a real, non-trivial existing spec since this shipped. The test
vehicle below (the duplicate-task ticket) is the one planned to close that
gap — when it runs, check whether `propose.md` actually reads the existing
`task-assignment` spec and writes a Modified Capability, or still misses it.

## Context (as originally written, before the fix)

`openspec archive` ran for real for the first time on 2026-09-25, when ticket
`869f79f6r` ("R3") was merged. That produced a real, populated
`openspec/specs/task-assignment/spec.md` — the first time this file has ever
existed with real content (before, `openspec/specs/` held nothing but
`.gitkeep`).

This is the concrete arrival of what was previously a theoretical argument
(made earlier in the session that produced this doc) about OpenSpec's actual
differentiator: not the per-ticket proposal format, but the accumulating,
durable "living spec" that `archive` produces — a description of a
capability's current behavior that a *future* proposal can read as ground
truth, instead of re-deriving everything from the codebase from scratch every
time.

## The gap, confirmed

Checked directly: `prompts/propose.md` has zero mention of `openspec/specs`,
`openspec list --specs`, or any instruction to check for an existing
capability spec before treating a ticket as brand new. Every proposal this
pipeline has ever written was authored blind to this file — which was fine
when it was empty, but isn't anymore.

Also confirmed: `openspec list --specs --json` is a real, working CLI command
for exactly this purpose (ticket 1's own proposal.md cited it once,
informally — "`openspec list --specs` returns none" — but nothing in the
prompt instructs it).

Without this fix, the next ticket touching `task-assignment` will still
explore the codebase from zero and likely write another **New Capability**
section for something that already has a real spec — the exact failure mode
that made OpenSpec's archive step a "notional, unrealized" advantage rather
than a working one.

## The feature

Add an explicit early step to `prompts/propose.md` (before or alongside the
existing "explore the codebase" step):

> Before exploring code, run `openspec list --specs --json`. If a spec
> matching this ticket's domain already exists, read it as ground truth for
> current behavior — this is a **Modified Capability**, not a New one. Scope
> your investigation to what's actually changing relative to the existing
> spec (restating the whole requirement, per the existing MODIFIED-delta
> rule already in `propose.md`), instead of re-deriving the feature from the
> codebase as if nothing were known about it yet.

No new infrastructure needed — `propose.md` already has `Bash(openspec:*)`
in its `--allowed-tools`, so this is purely a prompt change.

## How to verify it actually works

Write a genuine small follow-up ticket on the `task-assignment` capability —
something that's a real **modification**, not new behavior. Candidate:

> "When an Employee explicitly removes themselves from a task they were
> auto-assigned to, don't re-add them if the task is later edited or
> duplicated."

(This maps to a real point the R3 review already raised and design.md
explicitly scoped as accepted, create-time-only behavior — a legitimate,
sensible next increment, not a contrived test case.)

Run it through `propose.md` with the new step in place and check whether it:

1. Actually runs `openspec list --specs --json` and finds
   `task-assignment/spec.md`.
2. Correctly classifies the change as **Modified**, not **New**.
3. Writes a spec delta that restates all six existing scenarios from the
   current spec plus the new one — not a from-scratch rewrite that silently
   drops or contradicts what's already there.

If all three hold, OpenSpec's archive-driven accumulation is actually
working as designed, not just structurally present.
