## Purpose

Recording and maintaining an organization's expenses, including assigning an expense to a
client contact and to a project so that spend can be attributed and billed.

## ADDED Requirements

### Requirement: Edit Expense modal pre-populates the Assign to fields

When an existing expense is opened for editing, the Edit Expense modal SHALL display the
expense's saved contact and project as the selected values of the Contact and Project
fields in the "Assign to" section. A field whose expense has no saved value SHALL continue
to display its placeholder.

#### Scenario: Contact is shown for an expense assigned to a contact

- **WHEN** a user opens the Edit Expense modal for an expense saved with an organization
  contact
- **THEN** the Contact field in the "Assign to" section displays that contact's name as its
  selected value, not placeholder text

#### Scenario: Project is shown for an expense assigned to a project

- **WHEN** a user opens the Edit Expense modal for an expense saved with a project
- **THEN** the Project field in the "Assign to" section displays that project's name as its
  selected value, not placeholder text

#### Scenario: Both fields are shown together

- **WHEN** a user opens the Edit Expense modal for an expense saved with both an
  organization contact and a project
- **THEN** the Contact field displays the saved contact's name and the Project field
  displays the saved project's name

#### Scenario: Unassigned expense still shows placeholders

- **WHEN** a user opens the Edit Expense modal for an expense saved with neither an
  organization contact nor a project
- **THEN** the Contact field displays its placeholder text and the Project field displays
  its placeholder text, and no contact or project is selected

#### Scenario: Partially assigned expense shows only the saved value

- **WHEN** a user opens the Edit Expense modal for an expense saved with a project but no
  organization contact
- **THEN** the Project field displays that project's name and the Contact field displays its
  placeholder text

### Requirement: Saving an edited expense preserves an untouched assignment

Saving the Edit Expense modal without interacting with the "Assign to" fields SHALL leave
the expense's contact and project assignment exactly as it was before the modal was opened.

#### Scenario: Editing an unrelated field keeps the assignment

- **WHEN** a user opens the Edit Expense modal for an expense assigned to a contact and a
  project, changes only the amount, and saves
- **THEN** the expense is saved with the same contact and the same project, and reopening
  the modal shows both still selected

#### Scenario: Saving with no edits at all keeps the assignment

- **WHEN** a user opens the Edit Expense modal for an expense assigned to a contact and a
  project and saves without changing anything
- **THEN** the expense's contact and project are unchanged, and the Project column of the
  expenses table still shows that project's name

### Requirement: Assignment can be changed from the Edit Expense modal

A user SHALL be able to select a different contact or project in the "Assign to" section of
the Edit Expense modal, and SHALL be able to clear a populated Contact or Project field. The
saved expense SHALL reflect the selection made when the modal was saved.

#### Scenario: Selecting a different project

- **WHEN** a user opens the Edit Expense modal for an expense assigned to one project,
  selects a different project from the Project dropdown, and saves
- **THEN** the expense is saved with the newly selected project, and reopening the modal
  shows the newly selected project

#### Scenario: Selecting a different contact

- **WHEN** a user opens the Edit Expense modal for an expense assigned to one organization
  contact, selects a different contact from the Contact dropdown, and saves
- **THEN** the expense is saved with the newly selected contact, and reopening the modal
  shows the newly selected contact

#### Scenario: Clearing a populated contact

- **WHEN** a user opens the Edit Expense modal for an expense whose type is not "Billable to
  Contact" and which is assigned to an organization contact, clears the Contact field, and
  saves
- **THEN** the expense is saved with no organization contact, and reopening the modal shows
  the Contact field displaying its placeholder

#### Scenario: Clearing a populated project

- **WHEN** a user opens the Edit Expense modal for an expense assigned to a project, clears
  the Project field, and saves
- **THEN** the expense is saved with no project, and reopening the modal shows the Project
  field displaying its placeholder

### Requirement: Add Expense opens with an empty Assign to section

Opening the Add Expense modal SHALL leave the Contact and Project fields unselected,
regardless of any expense previously selected in the expenses table or any contact or
project chosen in the page's filters.

#### Scenario: Add after selecting an assigned expense

- **WHEN** a user selects an expense that is assigned to a contact and a project, then opens
  the Add Expense modal
- **THEN** the Contact field and the Project field both display their placeholder text and
  neither has a value selected
