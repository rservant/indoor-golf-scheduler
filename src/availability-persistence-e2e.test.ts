/**
 * End-to-End Availability Persistence Test
 * 
 * Tests the complete integration of all enhanced components working together
 * through direct service instantiation (avoiding problematic DOM interactions).
 * 
 * Verifies that the availability persistence fix works correctly when all
 * components are wired together as they would be in the real application.
 */

// Import repositories and services directly to avoid DOM issues
import { LocalSeasonRepository } from './repositories/SeasonRepository';
import { LocalPlayerRepository } from './repositories/PlayerRepository';
import { LocalWeekRepository } from './repositories/WeekRepository';
import { LocalScheduleRepository } from './repositories/ScheduleRepository';
import { SeasonManagerService } from './services/SeasonManager';
import { PlayerManagerService } from './services/PlayerManager';

// Mock localStorage
const localStorageMock = (() => {
  let store: { [key: string]: string } = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    length: Object.keys(store).length,
    key: (index: number) => Object.keys(store)[index] || null
  };
})();

// Set up global localStorage mock
Object.defineProperty(global, 'localStorage', {
  value: localStorageMock
});

// Mock DOM environment (minimal to avoid infinite loops)
if (typeof global.document === 'undefined') {
  Object.defineProperty(global, 'document', {
    value: {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      hidden: false
    }
  });
}

if (typeof global.window === 'undefined') {
  Object.defineProperty(global, 'window', {
    value: {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    }
  });
}

/**
 * Simplified application services for E2E testing
 * Avoids DOM-related issues while testing the core functionality
 */
interface TestApplicationServices {
  seasonRepository: LocalSeasonRepository;
  playerRepository: LocalPlayerRepository;
  weekRepository: LocalWeekRepository;
  scheduleRepository: LocalScheduleRepository;
  seasonManager: SeasonManagerService;
  playerManager: PlayerManagerService;
}

/**
 * Create a test application with all services properly wired
 */
function createTestApplication(): TestApplicationServices {
  // Initialize repositories
  const seasonRepository = new LocalSeasonRepository();
  const playerRepository = new LocalPlayerRepository();
  const weekRepository = new LocalWeekRepository();
  const scheduleRepository = new LocalScheduleRepository();

  // Initialize services with proper dependency injection
  const seasonManager = new SeasonManagerService(seasonRepository);
  const playerManager = new PlayerManagerService(
    playerRepository,
    weekRepository,
    scheduleRepository,
    seasonRepository
  );

  return {
    seasonRepository,
    playerRepository,
    weekRepository,
    scheduleRepository,
    seasonManager,
    playerManager
  };
}

describe('End-to-End Availability Persistence Integration', () => {
  let services: TestApplicationServices;

  beforeEach(async () => {
    // Clear localStorage before each test
    localStorageMock.clear();
    
    // Create test application services
    services = createTestApplication();
  });

  afterEach(() => {
    // Clean up
    localStorageMock.clear();
  });

  test('should integrate all availability persistence components correctly', async () => {
    // Verify all enhanced components are properly instantiated
    expect(services.playerManager).toBeDefined();
    expect(services.weekRepository).toBeDefined();
    
    // Verify the PlayerManager has the enhanced atomic methods
    expect(typeof services.playerManager.setPlayerAvailabilityAtomic).toBe('function');
    expect(typeof services.playerManager.setBulkAvailabilityAtomic).toBe('function');
    expect(typeof services.playerManager.verifyAvailabilityPersisted).toBe('function');
    expect(typeof services.playerManager.rollbackAvailabilityChanges).toBe('function');
    
    // Verify the WeekRepository has the enhanced verified methods
    expect(typeof services.weekRepository.setPlayerAvailabilityVerified).toBe('function');
    expect(typeof services.weekRepository.setBulkAvailabilityVerified).toBe('function');
    expect(typeof services.weekRepository.verifyDataIntegrity).toBe('function');
    expect(typeof services.weekRepository.createBackup).toBe('function');
    expect(typeof services.weekRepository.restoreFromBackup).toBe('function');
  });

  test('should handle complete availability workflow through the application', async () => {
    // Create a test season
    const season = await services.seasonManager.createSeason(
      'E2E Test Season',
      new Date('2024-01-01'),
      new Date('2024-12-31')
    );
    await services.seasonManager.setActiveSeason(season.id);
    
    // Add test players
    const player1 = await services.playerManager.addPlayer({
      firstName: 'John',
      lastName: 'Doe',
      handedness: 'right',
      timePreference: 'AM'
    });
    
    const player2 = await services.playerManager.addPlayer({
      firstName: 'Jane',
      lastName: 'Smith',
      handedness: 'left',
      timePreference: 'PM'
    });
    
    // Create a test week
    const week = await services.weekRepository.create({
      seasonId: season.id,
      weekNumber: 1,
      date: new Date('2024-01-07')
    });
    
    // Test individual availability operations
    await services.playerManager.setPlayerAvailabilityAtomic(player1.id, week.id, true);
    
    // Verify persistence
    const player1Availability = await services.playerManager.getPlayerAvailability(player1.id, week.id);
    expect(player1Availability).toBe(true);
    
    // Verify persistence verification works
    const verificationResult = await services.playerManager.verifyAvailabilityPersisted(player1.id, week.id, true);
    expect(verificationResult).toBe(true);
    
    // Test bulk availability operations
    const playerIds = [player1.id, player2.id];
    await services.playerManager.setBulkAvailabilityAtomic(week.id, playerIds, false);
    
    // Verify both players are now unavailable
    expect(await services.playerManager.getPlayerAvailability(player1.id, week.id)).toBe(false);
    expect(await services.playerManager.getPlayerAvailability(player2.id, week.id)).toBe(false);
    
    // Verify data integrity
    const integrityCheck = await services.weekRepository.verifyDataIntegrity(week.id);
    expect(integrityCheck).toBe(true);
  });

  test('should handle error recovery correctly through the application', async () => {
    // Create test data
    const season = await services.seasonManager.createSeason(
      'Error Test Season',
      new Date('2024-01-01'),
      new Date('2024-12-31')
    );
    await services.seasonManager.setActiveSeason(season.id);
    
    const player = await services.playerManager.addPlayer({
      firstName: 'Test',
      lastName: 'Player',
      handedness: 'right',
      timePreference: 'AM'
    });
    
    const week = await services.weekRepository.create({
      seasonId: season.id,
      weekNumber: 1,
      date: new Date('2024-01-07')
    });
    
    // Set initial availability
    await services.playerManager.setPlayerAvailabilityAtomic(player.id, week.id, true);
    
    // Mock localStorage to fail
    const originalSetItem = localStorageMock.setItem;
    localStorageMock.setItem = jest.fn(() => {
      throw new Error('Storage quota exceeded');
    });
    
    // Attempt operation that should fail
    await expect(
      services.playerManager.setPlayerAvailabilityAtomic(player.id, week.id, false)
    ).rejects.toThrow();
    
    // Restore localStorage
    localStorageMock.setItem = originalSetItem;
    
    // Verify system can recover
    await services.playerManager.setPlayerAvailabilityAtomic(player.id, week.id, false);
    expect(await services.playerManager.getPlayerAvailability(player.id, week.id)).toBe(false);
  });

  test('should handle backup and restore operations through the application', async () => {
    // Create test data
    const season = await services.seasonManager.createSeason(
      'Backup Test Season',
      new Date('2024-01-01'),
      new Date('2024-12-31')
    );
    await services.seasonManager.setActiveSeason(season.id);
    
    const player = await services.playerManager.addPlayer({
      firstName: 'Backup',
      lastName: 'Player',
      handedness: 'right',
      timePreference: 'AM'
    });
    
    const week = await services.weekRepository.create({
      seasonId: season.id,
      weekNumber: 1,
      date: new Date('2024-01-07')
    });
    
    // Set initial state
    await services.playerManager.setPlayerAvailabilityAtomic(player.id, week.id, true);
    
    // Create backup
    const backupId = await services.weekRepository.createBackup(week.id);
    expect(backupId).toBeTruthy();
    
    // Modify state
    await services.playerManager.setPlayerAvailabilityAtomic(player.id, week.id, false);
    expect(await services.playerManager.getPlayerAvailability(player.id, week.id)).toBe(false);
    
    // Restore from backup
    const restoreSuccess = await services.weekRepository.restoreFromBackup(week.id, backupId);
    expect(restoreSuccess).toBe(true);
    
    // Verify original state is restored
    expect(await services.playerManager.getPlayerAvailability(player.id, week.id)).toBe(true);
  });

  test('should maintain data consistency across service restarts', async () => {
    // Create test data
    const season = await services.seasonManager.createSeason(
      'Persistence Test Season',
      new Date('2024-01-01'),
      new Date('2024-12-31')
    );
    await services.seasonManager.setActiveSeason(season.id);
    
    const player = await services.playerManager.addPlayer({
      firstName: 'Persistent',
      lastName: 'Player',
      handedness: 'right',
      timePreference: 'AM'
    });
    
    const week = await services.weekRepository.create({
      seasonId: season.id,
      weekNumber: 1,
      date: new Date('2024-01-07')
    });
    
    // Set availability
    await services.playerManager.setPlayerAvailabilityAtomic(player.id, week.id, true);
    
    // Verify initial state
    expect(await services.playerManager.getPlayerAvailability(player.id, week.id)).toBe(true);
    
    // Create new service instances (simulating application restart)
    const newServices = createTestApplication();
    
    // Verify data persisted across restart
    const persistedAvailability = await newServices.playerManager.getPlayerAvailability(player.id, week.id);
    expect(persistedAvailability).toBe(true);
  });

  test('should handle concurrent operations correctly through the application', async () => {
    // Create test data
    const season = await services.seasonManager.createSeason(
      'Concurrent Test Season',
      new Date('2024-01-01'),
      new Date('2024-12-31')
    );
    await services.seasonManager.setActiveSeason(season.id);
    
    const player = await services.playerManager.addPlayer({
      firstName: 'Concurrent',
      lastName: 'Player',
      handedness: 'right',
      timePreference: 'AM'
    });
    
    const week = await services.weekRepository.create({
      seasonId: season.id,
      weekNumber: 1,
      date: new Date('2024-01-07')
    });
    
    // Start multiple concurrent operations
    const operations = [
      services.playerManager.setPlayerAvailabilityAtomic(player.id, week.id, true),
      services.playerManager.setPlayerAvailabilityAtomic(player.id, week.id, false),
      services.playerManager.setPlayerAvailabilityAtomic(player.id, week.id, true)
    ];
    
    // Wait for all operations to complete
    await Promise.all(operations);
    
    // Final state should be consistent
    const finalAvailability = await services.playerManager.getPlayerAvailability(player.id, week.id);
    expect(typeof finalAvailability).toBe('boolean');
    
    // Verify data integrity
    const integrityCheck = await services.weekRepository.verifyDataIntegrity(week.id);
    expect(integrityCheck).toBe(true);
  });

  test('should verify all availability controls work end-to-end', async () => {
    // Create test data
    const season = await services.seasonManager.createSeason(
      'Controls Test Season',
      new Date('2024-01-01'),
      new Date('2024-12-31')
    );
    await services.seasonManager.setActiveSeason(season.id);
    
    // Add multiple test players
    const players = [];
    for (let i = 1; i <= 4; i++) {
      const player = await services.playerManager.addPlayer({
        firstName: `Player${i}`,
        lastName: 'Test',
        handedness: i % 2 === 0 ? 'left' : 'right',
        timePreference: i % 3 === 0 ? 'PM' : 'AM'
      });
      players.push(player);
    }
    
    const week = await services.weekRepository.create({
      seasonId: season.id,
      weekNumber: 1,
      date: new Date('2024-01-07')
    });
    
    // Test individual toggles
    await services.playerManager.setPlayerAvailabilityAtomic(players[0].id, week.id, true);
    await services.playerManager.setPlayerAvailabilityAtomic(players[1].id, week.id, false);
    
    // Verify individual states
    expect(await services.playerManager.getPlayerAvailability(players[0].id, week.id)).toBe(true);
    expect(await services.playerManager.getPlayerAvailability(players[1].id, week.id)).toBe(false);
    
    // Test Mark All Available
    const playerIds = players.map(p => p.id);
    await services.playerManager.setBulkAvailabilityAtomic(week.id, playerIds, true);
    
    // Verify all are available
    for (const player of players) {
      expect(await services.playerManager.getPlayerAvailability(player.id, week.id)).toBe(true);
    }
    
    // Test Mark All Unavailable
    await services.playerManager.setBulkAvailabilityAtomic(week.id, playerIds, false);
    
    // Verify all are unavailable
    for (const player of players) {
      expect(await services.playerManager.getPlayerAvailability(player.id, week.id)).toBe(false);
    }
    
    // Final data integrity check
    const integrityCheck = await services.weekRepository.verifyDataIntegrity(week.id);
    expect(integrityCheck).toBe(true);
  });
});