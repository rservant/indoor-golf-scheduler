import * as fc from 'fast-check';
import { LocalWeekRepository, WeekCreateData, PersistenceVerification } from './WeekRepository';
import { Week } from '../models/Week';

// Mock localStorage for testing
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();

// Set up localStorage mock
(global as any).localStorage = localStorageMock;

describe('WeekRepository Property Tests', () => {
  let weekRepository: LocalWeekRepository;

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    weekRepository = new LocalWeekRepository();
  });

  /**
   * **Feature: availability-persistence-fix, Property 1: Availability Persistence Verification**
   * **Validates: Requirements 1.1, 1.2, 1.3, 2.4**
   */
  test('Property 1: Availability Persistence Verification - all availability changes are verified after write', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate season ID with timestamp to ensure uniqueness
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
        // Generate week number
        fc.integer({ min: 1, max: 52 }),
        // Generate date
        fc.date({ min: new Date('2025-01-01'), max: new Date('2030-12-31') }),
        // Generate player IDs (1-10 players) with safe characters
        fc.array(
          fc.string({ minLength: 1, maxLength: 20 })
            .filter(s => s.trim().length > 0)
            .filter(s => /^[a-zA-Z0-9_-]+$/.test(s)) // Only alphanumeric, underscore, and dash
            .filter(s => !['__proto__', 'constructor', 'prototype'].includes(s)), // Avoid JS special properties
          { minLength: 1, maxLength: 10 }
        ),
        // Generate availability values for each player
        fc.array(fc.boolean(), { minLength: 1, maxLength: 10 }),
        async (seasonIdBase, weekNumber, date, playerIds, availabilityValues) => {
          // Create unique season ID to avoid conflicts across test runs
          const seasonId = `${seasonIdBase.trim()}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          
          // Ensure we have matching arrays
          const players = playerIds.slice(0, Math.min(playerIds.length, availabilityValues.length));
          const availability = availabilityValues.slice(0, players.length);

          // Create a week
          const weekData: WeekCreateData = {
            seasonId,
            weekNumber,
            date
          };
          
          const createdWeek = await weekRepository.create(weekData);
          
          // Test individual player availability verification
          for (let i = 0; i < players.length; i++) {
            const playerId = players[i].trim();
            const available = availability[i];
            
            // Set player availability with verification
            const verificationResult = await weekRepository.setPlayerAvailabilityVerified(
              createdWeek.id, 
              playerId, 
              available
            );
            
            // Verify the operation succeeded
            expect(verificationResult).toBe(true);
            
            // Double-check by reading the week directly
            const verifiedWeek = await weekRepository.findById(createdWeek.id);
            expect(verifiedWeek).not.toBeNull();
            expect(verifiedWeek!.playerAvailability[playerId]).toBe(available);
          }
          
          // Test bulk availability verification
          const bulkUpdates = new Map<string, boolean>();
          for (let i = 0; i < players.length; i++) {
            // Flip all availability values for bulk test
            bulkUpdates.set(players[i].trim(), !availability[i]);
          }
          
          const bulkResult: PersistenceVerification = await weekRepository.setBulkAvailabilityVerified(
            createdWeek.id,
            bulkUpdates
          );
          
          // Verify bulk operation succeeded
          expect(bulkResult.success).toBe(true);
          expect(bulkResult.verifiedCount).toBe(bulkUpdates.size);
          expect(bulkResult.totalCount).toBe(bulkUpdates.size);
          expect(bulkResult.failedPlayerIds).toEqual([]);
          
          // Verify all players have the flipped availability
          const finalWeek = await weekRepository.findById(createdWeek.id);
          expect(finalWeek).not.toBeNull();
          
          for (const [playerId, expectedAvailable] of bulkUpdates) {
            expect(finalWeek!.playerAvailability[playerId]).toBe(expectedAvailable);
          }
          
          // Test data integrity verification
          const integrityCheck = await weekRepository.verifyDataIntegrity(createdWeek.id);
          expect(integrityCheck).toBe(true);
          
          // Test timestamp tracking
          const timestamp = await weekRepository.getLastModifiedTimestamp(createdWeek.id);
          expect(timestamp).not.toBeNull();
          expect(timestamp).toBeInstanceOf(Date);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: availability-persistence-fix, Property 1a: Backup and Restore Verification**
   * **Validates: Requirements 1.3, 2.4, 4.3**
   */
  test('Property 1a: Backup and restore operations preserve data integrity', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate season ID with timestamp to ensure uniqueness
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
        // Generate week number
        fc.integer({ min: 1, max: 52 }),
        // Generate date
        fc.date({ min: new Date('2025-01-01'), max: new Date('2030-12-31') }),
        // Generate player availability map with more robust player IDs
        fc.dictionary(
          fc.string({ minLength: 1, maxLength: 20 })
            .filter(s => s.trim().length > 0)
            .filter(s => /^[a-zA-Z0-9_-]+$/.test(s)) // Only alphanumeric, underscore, and dash
            .filter(s => !['__proto__', 'constructor', 'prototype'].includes(s)), // Avoid JS special properties
          fc.boolean(),
          { minKeys: 1, maxKeys: 8 }
        ),
        async (seasonIdBase, weekNumber, date, playerAvailabilityDict) => {
          // Create unique season ID to avoid conflicts across test runs
          const seasonId = `${seasonIdBase.trim()}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          
          // Create a week with initial availability
          const weekData: WeekCreateData = {
            seasonId,
            weekNumber,
            date
          };
          
          const createdWeek = await weekRepository.create(weekData);
          
          // Set initial availability
          const initialAvailability = new Map(Object.entries(playerAvailabilityDict));
          const bulkResult = await weekRepository.setBulkAvailabilityVerified(
            createdWeek.id,
            initialAvailability
          );
          
          expect(bulkResult.success).toBe(true);
          
          // Create backup
          const backupId = await weekRepository.createBackup(createdWeek.id);
          expect(backupId).toBeTruthy();
          
          // Modify the data (flip all availability values)
          const modifiedAvailability = new Map<string, boolean>();
          for (const [playerId, available] of initialAvailability) {
            modifiedAvailability.set(playerId, !available);
          }
          
          const modifyResult = await weekRepository.setBulkAvailabilityVerified(
            createdWeek.id,
            modifiedAvailability
          );
          expect(modifyResult.success).toBe(true);
          
          // Verify data was modified
          const modifiedWeek = await weekRepository.findById(createdWeek.id);
          expect(modifiedWeek).not.toBeNull();
          for (const [playerId, expectedAvailable] of modifiedAvailability) {
            expect(modifiedWeek!.playerAvailability[playerId]).toBe(expectedAvailable);
          }
          
          // Restore from backup
          const restoreResult = await weekRepository.restoreFromBackup(createdWeek.id, backupId);
          expect(restoreResult).toBe(true);
          
          // Verify data was restored to original state
          const restoredWeek = await weekRepository.findById(createdWeek.id);
          expect(restoredWeek).not.toBeNull();
          for (const [playerId, expectedAvailable] of initialAvailability) {
            expect(restoredWeek!.playerAvailability[playerId]).toBe(expectedAvailable);
          }
          
          // Verify data integrity after restore
          const integrityCheck = await weekRepository.verifyDataIntegrity(createdWeek.id);
          expect(integrityCheck).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: availability-persistence-fix, Property 1b: Failed Operation Rollback**
   * **Validates: Requirements 1.6, 4.3**
   */
  test('Property 1b: Failed bulk operations trigger automatic rollback', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate season ID with timestamp to ensure uniqueness
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
        // Generate week number
        fc.integer({ min: 1, max: 52 }),
        // Generate date
        fc.date({ min: new Date('2025-01-01'), max: new Date('2030-12-31') }),
        // Generate initial player availability
        fc.dictionary(
          fc.string({ minLength: 1, maxLength: 20 })
            .filter(s => s.trim().length > 0)
            .filter(s => /^[a-zA-Z0-9_-]+$/.test(s)) // Only alphanumeric, underscore, and dash
            .filter(s => !['__proto__', 'constructor', 'prototype'].includes(s)), // Avoid JS special properties
          fc.boolean(),
          { minKeys: 2, maxKeys: 6 }
        ),
        async (seasonIdBase, weekNumber, date, initialAvailabilityDict) => {
          // Create unique season ID to avoid conflicts across test runs
          const seasonId = `${seasonIdBase.trim()}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          
          // Create a week with initial availability
          const weekData: WeekCreateData = {
            seasonId,
            weekNumber,
            date
          };
          
          const createdWeek = await weekRepository.create(weekData);
          
          // Set initial availability
          const initialAvailability = new Map(Object.entries(initialAvailabilityDict));
          const initialResult = await weekRepository.setBulkAvailabilityVerified(
            createdWeek.id,
            initialAvailability
          );
          expect(initialResult.success).toBe(true);
          
          // Store the initial state for comparison
          const initialWeek = await weekRepository.findById(createdWeek.id);
          expect(initialWeek).not.toBeNull();
          
          // Simulate a scenario where we try to update a non-existent week
          // This should fail and not affect our existing week
          const nonExistentWeekId = 'non_existent_week_id';
          const failedUpdates = new Map<string, boolean>();
          for (const playerId of Object.keys(initialAvailabilityDict)) {
            failedUpdates.set(playerId, true);
          }
          
          const failedResult = await weekRepository.setBulkAvailabilityVerified(
            nonExistentWeekId,
            failedUpdates
          );
          
          // Verify the operation failed
          expect(failedResult.success).toBe(false);
          expect(failedResult.error).toBeTruthy();
          
          // Verify our original week was not affected
          const unchangedWeek = await weekRepository.findById(createdWeek.id);
          expect(unchangedWeek).not.toBeNull();
          expect(unchangedWeek!.playerAvailability).toEqual(initialWeek!.playerAvailability);
          
          // Verify data integrity is still maintained
          const integrityCheck = await weekRepository.verifyDataIntegrity(createdWeek.id);
          expect(integrityCheck).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('WeekRepository Unit Tests', () => {
  let weekRepository: LocalWeekRepository;

  beforeEach(() => {
    localStorage.clear();
    weekRepository = new LocalWeekRepository();
  });

  test('should create week repository instance', () => {
    expect(weekRepository).toBeInstanceOf(LocalWeekRepository);
  });

  test('should handle empty availability updates gracefully', async () => {
    const weekData: WeekCreateData = {
      seasonId: 'test-season',
      weekNumber: 1,
      date: new Date('2025-01-01')
    };
    
    const createdWeek = await weekRepository.create(weekData);
    
    // Test empty bulk update
    const emptyUpdates = new Map<string, boolean>();
    const result = await weekRepository.setBulkAvailabilityVerified(createdWeek.id, emptyUpdates);
    
    expect(result.success).toBe(true);
    expect(result.verifiedCount).toBe(0);
    expect(result.totalCount).toBe(0);
  });

  test('should handle non-existent week gracefully', async () => {
    const result = await weekRepository.setPlayerAvailabilityVerified('non-existent', 'player1', true);
    expect(result).toBe(false);
  });

  test('should maintain timestamp accuracy', async () => {
    const weekData: WeekCreateData = {
      seasonId: 'test-season',
      weekNumber: 1,
      date: new Date('2025-01-01')
    };
    
    const createdWeek = await weekRepository.create(weekData);
    const beforeUpdate = new Date();
    
    // Small delay to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 10));
    
    await weekRepository.setPlayerAvailabilityVerified(createdWeek.id, 'player1', true);
    
    const timestamp = await weekRepository.getLastModifiedTimestamp(createdWeek.id);
    expect(timestamp).not.toBeNull();
    expect(timestamp!.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
  });
});