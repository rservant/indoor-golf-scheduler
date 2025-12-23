import { ScheduleGenerator } from './ScheduleGenerator';
import { PairingHistoryTracker } from './PairingHistoryTracker';
import { LocalPairingHistoryRepository } from '../repositories/PairingHistoryRepository';
import { PlayerModel } from '../models/Player';

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

describe('Pairing Optimization Integration Tests', () => {
  let tracker: PairingHistoryTracker;
  let repository: LocalPairingHistoryRepository;

  beforeEach(() => {
    localStorage.clear();
    repository = new LocalPairingHistoryRepository();
    tracker = new PairingHistoryTracker(repository);
  });

  test('Schedule generation with pairing optimization reduces repeat pairings', async () => {
    const seasonId = 'test-season';
    
    // Create 8 players for testing
    const players = [
      new PlayerModel({ id: 'p1', firstName: 'John', lastName: 'Doe', handedness: 'right', timePreference: 'Either', seasonId }),
      new PlayerModel({ id: 'p2', firstName: 'Jane', lastName: 'Smith', handedness: 'left', timePreference: 'Either', seasonId }),
      new PlayerModel({ id: 'p3', firstName: 'Bob', lastName: 'Johnson', handedness: 'right', timePreference: 'Either', seasonId }),
      new PlayerModel({ id: 'p4', firstName: 'Alice', lastName: 'Brown', handedness: 'left', timePreference: 'Either', seasonId }),
      new PlayerModel({ id: 'p5', firstName: 'Charlie', lastName: 'Wilson', handedness: 'right', timePreference: 'Either', seasonId }),
      new PlayerModel({ id: 'p6', firstName: 'Diana', lastName: 'Davis', handedness: 'left', timePreference: 'Either', seasonId }),
      new PlayerModel({ id: 'p7', firstName: 'Eve', lastName: 'Miller', handedness: 'right', timePreference: 'Either', seasonId }),
      new PlayerModel({ id: 'p8', firstName: 'Frank', lastName: 'Garcia', handedness: 'left', timePreference: 'Either', seasonId })
    ];

    // Add some initial pairing history to create bias
    await repository.addPairing(seasonId, 'p1', 'p2');
    await repository.addPairing(seasonId, 'p1', 'p2'); // p1-p2 paired twice
    await repository.addPairing(seasonId, 'p3', 'p4');
    await repository.addPairing(seasonId, 'p3', 'p4'); // p3-p4 paired twice

    // Test the optimization directly
    const optimalFoursome = await tracker.findOptimalFoursome(seasonId, players);
    const optimalScore = await tracker.scoreFoursome(seasonId, optimalFoursome);
    
    // The optimal foursome should not include both p1-p2 or both p3-p4
    const optimalIds = optimalFoursome.map(p => p.id);
    const hasP1P2 = optimalIds.includes('p1') && optimalIds.includes('p2');
    const hasP3P4 = optimalIds.includes('p3') && optimalIds.includes('p4');
    
    // At least one of the heavily paired combinations should be avoided
    expect(hasP1P2 && hasP3P4).toBe(false);
    
    // The optimal score should be lower than a foursome with both heavy pairings
    const heavyFoursome = [players[0], players[1], players[2], players[3]]; // p1, p2, p3, p4
    const heavyScore = await tracker.scoreFoursome(seasonId, heavyFoursome);
    
    expect(optimalScore).toBeLessThanOrEqual(heavyScore);

    // Verify that pairing history is being tracked
    const metrics = await tracker.calculatePairingMetrics(seasonId, players);
    expect(metrics.maxPairings).toBeGreaterThan(0);
  });

  test('Schedule generation without optimization has more repeat pairings', async () => {
    const seasonId = 'test-season-no-opt';
    
    // Create generator without optimization
    const generatorNoOpt = new ScheduleGenerator({ optimizePairings: false });
    
    // Create 8 players for testing
    const players = [
      new PlayerModel({ id: 'p1', firstName: 'John', lastName: 'Doe', handedness: 'right', timePreference: 'Either', seasonId }),
      new PlayerModel({ id: 'p2', firstName: 'Jane', lastName: 'Smith', handedness: 'left', timePreference: 'Either', seasonId }),
      new PlayerModel({ id: 'p3', firstName: 'Bob', lastName: 'Johnson', handedness: 'right', timePreference: 'Either', seasonId }),
      new PlayerModel({ id: 'p4', firstName: 'Alice', lastName: 'Brown', handedness: 'left', timePreference: 'Either', seasonId }),
      new PlayerModel({ id: 'p5', firstName: 'Charlie', lastName: 'Wilson', handedness: 'right', timePreference: 'Either', seasonId }),
      new PlayerModel({ id: 'p6', firstName: 'Diana', lastName: 'Davis', handedness: 'left', timePreference: 'Either', seasonId }),
      new PlayerModel({ id: 'p7', firstName: 'Eve', lastName: 'Miller', handedness: 'right', timePreference: 'Either', seasonId }),
      new PlayerModel({ id: 'p8', firstName: 'Frank', lastName: 'Garcia', handedness: 'left', timePreference: 'Either', seasonId })
    ];

    // Generate schedules without optimization
    const week1Schedule = await generatorNoOpt.generateSchedule('week1', players, seasonId);
    const week2Schedule = await generatorNoOpt.generateSchedule('week2', players, seasonId);
    
    // Extract pairings from both weeks
    const week1Pairings = new Set<string>();
    const week2Pairings = new Set<string>();

    [...week1Schedule.timeSlots.morning, ...week1Schedule.timeSlots.afternoon].forEach(foursome => {
      for (let i = 0; i < foursome.players.length; i++) {
        for (let j = i + 1; j < foursome.players.length; j++) {
          const key = foursome.players[i].id < foursome.players[j].id 
            ? `${foursome.players[i].id}-${foursome.players[j].id}`
            : `${foursome.players[j].id}-${foursome.players[i].id}`;
          week1Pairings.add(key);
        }
      }
    });

    [...week2Schedule.timeSlots.morning, ...week2Schedule.timeSlots.afternoon].forEach(foursome => {
      for (let i = 0; i < foursome.players.length; i++) {
        for (let j = i + 1; j < foursome.players.length; j++) {
          const key = foursome.players[i].id < foursome.players[j].id 
            ? `${foursome.players[i].id}-${foursome.players[j].id}`
            : `${foursome.players[j].id}-${foursome.players[i].id}`;
          week2Pairings.add(key);
        }
      }
    });

    // Without optimization, we expect the same pairings (100% overlap)
    // since the algorithm is deterministic
    const overlap = new Set([...week1Pairings].filter(pairing => week2Pairings.has(pairing)));
    const overlapPercentage = overlap.size / week1Pairings.size;

    // Without optimization, we should have 100% overlap
    expect(overlapPercentage).toBe(1.0);
  });
});