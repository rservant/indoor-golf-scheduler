# Requirements Document

## Introduction

This specification addresses a critical bug in the Indoor Golf Scheduler application where users cannot regenerate existing schedules. When attempting to regenerate a schedule for a week that already has a schedule, the system displays an error message "Schedule already exists for week_[ID]" and prevents the regeneration operation. This blocks users from updating schedules when player availability changes or when they want to optimize pairings.

## Glossary

- **Schedule_Manager**: The service responsible for managing schedule creation, updates, and regeneration operations
- **Schedule_Repository**: The data access layer responsible for persisting schedule data to localStorage
- **Regeneration_Operation**: The process of creating a new schedule for a week that already has an existing schedule
- **Schedule_Overwrite**: Replacing an existing schedule with a newly generated one
- **Backup_Schedule**: A copy of the original schedule created before regeneration for recovery purposes
- **User_Confirmation**: Explicit user approval required before overwriting existing schedules

## Requirements

### Requirement 1: Schedule Regeneration Capability

**User Story:** As a golf scheduler, I want to regenerate existing schedules, so that I can update them when player availability changes or when I want to optimize pairings.

#### Acceptance Criteria

1. WHEN a user clicks "Regenerate" on a week with an existing schedule, THE Schedule_Manager SHALL allow the regeneration operation to proceed
2. WHEN regenerating an existing schedule, THE Schedule_Manager SHALL create a backup of the current schedule before generating the new one
3. WHEN a regeneration operation completes successfully, THE Schedule_Manager SHALL replace the existing schedule with the newly generated one
4. WHEN regeneration fails, THE Schedule_Manager SHALL restore the original schedule from backup and display an error message
5. WHEN a schedule is regenerated, THE Schedule_Manager SHALL update the schedule's last modified timestamp

### Requirement 2: User Confirmation for Schedule Overwrite

**User Story:** As a golf scheduler, I want to be warned before overwriting existing schedules, so that I don't accidentally lose work or finalized schedules.

#### Acceptance Criteria

1. WHEN a user attempts to regenerate an existing schedule, THE Schedule_Manager SHALL display a confirmation dialog explaining the consequences
2. WHEN the confirmation dialog is shown, THE Schedule_Manager SHALL indicate what data will be lost (current pairings, manual edits)
3. WHEN a user confirms the regeneration, THE Schedule_Manager SHALL proceed with the overwrite operation
4. WHEN a user cancels the regeneration, THE Schedule_Manager SHALL abort the operation and maintain the existing schedule
5. WHERE a schedule has been manually edited, THE Schedule_Manager SHALL provide additional warnings about losing custom changes

### Requirement 3: Backup and Recovery System

**User Story:** As a golf scheduler, I want the ability to recover from failed regenerations, so that I don't lose existing schedules if something goes wrong.

#### Acceptance Criteria

1. WHEN starting a regeneration operation, THE Schedule_Repository SHALL create a timestamped backup of the existing schedule
2. WHEN a regeneration operation fails at any point, THE Schedule_Repository SHALL automatically restore the schedule from the most recent backup
3. WHEN multiple regeneration attempts occur, THE Schedule_Repository SHALL maintain the most recent successful backup
4. WHEN a regeneration completes successfully, THE Schedule_Repository SHALL clean up old backup data to prevent storage bloat
5. IF backup creation fails, THEN THE Schedule_Manager SHALL abort the regeneration operation and display an error message

### Requirement 4: Regeneration Operation Integrity

**User Story:** As a golf scheduler, I want regeneration operations to be reliable, so that the system maintains data consistency and doesn't leave schedules in a broken state.

#### Acceptance Criteria

1. WHEN a regeneration operation begins, THE Schedule_Manager SHALL mark the schedule as "regenerating" to prevent concurrent modifications
2. WHEN generating the new schedule, THE Schedule_Manager SHALL use the current player availability and preferences
3. WHEN the new schedule is ready, THE Schedule_Manager SHALL validate it meets all constraints before replacing the existing schedule
4. WHEN replacing the existing schedule, THE Schedule_Repository SHALL perform the update atomically to prevent partial updates
5. WHEN the regeneration completes, THE Schedule_Manager SHALL clear the "regenerating" status and notify the UI to refresh

### Requirement 5: Error Handling and User Feedback

**User Story:** As a golf scheduler, I want clear feedback during regeneration operations, so that I understand what's happening and can respond appropriately to any issues.

#### Acceptance Criteria

1. WHEN a regeneration operation starts, THE Schedule_Manager SHALL display a loading indicator with progress information
2. WHEN regeneration is in progress, THE Schedule_Manager SHALL prevent other schedule modifications and display appropriate messaging
3. WHEN regeneration fails due to insufficient players or constraints, THE Schedule_Manager SHALL provide specific error messages with suggested actions
4. WHEN regeneration succeeds, THE Schedule_Manager SHALL display a success message and highlight what changed in the new schedule
5. WHEN backup restoration occurs, THE Schedule_Manager SHALL notify the user that the original schedule has been restored due to the failure