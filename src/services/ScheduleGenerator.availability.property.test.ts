import * as fc from 'fast-check';
import { ScheduleGenerator } from './ScheduleGenerator';
import { PlayerModel, Handedness, TimePreference } from '../models/Player';
import { WeekModel } from '../models/Week';
import { ScheduleModel } from '../models/Schedule';
import { FoursomeModel } from '../models/Foursome';

describe('ScheduleGenerator Availability Property Tests', () => {
  let generator: ScheduleGenerator;

  beforeEach(() => {
    generator = new ScheduleGenerator();
  });

  describe('Property 1: Strict availability filtering', () => {
    test('Property: Only players with explicit availability === true are included in filtered results', () => {
      fc.assert(
        fc.property(
          // Generate arbitrary players with valid names and IDs
          fc.array(
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
              firstName: fc.string({ minLength: 1, maxLength: 15 }).filter(s => s.trim().length > 0),
              lastName: fc.string({ minLength: 1, maxLength: 15 }).filter(s => s.trim().length > 0),
              handedness: fc.constantFrom('left', 'right') as fc.Arbitrary<Handedness>,
              timePreference: fc.constantFrom('AM', 'PM', 'Either') as fc.Arbitrary<TimePreference>,
              seasonId: fc.constant('test-season')
            }),
            { minLength: 0, maxLength: 20 }
          ),
          // Generate arbitrary availability data with boolean values only
          fc.dictionary(
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0), // player IDs
            fc.boolean(),
            { maxKeys: 25 }
          ),
          (playerData, availabilityData) => {
            // Create players from generated data
            const players = playerData.map(data => new PlayerModel(data));
            
            // Create week with generated availability data
            const week = new WeekModel({
              seasonId: 'test-season',
              weekNumber: 1,
              date: new Date(),
              playerAvailability: availabilityData
            });

            // Filter available players
            const availablePlayers = generator.filterAvailablePlayers(players, week);

            // Property 1: All filtered players must have explicit availability === true
            for (const player of availablePlayers) {
              expect(week.isPlayerAvailable(player.id)).toBe(true);
              expect(availabilityData[player.id]).toBe(true);
            }

            // Property 2: No player with availability !== true should be in results
            const availablePlayerIds = new Set(availablePlayers.map(p => p.id));
            for (const player of players) {
              const availability = availabilityData[player.id];
              if (availability !== true) {
                expect(availablePlayerIds.has(player.id)).toBe(false);
              }
            }

            // Property 3: All players with explicit availability === true should be included
            // (if they exist in the players array)
            const playerIds = new Set(players.map(p => p.id));
            for (const [playerId, availability] of Object.entries(availabilityData)) {
              if (availability === true && playerIds.has(playerId)) {
                expect(availablePlayerIds.has(playerId)).toBe(true);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('Property: Empty availability data results in no available players', () => {
      fc.assert(
        fc.property(
          // Generate arbitrary players with valid names and IDs
          fc.array(
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
              firstName: fc.string({ minLength: 1, maxLength: 15 }).filter(s => s.trim().length > 0),
              lastName: fc.string({ minLength: 1, maxLength: 15 }).filter(s => s.trim().length > 0),
              handedness: fc.constantFrom('left', 'right') as fc.Arbitrary<Handedness>,
              timePreference: fc.constantFrom('AM', 'PM', 'Either') as fc.Arbitrary<TimePreference>,
              seasonId: fc.constant('test-season')
            }),
            { minLength: 1, maxLength: 10 }
          ),
          (playerData) => {
            // Create players from generated data
            const players = playerData.map(data => new PlayerModel(data));
            
            // Create week with NO availability data
            const week = new WeekModel({
              seasonId: 'test-season',
              weekNumber: 1,
              date: new Date(),
              playerAvailability: {} // Empty availability data
            });

            // Filter available players
            const availablePlayers = generator.filterAvailablePlayers(players, week);

            // Property: No players should be available when no availability data exists
            expect(availablePlayers.length).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('Property: Availability filtering is deterministic and consistent', () => {
      fc.assert(
        fc.property(
          // Generate arbitrary players and availability with valid data
          fc.array(
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
              firstName: fc.string({ minLength: 1, maxLength: 15 }).filter(s => s.trim().length > 0),
              lastName: fc.string({ minLength: 1, maxLength: 15 }).filter(s => s.trim().length > 0),
              handedness: fc.constantFrom('left', 'right') as fc.Arbitrary<Handedness>,
              timePreference: fc.constantFrom('AM', 'PM', 'Either') as fc.Arbitrary<TimePreference>,
              seasonId: fc.constant('test-season')
            }),
            { minLength: 0, maxLength: 15 }
          ),
          fc.dictionary(
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            fc.boolean(),
            { maxKeys: 20 }
          ),
          (playerData, availabilityData) => {
            // Create players from generated data
            const players = playerData.map(data => new PlayerModel(data));
            
            // Create week with generated availability data
            const week = new WeekModel({
              seasonId: 'test-season',
              weekNumber: 1,
              date: new Date(),
              playerAvailability: availabilityData
            });

            // Filter available players multiple times
            const result1 = generator.filterAvailablePlayers(players, week);
            const result2 = generator.filterAvailablePlayers(players, week);
            const result3 = generator.filterAvailablePlayers(players, week);

            // Property: Results should be identical across multiple calls
            expect(result1.length).toBe(result2.length);
            expect(result2.length).toBe(result3.length);

            const ids1 = result1.map(p => p.id).sort();
            const ids2 = result2.map(p => p.id).sort();
            const ids3 = result3.map(p => p.id).sort();

            expect(ids1).toEqual(ids2);
            expect(ids2).toEqual(ids3);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('Property: Availability filtering respects player identity and uniqueness', () => {
      fc.assert(
        fc.property(
          // Generate unique player IDs and availability
          fc.array(
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            { minLength: 0, maxLength: 15 }
          ).map(ids => [...new Set(ids)]), // Ensure unique IDs
          fc.dictionary(
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            fc.boolean(),
            { maxKeys: 20 }
          ),
          (playerIds, availabilityData) => {
            // Create players with unique IDs
            const players = playerIds.map(id => new PlayerModel({
              id,
              firstName: `First${id}`,
              lastName: `Last${id}`,
              handedness: 'right',
              timePreference: 'Either',
              seasonId: 'test-season'
            }));
            
            // Create week with generated availability data
            const week = new WeekModel({
              seasonId: 'test-season',
              weekNumber: 1,
              date: new Date(),
              playerAvailability: availabilityData
            });

            // Filter available players
            const availablePlayers = generator.filterAvailablePlayers(players, week);

            // Property: No duplicate players in results
            const availableIds = availablePlayers.map(p => p.id);
            const uniqueIds = [...new Set(availableIds)];
            expect(availableIds.length).toBe(uniqueIds.length);

            // Property: All returned players exist in original players array
            const originalIds = new Set(players.map(p => p.id));
            for (const player of availablePlayers) {
              expect(originalIds.has(player.id)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('Property: Availability filtering handles edge cases correctly', () => {
      fc.assert(
        fc.property(
          // Generate players with valid data
          fc.array(
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
              firstName: fc.string({ minLength: 1, maxLength: 15 }).filter(s => s.trim().length > 0),
              lastName: fc.string({ minLength: 1, maxLength: 15 }).filter(s => s.trim().length > 0),
              handedness: fc.constantFrom('left', 'right') as fc.Arbitrary<Handedness>,
              timePreference: fc.constantFrom('AM', 'PM', 'Either') as fc.Arbitrary<TimePreference>,
              seasonId: fc.constant('test-season')
            }),
            { minLength: 0, maxLength: 10 }
          ),
          // Generate availability data with only boolean values (WeekModel validation requirement)
          fc.dictionary(
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            fc.boolean(),
            { maxKeys: 15 }
          ),
          (playerData, availabilityData) => {
            // Create players from generated data
            const players = playerData.map(data => new PlayerModel(data));
            
            // Create week with edge case availability data
            const week = new WeekModel({
              seasonId: 'test-season',
              weekNumber: 1,
              date: new Date(),
              playerAvailability: availabilityData
            });

            // Filter available players
            const availablePlayers = generator.filterAvailablePlayers(players, week);

            // Property: Only boolean true values should result in available players
            for (const player of availablePlayers) {
              const availability = availabilityData[player.id];
              expect(availability).toBe(true);
              expect(typeof availability).toBe('boolean');
            }

            // Property: All non-true values should be excluded
            const availablePlayerIds = new Set(availablePlayers.map(p => p.id));
            for (const player of players) {
              const availability = availabilityData[player.id];
              if (availability !== true) {
                expect(availablePlayerIds.has(player.id)).toBe(false);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 3: Graceful handling of insufficient players', () => {
    /**
     * Property 3: Graceful handling of insufficient players
     * For any set of fewer than 4 players, schedule generation should either create partial groups 
     * or provide clear feedback explaining why no complete foursomes were created
     * **Validates: Requirements 1.4, 4.4**
     */
    test('Property 3: Graceful handling of insufficient players', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate 0-3 players (insufficient for complete foursome)
          fc.array(
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
              firstName: fc.string({ minLength: 1, maxLength: 15 }).filter(s => s.trim().length > 0),
              lastName: fc.string({ minLength: 1, maxLength: 15 }).filter(s => s.trim().length > 0),
              handedness: fc.constantFrom('left', 'right') as fc.Arbitrary<Handedness>,
              timePreference: fc.constantFrom('AM', 'PM', 'Either') as fc.Arbitrary<TimePreference>,
              seasonId: fc.constant('test-season')
            }),
            { minLength: 0, maxLength: 3 } // Insufficient players
          ),
          // Generate availability data that makes all players available
          fc.boolean(),
          async (playerData, makeAllAvailable) => {
            // Create players from generated data
            const players = playerData.map(data => new PlayerModel(data));
            
            // Create availability data - either all available or mixed
            const availabilityData: Record<string, boolean> = {};
            for (const player of players) {
              availabilityData[player.id] = makeAllAvailable || Math.random() > 0.3; // Mostly available
            }
            
            // Create week with availability data
            const week = new WeekModel({
              seasonId: 'test-season',
              weekNumber: 1,
              date: new Date(),
              playerAvailability: availabilityData
            });

            // Filter available players
            const availablePlayers = generator.filterAvailablePlayers(players, week);
            
            // Property 1: System should handle insufficient players gracefully (no exceptions)
            expect(() => {
              return generator.generateSchedule('week1', availablePlayers, 'test-season');
            }).not.toThrow();

            // Generate schedule with insufficient players
            const schedulePromise = generator.generateSchedule('week1', availablePlayers, 'test-season');
            return schedulePromise.then(schedule => {
              // Property 2: Schedule should be created (even if empty or with partial groups)
              expect(schedule).toBeDefined();
              expect(schedule.weekId).toBe('week1');
              
              // Property 3: If players exist, they should be handled appropriately
              if (availablePlayers.length > 0) {
                const totalScheduledPlayers = schedule.getTotalPlayerCount();
                
                // Either no players scheduled (if system decides not to create partial groups)
                // OR all available players scheduled (if system creates partial groups)
                expect(totalScheduledPlayers).toBeGreaterThanOrEqual(0);
                expect(totalScheduledPlayers).toBeLessThanOrEqual(availablePlayers.length);
                
                // If players are scheduled, they should be the available ones
                if (totalScheduledPlayers > 0) {
                  const scheduledPlayerIds = schedule.getAllPlayers();
                  const availablePlayerIds = new Set(availablePlayers.map(p => p.id));
                  
                  for (const scheduledId of scheduledPlayerIds) {
                    expect(availablePlayerIds.has(scheduledId)).toBe(true);
                  }
                }
              } else {
                // Property 4: No available players should result in empty schedule
                expect(schedule.getTotalPlayerCount()).toBe(0);
                expect(schedule.timeSlots.morning).toHaveLength(0);
                expect(schedule.timeSlots.afternoon).toHaveLength(0);
              }
              
              // Property 5: Debug information should be available for troubleshooting
              const debugInfo = generator.getDebugInfo();
              expect(debugInfo).toBeDefined();
              if (debugInfo) {
                expect(debugInfo.weekId).toBe('week1');
                expect(debugInfo.totalPlayers).toBe(players.length);
                expect(debugInfo.availablePlayers).toHaveLength(availablePlayers.length);
                
                // Should have filtering decisions for all players
                expect(debugInfo.filteringDecisions).toHaveLength(players.length);
                
                // Should have generation steps
                expect(debugInfo.generationSteps.length).toBeGreaterThan(0);
                
                // Should indicate completion
                expect(debugInfo.generationSteps.some(step => step.step.includes('completed'))).toBe(true);
              }
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    test('Property 3b: Clear feedback for insufficient players scenarios', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate scenarios with different types of insufficient players
          fc.record({
            totalPlayers: fc.integer({ min: 1, max: 8 }),
            availableRatio: fc.float({ min: 0, max: 1 }),
            missingDataRatio: fc.float({ min: 0, max: 0.5 })
          }),
          async (scenario) => {
            // Create players
            const players = Array.from({ length: scenario.totalPlayers }, (_, i) => 
              new PlayerModel({
                id: `player-${i}`,
                firstName: `Player`,
                lastName: `${i}`,
                handedness: i % 2 === 0 ? 'right' : 'left',
                timePreference: ['AM', 'PM', 'Either'][i % 3] as TimePreference,
                seasonId: 'test-season'
              })
            );

            // Create availability data with controlled ratios
            const availabilityData: Record<string, boolean> = {};
            const numAvailable = Math.floor(scenario.totalPlayers * scenario.availableRatio);
            const numMissingData = Math.floor(scenario.totalPlayers * scenario.missingDataRatio);
            
            // Make first numAvailable players available
            for (let i = 0; i < numAvailable; i++) {
              availabilityData[players[i].id] = true;
            }
            
            // Make next players unavailable (but with data)
            for (let i = numAvailable; i < scenario.totalPlayers - numMissingData; i++) {
              availabilityData[players[i].id] = false;
            }
            
            // Leave remaining players without availability data
            
            const week = new WeekModel({
              seasonId: 'test-season',
              weekNumber: 1,
              date: new Date(),
              playerAvailability: availabilityData
            });

            // Filter available players
            const availablePlayers = generator.filterAvailablePlayers(players, week);
            
            // Generate schedule
            return generator.generateSchedule('week1', availablePlayers, 'test-season').then(schedule => {
              const debugInfo = generator.getDebugInfo();
              
              // Property: Debug information should provide clear feedback about insufficient players
              expect(debugInfo).toBeDefined();
              if (debugInfo && availablePlayers.length < 4) {
                // Should have guidance about insufficient players
                const guidanceSteps = debugInfo.generationSteps.filter(step => 
                  step.step.includes('Insufficient') || 
                  step.step.includes('guidance') ||
                  step.data?.scenario === 'insufficient_players'
                );
                
                if (availablePlayers.length > 0 && availablePlayers.length < 4) {
                  expect(guidanceSteps.length).toBeGreaterThan(0);
                }
                
                // Should have filtering decisions explaining why players were excluded
                expect(debugInfo.filteringDecisions).toHaveLength(players.length);
                
                const excludedDecisions = debugInfo.filteringDecisions.filter(d => d.decision === 'excluded');
                const expectedExcluded = players.length - availablePlayers.length;
                expect(excludedDecisions).toHaveLength(expectedExcluded);
                
                // Each excluded decision should have a clear reason
                for (const decision of excludedDecisions) {
                  expect(decision.reason).toBeDefined();
                  expect(decision.reason.length).toBeGreaterThan(0);
                  expect(typeof decision.reason).toBe('string');
                }
              }
              
              // Property: Schedule should handle insufficient players appropriately
              if (availablePlayers.length === 0) {
                expect(schedule.getTotalPlayerCount()).toBe(0);
              } else if (availablePlayers.length < 4) {
                // System may create partial groups or empty schedule - both are valid
                const scheduledCount = schedule.getTotalPlayerCount();
                expect(scheduledCount).toBeGreaterThanOrEqual(0);
                expect(scheduledCount).toBeLessThanOrEqual(availablePlayers.length);
              }
            });
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 2: Schedule availability validation', () => {
    test('Property: Schedule validation correctly identifies all availability violations', () => {
      fc.assert(
        fc.property(
          // Generate players with valid data
          fc.array(
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
              firstName: fc.string({ minLength: 1, maxLength: 15 }).filter(s => s.trim().length > 0),
              lastName: fc.string({ minLength: 1, maxLength: 15 }).filter(s => s.trim().length > 0),
              handedness: fc.constantFrom('left', 'right') as fc.Arbitrary<Handedness>,
              timePreference: fc.constantFrom('AM', 'PM', 'Either') as fc.Arbitrary<TimePreference>,
              seasonId: fc.constant('test-season')
            }),
            { minLength: 2, maxLength: 8 }
          ),
          // Generate availability data
          fc.dictionary(
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            fc.boolean(),
            { maxKeys: 10 }
          ),
          (playerData, availabilityData) => {
            // Create players from generated data
            const players = playerData.map(data => new PlayerModel(data));
            
            // Create week with generated availability data
            const week = new WeekModel({
              seasonId: 'test-season',
              weekNumber: 1,
              date: new Date(),
              playerAvailability: availabilityData
            });

            // Create a schedule with some players (mix of available and unavailable)
            const schedule = new ScheduleModel({ weekId: 'week1' });
            
            // Add players to schedule (some may be unavailable)
            if (players.length >= 2) {
              const foursome = new FoursomeModel({
                players: players.slice(0, Math.min(4, players.length)),
                timeSlot: 'morning',
                position: 0
              });
              schedule.addFoursome(foursome);
            }

            // Validate schedule availability
            const result = generator.validateScheduleAvailability(schedule, week, players);
            const scheduledPlayerIds = schedule.getAllPlayers();

            // Property 1: All conflicts should be correctly identified
            const expectedConflicts = scheduledPlayerIds.filter(playerId => {
              const hasData = week.hasAvailabilityData(playerId);
              const isAvailable = week.isPlayerAvailable(playerId);
              return !hasData || !isAvailable;
            });

            expect(result.conflicts.length).toBe(expectedConflicts.length);

            // Property 2: Each conflict should have correct data
            for (const conflict of result.conflicts) {
              expect(scheduledPlayerIds).toContain(conflict.playerId);
              const player = players.find(p => p.id === conflict.playerId);
              if (player) {
                expect(conflict.playerName).toBe(`${player.firstName} ${player.lastName}`);
              }
            }

            // Property 3: Validation result should match conflict count
            expect(result.isValid).toBe(result.conflicts.length === 0);
            expect(result.isValid).toBe(result.errors.length === 0);

            // Property 4: All scheduled players should be validated
            for (const playerId of scheduledPlayerIds) {
              const hasData = week.hasAvailabilityData(playerId);
              const isAvailable = week.isPlayerAvailable(playerId);
              
              if (!hasData || !isAvailable) {
                expect(result.conflicts.some(c => c.playerId === playerId)).toBe(true);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('Property: Enhanced validateSchedule with week parameter detects all violations', () => {
      fc.assert(
        fc.property(
          // Generate players
          fc.array(
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
              firstName: fc.string({ minLength: 1, maxLength: 15 }).filter(s => s.trim().length > 0),
              lastName: fc.string({ minLength: 1, maxLength: 15 }).filter(s => s.trim().length > 0),
              handedness: fc.constantFrom('left', 'right') as fc.Arbitrary<Handedness>,
              timePreference: fc.constantFrom('AM', 'PM', 'Either') as fc.Arbitrary<TimePreference>,
              seasonId: fc.constant('test-season')
            }),
            { minLength: 1, maxLength: 6 }
          ),
          // Generate availability data
          fc.dictionary(
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            fc.boolean(),
            { maxKeys: 8 }
          ),
          (playerData, availabilityData) => {
            // Create players from generated data
            const players = playerData.map(data => new PlayerModel(data));
            
            // Create week with generated availability data
            const week = new WeekModel({
              seasonId: 'test-season',
              weekNumber: 1,
              date: new Date(),
              playerAvailability: availabilityData
            });

            // Filter available players using the generator
            const availablePlayers = generator.filterAvailablePlayers(players, week);

            // Create a schedule with available players
            const schedule = new ScheduleModel({ weekId: 'week1' });
            
            if (availablePlayers.length > 0) {
              const foursome = new FoursomeModel({
                players: availablePlayers.slice(0, Math.min(4, availablePlayers.length)),
                timeSlot: 'morning',
                position: 0
              });
              schedule.addFoursome(foursome);
            }

            // Validate schedule with week parameter
            const result = generator.validateSchedule(schedule, availablePlayers, week);

            // Property: Schedule with only available players should be valid
            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);

            // Property: All scheduled players should be available
            const scheduledPlayerIds = schedule.getAllPlayers();
            for (const playerId of scheduledPlayerIds) {
              expect(week.isPlayerAvailable(playerId)).toBe(true);
              expect(availablePlayers.some(p => p.id === playerId)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('Property: Validation errors are deterministic and comprehensive', () => {
      fc.assert(
        fc.property(
          // Generate availability scenarios
          fc.record({
            p1: fc.boolean(),
            p2: fc.boolean(),
            p3: fc.boolean()
          }),
          (availability) => {
            // Create players with compatible time preferences for morning slot
            const players = [
              new PlayerModel({ id: 'p1', firstName: 'Player', lastName: 'One', handedness: 'right', timePreference: 'AM', seasonId: 'test-season' }),
              new PlayerModel({ id: 'p2', firstName: 'Player', lastName: 'Two', handedness: 'left', timePreference: 'Either', seasonId: 'test-season' }),
              new PlayerModel({ id: 'p3', firstName: 'Player', lastName: 'Three', handedness: 'right', timePreference: 'Either', seasonId: 'test-season' })
            ];
            
            // Create week with availability
            const week = new WeekModel({
              seasonId: 'test-season',
              weekNumber: 1,
              date: new Date(),
              playerAvailability: availability
            });

            // Create schedule with all players in morning (no time preference conflicts)
            const schedule = new ScheduleModel({ weekId: 'week1' });
            const foursome = new FoursomeModel({
              players: players,
              timeSlot: 'morning',
              position: 0
            });
            schedule.addFoursome(foursome);

            // Validate multiple times
            const result1 = generator.validateSchedule(schedule, players, week);
            const result2 = generator.validateSchedule(schedule, players, week);
            const result3 = generator.validateScheduleAvailability(schedule, week, players);

            // Property: Results should be deterministic
            expect(result1.isValid).toBe(result2.isValid);
            expect(result1.errors.length).toBe(result2.errors.length);
            expect(result1.isValid).toBe(result3.isValid);

            // Property: Validation should be comprehensive
            const unavailablePlayers = Object.entries(availability)
              .filter(([_, available]) => !available)
              .map(([playerId, _]) => playerId);

            if (unavailablePlayers.length > 0) {
              expect(result1.isValid).toBe(false);
              expect(result3.isValid).toBe(false);
              expect(result3.conflicts.length).toBe(unavailablePlayers.length);
            } else {
              expect(result1.isValid).toBe(true);
              expect(result3.isValid).toBe(true);
              expect(result3.conflicts.length).toBe(0);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});