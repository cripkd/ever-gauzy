# Spec Delta

## Purpose

Governs which employees are assigned as members of a task at the moment it is created, including whether and when the creator is assigned to their own task by default.

## ADDED Requirements

### Requirement: Creator is auto-assigned when an Employee creates a task
When a task is created by a user acting as a plain Employee (i.e. `RequestContext.currentEmployeeId()` resolves to a non-null employee id — the same signal the codebase already uses to distinguish an Employee acting for themselves from an Admin/Manager acting on someone else's behalf), the system SHALL include that employee in the created task's member/assignee list, in addition to any members explicitly supplied in the request, without duplication.

When the requesting user has no resolvable employee id in context (`RequestContext.currentEmployeeId()` is `null` — covering both an Admin/Manager acting on someone else's behalf, and any caller with no associated employee record, such as a system/integration-triggered creation with no authenticated employee request context), the system SHALL NOT add anyone automatically; the created task's member list SHALL be exactly the members explicitly supplied in the request (including empty, if none were supplied).

#### Scenario: Employee creates a task without selecting any members
- **WHEN** a user with the Employee role submits a new task with an empty members list
- **THEN** the created task's member list contains exactly that employee

#### Scenario: Employee creates a task and also explicitly selects other members
- **WHEN** a user with the Employee role submits a new task with a members list containing one or more other employees, not including themselves
- **THEN** the created task's member list contains that employee plus every explicitly-selected employee

#### Scenario: Employee explicitly selects themselves as a member
- **WHEN** a user with the Employee role submits a new task whose members list already includes their own employee id
- **THEN** the created task's member list contains that employee exactly once, not duplicated

#### Scenario: Admin or Manager creates a task on behalf of another employee
- **WHEN** a user holding the permission to change the selected employee (acting as Admin/Manager, not for themselves) submits a new task with an explicit members list
- **THEN** the created task's member list is exactly the explicitly-selected members; the creator is not added automatically

#### Scenario: Admin or Manager creates a task with no members selected
- **WHEN** a user holding the permission to change the selected employee submits a new task with an empty members list
- **THEN** the created task is created with no members, matching current behavior — the system does not guess who should be assigned

#### Scenario: Requesting user has no associated employee record
- **WHEN** a task is created by a request with no resolvable current employee id (for example, a synced task created by an integration with no authenticated employee context)
- **THEN** the created task's member list is exactly the members explicitly supplied in the request; no automatic assignment is attempted and creation does not fail because of the missing employee id
