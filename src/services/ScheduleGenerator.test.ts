import * as fc from 'fast-check';
import { ScheduleGenerator } from './ScheduleGenerator';
import { PlayerModel, TimePreference, Handedness } from '../models/Player';
import { WeekModel } from '../models/Week';

// Test data generators
const timePreferenceArb = fc.constantFrom('AM', 'PM', 'Either') as fc.Arbitrary<TimePreference>;
const handednessArb = fc.constantFrom('left', 'right') as fc.Arbitrary<Handedness>;

const playerArb = fc.record({
  firstName: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
  lastName: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
  handedness: handednessArb,
  timePreference: timePreferenceArb,
  seasonId: fc.constant('test-season-id')
}).map(data => new PlayerModel({
  ...data,
  id: `player_${Math.random().toString(36).substr(2, 9)}`
}));

const playersArb = fc.array(playerArb, { minLength: 0, maxLength: 20 });

// Week availability generator
const weekAvailabilityArb = (players: PlayerModel[]) => {
  return fc.record(
    Object.fromEntries(
      players.map(player => [
        player.id,
        fc.boolean()
      ])
    )
  );
};

describe('ScheduleGenerator Property Tests', () => {
  let generator: ScheduleGenerator;

  beforeEach(() => {
    generator = new ScheduleGenerator();
  });

  /**
   * **Feature: indoor-golf-scheduler, Property 5: Schedule completeness and uniqueness**
   * **Validates: Requirements 3.1, 3.5**
   */
  test('Property 5: Schedule completeness and uniqueness', async () => {
    await fc.assert(
      fc.asyncProperty(playersArb, async (availablePlayers) => {
        const weekId = 'test-week-id';
        const schedule = await generator.generateSchedule(weekId, availablePlayers);

        // Get all scheduled player IDs
        const scheduledPlayerIds = schedule.getAllPlayers();
        const availablePlayerIds = availablePlayers.map(p => p.id);

        // Completeness: All available players should be scheduled
        const scheduledSet = new Set(scheduledPlayerIds);
        
        for (const playerId of availablePlayerIds) {
          if (!scheduledSet.has(playerId)) {
            return false; // Player not scheduled
          }
        }

        // Uniqueness: Each player should appear exactly once
        const playerCounts = new Map<string, number>();
        [...schedule.timeSlots.morning, ...schedule.timeSlots.afternoon].forEach(foursome => {
          foursome.players.forEach(player => {
            const count = playerCounts.get(player.id) || 0;
            playerCounts.set(player.id, count + 1);
          });
        });

        for (const count of playerCounts.values()) {
          if (count !== 1) {
            return false; // Player appears more than once
          }
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: indoor-golf-scheduler, Property 6: Time preference respect**
   * **Validates: Requirements 3.2, 6.1**
   */
  test('Property 6: Time preference respect', async () => {
    await fc.assert(
      fc.asyncProperty(playersArb, async (availablePlayers) => {
        const weekId = 'test-week-id';
        const schedule = await generator.generateSchedule(weekId, availablePlayers);

        // Check that AM preference players are only in morning slots
        for (const foursome of schedule.timeSlots.morning) {
          for (const player of foursome.players) {
            if (player.timePreference === 'PM') {
              return false; // PM player in morning slot
            }
          }
        }

        // Check that PM preference players are only in afternoon slots
        for (const foursome of schedule.timeSlots.afternoon) {
          for (const player of foursome.players) {
            if (player.timePreference === 'AM') {
              return false; // AM player in afternoon slot
            }
          }
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: indoor-golf-scheduler, Property 7: Foursome prioritization**
   * **Validates: Requirements 3.3, 6.3, 6.4**
   */
  test('Property 7: Foursome prioritization', async () => {
    await fc.assert(
      fc.asyncProperty(playersArb, async (availablePlayers) => {
        const weekId = 'test-week-id';
        const schedule = await generator.generateSchedule(weekId, availablePlayers);

        // The algorithm should maximize complete foursomes within each time slot
        // Check morning time slot
        const morningFoursomes = schedule.timeSlots.morning;
        let morningCompleteFoursomes = 0;
        let morningIncompleteFoursomes = 0;
        let morningTotalPlayers = 0;

        morningFoursomes.forEach(foursome => {
          morningTotalPlayers += foursome.players.length;
          if (foursome.players.length === 4) {
            morningCompleteFoursomes++;
          } else if (foursome.players.length > 0) {
            morningIncompleteFoursomes++;
          }
        });

        // Check afternoon time slot
        const afternoonFoursomes = schedule.timeSlots.afternoon;
        let afternoonCompleteFoursomes = 0;
        let afternoonIncompleteFoursomes = 0;
        let afternoonTotalPlayers = 0;

        afternoonFoursomes.forEach(foursome => {
          afternoonTotalPlayers += foursome.players.length;
          if (foursome.players.length === 4) {
            afternoonCompleteFoursomes++;
          } else if (foursome.players.length > 0) {
            afternoonIncompleteFoursomes++;
          }
        });

        // For each time slot, verify optimal foursome formation
        // Morning slot should have maximum complete foursomes
        const expectedMorningComplete = Math.floor(morningTotalPlayers / 4);
        const expectedMorningRemaining = morningTotalPlayers % 4;
        
        if (morningCompleteFoursomes !== expectedMorningComplete) {
          return false;
        }
        
        if (expectedMorningRemaining > 0) {
          if (morningIncompleteFoursomes !== 1) {
            return false;
          }
        } else {
          if (morningIncompleteFoursomes !== 0) {
            return false;
          }
        }

        // Afternoon slot should have maximum complete foursomes
        const expectedAfternoonComplete = Math.floor(afternoonTotalPlayers / 4);
        const expectedAfternoonRemaining = afternoonTotalPlayers % 4;
        
        if (afternoonCompleteFoursomes !== expectedAfternoonComplete) {
          return false;
        }
        
        if (expectedAfternoonRemaining > 0) {
          if (afternoonIncompleteFoursomes !== 1) {
            return false;
          }
        } else {
          if (afternoonIncompleteFoursomes !== 0) {
            return false;
          }
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: indoor-golf-scheduler, Property 8: Either preference balancing**
   * **Validates: Requirements 3.4, 6.2**
   */
  test('Property 8: Either preference balancing', async () => {
    await fc.assert(
      fc.asyncProperty(playersArb, async (availablePlayers) => {
        const weekId = 'test-week-id';
        const schedule = await generator.generateSchedule(weekId, availablePlayers);

        // Count players by preference in the original input
        const amPlayers = availablePlayers.filter(p => p.timePreference === 'AM');
        const pmPlayers = availablePlayers.filter(p => p.timePreference === 'PM');
        const eitherPlayers = availablePlayers.filter(p => p.timePreference === 'Either');

        // Count players in each time slot in the schedule
        let morningPlayerCount = 0;
        let afternoonPlayerCount = 0;

        schedule.timeSlots.morning.forEach(foursome => {
          morningPlayerCount += foursome.players.length;
        });

        schedule.timeSlots.afternoon.forEach(foursome => {
          afternoonPlayerCount += foursome.players.length;
        });

        // Debug for failing case
        // if (amPlayers.length === 2 && pmPlayers.length === 0 && eitherPlayers.length === 3) {
        //   console.log('Debug case: 2 AM, 0 PM, 3 Either');
        //   console.log('Morning players:', morningPlayerCount);
        //   console.log('Afternoon players:', afternoonPlayerCount);
        //   console.log('Original imbalance:', Math.abs(amPlayers.length - pmPlayers.length));
        //   console.log('Final imbalance:', Math.abs(morningPlayerCount - afternoonPlayerCount));
        // }

        // If there are no "Either" players, balancing doesn't apply
        if (eitherPlayers.length === 0) {
          return true;
        }

        // If there are "Either" players and an imbalance in AM/PM preferences,
        // the "Either" players should help balance the time slots
        const originalImbalance = Math.abs(amPlayers.length - pmPlayers.length);
        const finalImbalance = Math.abs(morningPlayerCount - afternoonPlayerCount);

        // The final imbalance should be less than or equal to the original imbalance
        // (Either players should help reduce imbalance)
        if (originalImbalance > 0 && eitherPlayers.length > 0) {
          // The balancing should improve or maintain the balance
          return finalImbalance <= originalImbalance;
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: indoor-golf-scheduler, Property 9: Availability filtering**
   * **Validates: Requirements 4.1, 4.3**
   */
  test('Property 9: Availability filtering', async () => {
    await fc.assert(
      fc.asyncProperty(playersArb, async (allPlayers) => {
        if (allPlayers.length === 0) {
          return true; // Skip empty player sets
        }

        const weekId = 'test-week-id';
        const seasonId = allPlayers[0].seasonId;
        
        // Generate random availability for each player
        const availability = await fc.sample(weekAvailabilityArb(allPlayers), 1)[0];
        
        // Create a week with the availability data
        const week = new WeekModel({
          seasonId,
          weekNumber: 1,
          date: new Date(),
          playerAvailability: availability
        });

        // Filter to only available players
        const availablePlayers = allPlayers.filter(player => 
          week.isPlayerAvailable(player.id)
        );

        // Generate schedule with available players
        const schedule = await generator.generateSchedule(weekId, availablePlayers);

        // Get all scheduled player IDs
        const scheduledPlayerIds = schedule.getAllPlayers();

        // Verify that only available players are scheduled
        for (const playerId of scheduledPlayerIds) {
          if (!week.isPlayerAvailable(playerId)) {
            return false; // Unavailable player was scheduled
          }
        }

        // Verify that all scheduled players were in the available players list
        const availablePlayerIds = new Set(availablePlayers.map(p => p.id));
        for (const playerId of scheduledPlayerIds) {
          if (!availablePlayerIds.has(playerId)) {
            return false; // Player not in available list was scheduled
          }
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });
});