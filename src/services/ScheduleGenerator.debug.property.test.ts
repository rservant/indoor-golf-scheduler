import fc from 'fast-check';
import { ScheduleGenerator } from './ScheduleGenerator';
import { Player } from '../models/Player';
import { WeekModel } from '../models/Week';

/**
 * Property-based tests for ScheduleGenerator debug information availability
 * Feature: schedule-generation-fix, Property 8: Debug information availability
 * Validates: Requirements 4.5
 */

describe('ScheduleGenerator Debug Information Properties', () => {
  let scheduleGenerator: ScheduleGenerator;

  beforeEach(() => {
    scheduleGenerator = new ScheduleGenerator();
  });

  /**
   * Property 8: Debug information availability
   * For any schedule generation attempt, detailed logging should be available for debugging purposes
   */
  test('Property 8: Debug information availability - detailed logging for all generation attempts', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random test data
        fc.record({
          seasonId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
          weekId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
          weekNumber: fc.integer({ min: 1, max: 52 }),
          players: fc.array(
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
              firstName: fc.string({ minLength: 1, maxLength: 15 }).filter(s => s.trim().length > 0),
              lastName: fc.string({ minLength: 1, maxLength: 15 }).filter(s => s.trim().length > 0),
              seasonId: fc.constant('test-season'),
              timePreference: fc.constantFrom('AM', 'PM', 'Either') as fc.Arbitrary<'AM' | 'PM' | 'Either'>,
              handedness: fc.constantFrom('left', 'right') as fc.Arbitrary<'left' | 'right'>,
              createdAt: fc.constant(new Date())
            }),
            { minLength: 0, maxLength: 20 }
          ),
          availabilityData: fc.record({
            hasData: fc.boolean(),
            playerStatuses: fc.dictionary(
              fc.string(),
              fc.boolean()
            )
          })
        }),
        async (testData) => {
          // Create players with consistent season ID
          const players: Player[] = testData.players.map(p => ({
            ...p,
            seasonId: testData.seasonId
          }));

          // Create week with availability data
          const week = new WeekModel({
            id: testData.weekId,
            seasonId: testData.seasonId,
            weekNumber: testData.weekNumber,
            date: new Date(),
            playerAvailability: testData.availabilityData.hasData 
              ? testData.availabilityData.playerStatuses 
              : {}
          });

          let generationSucceeded = false;
          let generationError: Error | null = null;

          try {
            // Attempt schedule generation
            const schedule = await scheduleGenerator.generateScheduleForWeek(week, players);
            generationSucceeded = true;

            // Verify schedule was created (even if empty)
            expect(schedule).toBeDefined();
            expect(schedule.weekId).toBe(testData.weekId);
          } catch (error) {
            generationError = error as Error;
            generationSucceeded = false;
          }

          // Property: Debug information should be available regardless of success/failure
          const debugInfo = scheduleGenerator.getDebugInfo();
          
          // Debug information should always be available after generation attempt
          expect(debugInfo).toBeDefined();
          
          if (debugInfo) {
            // Debug info should contain basic structure
            expect(debugInfo).toHaveProperty('weekId');
            expect(debugInfo).toHaveProperty('seasonId');
            expect(debugInfo).toHaveProperty('totalPlayers');
            expect(debugInfo).toHaveProperty('availablePlayers');
            expect(debugInfo).toHaveProperty('unavailablePlayers');
            expect(debugInfo).toHaveProperty('filteringDecisions');
            expect(debugInfo).toHaveProperty('generationSteps');
            expect(debugInfo).toHaveProperty('finalSchedule');
            expect(debugInfo).toHaveProperty('errors');
            expect(debugInfo).toHaveProperty('warnings');
            expect(debugInfo).toHaveProperty('startTime');

            // Arrays should be defined
            expect(Array.isArray(debugInfo.availablePlayers)).toBe(true);
            expect(Array.isArray(debugInfo.unavailablePlayers)).toBe(true);
            expect(Array.isArray(debugInfo.filteringDecisions)).toBe(true);
            expect(Array.isArray(debugInfo.generationSteps)).toBe(true);
            expect(Array.isArray(debugInfo.errors)).toBe(true);
            expect(Array.isArray(debugInfo.warnings)).toBe(true);

            // Start time should be a valid date
            expect(debugInfo.startTime).toBeInstanceOf(Date);

            // If generation failed, errors should be recorded
            if (!generationSucceeded && generationError) {
              expect(debugInfo.errors.length).toBeGreaterThan(0);
            }

            // If generation succeeded, final schedule should be present
            if (generationSucceeded) {
              expect(debugInfo.finalSchedule).toBeDefined();
            }

            // Generation steps should contain at least the start step
            expect(debugInfo.generationSteps.length).toBeGreaterThan(0);
            
            // First step should be the start step
            const firstStep = debugInfo.generationSteps[0];
            expect(firstStep).toHaveProperty('step');
            expect(firstStep).toHaveProperty('timestamp');
            expect(firstStep).toHaveProperty('data');
            expect(firstStep).toHaveProperty('success');
            expect(firstStep.timestamp).toBeInstanceOf(Date);

            // If we have players, filtering decisions should be recorded
            if (players.length > 0) {
              expect(debugInfo.filteringDecisions.length).toBe(players.length);
              
              // Each filtering decision should have required properties
              debugInfo.filteringDecisions.forEach(decision => {
                expect(decision).toHaveProperty('playerId');
                expect(decision).toHaveProperty('playerName');
                expect(decision).toHaveProperty('availabilityStatus');
                expect(decision).toHaveProperty('decision');
                expect(decision).toHaveProperty('reason');
                expect(decision).toHaveProperty('timestamp');
                expect(['included', 'excluded']).toContain(decision.decision);
                expect(decision.timestamp).toBeInstanceOf(Date);
              });
            }
          }
        }
      ),
      { numRuns: 100, timeout: 10000 }
    );
  });

  test('Property 8: Debug information contains comprehensive generation steps', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          seasonId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
          weekId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
          weekNumber: fc.integer({ min: 1, max: 52 }),
          playerCount: fc.integer({ min: 4, max: 12 })
        }),
        async (testData) => {
          // Create players with availability
          const players: Player[] = Array.from({ length: testData.playerCount }, (_, i) => ({
            id: `player-${i}`,
            firstName: `Player${i}`,
            lastName: `Test`,
            seasonId: testData.seasonId,
            timePreference: ['AM', 'PM', 'Either'][i % 3] as 'AM' | 'PM' | 'Either',
            handedness: (i % 2 === 0 ? 'left' : 'right') as 'left' | 'right',
            createdAt: new Date()
          }));

          // Create week with all players available
          const playerAvailability: Record<string, boolean> = {};
          players.forEach(p => {
            playerAvailability[p.id] = true;
          });

          const week = new WeekModel({
            id: testData.weekId,
            seasonId: testData.seasonId,
            weekNumber: testData.weekNumber,
            date: new Date(),
            playerAvailability
          });

          // Generate schedule
          await scheduleGenerator.generateScheduleForWeek(week, players);

          // Get debug information
          const debugInfo = scheduleGenerator.getDebugInfo();
          expect(debugInfo).toBeDefined();

          if (debugInfo) {
            // Should have multiple generation steps for successful generation
            expect(debugInfo.generationSteps.length).toBeGreaterThanOrEqual(5);

            // Should have steps for key phases
            const stepNames = debugInfo.generationSteps.map(s => s.step);
            expect(stepNames).toContain('Starting schedule generation for week');
            expect(stepNames).toContain('Player filtering completed');
            expect(stepNames).toContain('Schedule generation completed');

            // All steps should have timestamps in chronological order
            for (let i = 1; i < debugInfo.generationSteps.length; i++) {
              const prevStep = debugInfo.generationSteps[i - 1];
              const currentStep = debugInfo.generationSteps[i];
              expect(currentStep.timestamp.getTime()).toBeGreaterThanOrEqual(prevStep.timestamp.getTime());
            }

            // Should have filtering decisions for all players
            expect(debugInfo.filteringDecisions.length).toBe(testData.playerCount);

            // All filtering decisions should be 'included' since all players are available
            debugInfo.filteringDecisions.forEach(decision => {
              expect(decision.decision).toBe('included');
              expect(decision.availabilityStatus).toBe(true);
            });

            // Should have timing information
            expect(debugInfo.startTime).toBeInstanceOf(Date);
            if (debugInfo.endTime) {
              expect(debugInfo.endTime).toBeInstanceOf(Date);
              expect(debugInfo.endTime.getTime()).toBeGreaterThanOrEqual(debugInfo.startTime.getTime());
            }
            if (debugInfo.duration !== undefined) {
              expect(debugInfo.duration).toBeGreaterThanOrEqual(0);
            }
          }
        }
      ),
      { numRuns: 50, timeout: 15000 }
    );
  });

  test('Property 8: Debug information captures error details for failed generations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          weekId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
          seasonId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
          weekNumber: fc.integer({ min: 1, max: 52 }),
          players: fc.array(
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
              firstName: fc.string({ minLength: 1, maxLength: 15 }).filter(s => s.trim().length > 0),
              lastName: fc.string({ minLength: 1, maxLength: 15 }).filter(s => s.trim().length > 0),
              seasonId: fc.oneof(fc.constant('test-season'), fc.constant('different-season')),
              timePreference: fc.constantFrom('AM', 'PM', 'Either') as fc.Arbitrary<'AM' | 'PM' | 'Either'>,
              handedness: fc.constantFrom('left', 'right') as fc.Arbitrary<'left' | 'right'>,
              createdAt: fc.constant(new Date())
            }),
            { minLength: 0, maxLength: 10 }
          )
        }),
        async (testData) => {
          const players: Player[] = testData.players;

          const week = new WeekModel({
            id: testData.weekId,
            seasonId: testData.seasonId,
            weekNumber: testData.weekNumber,
            date: new Date(),
            playerAvailability: {}
          });

          let generationFailed = false;
          let caughtError: Error | null = null;

          try {
            await scheduleGenerator.generateScheduleForWeek(week, players);
          } catch (error) {
            generationFailed = true;
            caughtError = error as Error;
          }

          // Get debug information
          const debugInfo = scheduleGenerator.getDebugInfo();
          expect(debugInfo).toBeDefined();

          if (debugInfo) {
            // Should have generation steps recorded even for failures
            expect(debugInfo.generationSteps.length).toBeGreaterThan(0);

            // If generation failed due to business logic (not validation), check error recording
            if (generationFailed && caughtError && !caughtError.message.includes('Season ID is required') && !caughtError.message.includes('Week ID is required')) {
              // Should have error information recorded for business logic failures
              expect(debugInfo.errors.length).toBeGreaterThan(0);

              // Should have at least one failed step
              const failedSteps = debugInfo.generationSteps.filter(s => !s.success);
              expect(failedSteps.length).toBeGreaterThan(0);

              // Failed step should have error information
              const lastFailedStep = failedSteps[failedSteps.length - 1];
              expect(lastFailedStep.error).toBeDefined();
              expect(typeof lastFailedStep.error).toBe('string');
            }

            // Should always have basic structure regardless of failure type
            expect(debugInfo).toHaveProperty('weekId');
            expect(debugInfo).toHaveProperty('seasonId');
            expect(debugInfo).toHaveProperty('totalPlayers');
            expect(debugInfo).toHaveProperty('generationSteps');
            expect(debugInfo).toHaveProperty('errors');
            expect(debugInfo).toHaveProperty('warnings');
            expect(debugInfo).toHaveProperty('startTime');
          }
        }
      ),
      { numRuns: 50, timeout: 10000 }
    );
  });
});