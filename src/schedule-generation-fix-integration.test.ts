/**
 * Schedule Generation Fix Integration Tests
 * 
 * Comprehensive integration tests for the schedule generation fix addressing
 * the critical issue where schedule generation produces zero foursomes despite
 * having sufficient players.
 * 
 * Requirements: 1.1, 2.1, 3.1, 3.5
 */

import { SeasonManagerService } from './services/SeasonManager';
import { PlayerManagerService } from './services/PlayerManager';
import { ScheduleManager } from './services/ScheduleManager';
import { ScheduleGenerator } from './services/ScheduleGenerator';
import { LocalScheduleBackupService } from './services/ScheduleBackupService';
import { PairingHistoryTracker } from './services/PairingHistoryTracker';

import { LocalSeasonRepository } from './repositories/SeasonRepository';
import { LocalPlayerRepository } from './repositories/PlayerRepository';
import { LocalWeekRepository } from './repositories/WeekRepository';
import { LocalScheduleRepository } from './repositories/ScheduleRepository';
import { LocalPairingHistoryRepository } from './repositories/PairingHistoryRepository';

import { ScheduleDisplayUI } from './ui/ScheduleDisplayUI';
import { PlayerManagementUI } from './ui/PlayerManagementUI';
import { SeasonManagementUI } from './ui/SeasonManagementUI';

import { Season } from './models/Season';
import { Player } from './models/Player';
import { Week } from './models/Week';
import { Schedule } from './models/Schedule';

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
    },
    length: Object.keys(store).length,
    key: (index: number) => Object.keys(store)[index] || null
  };
})();

// Set up global localStorage mock
Object.defineProperty(global, 'localStorage', {
  value: localStorageMock
});

// Mock DOM environment for UI components
const mockDocument = {
  createElement: (tagName: string) => ({
    tagName: tagName.toUpperCase(),
    innerHTML: '',
    textContent: '',
    style: {},
    classList: {
      add: jest.fn(),
      remove: jest.fn(),
      contains: jest.fn(() => false),
      toggle: jest.fn()
    },
    setAttribute: jest.fn(),
    removeAttribute: jest.fn(),
    getAttribute: jest.fn(() => null),
    hasAttribute: jest.fn(() => false),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    appendChild: jest.fn(),
    removeChild: jest.fn(),
    querySelector: jest.fn(() => null),
    querySelectorAll: jest.fn(() => []),
    parentNode: null,
    children: [],
    firstChild: null,
    lastChild: null,
    nextSibling: null,
    previousSibling: null,
    click: jest.fn(),
    focus: jest.fn(),
    blur: jest.fn()
  }),
  body: {
    appendChild: jest.fn(),
    removeChild: jest.fn(),
    querySelector: jest.fn(() => null),
    querySelectorAll: jest.fn(() => []),
    innerHTML: '',
    style: {}
  },
  head: {
    appendChild: jest.fn(),
    querySelector: jest.fn(() => null)
  },
  getElementById: jest.fn(() => null),
  querySelector: jest.fn(() => null),
  querySelectorAll: jest.fn(() => [])
};

(global as any).document = mockDocument;
(global as any).window = {
  setInterval: jest.fn((fn, delay) => setTimeout(fn, delay)),
  clearInterval: jest.fn(clearTimeout),
  setTimeout: jest.fn(setTimeout),
  clearTimeout: jest.fn(clearTimeout),
  getComputedStyle: jest.fn(() => ({ position: 'static' })),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn()
};

describe('Schedule Generation Fix Integration Tests', () => {
  // Service instances
  let seasonManager: SeasonManagerService;
  let playerManager: PlayerManagerService;
  let scheduleManager: ScheduleManager;
  let scheduleGenerator: ScheduleGenerator;
  let backupService: LocalScheduleBackupService;
  let pairingHistoryTracker: PairingHistoryTracker;

  // Repository instances
  let seasonRepository: LocalSeasonRepository;
  let playerRepository: LocalPlayerRepository;
  let weekRepository: LocalWeekRepository;
  let scheduleRepository: LocalScheduleRepository;
  let pairingHistoryRepository: LocalPairingHistoryRepository;

  // UI component instances
  let scheduleDisplayUI: ScheduleDisplayUI;
  let playerManagementUI: PlayerManagementUI;
  let seasonManagementUI: SeasonManagementUI;

  // Mock containers for UI components
  let mockScheduleContainer: any;
  let mockPlayerContainer: any;
  let mockSeasonContainer: any;

  beforeEach(async () => {
    // Clear localStorage before each test
    localStorageMock.clear();

    // Initialize repositories
    seasonRepository = new LocalSeasonRepository();
    playerRepository = new LocalPlayerRepository();
    weekRepository = new LocalWeekRepository();
    scheduleRepository = new LocalScheduleRepository();
    pairingHistoryRepository = new LocalPairingHistoryRepository();

    // Initialize services with dependency injection
    seasonManager = new SeasonManagerService(seasonRepository);
    
    playerManager = new PlayerManagerService(
      playerRepository,
      weekRepository,
      scheduleRepository,
      seasonRepository
    );

    pairingHistoryTracker = new PairingHistoryTracker(pairingHistoryRepository);

    scheduleGenerator = new ScheduleGenerator(
      {
        prioritizeCompleteGroups: true,
        balanceTimeSlots: true,
        optimizePairings: true
      },
      pairingHistoryTracker
    );

    backupService = new LocalScheduleBackupService();

    scheduleManager = new ScheduleManager(
      scheduleRepository,
      weekRepository,
      playerRepository,
      scheduleGenerator,
      pairingHistoryTracker,
      backupService
    );

    // Create mock containers for UI components
    mockScheduleContainer = mockDocument.createElement('div');
    mockPlayerContainer = mockDocument.createElement('div');
    mockSeasonContainer = mockDocument.createElement('div');

    // Initialize UI components
    scheduleDisplayUI = new ScheduleDisplayUI(
      scheduleManager,
      scheduleGenerator,
      weekRepository,
      {} as any, // exportService - not needed for these tests
      pairingHistoryTracker,
      playerManager,
      mockScheduleContainer
    );

    playerManagementUI = new PlayerManagementUI(
      playerManager,
      mockPlayerContainer
    );

    seasonManagementUI = new SeasonManagementUI(
      seasonManager,
      mockSeasonContainer
    );
  });

  afterEach(() => {
    // Clean up UI components
    if (scheduleDisplayUI) {
      scheduleDisplayUI.destroy();
    }
    // PlayerManagementUI and SeasonManagementUI don't have destroy methods in the current implementation

    // Clear localStorage after each test
    localStorageMock.clear();
  });

  describe('Complete Workflow: Player Addition to Schedule Display', () => {
    test('should successfully complete the full workflow that was failing in Playwright tests', async () => {
      // Step 1: Create and activate a season (simulating UI interaction)
      const season = await seasonManager.createSeason(
        'Integration Test Season',
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );
      
      await seasonManager.setActiveSeason(season.id);
      const activeSeason = await seasonManager.getActiveSeason();
      expect(activeSeason?.id).toBe(season.id);

      // Step 2: Add 6 players (matching the failing Playwright test scenario)
      const playerData = [
        { firstName: 'Player', lastName: 'One', handedness: 'right' as const, timePreference: 'AM' as const },
        { firstName: 'Player', lastName: 'Two', handedness: 'left' as const, timePreference: 'PM' as const },
        { firstName: 'Player', lastName: 'Three', handedness: 'right' as const, timePreference: 'Either' as const },
        { firstName: 'Player', lastName: 'Four', handedness: 'left' as const, timePreference: 'Either' as const },
        { firstName: 'Player', lastName: 'Five', handedness: 'right' as const, timePreference: 'AM' as const },
        { firstName: 'Player', lastName: 'Six', handedness: 'left' as const, timePreference: 'PM' as const }
      ];

      const players: Player[] = [];
      for (const data of playerData) {
        const player = await playerManager.addPlayer(data);
        players.push(player);
        expect(player).toBeDefined();
        expect(player.firstName).toBe(data.firstName);
        expect(player.lastName).toBe(data.lastName);
        expect(player.seasonId).toBe(season.id);
      }

      // Verify all players were added successfully
      const allPlayers = await playerManager.getAllPlayers(season.id);
      expect(allPlayers).toHaveLength(6);

      // Step 3: Create a week for scheduling
      const week = await weekRepository.create({
        seasonId: season.id,
        weekNumber: 1,
        date: new Date('2024-01-08') // Monday of first week
      });

      // Step 4: Set all players as available (simulating UI availability setting)
      for (const player of players) {
        await weekRepository.setPlayerAvailability(week.id, player.id, true);
      }

      // Verify availability was set correctly
      const availablePlayers = await weekRepository.getAvailablePlayers(week.id);
      expect(availablePlayers).toHaveLength(6);

      // Step 5: Generate schedule (this is where the original bug occurred)
      const schedule = await scheduleManager.createWeeklySchedule(week.id);
      
      // Verify schedule was created successfully
      expect(schedule).toBeDefined();
      expect(schedule.weekId).toBe(week.id);
      expect(schedule.timeSlots).toBeDefined();
      expect(schedule.timeSlots.morning).toBeDefined();
      expect(schedule.timeSlots.afternoon).toBeDefined();

      // Step 6: Verify foursomes were actually created (this was the main issue)
      const allFoursomes = [...schedule.timeSlots.morning, ...schedule.timeSlots.afternoon];
      expect(allFoursomes.length).toBeGreaterThan(0); // Should have at least one foursome

      // Verify players are actually assigned to foursomes
      const allPlayersInSchedule = allFoursomes.flatMap(f => f.players);
      expect(allPlayersInSchedule.length).toBeGreaterThan(0); // Should have players assigned
      expect(allPlayersInSchedule.length).toBeLessThanOrEqual(6); // Can't exceed available players

      // Step 7: Verify schedule display can render the schedule (UI integration)
      // Initialize the UI with the week and verify it can load the schedule
      await scheduleDisplayUI.setActiveSeason(season);
      
      // Verify the UI received the schedule data
      const displayedSchedule = await scheduleManager.getSchedule(week.id);
      expect(displayedSchedule).toBeDefined();
      expect(displayedSchedule!.id).toBe(schedule.id);

      // Step 8: Verify data consistency across the entire pipeline
      // Check that the same players who were added are the ones in the schedule
      const schedulePlayerIds = allPlayersInSchedule.map(p => p.id);
      const originalPlayerIds = players.map(p => p.id);
      
      // All players in schedule should be from our original set
      for (const schedulePlayerId of schedulePlayerIds) {
        expect(originalPlayerIds).toContain(schedulePlayerId);
      }
    });

    test('should handle the exact 6-player scenario that was failing', async () => {
      // This test specifically reproduces the failing Playwright test scenario
      
      // Create season
      const season = await seasonManager.createSeason(
        'Playwright Reproduction Test',
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );
      await seasonManager.setActiveSeason(season.id);

      // Add exactly 6 players with the same pattern as Playwright test
      const players = [];
      for (let i = 1; i <= 6; i++) {
        const player = await playerManager.addPlayer({
          firstName: `TestPlayer${i}`,
          lastName: 'LastName',
          handedness: i % 2 === 0 ? 'left' as const : 'right' as const,
          timePreference: i <= 2 ? 'AM' as const : i <= 4 ? 'PM' as const : 'Either' as const
        });
        players.push(player);
      }

      // Create week
      const week = await weekRepository.create({
        seasonId: season.id,
        weekNumber: 1,
        date: new Date('2024-01-08')
      });

      // Set all players available
      for (const player of players) {
        await weekRepository.setPlayerAvailability(week.id, player.id, true);
      }

      // Generate schedule - this should NOT produce zero foursomes
      const schedule = await scheduleManager.createWeeklySchedule(week.id);
      
      // Verify we get foursomes (the main assertion that was failing)
      const morningFoursomes = schedule.timeSlots.morning;
      const afternoonFoursomes = schedule.timeSlots.afternoon;
      const totalFoursomes = morningFoursomes.length + afternoonFoursomes.length;
      
      expect(totalFoursomes).toBeGreaterThan(0); // This was failing before the fix
      
      // Verify we have players in the foursomes
      const totalPlayersScheduled = morningFoursomes.reduce((sum, f) => sum + f.players.length, 0) +
                                   afternoonFoursomes.reduce((sum, f) => sum + f.players.length, 0);
      
      expect(totalPlayersScheduled).toBeGreaterThan(0); // Should have scheduled players
      expect(totalPlayersScheduled).toBeLessThanOrEqual(6); // Can't exceed available players
      
      // With 6 players, we should be able to create at least one foursome
      // The remaining 2 players might be in a partial group or separate foursome
      expect(totalPlayersScheduled).toBeGreaterThanOrEqual(4); // At least one foursome worth
    });
  });

  describe('Data Synchronization Across UI → Manager → Generator Pipeline', () => {
    test('should maintain data consistency through the entire pipeline', async () => {
      // Step 1: Create season through UI layer
      const season = await seasonManager.createSeason(
        'Pipeline Test Season',
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );
      await seasonManager.setActiveSeason(season.id);

      // Step 2: Add players through PlayerManager (simulating UI calls)
      const playersToAdd = [
        { firstName: 'Pipeline', lastName: 'Player1', handedness: 'right' as const, timePreference: 'AM' as const },
        { firstName: 'Pipeline', lastName: 'Player2', handedness: 'left' as const, timePreference: 'PM' as const },
        { firstName: 'Pipeline', lastName: 'Player3', handedness: 'right' as const, timePreference: 'Either' as const },
        { firstName: 'Pipeline', lastName: 'Player4', handedness: 'left' as const, timePreference: 'Either' as const }
      ];

      const addedPlayers = [];
      for (const playerData of playersToAdd) {
        const player = await playerManager.addPlayer(playerData);
        addedPlayers.push(player);
      }

      // Step 3: Verify data is immediately available to ScheduleManager
      const managersPlayers = await playerManager.getAllPlayers(season.id);
      expect(managersPlayers).toHaveLength(4);
      
      // Verify each player's data integrity
      for (let i = 0; i < addedPlayers.length; i++) {
        const addedPlayer = addedPlayers[i];
        const managerPlayer = managersPlayers.find(p => p.id === addedPlayer.id);
        expect(managerPlayer).toBeDefined();
        expect(managerPlayer!.firstName).toBe(addedPlayer.firstName);
        expect(managerPlayer!.lastName).toBe(addedPlayer.lastName);
        expect(managerPlayer!.handedness).toBe(addedPlayer.handedness);
        expect(managerPlayer!.timePreference).toBe(addedPlayer.timePreference);
      }

      // Step 4: Create week and set availability
      const week = await weekRepository.create({
        seasonId: season.id,
        weekNumber: 1,
        date: new Date('2024-01-08')
      });

      for (const player of addedPlayers) {
        await weekRepository.setPlayerAvailability(week.id, player.id, true);
      }

      // Step 5: Verify ScheduleGenerator receives correct data
      const generatorPlayers = await playerRepository.findBySeasonId(season.id);
      expect(generatorPlayers).toHaveLength(4);

      // Step 6: Generate schedule and verify data flows correctly
      const schedule = await scheduleManager.createWeeklySchedule(week.id);
      
      const allFoursomes = [...schedule.timeSlots.morning, ...schedule.timeSlots.afternoon];
      const scheduledPlayers = allFoursomes.flatMap(f => f.players);
      
      // Verify all scheduled players match our original data
      for (const scheduledPlayer of scheduledPlayers) {
        const originalPlayer = addedPlayers.find(p => p.id === scheduledPlayer.id);
        expect(originalPlayer).toBeDefined();
        expect(scheduledPlayer.firstName).toBe(originalPlayer!.firstName);
        expect(scheduledPlayer.lastName).toBe(originalPlayer!.lastName);
        expect(scheduledPlayer.handedness).toBe(originalPlayer!.handedness);
        expect(scheduledPlayer.timePreference).toBe(originalPlayer!.timePreference);
      }
    });

    test('should handle real-time data updates across the pipeline', async () => {
      // Create initial setup
      const season = await seasonManager.createSeason(
        'Real-time Test Season',
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );
      await seasonManager.setActiveSeason(season.id);

      // Add initial players
      const player1 = await playerManager.addPlayer({
        firstName: 'Dynamic',
        lastName: 'Player1',
        handedness: 'right',
        timePreference: 'AM'
      });

      const player2 = await playerManager.addPlayer({
        firstName: 'Dynamic',
        lastName: 'Player2',
        handedness: 'left',
        timePreference: 'PM'
      });

      // Create week
      const week = await weekRepository.create({
        seasonId: season.id,
        weekNumber: 1,
        date: new Date('2024-01-08')
      });

      // Set initial availability
      await weekRepository.setPlayerAvailability(week.id, player1.id, true);
      await weekRepository.setPlayerAvailability(week.id, player2.id, true);

      // Add more players after week creation (simulating real-time additions)
      const player3 = await playerManager.addPlayer({
        firstName: 'Dynamic',
        lastName: 'Player3',
        handedness: 'right',
        timePreference: 'Either'
      });

      const player4 = await playerManager.addPlayer({
        firstName: 'Dynamic',
        lastName: 'Player4',
        handedness: 'left',
        timePreference: 'Either'
      });

      // Set availability for new players
      await weekRepository.setPlayerAvailability(week.id, player3.id, true);
      await weekRepository.setPlayerAvailability(week.id, player4.id, true);

      // Generate schedule - should include all 4 players
      const schedule = await scheduleManager.createWeeklySchedule(week.id);
      
      const allFoursomes = [...schedule.timeSlots.morning, ...schedule.timeSlots.afternoon];
      const scheduledPlayers = allFoursomes.flatMap(f => f.players);
      
      // Should have all 4 players in the schedule
      expect(scheduledPlayers).toHaveLength(4);
      
      // Verify all players are included
      const scheduledPlayerIds = scheduledPlayers.map(p => p.id);
      expect(scheduledPlayerIds).toContain(player1.id);
      expect(scheduledPlayerIds).toContain(player2.id);
      expect(scheduledPlayerIds).toContain(player3.id);
      expect(scheduledPlayerIds).toContain(player4.id);
    });

    test('should handle availability data synchronization correctly', async () => {
      // Create setup
      const season = await seasonManager.createSeason(
        'Availability Sync Test',
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );
      await seasonManager.setActiveSeason(season.id);

      // Add players
      const players = [];
      for (let i = 1; i <= 6; i++) {
        const player = await playerManager.addPlayer({
          firstName: `AvailTest`,
          lastName: `Player${i}`,
          handedness: i % 2 === 0 ? 'left' as const : 'right' as const,
          timePreference: 'Either' as const
        });
        players.push(player);
      }

      // Create week
      const week = await weekRepository.create({
        seasonId: season.id,
        weekNumber: 1,
        date: new Date('2024-01-08')
      });

      // Set mixed availability (some available, some not)
      await weekRepository.setPlayerAvailability(week.id, players[0].id, true);
      await weekRepository.setPlayerAvailability(week.id, players[1].id, true);
      await weekRepository.setPlayerAvailability(week.id, players[2].id, false);
      await weekRepository.setPlayerAvailability(week.id, players[3].id, true);
      await weekRepository.setPlayerAvailability(week.id, players[4].id, false);
      await weekRepository.setPlayerAvailability(week.id, players[5].id, true);

      // Verify availability data is correct before generation
      const availablePlayerIds = await weekRepository.getAvailablePlayers(week.id);
      expect(availablePlayerIds).toHaveLength(4);
      expect(availablePlayerIds).toContain(players[0].id);
      expect(availablePlayerIds).toContain(players[1].id);
      expect(availablePlayerIds).toContain(players[3].id);
      expect(availablePlayerIds).toContain(players[5].id);

      // Generate schedule
      const schedule = await scheduleManager.createWeeklySchedule(week.id);
      
      // Verify only available players are scheduled
      const allFoursomes = [...schedule.timeSlots.morning, ...schedule.timeSlots.afternoon];
      const scheduledPlayers = allFoursomes.flatMap(f => f.players);
      const scheduledPlayerIds = scheduledPlayers.map(p => p.id);
      
      // Should only include available players
      for (const scheduledPlayerId of scheduledPlayerIds) {
        expect(availablePlayerIds).toContain(scheduledPlayerId);
      }
      
      // Should not include unavailable players
      expect(scheduledPlayerIds).not.toContain(players[2].id);
      expect(scheduledPlayerIds).not.toContain(players[4].id);
    });
  });

  describe('Error Handling and Recovery Scenarios', () => {
    test('should handle missing player data gracefully', async () => {
      // Create season
      const season = await seasonManager.createSeason(
        'Error Handling Test',
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );
      await seasonManager.setActiveSeason(season.id);

      // Create week without any players
      const week = await weekRepository.create({
        seasonId: season.id,
        weekNumber: 1,
        date: new Date('2024-01-08')
      });

      // Attempt to generate schedule with no players - should throw an error
      await expect(scheduleManager.createWeeklySchedule(week.id)).rejects.toThrow(/Precondition validation/);
      
      // Verify no schedule was created
      const schedule = await scheduleManager.getSchedule(week.id);
      expect(schedule).toBeNull();
    });

    test('should handle corrupted availability data', async () => {
      // Create setup
      const season = await seasonManager.createSeason(
        'Corrupted Data Test',
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );
      await seasonManager.setActiveSeason(season.id);

      // Add players
      const players = [];
      for (let i = 1; i <= 4; i++) {
        const player = await playerManager.addPlayer({
          firstName: `Corrupt`,
          lastName: `Player${i}`,
          handedness: 'right' as const,
          timePreference: 'Either' as const
        });
        players.push(player);
      }

      // Create week
      const week = await weekRepository.create({
        seasonId: season.id,
        weekNumber: 1,
        date: new Date('2024-01-08')
      });

      // Set some valid availability first
      await weekRepository.setPlayerAvailability(week.id, players[0].id, true);
      await weekRepository.setPlayerAvailability(week.id, players[3].id, true);

      // Manually corrupt availability data in localStorage
      const weekKey = `week_${week.id}`;
      const weekData = JSON.parse(localStorage.getItem(weekKey) || '{}');
      weekData.playerAvailability = {
        [players[0].id]: true,
        [players[1].id]: null, // Corrupted data
        [players[2].id]: undefined, // Corrupted data
        [players[3].id]: true
      };
      localStorage.setItem(weekKey, JSON.stringify(weekData));

      // Generate schedule - should handle corrupted data gracefully
      // With only 2 valid players, this should fail validation
      await expect(scheduleManager.createWeeklySchedule(week.id)).rejects.toThrow(/Precondition validation/);
    });

    test('should recover from schedule generation failures', async () => {
      // Create setup
      const season = await seasonManager.createSeason(
        'Recovery Test',
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );
      await seasonManager.setActiveSeason(season.id);

      // Add players
      const players = [];
      for (let i = 1; i <= 4; i++) {
        const player = await playerManager.addPlayer({
          firstName: `Recovery`,
          lastName: `Player${i}`,
          handedness: 'right' as const,
          timePreference: 'Either' as const
        });
        players.push(player);
      }

      // Create week
      const week = await weekRepository.create({
        seasonId: season.id,
        weekNumber: 1,
        date: new Date('2024-01-08')
      });

      // Set availability
      for (const player of players) {
        await weekRepository.setPlayerAvailability(week.id, player.id, true);
      }

      // Mock schedule generator to fail consistently
      const originalGenerate = scheduleGenerator.generateScheduleForWeek;
      scheduleGenerator.generateScheduleForWeek = jest.fn().mockRejectedValue(new Error('Simulated generation failure'));

      try {
        // Attempt should fail
        await expect(scheduleManager.createWeeklySchedule(week.id)).rejects.toThrow('Simulated generation failure');

        // Restore original generator
        scheduleGenerator.generateScheduleForWeek = originalGenerate;

        // Second attempt should succeed (recovery)
        const schedule = await scheduleManager.createWeeklySchedule(week.id);
        expect(schedule).toBeDefined();
        
        const allFoursomes = [...schedule.timeSlots.morning, ...schedule.timeSlots.afternoon];
        expect(allFoursomes.length).toBeGreaterThan(0);

      } finally {
        // Restore original generator
        scheduleGenerator.generateScheduleForWeek = originalGenerate;
      }
    });

    test('should handle concurrent schedule generation requests', async () => {
      // Create setup
      const season = await seasonManager.createSeason(
        'Concurrent Test',
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );
      await seasonManager.setActiveSeason(season.id);

      // Add players
      const players = [];
      for (let i = 1; i <= 4; i++) {
        const player = await playerManager.addPlayer({
          firstName: `Concurrent`,
          lastName: `Player${i}`,
          handedness: 'right' as const,
          timePreference: 'Either' as const
        });
        players.push(player);
      }

      // Create week
      const week = await weekRepository.create({
        seasonId: season.id,
        weekNumber: 1,
        date: new Date('2024-01-08')
      });

      // Set availability
      for (const player of players) {
        await weekRepository.setPlayerAvailability(week.id, player.id, true);
      }

      // Make concurrent requests
      const promise1 = scheduleManager.createWeeklySchedule(week.id);
      const promise2 = scheduleManager.createWeeklySchedule(week.id);

      // Both should complete
      const [result1, result2] = await Promise.all([promise1, promise2]);
      
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      
      // Both should be valid schedules (one generated, one retrieved existing)
      expect(result1.weekId).toBe(week.id);
      expect(result2.weekId).toBe(week.id);
      
      // Verify both schedules have foursomes
      const foursomes1 = [...result1.timeSlots.morning, ...result1.timeSlots.afternoon];
      const foursomes2 = [...result2.timeSlots.morning, ...result2.timeSlots.afternoon];
      expect(foursomes1.length).toBeGreaterThan(0);
      expect(foursomes2.length).toBeGreaterThan(0);
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle large numbers of players efficiently', async () => {
      // Create season
      const season = await seasonManager.createSeason(
        'Performance Test',
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );
      await seasonManager.setActiveSeason(season.id);

      // Add many players (simulate large league)
      const playerCount = 50;
      const players = [];
      
      const startTime = Date.now();
      
      for (let i = 1; i <= playerCount; i++) {
        const player = await playerManager.addPlayer({
          firstName: `Perf`,
          lastName: `Player${i}`,
          handedness: i % 2 === 0 ? 'left' as const : 'right' as const,
          timePreference: i % 3 === 0 ? 'AM' as const : i % 3 === 1 ? 'PM' as const : 'Either' as const
        });
        players.push(player);
      }
      
      const addTime = Date.now() - startTime;
      
      // Should add players efficiently (under 5 seconds for 50 players)
      expect(addTime).toBeLessThan(5000);

      // Create week
      const week = await weekRepository.create({
        seasonId: season.id,
        weekNumber: 1,
        date: new Date('2024-01-08')
      });

      // Set all players available
      for (const player of players) {
        await weekRepository.setPlayerAvailability(week.id, player.id, true);
      }

      // Generate schedule
      const scheduleStartTime = Date.now();
      const schedule = await scheduleManager.createWeeklySchedule(week.id);
      const scheduleTime = Date.now() - scheduleStartTime;
      
      // Should generate schedule efficiently (under 10 seconds for 50 players)
      expect(scheduleTime).toBeLessThan(10000);
      
      // Verify schedule quality
      const allFoursomes = [...schedule.timeSlots.morning, ...schedule.timeSlots.afternoon];
      expect(allFoursomes.length).toBeGreaterThan(0);
      
      const scheduledPlayers = allFoursomes.flatMap(f => f.players);
      expect(scheduledPlayers.length).toBeGreaterThan(0);
      expect(scheduledPlayers.length).toBeLessThanOrEqual(playerCount);
    });
  });
});