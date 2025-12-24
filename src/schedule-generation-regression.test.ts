/**
 * Schedule Generation Regression Test
 * 
 * This test reproduces the exact failing scenario from the Playwright test where
 * schedule generation produces zero foursomes despite having sufficient players.
 * 
 * Failing Scenario: 6 players added to season, schedule generation triggered,
 * but no foursomes are created in the resulting schedule.
 * 
 * Requirements: 1.1, 1.2, 2.1
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

import { Player } from './models/Player';
import { Season } from './models/Season';
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

describe('Schedule Generation Regression Test', () => {
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
  let mockScheduleContainer: any;

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

    // Create mock container for UI component
    mockScheduleContainer = mockDocument.createElement('div');

    // Initialize UI component
    scheduleDisplayUI = new ScheduleDisplayUI(
      scheduleManager,
      scheduleGenerator,
      weekRepository,
      {} as any, // exportService - not needed for this test
      pairingHistoryTracker,
      playerManager,
      mockScheduleContainer
    );
  });

  afterEach(() => {
    // Clean up UI component
    if (scheduleDisplayUI) {
      scheduleDisplayUI.destroy();
    }

    // Clear localStorage after each test
    localStorageMock.clear();
  });

  describe('Exact Playwright Test Failure Reproduction', () => {
    test('should reproduce and fix the exact 6-player scenario that was failing in Playwright tests', async () => {
      console.log('=== REPRODUCING PLAYWRIGHT TEST FAILURE ===');
      
      // Step 1: Create and activate a season (exactly as in Playwright test)
      console.log('Step 1: Creating season...');
      const season = await seasonManager.createSeason(
        'Spring 2025 Test Season', // Exact name from Playwright test
        new Date('2025-03-01'),    // Exact dates from Playwright test
        new Date('2025-05-31')
      );
      
      await seasonManager.setActiveSeason(season.id);
      const activeSeason = await seasonManager.getActiveSeason();
      expect(activeSeason?.id).toBe(season.id);
      console.log('✓ Season created and activated');

      // Step 2: Add exactly 6 players with the same pattern as Playwright test
      console.log('Step 2: Adding 6 players...');
      const playwrightPlayers = [
        { firstName: 'John', lastName: 'Smith', handedness: 'right' as const, timePreference: 'AM' as const },
        { firstName: 'Jane', lastName: 'Doe', handedness: 'left' as const, timePreference: 'PM' as const },
        { firstName: 'Bob', lastName: 'Johnson', handedness: 'right' as const, timePreference: 'Either' as const },
        { firstName: 'Alice', lastName: 'Williams', handedness: 'left' as const, timePreference: 'Either' as const },
        { firstName: 'Charlie', lastName: 'Brown', handedness: 'right' as const, timePreference: 'AM' as const },
        { firstName: 'Diana', lastName: 'Davis', handedness: 'left' as const, timePreference: 'PM' as const }
      ];

      const addedPlayers: Player[] = [];
      for (const playerData of playwrightPlayers) {
        const player = await playerManager.addPlayer(playerData);
        addedPlayers.push(player);
        expect(player).toBeDefined();
        expect(player.firstName).toBe(playerData.firstName);
        expect(player.lastName).toBe(playerData.lastName);
        expect(player.seasonId).toBe(season.id);
        console.log(`✓ Added player: ${player.firstName} ${player.lastName} (${player.handedness}, ${player.timePreference})`);
      }

      // Verify all 6 players were added successfully
      const allPlayers = await playerManager.getAllPlayers(season.id);
      expect(allPlayers).toHaveLength(6);
      console.log(`✓ All 6 players added successfully (total: ${allPlayers.length})`);

      // Step 3: Create a week for scheduling (simulating the schedule tab navigation)
      console.log('Step 3: Creating week for scheduling...');
      const week = await weekRepository.create({
        seasonId: season.id,
        weekNumber: 1,
        date: new Date('2025-03-03') // Monday of first week in March 2025
      });
      console.log('✓ Week created for scheduling');

      // Step 4: Set all players as available (simulating default availability)
      console.log('Step 4: Setting player availability...');
      for (const player of addedPlayers) {
        await weekRepository.setPlayerAvailability(week.id, player.id, true);
      }

      // Verify availability was set correctly
      const availablePlayerIds = await weekRepository.getAvailablePlayers(week.id);
      expect(availablePlayerIds).toHaveLength(6);
      console.log(`✓ All 6 players set as available (available: ${availablePlayerIds.length})`);

      // Step 5: Generate schedule (this is where the original bug occurred)
      console.log('Step 5: Generating schedule (critical test point)...');
      const schedule = await scheduleManager.createWeeklySchedule(week.id);
      
      // Verify schedule was created successfully
      expect(schedule).toBeDefined();
      expect(schedule.weekId).toBe(week.id);
      expect(schedule.timeSlots).toBeDefined();
      expect(schedule.timeSlots.morning).toBeDefined();
      expect(schedule.timeSlots.afternoon).toBeDefined();
      console.log('✓ Schedule object created successfully');

      // Step 6: CRITICAL ASSERTION - Verify foursomes were actually created
      // This is the main assertion that was failing in the original Playwright test
      console.log('Step 6: Verifying foursomes were created (main regression test)...');
      
      const morningFoursomes = schedule.timeSlots.morning;
      const afternoonFoursomes = schedule.timeSlots.afternoon;
      const totalFoursomes = morningFoursomes.length + afternoonFoursomes.length;
      
      // MAIN REGRESSION ASSERTION: Should have at least one foursome
      expect(totalFoursomes).toBeGreaterThan(0);
      console.log(`✓ REGRESSION FIX VERIFIED: Created ${totalFoursomes} foursomes (was 0 before fix)`);

      // Verify players are actually assigned to foursomes
      const totalPlayersScheduled = morningFoursomes.reduce((sum, f) => sum + f.players.length, 0) +
                                   afternoonFoursomes.reduce((sum, f) => sum + f.players.length, 0);
      
      expect(totalPlayersScheduled).toBeGreaterThan(0);
      expect(totalPlayersScheduled).toBeLessThanOrEqual(6);
      console.log(`✓ Players assigned to foursomes: ${totalPlayersScheduled}/6`);

      // With 6 players, we should be able to create at least one complete foursome
      expect(totalPlayersScheduled).toBeGreaterThanOrEqual(4);
      console.log('✓ At least one complete foursome created');

      // Step 7: Verify schedule display integration (Requirements 2.1)
      console.log('Step 7: Testing schedule display integration...');
      
      // Initialize the UI with the season and verify it can load the schedule
      await scheduleDisplayUI.setActiveSeason(season);
      
      // Verify the UI can retrieve the schedule data
      const displayedSchedule = await scheduleManager.getSchedule(week.id);
      expect(displayedSchedule).toBeDefined();
      expect(displayedSchedule!.id).toBe(schedule.id);
      console.log('✓ Schedule display UI integration working');

      // Step 8: Verify data consistency (Requirements 1.1, 1.2)
      console.log('Step 8: Verifying data consistency...');
      
      const allScheduledPlayers = [...morningFoursomes, ...afternoonFoursomes].flatMap(f => f.players);
      const scheduledPlayerIds = allScheduledPlayers.map(p => p.id);
      const originalPlayerIds = addedPlayers.map(p => p.id);
      
      // All players in schedule should be from our original set
      for (const scheduledPlayerId of scheduledPlayerIds) {
        expect(originalPlayerIds).toContain(scheduledPlayerId);
      }
      console.log('✓ Data consistency verified - all scheduled players are from original set');

      // Step 9: Verify time slot distribution
      console.log('Step 9: Verifying time slot distribution...');
      
      console.log(`Morning foursomes: ${morningFoursomes.length}`);
      console.log(`Afternoon foursomes: ${afternoonFoursomes.length}`);
      
      // At least one time slot should have foursomes
      expect(morningFoursomes.length + afternoonFoursomes.length).toBeGreaterThan(0);
      console.log('✓ Time slot distribution verified');

      console.log('=== REGRESSION TEST PASSED - BUG IS FIXED ===');
      console.log('✅ The original Playwright test failure has been reproduced and verified as fixed');
      console.log('✅ Schedule generation now correctly creates foursomes with 6 players');
      console.log('✅ All requirements (1.1, 1.2, 2.1) are satisfied');
    });

    test('should handle the exact edge case that caused the original failure', async () => {
      console.log('=== TESTING EDGE CASE THAT CAUSED ORIGINAL FAILURE ===');
      
      // This test focuses on the specific edge case that might have caused the original failure:
      // Data synchronization between player addition and schedule generation
      
      // Create season
      const season = await seasonManager.createSeason(
        'Edge Case Test Season',
        new Date('2025-01-01'),
        new Date('2025-12-31')
      );
      await seasonManager.setActiveSeason(season.id);

      // Add players one by one (simulating UI interaction timing)
      const players: Player[] = [];
      for (let i = 1; i <= 6; i++) {
        const player = await playerManager.addPlayer({
          firstName: `EdgeCase`,
          lastName: `Player${i}`,
          handedness: i % 2 === 0 ? 'left' as const : 'right' as const,
          timePreference: i <= 2 ? 'AM' as const : i <= 4 ? 'PM' as const : 'Either' as const
        });
        players.push(player);
        
        // Verify player is immediately available to the system
        const currentPlayers = await playerManager.getAllPlayers(season.id);
        expect(currentPlayers).toHaveLength(i);
        console.log(`Player ${i} added and immediately available`);
      }

      // Create week immediately after adding all players (potential race condition)
      const week = await weekRepository.create({
        seasonId: season.id,
        weekNumber: 1,
        date: new Date('2025-01-06')
      });

      // Set availability immediately (potential synchronization issue)
      for (const player of players) {
        await weekRepository.setPlayerAvailability(week.id, player.id, true);
      }

      // Verify data is synchronized before generation
      const preGenerationPlayers = await playerRepository.findBySeasonId(season.id);
      expect(preGenerationPlayers).toHaveLength(6);
      
      const preGenerationAvailable = await weekRepository.getAvailablePlayers(week.id);
      expect(preGenerationAvailable).toHaveLength(6);

      // Generate schedule immediately (this is where the bug occurred)
      const schedule = await scheduleManager.createWeeklySchedule(week.id);
      
      // Verify the edge case is handled correctly
      const allFoursomes = [...schedule.timeSlots.morning, ...schedule.timeSlots.afternoon];
      expect(allFoursomes.length).toBeGreaterThan(0);
      
      const scheduledPlayers = allFoursomes.flatMap(f => f.players);
      expect(scheduledPlayers.length).toBeGreaterThan(0);
      
      console.log('✓ Edge case handled correctly - no data synchronization issues');
    });

    test('should verify the fix works with different player configurations', async () => {
      console.log('=== TESTING DIFFERENT PLAYER CONFIGURATIONS ===');
      
      // Test various configurations that might trigger the original bug
      const configurations = [
        {
          name: 'All AM players',
          players: Array.from({ length: 6 }, (_, i) => ({
            firstName: `AM${i + 1}`,
            lastName: 'Player',
            handedness: i % 2 === 0 ? 'right' as const : 'left' as const,
            timePreference: 'AM' as const
          }))
        },
        {
          name: 'All PM players',
          players: Array.from({ length: 6 }, (_, i) => ({
            firstName: `PM${i + 1}`,
            lastName: 'Player',
            handedness: i % 2 === 0 ? 'right' as const : 'left' as const,
            timePreference: 'PM' as const
          }))
        },
        {
          name: 'Mixed preferences (original Playwright pattern)',
          players: [
            { firstName: 'Mixed1', lastName: 'Player', handedness: 'right' as const, timePreference: 'AM' as const },
            { firstName: 'Mixed2', lastName: 'Player', handedness: 'left' as const, timePreference: 'PM' as const },
            { firstName: 'Mixed3', lastName: 'Player', handedness: 'right' as const, timePreference: 'Either' as const },
            { firstName: 'Mixed4', lastName: 'Player', handedness: 'left' as const, timePreference: 'Either' as const },
            { firstName: 'Mixed5', lastName: 'Player', handedness: 'right' as const, timePreference: 'AM' as const },
            { firstName: 'Mixed6', lastName: 'Player', handedness: 'left' as const, timePreference: 'PM' as const }
          ]
        }
      ];

      for (const config of configurations) {
        console.log(`Testing configuration: ${config.name}`);
        
        // Clear data for each configuration
        localStorageMock.clear();
        
        // Create fresh season
        const season = await seasonManager.createSeason(
          `${config.name} Season`,
          new Date('2025-01-01'),
          new Date('2025-12-31')
        );
        await seasonManager.setActiveSeason(season.id);

        // Add players for this configuration
        const addedPlayers: Player[] = [];
        for (const playerData of config.players) {
          const player = await playerManager.addPlayer(playerData);
          addedPlayers.push(player);
        }

        // Create week and set availability
        const week = await weekRepository.create({
          seasonId: season.id,
          weekNumber: 1,
          date: new Date('2025-01-06')
        });

        for (const player of addedPlayers) {
          await weekRepository.setPlayerAvailability(week.id, player.id, true);
        }

        // Generate schedule
        const schedule = await scheduleManager.createWeeklySchedule(week.id);
        
        // Verify foursomes are created for this configuration
        const allFoursomes = [...schedule.timeSlots.morning, ...schedule.timeSlots.afternoon];
        expect(allFoursomes.length).toBeGreaterThan(0);
        
        const scheduledPlayers = allFoursomes.flatMap(f => f.players);
        expect(scheduledPlayers.length).toBeGreaterThan(0);
        
        console.log(`✓ ${config.name}: ${allFoursomes.length} foursomes, ${scheduledPlayers.length} players scheduled`);
      }
      
      console.log('✓ All player configurations work correctly');
    });
  });
});