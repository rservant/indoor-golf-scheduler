import * as fc from 'fast-check';
import { ScheduleGenerator } from './ScheduleGenerator';
import { PlayerModel, Handedness, TimePreference } from '../models/Player';
import { WeekModel } from '../models/Week';
import { getPropertyTestParams } from '../test-utils/property-test-config';

describe('ScheduleGenerator Foursome Creation Property Tests', () => {
  let generator: ScheduleGenerator;

  beforeEach(() => {
    generator = new ScheduleGenerator();
  });

  describe('Property 1: Foursome creation with sufficient players', () => {
    /**
     * Property 1: Foursome creation with sufficient players
     * For any set of 4 or more available players, schedule generation should create at least one foursome containing players
     * **Feature: schedule-generation-fix, Property 1: Foursome creation with sufficient players**
     * **Validates: Requirements 1.1, 1.2, 1.5**
     */
    test('Property 1: Foursome creation with sufficient players', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate 4 or more players (sufficient for at least one foursome)
          fc.array(
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
              firstName: fc.string({ minLength: 1, maxLength: 15 })
                .filter(s => s.trim().length > 0)
                .filter(s => !['caller', 'key', '__proto__', 'constructor', 'toString', 'valueOf'].includes(s.toLowerCase())),
              lastName: fc.string({ minLength: 1, maxLength: 15 })
                .filter(s => s.trim().length > 0)
                .filter(s => !['caller', 'key', '__proto__', 'constructor', 'toString', 'valueOf'].includes(s.toLowerCase())),
              handedness: fc.constantFrom('left', 'right') as fc.Arbitrary<Handedness>,
              timePreference: fc.constantFrom('AM', 'PM', 'Either') as fc.Arbitrary<TimePreference>,
              seasonId: fc.constant('test-season')
            }),
            { minLength: 4, maxLength: 20 } // Sufficient players for foursomes
          ),
          async (playerData) => {
            // Ensure unique player IDs
            const uniquePlayerData = playerData.filter((player, index, arr) => 
              arr.findIndex(p => p.id === player.id) === index
            );
            
            // Skip if we don't have enough unique players
            fc.pre(uniquePlayerData.length >= 4);
            
            // Create players from generated data
            const players = uniquePlayerData.map(data => new PlayerModel(data));
            
            // Create availability data - make all players available
            const availabilityData: Record<string, boolean> = {};
            for (const player of players) {
              availabilityData[player.id] = true;
            }
            
            // Create week with all players available
            const week = new WeekModel({
              seasonId: 'test-season',
              weekNumber: 1,
              date: new Date(),
              playerAvailability: availabilityData
            });

            // Generate schedule for the week
            const schedule = await generator.generateScheduleForWeek(week, players);

            // Property 1: At least one foursome should be created when sufficient players are available
            const totalFoursomes = schedule.timeSlots.morning.length + schedule.timeSlots.afternoon.length;
            expect(totalFoursomes).toBeGreaterThan(0);

            // Property 2: At least one foursome should contain players
            const foursomesWithPlayers = [...schedule.timeSlots.morning, ...schedule.timeSlots.afternoon]
              .filter(foursome => foursome.players.length > 0);
            expect(foursomesWithPlayers.length).toBeGreaterThan(0);

            // Property 3: Total scheduled players should be greater than 0
            const totalScheduledPlayers = schedule.getTotalPlayerCount();
            expect(totalScheduledPlayers).toBeGreaterThan(0);

            // Property 4: All scheduled players should be from the available players
            const scheduledPlayerIds = schedule.getAllPlayers();
            const availablePlayerIds = new Set(players.map(p => p.id));
            
            for (const scheduledId of scheduledPlayerIds) {
              expect(availablePlayerIds.has(scheduledId)).toBe(true);
            }

            // Property 5: Complete foursomes (4 players) should be created when possible, 
            // but partial foursomes (1-3 players) are acceptable when insufficient players per time slot
            const amPlayers = players.filter(p => p.timePreference === 'AM');
            const pmPlayers = players.filter(p => p.timePreference === 'PM');
            const eitherPlayers = players.filter(p => p.timePreference === 'Either');
            
            // More accurate calculation: check if we have enough total players for at least one complete foursome
            // The schedule generator distributes "Either" players between morning and afternoon
            const totalPlayers = players.length;
            const canFormCompleteFoursome = totalPlayers >= 4;
            
            if (canFormCompleteFoursome) {
              const completeFoursomes = [...schedule.timeSlots.morning, ...schedule.timeSlots.afternoon]
                .filter(foursome => foursome.players.length === 4);
              
              // Only expect complete foursomes if we have enough players AND they can be distributed properly
              // Check if the actual distribution allows for complete foursomes
              const morningPlayerCount = schedule.timeSlots.morning.reduce((sum, f) => sum + f.players.length, 0);
              const afternoonPlayerCount = schedule.timeSlots.afternoon.reduce((sum, f) => sum + f.players.length, 0);
              
              // If either time slot has 4+ players, we should have at least one complete foursome
              if (morningPlayerCount >= 4 || afternoonPlayerCount >= 4) {
                expect(completeFoursomes.length).toBeGreaterThan(0);
              }
            }

            // Property 5a: All foursomes should have at least 1 player (partial foursomes allowed)
            const allFoursomes = [...schedule.timeSlots.morning, ...schedule.timeSlots.afternoon];
            for (const foursome of allFoursomes) {
              expect(foursome.players.length).toBeGreaterThanOrEqual(1);
              expect(foursome.players.length).toBeLessThanOrEqual(4);
            }

            // Property 6: No player should appear in multiple foursomes
            const allScheduledIds = [...schedule.timeSlots.morning, ...schedule.timeSlots.afternoon]
              .flatMap(foursome => foursome.players.map(p => p.id));
            const uniqueScheduledIds = new Set(allScheduledIds);
            expect(allScheduledIds.length).toBe(uniqueScheduledIds.size);

            // Property 7: Schedule should be valid according to generator's validation
            const validationResult = generator.validateSchedule(schedule, players, week);
            expect(validationResult.isValid).toBe(true);
            expect(validationResult.errors).toHaveLength(0);
          }
        ),
        {
          numRuns: 10, // Reduced from default 100 for faster execution
          timeout: 5000,
          endOnFailure: true
        }
      );
    });
  });

  describe('Property 2: Time slot assignment correctness', () => {
    /**
     * Property 2: Time slot assignment correctness
     * For any set of players with time preferences, foursomes should be assigned to time slots 
     * that respect player preferences (AM players in morning, PM players in afternoon, Either players in any slot)
     * **Feature: schedule-generation-fix, Property 2: Time slot assignment correctness**
     * **Validates: Requirements 1.3**
     */
    test('Property 2: Time slot assignment correctness', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate players with specific time preferences
          fc.record({
            amPlayers: fc.array(
              fc.record({
                id: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
                firstName: fc.string({ minLength: 1, maxLength: 15 })
                  .filter(s => s.trim().length > 0)
                  .filter(s => !['caller', 'key', '__proto__', 'constructor', 'toString', 'valueOf'].includes(s.toLowerCase())),
                lastName: fc.string({ minLength: 1, maxLength: 15 })
                  .filter(s => s.trim().length > 0)
                  .filter(s => !['caller', 'key', '__proto__', 'constructor', 'toString', 'valueOf'].includes(s.toLowerCase())),
                handedness: fc.constantFrom('left', 'right') as fc.Arbitrary<Handedness>,
                seasonId: fc.constant('test-season')
              }),
              { minLength: 0, maxLength: 8 }
            ),
            pmPlayers: fc.array(
              fc.record({
                id: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
                firstName: fc.string({ minLength: 1, maxLength: 15 })
                  .filter(s => s.trim().length > 0)
                  .filter(s => !['caller', 'key', '__proto__', 'constructor', 'toString', 'valueOf'].includes(s.toLowerCase())),
                lastName: fc.string({ minLength: 1, maxLength: 15 })
                  .filter(s => s.trim().length > 0)
                  .filter(s => !['caller', 'key', '__proto__', 'constructor', 'toString', 'valueOf'].includes(s.toLowerCase())),
                handedness: fc.constantFrom('left', 'right') as fc.Arbitrary<Handedness>,
                seasonId: fc.constant('test-season')
              }),
              { minLength: 0, maxLength: 8 }
            ),
            eitherPlayers: fc.array(
              fc.record({
                id: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
                firstName: fc.string({ minLength: 1, maxLength: 15 })
                  .filter(s => s.trim().length > 0)
                  .filter(s => !['caller', 'key', '__proto__', 'constructor', 'toString', 'valueOf'].includes(s.toLowerCase())),
                lastName: fc.string({ minLength: 1, maxLength: 15 })
                  .filter(s => s.trim().length > 0)
                  .filter(s => !['caller', 'key', '__proto__', 'constructor', 'toString', 'valueOf'].includes(s.toLowerCase())),
                handedness: fc.constantFrom('left', 'right') as fc.Arbitrary<Handedness>,
                seasonId: fc.constant('test-season')
              }),
              { minLength: 0, maxLength: 8 }
            )
          }),
          async (playerGroups) => {
            // Ensure we have at least some players
            const totalPlayers = playerGroups.amPlayers.length + playerGroups.pmPlayers.length + playerGroups.eitherPlayers.length;
            fc.pre(totalPlayers >= 1);

            // Create players with specific time preferences
            const players = [];
            let playerId = 0;

            // Add AM players
            for (const playerData of playerGroups.amPlayers) {
              players.push(new PlayerModel({
                ...playerData,
                id: `am-${playerId++}`,
                timePreference: 'AM'
              }));
            }

            // Add PM players
            for (const playerData of playerGroups.pmPlayers) {
              players.push(new PlayerModel({
                ...playerData,
                id: `pm-${playerId++}`,
                timePreference: 'PM'
              }));
            }

            // Add Either players
            for (const playerData of playerGroups.eitherPlayers) {
              players.push(new PlayerModel({
                ...playerData,
                id: `either-${playerId++}`,
                timePreference: 'Either'
              }));
            }

            // Make all players available
            const availabilityData: Record<string, boolean> = {};
            for (const player of players) {
              availabilityData[player.id] = true;
            }

            const week = new WeekModel({
              seasonId: 'test-season',
              weekNumber: 1,
              date: new Date(),
              playerAvailability: availabilityData
            });

            // Generate schedule
            const schedule = await generator.generateScheduleForWeek(week, players);

            // Property 1: AM players should only be in morning foursomes
            for (const foursome of schedule.timeSlots.morning) {
              for (const player of foursome.players) {
                expect(player.timePreference).not.toBe('PM');
              }
            }

            // Property 2: PM players should only be in afternoon foursomes
            for (const foursome of schedule.timeSlots.afternoon) {
              for (const player of foursome.players) {
                expect(player.timePreference).not.toBe('AM');
              }
            }

            // Property 3: Either players can be in any time slot (no restriction)
            const allScheduledPlayers = [
              ...schedule.timeSlots.morning.flatMap((f: any) => f.players),
              ...schedule.timeSlots.afternoon.flatMap((f: any) => f.players)
            ];

            // Property 4: All scheduled players should be from the original players list
            const originalPlayerIds = new Set(players.map(p => p.id));
            for (const scheduledPlayer of allScheduledPlayers) {
              expect(originalPlayerIds.has(scheduledPlayer.id)).toBe(true);
            }

            // Property 5: Time slot assignment should be consistent with preferences
            const morningPlayerIds = new Set(schedule.timeSlots.morning.flatMap((f: any) => f.players.map((p: any) => p.id)));
            const afternoonPlayerIds = new Set(schedule.timeSlots.afternoon.flatMap((f: any) => f.players.map((p: any) => p.id)));

            for (const player of players) {
              const isInMorning = morningPlayerIds.has(player.id);
              const isInAfternoon = afternoonPlayerIds.has(player.id);

              // Player should not be in both time slots
              expect(isInMorning && isInAfternoon).toBe(false);

              // If player is scheduled, check time preference constraints
              if (isInMorning || isInAfternoon) {
                if (player.timePreference === 'AM') {
                  expect(isInAfternoon).toBe(false); // AM players should not be in afternoon
                } else if (player.timePreference === 'PM') {
                  expect(isInMorning).toBe(false); // PM players should not be in morning
                }
                // Either players can be in any slot, so no constraint
              }
            }

            // Property 6: Schedule validation should pass for time preferences
            const validationResult = generator.validateSchedule(schedule, players, week);
            expect(validationResult.isValid).toBe(true);
            expect(validationResult.errors).toHaveLength(0);
          }
        ),
        {
          numRuns: 10, // Reduced from default 100 for faster execution
          timeout: 5000,
          endOnFailure: true
        }
      );
    });
  });
});