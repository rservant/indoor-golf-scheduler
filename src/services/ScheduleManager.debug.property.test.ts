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
import { InMemoryStorageProvider } from '../storage/InMemoryStorageProvider';

/**
 * Property-based tests for ScheduleManager debug endpoints
 * Feature: schedule-generation-fix, Property 7: Error reporting completeness
 * Validates: Requirements 4.1, 4.2, 4.3
 */

describe.skip('ScheduleManager Debug Endpoints Properties', () => {
  let scheduleManager: ScheduleManager;
  let scheduleRepository: LocalScheduleRepository;
  let weekRepository: LocalWeekRepository;
  let playerRepository: LocalPlayerRepository;
  let pairingHistoryRepository: LocalPairingHistoryRepository;
  let scheduleGenerator: ScheduleGenerator;
  let pairingHistoryTracker: PairingHistoryTracker;
  let backupService: LocalScheduleBackupService;
  let storageProvider: InMemoryStorageProvider;

  beforeEach(async () => {
    // Create in-memory storage provider
    storageProvider = new InMemoryStorageProvider();

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
   * Property 7: Error reporting completeness
   * Debug endpoints should provide comprehensive error information for any schedule generation scenario
   */
  test('Property 7: Debug endpoints provide comprehensive error reporting', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          seasonId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
          weekNumber: fc.integer({ min: 1, max: 52 }),
          playerCount: fc.integer({ min: 0, max: 15 }),
          availabilityScenario: fc.constantFrom('all_available', 'none_available', 'mixed', 'no_data', 'partial_data')
        }),
        async (testData) => {
          // Create season and week with unique identifiers
          const uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          const weekId = `week-${testData.seasonId}-${testData.weekNumber}-${uniqueId}`;
          const uniqueSeasonId = `${testData.seasonId}-${uniqueId}`;
          
          // Create players
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

          // Create availability data based on scenario
          let playerAvailability: Record<string, boolean> = {};
          switch (testData.availabilityScenario) {
            case 'all_available':
              players.forEach(p => { playerAvailability[p.id] = true; });
              break;
            case 'none_available':
              players.forEach(p => { playerAvailability[p.id] = false; });
              break;
            case 'mixed':
              players.forEach((p, i) => { playerAvailability[p.id] = i % 2 === 0; });
              break;
            case 'partial_data':
              players.slice(0, Math.floor(players.length / 2)).forEach(p => { 
                playerAvailability[p.id] = true; 
              });
              break;
            case 'no_data':
              // Leave playerAvailability empty
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

          // Test debug endpoints
          const debugInfo = await scheduleManager.debugScheduleGeneration(weekId);

          // Property: Debug info should always be comprehensive
          expect(debugInfo).toBeDefined();
          expect(debugInfo).toHaveProperty('weekInfo');
          expect(debugInfo).toHaveProperty('playerData');
          expect(debugInfo).toHaveProperty('availabilityData');
          expect(debugInfo).toHaveProperty('generationAttempt');
          expect(debugInfo).toHaveProperty('validationResults');
          expect(debugInfo).toHaveProperty('errorReport');
          expect(debugInfo).toHaveProperty('preconditionCheck');

          // Week info should be accurate
          expect(debugInfo.weekInfo.id).toBe(weekId);
          expect(debugInfo.weekInfo.seasonId).toBe(uniqueSeasonId);
          expect(debugInfo.weekInfo.weekNumber).toBe(testData.weekNumber);

          // Player data should match created players
          expect(debugInfo.playerData).toHaveLength(testData.playerCount);
          debugInfo.playerData.forEach(playerData => {
            expect(playerData).toHaveProperty('id');
            expect(playerData).toHaveProperty('name');
            expect(playerData).toHaveProperty('timePreference');
            expect(playerData).toHaveProperty('handedness');
            expect(playerData).toHaveProperty('seasonId');
            expect(playerData).toHaveProperty('availabilityStatus');
            expect(playerData).toHaveProperty('availabilityReason');
            expect(playerData.seasonId).toBe(uniqueSeasonId);
          });

          // Availability data should be accurate
          expect(debugInfo.availabilityData.totalPlayers).toBe(testData.playerCount);
          expect(debugInfo.availabilityData.playersWithAvailabilityData).toBe(Object.keys(playerAvailability).length);

          // Generation attempt should have proper structure
          expect(debugInfo.generationAttempt).toHaveProperty('success');
          if (debugInfo.generationAttempt.success) {
            expect(debugInfo.generationAttempt).toHaveProperty('schedule');
            expect(debugInfo.generationAttempt).toHaveProperty('debugInfo');
          } else {
            expect(debugInfo.generationAttempt).toHaveProperty('error');
            expect(debugInfo.generationAttempt).toHaveProperty('debugInfo');
          }

          // Validation results should be present
          expect(debugInfo.validationResults).toHaveProperty('isValid');
          expect(debugInfo.validationResults).toHaveProperty('errors');
          expect(debugInfo.validationResults).toHaveProperty('warnings');
          expect(Array.isArray(debugInfo.validationResults.errors)).toBe(true);
          expect(Array.isArray(debugInfo.validationResults.warnings)).toBe(true);

          // Error report should have proper structure
          expect(debugInfo.errorReport).toHaveProperty('conflicts');
          expect(debugInfo.errorReport).toHaveProperty('suggestions');
          expect(debugInfo.errorReport).toHaveProperty('summary');
          expect(debugInfo.errorReport).toHaveProperty('metadata');

          // Precondition check should be comprehensive
          expect(debugInfo.preconditionCheck).toHaveProperty('isValid');
          expect(debugInfo.preconditionCheck).toHaveProperty('checks');
          expect(Array.isArray(debugInfo.preconditionCheck.checks)).toBe(true);
          expect(debugInfo.preconditionCheck.checks.length).toBeGreaterThan(0);

          // Each precondition check should have required properties
          debugInfo.preconditionCheck.checks.forEach((check: any) => {
            expect(check).toHaveProperty('name');
            expect(check).toHaveProperty('passed');
            expect(check).toHaveProperty('message');
            expect(typeof check.name).toBe('string');
            expect(typeof check.passed).toBe('boolean');
            expect(typeof check.message).toBe('string');
          });
        }
      ),
      { numRuns: 10, timeout: 15000 }
    );
  });

  test('Property 7: Precondition validation provides detailed checks', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          seasonId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
          weekNumber: fc.integer({ min: 1, max: 52 }),
          hasPlayers: fc.boolean(),
          hasAvailabilityData: fc.boolean(),
          sufficientPlayers: fc.boolean()
        }),
        async (testData) => {
          const uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          const weekId = `week-${testData.seasonId}-${testData.weekNumber}-${uniqueId}`;
          const uniqueSeasonId = `${testData.seasonId}-${uniqueId}`;

          // Create players if specified
          if (testData.hasPlayers) {
            const playerCount = testData.sufficientPlayers ? 6 : 2;
            for (let i = 0; i < playerCount; i++) {
              const player = new PlayerModel({
                firstName: `Player${i}`,
                lastName: 'Test',
                handedness: 'right',
                timePreference: 'Either',
                seasonId: uniqueSeasonId
              });
              await playerRepository.create(player);
            }
          }

          // Create availability data if specified
          let playerAvailability: Record<string, boolean> = {};
          if (testData.hasAvailabilityData && testData.hasPlayers) {
            const players = await playerRepository.findBySeasonId(uniqueSeasonId);
            players.forEach(p => { playerAvailability[p.id] = true; });
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

          // Test precondition validation
          const preconditionCheck = await scheduleManager.validateScheduleGenerationPreconditions(weekId);

          // Property: Precondition check should be comprehensive
          expect(preconditionCheck).toHaveProperty('isValid');
          expect(preconditionCheck).toHaveProperty('checks');
          expect(Array.isArray(preconditionCheck.checks)).toBe(true);

          // Should have at least the core checks
          const checkNames = preconditionCheck.checks.map(c => c.name);
          expect(checkNames).toContain('Week Exists');
          expect(checkNames).toContain('Season Has Players');
          expect(checkNames).toContain('Availability Data Exists');
          expect(checkNames).toContain('Sufficient Available Players');
          expect(checkNames).toContain('No Schedule Conflicts');

          // Week exists check should always pass (we created the week)
          const weekExistsCheck = preconditionCheck.checks.find(c => c.name === 'Week Exists');
          expect(weekExistsCheck?.passed).toBe(true);

          // Season has players check should match our setup
          const hasPlayersCheck = preconditionCheck.checks.find(c => c.name === 'Season Has Players');
          expect(hasPlayersCheck?.passed).toBe(testData.hasPlayers);

          // Availability data check should match our setup
          const availabilityCheck = preconditionCheck.checks.find(c => c.name === 'Availability Data Exists');
          expect(availabilityCheck?.passed).toBe(testData.hasAvailabilityData && testData.hasPlayers);

          // Sufficient players check should consider both player count and availability
          const sufficientPlayersCheck = preconditionCheck.checks.find(c => c.name === 'Sufficient Available Players');
          const expectedSufficientPlayers = testData.hasPlayers && testData.sufficientPlayers && testData.hasAvailabilityData;
          expect(sufficientPlayersCheck?.passed).toBe(expectedSufficientPlayers);

          // Overall validity should be true only if all conditions are met
          const expectedOverallValidity = testData.hasPlayers && testData.sufficientPlayers && testData.hasAvailabilityData;
          expect(preconditionCheck.isValid).toBe(expectedOverallValidity);
        }
      ),
      { numRuns: 10, timeout: 10000 }
    );
  });

  test('Property 7: Player data inspection provides complete information', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          seasonId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
          weekNumber: fc.integer({ min: 1, max: 52 }),
          playerCount: fc.integer({ min: 1, max: 10 })
        }),
        async (testData) => {
          const uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          const weekId = `week-${testData.seasonId}-${testData.weekNumber}-${uniqueId}`;
          const uniqueSeasonId = `${testData.seasonId}-${uniqueId}`;

          // Create players with varied properties
          const createdPlayers: PlayerModel[] = [];
          for (let i = 0; i < testData.playerCount; i++) {
            const player = new PlayerModel({
              firstName: `Player${i}`,
              lastName: `Test${i}`,
              handedness: i % 2 === 0 ? 'left' : 'right',
              timePreference: ['AM', 'PM', 'Either'][i % 3] as 'AM' | 'PM' | 'Either',
              seasonId: uniqueSeasonId
            });
            createdPlayers.push(player);
            await playerRepository.create(player);
          }

          // Create mixed availability data
          const playerAvailability: Record<string, boolean> = {};
          createdPlayers.forEach((p, i) => {
            if (i % 3 === 0) {
              playerAvailability[p.id] = true;
            } else if (i % 3 === 1) {
              playerAvailability[p.id] = false;
            }
            // Leave some players without availability data (i % 3 === 2)
          });

          // Create week
          const week = new WeekModel({
            id: weekId,
            seasonId: uniqueSeasonId,
            weekNumber: testData.weekNumber,
            date: new Date(),
            playerAvailability
          });
          await weekRepository.create(week);

          // Test player data inspection
          const playerData = await scheduleManager.getPlayerDataForWeek(weekId);

          // Property: Player data should be complete and accurate
          expect(playerData).toHaveLength(testData.playerCount);

          playerData.forEach((data, i) => {
            const originalPlayer = createdPlayers[i];
            
            // Should have all required properties
            expect(data).toHaveProperty('id');
            expect(data).toHaveProperty('name');
            expect(data).toHaveProperty('timePreference');
            expect(data).toHaveProperty('handedness');
            expect(data).toHaveProperty('seasonId');
            expect(data).toHaveProperty('availabilityStatus');
            expect(data).toHaveProperty('availabilityReason');

            // Properties should match original player
            expect(data.id).toBe(originalPlayer.id);
            expect(data.name).toBe(`${originalPlayer.firstName} ${originalPlayer.lastName}`);
            expect(data.timePreference).toBe(originalPlayer.timePreference);
            expect(data.handedness).toBe(originalPlayer.handedness);
            expect(data.seasonId).toBe(uniqueSeasonId);

            // Availability status should match what we set
            const expectedStatus = playerAvailability[originalPlayer.id];
            expect(data.availabilityStatus).toBe(expectedStatus);

            // Availability reason should be descriptive
            expect(typeof data.availabilityReason).toBe('string');
            expect(data.availabilityReason.length).toBeGreaterThan(0);

            if (expectedStatus === true) {
              expect(data.availabilityReason).toContain('available');
            } else if (expectedStatus === false) {
              expect(data.availabilityReason).toContain('unavailable');
            } else {
              expect(data.availabilityReason).toMatch(/no.*data|undefined/i);
            }
          });
        }
      ),
      { numRuns: 10, timeout: 10000 }
    );
  });
});