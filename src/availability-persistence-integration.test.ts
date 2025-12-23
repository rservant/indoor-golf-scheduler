/**
 * Availability Persistence Integration Tests
 * 
 * Comprehensive end-to-end testing of the availability persistence fix
 * covering all components working together: UI, PlayerManager, WeekRepository
 * 
 * Tests complete workflows including navigation persistence and error recovery
 * 
 * Requirements: All requirements from availability-persistence-fix spec
 */

import { LocalSeasonRepository } from './repositories/SeasonRepository';
import { LocalPlayerRepository } from './repositories/PlayerRepository';
import { LocalWeekRepository } from './repositories/WeekRepository';
import { LocalScheduleRepository } from './repositories/ScheduleRepository';
import { SeasonManagerService } from './services/SeasonManager';
import { PlayerManagerService } from './services/PlayerManager';
import { AvailabilityManagementUI } from './ui/AvailabilityManagementUI';
import { Season } from './models/Season';
import { Player } from './models/Player';
import { Week } from './models/Week';

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

// Mock DOM environment
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

describe('Availability Persistence Integration Tests', () => {
  // Repository instances
  let seasonRepository: LocalSeasonRepository;
  let playerRepository: LocalPlayerRepository;
  let weekRepository: LocalWeekRepository;
  let scheduleRepository: LocalScheduleRepository;

  // Service instances
  let seasonManager: SeasonManagerService;
  let playerManager: PlayerManagerService;

  // UI instance
  let availabilityUI: AvailabilityManagementUI;
  let container: HTMLElement;

  // Test data
  let testSeason: Season;
  let testPlayers: Player[];
  let testWeeks: Week[];

  beforeEach(async () => {
    // Clear localStorage before each test
    localStorageMock.clear();
    
    // Initialize repositories
    seasonRepository = new LocalSeasonRepository();
    playerRepository = new LocalPlayerRepository();
    weekRepository = new LocalWeekRepository();
    scheduleRepository = new LocalScheduleRepository();

    // Initialize services
    seasonManager = new SeasonManagerService(seasonRepository);
    playerManager = new PlayerManagerService(
      playerRepository,
      weekRepository,
      scheduleRepository,
      seasonRepository
    );

    // Create mock container
    container = {
      innerHTML: '',
      querySelector: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    } as any;

    // Initialize UI
    availabilityUI = new AvailabilityManagementUI(
      playerManager,
      weekRepository,
      container
    );

    // Set up test data
    await setupTestData();
  });

  afterEach(() => {
    // Clean up
    availabilityUI.destroy();
    playerManager.destroy();
    localStorageMock.clear();
  });

  async function setupTestData(): Promise<void> {
    // Create test season
    testSeason = await seasonManager.createSeason(
      'Availability Test Season',
      new Date('2024-01-01'),
      new Date('2024-12-31')
    );
    await seasonManager.setActiveSeason(testSeason.id);

    // Create test players
    const playerData = [
      { firstName: 'John', lastName: 'Smith', handedness: 'right' as const, timePreference: 'AM' as const },
      { firstName: 'Jane', lastName: 'Doe', handedness: 'left' as const, timePreference: 'PM' as const },
      { firstName: 'Bob', lastName: 'Johnson', handedness: 'right' as const, timePreference: 'Either' as const },
      { firstName: 'Alice', lastName: 'Williams', handedness: 'left' as const, timePreference: 'Either' as const }
    ];

    testPlayers = [];
    for (const data of playerData) {
      const player = await playerManager.addPlayer(data);
      testPlayers.push(player);
    }

    // Create test weeks
    testWeeks = [];
    for (let i = 1; i <= 3; i++) {
      const week = await weekRepository.create({
        seasonId: testSeason.id,
        weekNumber: i,
        date: new Date(`2024-01-${7 * i}`)
      });
      testWeeks.push(week);
    }

    // Initialize UI with test season
    await availabilityUI.initialize(testSeason);
  }

  describe('Complete Availability Management Workflows', () => {
    test('should handle complete individual player availability workflow', async () => {
      const player = testPlayers[0];
      const week = testWeeks[0];

      // Verify initial state (should be false/unavailable)
      const initialAvailability = await playerManager.getPlayerAvailability(player.id, week.id);
      expect(initialAvailability).toBe(false);

      // Toggle availability to true
      await playerManager.setPlayerAvailabilityAtomic(player.id, week.id, true);

      // Verify persistence immediately
      const updatedAvailability = await playerManager.getPlayerAvailability(player.id, week.id);
      expect(updatedAvailability).toBe(true);

      // Verify persistence verification works
      const verificationResult = await playerManager.verifyAvailabilityPersisted(player.id, week.id, true);
      expect(verificationResult).toBe(true);

      // Toggle back to false
      await playerManager.setPlayerAvailabilityAtomic(player.id, week.id, false);

      // Verify final state
      const finalAvailability = await playerManager.getPlayerAvailability(player.id, week.id);
      expect(finalAvailability).toBe(false);

      const finalVerification = await playerManager.verifyAvailabilityPersisted(player.id, week.id, false);
      expect(finalVerification).toBe(true);
    });

    test('should handle complete bulk availability workflow - Mark All Available', async () => {
      const week = testWeeks[0];
      const playerIds = testPlayers.map(p => p.id);

      // Verify initial state (all should be false)
      for (const player of testPlayers) {
        const availability = await playerManager.getPlayerAvailability(player.id, week.id);
        expect(availability).toBe(false);
      }

      // Mark all available using bulk operation
      await playerManager.setBulkAvailabilityAtomic(week.id, playerIds, true);

      // Verify all players are now available
      for (const player of testPlayers) {
        const availability = await playerManager.getPlayerAvailability(player.id, week.id);
        expect(availability).toBe(true);

        // Verify persistence verification works
        const verified = await playerManager.verifyAvailabilityPersisted(player.id, week.id, true);
        expect(verified).toBe(true);
      }

      // Verify using repository's verified bulk method
      const verificationResult = await weekRepository.verifyDataIntegrity(week.id);
      expect(verificationResult).toBe(true);
    });

    test('should handle complete bulk availability workflow - Mark All Unavailable', async () => {
      const week = testWeeks[0];
      const playerIds = testPlayers.map(p => p.id);

      // First set all available
      await playerManager.setBulkAvailabilityAtomic(week.id, playerIds, true);

      // Verify all are available
      for (const player of testPlayers) {
        const availability = await playerManager.getPlayerAvailability(player.id, week.id);
        expect(availability).toBe(true);
      }

      // Mark all unavailable using bulk operation
      await playerManager.setBulkAvailabilityAtomic(week.id, playerIds, false);

      // Verify all players are now unavailable
      for (const player of testPlayers) {
        const availability = await playerManager.getPlayerAvailability(player.id, week.id);
        expect(availability).toBe(false);

        // Verify persistence verification works
        const verified = await playerManager.verifyAvailabilityPersisted(player.id, week.id, false);
        expect(verified).toBe(true);
      }
    });

    test('should handle mixed availability states correctly', async () => {
      const week = testWeeks[0];

      // Set mixed availability states
      await playerManager.setPlayerAvailabilityAtomic(testPlayers[0].id, week.id, true);
      await playerManager.setPlayerAvailabilityAtomic(testPlayers[1].id, week.id, false);
      await playerManager.setPlayerAvailabilityAtomic(testPlayers[2].id, week.id, true);
      await playerManager.setPlayerAvailabilityAtomic(testPlayers[3].id, week.id, false);

      // Verify each player's state
      expect(await playerManager.getPlayerAvailability(testPlayers[0].id, week.id)).toBe(true);
      expect(await playerManager.getPlayerAvailability(testPlayers[1].id, week.id)).toBe(false);
      expect(await playerManager.getPlayerAvailability(testPlayers[2].id, week.id)).toBe(true);
      expect(await playerManager.getPlayerAvailability(testPlayers[3].id, week.id)).toBe(false);

      // Verify data integrity
      const integrityCheck = await weekRepository.verifyDataIntegrity(week.id);
      expect(integrityCheck).toBe(true);
    });
  });

  describe('Navigation and Data Persistence Integration', () => {
    test('should maintain data consistency after simulated navigation', async () => {
      const week = testWeeks[0];
      const player = testPlayers[0];

      // Set initial availability
      await playerManager.setPlayerAvailabilityAtomic(player.id, week.id, true);

      // Verify initial state
      expect(await playerManager.getPlayerAvailability(player.id, week.id)).toBe(true);

      // Simulate navigation away and back (refresh from persistence)
      await availabilityUI.refreshFromPersistence();

      // Verify data is still consistent after refresh
      expect(await playerManager.getPlayerAvailability(player.id, week.id)).toBe(true);

      // Verify UI data consistency
      const consistencyCheck = await availabilityUI.verifyDataConsistency();
      expect(consistencyCheck).toBe(true);
    });

    test('should handle data freshness verification correctly', async () => {
      const week = testWeeks[0];

      // Set some availability data
      await playerManager.setPlayerAvailabilityAtomic(testPlayers[0].id, week.id, true);
      await playerManager.setPlayerAvailabilityAtomic(testPlayers[1].id, week.id, false);

      // Get initial freshness info
      const initialFreshness = availabilityUI.getDataFreshnessInfo();
      expect(initialFreshness.lastRefresh).toBeTruthy();
      expect(initialFreshness.isStale).toBe(false);

      // Force refresh and verify freshness is updated
      await availabilityUI.forceRefreshFromPersistence();

      const updatedFreshness = availabilityUI.getDataFreshnessInfo();
      expect(updatedFreshness.lastRefresh).toBeTruthy();
      expect(updatedFreshness.isStale).toBe(false);
      expect(updatedFreshness.lastRefresh!.getTime()).toBeGreaterThan(initialFreshness.lastRefresh!.getTime());
    });

    test('should detect and handle stale data correctly', async () => {
      const week = testWeeks[0];
      const player = testPlayers[0];

      // Set initial data
      await playerManager.setPlayerAvailabilityAtomic(player.id, week.id, true);

      // Set a very short staleness threshold for testing
      availabilityUI.setStalenessThreshold(1); // 1ms

      // Wait to make data stale
      await new Promise(resolve => setTimeout(resolve, 10));

      // Check that data is now considered stale
      const freshnessInfo = availabilityUI.getDataFreshnessInfo();
      expect(freshnessInfo.isStale).toBe(true);

      // Refresh should update the timestamp
      await availabilityUI.refreshFromPersistence();

      const updatedFreshnessInfo = availabilityUI.getDataFreshnessInfo();
      expect(updatedFreshnessInfo.isStale).toBe(false);
    });
  });

  describe('Error Handling and Recovery Integration', () => {
    test('should handle localStorage errors gracefully', async () => {
      const week = testWeeks[0];
      const player = testPlayers[0];

      // Mock localStorage to throw an error
      const originalSetItem = localStorageMock.setItem;
      localStorageMock.setItem = jest.fn(() => {
        throw new Error('Storage quota exceeded');
      });

      // Attempt to set availability (should handle error gracefully)
      await expect(
        playerManager.setPlayerAvailabilityAtomic(player.id, week.id, true)
      ).rejects.toThrow();

      // Restore localStorage
      localStorageMock.setItem = originalSetItem;

      // Verify system can recover
      await playerManager.setPlayerAvailabilityAtomic(player.id, week.id, true);
      expect(await playerManager.getPlayerAvailability(player.id, week.id)).toBe(true);
    });

    test('should handle verification failures correctly', async () => {
      const week = testWeeks[0];
      const player = testPlayers[0];

      // Set availability
      await playerManager.setPlayerAvailabilityAtomic(player.id, week.id, true);

      // Mock verification to fail
      const originalGetPlayerAvailability = playerManager.getPlayerAvailability;
      playerManager.getPlayerAvailability = jest.fn().mockResolvedValue(false);

      // Verification should fail
      const verificationResult = await playerManager.verifyAvailabilityPersisted(player.id, week.id, true);
      expect(verificationResult).toBe(false);

      // Restore original method
      playerManager.getPlayerAvailability = originalGetPlayerAvailability;

      // Verification should now succeed
      const restoredVerification = await playerManager.verifyAvailabilityPersisted(player.id, week.id, true);
      expect(restoredVerification).toBe(true);
    });

    test('should handle bulk operation partial failures with rollback', async () => {
      const week = testWeeks[0];
      const playerIds = testPlayers.map(p => p.id);

      // Set initial state
      await playerManager.setBulkAvailabilityAtomic(week.id, playerIds, false);

      // Mock the repository's setBulkAvailabilityVerified to fail
      const originalSetBulkAvailabilityVerified = weekRepository.setBulkAvailabilityVerified;
      weekRepository.setBulkAvailabilityVerified = jest.fn().mockResolvedValue({
        success: false,
        verifiedCount: 2,
        totalCount: 4,
        failedPlayerIds: [playerIds[2], playerIds[3]],
        error: 'Partial failure: 2 players failed verification',
        timestamp: new Date()
      });

      // Bulk operation should fail and rollback
      await expect(
        playerManager.setBulkAvailabilityAtomic(week.id, playerIds, true)
      ).rejects.toThrow();

      // Restore original method
      weekRepository.setBulkAvailabilityVerified = originalSetBulkAvailabilityVerified;

      // Verify all players are still in original state (false)
      for (const player of testPlayers) {
        const availability = await playerManager.getPlayerAvailability(player.id, week.id);
        expect(availability).toBe(false);
      }
    });
  });

  describe('Data Consistency and Verification Integration', () => {
    test('should provide comprehensive data integrity reporting', async () => {
      const week = testWeeks[0];

      // Set mixed availability states
      await playerManager.setPlayerAvailabilityAtomic(testPlayers[0].id, week.id, true);
      await playerManager.setPlayerAvailabilityAtomic(testPlayers[1].id, week.id, false);

      // Ensure UI is initialized with the correct week selected
      (availabilityUI as any).state.selectedWeek = week;
      
      // Refresh UI data to ensure consistency
      await availabilityUI.refreshFromPersistence();

      // Get comprehensive integrity report
      const integrityReport = await availabilityUI.getDataIntegrityReport();

      expect(integrityReport.weekId).toBe(week.id);
      expect(integrityReport.weekNumber).toBe(week.weekNumber);
      expect(integrityReport.isConsistent).toBe(true);
      expect(integrityReport.totalPlayers).toBe(testPlayers.length);
      expect(integrityReport.checkedPlayers).toBe(testPlayers.length);
      expect(integrityReport.discrepancies).toHaveLength(0);
      expect(integrityReport.lastRefresh).toBeTruthy();
    });

    test('should detect and report data inconsistencies', async () => {
      const week = testWeeks[0];
      const player = testPlayers[0];

      // Set availability through PlayerManager
      await playerManager.setPlayerAvailabilityAtomic(player.id, week.id, true);

      // Manually corrupt the UI state to simulate inconsistency
      const uiState = (availabilityUI as any).state;
      if (!uiState.playerAvailability.has(week.id)) {
        uiState.playerAvailability.set(week.id, new Map());
      }
      uiState.playerAvailability.get(week.id).set(player.id, false); // UI shows false, storage has true

      // Verify inconsistency is detected
      const consistencyCheck = await availabilityUI.verifyDataConsistency();
      expect(consistencyCheck).toBe(false);

      // Get detailed report
      const detailedReport = await availabilityUI.verifyDataConsistencyDetailed();
      expect(detailedReport.isConsistent).toBe(false);
      expect(detailedReport.discrepancies).toHaveLength(1);
      expect(detailedReport.discrepancies[0].playerId).toBe(player.id);
      expect(detailedReport.discrepancies[0].uiState).toBe(false);
      expect(detailedReport.discrepancies[0].persistedState).toBe(true);
    });

    test('should handle backup and restore operations correctly', async () => {
      const week = testWeeks[0];

      // Set initial availability states
      await playerManager.setPlayerAvailabilityAtomic(testPlayers[0].id, week.id, true);
      await playerManager.setPlayerAvailabilityAtomic(testPlayers[1].id, week.id, false);

      // Create backup
      const backupId = await weekRepository.createBackup(week.id);
      expect(backupId).toBeTruthy();

      // Modify availability
      await playerManager.setPlayerAvailabilityAtomic(testPlayers[0].id, week.id, false);
      await playerManager.setPlayerAvailabilityAtomic(testPlayers[1].id, week.id, true);

      // Verify changes
      expect(await playerManager.getPlayerAvailability(testPlayers[0].id, week.id)).toBe(false);
      expect(await playerManager.getPlayerAvailability(testPlayers[1].id, week.id)).toBe(true);

      // Restore from backup
      const restoreSuccess = await weekRepository.restoreFromBackup(week.id, backupId);
      expect(restoreSuccess).toBe(true);

      // Verify original state is restored
      expect(await playerManager.getPlayerAvailability(testPlayers[0].id, week.id)).toBe(true);
      expect(await playerManager.getPlayerAvailability(testPlayers[1].id, week.id)).toBe(false);
    });
  });

  describe('Concurrent Operations and Atomicity Integration', () => {
    test('should handle concurrent individual operations correctly', async () => {
      const week = testWeeks[0];
      const player = testPlayers[0];

      // Start multiple concurrent operations
      const operations = [
        playerManager.setPlayerAvailabilityAtomic(player.id, week.id, true),
        playerManager.setPlayerAvailabilityAtomic(player.id, week.id, false),
        playerManager.setPlayerAvailabilityAtomic(player.id, week.id, true)
      ];

      // Wait for all operations to complete
      await Promise.all(operations);

      // Final state should be consistent (last operation wins)
      const finalAvailability = await playerManager.getPlayerAvailability(player.id, week.id);
      expect(typeof finalAvailability).toBe('boolean');

      // Verify data integrity
      const integrityCheck = await weekRepository.verifyDataIntegrity(week.id);
      expect(integrityCheck).toBe(true);
    });

    test('should handle concurrent bulk operations correctly', async () => {
      const week = testWeeks[0];
      const playerIds = testPlayers.map(p => p.id);

      // Start multiple concurrent bulk operations
      const operations = [
        playerManager.setBulkAvailabilityAtomic(week.id, playerIds, true),
        playerManager.setBulkAvailabilityAtomic(week.id, playerIds, false)
      ];

      // Wait for all operations to complete
      await Promise.all(operations);

      // Verify final state is consistent
      const firstPlayerAvailability = await playerManager.getPlayerAvailability(testPlayers[0].id, week.id);
      
      // All players should have the same availability (atomic bulk operation)
      for (const player of testPlayers) {
        const availability = await playerManager.getPlayerAvailability(player.id, week.id);
        expect(availability).toBe(firstPlayerAvailability);
      }

      // Verify data integrity
      const integrityCheck = await weekRepository.verifyDataIntegrity(week.id);
      expect(integrityCheck).toBe(true);
    });
  });

  describe('Complete End-to-End Workflow Integration', () => {
    test('should handle complete availability management session', async () => {
      const week = testWeeks[0];

      // Simulate a complete user session
      
      // 1. User navigates to availability management
      await availabilityUI.initialize(testSeason);
      
      // 2. User marks all players available
      const playerIds = testPlayers.map(p => p.id);
      await playerManager.setBulkAvailabilityAtomic(week.id, playerIds, true);
      
      // 3. Verify all are available
      for (const player of testPlayers) {
        expect(await playerManager.getPlayerAvailability(player.id, week.id)).toBe(true);
      }
      
      // 4. User toggles one player to unavailable
      await playerManager.setPlayerAvailabilityAtomic(testPlayers[0].id, week.id, false);
      
      // 5. User navigates away (simulate by refreshing data)
      await availabilityUI.refreshFromPersistence();
      
      // 6. User returns and data should be preserved
      expect(await playerManager.getPlayerAvailability(testPlayers[0].id, week.id)).toBe(false);
      expect(await playerManager.getPlayerAvailability(testPlayers[1].id, week.id)).toBe(true);
      expect(await playerManager.getPlayerAvailability(testPlayers[2].id, week.id)).toBe(true);
      expect(await playerManager.getPlayerAvailability(testPlayers[3].id, week.id)).toBe(true);
      
      // 7. Verify data consistency
      const consistencyCheck = await availabilityUI.verifyDataConsistency();
      expect(consistencyCheck).toBe(true);
      
      // 8. User marks all unavailable
      await playerManager.setBulkAvailabilityAtomic(week.id, playerIds, false);
      
      // 9. Final verification
      for (const player of testPlayers) {
        expect(await playerManager.getPlayerAvailability(player.id, week.id)).toBe(false);
      }
      
      // 10. Final data integrity check
      const finalIntegrityCheck = await weekRepository.verifyDataIntegrity(week.id);
      expect(finalIntegrityCheck).toBe(true);
    });

    test('should handle multi-week availability management', async () => {
      // Set availability for multiple weeks
      for (let weekIndex = 0; weekIndex < testWeeks.length; weekIndex++) {
        const week = testWeeks[weekIndex];
        
        // Set different patterns for each week
        for (let playerIndex = 0; playerIndex < testPlayers.length; playerIndex++) {
          const player = testPlayers[playerIndex];
          const available = (weekIndex + playerIndex) % 2 === 0;
          
          await playerManager.setPlayerAvailabilityAtomic(player.id, week.id, available);
        }
      }

      // Verify each week's data
      for (let weekIndex = 0; weekIndex < testWeeks.length; weekIndex++) {
        const week = testWeeks[weekIndex];
        
        for (let playerIndex = 0; playerIndex < testPlayers.length; playerIndex++) {
          const player = testPlayers[playerIndex];
          const expectedAvailable = (weekIndex + playerIndex) % 2 === 0;
          
          const actualAvailable = await playerManager.getPlayerAvailability(player.id, week.id);
          expect(actualAvailable).toBe(expectedAvailable);
        }

        // Verify data integrity for each week
        const integrityCheck = await weekRepository.verifyDataIntegrity(week.id);
        expect(integrityCheck).toBe(true);
      }
    });
  });
});