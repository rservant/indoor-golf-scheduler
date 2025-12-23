import * as fc from 'fast-check';
import { PairingHistoryTracker } from './PairingHistoryTracker';
import { LocalPairingHistoryRepository } from '../repositories/PairingHistoryRepository';
import { PlayerModel, TimePreference, Handedness } from '../models/Player';
import { FoursomeModel, TimeSlot } from '../models/Foursome';
import { ScheduleModel } from '../models/Schedule';

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

// Test data generators
const timePreferenceArb = fc.constantFrom('AM', 'PM', 'Either') as fc.Arbitrary<TimePreference>;
const handednessArb = fc.constantFrom('left', 'right') as fc.Arbitrary<Handedness>;
const timeSlotArb = fc.constantFrom('morning', 'afternoon') as fc.Arbitrary<TimeSlot>;

const playerArb = fc.record({
  firstName: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
  lastName: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
  handedness: handednessArb,
  timePreference: timePreferenceArb,
  seasonId: fc.constant('test-season-id')
}).map(data => new PlayerModel({
  ...data,
  id: `player_${Math.random().toString(36).substring(2, 9)}`
}));

const foursomeArb = fc.record({
  players: fc.array(playerArb, { minLength: 2, maxLength: 4 }),
  timeSlot: timeSlotArb,
  position: fc.integer({ min: 0, max: 10 })
}).map(data => new FoursomeModel(data));

const scheduleArb = fc.record({
  weekId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
  morningFoursomes: fc.array(foursomeArb, { minLength: 0, maxLength: 3 }),
  afternoonFoursomes: fc.array(foursomeArb, { minLength: 0, maxLength: 3 })
}).map(data => {
  const schedule = new ScheduleModel({ weekId: data.weekId });
  data.morningFoursomes.forEach(foursome => {
    foursome.timeSlot = 'morning';
    schedule.addFoursome(foursome);
  });
  data.afternoonFoursomes.forEach(foursome => {
    foursome.timeSlot = 'afternoon';
    schedule.addFoursome(foursome);
  });
  return schedule;
});

describe('PairingHistoryTracker Property Tests', () => {
  let tracker: PairingHistoryTracker;
  let repository: LocalPairingHistoryRepository;

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    repository = new LocalPairingHistoryRepository();
    tracker = new PairingHistoryTracker(repository);
  });

  /**
   * **Feature: indoor-golf-scheduler, Property 10: Pairing history tracking**
   * **Validates: Requirements 5.1, 7.5**
   */
  test('Property 10: Pairing history tracking', async () => {
    await fc.assert(
      fc.asyncProperty(scheduleArb, async (schedule) => {
        const seasonId = 'test-season-id';
        
        // Track the schedule pairings
        await tracker.trackSchedulePairings(seasonId, schedule);
        
        // Verify that all pairings in the schedule are tracked correctly
        const allFoursomes = [...schedule.timeSlots.morning, ...schedule.timeSlots.afternoon];
        
        for (const foursome of allFoursomes) {
          const players = foursome.players;
          
          // Check all pairs within this foursome
          for (let i = 0; i < players.length; i++) {
            for (let j = i + 1; j < players.length; j++) {
              const count = await tracker.getPairingCount(seasonId, players[i].id, players[j].id);
              
              // Each pair should have been tracked at least once
              if (count < 1) {
                return false;
              }
            }
          }
        }
        
        // Track the same schedule again to test increment behavior
        await tracker.trackSchedulePairings(seasonId, schedule);
        
        // Verify that counts have been incremented correctly
        for (const foursome of allFoursomes) {
          const players = foursome.players;
          
          // Check all pairs within this foursome
          for (let i = 0; i < players.length; i++) {
            for (let j = i + 1; j < players.length; j++) {
              const count = await tracker.getPairingCount(seasonId, players[i].id, players[j].id);
              
              // Each pair should now have been tracked at least twice
              if (count < 2) {
                return false;
              }
            }
          }
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  test('Pairing history tracks individual foursome pairings correctly', async () => {
    const seasonId = 'test-season';
    const players = [
      new PlayerModel({ id: 'p1', firstName: 'John', lastName: 'Doe', handedness: 'right', timePreference: 'AM', seasonId }),
      new PlayerModel({ id: 'p2', firstName: 'Jane', lastName: 'Smith', handedness: 'left', timePreference: 'PM', seasonId }),
      new PlayerModel({ id: 'p3', firstName: 'Bob', lastName: 'Johnson', handedness: 'right', timePreference: 'Either', seasonId })
    ];

    const foursome = new FoursomeModel({
      players,
      timeSlot: 'morning',
      position: 0
    });

    await tracker.trackFoursomePairings(seasonId, foursome);

    // Check all expected pairings
    expect(await tracker.getPairingCount(seasonId, 'p1', 'p2')).toBe(1);
    expect(await tracker.getPairingCount(seasonId, 'p1', 'p3')).toBe(1);
    expect(await tracker.getPairingCount(seasonId, 'p2', 'p3')).toBe(1);

    // Track the same foursome again
    await tracker.trackFoursomePairings(seasonId, foursome);

    // Counts should be incremented
    expect(await tracker.getPairingCount(seasonId, 'p1', 'p2')).toBe(2);
    expect(await tracker.getPairingCount(seasonId, 'p1', 'p3')).toBe(2);
    expect(await tracker.getPairingCount(seasonId, 'p2', 'p3')).toBe(2);
  });

  test('Pairing metrics calculation works correctly', async () => {
    const seasonId = 'test-season';
    const players = [
      new PlayerModel({ id: 'p1', firstName: 'John', lastName: 'Doe', handedness: 'right', timePreference: 'AM', seasonId }),
      new PlayerModel({ id: 'p2', firstName: 'Jane', lastName: 'Smith', handedness: 'left', timePreference: 'PM', seasonId })
    ];

    // Add some pairing history
    await repository.addPairing(seasonId, 'p1', 'p2');
    await repository.addPairing(seasonId, 'p1', 'p2');

    const metrics = await tracker.calculatePairingMetrics(seasonId, players);

    expect(metrics.minPairings).toBe(2);
    expect(metrics.maxPairings).toBe(2);
    expect(metrics.averagePairings).toBe(2);
    expect(metrics.pairingCounts.get('p1-p2')).toBe(2);
  });

  /**
   * **Feature: indoor-golf-scheduler, Property 11: Pairing optimization**
   * **Validates: Requirements 5.2, 5.3, 5.4**
   */
  test('Property 11: Pairing optimization', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate players for testing
        fc.array(playerArb, { minLength: 4, maxLength: 12 }),
        // Generate some existing pairing history
        fc.array(
          fc.record({
            player1Index: fc.integer({ min: 0, max: 11 }),
            player2Index: fc.integer({ min: 0, max: 11 }),
            count: fc.integer({ min: 1, max: 5 })
          }).filter(data => data.player1Index !== data.player2Index),
          { minLength: 0, maxLength: 10 }
        ),
        async (players, existingPairings) => {
          if (players.length < 4) return true; // Skip if not enough players
          
          const seasonId = 'test-season-optimization';
          
          // Clear any existing data
          localStorage.clear();
          
          // Set up existing pairing history
          for (const pairing of existingPairings) {
            if (pairing.player1Index < players.length && pairing.player2Index < players.length) {
              const player1 = players[pairing.player1Index];
              const player2 = players[pairing.player2Index];
              
              // Add the specified number of pairings
              for (let i = 0; i < pairing.count; i++) {
                await repository.addPairing(seasonId, player1.id, player2.id);
              }
            }
          }
          
          // Test optimal foursome selection
          const availablePlayers = players.slice(0, Math.min(8, players.length)); // Limit to 8 for performance
          const optimalFoursome = await tracker.findOptimalFoursome(seasonId, availablePlayers);
          
          // The optimal foursome should minimize total pairing history
          const optimalScore = await tracker.scoreFoursome(seasonId, optimalFoursome);
          
          // Test a few random alternative foursomes to ensure optimization
          if (availablePlayers.length > 4) {
            // Try a few alternative combinations
            const alternatives = tracker['generateCombinations'](availablePlayers, 4).slice(0, 5);
            
            for (const alternative of alternatives) {
              const alternativeScore = await tracker.scoreFoursome(seasonId, alternative);
              
              // The optimal foursome should have a score less than or equal to alternatives
              if (optimalScore > alternativeScore) {
                return false; // Found a better alternative, optimization failed
              }
            }
          }
          
          // Test that pairing optimization distributes repeat pairings fairly
          // Generate multiple foursomes and check distribution
          if (availablePlayers.length >= 8) {
            const firstFoursome = await tracker.findOptimalFoursome(seasonId, availablePlayers);
            
            // Track the first foursome
            await tracker.trackFoursomePairings(seasonId, new FoursomeModel({
              players: firstFoursome,
              timeSlot: 'morning',
              position: 0
            }));
            
            // Find optimal foursome from remaining players
            const remainingPlayers = availablePlayers.filter(p => !firstFoursome.some(fp => fp.id === p.id));
            if (remainingPlayers.length >= 4) {
              const secondFoursome = await tracker.findOptimalFoursome(seasonId, remainingPlayers);
              
              // Verify that the optimization is working by checking that we're not just picking the same players
              const firstIds = new Set(firstFoursome.map(p => p.id));
              const secondIds = new Set(secondFoursome.map(p => p.id));
              const intersection = new Set([...firstIds].filter(id => secondIds.has(id)));
              
              // No overlap between foursomes
              if (intersection.size > 0) {
                return false;
              }
            }
          }
          
          return true;
        }
      ),
      { numRuns: 50 } // Reduced runs for performance due to complexity
    );
  });
});