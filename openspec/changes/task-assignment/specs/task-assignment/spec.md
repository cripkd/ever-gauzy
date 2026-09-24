# Spec Delta

## Purpose

Ensures a task created by an employee is automatically assigned to that
employee, so a creator never has to add themselves to their own task by hand.

## ADDED Requirements

### Requirement: Creator is assigned to a task they create
When a user with the Employee role creates a task through the task creation
form and does not explicitly select any members before saving, the system
SHALL include that employee in the created task's members.

#### Scenario: Employee creates a task without picking any members
- **WHEN** a user with the Employee role opens the task creation form, enters
  a task title, selects no members, and saves the task
- **THEN** the created task's members list includes the employee who created
  it

#### Scenario: Assignment is visible on the created task
- **WHEN** the employee from the scenario above opens the task they just
  created
- **THEN** their own name is shown in that task's assigned members
