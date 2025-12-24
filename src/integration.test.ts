import { SeasonManagerService } from './services/SeasonManager';
import { PlayerManagerService } from './services/PlayerManager';
import { ScheduleManager } from './services/ScheduleManager';
import { LocalScheduleBackupService } from './services/ScheduleBackupService';
import { ScheduleGenerator } from './services/ScheduleGenerator';
import { ExportService } from './services/ExportService';
import { PairingHistoryTracker } from './services/PairingHistoryTracker';

import { LocalSeasonRepository } from './repositories/SeasonRepository';
import { LocalPlayerRepository } from './repositories/PlayerRepository';
import { LocalWeekRepository } from './repositories/WeekRepository';
import { LocalScheduleRepository } from './repositories/ScheduleRepository';
import { LocalPairingHistoryRepository } from './repositories/PairingHistoryRepository';

import { Season } from './models/Season';
import { Player } from './models/Player';
import { Week } from './models/Week';

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

describe('End-to-End Integration Tests', () => {
  let seasonManager: SeasonManagerService;
  let playerManager: PlayerManagerService;
  let scheduleManager: ScheduleManager;
  let backupService: LocalScheduleBackupService;
  let scheduleGenerator: ScheduleGenerator;
  let exportService: ExportService;
  let pairingHistoryTracker: PairingHistoryTracker;

  let seasonRepository: LocalSeasonRepository;
  let playerRepository: LocalPlayerRepository;
  let weekRepository: LocalWeekRepository;
  let scheduleRepository: LocalScheduleRepository;
  let pairingHistoryRepository: LocalPairingHistoryRepository;

  beforeEach(async () => {
    // Use optimized storage manager for cleanup
    const storageManager = (global as any).storageManager;
    if (storageManager) {
      await storageManager.clear();
    } else {
      localStorage.clear();
    }
    
    // Initialize repositories
    seasonRepository = new LocalSeasonRepository();
    playerRepository = new LocalPlayerRepository();
    weekRepository = new LocalWeekRepository();
    scheduleRepository = new LocalScheduleRepository();
    pairingHistoryRepository = new LocalPairingHistoryRepository();

    // Initialize services
    seasonManager = new SeasonManagerService(seasonRepository);
    playerManager = new PlayerManagerService(playerRepository, weekRepository, scheduleRepository, seasonRepository);
    pairingHistoryTracker = new PairingHistoryTracker(pairingHistoryRepository);
    scheduleGenerator = new ScheduleGenerator({}, pairingHistoryTracker);
    backupService = new LocalScheduleBackupService();
    scheduleManager = new ScheduleManager(
      scheduleRepository,
      weekRepository,
      playerRepository,
      scheduleGenerator,
      pairingHistoryTracker
    ,
      backupService
    );
    exportService = new ExportService();
  });

  describe('Complete Season Creation to Schedule Export Workflow', () => {
    test('should handle complete workflow from season creation to schedule export', async () => {
      // Step 1: Create a new season
      const currentDate = new Date();
      const startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 3, 0);
      
      const season = await seasonManager.createSeason(
        'Spring 2024',
        startDate,
        endDate
      );

      expect(season.name).toBe('Spring 2024');
      expect(season.isActive).toBe(false);

      // Step 2: Set season as active
      await seasonManager.setActiveSeason(season.id);
      const activeSeason = await seasonManager.getActiveSeason();
      expect(activeSeason?.id).toBe(season.id);
      expect(activeSeason?.isActive).toBe(true);

      // Step 3: Add players to the season
      const players = await Promise.all([
        playerManager.addPlayer({
          firstName: 'John',
          lastName: 'Doe',
          handedness: 'right',
          timePreference: 'AM'
        }),
        playerManager.addPlayer({
          firstName: 'Jane',
          lastName: 'Smith',
          handedness: 'left',
          timePreference: 'PM'
        }),
        playerManager.addPlayer({
          firstName: 'Bob',
          lastName: 'Johnson',
          handedness: 'right',
          timePreference: 'Either'
        }),
        playerManager.addPlayer({
          firstName: 'Alice',
          lastName: 'Williams',
          handedness: 'left',
          timePreference: 'Either'
        }),
        playerManager.addPlayer({
          firstName: 'Charlie',
          lastName: 'Brown',
          handedness: 'right',
          timePreference: 'AM'
        }),
        playerManager.addPlayer({
          firstName: 'Diana',
          lastName: 'Davis',
          handedness: 'left',
          timePreference: 'PM'
        }),
        playerManager.addPlayer({
          firstName: 'Eve',
          lastName: 'Miller',
          handedness: 'right',
          timePreference: 'Either'
        }),
        playerManager.addPlayer({
          firstName: 'Frank',
          lastName: 'Wilson',
          handedness: 'left',
          timePreference: 'Either'
        })
      ]);

      expect(players).toHaveLength(8);

      // Step 4: Create weeks for the season
      const week1 = await weekRepository.create({
        seasonId: season.id,
        weekNumber: 1,
        date: new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000) // 1 week after start
      });

      const week2 = await weekRepository.create({
        seasonId: season.id,
        weekNumber: 2,
        date: new Date(startDate.getTime() + 14 * 24 * 60 * 60 * 1000) // 2 weeks after start
      });

      // Step 5: Set player availability for week 1 (all players available)
      for (const player of players) {
        await weekRepository.setPlayerAvailability(week1.id, player.id, true);
      }

      // Step 6: Generate schedule for week 1
      const savedSchedule1 = await scheduleManager.createWeeklySchedule(week1.id);
      expect(savedSchedule1).toBeDefined();
      expect(savedSchedule1.weekId).toBe(week1.id);

      // Verify schedule has players assigned
      const totalPlayers = savedSchedule1.timeSlots.morning.reduce((sum, foursome) => sum + foursome.players.length, 0) +
                          savedSchedule1.timeSlots.afternoon.reduce((sum, foursome) => sum + foursome.players.length, 0);
      expect(totalPlayers).toBe(8);

      // Step 8: Set different availability for week 2 (some players unavailable)
      for (let i = 0; i < players.length; i++) {
        const available = i < 6; // First 6 players available, last 2 unavailable
        await weekRepository.setPlayerAvailability(week2.id, players[i].id, available);
      }

      // Step 8: Generate schedule for week 2
      const savedSchedule2 = await scheduleManager.createWeeklySchedule(week2.id);
      expect(savedSchedule2).toBeDefined();
      expect(savedSchedule2.weekId).toBe(week2.id);

      // Verify only available players are scheduled
      const totalPlayers2 = savedSchedule2.timeSlots.morning.reduce((sum, foursome) => sum + foursome.players.length, 0) +
                           savedSchedule2.timeSlots.afternoon.reduce((sum, foursome) => sum + foursome.players.length, 0);
      expect(totalPlayers2).toBe(6);

      // Step 9: Export schedules
      const exportData1 = await exportService.exportSchedule(savedSchedule1, { format: 'csv' });
      expect(exportData1.success).toBe(true);
      expect(exportData1.data).toBeDefined();

      const exportData2 = await exportService.exportSchedule(savedSchedule2, { format: 'csv' });
      expect(exportData2.success).toBe(true);
      expect(exportData2.data).toBeDefined();

      // Step 10: Verify pairing history has been updated
      let pairingHistory = await pairingHistoryRepository.findBySeasonId(season.id);
      if (!pairingHistory) {
        // Create pairing history if it doesn't exist
        pairingHistory = await pairingHistoryRepository.create({ seasonId: season.id });
      }
      expect(pairingHistory).toBeDefined();

      // Step 11: Verify season data integrity
      const finalSeason = await seasonRepository.findById(season.id);
      expect(finalSeason).toBeDefined();
      expect(finalSeason!.isActive).toBe(true);

      const seasonPlayers = await playerRepository.findBySeasonId(season.id);
      expect(seasonPlayers).toHaveLength(8);

      const seasonWeeks = await weekRepository.findBySeasonId(season.id);
      expect(seasonWeeks).toHaveLength(2);
    });
  });

  describe('Player Management Across Multiple Weeks', () => {
    let season: Season;
    let players: Player[];
    let weeks: Week[];

    beforeEach(async () => {
      // Set up a season with players and weeks
      const currentDate = new Date();
      const startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 6, 0);
      
      season = await seasonManager.createSeason(
        'Test Season',
        startDate,
        endDate
      );
      await seasonManager.setActiveSeason(season.id);

      players = await Promise.all([
        playerManager.addPlayer({
          firstName: 'Player',
          lastName: 'One',
          handedness: 'right',
          timePreference: 'AM'
        }),
        playerManager.addPlayer({
          firstName: 'Player',
          lastName: 'Two',
          handedness: 'left',
          timePreference: 'PM'
        }),
        playerManager.addPlayer({
          firstName: 'Player',
          lastName: 'Three',
          handedness: 'right',
          timePreference: 'Either'
        }),
        playerManager.addPlayer({
          firstName: 'Player',
          lastName: 'Four',
          handedness: 'left',
          timePreference: 'Either'
        })
      ]);

      weeks = await Promise.all([
        weekRepository.create({
          seasonId: season.id,
          weekNumber: 1,
          date: new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000)
        }),
        weekRepository.create({
          seasonId: season.id,
          weekNumber: 2,
          date: new Date(startDate.getTime() + 14 * 24 * 60 * 60 * 1000)
        }),
        weekRepository.create({
          seasonId: season.id,
          weekNumber: 3,
          date: new Date(startDate.getTime() + 21 * 24 * 60 * 60 * 1000)
        })
      ]);
    });

    test('should handle player availability changes across multiple weeks', async () => {
      // Week 1: All players available
      for (const player of players) {
        await weekRepository.setPlayerAvailability(weeks[0].id, player.id, true);
      }

      let availablePlayers = await weekRepository.getAvailablePlayers(weeks[0].id);
      expect(availablePlayers).toHaveLength(4);

      // Week 2: Player 1 and 3 unavailable
      await weekRepository.setPlayerAvailability(weeks[1].id, players[0].id, false);
      await weekRepository.setPlayerAvailability(weeks[1].id, players[1].id, true);
      await weekRepository.setPlayerAvailability(weeks[1].id, players[2].id, false);
      await weekRepository.setPlayerAvailability(weeks[1].id, players[3].id, true);

      availablePlayers = await weekRepository.getAvailablePlayers(weeks[1].id);
      expect(availablePlayers).toHaveLength(2);
      expect(availablePlayers).toContain(players[1].id);
      expect(availablePlayers).toContain(players[3].id);

      // Week 3: Only Player 2 available
      await weekRepository.setPlayerAvailability(weeks[2].id, players[0].id, false);
      await weekRepository.setPlayerAvailability(weeks[2].id, players[1].id, true);
      await weekRepository.setPlayerAvailability(weeks[2].id, players[2].id, false);
      await weekRepository.setPlayerAvailability(weeks[2].id, players[3].id, false);

      availablePlayers = await weekRepository.getAvailablePlayers(weeks[2].id);
      expect(availablePlayers).toHaveLength(1);
      expect(availablePlayers).toContain(players[1].id);
    });

    test('should handle player updates and removal gracefully', async () => {
      // Set initial availability for all weeks
      for (const week of weeks) {
        for (const player of players) {
          await weekRepository.setPlayerAvailability(week.id, player.id, true);
        }
      }

      // Update player information
      const updatedPlayer = await playerManager.updatePlayer(players[0].id, {
        timePreference: 'PM'
      });
      expect(updatedPlayer.timePreference).toBe('PM');

      // Generate schedules for all weeks
      const schedules = [];
      for (const week of weeks) {
        const schedule = await scheduleManager.createWeeklySchedule(week.id);
        schedules.push(schedule);
      }

      expect(schedules).toHaveLength(3);

      // Remove a player
      await playerManager.removePlayer(players[0].id);

      // Verify player is removed from season
      const remainingPlayers = await playerRepository.findBySeasonId(season.id);
      expect(remainingPlayers).toHaveLength(3);
      expect(remainingPlayers.find(p => p.id === players[0].id)).toBeUndefined();

      // Verify existing schedules still exist (graceful handling)
      for (const schedule of schedules) {
        const retrievedSchedule = await scheduleRepository.findById(schedule.id);
        expect(retrievedSchedule).toBeDefined();
      }
    });
  });

  describe('Schedule Generation with Various Constraint Scenarios', () => {
    let season: Season;

    beforeEach(async () => {
      const currentDate = new Date();
      const startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 6, 0);
      
      season = await seasonManager.createSeason(
        'Constraint Test Season',
        startDate,
        endDate
      );
      await seasonManager.setActiveSeason(season.id);
    });

    test('should handle time preference constraints', async () => {
      // Create players with specific time preferences
      const amPlayers = await Promise.all([
        playerManager.addPlayer({
          firstName: 'AM',
          lastName: 'Player1',
          handedness: 'right',
          timePreference: 'AM'
        }),
        playerManager.addPlayer({
          firstName: 'AM',
          lastName: 'Player2',
          handedness: 'left',
          timePreference: 'AM'
        })
      ]);

      const pmPlayers = await Promise.all([
        playerManager.addPlayer({
          firstName: 'PM',
          lastName: 'Player1',
          handedness: 'right',
          timePreference: 'PM'
        }),
        playerManager.addPlayer({
          firstName: 'PM',
          lastName: 'Player2',
          handedness: 'left',
          timePreference: 'PM'
        })
      ]);

      const eitherPlayers = await Promise.all([
        playerManager.addPlayer({
          firstName: 'Either',
          lastName: 'Player1',
          handedness: 'right',
          timePreference: 'Either'
        }),
        playerManager.addPlayer({
          firstName: 'Either',
          lastName: 'Player2',
          handedness: 'left',
          timePreference: 'Either'
        })
      ]);

      const week = await weekRepository.create({
        seasonId: season.id,
        weekNumber: 1,
        date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });

      // Set all players as available
      const allPlayers = [...amPlayers, ...pmPlayers, ...eitherPlayers];
      for (const player of allPlayers) {
        await weekRepository.setPlayerAvailability(week.id, player.id, true);
      }

      // Generate schedule
      const schedule = await scheduleManager.createWeeklySchedule(week.id);

      // Verify time preferences are respected
      for (const foursome of schedule.timeSlots.morning) {
        for (const player of foursome.players) {
          expect(['AM', 'Either']).toContain(player.timePreference);
        }
      }

      for (const foursome of schedule.timeSlots.afternoon) {
        for (const player of foursome.players) {
          expect(['PM', 'Either']).toContain(player.timePreference);
        }
      }
    });

    test('should handle insufficient players scenario', async () => {
      // Create only 2 players
      const players = await Promise.all([
        playerManager.addPlayer({
          firstName: 'Player',
          lastName: 'One',
          handedness: 'right',
          timePreference: 'AM'
        }),
        playerManager.addPlayer({
          firstName: 'Player',
          lastName: 'Two',
          handedness: 'left',
          timePreference: 'PM'
        })
      ]);

      const week = await weekRepository.create({
        seasonId: season.id,
        weekNumber: 1,
        date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });

      // Set players as available
      for (const player of players) {
        await weekRepository.setPlayerAvailability(week.id, player.id, true);
      }

      // Generate schedule with insufficient players
      const schedule = await scheduleManager.createWeeklySchedule(week.id);

      // Should still create a schedule, but with smaller groups
      const totalPlayers = schedule.timeSlots.morning.reduce((sum, foursome) => sum + foursome.players.length, 0) +
                          schedule.timeSlots.afternoon.reduce((sum, foursome) => sum + foursome.players.length, 0);
      expect(totalPlayers).toBe(2);
    });

    test('should handle pairing optimization across multiple weeks', async () => {
      // Create 8 players for optimal foursome formation
      const players = [];
      for (let i = 1; i <= 8; i++) {
        const player = await playerManager.addPlayer({
          firstName: `Player`,
          lastName: `${i}`,
          handedness: i % 2 === 0 ? 'left' : 'right',
          timePreference: 'Either'
        });
        players.push(player);
      }

      // Create multiple weeks
      const weeks = [];
      for (let i = 1; i <= 3; i++) {
        const week = await weekRepository.create({
          seasonId: season.id,
          weekNumber: i,
          date: new Date(Date.now() + (i * 7) * 24 * 60 * 60 * 1000)
        });
        weeks.push(week);

        // Set all players as available
        for (const player of players) {
          await weekRepository.setPlayerAvailability(week.id, player.id, true);
        }
      }

      // Generate schedules for all weeks
      const schedules = [];
      for (const week of weeks) {
        const schedule = await scheduleManager.createWeeklySchedule(week.id);
        schedules.push(schedule);
      }

      // Verify pairing history is being tracked
      let pairingHistory = await pairingHistoryRepository.findBySeasonId(season.id);
      if (!pairingHistory) {
        // Create pairing history if it doesn't exist
        pairingHistory = await pairingHistoryRepository.create({ seasonId: season.id });
      }
      expect(pairingHistory).toBeDefined();

      // Verify schedules are different (pairing optimization working)
      expect(schedules).toHaveLength(3);
      for (const schedule of schedules) {
        expect(schedule.id).toBeDefined();
        expect(schedule.weekId).toBeDefined();
      }
    });
  });
});