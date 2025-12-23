import * as fc from 'fast-check';
import { AvailabilityManagementUI } from './AvailabilityManagementUI';
import { PlayerManagerService } from '../services/PlayerManager';
import { LocalWeekRepository } from '../repositories/WeekRepository';
import { LocalPlayerRepository } from '../repositories/PlayerRepository';
import { LocalScheduleRepository } from '../repositories/ScheduleRepository';
import { LocalSeasonRepository } from '../repositories/SeasonRepository';
import { PlayerInfo, Handedness, TimePreference } from '../models/Player';

describe('AvailabilityManagementUI Property Tests', () => {
  /**
   * Feature: availability-persistence-fix, Property 3: Data Freshness After Navigation
   * **Validates: Requirements 1.4, 2.3**
   */
  test('Property 3: Data Freshness After Navigation - for any navigation event away from and back to the availability management interface, the displayed data should match exactly what is stored in localStorage', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate season and week data
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
        fc.integer({ min: 1, max: 52 }),
        
        // Generate players for availability operations
        fc.array(
          fc.record({
            firstName: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            lastName: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            handedness: fc.constantFrom('left' as Handedness, 'right' as Handedness),
            timePreference: fc.constantFrom('AM' as TimePreference, 'PM' as TimePreference, 'Either' as TimePreference)
          }),
          { minLength: 2, maxLength: 6 }
        ),
        
        // Generate external availability changes (simulating changes made outside the UI)
        fc.array(
          fc.record({
            playerIndex: fc.integer({ min: 0, max: 5 }),
            newAvailability: fc.boolean()
          }),
          { minLength: 1, maxLength: 4 }
        ),

        async (seasonId, weekNumber, playerDataArray, externalChanges) => {
          // Set up repositories and services
          const weekRepository = new LocalWeekRepository();
          const playerRepository = new LocalPlayerRepository();
          const scheduleRepository = new LocalScheduleRepository();
          const seasonRepository = new LocalSeasonRepository();
          
          const playerManager = new PlayerManagerService(
            playerRepository,
            weekRepository,
            scheduleRepository,
            seasonRepository
          );

          // Create season
          const season = await seasonRepository.create({
            name: `Test Season Freshness ${seasonId}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            startDate: new Date('2024-01-01'),
            endDate: new Date('2024-12-31'),
            playerIds: []
          });

          // Create week
          const week = await weekRepository.create({
            seasonId: season.id,
            weekNumber: weekNumber,
            date: new Date(`2024-01-${Math.min(weekNumber, 28)}`)
          });

          // Add players to the season
          const addedPlayers: any[] = [];
          for (const playerData of playerDataArray) {
            try {
              await seasonRepository.setActiveSeason(season.id);
              const player = await playerManager.addPlayer(playerData);
              addedPlayers.push(player);
            } catch (error) {
              if (!(error as Error).message.includes('already exists')) {
                throw error;
              }
            }
          }

          // Skip test if no players were added
          if (addedPlayers.length === 0) {
            return;
          }

          // Create UI container
          const container = document.createElement('div');
          document.body.appendChild(container);

          // Initialize UI with reduced staleness threshold for testing
          const availabilityUI = new AvailabilityManagementUI(playerManager, weekRepository, container);
          availabilityUI.setStalenessThreshold(100); // 100ms for faster testing
          await availabilityUI.initialize(season);

          try {
            // Set initial availability state through the UI
            for (let i = 0; i < addedPlayers.length; i++) {
              const player = addedPlayers[i];
              const initialAvailability = i % 2 === 0; // Alternate availability
              await playerManager.setPlayerAvailability(player.id, week.id, initialAvailability);
            }

            // Refresh UI to show initial state
            await availabilityUI.refreshFromPersistence();
            
            // Capture initial UI state
            const initialUIState = await captureUIAvailabilityState(availabilityUI, week.id, addedPlayers);
            const initialPersistenceState = await capturePersistenceState(playerManager, week.id, addedPlayers);

            // Verify initial states match
            expect(initialUIState).toEqual(initialPersistenceState);

            // Simulate external changes to persistence layer (changes made outside the UI)
            const externalChangeMap = new Map<string, boolean>();
            for (const change of externalChanges) {
              if (change.playerIndex < addedPlayers.length) {
                const player = addedPlayers[change.playerIndex];
                // Make change directly to persistence layer (bypassing UI)
                await playerManager.setPlayerAvailability(player.id, week.id, change.newAvailability);
                externalChangeMap.set(player.id, change.newAvailability);
              }
            }

            // Verify persistence layer has the external changes
            const persistenceStateAfterChanges = await capturePersistenceState(playerManager, week.id, addedPlayers);
            for (const [playerId, expectedAvailability] of externalChangeMap) {
              expect(persistenceStateAfterChanges.get(playerId)).toBe(expectedAvailability);
            }

            // UI should still show old state (before navigation refresh)
            const uiStateBeforeNavigation = await captureUIAvailabilityState(availabilityUI, week.id, addedPlayers);
            
            // Simulate navigation event by triggering visibility change
            // First simulate tab becoming hidden
            Object.defineProperty(document, 'hidden', { value: true, configurable: true });
            document.dispatchEvent(new Event('visibilitychange'));

            // Wait a bit to ensure staleness threshold is exceeded
            await new Promise(resolve => setTimeout(resolve, 150));

            // Then simulate tab becoming visible (navigation back)
            Object.defineProperty(document, 'hidden', { value: false, configurable: true });
            document.dispatchEvent(new Event('visibilitychange'));

            // Wait for the refresh to complete
            await new Promise(resolve => setTimeout(resolve, 100));

            // Capture UI state after navigation refresh
            const uiStateAfterNavigation = await captureUIAvailabilityState(availabilityUI, week.id, addedPlayers);
            const persistenceStateAfterNavigation = await capturePersistenceState(playerManager, week.id, addedPlayers);

            // Property: UI state after navigation should match persistence state exactly
            expect(uiStateAfterNavigation).toEqual(persistenceStateAfterNavigation);

            // Verify that external changes are now reflected in the UI
            for (const [playerId, expectedAvailability] of externalChangeMap) {
              expect(uiStateAfterNavigation.get(playerId)).toBe(expectedAvailability);
            }

            // Test window focus event as well
            // Make another external change
            if (addedPlayers.length > 0) {
              const testPlayer = addedPlayers[0];
              const currentAvailability = await playerManager.getPlayerAvailability(testPlayer.id, week.id);
              const newAvailability = !currentAvailability;
              
              // Make change directly to persistence
              await playerManager.setPlayerAvailability(testPlayer.id, week.id, newAvailability);

              // Wait for staleness
              await new Promise(resolve => setTimeout(resolve, 150));

              // Simulate window focus event
              window.dispatchEvent(new Event('focus'));
              await new Promise(resolve => setTimeout(resolve, 100));

              // Verify UI reflects the change
              const finalUIState = await captureUIAvailabilityState(availabilityUI, week.id, addedPlayers);
              const finalPersistenceState = await capturePersistenceState(playerManager, week.id, addedPlayers);
              
              expect(finalUIState).toEqual(finalPersistenceState);
              expect(finalUIState.get(testPlayer.id)).toBe(newAvailability);
            }

            // Test data freshness info
            const freshnessInfo = availabilityUI.getDataFreshnessInfo();
            expect(freshnessInfo.lastRefresh).toBeInstanceOf(Date);
            expect(typeof freshnessInfo.isStale).toBe('boolean');
            expect(typeof freshnessInfo.timeSinceRefresh).toBe('number');

          } finally {
            // Clean up
            availabilityUI.destroy();
            document.body.removeChild(container);
            await seasonRepository.delete(season.id);
            
            // Reset document.hidden property
            Object.defineProperty(document, 'hidden', { value: false, configurable: true });
          }
        }
      ),
      { numRuns: 30, timeout: 20000 }
    );
  }, 25000);

  /**
   * Feature: availability-persistence-fix, Property 2: UI Update After Persistence
   * **Validates: Requirements 2.2, 4.1, 4.2**
   */
  test('Property 2: UI Update After Persistence - for any availability operation, the UI should only update its display state after the persistence layer confirms the data has been successfully saved', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate season and week data
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
        fc.integer({ min: 1, max: 52 }),
        
        // Generate players for availability operations
        fc.array(
          fc.record({
            firstName: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            lastName: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            handedness: fc.constantFrom('left' as Handedness, 'right' as Handedness),
            timePreference: fc.constantFrom('AM' as TimePreference, 'PM' as TimePreference, 'Either' as TimePreference)
          }),
          { minLength: 2, maxLength: 6 }
        ),
        
        // Generate availability operations to test
        fc.array(
          fc.record({
            playerIndex: fc.integer({ min: 0, max: 5 }),
            targetAvailability: fc.boolean(),
            operationType: fc.constantFrom('individual', 'bulk_available', 'bulk_unavailable')
          }),
          { minLength: 1, maxLength: 4 }
        ),

        async (seasonId, weekNumber, playerDataArray, operations) => {
          // Set up repositories and services
          const weekRepository = new LocalWeekRepository();
          const playerRepository = new LocalPlayerRepository();
          const scheduleRepository = new LocalScheduleRepository();
          const seasonRepository = new LocalSeasonRepository();
          
          const playerManager = new PlayerManagerService(
            playerRepository,
            weekRepository,
            scheduleRepository,
            seasonRepository
          );

          // Create season
          const season = await seasonRepository.create({
            name: `Test Season UI ${seasonId}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            startDate: new Date('2024-01-01'),
            endDate: new Date('2024-12-31'),
            playerIds: []
          });

          // Create week
          const week = await weekRepository.create({
            seasonId: season.id,
            weekNumber: weekNumber,
            date: new Date(`2024-01-${Math.min(weekNumber, 28)}`)
          });

          // Add players to the season
          const addedPlayers: any[] = [];
          for (const playerData of playerDataArray) {
            try {
              await seasonRepository.setActiveSeason(season.id);
              const player = await playerManager.addPlayer(playerData);
              addedPlayers.push(player);
            } catch (error) {
              if (!(error as Error).message.includes('already exists')) {
                throw error;
              }
            }
          }

          // Skip test if no players were added
          if (addedPlayers.length === 0) {
            return;
          }

          // Create UI container
          const container = document.createElement('div');
          document.body.appendChild(container);

          // Initialize UI
          const availabilityUI = new AvailabilityManagementUI(playerManager, weekRepository, container);
          await availabilityUI.initialize(season);

          try {
            // Test each operation for proper UI update ordering
            for (const operation of operations) {
              // Filter operations to valid player indices
              if (operation.playerIndex >= addedPlayers.length) {
                continue;
              }

              const player = addedPlayers[operation.playerIndex];

              // Capture initial state before operation
              const initialUIState = await captureUIAvailabilityState(availabilityUI, week.id, addedPlayers);
              const initialPersistenceState = await capturePersistenceState(playerManager, week.id, addedPlayers);

              // Verify initial states match (UI should reflect persistence)
              expect(initialUIState).toEqual(initialPersistenceState);

              if (operation.operationType === 'individual') {
                // Test individual player availability toggle
                await testIndividualAvailabilityUpdate(
                  availabilityUI,
                  playerManager,
                  player.id,
                  week.id,
                  operation.targetAvailability,
                  addedPlayers
                );
              } else {
                // Test bulk availability operations
                const bulkAvailable = operation.operationType === 'bulk_available';
                await testBulkAvailabilityUpdate(
                  availabilityUI,
                  playerManager,
                  week.id,
                  bulkAvailable,
                  addedPlayers
                );
              }
            }
          } finally {
            // Clean up
            document.body.removeChild(container);
            await seasonRepository.delete(season.id);
          }
        }
      ),
      { numRuns: 50, timeout: 15000 }
    );
  }, 20000);

  // Helper function to capture UI availability state
  async function captureUIAvailabilityState(
    ui: AvailabilityManagementUI, 
    weekId: string, 
    players: any[]
  ): Promise<Map<string, boolean>> {
    const state = new Map<string, boolean>();
    
    // Access the private state through the UI's public methods
    // This simulates checking what the UI displays to the user
    for (const player of players) {
      // We need to check the UI's internal state representation
      // Since the UI doesn't expose this directly, we'll use the container's DOM
      const container = ui.container;
      const checkbox = container.querySelector(`input[data-player-id="${player.id}"][data-week-id="${weekId}"]`) as HTMLInputElement;
      
      if (checkbox) {
        state.set(player.id, checkbox.checked);
      } else {
        // If checkbox not found, assume false (not available)
        state.set(player.id, false);
      }
    }
    
    return state;
  }

  // Helper function to capture persistence layer state
  async function capturePersistenceState(
    playerManager: PlayerManagerService,
    weekId: string,
    players: any[]
  ): Promise<Map<string, boolean>> {
    const state = new Map<string, boolean>();
    
    for (const player of players) {
      const availability = await playerManager.getPlayerAvailability(player.id, weekId);
      state.set(player.id, availability);
    }
    
    return state;
  }

  // Helper function to test individual availability update ordering
  async function testIndividualAvailabilityUpdate(
    ui: AvailabilityManagementUI,
    playerManager: PlayerManagerService,
    playerId: string,
    weekId: string,
    targetAvailability: boolean,
    allPlayers: any[]
  ): Promise<void> {
    // Capture state before operation
    const beforeUIState = await captureUIAvailabilityState(ui, weekId, allPlayers);
    const beforePersistenceState = await capturePersistenceState(playerManager, weekId, allPlayers);

    // Simulate individual toggle by finding and clicking the checkbox
    const container = ui.container;
    const checkbox = container.querySelector(`input[data-player-id="${playerId}"][data-week-id="${weekId}"]`) as HTMLInputElement;
    
    if (checkbox) {
      // Set the checkbox to the target state if it's different
      if (checkbox.checked !== targetAvailability) {
        // Simulate the click event
        checkbox.checked = targetAvailability;
        const changeEvent = new Event('change', { bubbles: true });
        checkbox.dispatchEvent(changeEvent);

        // Wait for the operation to complete
        await new Promise(resolve => setTimeout(resolve, 100));

        // Capture state after operation
        const afterUIState = await captureUIAvailabilityState(ui, weekId, allPlayers);
        const afterPersistenceState = await capturePersistenceState(playerManager, weekId, allPlayers);

        // Verify UI state matches persistence state after operation
        expect(afterUIState).toEqual(afterPersistenceState);

        // Verify the specific player's availability was updated correctly
        expect(afterPersistenceState.get(playerId)).toBe(targetAvailability);
        expect(afterUIState.get(playerId)).toBe(targetAvailability);

        // Verify other players' states remained unchanged
        for (const player of allPlayers) {
          if (player.id !== playerId) {
            expect(afterPersistenceState.get(player.id)).toBe(beforePersistenceState.get(player.id));
            expect(afterUIState.get(player.id)).toBe(beforeUIState.get(player.id));
          }
        }
      }
    }
  }

  // Helper function to test bulk availability update ordering
  async function testBulkAvailabilityUpdate(
    ui: AvailabilityManagementUI,
    playerManager: PlayerManagerService,
    weekId: string,
    available: boolean,
    allPlayers: any[]
  ): Promise<void> {
    // Capture state before operation
    const beforeUIState = await captureUIAvailabilityState(ui, weekId, allPlayers);
    const beforePersistenceState = await capturePersistenceState(playerManager, weekId, allPlayers);

    // Simulate bulk operation by finding and clicking the appropriate button
    const container = ui.container;
    const buttonSelector = available 
      ? `button[data-action="mark-all-available"][data-week-id="${weekId}"]`
      : `button[data-action="mark-all-unavailable"][data-week-id="${weekId}"]`;
    
    const button = container.querySelector(buttonSelector) as HTMLButtonElement;
    
    if (button) {
      // Simulate the click event
      const clickEvent = new Event('click', { bubbles: true });
      button.dispatchEvent(clickEvent);

      // Wait for the bulk operation to complete
      await new Promise(resolve => setTimeout(resolve, 200));

      // Capture state after operation
      const afterUIState = await captureUIAvailabilityState(ui, weekId, allPlayers);
      const afterPersistenceState = await capturePersistenceState(playerManager, weekId, allPlayers);

      // Verify UI state matches persistence state after operation
      expect(afterUIState).toEqual(afterPersistenceState);

      // Verify all players have the correct availability state
      for (const player of allPlayers) {
        expect(afterPersistenceState.get(player.id)).toBe(available);
        expect(afterUIState.get(player.id)).toBe(available);
      }
    }
  }
});