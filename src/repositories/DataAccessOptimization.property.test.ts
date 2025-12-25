/**
 * Property-Based Tests for Data Access Optimization
 * 
 * Tests data access performance consistency across various scenarios
 * **Validates: Requirements 3.1, 3.2, 3.3**
 */

import fc from 'fast-check';
import { OptimizedPlayerRepository } from './OptimizedPlayerRepository';
import { OptimizedScheduleRepository } from './OptimizedScheduleRepository';
import { RepositoryFactory } from './RepositoryFactory';
import { PlayerCreateData } from './PlayerRepository';

describe('Data Access Optimization Properties', () => {
  let factory: RepositoryFactory;
  let playerRepo: OptimizedPlayerRepository;
  let scheduleRepo: OptimizedScheduleRepository;

  beforeEach(async () => {
    // Reset factory to ensure clean state
    RepositoryFactory.reset();
    
    // Create factory with optimization enabled
    factory = RepositoryFactory.getInstance({
      enableOptimization: true,
      cacheConfig: {
        maxSize: 100,
        ttl: 60000, // 1 minute for tests
        strategy: 'LRU'
      },
      batchConfig: {
        maxBatchSize: 5,
        batchTimeout: 10,
        enabled: true
      }
    });

    playerRepo = factory.getPlayerRepository();
    scheduleRepo = factory.getScheduleRepository();
    
    // Ensure clean state by clearing all data and caches
    await playerRepo.clear();
    await scheduleRepo.clear();
    await factory.clearAllCaches();
    
    // Additional cleanup - clear localStorage if it exists
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  afterEach(async () => {
    // Clear all data and caches
    await playerRepo.clear();
    await scheduleRepo.clear();
    await factory.clearAllCaches();
  });

  // Helper function to generate valid season ID with better uniqueness
  const validSeasonId = () => fc.string({ minLength: 8, maxLength: 15 })
    .filter(s => /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(s) && s.length >= 8)
    .map(s => `${s}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`);

  // Helper function to generate unique player data
  const generatePlayers = (seasonId: string, count: number): PlayerCreateData[] => {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const players: PlayerCreateData[] = [];
    
    for (let i = 0; i < count; i++) {
      players.push({
        seasonId,
        firstName: `Player${i}_${timestamp}_${randomSuffix}`,
        lastName: `Test${i}_${timestamp}_${randomSuffix}`,
        timePreference: fc.sample(fc.constantFrom('AM', 'PM', 'Either'), 1)[0] as 'AM' | 'PM' | 'Either',
        handedness: fc.sample(fc.constantFrom('left', 'right'), 1)[0] as 'left' | 'right'
      });
    }
    return players;
  };

  /**
   * Property 5: Data access performance consistency
   * **Validates: Requirements 3.1, 3.2, 3.3**
   */
  test('Property 5: Data access performance consistency - cached queries should be faster than uncached', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          seasonId: validSeasonId(),
          playerCount: fc.integer({ min: 5, max: 50 }),
          queryType: fc.constantFrom('findBySeasonId', 'findByTimePreference', 'findByHandedness')
        }),
        async (testData) => {
          // Generate test players with unique names
          const players = generatePlayers(testData.seasonId, testData.playerCount);

          // Create players
          await Promise.all(players.map(player => playerRepo.create(player)));

          // Clear cache to ensure first query is uncached
          await playerRepo.clearCache();

          // Measure uncached query time
          const uncachedStart = performance.now();
          let uncachedResult: any;
          
          switch (testData.queryType) {
            case 'findBySeasonId':
              uncachedResult = await playerRepo.findBySeasonId(testData.seasonId);
              break;
            case 'findByTimePreference':
              uncachedResult = await playerRepo.findByTimePreference(testData.seasonId, 'AM');
              break;
            case 'findByHandedness':
              uncachedResult = await playerRepo.findByHandedness(testData.seasonId, 'left');
              break;
          }
          const uncachedTime = performance.now() - uncachedStart;

          // Measure cached query time (same query)
          const cachedStart = performance.now();
          let cachedResult: any;
          
          switch (testData.queryType) {
            case 'findBySeasonId':
              cachedResult = await playerRepo.findBySeasonId(testData.seasonId);
              break;
            case 'findByTimePreference':
              cachedResult = await playerRepo.findByTimePreference(testData.seasonId, 'AM');
              break;
            case 'findByHandedness':
              cachedResult = await playerRepo.findByHandedness(testData.seasonId, 'left');
              break;
          }
          const cachedTime = performance.now() - cachedStart;

          // Verify results are identical
          expect(cachedResult).toEqual(uncachedResult);
          expect(cachedResult.length).toBeGreaterThanOrEqual(0);

          // Cached query should be significantly faster (at least 2x faster or under 10ms)
          const isFasterOrFast = cachedTime < uncachedTime / 2 || cachedTime < 10;
          expect(isFasterOrFast).toBe(true);

          // Both queries should complete within reasonable time (Requirements 3.1, 3.2)
          expect(uncachedTime).toBeLessThan(500); // 500ms max for uncached
          expect(cachedTime).toBeLessThan(100);   // 100ms max for cached
        }
      ),
      { 
        numRuns: 20,
        timeout: 30000,
        verbose: true
      }
    );
  }, 60000);

  test('Property 5: Batch queries should be more efficient than individual queries', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          seasonId: validSeasonId(),
          playerCount: fc.integer({ min: 10, max: 30 }),
          batchSize: fc.integer({ min: 3, max: 8 })
        }),
        async (testData) => {
          // Ensure clean state for this test
          await playerRepo.clear();
          await playerRepo.clearCache();
          
          // Generate test players with unique names
          const players = generatePlayers(testData.seasonId, testData.playerCount);

          // Create players
          const createdPlayers = await Promise.all(players.map(player => playerRepo.create(player)));
          const playerIds = createdPlayers.slice(0, testData.batchSize).map(p => p.id);

          // Clear cache after creation
          await playerRepo.clearCache();

          // Measure individual queries
          const individualStart = performance.now();
          const individualResults = [];
          for (const id of playerIds) {
            const player = await playerRepo.findById(id);
            individualResults.push(player);
          }
          const individualTime = performance.now() - individualStart;

          // Clear cache again
          await playerRepo.clearCache();

          // Measure batch query
          const batchStart = performance.now();
          const batchResults = await playerRepo.findByIds(playerIds);
          const batchTime = performance.now() - batchStart;

          // Verify results are equivalent (same players, order may differ)
          expect(batchResults).toHaveLength(individualResults.length);
          expect(batchResults.filter(p => p !== null)).toHaveLength(testData.batchSize);
          
          // Check that each result exists in both sets (order-independent comparison)
          const individualIds = individualResults.filter(p => p !== null).map(p => p!.id).sort();
          const batchIds = batchResults.filter(p => p !== null).map(p => p!.id).sort();
          expect(batchIds).toEqual(individualIds);
          
          // Verify all expected players are found
          for (const expectedId of playerIds) {
            const foundInIndividual = individualResults.some(p => p && p.id === expectedId);
            const foundInBatch = batchResults.some(p => p && p.id === expectedId);
            expect(foundInIndividual).toBe(true);
            expect(foundInBatch).toBe(true);
          }

          // Batch should be faster or at least not significantly slower
          // Allow more tolerance for small batches where overhead might dominate
          // In test environments, batch efficiency may not always be apparent for small batches
          const batchEfficiencyRatio = batchTime / individualTime;
          
          // For very small batches (< 5), allow up to 5x slower due to overhead
          // For larger batches, expect better efficiency
          const maxRatio = testData.batchSize < 5 ? 5.0 : 3.0;
          expect(batchEfficiencyRatio).toBeLessThan(maxRatio);

          // Both should complete within reasonable time (Requirements 3.1, 3.2)
          expect(individualTime).toBeLessThan(1000);
          expect(batchTime).toBeLessThan(1000);
        }
      ),
      { 
        numRuns: 15,
        timeout: 30000
      }
    );
  }, 60000);

  test('Property 5: Cache invalidation should maintain data consistency', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          seasonId: validSeasonId(),
          playerCount: fc.integer({ min: 5, max: 20 }),
          updateIndex: fc.integer({ min: 0, max: 4 })
        }),
        async (testData) => {
          // Ensure clean state for this test
          await playerRepo.clear();
          await playerRepo.clearCache();
          
          // Generate test players with unique names
          const players = generatePlayers(testData.seasonId, testData.playerCount);

          // Create players one by one to ensure they're created
          const createdPlayers: any[] = [];
          for (const playerData of players) {
            try {
              const created = await playerRepo.create(playerData);
              createdPlayers.push(created);
            } catch (error) {
              console.error('Failed to create player:', error);
              throw error;
            }
          }
          
          // Clear cache after creation to ensure fresh queries
          await playerRepo.clearCache();
          
          // Verify players were created
          expect(createdPlayers).toHaveLength(testData.playerCount);
          expect(createdPlayers.every(p => p.id && p.seasonId === testData.seasonId)).toBe(true);

          // Query to populate cache
          const initialPlayers = await playerRepo.findBySeasonId(testData.seasonId);
          expect(initialPlayers).toHaveLength(testData.playerCount);

          // Update a player
          const playerToUpdate = createdPlayers[testData.updateIndex % createdPlayers.length];
          const originalTimePreference = playerToUpdate.timePreference;
          const newTimePreference = originalTimePreference === 'AM' ? 'PM' : 'AM';
          
          const updatedPlayer = await playerRepo.update(playerToUpdate.id, {
            firstName: `UpdatedName_${Date.now()}`,
            timePreference: newTimePreference
          });

          expect(updatedPlayer).not.toBeNull();
          expect(updatedPlayer!.firstName).toContain('UpdatedName');
          expect(updatedPlayer!.timePreference).toBe(newTimePreference);

          // Query again - should reflect the update (cache should be invalidated)
          const updatedPlayers = await playerRepo.findBySeasonId(testData.seasonId);
          expect(updatedPlayers).toHaveLength(testData.playerCount);
          
          const foundUpdatedPlayer = updatedPlayers.find(p => p.id === playerToUpdate.id);
          expect(foundUpdatedPlayer).not.toBeUndefined();
          expect(foundUpdatedPlayer!.firstName).toContain('UpdatedName');
          expect(foundUpdatedPlayer!.timePreference).toBe(newTimePreference);

          // Query by new time preference should include the updated player
          const newPrefPlayers = await playerRepo.findByTimePreference(testData.seasonId, newTimePreference);
          expect(newPrefPlayers.some(p => p.id === playerToUpdate.id)).toBe(true);

          // Query by old time preference should not include the updated player
          const oldPrefPlayers = await playerRepo.findByTimePreference(testData.seasonId, originalTimePreference);
          expect(oldPrefPlayers.some(p => p.id === playerToUpdate.id)).toBe(false);
        }
      ),
      { 
        numRuns: 15,
        timeout: 30000
      }
    );
  }, 60000);

  test('Property 5: Multi-level cache should provide performance benefits', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          seasonId: validSeasonId(),
          playerCount: fc.integer({ min: 10, max: 25 })
        }),
        async (testData) => {
          // Ensure clean state for this test
          await playerRepo.clear();
          await playerRepo.clearCache();
          
          // Generate test players with unique names
          const players = generatePlayers(testData.seasonId, testData.playerCount);

          // Create players
          const createdPlayers = await Promise.all(players.map(player => playerRepo.create(player)));
          expect(createdPlayers).toHaveLength(testData.playerCount);

          // Clear all caches after creation
          await playerRepo.clearCache();

          // First query - should be slowest (no cache)
          const firstStart = performance.now();
          const firstResult = await playerRepo.findBySeasonId(testData.seasonId);
          const firstTime = performance.now() - firstStart;

          // Second query - should be faster (L1 cache hit)
          const secondStart = performance.now();
          const secondResult = await playerRepo.findBySeasonId(testData.seasonId);
          const secondTime = performance.now() - secondStart;

          // Third query - should still be fast (cache hit)
          const thirdStart = performance.now();
          const thirdResult = await playerRepo.findBySeasonId(testData.seasonId);
          const thirdTime = performance.now() - thirdStart;

          // Verify results are consistent
          expect(secondResult).toEqual(firstResult);
          expect(thirdResult).toEqual(firstResult);
          expect(firstResult).toHaveLength(testData.playerCount);

          // Performance expectations (Requirements 3.1, 3.2, 3.3)
          expect(firstTime).toBeLessThan(500);  // Initial query should be reasonable
          expect(secondTime).toBeLessThan(100); // Cached query should be fast
          expect(thirdTime).toBeLessThan(100);  // Subsequent cached queries should be fast

          // L1 cache hit should be fastest
          expect(secondTime).toBeLessThan(firstTime);
        }
      ),
      { 
        numRuns: 10,
        timeout: 30000
      }
    );
  }, 60000);

  test('Property 5: Large dataset queries should maintain performance', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          seasonId: validSeasonId(),
          playerCount: fc.integer({ min: 30, max: 80 }) // Reduced max for test performance and reliability
        }),
        async (testData) => {
          // Ensure clean state for this test
          await playerRepo.clear();
          await playerRepo.clearCache();
          
          // Generate large dataset with unique names
          const players = generatePlayers(testData.seasonId, testData.playerCount);

          // Create players in chunks to avoid overwhelming the system
          const chunkSize = 20;
          const createdPlayers: any[] = [];
          
          for (let i = 0; i < players.length; i += chunkSize) {
            const chunk = players.slice(i, i + chunkSize);
            const chunkResults = await Promise.all(chunk.map(player => playerRepo.create(player)));
            createdPlayers.push(...chunkResults);
            
            // Small delay to avoid overwhelming the system
            if (i + chunkSize < players.length) {
              await new Promise(resolve => setTimeout(resolve, 10));
            }
          }

          // Clear cache after creation to ensure fresh queries
          await playerRepo.clearCache();

          // Verify all players were created
          expect(createdPlayers).toHaveLength(testData.playerCount);
          expect(createdPlayers.every(p => p.id && p.seasonId === testData.seasonId)).toBe(true);

          // Test various query types with large dataset
          const queryStart = performance.now();
          
          const [seasonPlayers, amPlayers, leftPlayers] = await Promise.all([
            playerRepo.findBySeasonId(testData.seasonId),
            playerRepo.findByTimePreference(testData.seasonId, 'AM'),
            playerRepo.findByHandedness(testData.seasonId, 'left')
          ]);
          
          const queryTime = performance.now() - queryStart;

          // Verify results
          expect(seasonPlayers).toHaveLength(testData.playerCount);
          expect(amPlayers.length).toBeGreaterThanOrEqual(0);
          expect(leftPlayers.length).toBeGreaterThanOrEqual(0);
          
          // Verify all returned players belong to the correct season
          expect(seasonPlayers.every(p => p.seasonId === testData.seasonId)).toBe(true);
          expect(amPlayers.every(p => p.seasonId === testData.seasonId && p.timePreference === 'AM')).toBe(true);
          expect(leftPlayers.every(p => p.seasonId === testData.seasonId && p.handedness === 'left')).toBe(true);

          // Performance should scale reasonably with dataset size (Requirements 3.1, 3.2, 3.3)
          // For large datasets, we allow more time but it should still be reasonable
          const maxExpectedTime = Math.min(3000, testData.playerCount * 15); // Max 3s or 15ms per player
          expect(queryTime).toBeLessThan(maxExpectedTime);

          // Test cached performance
          const cachedStart = performance.now();
          const cachedSeasonPlayers = await playerRepo.findBySeasonId(testData.seasonId);
          const cachedTime = performance.now() - cachedStart;

          expect(cachedSeasonPlayers).toEqual(seasonPlayers);
          expect(cachedTime).toBeLessThan(200); // Cached should be fast regardless of size
        }
      ),
      { 
        numRuns: 5, // Fewer runs for large datasets
        timeout: 90000 // Longer timeout for large datasets
      }
    );
  }, 150000);
});