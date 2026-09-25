# Spec Delta

## Purpose

Task assignment governs which employees are members/assignees of a task at
the moment it is created, including the guarantee that the employee who
created the task is always one of them.

## ADDED Requirements

### Requirement: Creator is always assigned to a task they create
When an employee creates a task, the system SHALL include that employee
among the task's assignees/members, regardless of which other employees
were also explicitly selected as members and regardless of which
task-creation screen was used.

#### Scenario: Employee creates a task without selecting any other members
- **WHEN** a logged-in Employee creates a new task without explicitly
  selecting any other members and saves it
- **THEN** the created task's assignee list includes that Employee

#### Scenario: Employee creates a task and also assigns other employees
- **WHEN** a logged-in Employee creates a new task, explicitly selects one
  or more other employees as members, and saves it
- **THEN** the created task's assignee list includes both the creating
  Employee and every explicitly selected employee

#### Scenario: Creator explicitly re-selects themselves as a member
- **WHEN** a logged-in Employee creates a new task and explicitly includes
  themselves in the selected members before saving
- **THEN** the created task's assignee list includes that Employee exactly
  once
