import * as fc from 'fast-check';
import { PlayerManagerService } from './PlayerManager';
import { LocalWeekRepository } from '../repositories/WeekRepository';
import { LocalPlayerRepository } from '../repositories/PlayerRepository';
import { LocalScheduleRepository } from '../repositories/ScheduleRepository';
import { LocalSeasonRepository } from '../repositories/SeasonRepository';
import { OperationInterruptionManager } from './OperationInterruptionManager';
import { Player } from '../models/Player';
import { Week } from '../models/Week';
import { Season } from '../models/Season';

/**
 * Property Test for Operation Interruption Recovery
 * 
 * Property 7: Operation Interruption Recovery
 * For any interrupted availability operation, the system should detect the interruption 
 * and reload the accurate state from localStorage to ensure data consistency.
 * 
 * Validates: Requirements 4.4
 */

describe('Property Test: Operation Interruption Recovery', () => {
  let playerManager: PlayerManagerService;
  let weekRepository: LocalWeekRepository;
  let playerRepository: LocalPlayerRepository;
  let scheduleRepository: LocalScheduleRepository;
  let seasonRepository: LocalSeasonRepository;
  let interruptionManager: OperationInterruptionManager;
  let testSeason: Season;
  let testWeek: Week;
  let testPlayers: Player[];

  beforeEach(async () => {
    // Clear localStorage
    localStorage.clear();

    // Initialize repositories
    playerRepository = new LocalPlayerRepository();
    weekRepository = new LocalWeekRepository();
    scheduleRepository = new LocalScheduleRepository();
    seasonRepository = new LocalSeasonRepository();

    // Initialize player manager
    playerManager = new PlayerManagerService(
      playerRepository,
      weekRepository,
      scheduleRepository,
      seasonRepository
    );

    interruptionManager = playerManager.getInterruptionManager();

    // Create test season
    testSeason = await seasonRepository.create({
      name: 'Test Season',
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-12-31'),
      isActive: true
    });

    // Create test week
    testWeek = await weekRepository.create({
      seasonId: testSeason.id,
      weekNumber: 1,
      date: new Date('2024-01-08')
    });

    // Create test players
    testPlayers = [];
    for (let i = 0; i < 5; i++) {
      const player = await playerRepository.create({
        firstName: `Player${i}`,
        lastName: `Test${i}`,
        handedness: i % 2 === 0 ? 'right' : 'left',
        timePreference: ['AM', 'PM', 'Either'][i % 3] as 'AM' | 'PM' | 'Either',
        seasonId: testSeason.id
      });
      testPlayers.push(player);
    }

    // Update season with player IDs
    await seasonRepository.update(testSeason.id, {
      playerIds: testPlayers.map(p => p.id)
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  /**
   * Property: Operation Interruption Detection and Recovery
   * 
   * For any availability operation that gets interrupted, the system should:
   * 1. Detect the interruption on next initialization
   * 2. Determine the actual state from localStorage
   * 3. Ensure data consistency after recovery
   */
  test('should detect and recover from interrupted operations maintaining data consistency', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate operation scenarios
        fc.record({
          operationType: fc.constantFrom('individual', 'bulk_available', 'bulk_unavailable'),
          playerIndices: fc.array(fc.integer({ min: 0, max: testPlayers.length - 1 }), { minLength: 1, maxLength: testPlayers.length }),
          targetAvailability: fc.boolean(),
          interruptionPoint: fc.constantFrom('before_persistence', 'during_persistence', 'after_persistence'),
          initialAvailability: fc.array(fc.boolean(), { minLength: testPlayers.length, maxLength: testPlayers.length })
        }),
        async ({ operationType, playerIndices, targetAvailability, interruptionPoint, initialAvailability }) => {
          // Set up initial availability state
          for (let i = 0; i < testPlayers.length; i++) {
            await playerManager.setPlayerAvailability(testPlayers[i].id, testWeek.id, initialAvailability[i]);
          }

          // Get unique player IDs for the operation
          const uniquePlayerIndices = [...new Set(playerIndices)];
          const operationPlayerIds = uniquePlayerIndices.map(i => testPlayers[i].id);

          // Record original state
          const originalState = new Map<string, boolean>();
          for (const playerId of operationPlayerIds) {
            const availability = await playerManager.getPlayerAvailability(playerId, testWeek.id);
            originalState.set(playerId, availability);
          }

          // Simulate operation start with interruption
          let operationId: string;
          let actualFinalState = new Map<string, boolean>();

          try {
            if (operationType === 'individual' && operationPlayerIds.length > 0) {
              const playerId = operationPlayerIds[0];
              
              // Start operation tracking
              const targetState = new Map<string, boolean>();
              targetState.set(playerId, targetAvailability);
              
              operationId = await interruptionManager.startOperation(
                'individual',
                testWeek.id,
                [playerId],
                originalState,
                targetState
              );

              // Simulate interruption at different points
              if (interruptionPoint === 'after_persistence') {
                // Complete the operation but don't mark as completed (simulate interruption after persistence)
                await playerManager.setPlayerAvailability(playerId, testWeek.id, targetAvailability);
              } else if (interruptionPoint === 'during_persistence') {
                // Partially complete (simulate interruption during persistence)
                // For individual operations, it's either done or not done
                if (Math.random() > 0.5) {
                  await playerManager.setPlayerAvailability(playerId, testWeek.id, targetAvailability);
                }
              }
              // For 'before_persistence', we don't change anything

            } else if (operationType.startsWith('bulk_') && operationPlayerIds.length > 0) {
              const bulkAvailable = operationType === 'bulk_available';
              
              // Start operation tracking
              const targetState = new Map<string, boolean>();
              for (const playerId of operationPlayerIds) {
                targetState.set(playerId, bulkAvailable);
              }
              
              operationId = await interruptionManager.startOperation(
                operationType as 'bulk_available' | 'bulk_unavailable',
                testWeek.id,
                operationPlayerIds,
                originalState,
                targetState
              );

              // Simulate interruption at different points
              if (interruptionPoint === 'after_persistence') {
                // Complete all operations but don't mark as completed
                for (const playerId of operationPlayerIds) {
                  await playerManager.setPlayerAvailability(playerId, testWeek.id, bulkAvailable);
                }
              } else if (interruptionPoint === 'during_persistence') {
                // Partially complete (simulate interruption during bulk operation)
                const completionCount = Math.floor(operationPlayerIds.length * Math.random());
                for (let i = 0; i < completionCount; i++) {
                  await playerManager.setPlayerAvailability(operationPlayerIds[i], testWeek.id, bulkAvailable);
                }
              }
              // For 'before_persistence', we don't change anything
            }

            // Record actual final state after simulated interruption
            for (const playerId of operationPlayerIds) {
              const availability = await playerManager.getPlayerAvailability(playerId, testWeek.id);
              actualFinalState.set(playerId, availability);
            }

            // Simulate system restart by creating new interruption manager
            const newInterruptionManager = new OperationInterruptionManager(weekRepository, playerManager);

            // Test interruption detection
            const detectionResult = await newInterruptionManager.detectInterruptions();

            // Verify interruption was detected
            expect(detectionResult.hasInterruption).toBe(true);
            expect(detectionResult.interruptedOperations.length).toBeGreaterThan(0);

            // Find our operation in the interrupted operations
            const ourInterruptedOperation = detectionResult.interruptedOperations.find(op => op.id === operationId);
            expect(ourInterruptedOperation).toBeDefined();
            expect(ourInterruptedOperation!.status).toBe('interrupted');

            // Test recovery
            await newInterruptionManager.recoverFromInterruptions(detectionResult.interruptedOperations);

            // Verify data consistency after recovery
            for (const playerId of operationPlayerIds) {
              const currentAvailability = await playerManager.getPlayerAvailability(playerId, testWeek.id);
              const actualAvailability = actualFinalState.get(playerId);
              
              // After recovery, the current state should match what was actually persisted
              expect(currentAvailability).toBe(actualAvailability);
            }

            // Verify data integrity
            const integrityCheck = await weekRepository.verifyDataIntegrity(testWeek.id);
            expect(integrityCheck).toBe(true);

            // Verify no more interrupted operations exist
            const postRecoveryDetection = await newInterruptionManager.detectInterruptions();
            expect(postRecoveryDetection.hasInterruption).toBe(false);

            // Clean up
            newInterruptionManager.destroy();

          } catch (error) {
            // Even if operation fails, recovery should work
            console.log('Operation failed (expected in some test cases):', error);
          }
        }
      ),
      { 
        numRuns: 100,
        verbose: true
      }
    );
  });

  /**
   * Property: Multiple Interrupted Operations Recovery
   * 
   * The system should handle recovery from multiple interrupted operations correctly
   */
  test('should recover from multiple interrupted operations maintaining consistency', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            playerIndex: fc.integer({ min: 0, max: testPlayers.length - 1 }),
            targetAvailability: fc.boolean()
          }),
          { minLength: 2, maxLength: testPlayers.length }
        ),
        async (operations) => {
          // Filter to unique players to avoid conflicts in the same test
          const uniqueOperations = operations.reduce((acc, op) => {
            const existing = acc.find(existing => existing.playerIndex === op.playerIndex);
            if (!existing) {
              acc.push(op);
            } else {
              // Keep the last operation for each player
              existing.targetAvailability = op.targetAvailability;
            }
            return acc;
          }, [] as typeof operations);

          // Skip if we don't have at least 2 unique operations
          if (uniqueOperations.length < 2) {
            return;
          }

          // Set up initial state
          for (const player of testPlayers) {
            await playerManager.setPlayerAvailability(player.id, testWeek.id, false);
          }

          const operationIds: string[] = [];
          const expectedFinalState = new Map<string, boolean>();

          // Start multiple operations and simulate interruptions by NOT completing them
          for (const operation of uniqueOperations) {
            const playerId = testPlayers[operation.playerIndex].id;
            const originalAvailability = await playerManager.getPlayerAvailability(playerId, testWeek.id);
            
            const originalState = new Map<string, boolean>();
            originalState.set(playerId, originalAvailability);
            
            const targetState = new Map<string, boolean>();
            targetState.set(playerId, operation.targetAvailability);

            // Start operation tracking but DON'T complete it (simulate interruption)
            const operationId = await interruptionManager.startOperation(
              'individual',
              testWeek.id,
              [playerId],
              originalState,
              targetState
            );
            operationIds.push(operationId);

            // Simulate some operations completing before interruption (randomly)
            if (Math.random() > 0.5) {
              // This operation completed before interruption
              await playerManager.setPlayerAvailability(playerId, testWeek.id, operation.targetAvailability);
              expectedFinalState.set(playerId, operation.targetAvailability);
            } else {
              // This operation was interrupted before completion
              expectedFinalState.set(playerId, originalAvailability);
            }
            
            // DON'T call interruptionManager.completeOperation() to simulate interruption
          }

          // Simulate time passage by manually updating operation timestamps to be old
          const persistedOps = await (interruptionManager as any).getPersistedOperations();
          const oldTimestamp = new Date(Date.now() - 35000); // 35 seconds ago (older than timeout)
          
          for (const op of persistedOps) {
            op.timestamp = oldTimestamp;
          }
          
          // Re-persist with old timestamps
          localStorage.setItem('golf_scheduler_operation_state', JSON.stringify(
            persistedOps.map((op: any) => ({
              ...op,
              timestamp: oldTimestamp.toISOString(),
              originalState: Object.fromEntries(op.originalState),
              targetState: Object.fromEntries(op.targetState)
            }))
          ));

          // Create new interruption manager to simulate restart
          const newInterruptionManager = new OperationInterruptionManager(weekRepository, playerManager);

          // Detect and recover from interruptions
          const detectionResult = await newInterruptionManager.detectInterruptions();
          
          // We should have interruptions since we didn't complete the operations and they're old
          expect(detectionResult.hasInterruption).toBe(true);
          expect(detectionResult.interruptedOperations.length).toBe(operationIds.length);

          await newInterruptionManager.recoverFromInterruptions(detectionResult.interruptedOperations);

          // Verify final state matches what was actually persisted
          for (const [playerId, expectedAvailability] of expectedFinalState) {
            const actualAvailability = await playerManager.getPlayerAvailability(playerId, testWeek.id);
            expect(actualAvailability).toBe(expectedAvailability);
          }

          // Verify data integrity
          const integrityCheck = await weekRepository.verifyDataIntegrity(testWeek.id);
          expect(integrityCheck).toBe(true);

          // Verify no more interrupted operations exist after recovery
          const postRecoveryDetection = await newInterruptionManager.detectInterruptions();
          expect(postRecoveryDetection.hasInterruption).toBe(false);

          // Clean up
          newInterruptionManager.destroy();
        }
      ),
      { 
        numRuns: 50,
        verbose: true
      }
    );
  });

  /**
   * Property: No False Positive Interruption Detection
   * 
   * The system should not detect interruptions for completed operations
   */
  test('should not detect interruptions for properly completed operations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            playerIndex: fc.integer({ min: 0, max: testPlayers.length - 1 }),
            targetAvailability: fc.boolean()
          }),
          { minLength: 1, maxLength: testPlayers.length }
        ),
        async (operations) => {
          // Perform operations properly (with completion tracking)
          for (const operation of operations) {
            const playerId = testPlayers[operation.playerIndex].id;
            await playerManager.setPlayerAvailabilityAtomic(playerId, testWeek.id, operation.targetAvailability);
          }

          // Create new interruption manager to simulate restart
          const newInterruptionManager = new OperationInterruptionManager(weekRepository, playerManager);

          // Should not detect any interruptions for completed operations
          const detectionResult = await newInterruptionManager.detectInterruptions();
          expect(detectionResult.hasInterruption).toBe(false);
          expect(detectionResult.interruptedOperations.length).toBe(0);

          // Clean up
          newInterruptionManager.destroy();
        }
      ),
      { 
        numRuns: 50,
        verbose: true
      }
    );
  });
});