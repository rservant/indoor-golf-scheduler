# Indoor Golf Scheduler Design Document

## Overview

The Indoor Golf Scheduler is a web-based application that digitizes and optimizes the manual Excel-based golf scheduling process. The system manages multiple seasons, tracks player preferences and availability, and automatically generates optimal weekly schedules that minimize repeat pairings while balancing time slots and forming complete foursomes.

The application follows a clean architecture pattern with clear separation between data persistence, business logic, and user interface layers. The core scheduling algorithm uses constraint satisfaction and optimization techniques to generate schedules that meet all business rules while maximizing player satisfaction.

## Architecture

The system uses a layered architecture with the following components:

### Presentation Layer
- Web-based user interface built with modern JavaScript framework
- Responsive design supporting desktop and tablet usage
- Real-time schedule visualization and editing capabilities

### Business Logic Layer
- Season management service
- Player management service  
- Schedule generation engine with optimization algorithms
- Partner pairing history tracking
- Constraint validation and conflict resolution

### Data Access Layer
- Repository pattern for data abstraction
- Support for local storage and potential database backends
- Data serialization and persistence management

### External Interfaces
- Export functionality for various formats (PDF, Excel, CSV)
- Import capabilities for player data migration

## Components and Interfaces

### Season Manager
```typescript
interface SeasonManager {
  createSeason(name: string, startDate: Date, endDate: Date): Season
  getActiveSeason(): Season | null
  setActiveSeason(seasonId: string): void
  getAllSeasons(): Season[]
  deleteSeason(seasonId: string): void
}
```

### Player Manager
```typescript
interface PlayerManager {
  addPlayer(player: PlayerInfo): Player
  updatePlayer(playerId: string, updates: Partial<PlayerInfo>): Player
  removePlayer(playerId: string): void
  getPlayer(playerId: string): Player | null
  getAllPlayers(seasonId: string): Player[]
  setPlayerAvailability(playerId: string, weekId: string, available: boolean): void
}
```

### Schedule Generator
```typescript
interface ScheduleGenerator {
  generateSchedule(weekId: string, availablePlayers: Player[]): Schedule
  optimizePartnerPairings(schedule: Schedule, pairingHistory: PairingHistory): Schedule
  balanceTimeSlots(schedule: Schedule): Schedule
  validateSchedule(schedule: Schedule): ValidationResult
}
```

### Schedule Manager
```typescript
interface ScheduleManager {
  createWeeklySchedule(weekId: string): Schedule
  getSchedule(weekId: string): Schedule | null
  updateSchedule(weekId: string, schedule: Schedule): Schedule
  exportSchedule(weekId: string, format: ExportFormat): ExportResult
  getScheduleHistory(seasonId: string): Schedule[]
}
```

## Data Models

### Season
```typescript
interface Season {
  id: string
  name: string
  startDate: Date
  endDate: Date
  isActive: boolean
  createdAt: Date
  playerIds: string[]
  weekIds: string[]
}
```

### Player
```typescript
interface Player {
  id: string
  firstName: string
  lastName: string
  handedness: 'left' | 'right'
  timePreference: 'AM' | 'PM' | 'Either'
  seasonId: string
  createdAt: Date
}
```

### Week
```typescript
interface Week {
  id: string
  seasonId: string
  weekNumber: number
  date: Date
  playerAvailability: Record<string, boolean> // playerId -> available
  scheduleId?: string
}
```

### Schedule
```typescript
interface Schedule {
  id: string
  weekId: string
  timeSlots: {
    morning: Foursome[]
    afternoon: Foursome[]
  }
  createdAt: Date
  lastModified: Date
}
```

### Foursome
```typescript
interface Foursome {
  id: string
  players: Player[]
  timeSlot: 'morning' | 'afternoon'
  position: number // ordering within time slot
}
```

### PairingHistory
```typescript
interface PairingHistory {
  seasonId: string
  pairings: Record<string, number> // "playerId1-playerId2" -> count
  lastUpdated: Date
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

After analyzing the acceptance criteria, several properties can be consolidated to eliminate redundancy while maintaining comprehensive validation coverage:

**Property 1: Season data round trip**
*For any* valid season data (name, start date, end date), creating a season and then retrieving it should return equivalent data with all fields preserved
**Validates: Requirements 1.1, 1.2**

**Property 2: Active season context isolation**
*For any* set of seasons, setting one as active should ensure all subsequent operations (player management, scheduling) operate only within that season's context
**Validates: Requirements 1.3, 1.4**

**Property 3: Player data integrity**
*For any* valid player data, adding a player and then retrieving it should return equivalent data, and updates should preserve data integrity across all existing schedules
**Validates: Requirements 2.1, 2.2, 2.3**

**Property 4: Player removal graceful handling**
*For any* player in existing schedules, removing that player should not cause system errors and should handle the removal gracefully
**Validates: Requirements 2.4**

**Property 5: Schedule completeness and uniqueness**
*For any* set of available players, a generated schedule should assign each player to exactly one time slot and exactly one foursome
**Validates: Requirements 3.1, 3.5**

**Property 6: Time preference respect**
*For any* player with AM or PM preference, that player should only be assigned to their preferred time slot in generated schedules
**Validates: Requirements 3.2, 6.1**

**Property 7: Foursome prioritization**
*For any* set of players, the scheduling algorithm should maximize the number of complete foursomes (groups of 4) over smaller groups
**Validates: Requirements 3.3, 6.3, 6.4**

**Property 8: Either preference balancing**
*For any* scheduling scenario with unbalanced time slots, players with "Either" preference should be distributed to achieve better balance between morning and afternoon slots
**Validates: Requirements 3.4, 6.2**

**Property 9: Availability filtering**
*For any* week and set of players, only players marked as available for that week should appear in the generated schedule
**Validates: Requirements 4.1, 4.3**

**Property 10: Pairing history tracking**
*For any* generated schedule, the system should accurately track and update the count of times each pair of players has been grouped together
**Validates: Requirements 5.1, 7.5**

**Property 11: Pairing optimization**
*For any* scheduling scenario with existing pairing history, the algorithm should minimize repeat pairings and distribute any necessary repeats as equitably as possible
**Validates: Requirements 5.2, 5.3, 5.4**

**Property 12: Manual edit validation**
*For any* manual modification to a schedule, the system should validate that all constraints (time preferences, availability, group sizes) are still satisfied
**Validates: Requirements 7.3**

**Property 13: Export data accuracy**
*For any* schedule export, the exported data should exactly match the current schedule state and include all required information (player names, time slots, foursome assignments, handedness)
**Validates: Requirements 8.1, 8.2, 8.4**

## Error Handling

The system implements comprehensive error handling across all layers:

### Input Validation
- Player data validation (required fields, valid handedness, valid time preferences)
- Season data validation (valid date ranges, unique names)
- Schedule constraint validation (player availability, time slot capacity)

### Business Logic Errors
- Graceful handling of impossible scheduling scenarios (insufficient players, conflicting constraints)
- Conflict resolution for manual schedule edits
- Data integrity protection during player removal or updates

### System Errors
- Database connection failures with retry mechanisms
- Export generation failures with user feedback
- Import data validation with detailed error reporting

### User Experience
- Clear error messages with actionable guidance
- Validation feedback during data entry
- Confirmation dialogs for destructive operations

## Testing Strategy

The testing approach combines unit testing and property-based testing to ensure comprehensive coverage:

### Unit Testing Framework
- **Framework**: Jest for JavaScript/TypeScript
- **Coverage**: Specific examples, edge cases, and integration points
- **Focus Areas**:
  - Individual component functionality
  - API endpoint behavior
  - Error condition handling
  - User interface interactions

### Property-Based Testing Framework
- **Framework**: fast-check for JavaScript/TypeScript
- **Configuration**: Minimum 100 iterations per property test
- **Test Tagging**: Each property-based test tagged with format: `**Feature: indoor-golf-scheduler, Property {number}: {property_text}**`
- **Coverage**: Universal properties that should hold across all valid inputs

### Testing Approach
- **Implementation-first development**: Implement features before writing corresponding tests
- **Dual validation**: Both unit tests and property tests for core functionality
- **Early validation**: Property tests placed close to implementation to catch errors quickly
- **Comprehensive coverage**: Unit tests for specific scenarios, property tests for general correctness

### Test Organization
- Co-located test files using `.test.ts` suffix
- Separate test utilities for data generation and common assertions
- Integration tests for end-to-end workflow validation
- Performance tests for scheduling algorithm optimization

The combination of unit and property-based testing ensures both concrete functionality and universal correctness properties are validated, providing confidence in the system's reliability across all possible inputs and scenarios.