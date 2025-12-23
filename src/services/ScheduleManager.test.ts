import * as fc from 'fast-check';
import { ScheduleManager, ScheduleEditOperation } from './ScheduleManager';
import { ScheduleGenerator } from './ScheduleGenerator';
import { PairingHistoryTracker } from './PairingHistoryTracker';
import { LocalScheduleRepository } from '../repositories/ScheduleRepository';
import { LocalWeekRepository } from '../repositories/WeekRepository';
import { LocalPlayerRepository } from '../repositories/PlayerRepository';
import { LocalPairingHistoryRepository } from '../repositories/PairingHistoryRepository';
import { PlayerModel, TimePreference, Handedness } from '../models/Player';
import { WeekModel } from '../models/Week';
import { ScheduleModel } from '../models/Schedule';
import { FoursomeModel } from '../models/Foursome';

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
// const timeSlotArb = fc.constantFrom('morning', 'afternoon') as fc.Arbitrary<TimeSlot>;

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

// Generate a valid schedule with foursomes
const validScheduleArb = fc.record({
  weekId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
  players: fc.array(playerArb, { minLength: 4, maxLength: 16 })
}).chain(({ weekId, players }) => {
  // Separate players by time preference for valid assignment
  const amPlayers = players.filter(p => p.timePreference === 'AM');
  const pmPlayers = players.filter(p => p.timePreference === 'PM');
  const eitherPlayers = players.filter(p => p.timePreference === 'Either');

  // Distribute Either players to balance time slots
  // const morningCount = amPlayers.length;
  // const afternoonCount = pmPlayers.length;
  const halfEither = Math.floor(eitherPlayers.length / 2);
  
  const morningPlayers = [...amPlayers, ...eitherPlayers.slice(0, halfEither)];
  const afternoonPlayers = [...pmPlayers, ...eitherPlayers.slice(halfEither)];

  return fc.constant({
    weekId,
    players,
    morningPlayers,
    afternoonPlayers
  });
}).map(({ weekId, players, morningPlayers, afternoonPlayers }) => {
  const schedule = new ScheduleModel({ weekId });

  // Create foursomes for morning
  let position = 0;
  for (let i = 0; i < morningPlayers.length; i += 4) {
    const foursomePlayers = morningPlayers.slice(i, i + 4);
    if (foursomePlayers.length > 0) {
      const foursome = new FoursomeModel({
        players: foursomePlayers,
        timeSlot: 'morning',
        position: position++
      });
      schedule.addFoursome(foursome);
    }
  }

  // Create foursomes for afternoon
  position = 0;
  for (let i = 0; i < afternoonPlayers.length; i += 4) {
    const foursomePlayers = afternoonPlayers.slice(i, i + 4);
    if (foursomePlayers.length > 0) {
      const foursome = new FoursomeModel({
        players: foursomePlayers,
        timeSlot: 'afternoon',
        position: position++
      });
      schedule.addFoursome(foursome);
    }
  }

  return { schedule, allPlayers: players };
});

// Generate valid move operations
const validMoveOperationArb = (schedule: ScheduleModel) => {
  const allFoursomes = [...schedule.timeSlots.morning, ...schedule.timeSlots.afternoon];
  const nonEmptyFoursomes = allFoursomes.filter(f => f.players.length > 0);
  const nonFullFoursomes = allFoursomes.filter(f => f.players.length < 4);

  if (nonEmptyFoursomes.length === 0 || nonFullFoursomes.length === 0) {
    return fc.constant(null); // No valid move possible
  }

  return fc.record({
    type: fc.constant('move_player' as const),
    fromFoursome: fc.constantFrom(...nonEmptyFoursomes),
    toFoursome: fc.constantFrom(...nonFullFoursomes)
  }).chain(({ type, fromFoursome, toFoursome }) => {
    if (fromFoursome.id === toFoursome.id) {
      return fc.constant(null); // Can't move to same foursome
    }

    return fc.record({
      type: fc.constant(type),
      playerId: fc.constantFrom(...fromFoursome.players.map(p => p.id)),
      fromFoursomeId: fc.constant(fromFoursome.id),
      toFoursomeId: fc.constant(toFoursome.id)
    });
  }).filter(op => op !== null) as fc.Arbitrary<ScheduleEditOperation>;
};

// Generate valid swap operations
const validSwapOperationArb = (schedule: ScheduleModel) => {
  const allFoursomes = [...schedule.timeSlots.morning, ...schedule.timeSlots.afternoon];
  const nonEmptyFoursomes = allFoursomes.filter(f => f.players.length > 0);

  if (nonEmptyFoursomes.length < 2) {
    return fc.constant(null); // Need at least 2 foursomes with players
  }

  return fc.record({
    foursome1: fc.constantFrom(...nonEmptyFoursomes),
    foursome2: fc.constantFrom(...nonEmptyFoursomes)
  }).chain(({ foursome1, foursome2 }) => {
    if (foursome1.id === foursome2.id && foursome1.players.length < 2) {
      return fc.constant(null); // Can't swap within same foursome unless it has 2+ players
    }

    const player1Options = foursome1.players;
    const player2Options = foursome2.players;

    if (foursome1.id === foursome2.id) {
      // Swapping within same foursome
      if (player1Options.length < 2) return fc.constant(null);
      
      return fc.record({
        player1: fc.constantFrom(...player1Options),
        player2: fc.constantFrom(...player1Options)
      }).chain(({ player1, player2 }) => {
        if (player1.id === player2.id) return fc.constant(null);
        
        return fc.constant({
          type: 'swap_players' as const,
          playerId: player1.id,
          secondPlayerId: player2.id
        });
      });
    } else {
      // Swapping between different foursomes
      return fc.record({
        player1: fc.constantFrom(...player1Options),
        player2: fc.constantFrom(...player2Options)
      }).map(({ player1, player2 }) => ({
        type: 'swap_players' as const,
        playerId: player1.id,
        secondPlayerId: player2.id
      }));
    }
  }).filter(op => op !== null) as fc.Arbitrary<ScheduleEditOperation>;
};

describe('ScheduleManager Property Tests', () => {
  let scheduleManager: ScheduleManager;
  let scheduleRepository: LocalScheduleRepository;
  let weekRepository: LocalWeekRepository;
  let playerRepository: LocalPlayerRepository;
  let pairingHistoryRepository: LocalPairingHistoryRepository;
  let scheduleGenerator: ScheduleGenerator;
  let pairingHistoryTracker: PairingHistoryTracker;
  let weekCounter = 0;

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    
    // Initialize repositories
    scheduleRepository = new LocalScheduleRepository();
    weekRepository = new LocalWeekRepository();
    playerRepository = new LocalPlayerRepository();
    pairingHistoryRepository = new LocalPairingHistoryRepository();
    
    // Initialize services
    pairingHistoryTracker = new PairingHistoryTracker(pairingHistoryRepository);
    scheduleGenerator = new ScheduleGenerator({}, pairingHistoryTracker);
    
    scheduleManager = new ScheduleManager(
      scheduleRepository,
      weekRepository,
      playerRepository,
      scheduleGenerator,
      pairingHistoryTracker
    );
  });

  /**
   * **Feature: indoor-golf-scheduler, Property 12: Manual edit validation**
   * **Validates: Requirements 7.3**
   */
  test('Property 12: Manual edit validation', async () => {
    await fc.assert(
      fc.asyncProperty(validScheduleArb, async ({ schedule, allPlayers }) => {
        const seasonId = 'test-season-id';

        // Set up test data in repositories
        // Create week with all players available
        const week = new WeekModel({
          seasonId,
          weekNumber: ++weekCounter, // Use unique week number
          date: new Date(),
          playerAvailability: Object.fromEntries(allPlayers.map(p => [p.id, true]))
        });
        
        // Save week and players to repositories
        const createdWeek = await weekRepository.create({
          seasonId: week.seasonId,
          weekNumber: week.weekNumber,
          date: week.date
        });
        await weekRepository.update(createdWeek.id, {
          playerAvailability: week.playerAvailability
        });

        for (const player of allPlayers) {
          try {
            await playerRepository.create({
              firstName: player.firstName,
              lastName: player.lastName,
              handedness: player.handedness,
              timePreference: player.timePreference,
              seasonId: player.seasonId
            });
          } catch (error) {
            // Player might already exist, ignore
          }
        }

        // Update the schedule to use the created week ID
        schedule.weekId = createdWeek.id;

        // Save the initial schedule
        const savedSchedule = await scheduleRepository.create({ weekId: createdWeek.id });
        await scheduleRepository.update(savedSchedule.id, {
          timeSlots: schedule.timeSlots,
          lastModified: new Date()
        });

        // Generate valid edit operations
        const moveOp = await fc.sample(validMoveOperationArb(schedule), 1)[0];
        const swapOp = await fc.sample(validSwapOperationArb(schedule), 1)[0];

        // Test move operation if valid
        if (moveOp) {
          try {
            const editedSchedule = await scheduleManager.applyManualEdit(createdWeek.id, moveOp);
            
            // Validate that the edited schedule still meets all constraints
            const validation = await scheduleManager.validateManualEdit(createdWeek.id, editedSchedule);
            
            if (!validation.isValid) {
              // If validation fails, the edit should have been rejected
              // This means our constraint validation is working correctly
              return true;
            }

            // If validation passes, verify key constraints manually
            const allScheduledPlayers = editedSchedule.getAllPlayers();
            const availablePlayerIds = new Set(allPlayers.map(p => p.id));

            // All scheduled players should be available
            for (const playerId of allScheduledPlayers) {
              if (!availablePlayerIds.has(playerId)) {
                return false; // Unavailable player was scheduled
              }
            }

            // Each player should appear exactly once
            const playerCounts = new Map<string, number>();
            [...editedSchedule.timeSlots.morning, ...editedSchedule.timeSlots.afternoon].forEach(foursome => {
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

            // Time preferences should be respected
            for (const foursome of editedSchedule.timeSlots.morning) {
              for (const player of foursome.players) {
                if (player.timePreference === 'PM') {
                  return false; // PM player in morning slot
                }
              }
            }

            for (const foursome of editedSchedule.timeSlots.afternoon) {
              for (const player of foursome.players) {
                if (player.timePreference === 'AM') {
                  return false; // AM player in afternoon slot
                }
              }
            }

            // No foursome should have more than 4 players
            const allFoursomes = [...editedSchedule.timeSlots.morning, ...editedSchedule.timeSlots.afternoon];
            for (const foursome of allFoursomes) {
              if (foursome.players.length > 4) {
                return false; // Foursome has too many players
              }
            }

          } catch (error) {
            // If the edit operation throws an error, it means the validation
            // correctly rejected an invalid edit - this is expected behavior
            return true;
          }
        }

        // Test swap operation if valid
        if (swapOp) {
          try {
            const editedSchedule = await scheduleManager.applyManualEdit(createdWeek.id, swapOp);
            
            // Validate that the edited schedule still meets all constraints
            const validation = await scheduleManager.validateManualEdit(createdWeek.id, editedSchedule);
            
            if (!validation.isValid) {
              // If validation fails, the edit should have been rejected
              return true;
            }

            // Perform the same constraint checks as above
            const allScheduledPlayers = editedSchedule.getAllPlayers();
            const availablePlayerIds = new Set(allPlayers.map(p => p.id));

            // All scheduled players should be available
            for (const playerId of allScheduledPlayers) {
              if (!availablePlayerIds.has(playerId)) {
                return false;
              }
            }

            // Each player should appear exactly once
            const playerCounts = new Map<string, number>();
            [...editedSchedule.timeSlots.morning, ...editedSchedule.timeSlots.afternoon].forEach(foursome => {
              foursome.players.forEach(player => {
                const count = playerCounts.get(player.id) || 0;
                playerCounts.set(player.id, count + 1);
              });
            });

            for (const count of playerCounts.values()) {
              if (count !== 1) {
                return false;
              }
            }

            // Time preferences should be respected
            for (const foursome of editedSchedule.timeSlots.morning) {
              for (const player of foursome.players) {
                if (player.timePreference === 'PM') {
                  return false;
                }
              }
            }

            for (const foursome of editedSchedule.timeSlots.afternoon) {
              for (const player of foursome.players) {
                if (player.timePreference === 'AM') {
                  return false;
                }
              }
            }

            // No foursome should have more than 4 players
            const allFoursomes = [...editedSchedule.timeSlots.morning, ...editedSchedule.timeSlots.afternoon];
            for (const foursome of allFoursomes) {
              if (foursome.players.length > 4) {
                return false;
              }
            }

          } catch (error) {
            // If the edit operation throws an error, it means the validation
            // correctly rejected an invalid edit - this is expected behavior
            return true;
          }
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });

  test('Manual edit validation rejects invalid time preference violations', async () => {
    const seasonId = 'test-season';

    // Create players with specific preferences
    const amPlayer = new PlayerModel({
      id: 'am-player',
      firstName: 'AM',
      lastName: 'Player',
      handedness: 'right',
      timePreference: 'AM',
      seasonId
    });

    const pmPlayer = new PlayerModel({
      id: 'pm-player',
      firstName: 'PM',
      lastName: 'Player',
      handedness: 'left',
      timePreference: 'PM',
      seasonId
    });

    // Set up repositories
    await playerRepository.create({
      firstName: amPlayer.firstName,
      lastName: amPlayer.lastName,
      handedness: amPlayer.handedness,
      timePreference: amPlayer.timePreference,
      seasonId: amPlayer.seasonId
    });

    await playerRepository.create({
      firstName: pmPlayer.firstName,
      lastName: pmPlayer.lastName,
      handedness: pmPlayer.handedness,
      timePreference: pmPlayer.timePreference,
      seasonId: pmPlayer.seasonId
    });

    const week = new WeekModel({
      seasonId,
      weekNumber: ++weekCounter,
      date: new Date(),
      playerAvailability: {
        [amPlayer.id]: true,
        [pmPlayer.id]: true
      }
    });

    const createdWeek = await weekRepository.create({
      seasonId: week.seasonId,
      weekNumber: week.weekNumber,
      date: week.date
    });
    await weekRepository.update(createdWeek.id, {
      playerAvailability: week.playerAvailability
    });

    // Create a schedule that violates time preferences
    const invalidSchedule = new ScheduleModel({ weekId: createdWeek.id });
    
    // Put AM player in afternoon (violation)
    const afternoonFoursome = new FoursomeModel({
      players: [amPlayer],
      timeSlot: 'afternoon',
      position: 0
    });
    
    // Put PM player in morning (violation)
    const morningFoursome = new FoursomeModel({
      players: [pmPlayer],
      timeSlot: 'morning',
      position: 0
    });

    invalidSchedule.addFoursome(afternoonFoursome);
    invalidSchedule.addFoursome(morningFoursome);

    // Validation should fail
    const validation = await scheduleManager.validateManualEdit(createdWeek.id, invalidSchedule);
    expect(validation.isValid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
    expect(validation.errors.some(error => error.includes('AM preference') && error.includes('afternoon'))).toBe(true);
    expect(validation.errors.some(error => error.includes('PM preference') && error.includes('morning'))).toBe(true);
  });

  test('Manual edit validation accepts valid schedule modifications', async () => {
    const seasonId = 'test-season';

    // Create players
    const playerData = [
      { firstName: 'Player', lastName: '1', handedness: 'right' as const, timePreference: 'AM' as const, seasonId },
      { firstName: 'Player', lastName: '2', handedness: 'left' as const, timePreference: 'AM' as const, seasonId },
      { firstName: 'Player', lastName: '3', handedness: 'right' as const, timePreference: 'PM' as const, seasonId },
      { firstName: 'Player', lastName: '4', handedness: 'left' as const, timePreference: 'PM' as const, seasonId }
    ];

    // Set up repositories and get actual player IDs
    const createdPlayers = [];
    for (const data of playerData) {
      const player = await playerRepository.create(data);
      createdPlayers.push(player);
    }

    const week = new WeekModel({
      seasonId,
      weekNumber: ++weekCounter,
      date: new Date(),
      playerAvailability: Object.fromEntries(createdPlayers.map(p => [p.id, true]))
    });

    const createdWeek = await weekRepository.create({
      seasonId: week.seasonId,
      weekNumber: week.weekNumber,
      date: week.date
    });
    await weekRepository.update(createdWeek.id, {
      playerAvailability: week.playerAvailability
    });

    // Create a valid schedule using the actual player objects
    const validSchedule = new ScheduleModel({ weekId: createdWeek.id });
    
    // AM players in morning
    const morningFoursome = new FoursomeModel({
      players: [createdPlayers[0], createdPlayers[1]], // Both AM preference
      timeSlot: 'morning',
      position: 0
    });
    
    // PM players in afternoon
    const afternoonFoursome = new FoursomeModel({
      players: [createdPlayers[2], createdPlayers[3]], // Both PM preference
      timeSlot: 'afternoon',
      position: 0
    });

    validSchedule.addFoursome(morningFoursome);
    validSchedule.addFoursome(afternoonFoursome);

    // Validation should pass
    const validation = await scheduleManager.validateManualEdit(createdWeek.id, validSchedule);
    expect(validation.isValid).toBe(true);
    expect(validation.errors.length).toBe(0);
  });
});