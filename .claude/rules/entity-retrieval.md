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
- **Do**: `const employee = await this._employeeService.findOneByIdString(employeeId); if (employee) members.push(employee);`
  — wrapped in the surrounding code's existing error-handling convention (a
  try/catch with a logged error and a clear failure response is typical in
  this codebase; match whatever the file you're editing already does,
  don't invent a new pattern).

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
