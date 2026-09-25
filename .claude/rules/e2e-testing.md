---
paths:
  - "apps/poc-e2e/tests/**"
---

# Writing a Playwright spec

## Assert you've landed where you meant to

After every `page.goto()` or in-app navigation, assert you've actually
landed where you meant to — a heading, breadcrumb, or route-specific
element — *before* interacting with anything on that page. Playwright's own
locator actions already wait for an element to become actionable; that's
not what a silent misnavigation needs. A test that jumps straight to
`page.locator(...).click()` after navigating will, if the app lands
somewhere else, fail 30 seconds later on an unrelated element that was
simply never going to appear — an opaque "button never appeared" instead of
an immediate, legible "never reached this page." Fail at the navigation,
not at whatever happens to time out next.

## Poll for async-persisted state, don't read it once

Same principle one level deeper for anything read via `page.evaluate()` —
`localStorage`, `sessionStorage`, cookies, a global JS variable. A DOM
assertion passing (an element became visible) proves the UI updated; it
does not prove an asynchronously-persisted piece of app state has also
settled. Playwright's auto-wait doesn't cover this because it isn't a
locator. Poll for it (`expect.poll(...)` or an equivalent retry) rather
than reading it once immediately after an unrelated visibility check.

That fixes state that's genuinely there but not yet settled. A different,
more basic failure is asserting against client-side state that was never
going to appear at all, because it doesn't actually live where a comment or
a prior spec assumed — see `frontend-session-state.md` for a real,
confirmed case of exactly this. No amount of polling fixes an assertion
against a location the app never writes to; verify where the state
actually lives (trace the real write path in the frontend code) before
asserting against it.

## Trace whether a pre-existing path could already produce the result

Before trusting a new spec as a regression guard, trace whether any
*pre-existing* code path could produce the same observable outcome the spec
asserts on, independent of the change under test — not just whether the
spec passes. A spec that would pass identically with this ticket's fix
reverted isn't proof of anything, however green it runs. This pipeline
doesn't run task 1 in isolation before the fix lands, so nothing else
catches this automatically. Concretely: check whether the UI state the
spec drives through (a pre-filled field, a default selection, an existing
fallback) could already produce the asserted result on its own — if so,
either steer the spec around that path (hit the behavior somewhere the
pre-existing default can't reach, e.g. the API directly, or a caller that
doesn't get the default) or narrow the assertion to something only the new
logic could produce.
