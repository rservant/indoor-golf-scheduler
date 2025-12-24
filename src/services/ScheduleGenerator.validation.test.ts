import { ScheduleGenerator } from './ScheduleGenerator';
import { PlayerModel } from '../models/Player';
import { WeekModel } from '../models/Week';
import { ScheduleModel } from '../models/Schedule';
import { FoursomeModel } from '../models/Foursome';

describe('ScheduleGenerator Enhanced Validation', () => {
  let generator: ScheduleGenerator;
  let players: PlayerModel[];
  let week: WeekModel;

  beforeEach(() => {
    generator = new ScheduleGenerator();
    
    // Create test players
    players = [
      new PlayerModel({
        id: 'player1',
        firstName: 'John',
        lastName: 'Smith',
        handedness: 'right',
        timePreference: 'AM',
        seasonId: 'test-season'
      }),
      new PlayerModel({
        id: 'player2',
        firstName: 'Alice',
        lastName: 'Williams',
        handedness: 'left',
        timePreference: 'PM',
        seasonId: 'test-season'
      }),
      new PlayerModel({
        id: 'player3',
        firstName: 'Bob',
        lastName: 'Johnson',
        handedness: 'right',
        timePreference: 'Either',
        seasonId: 'test-season'
      }),
      new PlayerModel({
        id: 'player4',
        firstName: 'Carol',
        lastName: 'Davis',
        handedness: 'left',
        timePreference: 'Either',
        seasonId: 'test-season'
      })
    ];

    // Create week with mixed availability
    week = new WeekModel({
      seasonId: 'test-season',
      weekNumber: 1,
      date: new Date(),
      playerAvailability: {
        'player1': true,   // Available
        'player2': false,  // Unavailable
        'player3': true,   // Available
        'player4': true    // Available
      }
    });
  });

  describe('Enhanced validateSchedule method', () => {
    test('should pass validation for schedule with only available players', () => {
      const schedule = new ScheduleModel({ weekId: 'week1' });
      
      // Add foursome with only available players
      const foursome = new FoursomeModel({
        players: [players[0], players[2]], // player1 and player3 (both available)
        timeSlot: 'morning',
        position: 0
      });
      schedule.addFoursome(foursome);

      const availablePlayers = [players[0], players[2], players[3]]; // Only available players
      const result = generator.validateSchedule(schedule, availablePlayers, week);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should detect unavailable players in schedule', () => {
      const schedule = new ScheduleModel({ weekId: 'week1' });
      
      // Add foursome with unavailable player
      const foursome = new FoursomeModel({
        players: [players[0], players[1]], // player1 (available) and player2 (unavailable)
        timeSlot: 'morning',
        position: 0
      });
      schedule.addFoursome(foursome);

      const result = generator.validateSchedule(schedule, players, week);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Unavailable players are scheduled: Alice Williams (player2)');
    });

    test('should detect players without availability data', () => {
      const schedule = new ScheduleModel({ weekId: 'week1' });
      
      // Add player not in availability data
      const extraPlayer = new PlayerModel({
        id: 'player5',
        firstName: 'Extra',
        lastName: 'Player',
        handedness: 'right',
        timePreference: 'AM',
        seasonId: 'test-season'
      });

      const foursome = new FoursomeModel({
        players: [players[0], extraPlayer], // player1 (available) and player5 (no data)
        timeSlot: 'morning',
        position: 0
      });
      schedule.addFoursome(foursome);

      const allPlayers = [...players, extraPlayer];
      const result = generator.validateSchedule(schedule, allPlayers, week);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Players without availability data are scheduled: Extra Player (player5)');
    });

    test('should provide detailed error messages with player names', () => {
      const schedule = new ScheduleModel({ weekId: 'week1' });
      
      // Add duplicate player
      const foursome1 = new FoursomeModel({
        players: [players[0], players[2]],
        timeSlot: 'morning',
        position: 0
      });
      const foursome2 = new FoursomeModel({
        players: [players[0], players[3]], // player1 appears twice
        timeSlot: 'afternoon',
        position: 0
      });
      
      schedule.addFoursome(foursome1);
      schedule.addFoursome(foursome2);

      const availablePlayers = [players[0], players[2], players[3]];
      const result = generator.validateSchedule(schedule, availablePlayers, week);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Player John Smith (player1) appears 2 times in schedule');
    });

    test('should validate time preferences with player names', () => {
      const schedule = new ScheduleModel({ weekId: 'week1' });
      
      // Schedule PM preference player in morning
      const foursome = new FoursomeModel({
        players: [players[1]], // Alice Williams has PM preference
        timeSlot: 'morning',
        position: 0
      });
      schedule.addFoursome(foursome);

      // Make player2 available for this test
      week.setPlayerAvailability('player2', true);
      
      const result = generator.validateSchedule(schedule, players, week);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Player Alice Williams (player2) has PM preference but is scheduled in morning');
    });
  });

  describe('validateScheduleAvailability method', () => {
    test('should return detailed availability conflicts', () => {
      const schedule = new ScheduleModel({ weekId: 'week1' });
      
      const foursome = new FoursomeModel({
        players: [players[0], players[1]], // Available and unavailable players
        timeSlot: 'morning',
        position: 0
      });
      schedule.addFoursome(foursome);

      const result = generator.validateScheduleAvailability(schedule, week, players);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Player Alice Williams (player2) is scheduled but is marked as unavailable (status: false)');
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]).toEqual({
        playerId: 'player2',
        playerName: 'Alice Williams',
        availabilityStatus: false
      });
    });

    test('should handle players without availability data', () => {
      const schedule = new ScheduleModel({ weekId: 'week1' });
      
      const extraPlayer = new PlayerModel({
        id: 'player5',
        firstName: 'Extra',
        lastName: 'Player',
        handedness: 'right',
        timePreference: 'AM',
        seasonId: 'test-season'
      });

      const foursome = new FoursomeModel({
        players: [extraPlayer],
        timeSlot: 'morning',
        position: 0
      });
      schedule.addFoursome(foursome);

      const allPlayers = [...players, extraPlayer];
      const result = generator.validateScheduleAvailability(schedule, week, allPlayers);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Player Extra Player (player5) is scheduled but has no availability data');
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]).toEqual({
        playerId: 'player5',
        playerName: 'Extra Player',
        availabilityStatus: undefined
      });
    });

    test('should pass validation for all available players', () => {
      const schedule = new ScheduleModel({ weekId: 'week1' });
      
      const foursome = new FoursomeModel({
        players: [players[0], players[2]], // Both available
        timeSlot: 'morning',
        position: 0
      });
      schedule.addFoursome(foursome);

      const result = generator.validateScheduleAvailability(schedule, week, players);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.conflicts).toHaveLength(0);
    });
  });

  describe('Backward compatibility', () => {
    test('should work without week parameter (original behavior)', () => {
      const schedule = new ScheduleModel({ weekId: 'week1' });
      
      const foursome = new FoursomeModel({
        players: [players[0], players[2]],
        timeSlot: 'morning',
        position: 0
      });
      schedule.addFoursome(foursome);

      const availablePlayers = [players[0], players[2]];
      const result = generator.validateSchedule(schedule, availablePlayers);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should detect basic violations without week parameter', () => {
      const schedule = new ScheduleModel({ weekId: 'week1' });
      
      const foursome = new FoursomeModel({
        players: [players[0], players[1]], // player1 available, player2 not in availablePlayers
        timeSlot: 'morning',
        position: 0
      });
      schedule.addFoursome(foursome);

      const availablePlayers = [players[0]]; // Only player1
      const result = generator.validateSchedule(schedule, availablePlayers);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Player player2 is in schedule but not in available players');
    });
  });

  describe('Edge cases', () => {
    test('should handle empty schedule', () => {
      const schedule = new ScheduleModel({ weekId: 'week1' });
      
      const result = generator.validateSchedule(schedule, players, week);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should handle schedule with minimal players', () => {
      const schedule = new ScheduleModel({ weekId: 'week1' });
      
      const singlePlayerFoursome = new FoursomeModel({
        players: [players[0]], // Single player foursome (allowed)
        timeSlot: 'morning',
        position: 0
      });
      schedule.addFoursome(singlePlayerFoursome);

      const result = generator.validateSchedule(schedule, players, week);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});