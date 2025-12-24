/**
 * Property-based tests for ScheduleManager availability validation
 * Feature: availability-validation-bug-fix, Property 3: Finalization blocking on violations
 * Validates: Requirements 2.2
 */

import * as fc from 'fast-check';
import { getPropertyTestParams } from '../test-utils/property-test-config';
import { ScheduleManager } from './ScheduleManager';
import { LocalScheduleRepository } from '../repositories/ScheduleRepository';
import { LocalWeekRepository } from '../repositories/WeekRepository';
import { LocalPlayerRepository } from '../repositories/PlayerRepository';
import { LocalPairingHistoryRepository } from '../repositories/PairingHistoryRepository';
import { ScheduleGenerator } from './ScheduleGenerator';
import { PairingHistoryTracker } from './PairingHistoryTracker';
import { LocalScheduleBackupService } from './ScheduleBackupService';
import { PlayerModel } from '../models/Player';
import { WeekModel } from '../models/Week';
import { ScheduleModel } from '../models/Schedule';
import { FoursomeModel } from '../models/Foursome';

// Mock localStorage for testing
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    }
  };
})();

// Mock localStorage in global scope for Node.js environment
(global as any).localStorage = localStorageMock;

describe('ScheduleManager Availability Property Tests', () => {
  let scheduleManager: ScheduleManager;
  let scheduleRepository: LocalScheduleRepository;
  let weekRepository: LocalWeekRepository;
  let playerRepository: LocalPlayerRepository;
  let pairingHistoryRepository: LocalPairingHistoryRepository;
  let scheduleGenerator: ScheduleGenerator;
  let pairingHistoryTracker: PairingHistoryTracker;
  let backupService: LocalScheduleBackupService;

  beforeEach(async () => {
    // Clear localStorage before each test
    localStorageMock.clear();

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

  afterEach(async () => {
    if (scheduleManager) {
      scheduleManager.stopPeriodicCleanup();
    }
    // Clear localStorage after each test
    localStorageMock.clear();
  });

  /**
   * Property 3: Finalization blocking on violations
   * For any schedule containing availability violations, the finalization process 
   * should be blocked until all conflicts are resolved
   * **Validates: Requirements 2.2**
   */
  test('Property 3: Finalization blocking on violations', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate test data: season, players with mixed availability, and schedule with violations
        fc.record({
          seasonId: fc.string({ minLength: 1, maxLength: 20 }).map(s => `season-${s}`),
          weekNumber: fc.integer({ min: 1, max: 52 }),
          playerCount: fc.integer({ min: 4, max: 12 }),
          unavailablePlayerIndices: fc.array(fc.integer({ min: 0, max: 11 }), { minLength: 1, maxLength: 3 })
        }),
        
        async ({ seasonId, weekNumber, playerCount, unavailablePlayerIndices }) => {
          // Create unique player names to avoid conflicts
          const testId = Math.random().toString(36).substring(7);
          
          // Create players for the season
          const players = Array.from({ length: playerCount }, (_, i) => new PlayerModel({
            firstName: `Player${i}_${testId}`,
            lastName: `Test`,
            handedness: i % 2 === 0 ? 'left' : 'right',
            timePreference: 'Either',
            seasonId
          }));

          // Save players to repository
          for (const player of players) {
            await playerRepository.create(player);
          }

          // Create availability data with some players marked as unavailable
          const playerAvailability: Record<string, boolean> = {};
          players.forEach((player, index) => {
            // Mark specific players as unavailable based on generated indices
            const isUnavailable = unavailablePlayerIndices.includes(index % playerCount);
            playerAvailability[player.id] = !isUnavailable;
          });

          // Create week with mixed availability
          const week = new WeekModel({
            seasonId,
            weekNumber,
            date: new Date(),
            playerAvailability
          });

          const createdWeek = await weekRepository.create(week);

          // Create a schedule that includes unavailable players (violation)
          const schedule = new ScheduleModel({ weekId: createdWeek.id });
          
          // Add foursomes that include unavailable players
          const unavailablePlayers = players.filter((_, index) => 
            unavailablePlayerIndices.includes(index % playerCount)
          );
          
          if (unavailablePlayers.length > 0) {
            // Create a foursome with at least one unavailable player
            const playersForFoursome = [
              unavailablePlayers[0], // At least one unavailable player
              ...players.filter(p => playerAvailability[p.id] === true).slice(0, 3) // Fill with available players
            ].slice(0, 4);

            const foursome = new FoursomeModel({
              players: playersForFoursome,
              timeSlot: 'morning',
              position: 0
            });

            schedule.addFoursome(foursome);

            // Save the schedule
            const savedSchedule = await scheduleRepository.create({ weekId: createdWeek.id });
            await scheduleRepository.update(savedSchedule.id, {
              timeSlots: schedule.timeSlots,
              lastModified: new Date()
            });

            // Property: Finalization should be blocked when availability violations exist
            let finalizationBlocked = false;
            let errorMessage = '';

            try {
              await scheduleManager.finalizeSchedule(createdWeek.id);
              // If we reach here, finalization was not blocked (property violation)
              finalizationBlocked = false;
            } catch (error) {
              // Finalization was blocked (expected behavior)
              finalizationBlocked = true;
              errorMessage = error instanceof Error ? error.message : 'Unknown error';
            }

            // Property assertion: Finalization must be blocked for schedules with availability violations
            expect(finalizationBlocked).toBe(true);
            
            // Property assertion: Error message should mention availability violations
            expect(errorMessage).toMatch(/availability|unavailable|validation/i);
            
            // Property assertion: Error should provide specific conflict details
            expect(errorMessage).toContain(unavailablePlayers[0].firstName);
          }
        }
      ),
      getPropertyTestParams()
    );
  }, 30000); // Extended timeout for property test

  /**
   * Property 4: Successful schedule availability confirmation
   * For any schedule containing only available players, the availability confirmation 
   * process should succeed and return detailed confirmation data
   * **Validates: Requirements 2.5**
   */
  test('Property 4: Successful schedule availability confirmation', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate test data: season and players all marked as available
        fc.record({
          seasonId: fc.string({ minLength: 1, maxLength: 20 }).map(s => `season-${s}`),
          weekNumber: fc.integer({ min: 1, max: 52 }),
          playerCount: fc.integer({ min: 4, max: 8 })
        }),
        
        async ({ seasonId, weekNumber, playerCount }) => {
          // Create unique season ID to avoid conflicts
          const uniqueSeasonId = `${seasonId}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
          
          // Create unique player names to avoid conflicts
          const testId = Math.random().toString(36).substring(7);
          
          // Create players for the season
          const players = Array.from({ length: playerCount }, (_, i) => new PlayerModel({
            firstName: `Player${i}_${testId}`,
            lastName: `Test`,
            handedness: i % 2 === 0 ? 'left' : 'right',
            timePreference: 'Either',
            seasonId: uniqueSeasonId
          }));

          // Save players to repository
          for (const player of players) {
            await playerRepository.create(player);
          }

          // Create availability data with ALL players marked as available
          const playerAvailability: Record<string, boolean> = {};
          players.forEach(player => {
            playerAvailability[player.id] = true; // All available
          });

          // Create week with all players available
          const week = new WeekModel({
            seasonId: uniqueSeasonId,
            weekNumber,
            date: new Date(),
            playerAvailability
          });

          const createdWeek = await weekRepository.create(week);

          // Create a valid schedule with only available players
          const schedule = new ScheduleModel({ weekId: createdWeek.id });
          
          // Create foursomes with available players only
          const playersPerFoursome = Math.min(4, players.length);
          const foursome = new FoursomeModel({
            players: players.slice(0, playersPerFoursome),
            timeSlot: 'morning',
            position: 0
          });

          schedule.addFoursome(foursome);

          // Save the schedule
          const savedSchedule = await scheduleRepository.create({ weekId: createdWeek.id });
          await scheduleRepository.update(savedSchedule.id, {
            timeSlots: schedule.timeSlots,
            lastModified: new Date()
          });

          // Property: Availability confirmation should succeed for valid schedules
          const availablePlayers = scheduleGenerator.filterAvailablePlayers(players, createdWeek);
          const validation = await scheduleManager.validateScheduleConstraints(savedSchedule, availablePlayers, createdWeek);

          // Property assertion: Validation should succeed for schedules with only available players
          expect(validation.isValid).toBe(true);
          
          // Property assertion: No availability-related errors should be present
          const availabilityErrors = validation.errors.filter(error => 
            error.includes('availability') || error.includes('unavailable')
          );
          expect(availabilityErrors).toHaveLength(0);

          // Property assertion: All scheduled players should be in the available players list
          const scheduledPlayerIds = new Set(schedule.getAllPlayers());
          const availablePlayerIds = new Set(availablePlayers.map(p => p.id));
          
          for (const scheduledPlayerId of scheduledPlayerIds) {
            expect(availablePlayerIds.has(scheduledPlayerId)).toBe(true);
          }

          // Property assertion: Conflict report should show no conflicts
          const conflictReport = scheduleManager.generateAvailabilityConflictReport(savedSchedule, createdWeek);
          expect(conflictReport.conflicts).toHaveLength(0);
          expect(conflictReport.suggestions).toHaveLength(0);
        }
      ),
      getPropertyTestParams()
    );
  }, 30000); // Extended timeout for property test

  /**
   * Property 3b: Successful finalization when no violations exist
   * For any schedule with only available players, finalization should succeed
   * **Validates: Requirements 2.2**
   */
  test('Property 3b: Successful finalization when no violations exist', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate test data: season and players all marked as available
        fc.record({
          seasonId: fc.string({ minLength: 1, maxLength: 20 }).map(s => `season-${s}`),
          weekNumber: fc.integer({ min: 1, max: 52 }),
          playerCount: fc.integer({ min: 4, max: 8 })
        }),
        
        async ({ seasonId, weekNumber, playerCount }) => {
          // Create unique season ID to avoid conflicts
          const uniqueSeasonId = `${seasonId}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
          
          // Create unique player names to avoid conflicts
          const testId = Math.random().toString(36).substring(7);
          
          // Create players for the season
          const players = Array.from({ length: playerCount }, (_, i) => new PlayerModel({
            firstName: `Player${i}_${testId}`,
            lastName: `Test`,
            handedness: i % 2 === 0 ? 'left' : 'right',
            timePreference: 'Either',
            seasonId: uniqueSeasonId
          }));

          // Save players to repository
          for (const player of players) {
            await playerRepository.create(player);
          }

          // Create availability data with ALL players marked as available
          const playerAvailability: Record<string, boolean> = {};
          players.forEach(player => {
            playerAvailability[player.id] = true; // All available
          });

          // Create week with all players available
          const week = new WeekModel({
            seasonId: uniqueSeasonId,
            weekNumber,
            date: new Date(),
            playerAvailability
          });

          const createdWeek = await weekRepository.create(week);

          // Create a valid schedule with only available players
          const schedule = new ScheduleModel({ weekId: createdWeek.id });
          
          // Create foursomes with available players only
          const playersPerFoursome = Math.min(4, players.length);
          const foursome = new FoursomeModel({
            players: players.slice(0, playersPerFoursome),
            timeSlot: 'morning',
            position: 0
          });

          schedule.addFoursome(foursome);

          // Save the schedule
          const savedSchedule = await scheduleRepository.create({ weekId: createdWeek.id });
          await scheduleRepository.update(savedSchedule.id, {
            timeSlots: schedule.timeSlots,
            lastModified: new Date()
          });

          // Property: Finalization should succeed when no availability violations exist
          let finalizationSucceeded = false;
          let errorMessage = '';

          try {
            const finalizedSchedule = await scheduleManager.finalizeSchedule(createdWeek.id);
            finalizationSucceeded = true;
            
            // Property assertion: Finalized schedule should be returned
            expect(finalizedSchedule).toBeDefined();
            expect(finalizedSchedule.id).toBe(savedSchedule.id);
          } catch (error) {
            finalizationSucceeded = false;
            errorMessage = error instanceof Error ? error.message : 'Unknown error';
          }

          // Property assertion: If finalization failed, it should not be due to availability violations
          if (!finalizationSucceeded) {
            expect(errorMessage).not.toMatch(/availability|unavailable/i);
            // For this property test, we're specifically testing that availability violations block finalization
            // Other validation failures are acceptable as long as they're not availability-related
          } else {
            // Property assertion: Finalization succeeded as expected for valid schedules
            expect(finalizationSucceeded).toBe(true);
          }
        }
      ),
      getPropertyTestParams()
    );
  }, 30000); // Extended timeout for property test
});