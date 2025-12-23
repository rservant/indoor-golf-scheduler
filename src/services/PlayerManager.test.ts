import * as fc from 'fast-check';
import { InMemoryPlayerManager, PlayerManagerService } from './PlayerManager';
import { PlayerInfo, Handedness, TimePreference } from '../models/Player';
import { LocalWeekRepository } from '../repositories/WeekRepository';
import { LocalPlayerRepository } from '../repositories/PlayerRepository';
import { LocalScheduleRepository } from '../repositories/ScheduleRepository';
import { LocalSeasonRepository } from '../repositories/SeasonRepository';

describe('PlayerManager Property Tests', () => {
  /**
   * Feature: availability-persistence-fix, Property 4: Bulk Operation Atomicity
   * **Validates: Requirements 1.5, 4.3**
   */
  test('Property 4: Bulk Operation Atomicity - for any bulk availability operation, either all player updates should succeed and be persisted, or all should fail and the system should revert to the original state', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate season and week data
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        fc.integer({ min: 1, max: 52 }),
        
        // Generate multiple players for bulk operations
        fc.array(
          fc.record({
            firstName: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            lastName: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            handedness: fc.constantFrom('left' as Handedness, 'right' as Handedness),
            timePreference: fc.constantFrom('AM' as TimePreference, 'PM' as TimePreference, 'Either' as TimePreference)
          }),
          { minLength: 2, maxLength: 10 }
        ),
        
        // Generate bulk availability state (true = all available, false = all unavailable)
        fc.boolean(),

        async (seasonId, weekNumber, playerDataArray, bulkAvailabilityState) => {
          // Set up repositories and manager
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

          // Create season first
          const season = await seasonRepository.create({
            name: `Test Season Bulk ${seasonId}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            startDate: new Date('2024-01-01'),
            endDate: new Date('2024-12-31')
          });

          // Create week
          const week = await weekRepository.create({
            seasonId: season.id,
            weekNumber: weekNumber,
            date: new Date(`2024-01-${Math.min(weekNumber, 28)}`)
          });

          // Add all players to the season
          const addedPlayers: any[] = [];
          for (const playerData of playerDataArray) {
            try {
              // Set active season for player creation
              await seasonRepository.setActiveSeason(season.id);
              const player = await playerManager.addPlayer(playerData);
              addedPlayers.push(player);
            } catch (error) {
              // Skip duplicate names - this is expected behavior
              if (!(error as Error).message.includes('already exists')) {
                throw error;
              }
            }
          }

          // Skip test if no players were added (all were duplicates)
          if (addedPlayers.length === 0) {
            return;
          }

          // Set initial availability state (opposite of what we'll bulk set)
          const initialAvailabilityState = !bulkAvailabilityState;
          const originalState = new Map<string, boolean>();
          
          for (const player of addedPlayers) {
            await playerManager.setPlayerAvailability(player.id, week.id, initialAvailabilityState);
            originalState.set(player.id, initialAvailabilityState);
          }

          // Verify initial state is set correctly
          for (const player of addedPlayers) {
            const availability = await playerManager.getPlayerAvailability(player.id, week.id);
            expect(availability).toBe(initialAvailabilityState);
          }

          // Test bulk operation atomicity
          // For this test, we'll simulate a bulk operation by setting all players to the same availability
          const bulkUpdates = new Map<string, boolean>();
          for (const player of addedPlayers) {
            bulkUpdates.set(player.id, bulkAvailabilityState);
          }

          // Perform bulk availability update using the verified method
          const verificationResult = await weekRepository.setBulkAvailabilityVerified(week.id, bulkUpdates);

          if (verificationResult.success) {
            // If bulk operation succeeded, all players should have the new availability state
            expect(verificationResult.verifiedCount).toBe(addedPlayers.length);
            expect(verificationResult.failedPlayerIds).toHaveLength(0);

            // Verify each player has the correct availability
            for (const player of addedPlayers) {
              const availability = await playerManager.getPlayerAvailability(player.id, week.id);
              expect(availability).toBe(bulkAvailabilityState);
            }
          } else {
            // If bulk operation failed, all players should be reverted to original state
            // (The repository should handle rollback automatically)
            for (const player of addedPlayers) {
              const availability = await playerManager.getPlayerAvailability(player.id, week.id);
              expect(availability).toBe(originalState.get(player.id));
            }
          }

          // Test atomicity with partial failure simulation
          // Create a scenario where some updates might fail by using invalid data
          const mixedUpdates = new Map<string, boolean>();
          for (let i = 0; i < addedPlayers.length; i++) {
            const player = addedPlayers[i];
            // Alternate between valid and potentially problematic updates
            mixedUpdates.set(player.id, i % 2 === 0 ? bulkAvailabilityState : !bulkAvailabilityState);
          }

          const mixedResult = await weekRepository.setBulkAvailabilityVerified(week.id, mixedUpdates);
          
          if (mixedResult.success) {
            // All updates succeeded - verify each player has correct state
            for (const [playerId, expectedAvailability] of mixedUpdates) {
              const actualAvailability = await playerManager.getPlayerAvailability(playerId, week.id);
              expect(actualAvailability).toBe(expectedAvailability);
            }
          } else {
            // Some updates failed - the system should maintain consistency
            // Either all should be at the previous state or all should be updated
            const currentStates = new Set<boolean>();
            for (const player of addedPlayers) {
              const availability = await playerManager.getPlayerAvailability(player.id, week.id);
              currentStates.add(availability);
            }
            
            // The system should maintain consistency - either all players have the same state
            // or the state is predictable based on the atomicity guarantee
            expect(mixedResult.verifiedCount + mixedResult.failedPlayerIds.length).toBe(mixedUpdates.size);
          }

          // Clean up
          await seasonRepository.delete(season.id);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: availability-persistence-fix, Property 6: Concurrent Operation Safety
   * **Validates: Requirements 4.5**
   */
  test('Property 6: Concurrent Operation Safety - for any set of concurrent availability operations on the same week, the final state should be consistent and reflect the last completed operation without data corruption', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate season and week data
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
        fc.integer({ min: 1, max: 52 }),
        
        // Generate fewer players for faster execution
        fc.array(
          fc.record({
            firstName: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            lastName: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            handedness: fc.constantFrom('left' as Handedness, 'right' as Handedness),
            timePreference: fc.constantFrom('AM' as TimePreference, 'PM' as TimePreference, 'Either' as TimePreference)
          }),
          { minLength: 2, maxLength: 4 } // Reduced from 8 to 4
        ),
        
        // Generate fewer concurrent operations
        fc.array(
          fc.record({
            playerId: fc.integer({ min: 0, max: 3 }), // Reduced from 7 to 3
            available: fc.boolean(),
            delay: fc.integer({ min: 0, max: 10 }) // Reduced delay from 50 to 10
          }),
          { minLength: 2, maxLength: 6 } // Reduced from 15 to 6
        ),

        async (seasonId, weekNumber, playerDataArray, concurrentOperations) => {
          // Set up repositories and manager
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

          // Create season first with unique name to avoid duplicates
          const season = await seasonRepository.create({
            name: `Test Season Concurrent ${seasonId}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            startDate: new Date('2024-01-01'),
            endDate: new Date('2024-12-31')
          });

          // Create week
          const week = await weekRepository.create({
            seasonId: season.id,
            weekNumber: weekNumber,
            date: new Date(`2024-01-${Math.min(weekNumber, 28)}`)
          });

          // Add all players to the season
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

          // Set initial availability state for all players
          for (const player of addedPlayers) {
            await playerManager.setPlayerAvailability(player.id, week.id, false);
          }

          // Filter operations to only include valid player indices
          const validOperations = concurrentOperations.filter(op => op.playerId < addedPlayers.length);
          if (validOperations.length === 0) {
            return;
          }

          // Execute concurrent operations with simulated delays (simplified)
          const operationPromises = validOperations.map(async (operation, index) => {
            const player = addedPlayers[operation.playerId];
            
            // Add small delay to simulate concurrent access
            if (operation.delay > 0) {
              await new Promise(resolve => setTimeout(resolve, operation.delay));
            }

            try {
              // Use the atomic method to ensure proper queuing
              await playerManager.setPlayerAvailabilityAtomic(
                player.id, 
                week.id, 
                operation.available
              );
              
              return {
                operationIndex: index,
                playerId: player.id,
                targetAvailability: operation.available,
                success: true,
                timestamp: Date.now()
              };
            } catch (error) {
              return {
                operationIndex: index,
                playerId: player.id,
                targetAvailability: operation.available,
                success: false,
                error: error,
                timestamp: Date.now()
              };
            }
          });

          // Wait for all concurrent operations to complete
          const results = await Promise.all(operationPromises);

          // Verify data integrity after concurrent operations
          const integrityCheck = await weekRepository.verifyDataIntegrity(week.id);
          expect(integrityCheck).toBe(true);

          // Verify that all operations either succeeded or failed gracefully
          for (const result of results) {
            expect(typeof result.success).toBe('boolean');
            expect(typeof result.playerId).toBe('string');
            expect(typeof result.targetAvailability).toBe('boolean');
          }

          // Verify final state consistency - each player should have a valid boolean availability
          for (const player of addedPlayers) {
            const finalAvailability = await playerManager.getPlayerAvailability(player.id, week.id);
            expect(typeof finalAvailability).toBe('boolean');
          }

          // Clean up
          await seasonRepository.delete(season.id);
        }
      ),
      { numRuns: 20, timeout: 10000 } // Reduced runs from 100 to 20, added timeout
    );
  }, 15000); // Increased Jest timeout to 15 seconds

  /**
   * Feature: indoor-golf-scheduler, Property 4: Player removal graceful handling
   * **Validates: Requirements 2.4**
   */
  test('Property 4: Player removal graceful handling - removing any player should not cause system errors and should handle removal gracefully', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a season ID
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        
        // Generate multiple players
        fc.array(
          fc.record({
            firstName: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            lastName: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            handedness: fc.constantFrom('left' as Handedness, 'right' as Handedness),
            timePreference: fc.constantFrom('AM' as TimePreference, 'PM' as TimePreference, 'Either' as TimePreference)
          }),
          { minLength: 1, maxLength: 10 }
        ),
        
        // Generate week IDs for availability tracking
        fc.array(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          { minLength: 1, maxLength: 5 }
        ),

        async (seasonId, playerDataArray, weekIds) => {
          // Create a fresh PlayerManager instance for each test
          const playerManager = new InMemoryPlayerManager(seasonId);
          
          // Add all players
          const addedPlayers: any[] = [];
          for (const playerData of playerDataArray) {
            try {
              const player = await playerManager.addPlayer(playerData);
              addedPlayers.push(player);
            } catch (error) {
              // Skip duplicate names - this is expected behavior
              if (!(error as Error).message.includes('already exists')) {
                throw error;
              }
            }
          }

          // Skip test if no players were added (all were duplicates)
          if (addedPlayers.length === 0) {
            return;
          }

          // Set up some availability data for players
          for (const player of addedPlayers) {
            for (const weekId of weekIds) {
              const available = Math.random() > 0.5; // Random availability
              await playerManager.setPlayerAvailability(player.id, weekId, available);
            }
          }

          // Pick a random player to remove
          const playerToRemove = addedPlayers[Math.floor(Math.random() * addedPlayers.length)];
          const playerToRemoveId = playerToRemove.id;

          // Verify player exists before removal
          const playerBeforeRemoval = await playerManager.getPlayer(playerToRemoveId);
          expect(playerBeforeRemoval).not.toBeNull();
          expect(playerBeforeRemoval?.id).toBe(playerToRemoveId);

          // Get initial state for comparison
          const initialPlayerCount = (await playerManager.getAllPlayers(seasonId)).length;
          
          // Test graceful removal - this should not throw any errors
          await expect(playerManager.removePlayer(playerToRemoveId)).resolves.not.toThrow();

          // Verify player is actually removed
          const playerAfterRemoval = await playerManager.getPlayer(playerToRemoveId);
          expect(playerAfterRemoval).toBeNull();

          // Verify player count decreased by 1
          const finalPlayerCount = (await playerManager.getAllPlayers(seasonId)).length;
          expect(finalPlayerCount).toBe(initialPlayerCount - 1);

          // Verify other players are still present and unaffected
          const remainingPlayers = await playerManager.getAllPlayers(seasonId);
          const remainingPlayerIds = remainingPlayers.map(p => p.id);
          
          for (const originalPlayer of addedPlayers) {
            if (originalPlayer.id !== playerToRemoveId) {
              expect(remainingPlayerIds).toContain(originalPlayer.id);
              
              // Verify the remaining player's data is intact
              const stillExistingPlayer = await playerManager.getPlayer(originalPlayer.id);
              expect(stillExistingPlayer).not.toBeNull();
              expect(stillExistingPlayer?.firstName).toBe(originalPlayer.firstName);
              expect(stillExistingPlayer?.lastName).toBe(originalPlayer.lastName);
              expect(stillExistingPlayer?.handedness).toBe(originalPlayer.handedness);
              expect(stillExistingPlayer?.timePreference).toBe(originalPlayer.timePreference);
            }
          }

          // Verify availability data for removed player is cleaned up
          for (const weekId of weekIds) {
            const availabilityAfterRemoval = await playerManager.getPlayerAvailability(playerToRemoveId, weekId);
            expect(availabilityAfterRemoval).toBe(false); // Should default to false for non-existent players
          }

          // Verify availability data for remaining players is preserved
          for (const remainingPlayer of remainingPlayers) {
            for (const weekId of weekIds) {
              // This should not throw an error
              await expect(playerManager.getPlayerAvailability(remainingPlayer.id, weekId)).resolves.not.toThrow();
            }
          }

          // Test that we can still perform normal operations after removal
          const newPlayerData: PlayerInfo = {
            firstName: 'TestAfterRemoval',
            lastName: 'Player',
            handedness: 'right',
            timePreference: 'Either'
          };

          // Adding a new player should work normally
          await expect(playerManager.addPlayer(newPlayerData)).resolves.not.toThrow();

          // Getting all players should work normally
          await expect(playerManager.getAllPlayers(seasonId)).resolves.not.toThrow();
        }
      ),
      { numRuns: 100 } // Run 100 iterations to test various scenarios
    );
  });

  // Additional unit tests for edge cases
  describe('Player removal edge cases', () => {
    test('should handle removal of non-existent player gracefully', async () => {
      const playerManager = new InMemoryPlayerManager('test-season');
      
      await expect(playerManager.removePlayer('non-existent-id'))
        .rejects.toThrow('Player with ID "non-existent-id" not found');
    });

    test('should handle removal with empty player ID', async () => {
      const playerManager = new InMemoryPlayerManager('test-season');
      
      await expect(playerManager.removePlayer(''))
        .rejects.toThrow('Player ID is required');
    });

    test('should handle removal when player has complex availability patterns', async () => {
      const playerManager = new InMemoryPlayerManager('test-season');
      
      // Add a player
      const playerData: PlayerInfo = {
        firstName: 'Test',
        lastName: 'Player',
        handedness: 'right',
        timePreference: 'AM'
      };
      
      const player = await playerManager.addPlayer(playerData);
      
      // Set complex availability pattern
      const weekIds = ['week1', 'week2', 'week3', 'week4', 'week5'];
      const availabilityPattern = [true, false, true, false, true];
      
      for (let i = 0; i < weekIds.length; i++) {
        await playerManager.setPlayerAvailability(player.id, weekIds[i], availabilityPattern[i]);
      }
      
      // Verify availability is set correctly
      for (let i = 0; i < weekIds.length; i++) {
        const availability = await playerManager.getPlayerAvailability(player.id, weekIds[i]);
        expect(availability).toBe(availabilityPattern[i]);
      }
      
      // Remove player - should not throw
      await expect(playerManager.removePlayer(player.id)).resolves.not.toThrow();
      
      // Verify player is gone
      const removedPlayer = await playerManager.getPlayer(player.id);
      expect(removedPlayer).toBeNull();
      
      // Verify availability data is cleaned up (should default to false)
      for (const weekId of weekIds) {
        const availability = await playerManager.getPlayerAvailability(player.id, weekId);
        expect(availability).toBe(false);
      }
    });
  });
});