import { ScheduleGenerator } from './ScheduleGenerator';
import { PlayerModel } from '../models/Player';
import { WeekModel } from '../models/Week';

describe('Availability Bug Reproduction', () => {
  let generator: ScheduleGenerator;

  beforeEach(() => {
    generator = new ScheduleGenerator();
  });

  test('Bug reproduction: unavailable players should not be scheduled', async () => {
    // Create players matching the bug report scenario
    const johnSmith = new PlayerModel({
      id: 'john-smith',
      firstName: 'John',
      lastName: 'Smith',
      handedness: 'right',
      timePreference: 'AM',
      seasonId: 'test-season'
    });

    const aliceWilliams = new PlayerModel({
      id: 'alice-williams',
      firstName: 'Alice',
      lastName: 'Williams',
      handedness: 'left',
      timePreference: 'Either',
      seasonId: 'test-season'
    });

    const janeDoe = new PlayerModel({
      id: 'jane-doe',
      firstName: 'Jane',
      lastName: 'Doe',
      handedness: 'left',
      timePreference: 'PM',
      seasonId: 'test-season'
    });

    const bobJohnson = new PlayerModel({
      id: 'bob-johnson',
      firstName: 'Bob',
      lastName: 'Johnson',
      handedness: 'right',
      timePreference: 'Either',
      seasonId: 'test-season'
    });

    const charlieBrown = new PlayerModel({
      id: 'charlie-brown',
      firstName: 'Charlie',
      lastName: 'Brown',
      handedness: 'right',
      timePreference: 'AM',
      seasonId: 'test-season'
    });

    const dianaDavis = new PlayerModel({
      id: 'diana-davis',
      firstName: 'Diana',
      lastName: 'Davis',
      handedness: 'left',
      timePreference: 'PM',
      seasonId: 'test-season'
    });

    const allPlayers = [johnSmith, aliceWilliams, janeDoe, bobJohnson, charlieBrown, dianaDavis];

    // Create a week where John Smith and Alice Williams are marked as unavailable
    const week = new WeekModel({
      seasonId: 'test-season',
      weekNumber: 1,
      date: new Date(),
      playerAvailability: {
        'john-smith': false,      // Unavailable
        'alice-williams': false,  // Unavailable
        'jane-doe': true,         // Available
        'bob-johnson': true,      // Available
        'charlie-brown': true,    // Available
        'diana-davis': true       // Available
      }
    });

    console.log('Player availability:');
    console.log('John Smith:', week.isPlayerAvailable('john-smith'));
    console.log('Alice Williams:', week.isPlayerAvailable('alice-williams'));
    console.log('Jane Doe:', week.isPlayerAvailable('jane-doe'));
    console.log('Bob Johnson:', week.isPlayerAvailable('bob-johnson'));
    console.log('Charlie Brown:', week.isPlayerAvailable('charlie-brown'));
    console.log('Diana Davis:', week.isPlayerAvailable('diana-davis'));

    // Filter available players using the ScheduleGenerator method
    const availablePlayers = generator.filterAvailablePlayers(allPlayers, week);
    
    console.log('Filtered available players:', availablePlayers.map(p => `${p.firstName} ${p.lastName}`));

    // Generate schedule
    const schedule = await generator.generateScheduleForWeek(week, allPlayers);

    // Get all scheduled player IDs
    const scheduledPlayerIds = schedule.getAllPlayers();
    console.log('Scheduled player IDs:', scheduledPlayerIds);

    // Verify that John Smith and Alice Williams are NOT scheduled
    expect(scheduledPlayerIds).not.toContain('john-smith');
    expect(scheduledPlayerIds).not.toContain('alice-williams');

    // Verify that only available players are scheduled
    expect(scheduledPlayerIds).toContain('jane-doe');
    expect(scheduledPlayerIds).toContain('bob-johnson');
    expect(scheduledPlayerIds).toContain('charlie-brown');
    expect(scheduledPlayerIds).toContain('diana-davis');

    // Verify no unavailable players are scheduled
    for (const playerId of scheduledPlayerIds) {
      expect(week.isPlayerAvailable(playerId)).toBe(true);
    }
  });

  test('Edge case: no availability data should result in no players scheduled', async () => {
    const players = [
      new PlayerModel({
        id: 'player1',
        firstName: 'Player',
        lastName: 'One',
        handedness: 'right',
        timePreference: 'AM',
        seasonId: 'test-season'
      })
    ];

    // Create week with no availability data
    const week = new WeekModel({
      seasonId: 'test-season',
      weekNumber: 1,
      date: new Date(),
      playerAvailability: {} // No availability data
    });

    const availablePlayers = generator.filterAvailablePlayers(players, week);
    console.log('Available players with no data:', availablePlayers.length);

    // According to the bug, this currently returns all players
    // But it should return no players (or require explicit availability)
    expect(availablePlayers.length).toBe(0); // This might fail with current implementation
  });

  test('Edge case: undefined availability should be treated as unavailable', async () => {
    const players = [
      new PlayerModel({
        id: 'player1',
        firstName: 'Player',
        lastName: 'One',
        handedness: 'right',
        timePreference: 'AM',
        seasonId: 'test-season'
      }),
      new PlayerModel({
        id: 'player2',
        firstName: 'Player',
        lastName: 'Two',
        handedness: 'left',
        timePreference: 'PM',
        seasonId: 'test-season'
      })
    ];

    // Create week where one player has explicit availability, other doesn't
    const week = new WeekModel({
      seasonId: 'test-season',
      weekNumber: 1,
      date: new Date(),
      playerAvailability: {
        'player1': true
        // player2 has no availability entry (undefined)
      }
    });

    const availablePlayers = generator.filterAvailablePlayers(players, week);
    
    // Only player1 should be available
    expect(availablePlayers.length).toBe(1);
    expect(availablePlayers[0].id).toBe('player1');
  });
});