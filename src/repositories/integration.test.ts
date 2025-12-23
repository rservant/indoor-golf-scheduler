import { LocalSeasonRepository } from './SeasonRepository';
import { LocalPlayerRepository } from './PlayerRepository';
import { LocalWeekRepository } from './WeekRepository';
import { LocalScheduleRepository } from './ScheduleRepository';
import { LocalPairingHistoryRepository } from './PairingHistoryRepository';

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

describe('Repository Integration Tests', () => {
  let seasonRepository: LocalSeasonRepository;
  let playerRepository: LocalPlayerRepository;
  let weekRepository: LocalWeekRepository;
  let scheduleRepository: LocalScheduleRepository;
  let pairingHistoryRepository: LocalPairingHistoryRepository;

  beforeEach(() => {
    localStorage.clear();
    seasonRepository = new LocalSeasonRepository();
    playerRepository = new LocalPlayerRepository();
    weekRepository = new LocalWeekRepository();
    scheduleRepository = new LocalScheduleRepository();
    pairingHistoryRepository = new LocalPairingHistoryRepository();
  });

  test('should create and manage a complete season workflow', async () => {
    // Create a season
    const season = await seasonRepository.create({
      name: 'Spring 2024',
      startDate: new Date('2024-03-01'),
      endDate: new Date('2024-05-31')
    });

    expect(season.id).toBeDefined();
    expect(season.name).toBe('Spring 2024');
    expect(season.isActive).toBe(false);

    // Set season as active
    await seasonRepository.setActiveSeason(season.id);
    const activeSeason = await seasonRepository.getActiveSeason();
    expect(activeSeason?.id).toBe(season.id);
    expect(activeSeason?.isActive).toBe(true);

    // Create players for the season
    const player1 = await playerRepository.create({
      firstName: 'John',
      lastName: 'Doe',
      handedness: 'right',
      timePreference: 'AM',
      seasonId: season.id
    });

    const player2 = await playerRepository.create({
      firstName: 'Jane',
      lastName: 'Smith',
      handedness: 'left',
      timePreference: 'PM',
      seasonId: season.id
    });

    // Verify players are scoped to the season
    const seasonPlayers = await playerRepository.findBySeasonId(season.id);
    expect(seasonPlayers).toHaveLength(2);
    expect(seasonPlayers.map(p => p.id)).toContain(player1.id);
    expect(seasonPlayers.map(p => p.id)).toContain(player2.id);

    // Create a week for the season
    const week = await weekRepository.create({
      seasonId: season.id,
      weekNumber: 1,
      date: new Date('2024-03-08')
    });

    expect(week.seasonId).toBe(season.id);
    expect(week.weekNumber).toBe(1);

    // Set player availability
    await weekRepository.setPlayerAvailability(week.id, player1.id, true);
    await weekRepository.setPlayerAvailability(week.id, player2.id, false);

    const availablePlayers = await weekRepository.getAvailablePlayers(week.id);
    const unavailablePlayers = await weekRepository.getUnavailablePlayers(week.id);

    expect(availablePlayers).toContain(player1.id);
    expect(unavailablePlayers).toContain(player2.id);

    // Create a schedule for the week
    const schedule = await scheduleRepository.create({
      weekId: week.id
    });

    expect(schedule.weekId).toBe(week.id);
    expect(schedule.timeSlots.morning).toHaveLength(0);
    expect(schedule.timeSlots.afternoon).toHaveLength(0);

    // Create pairing history for the season
    const pairingHistory = await pairingHistoryRepository.create({
      seasonId: season.id
    });

    expect(pairingHistory.seasonId).toBe(season.id);
    expect(Object.keys(pairingHistory.pairings)).toHaveLength(0);

    // Add a pairing
    await pairingHistoryRepository.addPairing(season.id, player1.id, player2.id);
    const pairingCount = await pairingHistoryRepository.getPairingCount(season.id, player1.id, player2.id);
    expect(pairingCount).toBe(1);

    // Verify all data is properly isolated and connected
    const allSeasons = await seasonRepository.findAll();
    const allPlayers = await playerRepository.findAll();
    const allWeeks = await weekRepository.findAll();
    const allSchedules = await scheduleRepository.findAll();
    const allPairingHistories = await pairingHistoryRepository.findAll();

    expect(allSeasons).toHaveLength(1);
    expect(allPlayers).toHaveLength(2);
    expect(allWeeks).toHaveLength(1);
    expect(allSchedules).toHaveLength(1);
    expect(allPairingHistories).toHaveLength(1);
  });
});