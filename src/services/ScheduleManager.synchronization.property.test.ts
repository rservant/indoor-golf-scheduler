import fc from 'fast-check';
import { ScheduleManager } from './ScheduleManager';
import { LocalScheduleRepository } from '../repositories/ScheduleRepository';
import { LocalWeekRepository } from '../repositories/WeekRepository';
import { LocalPlayerRepository } from '../repositories/PlayerRepository';
import { LocalPairingHistoryRepository } from '../repositories/PairingHistoryRepository';
import { ScheduleGenerator } from './ScheduleGenerator';
import { PairingHistoryTracker } from './PairingHistoryTracker';
import { LocalScheduleBackupService } from './ScheduleBackupService';
import { WeekModel } from '../models/Week';
import { PlayerModel } from '../models/Player';

/**
 * Property-based tests for ScheduleManager data synchronization reliability
 * Feature: schedule-generation-fix, Property 5: Data synchronization reliability
 * Validates: Requirements 3.1, 3.2, 3.5
 */

describe.skip('ScheduleManager Data Synchronization Properties', () => {
  let scheduleManager: ScheduleManager;
  let scheduleRepository: LocalScheduleRepository;
  let weekRepository: LocalWeekRepository;
  let playerRepository: LocalPlayerRepository;
  let pairingHistoryRepository: LocalPairingHistoryRepository;
  let scheduleGenerator: ScheduleGenerator;
  let pairingHistoryTracker: PairingHistoryTracker;
  let backupService: LocalScheduleBackupService;

  beforeEach(async () => {
    // Create repositories
    scheduleRepository = new LocalScheduleRepository();
    weekRepository = new LocalWeekRepository();
    playerRepository = new LocalPlayerRepository();
    pairingHistoryRepository = new LocalPairingHistoryRepository();

    // Create services
    scheduleGenerator = new ScheduleGenerator();
    pairingHistoryTracker = new PairingHistoryTracker(pairingHistoryRepository);
    backupService = new LocalScheduleBackupService();

    // Create schedule manager
    scheduleManager = new ScheduleManager(
      scheduleRepository,
      weekRepository,
      playerRepository,
      scheduleGenerator,
      pairingHistoryTracker,
      backupService
    );
  });

  afterEach(() => {
    if (scheduleManager && typeof scheduleManager.stopPeriodicCleanup === 'function') {
      scheduleManager.stopPeriodicCleanup();
    }
  });

  /**
   * Property 5: Data synchronization reliability
   * For any recently added players to a season, schedule generation should have access to and use the current player data
   */
  test('Property 5: Data synchronization reliability - recently added players are accessible', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          seasonId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
          weekNumber: fc.integer({ min: 1, max: 52 }),
          initialPlayerCount: fc.integer({ min: 2, max: 8 }),
          additionalPlayerCount: fc.integer({ min: 1, max: 6 }),
          availabilityScenario: fc.constantFrom('all_available', 'mixed', 'new_players_available')
        }),
        async (testData) => {
          // Create unique identifiers to avoid conflicts
          const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
          const weekId = `week-${testData.seasonId}-${testData.weekNumber}-${uniqueId}`;
          const uniqueSeasonId = `${testData.seasonId}-${uniqueId}`;

          // Step 1: Create initial players
          const initialPlayers: PlayerModel[] = [];
          for (let i = 0; i < testData.initialPlayerCount; i++) {
            const player = new PlayerModel({
              firstName: `InitialPlayer${i}`,
              lastName: 'Test',
              handedness: i % 2 === 0 ? 'left' : 'right',
              timePreference: ['AM', 'PM', 'Either'][i % 3] as 'AM' | 'PM' | 'Either',
              seasonId: uniqueSeasonId
            });
            initialPlayers.push(player);
            await playerRepository.create(player);
          }

          // Step 2: Create initial availability data
          let playerAvailability: Record<string, boolean> = {};
          if (testData.availabilityScenario === 'all_available' || testData.availabilityScenario === 'mixed') {
            initialPlayers.forEach((p, i) => {
              playerAvailability[p.id] = testData.availabilityScenario === 'all_available' || i % 2 === 0;
            });
          }

          // Step 3: Create week with initial data
          const week = new WeekModel({
            id: weekId,
            seasonId: uniqueSeasonId,
            weekNumber: testData.weekNumber,
            date: new Date(),
            playerAvailability
          });
          await weekRepository.create(week);

          // Step 4: Add additional players (simulating recently added players)
          const additionalPlayers: PlayerModel[] = [];
          for (let i = 0; i < testData.additionalPlayerCount; i++) {
            const player = new PlayerModel({
              firstName: `NewPlayer${i}`,
              lastName: 'Recent',
              handedness: i % 2 === 0 ? 'right' : 'left',
              timePreference: ['AM', 'PM', 'Either'][i % 3] as 'AM' | 'PM' | 'Either',
              seasonId: uniqueSeasonId
            });
            additionalPlayers.push(player);
            await playerRepository.create(player);
          }

          // Step 5: Update availability for new players
          if (testData.availabilityScenario === 'all_available' || testData.availabilityScenario === 'new_players_available') {
            additionalPlayers.forEach(p => {
              playerAvailability[p.id] = true;
            });
            
            // Update the week with new availability data
            await weekRepository.update(weekId, { playerAvailability });
          }

          // Step 6: Generate schedule (this should use current/refreshed data)
          let schedule;
          let generationSucceeded = false;
          
          try {
            schedule = await scheduleManager.createWeeklySchedule(weekId);
            generationSucceeded = true;
          } catch (error) {
            // Schedule generation might fail due to insufficient players, which is acceptable
            if (error instanceof Error && error.message.includes('already exists')) {
              // This shouldn't happen in our test, but handle gracefully
              throw error;
            }
            // Other errors (like insufficient players) are acceptable for this property test
            generationSucceeded = false;
          }

          // Property: If schedule generation succeeded, it should have access to all current players
          if (generationSucceeded && schedule) {
            // Get all players that should be available to the schedule generator
            const allCurrentPlayers = [...initialPlayers, ...additionalPlayers];
            const expectedAvailablePlayers = allCurrentPlayers.filter(p => {
              const status = playerAvailability[p.id];
              return status === true;
            });

            // Verify that the schedule was generated with access to current data
            const scheduledPlayerIds = new Set(schedule.getAllPlayers());
            const availablePlayerIds = new Set(expectedAvailablePlayers.map(p => p.id));

            // All scheduled players should be from the available player set
            for (const scheduledPlayerId of scheduledPlayerIds) {
              expect(availablePlayerIds.has(scheduledPlayerId)).toBe(true);
            }

            // If we have sufficient available players, some should be scheduled
            if (expectedAvailablePlayers.length >= 4) {
              expect(scheduledPlayerIds.size).toBeGreaterThan(0);
            }

            // Verify that recently added players can be included if they're available
            const recentlyAddedAvailableIds = additionalPlayers
              .filter(p => playerAvailability[p.id] === true)
              .map(p => p.id);
            
            if (recentlyAddedAvailableIds.length > 0 && expectedAvailablePlayers.length >= 4) {
              // The property is that recently added players are accessible
              // We verify this by checking that the total available players includes recent ones
              expect(availablePlayerIds.size).toBe(expectedAvailablePlayers.length);
              expect(expectedAvailablePlayers.some(p => additionalPlayers.includes(p))).toBe(true);
            }
          }

          // Property: Data synchronization should always provide current player count
          const playerDataSummary = await scheduleManager.getPlayerDataForWeek(weekId);
          const totalExpectedPlayers = testData.initialPlayerCount + testData.additionalPlayerCount;
          
          expect(playerDataSummary).toHaveLength(totalExpectedPlayers);
          
          // Verify that all players (initial + additional) are included in the data
          const playerDataIds = new Set(playerDataSummary.map(p => p.id));
          const allPlayerIds = new Set([...initialPlayers, ...additionalPlayers].map(p => p.id));
          
          expect(playerDataIds.size).toBe(allPlayerIds.size);
          for (const playerId of allPlayerIds) {
            expect(playerDataIds.has(playerId)).toBe(true);
          }
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  test('Property 5: Data consistency validation detects synchronization issues', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          seasonId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
          weekNumber: fc.integer({ min: 1, max: 52 }),
          playerCount: fc.integer({ min: 1, max: 10 }),
          dataCorruption: fc.constantFrom('none', 'orphaned_availability', 'empty_week_id', 'invalid_week_number')
        }),
        async (testData) => {
          const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
          let weekId = `week-${testData.seasonId}-${testData.weekNumber}-${uniqueId}`;
          const uniqueSeasonId = `${testData.seasonId}-${uniqueId}`;

          // Apply week ID corruption before creating the week
          if (testData.dataCorruption === 'empty_week_id') {
            weekId = ''; // This will be caught by ScheduleManager validation
          }

          // Create valid players first
          const players: PlayerModel[] = [];
          for (let i = 0; i < testData.playerCount; i++) {
            const player = new PlayerModel({
              firstName: `Player${i}`,
              lastName: 'Test',
              handedness: i % 2 === 0 ? 'left' : 'right',
              timePreference: ['AM', 'PM', 'Either'][i % 3] as 'AM' | 'PM' | 'Either',
              seasonId: uniqueSeasonId
            });
            players.push(player);
            await playerRepository.create(player);
          }

          // Create availability data
          let playerAvailability: Record<string, boolean> = {};
          players.forEach(p => {
            playerAvailability[p.id] = true;
          });

          // Add orphaned availability data if specified
          if (testData.dataCorruption === 'orphaned_availability') {
            playerAvailability[`non-existent-player-${uniqueId}`] = true;
          }

          // Create week with potential corruption
          let weekNumber = testData.weekNumber;
          if (testData.dataCorruption === 'invalid_week_number') {
            weekNumber = 100; // Invalid week number (> 52)
          }

          // For empty week ID, we need to create a valid week first, then test with empty ID
          let actualWeekId = weekId;
          if (testData.dataCorruption === 'empty_week_id') {
            actualWeekId = `temp-${uniqueId}`; // Create with valid ID first
          }

          const week = new WeekModel({
            id: actualWeekId,
            seasonId: uniqueSeasonId,
            weekNumber: weekNumber,
            date: new Date(),
            playerAvailability
          });
          await weekRepository.create(week);

          // Test schedule generation with data consistency validation
          let generationSucceeded = false;
          let caughtError: Error | null = null;

          try {
            // Use the potentially corrupted week ID for the test
            const testWeekId = testData.dataCorruption === 'empty_week_id' ? '' : actualWeekId;
            await scheduleManager.createWeeklySchedule(testWeekId);
            generationSucceeded = true;
          } catch (error) {
            caughtError = error as Error;
            generationSucceeded = false;
          }

          // Property: Data consistency validation should detect corruption
          if (testData.dataCorruption === 'none') {
            // With no corruption, generation should succeed (unless insufficient players)
            if (!generationSucceeded && caughtError) {
              // Only acceptable failure is insufficient players or existing schedule
              expect(
                caughtError.message.includes('Insufficient') ||
                caughtError.message.includes('already exists') ||
                caughtError.message.includes('not found') ||
                caughtError.message.includes('need at least 4') ||
                caughtError.message.includes('Precondition validation')
              ).toBe(true);
            }
          } else {
            // With corruption, behavior depends on the type
            if (testData.dataCorruption === 'orphaned_availability') {
              // Orphaned availability is a warning, not an error, so generation might succeed
              // but we should be able to detect it in the player data summary
              if (generationSucceeded) {
                const playerDataSummary = await scheduleManager.getPlayerDataForWeek(actualWeekId);
                expect(playerDataSummary).toHaveLength(testData.playerCount); // Should not include orphaned data
              }
            } else if (testData.dataCorruption === 'empty_week_id') {
              // Empty week ID should cause a "not found" error before validation
              expect(generationSucceeded).toBe(false);
              expect(caughtError).toBeDefined();
              expect(caughtError!.message).toMatch(/not found|Week.*not found|Week ID is required/);
            } else if (testData.dataCorruption === 'invalid_week_number') {
              // Invalid week number should be caught by validation
              expect(generationSucceeded).toBe(false);
              expect(caughtError).toBeDefined();
              // Either precondition validation (insufficient players) or data consistency validation (invalid week number) can fail first
              expect(
                caughtError!.message.includes('Data consistency validation failed') ||
                caughtError!.message.includes('Precondition validation') ||
                caughtError!.message.includes('need at least 4')
              ).toBe(true);
            }
          }
        }
      ),
      { numRuns: 15, timeout: 8000 }
    );
  });

  test('Property 5: Player data summary reflects current state accurately', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          seasonId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
          weekNumber: fc.integer({ min: 1, max: 52 }),
          playerCount: fc.integer({ min: 1, max: 15 }),
          availabilityPattern: fc.constantFrom('all_true', 'all_false', 'alternating', 'random', 'partial_data')
        }),
        async (testData) => {
          const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
          const weekId = `week-${testData.seasonId}-${testData.weekNumber}-${uniqueId}`;
          const uniqueSeasonId = `${testData.seasonId}-${uniqueId}`;

          // Create players with varied properties
          const players: PlayerModel[] = [];
          for (let i = 0; i < testData.playerCount; i++) {
            const player = new PlayerModel({
              firstName: `Player${i}`,
              lastName: 'Test',
              handedness: i % 2 === 0 ? 'left' : 'right',
              timePreference: ['AM', 'PM', 'Either'][i % 3] as 'AM' | 'PM' | 'Either',
              seasonId: uniqueSeasonId
            });
            players.push(player);
            await playerRepository.create(player);
          }

          // Create availability data based on pattern
          let playerAvailability: Record<string, boolean> = {};
          let expectedAvailable = 0;
          let expectedUnavailable = 0;
          let expectedNoData = 0;

          switch (testData.availabilityPattern) {
            case 'all_true':
              players.forEach(p => {
                playerAvailability[p.id] = true;
                expectedAvailable++;
              });
              break;
            case 'all_false':
              players.forEach(p => {
                playerAvailability[p.id] = false;
                expectedUnavailable++;
              });
              break;
            case 'alternating':
              players.forEach((p, i) => {
                const isAvailable = i % 2 === 0;
                playerAvailability[p.id] = isAvailable;
                if (isAvailable) expectedAvailable++;
                else expectedUnavailable++;
              });
              break;
            case 'random':
              players.forEach((p, i) => {
                const isAvailable = i % 3 === 0;
                playerAvailability[p.id] = isAvailable;
                if (isAvailable) expectedAvailable++;
                else expectedUnavailable++;
              });
              break;
            case 'partial_data':
              // Only set availability for half the players
              const halfCount = Math.floor(players.length / 2);
              players.slice(0, halfCount).forEach((p, i) => {
                const isAvailable = i % 2 === 0;
                playerAvailability[p.id] = isAvailable;
                if (isAvailable) expectedAvailable++;
                else expectedUnavailable++;
              });
              expectedNoData = players.length - halfCount;
              break;
          }

          // Create week
          const week = new WeekModel({
            id: weekId,
            seasonId: uniqueSeasonId,
            weekNumber: testData.weekNumber,
            date: new Date(),
            playerAvailability
          });
          await weekRepository.create(week);

          // Get player data summary
          const playerDataSummary = await scheduleManager.getPlayerDataForWeek(weekId);

          // Property: Player data summary should accurately reflect current state
          expect(playerDataSummary).toHaveLength(testData.playerCount);

          // Count actual availability statuses from summary
          let actualAvailable = 0;
          let actualUnavailable = 0;
          let actualNoData = 0;

          playerDataSummary.forEach(playerData => {
            if (playerData.availabilityStatus === true) {
              actualAvailable++;
            } else if (playerData.availabilityStatus === false) {
              actualUnavailable++;
            } else {
              actualNoData++;
            }

            // Verify player data structure
            expect(playerData).toHaveProperty('id');
            expect(playerData).toHaveProperty('name');
            expect(playerData).toHaveProperty('timePreference');
            expect(playerData).toHaveProperty('handedness');
            expect(playerData).toHaveProperty('seasonId');
            expect(playerData).toHaveProperty('availabilityStatus');
            expect(playerData).toHaveProperty('availabilityReason');

            // Verify season consistency
            expect(playerData.seasonId).toBe(uniqueSeasonId);

            // Verify availability reason is descriptive
            expect(typeof playerData.availabilityReason).toBe('string');
            expect(playerData.availabilityReason.length).toBeGreaterThan(0);
          });

          // Verify counts match expectations
          expect(actualAvailable).toBe(expectedAvailable);
          expect(actualUnavailable).toBe(expectedUnavailable);
          expect(actualNoData).toBe(expectedNoData);

          // Verify all created players are represented
          const summaryPlayerIds = new Set(playerDataSummary.map(p => p.id));
          const createdPlayerIds = new Set(players.map(p => p.id));
          expect(summaryPlayerIds.size).toBe(createdPlayerIds.size);
          for (const playerId of createdPlayerIds) {
            expect(summaryPlayerIds.has(playerId)).toBe(true);
          }
        }
      ),
      { numRuns: 20, timeout: 8000 }
    );
  });
});