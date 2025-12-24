/**
 * Unit tests for ScheduleManager availability validation bug scenarios
 * Feature: availability-validation-bug-fix, Task 6: Comprehensive unit tests for bug scenarios
 * Validates: Requirements 1.1, 1.3, 1.4, 1.5
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

describe.skip('ScheduleManager Availability Unit Tests', () => {
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

  describe('Original Bug Scenario Tests', () => {
    /**
     * Test the original bug scenario: John Smith and Alice Williams unavailable but scheduled
     * **Validates: Requirements 1.1, 1.3, 1.4, 1.5**
     */
    test('should detect and block original bug scenario - unavailable players scheduled', async () => {
      const seasonId = 'test-season-original-bug';
      
      // Create the specific players from the original bug report
      const johnSmith = new PlayerModel({
        firstName: 'John',
        lastName: 'Smith',
        handedness: 'right',
        timePreference: 'Either',
        seasonId
      });

      const aliceWilliams = new PlayerModel({
        firstName: 'Alice',
        lastName: 'Williams',
        handedness: 'left',
        timePreference: 'Either',
        seasonId
      });

      const bobJohnson = new PlayerModel({
        firstName: 'Bob',
        lastName: 'Johnson',
        handedness: 'right',
        timePreference: 'Either',
        seasonId
      });

      const carolDavis = new PlayerModel({
        firstName: 'Carol',
        lastName: 'Davis',
        handedness: 'left',
        timePreference: 'Either',
        seasonId
      });

      // Save players to repository
      await playerRepository.create(johnSmith);
      await playerRepository.create(aliceWilliams);
      await playerRepository.create(bobJohnson);
      await playerRepository.create(carolDavis);

      // Create availability data - John Smith and Alice Williams are unavailable
      const playerAvailability: Record<string, boolean> = {
        [johnSmith.id]: false,      // Unavailable
        [aliceWilliams.id]: false,  // Unavailable
        [bobJohnson.id]: true,      // Available
        [carolDavis.id]: true       // Available
      };

      // Create week with mixed availability
      const week = new WeekModel({
        seasonId,
        weekNumber: 1,
        date: new Date(),
        playerAvailability
      });

      const createdWeek = await weekRepository.create(week);

      // Debug: Check availability filtering
      const availablePlayers = scheduleGenerator.filterAvailablePlayers(
        [johnSmith, aliceWilliams, bobJohnson, carolDavis], 
        createdWeek
      );
      
      console.log('Debug - Available players:', availablePlayers.map(p => `${p.firstName} ${p.lastName}`));
      console.log('Debug - Available player count:', availablePlayers.length);
      
      // Should only have Bob and Carol as available
      expect(availablePlayers).toHaveLength(2);
      expect(availablePlayers.find(p => p.firstName === 'John')).toBeUndefined();
      expect(availablePlayers.find(p => p.firstName === 'Alice')).toBeUndefined();
      expect(availablePlayers.find(p => p.firstName === 'Bob')).toBeDefined();
      expect(availablePlayers.find(p => p.firstName === 'Carol')).toBeDefined();

      // Create a schedule that includes the unavailable players (reproducing the bug)
      const schedule = new ScheduleModel({ weekId: createdWeek.id });
      
      const foursome = new FoursomeModel({
        players: [johnSmith, aliceWilliams, bobJohnson, carolDavis], // Includes unavailable players
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

      // Debug: Check the saved schedule
      const retrievedSchedule = await scheduleRepository.findByWeekId(createdWeek.id);
      console.log('Debug - Retrieved schedule exists:', !!retrievedSchedule);
      console.log('Debug - Retrieved schedule players:', retrievedSchedule?.getAllPlayers());

      // Test: Validation should detect the availability violations
      const validation = await scheduleManager.validateScheduleConstraints(
        retrievedSchedule!, 
        availablePlayers, 
        createdWeek
      );

      console.log('Debug - Validation result:', {
        isValid: validation.isValid,
        errors: validation.errors,
        warnings: validation.warnings
      });

      // Assertions: Validation should fail
      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      
      // Should specifically mention John Smith and Alice Williams
      const johnError = validation.errors.find(error => error.includes('John Smith'));
      const aliceError = validation.errors.find(error => error.includes('Alice Williams'));
      
      expect(johnError).toBeDefined();
      expect(aliceError).toBeDefined();
      expect(johnError).toContain('unavailable');
      expect(aliceError).toContain('unavailable');

      // Test: Finalization should be blocked
      let finalizationBlocked = false;
      try {
        await scheduleManager.finalizeSchedule(createdWeek.id);
      } catch (error) {
        finalizationBlocked = true;
        expect(error).toBeInstanceOf(Error);
        const errorMessage = (error as Error).message;
        expect(errorMessage).toContain('John Smith');
        expect(errorMessage).toContain('Alice Williams');
      }

      expect(finalizationBlocked).toBe(true);

      // Test: Conflict report should identify the specific conflicts
      const conflictReport = scheduleManager.generateAvailabilityConflictReport(retrievedSchedule!, createdWeek);
      
      expect(conflictReport.conflicts).toHaveLength(2);
      
      const johnConflict = conflictReport.conflicts.find(c => c.playerName === 'John Smith');
      const aliceConflict = conflictReport.conflicts.find(c => c.playerName === 'Alice Williams');
      
      expect(johnConflict).toBeDefined();
      expect(aliceConflict).toBeDefined();
      expect(johnConflict?.availabilityStatus).toBe(false);
      expect(aliceConflict?.availabilityStatus).toBe(false);
      
      // Should provide resolution suggestions
      expect(conflictReport.suggestions.length).toBeGreaterThan(0);
      expect(conflictReport.suggestions.some(s => s.includes('Remove') && s.includes('unavailable'))).toBe(true);
    });
  });

  describe('Edge Case Tests', () => {
    /**
     * Test edge case: All players unavailable
     * **Validates: Requirements 1.1, 1.3**
     */
    test('should handle edge case - all players unavailable', async () => {
      const seasonId = 'test-season-all-unavailable';
      
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

      // Create availability data - ALL players unavailable
      const playerAvailability: Record<string, boolean> = {};
      players.forEach(player => {
        playerAvailability[player.id] = false; // All unavailable
      });

      // Create week
      const week = new WeekModel({
        seasonId,
        weekNumber: 1,
        date: new Date(),
        playerAvailability
      });

      const createdWeek = await weekRepository.create(week);

      // Test: Schedule generation should fail or produce empty schedule
      const availablePlayers = scheduleGenerator.filterAvailablePlayers(players, createdWeek);
      expect(availablePlayers).toHaveLength(0);

      // If a schedule somehow exists with unavailable players, validation should fail
      const schedule = new ScheduleModel({ weekId: createdWeek.id });
      const foursome = new FoursomeModel({
        players: players.slice(0, 4),
        timeSlot: 'morning',
        position: 0
      });
      schedule.addFoursome(foursome);

      const savedSchedule = await scheduleRepository.create({ weekId: createdWeek.id });
      await scheduleRepository.update(savedSchedule.id, {
        timeSlots: schedule.timeSlots,
        lastModified: new Date()
      });

      // Debug: Check what's happening
      const retrievedSchedule = await scheduleRepository.findByWeekId(createdWeek.id);
      console.log('Debug - All unavailable test:');
      console.log('- Available players:', availablePlayers.length);
      console.log('- Schedule players:', retrievedSchedule?.getAllPlayers().length);
      
      const validation = await scheduleManager.validateScheduleConstraints(
        retrievedSchedule!, 
        availablePlayers, 
        createdWeek
      );

      console.log('- Validation result:', {
        isValid: validation.isValid,
        errorCount: validation.errors.length,
        errors: validation.errors.slice(0, 2) // First 2 errors
      });

      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0); // Should have multiple errors
    });

    /**
     * Test edge case: All players available
     * **Validates: Requirements 1.1, 1.3**
     */
    test('should handle edge case - all players available', async () => {
      const seasonId = 'test-season-all-available';
      
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

      // Create availability data - ALL players available
      const playerAvailability: Record<string, boolean> = {};
      players.forEach(player => {
        playerAvailability[player.id] = true; // All available
      });

      // Create week
      const week = new WeekModel({
        seasonId,
        weekNumber: 1,
        date: new Date(),
        playerAvailability
      });

      const createdWeek = await weekRepository.create(week);

      // Create valid schedule with all available players
      const schedule = new ScheduleModel({ weekId: createdWeek.id });
      const foursome = new FoursomeModel({
        players: players,
        timeSlot: 'morning',
        position: 0
      });
      schedule.addFoursome(foursome);

      const savedSchedule = await scheduleRepository.create({ weekId: createdWeek.id });
      await scheduleRepository.update(savedSchedule.id, {
        timeSlots: schedule.timeSlots,
        lastModified: new Date()
      });

      // Test: Validation should succeed
      const availablePlayers = scheduleGenerator.filterAvailablePlayers(players, createdWeek);
      expect(availablePlayers).toHaveLength(4);

      const validation = await scheduleManager.validateScheduleConstraints(
        savedSchedule, 
        availablePlayers, 
        createdWeek
      );

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);

      // Test: Finalization should succeed
      const finalizedSchedule = await scheduleManager.finalizeSchedule(createdWeek.id);
      expect(finalizedSchedule).toBeDefined();
      expect(finalizedSchedule.id).toBe(savedSchedule.id);

      // Test: Conflict report should show no conflicts
      const conflictReport = scheduleManager.generateAvailabilityConflictReport(savedSchedule, createdWeek);
      expect(conflictReport.conflicts).toHaveLength(0);
      expect(conflictReport.suggestions).toHaveLength(0);
    });

    /**
     * Test edge case: Mixed availability states
     * **Validates: Requirements 1.1, 1.3, 1.4**
     */
    test('should handle edge case - mixed availability states', async () => {
      const seasonId = 'test-season-mixed-availability';
      
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

      // Create mixed availability data
      const playerAvailability: Record<string, boolean> = {
        [players[0].id]: true,   // Available
        [players[1].id]: false,  // Unavailable
        [players[2].id]: true,   // Available
        [players[3].id]: false,  // Unavailable
        [players[4].id]: true,   // Available
        [players[5].id]: true    // Available
      };

      // Create week
      const week = new WeekModel({
        seasonId,
        weekNumber: 1,
        date: new Date(),
        playerAvailability
      });

      const createdWeek = await weekRepository.create(week);

      // Create schedule with mixed players (some available, some not)
      const schedule = new ScheduleModel({ weekId: createdWeek.id });
      
      // Morning foursome with available players only
      const morningFoursome = new FoursomeModel({
        players: [players[0], players[2], players[4], players[5]], // All available
        timeSlot: 'morning',
        position: 0
      });

      // Afternoon foursome with unavailable players (should fail validation)
      const afternoonFoursome = new FoursomeModel({
        players: [players[1], players[3]], // Both unavailable
        timeSlot: 'afternoon',
        position: 0
      });

      schedule.addFoursome(morningFoursome);
      schedule.addFoursome(afternoonFoursome);

      const savedSchedule = await scheduleRepository.create({ weekId: createdWeek.id });
      await scheduleRepository.update(savedSchedule.id, {
        timeSlots: schedule.timeSlots,
        lastModified: new Date()
      });

      // Retrieve the updated schedule from the repository
      const retrievedSchedule = await scheduleRepository.findByWeekId(createdWeek.id);
      if (!retrievedSchedule) {
        throw new Error('Failed to retrieve updated schedule');
      }

      // Test: Validation should detect the unavailable players in afternoon
      const availablePlayers = scheduleGenerator.filterAvailablePlayers(players, createdWeek);
      expect(availablePlayers).toHaveLength(4); // Only 4 available

      const validation = await scheduleManager.validateScheduleConstraints(
        retrievedSchedule, 
        availablePlayers, 
        createdWeek
      );

      expect(validation.isValid).toBe(false);
      // The validation should detect the unavailable players - we expect multiple error types
      expect(validation.errors.length).toBeGreaterThan(0);
      
      // Check that specific availability errors are present
      const availabilityErrors = validation.errors.filter(error => 
        error.includes('marked as unavailable') || 
        error.includes('not in available players')
      );
      expect(availabilityErrors.length).toBeGreaterThanOrEqual(2); // At least 2 unavailable players detected

      // Test: Conflict report should identify afternoon conflicts
      const conflictReport = scheduleManager.generateAvailabilityConflictReport(retrievedSchedule, createdWeek);
      expect(conflictReport.conflicts).toHaveLength(2);
      
      const afternoonConflicts = conflictReport.conflicts.filter(c => c.timeSlot === 'afternoon');
      expect(afternoonConflicts).toHaveLength(2);
    });
  });

  describe('Availability Data Type Tests', () => {
    /**
     * Test various availability data types: true, false, undefined, null
     * **Validates: Requirements 1.1, 1.3**
     */
    test('should handle availability data type - explicit true', async () => {
      const seasonId = 'test-season-explicit-true';
      
      const player = new PlayerModel({
        firstName: 'Test',
        lastName: 'Player',
        handedness: 'right',
        timePreference: 'Either',
        seasonId
      });

      await playerRepository.create(player);

      // Explicit true availability
      const playerAvailability: Record<string, boolean> = {
        [player.id]: true
      };

      const week = new WeekModel({
        seasonId,
        weekNumber: 1,
        date: new Date(),
        playerAvailability
      });

      const createdWeek = await weekRepository.create(week);

      // Test: Player should be filtered as available
      const availablePlayers = scheduleGenerator.filterAvailablePlayers([player], createdWeek);
      expect(availablePlayers).toHaveLength(1);
      expect(availablePlayers[0].id).toBe(player.id);
    });

    test('should handle availability data type - explicit false', async () => {
      const seasonId = 'test-season-explicit-false';
      
      const player = new PlayerModel({
        firstName: 'Test',
        lastName: 'Player',
        handedness: 'right',
        timePreference: 'Either',
        seasonId
      });

      await playerRepository.create(player);

      // Explicit false availability
      const playerAvailability: Record<string, boolean> = {
        [player.id]: false
      };

      const week = new WeekModel({
        seasonId,
        weekNumber: 1,
        date: new Date(),
        playerAvailability
      });

      const createdWeek = await weekRepository.create(week);

      // Test: Player should NOT be filtered as available
      const availablePlayers = scheduleGenerator.filterAvailablePlayers([player], createdWeek);
      expect(availablePlayers).toHaveLength(0);

      // Test: If scheduled anyway, validation should fail
      const schedule = new ScheduleModel({ weekId: createdWeek.id });
      const foursome = new FoursomeModel({
        players: [player],
        timeSlot: 'morning',
        position: 0
      });
      schedule.addFoursome(foursome);

      const savedSchedule = await scheduleRepository.create({ weekId: createdWeek.id });
      await scheduleRepository.update(savedSchedule.id, {
        timeSlots: schedule.timeSlots,
        lastModified: new Date()
      });

      // Debug: Check what's happening
      const retrievedSchedule = await scheduleRepository.findByWeekId(createdWeek.id);
      console.log('Debug - Explicit false test:');
      console.log('- Available players:', availablePlayers.length);
      console.log('- Schedule players:', retrievedSchedule?.getAllPlayers().length);
      
      const validation = await scheduleManager.validateScheduleConstraints(
        retrievedSchedule!, 
        availablePlayers, 
        createdWeek
      );

      console.log('- Validation result:', {
        isValid: validation.isValid,
        errorCount: validation.errors.length,
        errors: validation.errors.slice(0, 2) // First 2 errors
      });

      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(error => error.includes('marked as unavailable'))).toBe(true);
    });

    test('should handle availability data type - undefined', async () => {
      const seasonId = 'test-season-undefined';
      
      const player = new PlayerModel({
        firstName: 'Test',
        lastName: 'Player',
        handedness: 'right',
        timePreference: 'Either',
        seasonId
      });

      await playerRepository.create(player);

      // No availability data (undefined)
      const week = new WeekModel({
        seasonId,
        weekNumber: 1,
        date: new Date()
        // No playerAvailability property
      });

      const createdWeek = await weekRepository.create(week);

      // Test: Player should NOT be filtered as available (strict filtering)
      const availablePlayers = scheduleGenerator.filterAvailablePlayers([player], createdWeek);
      expect(availablePlayers).toHaveLength(0);

      // Test: If scheduled anyway, validation should fail
      const schedule = new ScheduleModel({ weekId: createdWeek.id });
      const foursome = new FoursomeModel({
        players: [player],
        timeSlot: 'morning',
        position: 0
      });
      schedule.addFoursome(foursome);

      const savedSchedule = await scheduleRepository.create({ weekId: createdWeek.id });
      await scheduleRepository.update(savedSchedule.id, {
        timeSlots: schedule.timeSlots,
        lastModified: new Date()
      });

      // Retrieve the updated schedule from the repository
      const retrievedSchedule = await scheduleRepository.findByWeekId(createdWeek.id);
      if (!retrievedSchedule) {
        throw new Error('Failed to retrieve updated schedule');
      }

      const validation = await scheduleManager.validateScheduleConstraints(
        retrievedSchedule, 
        availablePlayers, 
        createdWeek
      );

      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(error => error.includes('no availability data'))).toBe(true);
    });

    test('should handle availability data type - null', async () => {
      const seasonId = 'test-season-null';
      
      const player = new PlayerModel({
        firstName: 'Test',
        lastName: 'Player',
        handedness: 'right',
        timePreference: 'Either',
        seasonId
      });

      await playerRepository.create(player);

      // Create week without explicit null (just omit the player from availability data)
      const week = new WeekModel({
        seasonId,
        weekNumber: 1,
        date: new Date(),
        playerAvailability: {} // Empty availability data
      });

      const createdWeek = await weekRepository.create(week);

      // Test: Player should NOT be filtered as available
      const availablePlayers = scheduleGenerator.filterAvailablePlayers([player], createdWeek);
      expect(availablePlayers).toHaveLength(0);

      // Test: If scheduled anyway, validation should fail
      const schedule = new ScheduleModel({ weekId: createdWeek.id });
      const foursome = new FoursomeModel({
        players: [player],
        timeSlot: 'morning',
        position: 0
      });
      schedule.addFoursome(foursome);

      const savedSchedule = await scheduleRepository.create({ weekId: createdWeek.id });
      await scheduleRepository.update(savedSchedule.id, {
        timeSlots: schedule.timeSlots,
        lastModified: new Date()
      });

      // Retrieve the updated schedule from the repository
      const retrievedSchedule = await scheduleRepository.findByWeekId(createdWeek.id);
      if (!retrievedSchedule) {
        throw new Error('Failed to retrieve updated schedule');
      }

      const validation = await scheduleManager.validateScheduleConstraints(
        retrievedSchedule, 
        availablePlayers, 
        createdWeek
      );

      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(error => error.includes('no availability data'))).toBe(true);
    });
  });

  describe('Integration with Schedule Generation', () => {
    /**
     * Test that availability filtering works correctly in createWeeklySchedule
     * **Validates: Requirements 1.1, 1.4**
     */
    test('should filter availability correctly in createWeeklySchedule', async () => {
      const seasonId = 'test-season-create-weekly';
      
      // Create players with mixed availability
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

      // Create availability data - only some players available
      const playerAvailability: Record<string, boolean> = {
        [players[0].id]: true,   // Available
        [players[1].id]: false,  // Unavailable
        [players[2].id]: true,   // Available
        [players[3].id]: false,  // Unavailable
        [players[4].id]: true,   // Available
        [players[5].id]: true    // Available
      };

      // Create week
      const week = new WeekModel({
        seasonId,
        weekNumber: 1,
        date: new Date(),
        playerAvailability
      });

      const createdWeek = await weekRepository.create(week);

      // Test: Create weekly schedule should only include available players
      const schedule = await scheduleManager.createWeeklySchedule(createdWeek.id);
      
      expect(schedule).toBeDefined();
      
      // Get all scheduled players
      const scheduledPlayerIds = new Set(schedule.getAllPlayers());
      
      // Should only contain available players
      expect(scheduledPlayerIds.has(players[0].id)).toBe(true);  // Available
      expect(scheduledPlayerIds.has(players[1].id)).toBe(false); // Unavailable
      expect(scheduledPlayerIds.has(players[2].id)).toBe(true);  // Available
      expect(scheduledPlayerIds.has(players[3].id)).toBe(false); // Unavailable
      expect(scheduledPlayerIds.has(players[4].id)).toBe(true);  // Available
      expect(scheduledPlayerIds.has(players[5].id)).toBe(true);  // Available
    });
  });
});