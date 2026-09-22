# Spec Delta

## Purpose

Governs who a task is assigned to: the assignee defaults offered when a task is
created, and how an explicit choice by the creator overrides those defaults.

## ADDED Requirements

### Requirement: Task creation defaults the assignee to the creator

When a task is created by a user who can only act on their own behalf — a user
who has an employee profile and cannot select a different employee in the
global employee filter — the system SHALL offer that user's own employee
profile as the task's assignee, pre-selected and visible in the task creation
form before the task is saved. The pre-selection SHALL be a default the creator
can change: whatever assignees remain in the form when it is saved are the
assignees the created task has. Users who can act for other employees SHALL NOT
have any assignee pre-selected.

#### Scenario: Creator sees themselves pre-selected

- **WHEN** a signed-in Employee opens the Add Task form on the Tasks Dashboard
- **THEN** the form's employee assignee control shows that Employee's own name
  as a selected value, before anything else is filled in

#### Scenario: Saving without touching the assignee assigns the creator

- **WHEN** a signed-in Employee opens the Add Task form on the Tasks Dashboard,
  enters a task title, leaves the assignee control untouched, and saves
- **THEN** the task is created and the Tasks Dashboard list row for that task
  names that Employee in its members column

#### Scenario: Creator clears the default and gets an unassigned task

- **WHEN** a signed-in Employee opens the Add Task form on the Tasks Dashboard,
  enters a task title, removes their own name from the assignee control leaving
  it empty, and saves
- **THEN** the task is created and the Tasks Dashboard list row for that task
  names nobody in its members column

#### Scenario: Creator replaces the default with another employee

- **WHEN** a signed-in Employee opens the Add Task form on the Tasks Dashboard,
  enters a task title, replaces their own name in the assignee control with a
  different employee, and saves
- **THEN** the task is created and the Tasks Dashboard list row for that task
  names only that other employee in its members column, not the creator

#### Scenario: A user who can act for other employees gets no pre-selection

- **WHEN** a signed-in user who can select a different employee in the global
  employee filter — such as an Admin or Super Admin — opens the Add Task form
  on the Tasks Dashboard
- **THEN** the form's employee assignee control shows no selected employee

#### Scenario: A creator without an employee profile gets no pre-selection

- **WHEN** a signed-in user who has no employee profile opens the Add Task form
  on the Tasks Dashboard
- **THEN** the form's employee assignee control shows no selected employee, and
  saving a task from it creates a task whose members column names nobody
