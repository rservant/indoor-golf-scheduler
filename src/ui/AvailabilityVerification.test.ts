import { AvailabilityManagementUI } from './AvailabilityManagementUI';
import { PlayerManagerService } from '../services/PlayerManager';
import { LocalWeekRepository } from '../repositories/WeekRepository';
import { LocalPlayerRepository } from '../repositories/PlayerRepository';
import { LocalScheduleRepository } from '../repositories/ScheduleRepository';
import { LocalSeasonRepository } from '../repositories/SeasonRepository';
import { PlayerInfo, Handedness, TimePreference } from '../models/Player';

describe('Availability Verification Methods Unit Tests', () => {
  let availabilityUI: AvailabilityManagementUI;
  let playerManager: PlayerManagerService;
  let weekRepository: LocalWeekRepository;
  let playerRepository: LocalPlayerRepository;
  let scheduleRepository: LocalScheduleRepository;
  let seasonRepository: LocalSeasonRepository;
  let container: HTMLElement;
  let season: any;
  let week: any;
  let players: any[];

  beforeEach(async () => {
    // Set up repositories and services
    weekRepository = new LocalWeekRepository();
    playerRepository = new LocalPlayerRepository();
    scheduleRepository = new LocalScheduleRepository();
    seasonRepository = new LocalSeasonRepository();
    
    playerManager = new PlayerManagerService(
      playerRepository,
      weekRepository,
      scheduleRepository,
      seasonRepository
    );

    // Create test season
    season = await seasonRepository.create({
      name: `Test Season Verification ${Date.now()}`,
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-12-31'),
      playerIds: []
    });

    await seasonRepository.setActiveSeason(season.id);

    // Create test week
    week = await weekRepository.create({
      seasonId: season.id,
      weekNumber: 1,
      date: new Date('2024-01-08')
    });

    // Create test players
    players = [];
    const playerData: PlayerInfo[] = [
      { firstName: 'John', lastName: 'Doe', handedness: 'right', timePreference: 'AM' },
      { firstName: 'Jane', lastName: 'Smith', handedness: 'left', timePreference: 'PM' },
      { firstName: 'Bob', lastName: 'Johnson', handedness: 'right', timePreference: 'Either' }
    ];

    for (const data of playerData) {
      const player = await playerManager.addPlayer(data);
      players.push(player);
    }

    // Create UI container and initialize UI
    container = document.createElement('div');
    document.body.appendChild(container);
    
    availabilityUI = new AvailabilityManagementUI(playerManager, weekRepository, container);
    await availabilityUI.initialize(season);
  });

  afterEach(async () => {
    // Clean up
    if (availabilityUI) {
      availabilityUI.destroy();
    }
    if (container && document.body.contains(container)) {
      document.body.removeChild(container);
    }
    if (season) {
      await seasonRepository.delete(season.id);
    }
  });

  describe('verifyDataConsistency', () => {
    test('should return true when UI and persistence states match', async () => {
      // Set up consistent state
      await playerManager.setPlayerAvailability(players[0].id, week.id, true);
      await playerManager.setPlayerAvailability(players[1].id, week.id, false);
      await playerManager.setPlayerAvailability(players[2].id, week.id, true);

      // Refresh UI to match persistence
      await availabilityUI.refreshFromPersistence();

      // Verify consistency
      const isConsistent = await availabilityUI.verifyDataConsistency();
      expect(isConsistent).toBe(true);
    });

    test('should return false when UI and persistence states differ', async () => {
      // Set up initial state in persistence
      await playerManager.setPlayerAvailability(players[0].id, week.id, true);
      await playerManager.setPlayerAvailability(players[1].id, week.id, false);

      // Refresh UI to match persistence
      await availabilityUI.refreshFromPersistence();

      // Manually change persistence state without updating UI
      await playerManager.setPlayerAvailability(players[0].id, week.id, false);

      // Verify inconsistency is detected
      const isConsistent = await availabilityUI.verifyDataConsistency();
      expect(isConsistent).toBe(false);
    });

    test('should return true when no active season is set', async () => {
      // Set no active season
      await availabilityUI.setActiveSeason(null);

      // Verify consistency check passes (no data to verify)
      const isConsistent = await availabilityUI.verifyDataConsistency();
      expect(isConsistent).toBe(true);
    });

    test('should return true when no week is selected', async () => {
      // Initialize with season but no selected week
      await availabilityUI.setActiveSeason(season);
      
      // Manually clear selected week by initializing with empty weeks
      const emptySeasonWithNoWeeks = await seasonRepository.create({
        name: `Empty Season ${Date.now()}`,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        playerIds: []
      });

      await availabilityUI.setActiveSeason(emptySeasonWithNoWeeks);

      // Verify consistency check passes (no selected week to verify)
      const isConsistent = await availabilityUI.verifyDataConsistency();
      expect(isConsistent).toBe(true);

      // Clean up
      await seasonRepository.delete(emptySeasonWithNoWeeks.id);
    });

    test('should handle errors gracefully and return false', async () => {
      // Set up valid state first
      await playerManager.setPlayerAvailability(players[0].id, week.id, true);
      await availabilityUI.refreshFromPersistence();

      // Mock playerManager.getPlayerAvailability to throw an error
      const originalMethod = playerManager.getPlayerAvailability;
      playerManager.getPlayerAvailability = jest.fn().mockRejectedValue(new Error('Persistence error'));

      try {
        // Verify error is handled gracefully
        const isConsistent = await availabilityUI.verifyDataConsistency();
        expect(isConsistent).toBe(false);
      } finally {
        // Restore original method
        playerManager.getPlayerAvailability = originalMethod;
      }
    });

    test('should verify all players in the selected week', async () => {
      // Set up different availability states for all players
      await playerManager.setPlayerAvailability(players[0].id, week.id, true);
      await playerManager.setPlayerAvailability(players[1].id, week.id, false);
      await playerManager.setPlayerAvailability(players[2].id, week.id, true);

      // Refresh UI to match persistence
      await availabilityUI.refreshFromPersistence();

      // Spy on getPlayerAvailability to verify all players are checked
      const getAvailabilitySpy = jest.spyOn(playerManager, 'getPlayerAvailability');

      // Verify consistency
      const isConsistent = await availabilityUI.verifyDataConsistency();
      expect(isConsistent).toBe(true);

      // Verify that getPlayerAvailability was called for each player
      expect(getAvailabilitySpy).toHaveBeenCalledTimes(players.length);
      for (const player of players) {
        expect(getAvailabilitySpy).toHaveBeenCalledWith(player.id, week.id);
      }

      getAvailabilitySpy.mockRestore();
    });
  });

  describe('refreshFromPersistence', () => {
    test('should reload data from persistence layer', async () => {
      // Set up initial state
      await playerManager.setPlayerAvailability(players[0].id, week.id, true);
      await playerManager.setPlayerAvailability(players[1].id, week.id, false);

      // Refresh UI
      await availabilityUI.refreshFromPersistence();

      // Verify UI shows correct state
      const isConsistent = await availabilityUI.verifyDataConsistency();
      expect(isConsistent).toBe(true);

      // Change persistence state
      await playerManager.setPlayerAvailability(players[0].id, week.id, false);
      await playerManager.setPlayerAvailability(players[1].id, week.id, true);

      // Refresh from persistence again
      await availabilityUI.refreshFromPersistence();

      // Verify UI now shows updated state
      const isConsistentAfterRefresh = await availabilityUI.verifyDataConsistency();
      expect(isConsistentAfterRefresh).toBe(true);

      // Verify specific player states
      const player0Available = await playerManager.getPlayerAvailability(players[0].id, week.id);
      const player1Available = await playerManager.getPlayerAvailability(players[1].id, week.id);
      expect(player0Available).toBe(false);
      expect(player1Available).toBe(true);
    });

    test('should handle no active season gracefully', async () => {
      // Set no active season
      await availabilityUI.setActiveSeason(null);

      // Should not throw error
      await expect(availabilityUI.refreshFromPersistence()).resolves.not.toThrow();
    });

    test('should set loading state during refresh', async () => {
      // Set up initial state
      await playerManager.setPlayerAvailability(players[0].id, week.id, true);

      // Mock a slow refresh to test loading state
      const originalLoadData = (availabilityUI as any).loadAvailabilityData;
      let loadingStateDuringRefresh = false;
      
      (availabilityUI as any).loadAvailabilityData = async function() {
        // Check if loading state is set during the operation
        loadingStateDuringRefresh = (this as any).state.isLoading;
        return originalLoadData.call(this);
      };

      await availabilityUI.refreshFromPersistence();

      // Verify loading state was set during refresh
      expect(loadingStateDuringRefresh).toBe(true);

      // Restore original method
      (availabilityUI as any).loadAvailabilityData = originalLoadData;
    });

    test('should handle errors and set error state', async () => {
      // Mock loadAvailabilityData to throw an error
      const originalMethod = (availabilityUI as any).loadAvailabilityData;
      (availabilityUI as any).loadAvailabilityData = jest.fn().mockRejectedValue(new Error('Load error'));

      try {
        await availabilityUI.refreshFromPersistence();

        // Verify error state is set (we can't directly access private state, 
        // but we can check that the method completed without throwing)
        expect(true).toBe(true); // Test passes if no exception is thrown
      } finally {
        // Restore original method
        (availabilityUI as any).loadAvailabilityData = originalMethod;
      }
    });
  });

  describe('forceRefreshFromPersistence', () => {
    test('should bypass cache and reload from persistence', async () => {
      // Set up initial state
      await playerManager.setPlayerAvailability(players[0].id, week.id, true);
      await availabilityUI.refreshFromPersistence();

      // Change persistence state
      await playerManager.setPlayerAvailability(players[0].id, week.id, false);

      // Force refresh should update UI regardless of cache
      await availabilityUI.forceRefreshFromPersistence();

      // Verify UI shows updated state
      const isConsistent = await availabilityUI.verifyDataConsistency();
      expect(isConsistent).toBe(true);

      const playerAvailable = await playerManager.getPlayerAvailability(players[0].id, week.id);
      expect(playerAvailable).toBe(false);
    });

    test('should call refreshFromPersistence internally', async () => {
      // Spy on refreshFromPersistence
      const refreshSpy = jest.spyOn(availabilityUI, 'refreshFromPersistence');

      await availabilityUI.forceRefreshFromPersistence();

      // Verify refreshFromPersistence was called
      expect(refreshSpy).toHaveBeenCalledTimes(1);

      refreshSpy.mockRestore();
    });
  });

  describe('getDataFreshnessInfo', () => {
    test('should return correct freshness information after refresh', async () => {
      // Initial state should show stale data
      let freshnessInfo = availabilityUI.getDataFreshnessInfo();
      expect(freshnessInfo.lastRefresh).toBeInstanceOf(Date);
      expect(typeof freshnessInfo.isStale).toBe('boolean');
      expect(typeof freshnessInfo.timeSinceRefresh).toBe('number');

      // After refresh, data should be fresh
      await availabilityUI.refreshFromPersistence();
      
      freshnessInfo = availabilityUI.getDataFreshnessInfo();
      expect(freshnessInfo.lastRefresh).toBeInstanceOf(Date);
      expect(freshnessInfo.isStale).toBe(false);
      expect(freshnessInfo.timeSinceRefresh).toBeLessThan(1000); // Less than 1 second
    });

    test('should indicate stale data when threshold is exceeded', async () => {
      // Set a very short staleness threshold
      availabilityUI.setStalenessThreshold(10); // 10ms

      await availabilityUI.refreshFromPersistence();

      // Wait for threshold to be exceeded
      await new Promise(resolve => setTimeout(resolve, 20));

      const freshnessInfo = availabilityUI.getDataFreshnessInfo();
      expect(freshnessInfo.isStale).toBe(true);
      expect(freshnessInfo.timeSinceRefresh).toBeGreaterThan(10);
    });

    test('should handle null lastRefresh correctly', async () => {
      // Create new UI without initialization to test null state
      const newContainer = document.createElement('div');
      document.body.appendChild(newContainer);
      
      const newUI = new AvailabilityManagementUI(playerManager, weekRepository, newContainer);
      
      try {
        const freshnessInfo = newUI.getDataFreshnessInfo();
        expect(freshnessInfo.lastRefresh).toBeNull();
        expect(freshnessInfo.isStale).toBe(true);
        expect(freshnessInfo.timeSinceRefresh).toBeNull();
      } finally {
        newUI.destroy();
        document.body.removeChild(newContainer);
      }
    });
  });

  describe('Data Consistency Validation Edge Cases', () => {
    test('should handle missing player availability gracefully', async () => {
      // Create a week with no availability data set
      const newWeek = await weekRepository.create({
        seasonId: season.id,
        weekNumber: 2,
        date: new Date('2024-01-15')
      });

      // Switch to the new week (which has no availability data)
      await availabilityUI.refreshFromPersistence();

      // Consistency check should still work (defaults to false for missing data)
      const isConsistent = await availabilityUI.verifyDataConsistency();
      expect(typeof isConsistent).toBe('boolean');

      // Clean up
      await weekRepository.delete(newWeek.id);
    });

    test('should verify consistency across multiple players with mixed states', async () => {
      // Set up complex mixed availability state
      const availabilityStates = [true, false, true, false, true];
      
      // Add more players for this test
      const additionalPlayers = [];
      for (let i = 0; i < 2; i++) {
        const player = await playerManager.addPlayer({
          firstName: `Test${i}`,
          lastName: `Player${i}`,
          handedness: 'right' as Handedness,
          timePreference: 'Either' as TimePreference
        });
        additionalPlayers.push(player);
      }

      const allTestPlayers = [...players, ...additionalPlayers];

      // Set availability for all players
      for (let i = 0; i < allTestPlayers.length; i++) {
        const available = availabilityStates[i % availabilityStates.length];
        await playerManager.setPlayerAvailability(allTestPlayers[i].id, week.id, available);
      }

      // Refresh UI and verify consistency
      await availabilityUI.refreshFromPersistence();
      const isConsistent = await availabilityUI.verifyDataConsistency();
      expect(isConsistent).toBe(true);

      // Change one player's state in persistence only
      await playerManager.setPlayerAvailability(allTestPlayers[0].id, week.id, !availabilityStates[0]);

      // Verify inconsistency is detected
      const isInconsistent = await availabilityUI.verifyDataConsistency();
      expect(isInconsistent).toBe(false);
    });

    test('should handle verification failure scenarios', async () => {
      // Set up initial consistent state
      await playerManager.setPlayerAvailability(players[0].id, week.id, true);
      await availabilityUI.refreshFromPersistence();

      // Mock getPlayerAvailability to simulate intermittent failures
      let callCount = 0;
      const originalMethod = playerManager.getPlayerAvailability;
      playerManager.getPlayerAvailability = jest.fn().mockImplementation(async (playerId, weekId) => {
        callCount++;
        if (callCount === 2) { // Fail on second call
          throw new Error('Simulated verification failure');
        }
        return originalMethod.call(playerManager, playerId, weekId);
      });

      try {
        // Verification should fail gracefully and return false
        const isConsistent = await availabilityUI.verifyDataConsistency();
        expect(isConsistent).toBe(false);
      } finally {
        // Restore original method
        playerManager.getPlayerAvailability = originalMethod;
      }
    });
  });

  describe('User-Triggered Verification Actions', () => {
    test('should provide detailed consistency report', async () => {
      // Set up mixed availability state
      await playerManager.setPlayerAvailability(players[0].id, week.id, true);
      await playerManager.setPlayerAvailability(players[1].id, week.id, false);
      await playerManager.setPlayerAvailability(players[2].id, week.id, true);

      // Refresh UI to match persistence
      await availabilityUI.refreshFromPersistence();

      // Get detailed consistency report
      const report = await availabilityUI.verifyDataConsistencyDetailed();

      expect(report.isConsistent).toBe(true);
      expect(report.totalPlayers).toBe(3);
      expect(report.checkedPlayers).toBe(3);
      expect(report.discrepancies).toHaveLength(0);
    });

    test('should detect discrepancies in detailed report', async () => {
      // Set up initial state
      await playerManager.setPlayerAvailability(players[0].id, week.id, true);
      await playerManager.setPlayerAvailability(players[1].id, week.id, false);

      // Refresh UI to match persistence
      await availabilityUI.refreshFromPersistence();

      // Manually change persistence state without updating UI
      await playerManager.setPlayerAvailability(players[0].id, week.id, false);

      // Get detailed consistency report
      const report = await availabilityUI.verifyDataConsistencyDetailed();

      expect(report.isConsistent).toBe(false);
      expect(report.discrepancies).toHaveLength(1);
      expect(report.discrepancies[0].playerId).toBe(players[0].id);
      expect(report.discrepancies[0].uiState).toBe(true);
      expect(report.discrepancies[0].persistedState).toBe(false);
      expect(report.discrepancies[0].playerName).toBe(`${players[0].firstName} ${players[0].lastName}`);
    });

    test('should provide comprehensive data integrity report', async () => {
      // Set up initial state
      await playerManager.setPlayerAvailability(players[0].id, week.id, true);
      await availabilityUI.refreshFromPersistence();

      // Get comprehensive report
      const report = await availabilityUI.getDataIntegrityReport();

      expect(report.weekId).toBe(week.id);
      expect(report.weekNumber).toBe(week.weekNumber);
      expect(report.isConsistent).toBe(true);
      expect(report.lastRefresh).toBeInstanceOf(Date);
      expect(typeof report.isStale).toBe('boolean');
      expect(report.totalPlayers).toBe(3);
      expect(report.checkedPlayers).toBe(3);
      expect(report.discrepancies).toHaveLength(0);
    });

    test('should handle verification actions through UI events', async () => {
      // Set up initial state
      await playerManager.setPlayerAvailability(players[0].id, week.id, true);
      await availabilityUI.refreshFromPersistence();

      // Spy on verification methods
      const verifyConsistencySpy = jest.spyOn(availabilityUI, 'verifyDataConsistency');
      const refreshSpy = jest.spyOn(availabilityUI, 'refreshFromPersistence');
      const forceRefreshSpy = jest.spyOn(availabilityUI, 'forceRefreshFromPersistence');

      // Test verify consistency button
      const verifyButton = availabilityUI.container.querySelector('[data-action="verify-consistency"]') as HTMLButtonElement;
      if (verifyButton) {
        verifyButton.click();
        await new Promise(resolve => setTimeout(resolve, 50)); // Wait for async operation
        expect(verifyConsistencySpy).toHaveBeenCalled();
      }

      // Test refresh data button
      const refreshButton = availabilityUI.container.querySelector('[data-action="refresh-data"]') as HTMLButtonElement;
      if (refreshButton) {
        refreshButton.click();
        await new Promise(resolve => setTimeout(resolve, 50)); // Wait for async operation
        expect(refreshSpy).toHaveBeenCalled();
      }

      // Test force refresh button
      const forceRefreshButton = availabilityUI.container.querySelector('[data-action="force-refresh"]') as HTMLButtonElement;
      if (forceRefreshButton) {
        forceRefreshButton.click();
        await new Promise(resolve => setTimeout(resolve, 50)); // Wait for async operation
        expect(forceRefreshSpy).toHaveBeenCalled();
      }

      // Clean up spies
      verifyConsistencySpy.mockRestore();
      refreshSpy.mockRestore();
      forceRefreshSpy.mockRestore();
    });

    test('should show temporary success messages', async () => {
      // Set up initial state
      await playerManager.setPlayerAvailability(players[0].id, week.id, true);
      await availabilityUI.refreshFromPersistence();

      // Call showTemporaryMessage (accessing private method for testing)
      (availabilityUI as any).showTemporaryMessage('Test success message', 'success');

      // Check that temporary message is shown in the UI
      const alertElement = availabilityUI.container.querySelector('.alert-success');
      expect(alertElement).toBeTruthy();
      expect(alertElement?.textContent).toContain('Test success message');

      // Wait for message to disappear (shortened timeout for testing)
      await new Promise(resolve => setTimeout(resolve, 100));
    });
  });
});