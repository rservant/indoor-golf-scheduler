# Design Document: Availability Persistence Fix

## Overview

This design addresses the critical bug where player availability changes are not properly persisted when users navigate away from and return to the availability management interface. The issue stems from inconsistent data persistence patterns and lack of proper verification after write operations.

The fix involves implementing robust persistence verification, improving error handling, and ensuring data consistency across navigation events.

## Architecture

The availability persistence system follows a layered architecture:

```
AvailabilityManagementUI (Presentation Layer)
    ↓
PlayerManager (Business Logic Layer)  
    ↓
WeekRepository (Data Access Layer)
    ↓
LocalStorageRepository (Persistence Layer)
    ↓
Browser localStorage (Storage)
```

### Current Issues Identified

1. **Optimistic UI Updates**: The UI updates state before confirming persistence success
2. **Missing Verification**: No verification that localStorage writes actually succeeded
3. **Stale Data Loading**: UI may load cached data instead of fresh data from localStorage
4. **Race Conditions**: Concurrent operations can overwrite each other
5. **Incomplete Error Recovery**: Failed operations don't properly revert UI state

## Components and Interfaces

### Enhanced AvailabilityManagementUI

**Responsibilities:**
- Coordinate availability operations with proper persistence verification
- Implement pessimistic UI updates (update UI only after successful persistence)
- Handle error recovery and user feedback
- Ensure data freshness on navigation return

**Key Methods:**
```typescript
interface EnhancedAvailabilityManagementUI {
  // Core operations with verification
  togglePlayerAvailability(playerId: string, weekId: string): Promise<void>;
  setAllAvailable(weekId: string, available: boolean): Promise<void>;
  
  // Data management
  refreshFromPersistence(): Promise<void>;
  verifyDataConsistency(): Promise<boolean>;
  
  // Error handling
  handlePersistenceError(error: Error, operation: string): void;
  revertToLastKnownState(): Promise<void>;
}
```

### Enhanced PlayerManager

**Responsibilities:**
- Implement atomic availability operations
- Provide transaction-like behavior for bulk operations
- Verify persistence success before returning
- Handle rollback on partial failures

**Key Methods:**
```typescript
interface EnhancedPlayerManager {
  // Atomic operations
  setPlayerAvailabilityAtomic(playerId: string, weekId: string, available: boolean): Promise<void>;
  setBulkAvailabilityAtomic(weekId: string, playerIds: string[], available: boolean): Promise<void>;
  
  // Verification
  verifyAvailabilityPersisted(playerId: string, weekId: string, expected: boolean): Promise<boolean>;
  
  // Recovery
  rollbackAvailabilityChanges(weekId: string, originalState: Map<string, boolean>): Promise<void>;
}
```

### Enhanced WeekRepository

**Responsibilities:**
- Implement verified write operations
- Provide read-after-write consistency
- Handle concurrent access safely
- Maintain operation logs for debugging

**Key Methods:**
```typescript
interface EnhancedWeekRepository {
  // Verified operations
  setPlayerAvailabilityVerified(weekId: string, playerId: string, available: boolean): Promise<boolean>;
  setBulkAvailabilityVerified(weekId: string, updates: Map<string, boolean>): Promise<boolean>;
  
  // Consistency checks
  verifyDataIntegrity(weekId: string): Promise<boolean>;
  getLastModifiedTimestamp(weekId: string): Promise<Date>;
  
  // Recovery
  createBackup(weekId: string): Promise<string>;
  restoreFromBackup(weekId: string, backupId: string): Promise<boolean>;
}
```

## Data Models

### Availability Operation Context

```typescript
interface AvailabilityOperation {
  id: string;
  type: 'individual' | 'bulk_available' | 'bulk_unavailable';
  weekId: string;
  playerIds: string[];
  originalState: Map<string, boolean>;
  targetState: Map<string, boolean>;
  timestamp: Date;
  status: 'pending' | 'completed' | 'failed' | 'rolled_back';
}
```

### Persistence Verification Result

```typescript
interface PersistenceVerification {
  success: boolean;
  verifiedCount: number;
  totalCount: number;
  failedPlayerIds: string[];
  error?: string;
  timestamp: Date;
}
```

### Data Consistency Report

```typescript
interface ConsistencyReport {
  weekId: string;
  isConsistent: boolean;
  discrepancies: Array<{
    playerId: string;
    uiState: boolean;
    persistedState: boolean;
  }>;
  lastVerified: Date;
}
```

## Implementation Strategy

### Phase 1: Persistence Verification

1. **Implement Verified Write Operations**
   - Add read-after-write verification to WeekRepository
   - Ensure localStorage operations complete successfully
   - Add retry logic for failed writes

2. **Update PlayerManager Operations**
   - Replace optimistic updates with verified updates
   - Implement atomic bulk operations
   - Add rollback capability for partial failures

### Phase 2: UI State Management

1. **Implement Pessimistic UI Updates**
   - Update UI only after successful persistence
   - Show loading states during operations
   - Provide immediate feedback on failures

2. **Add Data Freshness Checks**
   - Always reload from persistence on navigation return
   - Implement cache invalidation strategies
   - Add timestamp-based staleness detection

### Phase 3: Error Handling and Recovery

1. **Enhanced Error Reporting**
   - Provide detailed error messages
   - Show which operations succeeded/failed
   - Offer retry and recovery options

2. **Automatic Recovery Mechanisms**
   - Detect and resolve data inconsistencies
   - Implement automatic retry with exponential backoff
   - Provide manual refresh options

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Availability Persistence Verification
*For any* availability change operation (individual toggle or bulk operation), the system should verify that the change was successfully written to localStorage and can be read back with the correct value.
**Validates: Requirements 1.1, 1.2, 1.3, 2.4**

### Property 2: UI Update After Persistence
*For any* availability operation, the UI should only update its display state after the persistence layer confirms the data has been successfully saved.
**Validates: Requirements 2.2, 4.1, 4.2**

### Property 3: Data Freshness After Navigation
*For any* navigation event away from and back to the availability management interface, the displayed data should match exactly what is stored in localStorage.
**Validates: Requirements 1.4, 2.3**

### Property 4: Bulk Operation Atomicity
*For any* bulk availability operation, either all player updates should succeed and be persisted, or all should fail and the system should revert to the original state.
**Validates: Requirements 1.5, 4.3**

### Property 5: Error Recovery and User Feedback
*For any* failed availability operation, the system should provide specific error information and offer appropriate recovery options (retry, manual save, or refresh).
**Validates: Requirements 1.6, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5**

### Property 6: Concurrent Operation Safety
*For any* set of concurrent availability operations on the same week, the final state should be consistent and reflect the last completed operation without data corruption.
**Validates: Requirements 4.5**

### Property 7: Operation Interruption Recovery
*For any* interrupted availability operation, the system should detect the interruption and reload the accurate state from localStorage to ensure data consistency.
**Validates: Requirements 4.4**

## Error Handling

### Error Categories

1. **localStorage Failures**
   - Storage quota exceeded
   - Browser security restrictions
   - Corrupted storage data

2. **Network/Timing Issues**
   - Concurrent access conflicts
   - Operation timeouts
   - Race conditions

3. **Data Integrity Issues**
   - Inconsistent state between UI and storage
   - Partial operation failures
   - Corrupted availability records

### Error Recovery Strategies

1. **Automatic Recovery**
   - Retry with exponential backoff
   - Automatic data refresh
   - Fallback to safe defaults

2. **User-Initiated Recovery**
   - Manual retry buttons
   - Force refresh options
   - Individual player save options

3. **Preventive Measures**
   - Operation queuing
   - State validation
   - Backup creation before bulk operations

## Testing Strategy

### Unit Testing Approach

**Focus Areas:**
- Individual component error handling
- Data validation and sanitization
- Edge cases in persistence operations
- Recovery mechanism functionality

**Key Test Cases:**
- localStorage write/read failures
- Partial bulk operation failures
- Concurrent operation handling
- Navigation state preservation

### Property-Based Testing Approach

**Testing Framework:** Jest with fast-check for property-based testing

**Property Test Configuration:**
- Minimum 100 iterations per property test
- Each test tagged with feature and property reference
- Comprehensive input generation for availability scenarios

**Generator Strategies:**
- Random player/week combinations
- Various availability state configurations
- Simulated failure conditions
- Concurrent operation scenarios

**Property Test Implementation:**
Each correctness property will be implemented as a property-based test that:
1. Generates random test scenarios
2. Executes availability operations
3. Verifies the expected behavior holds
4. Tests error conditions and recovery

### Integration Testing

**End-to-End Scenarios:**
- Complete availability management workflows
- Navigation and data persistence verification
- Error recovery user journeys
- Performance under concurrent operations

**Test Environment:**
- Browser localStorage simulation
- Controlled failure injection
- Multi-tab navigation simulation
- Network condition variations