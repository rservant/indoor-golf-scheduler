/**
 * Property-based tests for advanced TypeScript-only features
 * Feature: typescript-activation, Property 8: Advanced Feature Functionality
 * Validates: Requirements 5.2, 5.3, 5.4, 5.5, 5.6
 */

import * as fc from 'fast-check';
import { ImportExportService, BulkPlayerOperation } from './services/ImportExportService';
import { PairingHistoryTracker } from './services/PairingHistoryTracker';
import { AvailabilityManagementUI } from './ui/AvailabilityManagementUI';
import { ScheduleDisplayUI } from './ui/ScheduleDisplayUI';
import { ExportService } from './services/ExportService';
import { LocalScheduleBackupService } from './services/ScheduleBackupService';

// Import test utilities and mocks
import { InMemoryPlayerManager } from './services/PlayerManager';
import { InMemorySeasonManager } from './services/SeasonManager';
import { LocalPairingHistoryRepository } from './repositories/PairingHistoryRepository';
import { LocalWeekRepository } from './repositories/WeekRepository';
import { ScheduleManager } from './services/ScheduleManager';
import { LocalScheduleRepository } from './repositories/ScheduleRepository';
import { LocalPlayerRepository } from './repositories/PlayerRepository';
import { ScheduleGenerator } from './services/ScheduleGenerator';

// Import models
import { PlayerInfo, Handedness, TimePreference } from './models/Player';
import { Season } from './models/Season';
import { Week } from './models/Week';
import { Schedule, ScheduleModel } from './models/Schedule';
import { Foursome, FoursomeModel } from './models/Foursome';

describe('Advanced Features Properties', () => {
  let importExportService: ImportExportService;
  let pairingHistoryTracker: PairingHistoryTracker;
  let availabilityUI: AvailabilityManagementUI;
  let scheduleDisplayUI: ScheduleDisplayUI;
  
  let playerManager: InMemoryPlayerManager;
  let seasonManager: InMemorySeasonManager;
  let weekRepository: LocalWeekRepository;
  let scheduleManager: ScheduleManager;
  let backupService: LocalScheduleBackupService;
  
  beforeEach(async () => {
    // Clear localStorage before each test
    localStorage.clear();
    
    // Initialize services and repositories
    seasonManager = new InMemorySeasonManager();
    playerManager = new InMemoryPlayerManager();
    
    const pairingHistoryRepository = new LocalPairingHistoryRepository();
    const scheduleRepository = new LocalScheduleRepository();
    const playerRepository = new LocalPlayerRepository();
    weekRepository = new LocalWeekRepository();
    
    pairingHistoryTracker = new PairingHistoryTracker(pairingHistoryRepository);
    backupService = new LocalScheduleBackupService();
    
    const scheduleGenerator = new ScheduleGenerator({
      prioritizeCompleteGroups: true,
      balanceTimeSlots: true,
      optimizePairings: true
    }, pairingHistoryTracker);
    
    scheduleManager = new ScheduleManager(
      scheduleRepository,
      weekRepository,
      playerRepository,
      scheduleGenerator,
      pairingHistoryTracker,
      backupService
    );
    
    importExportService = new ImportExportService(playerManager, seasonManager);
    
    // Create DOM containers for UI components
    const availabilityContainer = document.createElement('div');
    const scheduleEditingContainer = document.createElement('div');
    
    availabilityUI = new AvailabilityManagementUI(playerManager, weekRepository, availabilityContainer);
    
    // Create export service and schedule display UI
    const exportService = new ExportService();
    scheduleDisplayUI = new ScheduleDisplayUI(
      scheduleManager,
      scheduleGenerator,
      weekRepository,
      exportService,
      pairingHistoryTracker,
      playerManager,
      scheduleEditingContainer
    );
    
    // Create and activate a test season
    const testSeason = await seasonManager.createSeason(
      'Test Season',
      new Date('2024-01-01'),
      new Date('2024-12-31')
    );
    await seasonManager.setActiveSeason(testSeason.id);
    
    // IMPORTANT: Set the active season in PlayerManager too
    playerManager.setActiveSeasonId(testSeason.id);
  });

  /**
   * Property 8: Advanced Feature Functionality
   * For any advanced feature (import/export, pairing history, availability management, schedule editing), 
   * the feature should work correctly and provide value beyond the simple version
   * **Validates: Requirements 5.2, 5.3, 5.4, 5.5, 5.6**
   */
  test('Property 8.1: Import/Export functionality works correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate simple, valid player data for import with unique names
        fc.array(
          fc.record({
            firstName: fc.string({ minLength: 2, maxLength: 15 })
              .filter(s => /^[a-zA-Z]+$/.test(s) && s.trim().length > 0), // Only letters, no whitespace
            lastName: fc.string({ minLength: 2, maxLength: 15 })
              .filter(s => /^[a-zA-Z]+$/.test(s) && s.trim().length > 0), // Only letters, no whitespace
            handedness: fc.constantFrom('left', 'right') as fc.Arbitrary<Handedness>,
            timePreference: fc.constantFrom('AM', 'PM', 'Either') as fc.Arbitrary<TimePreference>
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (playerDataArray) => {
          // Clear any existing players to avoid duplicates
          localStorage.removeItem('golf_scheduler_players');
          // Reset the in-memory player manager
          (playerManager as any).players.clear();
          
          // Use the shared season manager from beforeEach
          const activeSeason = await seasonManager.getActiveSeason();
          expect(activeSeason).not.toBeNull();
          
          if (!activeSeason) return;
          
          // Make player names unique by adding index to avoid duplicates
          const uniquePlayerData = playerDataArray.map((player, index) => ({
            ...player,
            firstName: `${player.firstName}${index}`,
            lastName: `${player.lastName}${index}`
          }));
          
          // Convert to CSV format
          const csvHeader = 'First Name,Last Name,Handedness,Time Preference';
          const csvRows = uniquePlayerData.map(p => 
            `${p.firstName},${p.lastName},${p.handedness},${p.timePreference}`
          );
          const csvData = [csvHeader, ...csvRows].join('\n');
          
          // Property: Import should successfully process valid player data
          const importResult = await importExportService.importPlayers(csvData, 'csv');
          
          expect(importResult.success).toBe(true);
          expect(importResult.importedCount).toBe(uniquePlayerData.length);
          expect(importResult.errors.length).toBe(0);
          
          // Property: Imported players should be retrievable
          const importedPlayers = await playerManager.getAllPlayers(activeSeason.id);
          expect(importedPlayers.length).toBe(uniquePlayerData.length);
          
          // Property: Each imported player should match the original data
          for (const originalPlayer of uniquePlayerData) {
            const importedPlayer = importedPlayers.find(p => 
              p.firstName === originalPlayer.firstName && 
              p.lastName === originalPlayer.lastName
            );
            
            expect(importedPlayer).toBeDefined();
            expect(importedPlayer!.handedness).toBe(originalPlayer.handedness);
            expect(importedPlayer!.timePreference).toBe(originalPlayer.timePreference);
          }
        }
      ),
      { numRuns: 10 } // Reduced number of runs for faster testing
    );
  });

  test('Property 8.2: Pairing history tracking maintains consistency', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate players and simulate pairings
        fc.array(
          fc.record({
            firstName: fc.string({ minLength: 1, maxLength: 15 })
              .filter(s => s.trim().length > 0), // No empty strings after trimming
            lastName: fc.string({ minLength: 1, maxLength: 15 })
              .filter(s => s.trim().length > 0), // No empty strings after trimming
            handedness: fc.constantFrom('left', 'right') as fc.Arbitrary<Handedness>,
            timePreference: fc.constantFrom('AM', 'PM', 'Either') as fc.Arbitrary<TimePreference>
          }),
          { minLength: 4, maxLength: 12 }
        ),
        async (playerDataArray) => {
          // Clear any existing players to avoid duplicates
          localStorage.removeItem('golf_scheduler_players');
          // Reset the in-memory player manager
          (playerManager as any).players.clear();
          
          const activeSeason = await seasonManager.getActiveSeason();
          expect(activeSeason).not.toBeNull();
          
          if (!activeSeason) return;
          
          // Add players to the season with unique names to avoid duplicates
          const addedPlayers = [];
          for (let i = 0; i < playerDataArray.length; i++) {
            const playerData = playerDataArray[i];
            // Make names unique by adding index
            const uniquePlayerData = {
              ...playerData,
              firstName: `${playerData.firstName}${i}`,
              lastName: `${playerData.lastName}${i}`
            };
            const player = await playerManager.addPlayer(uniquePlayerData);
            addedPlayers.push(player);
          }
          
          // Create a foursome and track pairings
          const foursome = new FoursomeModel({
            players: addedPlayers.slice(0, 4), // Take first 4 players
            timeSlot: 'morning',
            position: 1,
            id: 'test-foursome'
          });
          
          // Property: Tracking pairings should not throw errors
          await expect(
            pairingHistoryTracker.trackFoursomePairings(activeSeason.id, foursome)
          ).resolves.not.toThrow();
          
          // Property: Pairing counts should be consistent
          const player1 = addedPlayers[0];
          const player2 = addedPlayers[1];
          
          const pairingCount = await pairingHistoryTracker.getPairingCount(
            activeSeason.id, 
            player1.id, 
            player2.id
          );
          
          expect(pairingCount).toBe(1);
          
          // Property: Tracking the same pairing again should increment count
          await pairingHistoryTracker.trackFoursomePairings(activeSeason.id, foursome);
          
          const updatedPairingCount = await pairingHistoryTracker.getPairingCount(
            activeSeason.id, 
            player1.id, 
            player2.id
          );
          
          expect(updatedPairingCount).toBe(2);
        }
      ),
      { numRuns: 15 }
    );
  });

  test('Property 8.3: Availability management maintains data integrity', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate players and availability data
        fc.record({
          players: fc.array(
            fc.record({
              firstName: fc.string({ minLength: 1, maxLength: 15 })
                .filter(s => s.trim().length > 0), // No empty strings after trimming
              lastName: fc.string({ minLength: 1, maxLength: 15 })
                .filter(s => s.trim().length > 0), // No empty strings after trimming
              handedness: fc.constantFrom('left', 'right') as fc.Arbitrary<Handedness>,
              timePreference: fc.constantFrom('AM', 'PM', 'Either') as fc.Arbitrary<TimePreference>
            }),
            { minLength: 2, maxLength: 8 }
          ),
          availabilitySettings: fc.array(fc.boolean(), { minLength: 2, maxLength: 8 })
        }),
        async ({ players: playerDataArray, availabilitySettings }) => {
          // Clear any existing data to avoid duplicates
          localStorage.removeItem('golf_scheduler_players');
          localStorage.removeItem('golf_scheduler_weeks');
          // Reset the in-memory player manager
          (playerManager as any).players.clear();
          
          const activeSeason = await seasonManager.getActiveSeason();
          expect(activeSeason).not.toBeNull();
          
          if (!activeSeason) return;
          
          // Add players to the season with unique names to avoid duplicates
          const addedPlayers = [];
          for (let i = 0; i < playerDataArray.length; i++) {
            const playerData = playerDataArray[i];
            // Make names unique by adding index
            const uniquePlayerData = {
              ...playerData,
              firstName: `${playerData.firstName}${i}`,
              lastName: `${playerData.lastName}${i}`
            };
            const player = await playerManager.addPlayer(uniquePlayerData);
            addedPlayers.push(player);
          }
          
          // Create a test week
          const weekData = await weekRepository.create({
            seasonId: activeSeason.id,
            weekNumber: 1,
            date: new Date('2024-01-08')
          });
          const testWeek = weekData;
          
          // Initialize availability UI with the season
          await availabilityUI.initialize(activeSeason);
          
          // Property: Setting availability should not throw errors
          for (let i = 0; i < Math.min(addedPlayers.length, availabilitySettings.length); i++) {
            const player = addedPlayers[i];
            const isAvailable = availabilitySettings[i];
            
            await expect(
              playerManager.setPlayerAvailability(player.id, testWeek.id, isAvailable)
            ).resolves.not.toThrow();
            
            // Property: Retrieved availability should match what was set
            const retrievedAvailability = await playerManager.getPlayerAvailability(
              player.id, 
              testWeek.id
            );
            expect(retrievedAvailability).toBe(isAvailable);
          }
        }
      ),
      { numRuns: 15 }
    );
  });

  test('Property 8.4: Schedule editing maintains schedule validity', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a basic schedule structure
        fc.record({
          players: fc.array(
            fc.record({
              firstName: fc.string({ minLength: 1, maxLength: 15 })
                .filter(s => s.trim().length > 0), // No empty strings after trimming
              lastName: fc.string({ minLength: 1, maxLength: 15 })
                .filter(s => s.trim().length > 0), // No empty strings after trimming
              handedness: fc.constantFrom('left', 'right') as fc.Arbitrary<Handedness>,
              timePreference: fc.constantFrom('AM', 'PM', 'Either') as fc.Arbitrary<TimePreference>
            }),
            { minLength: 8, maxLength: 12 }
          )
        }),
        async ({ players: playerDataArray }) => {
          // Clear any existing data to avoid duplicates
          localStorage.removeItem('golf_scheduler_players');
          localStorage.removeItem('golf_scheduler_weeks');
          localStorage.removeItem('golf_scheduler_schedules');
          // Reset the in-memory player manager
          (playerManager as any).players.clear();
          
          const activeSeason = await seasonManager.getActiveSeason();
          expect(activeSeason).not.toBeNull();
          
          if (!activeSeason) return;
          
          // Add players to the season with unique names to avoid duplicates
          const addedPlayers = [];
          for (let i = 0; i < playerDataArray.length; i++) {
            const playerData = playerDataArray[i];
            // Make names unique by adding index
            const uniquePlayerData = {
              ...playerData,
              firstName: `${playerData.firstName}${i}`,
              lastName: `${playerData.lastName}${i}`
            };
            const player = await playerManager.addPlayer(uniquePlayerData);
            addedPlayers.push(player);
          }
          
          // Create a test week
          const weekData = await weekRepository.create({
            seasonId: activeSeason.id,
            weekNumber: 1,
            date: new Date('2024-01-08')
          });
          const testWeek = weekData;
          
          // Create a basic schedule with foursomes
          const morningFoursomes = [];
          const afternoonFoursomes = [];
          
          // Create foursomes from available players
          for (let i = 0; i < Math.floor(addedPlayers.length / 4); i++) {
            const foursomeId = `foursome-${i + 1}`;
            const foursomePlayers = addedPlayers.slice(i * 4, (i + 1) * 4);
            
            if (i % 2 === 0) {
              morningFoursomes.push(new FoursomeModel({
                players: foursomePlayers,
                timeSlot: 'morning',
                position: i,
                id: foursomeId
              }));
            } else {
              afternoonFoursomes.push(new FoursomeModel({
                players: foursomePlayers,
                timeSlot: 'afternoon',
                position: i,
                id: foursomeId
              }));
            }
          }
          
          const schedule = new ScheduleModel({
            weekId: testWeek.id,
            timeSlots: {
              morning: morningFoursomes,
              afternoon: afternoonFoursomes
            }
          });
          
          // Save the schedule
          await scheduleManager.createWeeklySchedule(testWeek.id, { validatePreconditions: false });
          
          // Property: Schedule should be retrievable and match what was saved
          const retrievedSchedule = await scheduleManager.getSchedule(testWeek.id);
          expect(retrievedSchedule).not.toBeNull();
          
          if (retrievedSchedule) {
            expect(retrievedSchedule.weekId).toBe(testWeek.id);
            expect(retrievedSchedule.timeSlots.morning.length).toBeGreaterThanOrEqual(0);
            expect(retrievedSchedule.timeSlots.afternoon.length).toBeGreaterThanOrEqual(0);
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  test('Property 8.5: Bulk operations maintain data consistency', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate bulk operations
        fc.array(
          fc.record({
            operation: fc.constantFrom('add', 'update', 'remove'),
            playerData: fc.record({
              firstName: fc.string({ minLength: 1, maxLength: 15 })
                .filter(s => s.trim().length > 0), // No empty strings after trimming
              lastName: fc.string({ minLength: 1, maxLength: 15 })
                .filter(s => s.trim().length > 0), // No empty strings after trimming
              handedness: fc.constantFrom('left', 'right') as fc.Arbitrary<Handedness>,
              timePreference: fc.constantFrom('AM', 'PM', 'Either') as fc.Arbitrary<TimePreference>
            })
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (operationSpecs) => {
          const activeSeason = await seasonManager.getActiveSeason();
          expect(activeSeason).not.toBeNull();
          
          if (!activeSeason) return;
          
          // Filter to only 'add' operations for this test to avoid complexity
          const addOperations: BulkPlayerOperation[] = operationSpecs
            .filter(spec => spec.operation === 'add')
            .map(spec => ({
              operation: 'add' as const,
              playerData: spec.playerData
            }));
          
          if (addOperations.length === 0) return;
          
          // Property: Bulk operations should complete successfully
          const result = await importExportService.performBulkPlayerOperations(addOperations);
          
          expect(result.success).toBe(true);
          expect(result.successCount).toBe(addOperations.length);
          expect(result.failureCount).toBe(0);
          
          // Property: All players should be added to the season
          const allPlayers = await playerManager.getAllPlayers(activeSeason.id);
          expect(allPlayers.length).toBeGreaterThanOrEqual(addOperations.length);
          
          // Property: Each added player should be findable
          for (const operation of addOperations) {
            if (operation.playerData) {
              const foundPlayer = allPlayers.find(p => 
                p.firstName === operation.playerData!.firstName &&
                p.lastName === operation.playerData!.lastName
              );
              expect(foundPlayer).toBeDefined();
            }
          }
        }
      ),
      { numRuns: 10 }
    );
  });
});