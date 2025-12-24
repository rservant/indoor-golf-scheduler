/**
 * Property-based tests for ScheduleDisplayUI display consistency
 * Feature: schedule-generation-fix, Property 4: Schedule display consistency
 * 
 * @jest-environment jsdom
 */

import * as fc from 'fast-check';
import { ScheduleDisplayUI } from './ScheduleDisplayUI';
import { ScheduleManager } from '../services/ScheduleManager';
import { ScheduleGenerator } from '../services/ScheduleGenerator';
import { WeekRepository } from '../repositories/WeekRepository';
import { ExportService } from '../services/ExportService';
import { PairingHistoryTracker } from '../services/PairingHistoryTracker';
import { PlayerManager } from '../services/PlayerManager';
import { SeasonModel } from '../models/Season';
import { WeekModel } from '../models/Week';
import { PlayerModel } from '../models/Player';
import { ScheduleModel } from '../models/Schedule';
import { FoursomeModel } from '../models/Foursome';
import { getPropertyTestParams } from '../test-utils/property-test-config';

describe('ScheduleDisplayUI Display Consistency Properties', () => {
  let scheduleDisplayUI: ScheduleDisplayUI;
  let mockScheduleManager: jest.Mocked<ScheduleManager>;
  let mockWeekRepository: jest.Mocked<WeekRepository>;
  let mockExportService: jest.Mocked<ExportService>;
  let mockPairingHistoryTracker: jest.Mocked<PairingHistoryTracker>;
  let mockPlayerManager: jest.Mocked<PlayerManager>;
  let container: HTMLElement;

  beforeEach(() => {
    // Create DOM container
    container = document.createElement('div');
    document.body.appendChild(container);

    // Create mocks
    mockScheduleManager = {
      getSchedule: jest.fn(),
      createWeeklySchedule: jest.fn(),
    } as any;

    mockWeekRepository = {
      findBySeasonId: jest.fn(),
    } as any;

    mockExportService = {
      exportSchedule: jest.fn(),
    } as any;

    mockPairingHistoryTracker = {
      calculatePairingMetrics: jest.fn(),
    } as any;

    mockPlayerManager = {
      getAllPlayers: jest.fn(),
      getPlayerAvailability: jest.fn(),
    } as any;

    // Create UI instance
    scheduleDisplayUI = new ScheduleDisplayUI(
      mockScheduleManager,
      {} as ScheduleGenerator,
      mockWeekRepository,
      mockExportService,
      mockPairingHistoryTracker,
      mockPlayerManager,
      container
    );
  });

  afterEach(() => {
    if (container.parentNode) {
      document.body.removeChild(container);
    }
  });

  /**
   * Generators for test data - simplified for more reliable testing
   */
  const playerArbitrary = fc.record({
    firstName: fc.constantFrom('John', 'Jane', 'Bob', 'Alice', 'Mike', 'Sarah'),
    lastName: fc.constantFrom('Smith', 'Johnson', 'Brown', 'Davis', 'Wilson', 'Miller'),
    handedness: fc.constantFrom('left', 'right'),
    timePreference: fc.constantFrom('AM', 'PM', 'Either'),
    seasonId: fc.constant('test-season-id')
  });

  // Create valid season data with simple, predictable values
  const seasonArbitrary = fc.constant({
    name: 'Test Season',
    startDate: new Date('2024-01-01'),
    endDate: new Date('2024-12-31')
  });

  const weekArbitrary = fc.constant({
    seasonId: 'test-season-id',
    weekNumber: 1,
    date: new Date('2024-01-01')
  });

  /**
   * Property 4: Schedule display consistency
   * For any generated schedule with foursomes, the display should show all foursomes 
   * with correct player names organized by time slots
   * Validates: Requirements 2.1, 2.2, 2.3, 2.4
   */
  it('Property 4: Schedule display consistency - all foursomes displayed with correct player names and time slot organization', () => {
    fc.assert(
      fc.property(
        seasonArbitrary,
        weekArbitrary,
        fc.array(playerArbitrary, { minLength: 4, maxLength: 8 }),
        fc.integer({ min: 0, max: 2 }), // number of morning foursomes
        fc.integer({ min: 0, max: 2 }), // number of afternoon foursomes
        (seasonData, weekData, playersData, morningCount, afternoonCount) => {
          // Skip empty schedules for this test
          if (morningCount === 0 && afternoonCount === 0) {
            return true;
          }

          // Create model instances
          const season = new SeasonModel(seasonData);
          const week = new WeekModel({ ...weekData, seasonId: season.id });
          const players = playersData.map(p => new PlayerModel({ 
            ...p, 
            seasonId: season.id,
            handedness: p.handedness as 'left' | 'right',
            timePreference: p.timePreference as 'AM' | 'PM' | 'Either'
          }));
          
          // Create foursomes with actual player instances
          const morningFoursomes: FoursomeModel[] = [];
          for (let i = 0; i < morningCount; i++) {
            const foursomePlayers = players.slice(i * 2, (i * 2) + Math.min(4, players.length - (i * 2)));
            if (foursomePlayers.length > 0) {
              morningFoursomes.push(new FoursomeModel({
                players: foursomePlayers,
                timeSlot: 'morning',
                position: i + 1
              }));
            }
          }

          const afternoonFoursomes: FoursomeModel[] = [];
          for (let i = 0; i < afternoonCount; i++) {
            const startIndex = morningCount * 2 + i * 2;
            const foursomePlayers = players.slice(startIndex, startIndex + Math.min(4, players.length - startIndex));
            if (foursomePlayers.length > 0) {
              afternoonFoursomes.push(new FoursomeModel({
                players: foursomePlayers,
                timeSlot: 'afternoon',
                position: i + 1
              }));
            }
          }

          const schedule = new ScheduleModel({
            weekId: week.id,
            timeSlots: {
              morning: morningFoursomes,
              afternoon: afternoonFoursomes
            }
          });

          // Setup mocks
          mockWeekRepository.findBySeasonId.mockResolvedValue([week]);
          mockPlayerManager.getAllPlayers.mockResolvedValue(players);
          mockPlayerManager.getPlayerAvailability.mockResolvedValue(true);
          mockScheduleManager.getSchedule.mockResolvedValue(schedule);
          mockPairingHistoryTracker.calculatePairingMetrics.mockResolvedValue({
            pairingCounts: new Map(),
            minPairings: 0,
            maxPairings: 0,
            averagePairings: 0
          });

          // Set up the UI state and render
          (scheduleDisplayUI as any).state = {
            activeSeason: season,
            weeks: [week],
            selectedWeek: week,
            schedule: schedule,
            isGenerating: false,
            error: null,
            showExportOptions: false,
            showAddWeekForm: false,
            allPlayers: players,
            availablePlayers: players,
            unavailablePlayers: [],
            pairingMetrics: null,
            showPairingHistory: false,
            showPlayerDistribution: false,
            isEditing: false,
            draggedPlayer: null,
            draggedFromFoursome: null,
            hasUnsavedChanges: false,
            validationResult: null,
            errorDetails: null,
            loadingStates: {
              isLoadingWeeks: false,
              isLoadingPlayers: false,
              isLoadingSchedule: false,
              isLoadingAvailability: false,
              isGeneratingSchedule: false,
              isExporting: false,
              isSaving: false,
              isValidating: false,
              currentOperation: null,
              operationProgress: 0
            },
            operationHistory: []
          };

          // Trigger render
          (scheduleDisplayUI as any).render();

          // Get the rendered HTML
          const html = container.innerHTML;

          // Requirement 2.1: WHEN a schedule is generated successfully, 
          // THE Schedule_Display SHALL show all created foursomes
          const totalFoursomes = morningFoursomes.length + afternoonFoursomes.length;
          if (totalFoursomes > 0) {
            // Should contain foursome elements
            const foursomeElements = container.querySelectorAll('.foursome');
            expect(foursomeElements.length).toBe(totalFoursomes);
          }

          // Requirement 2.2: WHEN foursomes are created, 
          // THE Schedule_Display SHALL display player names within each group
          const allPlayers = [...morningFoursomes, ...afternoonFoursomes]
            .flatMap(foursome => foursome.players);
          
          for (const player of allPlayers) {
            const playerName = `${player.firstName} ${player.lastName}`;
            expect(html).toContain(playerName);
          }

          // Requirement 2.3: WHEN time slots are assigned, 
          // THE Schedule_Display SHALL organize foursomes by morning and afternoon sessions
          expect(html).toContain('Morning (10:30 AM)');
          expect(html).toContain('Afternoon (1:00 PM)');

          // Requirement 2.4: WHERE multiple foursomes exist, 
          // THE Schedule_Display SHALL show each group with proper formatting
          if (totalFoursomes > 0) {
            // Should have group headers for foursomes
            const groupHeaders = container.querySelectorAll('.foursome-header');
            expect(groupHeaders.length).toBe(totalFoursomes);
            
            // Each foursome should have a position indicator
            morningFoursomes.forEach((_, index) => {
              expect(html).toContain(`Group ${index + 1}`);
            });
            afternoonFoursomes.forEach((_, index) => {
              expect(html).toContain(`Group ${index + 1}`);
            });
          }

          // Additional consistency checks
          // Player count should be displayed correctly
          for (const foursome of [...morningFoursomes, ...afternoonFoursomes]) {
            expect(html).toContain(`${foursome.players.length}/4 players`);
          }

          // Time slot sections should be present
          const timeSlotElements = container.querySelectorAll('.time-slot');
          expect(timeSlotElements.length).toBe(2); // Morning and afternoon

          return true;
        }
      ),
      { numRuns: 10, verbose: false } // Reduced runs for faster execution
    );
  });

  /**
   * Property test for empty schedule display consistency
   * Validates Requirement 2.5: WHEN the schedule is empty, 
   * THE Schedule_Display SHALL provide clear feedback about the lack of foursomes
   */
  it('Property 4b: Empty schedule display consistency - clear feedback for empty schedules', () => {
    fc.assert(
      fc.property(
        seasonArbitrary,
        weekArbitrary,
        fc.array(playerArbitrary, { minLength: 4, maxLength: 8 }),
        (seasonData, weekData, playersData) => {
          // Create model instances
          const season = new SeasonModel(seasonData);
          const week = new WeekModel({ ...weekData, seasonId: season.id });
          const players = playersData.map(p => new PlayerModel({ 
            ...p, 
            seasonId: season.id,
            handedness: p.handedness as 'left' | 'right',
            timePreference: p.timePreference as 'AM' | 'PM' | 'Either'
          }));
          
          // Create empty schedule
          const emptySchedule = new ScheduleModel({
            weekId: week.id,
            timeSlots: {
              morning: [],
              afternoon: []
            }
          });

          // Setup mocks
          mockWeekRepository.findBySeasonId.mockResolvedValue([week]);
          mockPlayerManager.getAllPlayers.mockResolvedValue(players);
          mockPlayerManager.getPlayerAvailability.mockResolvedValue(true);
          mockScheduleManager.getSchedule.mockResolvedValue(emptySchedule);
          mockPairingHistoryTracker.calculatePairingMetrics.mockResolvedValue({
            pairingCounts: new Map(),
            minPairings: 0,
            maxPairings: 0,
            averagePairings: 0
          });

          // Set up the UI state and render
          (scheduleDisplayUI as any).state = {
            activeSeason: season,
            weeks: [week],
            selectedWeek: week,
            schedule: emptySchedule,
            isGenerating: false,
            error: null,
            showExportOptions: false,
            showAddWeekForm: false,
            allPlayers: players,
            availablePlayers: players,
            unavailablePlayers: [],
            pairingMetrics: null,
            showPairingHistory: false,
            showPlayerDistribution: false,
            isEditing: false,
            draggedPlayer: null,
            draggedFromFoursome: null,
            hasUnsavedChanges: false,
            validationResult: null,
            errorDetails: null,
            loadingStates: {
              isLoadingWeeks: false,
              isLoadingPlayers: false,
              isLoadingSchedule: false,
              isLoadingAvailability: false,
              isGeneratingSchedule: false,
              isExporting: false,
              isSaving: false,
              isValidating: false,
              currentOperation: null,
              operationProgress: 0
            },
            operationHistory: []
          };

          // Trigger render
          (scheduleDisplayUI as any).render();

          // Get the rendered HTML
          const html = container.innerHTML;

          // Should show clear feedback for empty time slots
          expect(html).toContain('No players scheduled for this time slot');
          
          // Should still show time slot structure
          expect(html).toContain('Morning (10:30 AM)');
          expect(html).toContain('Afternoon (1:00 PM)');
          
          // Should show no-foursomes message
          const noFoursomesElements = container.querySelectorAll('.no-foursomes');
          expect(noFoursomesElements.length).toBe(2); // One for each time slot

          return true;
        }
      ),
      { numRuns: 5, verbose: false } // Reduced runs for faster execution
    );
  });

  /**
   * Property test for schedule display with mixed foursome sizes
   * Tests display consistency when foursomes have different numbers of players
   */
  it('Property 4c: Mixed foursome size display consistency - proper formatting for partial foursomes', () => {
    fc.assert(
      fc.property(
        seasonArbitrary,
        weekArbitrary,
        fc.array(playerArbitrary, { minLength: 6, maxLength: 10 }),
        (seasonData, weekData, playersData) => {
          // Create model instances
          const season = new SeasonModel(seasonData);
          const week = new WeekModel({ ...weekData, seasonId: season.id });
          const players = playersData.map(p => new PlayerModel({ 
            ...p, 
            seasonId: season.id,
            handedness: p.handedness as 'left' | 'right',
            timePreference: p.timePreference as 'AM' | 'PM' | 'Either'
          }));
          
          // Create foursomes with different sizes (1-4 players each)
          const foursome1 = new FoursomeModel({
            players: players.slice(0, Math.min(2, players.length)), // 2 players or less
            timeSlot: 'morning',
            position: 1
          });

          const foursome2 = new FoursomeModel({
            players: players.slice(2, Math.min(6, players.length)), // up to 4 players
            timeSlot: 'morning',
            position: 2
          });

          const remainingPlayers = players.slice(6);
          const foursome3 = remainingPlayers.length > 0 ? new FoursomeModel({
            players: remainingPlayers.slice(0, Math.min(3, remainingPlayers.length)), // up to 3 players
            timeSlot: 'afternoon',
            position: 1
          }) : null;

          const foursomes = [foursome1, foursome2, foursome3].filter(f => f !== null && f.players.length > 0);
          
          // Skip test if we don't have enough players for meaningful foursomes
          if (foursomes.length === 0) {
            return true;
          }

          const schedule = new ScheduleModel({
            weekId: week.id,
            timeSlots: {
              morning: foursomes.filter((f): f is FoursomeModel => f !== null && f.timeSlot === 'morning'),
              afternoon: foursomes.filter((f): f is FoursomeModel => f !== null && f.timeSlot === 'afternoon')
            }
          });

          // Setup mocks
          mockWeekRepository.findBySeasonId.mockResolvedValue([week]);
          mockPlayerManager.getAllPlayers.mockResolvedValue(players);
          mockPlayerManager.getPlayerAvailability.mockResolvedValue(true);
          mockScheduleManager.getSchedule.mockResolvedValue(schedule);
          mockPairingHistoryTracker.calculatePairingMetrics.mockResolvedValue({
            pairingCounts: new Map(),
            minPairings: 0,
            maxPairings: 0,
            averagePairings: 0
          });

          // Set up the UI state and render
          (scheduleDisplayUI as any).state = {
            activeSeason: season,
            weeks: [week],
            selectedWeek: week,
            schedule: schedule,
            isGenerating: false,
            error: null,
            showExportOptions: false,
            showAddWeekForm: false,
            allPlayers: players,
            availablePlayers: players,
            unavailablePlayers: [],
            pairingMetrics: null,
            showPairingHistory: false,
            showPlayerDistribution: false,
            isEditing: true, // Enable editing mode to show empty slots
            draggedPlayer: null,
            draggedFromFoursome: null,
            hasUnsavedChanges: false,
            validationResult: null,
            errorDetails: null,
            loadingStates: {
              isLoadingWeeks: false,
              isLoadingPlayers: false,
              isLoadingSchedule: false,
              isLoadingAvailability: false,
              isGeneratingSchedule: false,
              isExporting: false,
              isSaving: false,
              isValidating: false,
              currentOperation: null,
              operationProgress: 0
            },
            operationHistory: []
          };

          // Trigger render
          (scheduleDisplayUI as any).render();

          // Get the rendered HTML
          const html = container.innerHTML;

          // Should show correct player counts for each foursome
          for (const foursome of foursomes) {
            if (foursome) {
              expect(html).toContain(`${foursome.players.length}/4 players`);
            }
          }

          // All actual players should be displayed
          for (const foursome of foursomes) {
            if (foursome) {
              for (const player of foursome.players) {
                const playerName = `${player.firstName} ${player.lastName}`;
                expect(html).toContain(playerName);
              }
            }
          }

          return true;
        }
      ),
      { numRuns: 5, verbose: false } // Reduced runs for faster execution
    );
  });
});