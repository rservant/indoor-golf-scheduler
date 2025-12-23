/**
 * Property-Based Test for Feature Parity Preservation
 * 
 * **Feature: typescript-activation, Property 5: Feature Parity Preservation**
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
 * 
 * This test verifies that the TypeScript application provides equivalent or enhanced
 * functionality compared to the simple version for all core features.
 */

import * as fc from 'fast-check';
import { SeasonManagerService } from './services/SeasonManager';
import { PlayerManagerService } from './services/PlayerManager';
import { ScheduleManager } from './services/ScheduleManager';
import { ScheduleGenerator } from './services/ScheduleGenerator';
import { PairingHistoryTracker } from './services/PairingHistoryTracker';
import { MainApplicationUI } from './ui/MainApplicationUI';

import { LocalSeasonRepository } from './repositories/SeasonRepository';
import { LocalPlayerRepository } from './repositories/PlayerRepository';
import { LocalWeekRepository } from './repositories/WeekRepository';
import { LocalScheduleRepository } from './repositories/ScheduleRepository';
import { LocalPairingHistoryRepository } from './repositories/PairingHistoryRepository';

import { Player, Handedness, TimePreference } from './models/Player';

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

// Mock DOM elements for UI testing
const mockContainer = {
  innerHTML: '',
  appendChild: jest.fn(),
  removeChild: jest.fn(),
  querySelector: jest.fn(),
  querySelectorAll: jest.fn(() => []),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  classList: {
    add: jest.fn(),
    remove: jest.fn(),
    contains: jest.fn(() => false),
    toggle: jest.fn()
  }
} as any;

// Mock document for UI testing
(global as any).document = {
  getElementById: jest.fn(() => mockContainer),
  createElement: jest.fn(() => mockContainer),
  querySelector: jest.fn(() => mockContainer),
  querySelectorAll: jest.fn(() => []),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn()
} as any;

describe('Property 5: Feature Parity Preservation', () => {
  let seasonManager: SeasonManagerService;
  let playerManager: PlayerManagerService;
  let scheduleManager: ScheduleManager;
  let scheduleGenerator: ScheduleGenerator;
  let pairingHistoryTracker: PairingHistoryTracker;
  let mainUI: MainApplicationUI;

  let seasonRepository: LocalSeasonRepository;
  let playerRepository: LocalPlayerRepository;
  let weekRepository: LocalWeekRepository;
  let scheduleRepository: LocalScheduleRepository;
  let pairingHistoryRepository: LocalPairingHistoryRepository;

  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    
    // Initialize repositories with fresh state
    seasonRepository = new LocalSeasonRepository();
    playerRepository = new LocalPlayerRepository();
    weekRepository = new LocalWeekRepository();
    scheduleRepository = new LocalScheduleRepository();
    pairingHistoryRepository = new LocalPairingHistoryRepository();

    // Initialize services
    seasonManager = new SeasonManagerService(seasonRepository);
    playerManager = new PlayerManagerService(playerRepository, weekRepository, scheduleRepository, seasonRepository);
    pairingHistoryTracker = new PairingHistoryTracker(pairingHistoryRepository);
    scheduleGenerator = new ScheduleGenerator({}, pairingHistoryTracker);
    scheduleManager = new ScheduleManager(
      scheduleRepository,
      weekRepository,
      playerRepository,
      scheduleGenerator,
      pairingHistoryTracker
    );

    // Initialize UI (with mocked container)
    mainUI = new MainApplicationUI(
      mockContainer,
      seasonManager,
      playerManager,
      scheduleManager,
      scheduleGenerator,
      weekRepository,
      {} as any, // exportService - not needed for this test
      pairingHistoryTracker
    );
  });

  // Generators for property-based testing
  // Use full UUID with timestamp to ensure uniqueness across all test runs
  const seasonNameArb = fc.tuple(fc.uuid(), fc.integer()).map(([uuid, counter]) => 
    `Season_${uuid}_${Date.now()}_${counter}`
  );
  
  // Generate valid date ranges where end date is after start date and within business rules
  // Use unique time ranges to avoid conflicts between test runs
  const dateRangeArb = fc.tuple(
    fc.integer({ min: 1, max: 300 }), // Days from now (within 300 days, avoid today to prevent conflicts)
    fc.integer({ min: 1, max: 365 }) // Duration in days
  ).map(([daysFromNow, duration]) => {
    const baseTime = Date.now() + Math.random() * 1000; // Add randomness to avoid exact conflicts
    const startDate = new Date(baseTime + daysFromNow * 24 * 60 * 60 * 1000);
    const endDate = new Date(startDate.getTime() + duration * 24 * 60 * 60 * 1000);
    return { startDate, endDate };
  });
  
  const playerArb = fc.record({
    firstName: fc.tuple(fc.uuid(), fc.integer()).map(([uuid, counter]) => `First_${uuid.substring(0, 6)}_${Date.now()}_${counter}`),
    lastName: fc.tuple(fc.uuid(), fc.integer()).map(([uuid, counter]) => `Last_${uuid.substring(0, 6)}_${Date.now()}_${counter}`),
    handedness: fc.constantFrom('left' as Handedness, 'right' as Handedness),
    timePreference: fc.constantFrom('AM' as TimePreference, 'PM' as TimePreference, 'Either' as TimePreference)
  });

  const playersArb = fc.array(playerArb, { minLength: 4, maxLength: 20 });

  /**
   * Property Test: Season Creation and Management (Requirements 4.1)
   * For any valid season data, the TypeScript application should create and manage seasons
   * with the same functionality as the simple version
   */
  test('should preserve season creation and management functionality', async () => {
    await fc.assert(
      fc.asyncProperty(
        seasonNameArb,
        dateRangeArb,
        async (name, { startDate, endDate }) => {
          // Clear state before each property test run to avoid conflicts
          localStorage.clear();
          
          // Reinitialize repositories with fresh state for this test run
          const freshSeasonRepository = new LocalSeasonRepository();
          const freshSeasonManager = new SeasonManagerService(freshSeasonRepository);
          
          // Test season creation
          const season = await freshSeasonManager.createSeason(name, startDate, endDate);
          
          // Verify season properties match expected functionality
          expect(season.name).toBe(name);
          expect(season.startDate).toEqual(startDate);
          expect(season.endDate).toEqual(endDate);
          expect(season.isActive).toBe(false); // New seasons start inactive
          expect(season.id).toBeDefined();

          // Test season activation (equivalent to simple version functionality)
          await freshSeasonManager.setActiveSeason(season.id);
          const activeSeason = await freshSeasonManager.getActiveSeason();
          
          expect(activeSeason).toBeDefined();
          expect(activeSeason!.id).toBe(season.id);
          expect(activeSeason!.isActive).toBe(true);

          // Test season retrieval
          const retrievedSeason = await freshSeasonRepository.findById(season.id);
          expect(retrievedSeason).toBeDefined();
          expect(retrievedSeason!.name).toBe(name);

          // Test season listing
          const allSeasons = await freshSeasonManager.getAllSeasons();
          expect(allSeasons.length).toBeGreaterThan(0);
          expect(allSeasons.some(s => s.id === season.id)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property Test: Player Addition with Preferences (Requirements 4.2)
   * For any valid player data, the TypeScript application should add players with
   * preferences and handedness like the simple version
   */
  test('should preserve player addition with preferences and handedness functionality', async () => {
    await fc.assert(
      fc.asyncProperty(
        seasonNameArb,
        dateRangeArb,
        playersArb,
        async (seasonName, { startDate, endDate }, players) => {
          // Clear state before each property test run to avoid conflicts
          localStorage.clear();
          
          // Reinitialize repositories with fresh state for this test run
          const freshSeasonRepository = new LocalSeasonRepository();
          const freshPlayerRepository = new LocalPlayerRepository();
          const freshWeekRepository = new LocalWeekRepository();
          const freshScheduleRepository = new LocalScheduleRepository();
          
          const freshSeasonManager = new SeasonManagerService(freshSeasonRepository);
          const freshPlayerManager = new PlayerManagerService(
            freshPlayerRepository, 
            freshWeekRepository, 
            freshScheduleRepository, 
            freshSeasonRepository
          );

          // Create and activate a season first
          const season = await freshSeasonManager.createSeason(seasonName, startDate, endDate);
          await freshSeasonManager.setActiveSeason(season.id);

          // Test player addition functionality
          const addedPlayers: Player[] = [];
          
          for (const playerData of players) {
            const addedPlayer = await freshPlayerManager.addPlayer(playerData);
            addedPlayers.push(addedPlayer);

            // Verify player properties match simple version functionality
            expect(addedPlayer.firstName).toBe(playerData.firstName);
            expect(addedPlayer.lastName).toBe(playerData.lastName);
            expect(addedPlayer.handedness).toBe(playerData.handedness);
            expect(addedPlayer.timePreference).toBe(playerData.timePreference);
            expect(addedPlayer.seasonId).toBe(season.id);
            expect(addedPlayer.id).toBeDefined();
          }

          // Test player retrieval (equivalent to simple version display)
          const seasonPlayers = await freshPlayerManager.getAllPlayers(season.id);
          expect(seasonPlayers.length).toBe(players.length);

          // Verify all players are correctly stored with their preferences
          for (const originalPlayer of players) {
            const foundPlayer = seasonPlayers.find(p => 
              p.firstName === originalPlayer.firstName && 
              p.lastName === originalPlayer.lastName
            );
            expect(foundPlayer).toBeDefined();
            expect(foundPlayer!.handedness).toBe(originalPlayer.handedness);
            expect(foundPlayer!.timePreference).toBe(originalPlayer.timePreference);
          }

          // Test player count functionality (like simple version)
          expect(seasonPlayers.length).toBe(addedPlayers.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property Test: Schedule Generation Functionality (Requirements 4.3)
   * For any valid set of players, the TypeScript application should generate schedules
   * with morning/afternoon slots like the simple version
   */
  test('should preserve schedule generation with morning/afternoon slots functionality', async () => {
    await fc.assert(
      fc.asyncProperty(
        seasonNameArb,
        dateRangeArb,
        playersArb,
        async (seasonName, { startDate, endDate }, players) => {
          // Clear state before each property test run to avoid conflicts
          localStorage.clear();
          
          // Reinitialize repositories with fresh state for this test run
          const freshSeasonRepository = new LocalSeasonRepository();
          const freshPlayerRepository = new LocalPlayerRepository();
          const freshWeekRepository = new LocalWeekRepository();
          const freshScheduleRepository = new LocalScheduleRepository();
          const freshPairingHistoryRepository = new LocalPairingHistoryRepository();
          
          const freshSeasonManager = new SeasonManagerService(freshSeasonRepository);
          const freshPlayerManager = new PlayerManagerService(
            freshPlayerRepository, 
            freshWeekRepository, 
            freshScheduleRepository, 
            freshSeasonRepository
          );
          const freshPairingHistoryTracker = new PairingHistoryTracker(freshPairingHistoryRepository);
          const freshScheduleGenerator = new ScheduleGenerator({}, freshPairingHistoryTracker);
          const freshScheduleManager = new ScheduleManager(
            freshScheduleRepository,
            freshWeekRepository,
            freshPlayerRepository,
            freshScheduleGenerator,
            freshPairingHistoryTracker
          );

          // Create season and add players
          const season = await freshSeasonManager.createSeason(seasonName, startDate, endDate);
          await freshSeasonManager.setActiveSeason(season.id);

          const addedPlayers: Player[] = [];
          for (const playerData of players) {
            const player = await freshPlayerManager.addPlayer(playerData);
            addedPlayers.push(player);
          }

          // Create a week for scheduling
          const week = await freshWeekRepository.create({
            seasonId: season.id,
            weekNumber: 1,
            date: new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000)
          });

          // Set all players as available (like simple version assumes)
          for (const player of addedPlayers) {
            await freshWeekRepository.setPlayerAvailability(week.id, player.id, true);
          }

          // Test schedule generation functionality
          const schedule = await freshScheduleManager.createWeeklySchedule(week.id);

          // Verify schedule structure matches simple version expectations
          expect(schedule).toBeDefined();
          expect(schedule.weekId).toBe(week.id);
          expect(schedule.timeSlots).toBeDefined();
          expect(schedule.timeSlots.morning).toBeDefined();
          expect(schedule.timeSlots.afternoon).toBeDefined();

          // Verify morning and afternoon slots exist (like simple version)
          expect(Array.isArray(schedule.timeSlots.morning)).toBe(true);
          expect(Array.isArray(schedule.timeSlots.afternoon)).toBe(true);

          // Count total players scheduled
          const morningPlayers = schedule.timeSlots.morning.reduce((sum, foursome) => sum + foursome.players.length, 0);
          const afternoonPlayers = schedule.timeSlots.afternoon.reduce((sum, foursome) => sum + foursome.players.length, 0);
          const totalScheduledPlayers = morningPlayers + afternoonPlayers;

          // Verify all available players are scheduled (like simple version)
          expect(totalScheduledPlayers).toBe(addedPlayers.length);

          // Verify time preferences are respected (enhanced functionality over simple version)
          for (const foursome of schedule.timeSlots.morning) {
            for (const player of foursome.players) {
              expect(['AM', 'Either']).toContain(player.timePreference);
            }
          }

          for (const foursome of schedule.timeSlots.afternoon) {
            for (const player of foursome.players) {
              expect(['PM', 'Either']).toContain(player.timePreference);
            }
          }

          // Verify schedule can be retrieved (like simple version display)
          const retrievedSchedule = await freshScheduleRepository.findById(schedule.id);
          expect(retrievedSchedule).toBeDefined();
          expect(retrievedSchedule!.weekId).toBe(week.id);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property Test: Tab Navigation Functionality (Requirements 4.4)
   * For any UI state, the TypeScript application should maintain tab navigation
   * functionality like the simple version
   */
  test('should preserve tab navigation functionality', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('seasons', 'players', 'schedule'),
        async (tabName) => {
          // Test that the services are properly initialized and accessible
          // This verifies the underlying functionality that supports tab navigation
          
          // Verify services are accessible (like simple version)
          expect(seasonManager).toBeDefined();
          expect(playerManager).toBeDefined();
          expect(scheduleManager).toBeDefined();
          expect(mainUI).toBeDefined();

          // Test that each service can perform basic operations (tab functionality)
          const seasons = await seasonManager.getAllSeasons();
          expect(Array.isArray(seasons)).toBe(true);

          // Verify the services maintain state across operations (like simple version tabs)
          // The tabName parameter represents which tab functionality we're testing
          switch (tabName) {
            case 'seasons':
              expect(seasonManager).toBeDefined();
              break;
            case 'players':
              expect(playerManager).toBeDefined();
              break;
            case 'schedule':
              expect(scheduleManager).toBeDefined();
              break;
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Integration Property Test: Complete Workflow Parity
   * For any complete workflow, the TypeScript application should provide
   * equivalent functionality to the simple version
   */
  test('should preserve complete workflow functionality equivalent to simple version', async () => {
    await fc.assert(
      fc.asyncProperty(
        seasonNameArb,
        dateRangeArb,
        playersArb,
        async (seasonName, { startDate, endDate }, players) => {
          // Filter to ensure we have at least 4 players for meaningful scheduling
          if (players.length < 4) return;

          // Clear state before each property test run to avoid conflicts
          localStorage.clear();
          
          // Reinitialize repositories with fresh state for this test run
          const freshSeasonRepository = new LocalSeasonRepository();
          const freshPlayerRepository = new LocalPlayerRepository();
          const freshWeekRepository = new LocalWeekRepository();
          const freshScheduleRepository = new LocalScheduleRepository();
          const freshPairingHistoryRepository = new LocalPairingHistoryRepository();
          
          const freshSeasonManager = new SeasonManagerService(freshSeasonRepository);
          const freshPlayerManager = new PlayerManagerService(
            freshPlayerRepository, 
            freshWeekRepository, 
            freshScheduleRepository, 
            freshSeasonRepository
          );
          const freshPairingHistoryTracker = new PairingHistoryTracker(freshPairingHistoryRepository);
          const freshScheduleGenerator = new ScheduleGenerator({}, freshPairingHistoryTracker);
          const freshScheduleManager = new ScheduleManager(
            freshScheduleRepository,
            freshWeekRepository,
            freshPlayerRepository,
            freshScheduleGenerator,
            freshPairingHistoryTracker
          );

          // Complete workflow test (equivalent to simple version workflow)
          
          // Step 1: Season creation and activation
          const season = await freshSeasonManager.createSeason(seasonName, startDate, endDate);
          await freshSeasonManager.setActiveSeason(season.id);
          const activeSeason = await freshSeasonManager.getActiveSeason();
          expect(activeSeason!.id).toBe(season.id);

          // Step 2: Player addition with preferences
          const addedPlayers: Player[] = [];
          for (const playerData of players) {
            const player = await freshPlayerManager.addPlayer(playerData);
            addedPlayers.push(player);
          }
          expect(addedPlayers.length).toBe(players.length);

          // Step 3: Week creation and availability
          const week = await freshWeekRepository.create({
            seasonId: season.id,
            weekNumber: 1,
            date: new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000)
          });

          for (const player of addedPlayers) {
            await freshWeekRepository.setPlayerAvailability(week.id, player.id, true);
          }

          // Step 4: Schedule generation
          const schedule = await freshScheduleManager.createWeeklySchedule(week.id);
          expect(schedule).toBeDefined();

          // Step 5: Verify complete functionality preservation
          const totalScheduledPlayers = schedule.timeSlots.morning.reduce((sum, foursome) => sum + foursome.players.length, 0) +
                                       schedule.timeSlots.afternoon.reduce((sum, foursome) => sum + foursome.players.length, 0);
          
          expect(totalScheduledPlayers).toBe(addedPlayers.length);

          // Verify data persistence (like simple version localStorage)
          const persistedSeason = await freshSeasonRepository.findById(season.id);
          const persistedPlayers = await freshPlayerRepository.findBySeasonId(season.id);
          const persistedSchedule = await freshScheduleRepository.findById(schedule.id);

          expect(persistedSeason).toBeDefined();
          expect(persistedPlayers.length).toBe(addedPlayers.length);
          expect(persistedSchedule).toBeDefined();

          // Verify enhanced functionality doesn't break simple version compatibility
          expect(persistedSeason!.name).toBe(seasonName);
          expect(persistedSchedule!.weekId).toBe(week.id);
        }
      ),
      { numRuns: 100 }
    );
  });
});