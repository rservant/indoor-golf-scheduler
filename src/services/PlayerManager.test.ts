import * as fc from 'fast-check';
import { InMemoryPlayerManager } from './PlayerManager';
import { PlayerInfo, Handedness, TimePreference } from '../models/Player';

describe('PlayerManager Property Tests', () => {
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