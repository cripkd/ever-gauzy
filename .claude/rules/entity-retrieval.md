---
paths:
  - "packages/core/src/lib/**/*.handler.ts"
  - "packages/core/src/lib/**/*.service.ts"
---

# Command handlers and services: entity references and permission scoping

## An id is a claim, not a fact

When resolving an id into a reference to another entity — a user, an
employee, a record, anything looked up by id rather than passed by value —
validate it through that entity's own service rather than constructing an
unchecked stub object from the bare id. This holds even when the id comes
from a trusted-seeming source (the current session, `RequestContext`, a JWT
claim) rather than raw client input: "this is the current user's own id"
tells you the id is authentic, not that the row it names still exists. A
stub silently persists a dangling reference if the row behind the id is
stale, deleted, or wrong — regardless of how trustworthy the id's origin
was; a real lookup surfaces that immediately.

- **Don't**: `members.push(new Employee({ id: employeeId }))` — including
  when `employeeId` came from `RequestContext.currentEmployeeId()` rather
  than the request body.
- **Don't** (confirmed a real, shipped bug, not theoretical):
  `const employee = await this._employeeService.findOneByIdString(employeeId); if (employee) members.push(employee);`
  — this *looks* like a validated lookup, but `CrudService`'s
  `findOneByIdString`/`findOneByOptions` (`crud.service.ts`) throws
  `NotFoundException` when nothing matches; it never resolves to `null` or
  falsy. The `if (employee)` guard is dead code. A real, posted review
  caught exactly this: an unhandled `NotFoundException` propagates to the
  handler's outer `catch` and turns the *entire request* into a hard
  failure — often a worse outcome than the stub it was meant to replace,
  and the opposite of "degrade gracefully" if that's the intended
  behavior here.
- **Do**: wrap the lookup in its own `try`/`catch` and decide deliberately
  what a missing entity means for *this* request — re-throw a clear error
  if the whole operation should fail, or log-and-continue without adding
  the reference if graceful degradation is the intended behavior (state
  which one explicitly; don't leave it implicit). Match whatever
  error-handling convention the surrounding file already uses rather than
  inventing a new one — the point is a deliberate decision either way, not
  a specific shape.

## State role/permission scoping explicitly

If a handler's behavior could plausibly differ by role, permission, or
caller identity, that scoping must be a stated requirement, not an
incidental side effect of whichever utility function an implementation
happens to call. Two independent implementations of the same fix have
diverged on this exact point: one correctly excluded Admin/Manager by
accident, via `RequestContext.currentEmployeeId()`'s own unrelated
behavior; the other used `RequestContext.currentUser().employeeId`
directly — which does *not* go through the same permission check — and
silently lost the exclusion.

- **Don't**: `const employeeId = user.employeeId;` (bypasses the
  permission-aware helper, so an Admin/Manager acting on someone else's
  behalf gets the same treatment as an Employee acting for themselves).
- **Do**: `const employeeId = RequestContext.currentEmployeeId();` — this
  already returns `null` for anyone holding
  `PermissionsEnum.CHANGE_SELECTED_EMPLOYEE`, the codebase's existing way
  of distinguishing an Employee acting for themselves from an Admin/Manager
  acting on someone else's behalf.
