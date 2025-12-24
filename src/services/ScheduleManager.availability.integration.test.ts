/**
 * Integration tests for ScheduleManager availability validation end-to-end workflows
 * Feature: availability-validation-bug-fix, Task 7: Integration tests for end-to-end validation
 * Validates: Requirements 1.1, 1.4, 2.2, 2.5
 */

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

describe.skip('ScheduleManager Availability Integration Tests', () => {
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

  describe('End-to-End Workflow Tests', () => {
    /**
     * Test complete workflow from player availability setting to schedule generation
     * **Validates: Requirements 1.1, 1.4, 2.5**
     */
    test('should handle complete workflow - availability setting to schedule generation', async () => {
      const seasonId = 'test-season-e2e-workflow';
      
      // Step 1: Create players
      const players = Array.from({ length: 8 }, (_, i) => new PlayerModel({
        firstName: `Player${i}`,
        lastName: 'Test',
        handedness: i % 2 === 0 ? 'left' : 'right',
        timePreference: i < 4 ? 'AM' : 'PM',
        seasonId
      }));

      // Save players to repository
      for (const player of players) {
        await playerRepository.create(player);
      }

      // Step 2: Set player availability (6 available, 2 unavailable)
      const playerAvailability: Record<string, boolean> = {};
      players.forEach((player, index) => {
        playerAvailability[player.id] = index < 6; // First 6 available, last 2 unavailable
      });

      // Step 3: Create week with availability data
      const week = new WeekModel({
        seasonId,
        weekNumber: 1,
        date: new Date(),
        playerAvailability
      });

      const createdWeek = await weekRepository.create(week);

      // Step 4: Generate schedule using ScheduleManager.createWeeklySchedule()
      const schedule = await scheduleManager.createWeeklySchedule(createdWeek.id);

      // Step 5: Verify schedule only contains available players
      const scheduledPlayerIds = new Set(schedule.getAllPlayers());
      const availablePlayerIds = new Set(players.slice(0, 6).map(p => p.id));
      const unavailablePlayerIds = new Set(players.slice(6).map(p => p.id));

      // Assertions: Only available players should be scheduled
      expect(scheduledPlayerIds.size).toBeGreaterThan(0);
      
      // Check that all scheduled players are available
      for (const playerId of scheduledPlayerIds) {
        expect(availablePlayerIds.has(playerId)).toBe(true);
      }

      // Check that no unavailable players are scheduled
      for (const playerId of unavailablePlayerIds) {
        expect(scheduledPlayerIds.has(playerId)).toBe(false);
      }

      // Step 6: Verify schedule validation passes
      const allPlayers = await playerRepository.findBySeasonId(seasonId);
      const availablePlayers = scheduleGenerator.filterAvailablePlayers(allPlayers, createdWeek);
      
      const validation = await scheduleManager.validateScheduleConstraints(
        schedule, 
        availablePlayers, 
        createdWeek
      );

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);

      // Step 7: Verify finalization succeeds
      const finalizedSchedule = await scheduleManager.finalizeSchedule(createdWeek.id);
      expect(finalizedSchedule).toBeDefined();
      expect(finalizedSchedule.id).toBe(schedule.id);
    });

    /**
     * Test schedule regeneration with availability changes
     * **Validates: Requirements 1.1, 1.4, 2.2**
     */
    test('should handle schedule regeneration with availability changes', async () => {
      const seasonId = 'test-season-regeneration';
      
      // Step 1: Create players
      const players = Array.from({ length: 6 }, (_, i) => new PlayerModel({
        firstName: `Player${i}`,
        lastName: 'Test',
        handedness: i % 2 === 0 ? 'left' : 'right',
        timePreference: 'Either',
        seasonId
      }));

      // Save players to repository
      for (const player of players) {
        await playerRepository.create(player);
      }

      // Step 2: Initial availability - all players available
      const initialAvailability: Record<string, boolean> = {};
      players.forEach(player => {
        initialAvailability[player.id] = true;
      });

      const week = new WeekModel({
        seasonId,
        weekNumber: 1,
        date: new Date(),
        playerAvailability: initialAvailability
      });

      const createdWeek = await weekRepository.create(week);

      // Step 3: Generate initial schedule
      const initialSchedule = await scheduleManager.createWeeklySchedule(createdWeek.id);
      const initialPlayerIds = new Set(initialSchedule.getAllPlayers());

      expect(initialPlayerIds.size).toBe(6); // All players should be scheduled

      // Step 4: Change availability - make 2 players unavailable
      const updatedAvailability = { ...initialAvailability };
      updatedAvailability[players[0].id] = false;
      updatedAvailability[players[1].id] = false;

      // Update week with new availability
      await weekRepository.update(createdWeek.id, {
        playerAvailability: updatedAvailability
      });

      const updatedWeek = await weekRepository.findById(createdWeek.id);
      if (!updatedWeek) {
        throw new Error('Failed to retrieve updated week');
      }

      // Step 5: Regenerate schedule
      const regenerationResult = await scheduleManager.regenerateSchedule(createdWeek.id);

      expect(regenerationResult.success).toBe(true);
      expect(regenerationResult.changesDetected.playersRemoved.length).toBeGreaterThanOrEqual(0);

      // Step 6: Verify regenerated schedule respects new availability
      const regeneratedSchedule = await scheduleManager.getSchedule(createdWeek.id);
      if (!regeneratedSchedule) {
        throw new Error('Failed to retrieve regenerated schedule');
      }

      const regeneratedPlayerIds = new Set(regeneratedSchedule.getAllPlayers());

      // Should not contain the unavailable players
      expect(regeneratedPlayerIds.has(players[0].id)).toBe(false);
      expect(regeneratedPlayerIds.has(players[1].id)).toBe(false);

      // Should still contain available players
      expect(regeneratedPlayerIds.has(players[2].id)).toBe(true);
      expect(regeneratedPlayerIds.has(players[3].id)).toBe(true);

      // Step 7: Verify validation passes for regenerated schedule
      const allPlayers = await playerRepository.findBySeasonId(seasonId);
      const availablePlayers = scheduleGenerator.filterAvailablePlayers(allPlayers, updatedWeek);
      
      const validation = await scheduleManager.validateScheduleConstraints(
        regeneratedSchedule, 
        availablePlayers, 
        updatedWeek
      );

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    /**
     * Test availability filtering in ScheduleManager.createWeeklySchedule()
     * **Validates: Requirements 1.1, 1.4**
     */
    test('should verify availability filtering works correctly in createWeeklySchedule', async () => {
      const seasonId = 'test-season-filtering';
      
      // Create players with different availability patterns
      const players = [
        new PlayerModel({
          firstName: 'Available1',
          lastName: 'Player',
          handedness: 'left',
          timePreference: 'AM',
          seasonId
        }),
        new PlayerModel({
          firstName: 'Unavailable1',
          lastName: 'Player',
          handedness: 'right',
          timePreference: 'AM',
          seasonId
        }),
        new PlayerModel({
          firstName: 'Available2',
          lastName: 'Player',
          handedness: 'left',
          timePreference: 'PM',
          seasonId
        }),
        new PlayerModel({
          firstName: 'Unavailable2',
          lastName: 'Player',
          handedness: 'right',
          timePreference: 'PM',
          seasonId
        }),
        new PlayerModel({
          firstName: 'Available3',
          lastName: 'Player',
          handedness: 'left',
          timePreference: 'Either',
          seasonId
        }),
        new PlayerModel({
          firstName: 'Available4',
          lastName: 'Player',
          handedness: 'right',
          timePreference: 'Either',
          seasonId
        })
      ];

      // Save players to repository
      for (const player of players) {
        await playerRepository.create(player);
      }

      // Set specific availability pattern
      const playerAvailability: Record<string, boolean> = {
        [players[0].id]: true,   // Available1 - available
        [players[1].id]: false,  // Unavailable1 - unavailable
        [players[2].id]: true,   // Available2 - available
        [players[3].id]: false,  // Unavailable2 - unavailable
        [players[4].id]: true,   // Available3 - available
        [players[5].id]: true    // Available4 - available
      };

      const week = new WeekModel({
        seasonId,
        weekNumber: 1,
        date: new Date(),
        playerAvailability
      });

      const createdWeek = await weekRepository.create(week);

      // Test: createWeeklySchedule should only include available players
      const schedule = await scheduleManager.createWeeklySchedule(createdWeek.id);
      const scheduledPlayerIds = new Set(schedule.getAllPlayers());

      // Should include available players
      expect(scheduledPlayerIds.has(players[0].id)).toBe(true);  // Available1
      expect(scheduledPlayerIds.has(players[2].id)).toBe(true);  // Available2
      expect(scheduledPlayerIds.has(players[4].id)).toBe(true);  // Available3
      expect(scheduledPlayerIds.has(players[5].id)).toBe(true);  // Available4

      // Should NOT include unavailable players
      expect(scheduledPlayerIds.has(players[1].id)).toBe(false); // Unavailable1
      expect(scheduledPlayerIds.has(players[3].id)).toBe(false); // Unavailable2

      // Verify time preference distribution among available players
      const morningPlayers = schedule.timeSlots.morning.flatMap(f => f.players);
      const afternoonPlayers = schedule.timeSlots.afternoon.flatMap(f => f.players);

      // Available1 (AM preference) should be in morning if scheduled
      const available1InMorning = morningPlayers.some(p => p.id === players[0].id);
      const available1InAfternoon = afternoonPlayers.some(p => p.id === players[0].id);
      
      if (scheduledPlayerIds.has(players[0].id)) {
        expect(available1InMorning).toBe(true);
        expect(available1InAfternoon).toBe(false);
      }

      // Available2 (PM preference) should be in afternoon if scheduled
      const available2InMorning = morningPlayers.some(p => p.id === players[2].id);
      const available2InAfternoon = afternoonPlayers.some(p => p.id === players[2].id);
      
      if (scheduledPlayerIds.has(players[2].id)) {
        expect(available2InMorning).toBe(false);
        expect(available2InAfternoon).toBe(true);
      }
    });
  });

  describe('Error Handling Integration Tests', () => {
    /**
     * Test error handling when no players are available
     * **Validates: Requirements 1.1, 2.2**
     */
    test('should handle error case - no available players', async () => {
      const seasonId = 'test-season-no-available';
      
      // Create players
      const players = Array.from({ length: 4 }, (_, i) => new PlayerModel({
        firstName: `Player${i}`,
        lastName: 'Test',
        handedness: i % 2 === 0 ? 'left' : 'right',
        timePreference: 'Either',
        seasonId
      }));

      // Save players to repository
      for (const player of players) {
        await playerRepository.create(player);
      }

      // Set all players as unavailable
      const playerAvailability: Record<string, boolean> = {};
      players.forEach(player => {
        playerAvailability[player.id] = false;
      });

      const week = new WeekModel({
        seasonId,
        weekNumber: 1,
        date: new Date(),
        playerAvailability
      });

      const createdWeek = await weekRepository.create(week);

      // Test: createWeeklySchedule should create empty schedule
      const schedule = await scheduleManager.createWeeklySchedule(createdWeek.id, { validatePreconditions: false });
      const scheduledPlayerIds = schedule.getAllPlayers();

      expect(scheduledPlayerIds).toHaveLength(0);
      expect(schedule.timeSlots.morning).toHaveLength(0);
      expect(schedule.timeSlots.afternoon).toHaveLength(0);

      // Test: Finalization should succeed for empty schedule
      const finalizedSchedule = await scheduleManager.finalizeSchedule(createdWeek.id);
      expect(finalizedSchedule).toBeDefined();
    });

    /**
     * Test error handling when insufficient players are available
     * **Validates: Requirements 1.1, 2.2**
     */
    test('should handle edge case - insufficient available players', async () => {
      const seasonId = 'test-season-insufficient';
      
      // Create players
      const players = Array.from({ length: 6 }, (_, i) => new PlayerModel({
        firstName: `Player${i}`,
        lastName: 'Test',
        handedness: i % 2 === 0 ? 'left' : 'right',
        timePreference: 'Either',
        seasonId
      }));

      // Save players to repository
      for (const player of players) {
        await playerRepository.create(player);
      }

      // Set only 2 players as available (insufficient for full foursomes)
      const playerAvailability: Record<string, boolean> = {};
      players.forEach((player, index) => {
        playerAvailability[player.id] = index < 2; // Only first 2 available
      });

      const week = new WeekModel({
        seasonId,
        weekNumber: 1,
        date: new Date(),
        playerAvailability
      });

      const createdWeek = await weekRepository.create(week);

      // Test: createWeeklySchedule should work with available players
      const schedule = await scheduleManager.createWeeklySchedule(createdWeek.id, { validatePreconditions: false });
      const scheduledPlayerIds = new Set(schedule.getAllPlayers());

      // Should only schedule the 2 available players
      expect(scheduledPlayerIds.size).toBe(2);
      expect(scheduledPlayerIds.has(players[0].id)).toBe(true);
      expect(scheduledPlayerIds.has(players[1].id)).toBe(true);

      // Should not schedule unavailable players
      for (let i = 2; i < 6; i++) {
        expect(scheduledPlayerIds.has(players[i].id)).toBe(false);
      }

      // Test: Validation should pass (partial foursomes are allowed)
      const allPlayers = await playerRepository.findBySeasonId(seasonId);
      const availablePlayers = scheduleGenerator.filterAvailablePlayers(allPlayers, createdWeek);
      
      const validation = await scheduleManager.validateScheduleConstraints(
        schedule, 
        availablePlayers, 
        createdWeek
      );

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });

  describe('Availability Change Integration Tests', () => {
    /**
     * Test dynamic availability changes and their impact on existing schedules
     * **Validates: Requirements 1.4, 2.2, 2.5**
     */
    test('should handle dynamic availability changes', async () => {
      const seasonId = 'test-season-dynamic';
      
      // Create players
      const players = Array.from({ length: 8 }, (_, i) => new PlayerModel({
        firstName: `Player${i}`,
        lastName: 'Test',
        handedness: i % 2 === 0 ? 'left' : 'right',
        timePreference: i < 4 ? 'AM' : 'PM',
        seasonId
      }));

      // Save players to repository
      for (const player of players) {
        await playerRepository.create(player);
      }

      // Initial state: all players available
      const initialAvailability: Record<string, boolean> = {};
      players.forEach(player => {
        initialAvailability[player.id] = true;
      });

      const week = new WeekModel({
        seasonId,
        weekNumber: 1,
        date: new Date(),
        playerAvailability: initialAvailability
      });

      const createdWeek = await weekRepository.create(week);

      // Generate initial schedule
      const initialSchedule = await scheduleManager.createWeeklySchedule(createdWeek.id);
      expect(initialSchedule.getAllPlayers()).toHaveLength(8);

      // Scenario 1: Make some players unavailable
      const updatedAvailability1 = { ...initialAvailability };
      updatedAvailability1[players[0].id] = false;
      updatedAvailability1[players[1].id] = false;

      await weekRepository.update(createdWeek.id, {
        playerAvailability: updatedAvailability1
      });

      const updatedWeek1 = await weekRepository.findById(createdWeek.id);
      if (!updatedWeek1) throw new Error('Failed to retrieve updated week');

      // Validate existing schedule against new availability
      const allPlayers = await playerRepository.findBySeasonId(seasonId);
      const availablePlayers1 = scheduleGenerator.filterAvailablePlayers(allPlayers, updatedWeek1);
      
      const validation1 = await scheduleManager.validateScheduleConstraints(
        initialSchedule, 
        availablePlayers1, 
        updatedWeek1
      );

      // Should fail validation due to unavailable players being scheduled
      expect(validation1.isValid).toBe(false);
      expect(validation1.errors.length).toBeGreaterThan(0);

      // Scenario 2: Regenerate schedule with new availability
      const regenerationResult = await scheduleManager.regenerateSchedule(createdWeek.id);
      expect(regenerationResult.success).toBe(true);

      const newSchedule = await scheduleManager.getSchedule(createdWeek.id);
      if (!newSchedule) throw new Error('Failed to retrieve new schedule');

      // New schedule should not contain unavailable players
      const newScheduledIds = new Set(newSchedule.getAllPlayers());
      expect(newScheduledIds.has(players[0].id)).toBe(false);
      expect(newScheduledIds.has(players[1].id)).toBe(false);

      // Scenario 3: Make previously unavailable players available again
      const updatedAvailability2 = { ...updatedAvailability1 };
      updatedAvailability2[players[0].id] = true;

      await weekRepository.update(createdWeek.id, {
        playerAvailability: updatedAvailability2
      });

      const updatedWeek2 = await weekRepository.findById(createdWeek.id);
      if (!updatedWeek2) throw new Error('Failed to retrieve updated week');

      // Regenerate again
      const regenerationResult2 = await scheduleManager.regenerateSchedule(createdWeek.id);
      expect(regenerationResult2.success).toBe(true);

      const finalSchedule = await scheduleManager.getSchedule(createdWeek.id);
      if (!finalSchedule) throw new Error('Failed to retrieve final schedule');

      const finalScheduledIds = new Set(finalSchedule.getAllPlayers());
      
      // Player 0 should be back in the schedule
      expect(finalScheduledIds.has(players[0].id)).toBe(true);
      // Player 1 should still be unavailable
      expect(finalScheduledIds.has(players[1].id)).toBe(false);

      // Final validation should pass
      const availablePlayers2 = scheduleGenerator.filterAvailablePlayers(allPlayers, updatedWeek2);
      const finalValidation = await scheduleManager.validateScheduleConstraints(
        finalSchedule, 
        availablePlayers2, 
        updatedWeek2
      );

      expect(finalValidation.isValid).toBe(true);
      expect(finalValidation.errors).toHaveLength(0);
    });
  });
});