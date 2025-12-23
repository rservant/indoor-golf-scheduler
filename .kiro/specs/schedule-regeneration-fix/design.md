# Design Document: Schedule Regeneration Fix

## Overview

This design addresses the critical bug where users cannot regenerate existing schedules due to a conflict detection mechanism that prevents overwriting existing schedule data. The current system treats schedule regeneration as a creation operation, causing it to fail when a schedule already exists for a given week.

The fix involves implementing a proper regeneration workflow that includes user confirmation, backup creation, atomic replacement operations, and comprehensive error recovery. This ensures users can update schedules when needed while protecting against accidental data loss.

## Architecture

The schedule regeneration system follows a transactional approach with the following flow:

```
User Interface (Regenerate Button)
    ↓
Schedule Manager (Confirmation & Orchestration)
    ↓
Backup Service (Create Safety Copy)
    ↓
Schedule Generator (Create New Schedule)
    ↓
Schedule Repository (Atomic Replacement)
    ↓
localStorage (Persistent Storage)
```

### Current Issues Identified

1. **No Overwrite Capability**: System treats regeneration as creation, failing when schedules exist
2. **Missing User Confirmation**: No warning before potentially destructive operations
3. **No Backup System**: Risk of losing existing schedules if regeneration fails
4. **Non-Atomic Operations**: Partial failures can leave schedules in inconsistent states
5. **Poor Error Recovery**: Failed operations don't restore original state

## Components and Interfaces

### Enhanced Schedule Manager

**Responsibilities:**
- Orchestrate the complete regeneration workflow
- Handle user confirmation and feedback
- Coordinate backup creation and restoration
- Ensure atomic schedule replacement

**Key Methods:**
```typescript
interface EnhancedScheduleManager {
  // Core regeneration workflow
  regenerateSchedule(weekId: string, options?: RegenerationOptions): Promise<RegenerationResult>;
  confirmRegenerationOverwrite(weekId: string): Promise<boolean>;
  
  // Backup management
  createScheduleBackup(weekId: string): Promise<string>;
  restoreFromBackup(weekId: string, backupId: string): Promise<void>;
  
  // Status tracking
  getRegenerationStatus(weekId: string): RegenerationStatus;
  setRegenerationLock(weekId: string, locked: boolean): Promise<void>;
}
```

### Schedule Backup Service

**Responsibilities:**
- Create timestamped backups before regeneration
- Manage backup lifecycle and cleanup
- Provide restoration capabilities
- Handle backup storage and retrieval

**Key Methods:**
```typescript
interface ScheduleBackupService {
  // Backup operations
  createBackup(schedule: Schedule): Promise<BackupMetadata>;
  restoreBackup(backupId: string): Promise<Schedule>;
  
  // Backup management
  listBackups(weekId: string): Promise<BackupMetadata[]>;
  cleanupOldBackups(weekId: string): Promise<void>;
  
  // Validation
  validateBackup(backupId: string): Promise<boolean>;
}
```

### Enhanced Schedule Repository

**Responsibilities:**
- Implement atomic schedule replacement operations
- Handle concurrent access protection
- Provide transaction-like behavior for schedule updates
- Maintain data consistency during operations

**Key Methods:**
```typescript
interface EnhancedScheduleRepository {
  // Atomic operations
  replaceScheduleAtomic(weekId: string, newSchedule: Schedule, backupId: string): Promise<void>;
  
  // Locking mechanism
  acquireScheduleLock(weekId: string): Promise<boolean>;
  releaseScheduleLock(weekId: string): Promise<void>;
  
  // Status management
  setScheduleStatus(weekId: string, status: ScheduleStatus): Promise<void>;
  getScheduleStatus(weekId: string): Promise<ScheduleStatus>;
}
```

## Data Models

### Regeneration Options

```typescript
interface RegenerationOptions {
  preserveManualEdits?: boolean;
  forceOverwrite?: boolean;
  backupRetentionDays?: number;
  notifyOnCompletion?: boolean;
}
```

### Regeneration Result

```typescript
interface RegenerationResult {
  success: boolean;
  newScheduleId?: string;
  backupId?: string;
  error?: string;
  changesDetected: {
    playersAdded: string[];
    playersRemoved: string[];
    pairingChanges: number;
    timeSlotChanges: number;
  };
  operationDuration: number;
}
```

### Backup Metadata

```typescript
interface BackupMetadata {
  id: string;
  weekId: string;
  originalScheduleId: string;
  createdAt: Date;
  size: number;
  checksum: string;
  description: string;
}
```

### Regeneration Status

```typescript
interface RegenerationStatus {
  weekId: string;
  status: 'idle' | 'confirming' | 'backing_up' | 'generating' | 'replacing' | 'completed' | 'failed';
  progress: number; // 0-100
  currentStep: string;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}
```

### Schedule Status

```typescript
interface ScheduleStatus {
  weekId: string;
  exists: boolean;
  locked: boolean;
  lastModified: Date;
  hasManualEdits: boolean;
  regenerationCount: number;
}
```

## Implementation Strategy

### Phase 1: Backup System Implementation

1. **Create Backup Service**
   - Implement schedule serialization and storage
   - Add backup metadata tracking
   - Create restoration mechanisms

2. **Integrate with Schedule Repository**
   - Add backup creation to existing operations
   - Implement cleanup policies
   - Add validation and integrity checks

### Phase 2: Regeneration Workflow

1. **Implement Confirmation System**
   - Add user confirmation dialogs
   - Show impact analysis (what will change)
   - Provide cancellation options

2. **Create Regeneration Orchestrator**
   - Implement step-by-step workflow
   - Add progress tracking and status updates
   - Handle error conditions and rollback

### Phase 3: Atomic Operations

1. **Implement Schedule Locking**
   - Add concurrent access protection
   - Prevent modifications during regeneration
   - Handle lock timeouts and cleanup

2. **Create Atomic Replacement**
   - Implement transaction-like schedule updates
   - Ensure consistency during operations
   - Add rollback capabilities for failures

### Phase 4: User Experience Enhancements

1. **Progress Indicators**
   - Show regeneration progress to users
   - Provide real-time status updates
   - Display estimated completion times

2. **Error Recovery Interface**
   - Offer retry options for failed operations
   - Show detailed error information
   - Provide manual recovery options

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Regeneration Operation Allowance
*For any* week with an existing schedule, clicking "Regenerate" should allow the regeneration operation to proceed without blocking due to existing schedule conflicts.
**Validates: Requirements 1.1**

### Property 2: Backup Creation and Restoration
*For any* regeneration operation, a timestamped backup should be created before generating the new schedule, and if the operation fails at any point, the original schedule should be automatically restored from backup.
**Validates: Requirements 1.2, 1.4, 3.1, 3.2**

### Property 3: Atomic Schedule Replacement
*For any* successful regeneration operation, the existing schedule should be replaced with the newly generated one atomically, and the schedule's last modified timestamp should be updated.
**Validates: Requirements 1.3, 1.5, 4.4**

### Property 4: User Confirmation Workflow
*For any* regeneration attempt on an existing schedule, a confirmation dialog should be displayed with appropriate warnings (including enhanced warnings for manually edited schedules), and the operation should proceed only on confirmation or abort on cancellation.
**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

### Property 5: Backup Management
*For any* series of regeneration operations, the system should maintain the most recent successful backup, clean up old backup data after successful operations, and abort regeneration if backup creation fails.
**Validates: Requirements 3.3, 3.4, 3.5**

### Property 6: Operation Locking and Data Currency
*For any* regeneration operation, the schedule should be marked as "regenerating" to prevent concurrent modifications, use current player availability and preferences for generation, and validate the new schedule meets all constraints before replacement.
**Validates: Requirements 4.1, 4.2, 4.3**

### Property 7: Operation Completion and Cleanup
*For any* completed regeneration operation (successful or failed), the "regenerating" status should be cleared and the UI should be notified to refresh.
**Validates: Requirements 4.5**

### Property 8: User Feedback and Progress Tracking
*For any* regeneration operation, appropriate UI feedback should be provided including loading indicators during progress, prevention of other modifications with messaging, and comprehensive notifications for success, failure, and restoration events.
**Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**

## Error Handling

### Error Categories

1. **Backup Creation Failures**
   - Insufficient storage space
   - localStorage access restrictions
   - Data serialization errors

2. **Schedule Generation Failures**
   - Insufficient available players
   - Constraint satisfaction impossible
   - Algorithm timeout or errors

3. **Atomic Replacement Failures**
   - Concurrent modification conflicts
   - Storage write failures
   - Data validation errors

4. **System State Errors**
   - Lock acquisition failures
   - Status tracking inconsistencies
   - UI notification failures

### Error Recovery Strategies

1. **Automatic Recovery**
   - Restore from backup on any failure
   - Clear locks and status on timeout
   - Retry operations with exponential backoff

2. **User-Initiated Recovery**
   - Manual retry options with different parameters
   - Force unlock for stuck operations
   - Manual backup restoration interface

3. **Preventive Measures**
   - Pre-validation of constraints before regeneration
   - Storage space checks before backup creation
   - Concurrent operation detection and queuing

## Testing Strategy

### Unit Testing Approach

**Focus Areas:**
- Individual component error handling
- Backup creation and restoration mechanisms
- Atomic operation implementation
- User confirmation workflow logic

**Key Test Cases:**
- Backup service reliability under various failure conditions
- Schedule replacement atomicity verification
- Lock management and timeout handling
- User interface state management during operations

### Property-Based Testing Approach

**Testing Framework:** Jest with fast-check for property-based testing

**Property Test Configuration:**
- Minimum 100 iterations per property test
- Each test tagged with feature and property reference
- Comprehensive input generation for regeneration scenarios

**Generator Strategies:**
- Random schedule configurations with varying complexity
- Various player availability and preference combinations
- Simulated failure conditions at different operation stages
- Concurrent operation scenarios and timing variations

**Property Test Implementation:**
Each correctness property will be implemented as a property-based test that:
1. Generates random test scenarios with existing schedules
2. Executes regeneration operations under various conditions
3. Verifies the expected behavior holds across all scenarios
4. Tests error conditions and recovery mechanisms
5. Validates user interface feedback and state management

### Integration Testing

**End-to-End Scenarios:**
- Complete regeneration workflows from user action to completion
- Error recovery and backup restoration verification
- Concurrent operation handling and conflict resolution
- User experience validation across different failure modes

**Test Environment:**
- Browser localStorage simulation with controlled failures
- Mock user interaction for confirmation dialogs
- Simulated timing conditions for race condition testing
- Performance validation under various schedule sizes