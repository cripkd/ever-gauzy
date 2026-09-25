---
paths:
  - "apps/poc-e2e/tests/**"
  - "packages/ui-core/core/src/lib/services/auth/**"
  - "packages/ui-core/core/src/lib/services/store/**"
---

# Where session/auth state actually lives in this app

Confirmed by tracing the real frontend code, not assumed from a plausible
name — the session token is **not** written to `localStorage` and is not
reliably readable as a cookie from the frontend either:

- `store.service.ts`'s `token` setter only updates in-memory Akita state
  (`this.persistQuery.update({ token })`). Nothing in the frontend ever
  calls `localStorage.setItem('token', ...)` — confirmed with a repo-wide
  search, zero matches.
- `auth-strategy.service.ts` manages a `token` cookie on **logout** only
  (`deleteCookie('token', { SameSite: 'None', Secure: true })`); the
  frontend never sets it, only clears it.
- A `TokenInterceptor` reads `Store.token` (the in-memory value) to build
  the `Authorization` header on outgoing requests — that's the live
  mechanism, not any browser storage.

**A test needing the session token should capture it from the login API
response directly**, not from browser storage:

```ts
const [loginResponse] = await Promise.all([
  page.waitForResponse((res) => res.url().includes('/api/auth/login') && res.request().method() === 'POST'),
  page.locator('button[type="submit"]').click()
]);
const { token } = await loginResponse.json();
```

This is more robust than reading any storage location: it doesn't depend
on knowing exactly where (or whether) the browser ends up persisting the
token, only on the one place it's guaranteed to appear.

If this ever changes (a future refactor genuinely does add localStorage or
cookie persistence), verify against the actual setter/interceptor code
before updating this file — don't restore the old assumption from memory.
