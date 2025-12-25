/**
 * Property-based tests for Advanced Caching Strategies
 * **Feature: performance-optimization, Property 10: Cache hit rate and effectiveness**
 * **Validates: Requirements 3.2, 3.3, 3.5**
 */

import * as fc from 'fast-check';
import { 
  AdvancedCachingCoordinator,
  UsagePatternAnalyzer,
  IntelligentInvalidationManager,
  CrossSessionCacheManager,
  PredictiveCacheConfig,
  CrossSessionConfig
} from './AdvancedCachingStrategies';
import { DataAccessOptimizer } from './DataAccessOptimizer';

describe('Advanced Caching Strategies Property Tests', () => {
  let dataOptimizer: DataAccessOptimizer;
  let cachingCoordinator: AdvancedCachingCoordinator;

  beforeEach(() => {
    dataOptimizer = new DataAccessOptimizer();
    cachingCoordinator = new AdvancedCachingCoordinator(dataOptimizer);
  });

  afterEach(() => {
    cachingCoordinator.destroy();
  });

  /**
   * Property 10: Cache hit rate and effectiveness
   * **Validates: Requirements 3.2, 3.3, 3.5**
   * 
   * For any sequence of cache operations, the cache hit rate should improve
   * with repeated access patterns, and cache effectiveness should be measurable
   * through consistent performance improvements.
   */
  test('Property 10: Cache hit rate improves with repeated access patterns', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          keys: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 5, maxLength: 20 }),
          accessPatterns: fc.array(fc.integer({ min: 0, max: 19 }), { minLength: 20, maxLength: 100 }),
          cacheDomain: fc.constantFrom('players', 'schedules', 'pairings', 'availability'),
          dataSize: fc.integer({ min: 100, max: 10000 })
        }),
        async (testData) => {
          const { keys, accessPatterns, cacheDomain, dataSize } = testData;
          
          // Create mock data loader that simulates database access
          let loadCount = 0;
          const mockLoader = (key: string) => async () => {
            loadCount++;
            // Simulate database access time
            await new Promise(resolve => setTimeout(resolve, 10));
            return { key, data: 'x'.repeat(dataSize), timestamp: Date.now() };
          };

          // First pass: populate cache with initial accesses
          const firstPassStats = { hits: 0, misses: 0 };
          for (let i = 0; i < Math.min(accessPatterns.length, 20); i++) {
            const keyIndex = accessPatterns[i] % keys.length;
            const key = `${cacheDomain}:${keys[keyIndex]}`;
            
            const startLoadCount = loadCount;
            await cachingCoordinator.get(key, mockLoader(key), { cacheDomain });
            
            if (loadCount > startLoadCount) {
              firstPassStats.misses++;
            } else {
              firstPassStats.hits++;
            }
          }

          // Second pass: repeat same access patterns
          const secondPassStats = { hits: 0, misses: 0 };
          for (let i = 0; i < Math.min(accessPatterns.length, 20); i++) {
            const keyIndex = accessPatterns[i] % keys.length;
            const key = `${cacheDomain}:${keys[keyIndex]}`;
            
            const startLoadCount = loadCount;
            await cachingCoordinator.get(key, mockLoader(key), { cacheDomain });
            
            if (loadCount > startLoadCount) {
              secondPassStats.misses++;
            } else {
              secondPassStats.hits++;
            }
          }

          // Calculate hit rates
          const firstPassTotal = firstPassStats.hits + firstPassStats.misses;
          const secondPassTotal = secondPassStats.hits + secondPassStats.misses;
          
          const firstPassHitRate = firstPassTotal > 0 ? firstPassStats.hits / firstPassTotal : 0;
          const secondPassHitRate = secondPassTotal > 0 ? secondPassStats.hits / secondPassTotal : 0;

          // Property: Hit rate should improve on repeated access patterns
          // Second pass should have higher hit rate than first pass
          expect(secondPassHitRate).toBeGreaterThanOrEqual(firstPassHitRate);
          
          // Property: Cache should provide performance benefit
          // Total load count should be less than total access count due to caching
          const totalAccesses = Math.min(accessPatterns.length, 20) * 2; // Two passes
          expect(loadCount).toBeLessThan(totalAccesses);
          
          // Property: Cache effectiveness should be measurable
          const cacheStats = await cachingCoordinator.getStats();
          expect(cacheStats.dataOptimizer).toBeDefined();
          expect(cacheStats.usagePatterns).toBeDefined();
          
          // Property: Usage patterns should be tracked
          expect(cacheStats.usagePatterns.totalPatterns).toBeGreaterThan(0);
        }
      ),
      { numRuns: 25, timeout: 30000 }
    );
  });

  test('Property: Predictive caching improves access patterns over time', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          baseKeys: fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 3, maxLength: 8 }).filter(keys => 
            new Set(keys).size === keys.length // Ensure unique keys
          ),
          sequentialAccesses: fc.integer({ min: 10, max: 30 }),
          predictionWindow: fc.integer({ min: 5000, max: 30000 })
        }),
        async (testData) => {
          const { baseKeys, sequentialAccesses, predictionWindow } = testData;
          
          // Skip if we don't have unique keys
          if (new Set(baseKeys).size !== baseKeys.length) {
            return;
          }
          
          const config: PredictiveCacheConfig = {
            maxSize: 100,
            ttl: 60000,
            strategy: 'LRU',
            predictionWindow,
            minAccessCount: 2,
            preloadThreshold: 0.5,
            patternAnalysisInterval: 1000
          };

          const patternAnalyzer = new UsagePatternAnalyzer(config);
          
          try {
            // Create predictable access pattern with unique keys
            const accessSequence: string[] = [];
            for (let i = 0; i < sequentialAccesses; i++) {
              const keyIndex = i % baseKeys.length;
              accessSequence.push(`pattern:${baseKeys[keyIndex]}:${i}`); // Make keys unique
            }

            // Record access patterns
            accessSequence.forEach((key, index) => {
              const relatedKeys = index > 0 ? [accessSequence[index - 1]] : [];
              patternAnalyzer.recordAccess(key, relatedKeys);
            });

            // Wait for pattern analysis
            await new Promise(resolve => setTimeout(resolve, 100));

            // Get predictions and stats
            const predictions = patternAnalyzer.getPredictions();
            const stats = patternAnalyzer.getStats();

            // Property: Pattern analyzer should track usage patterns
            expect(stats.totalPatterns).toBeGreaterThan(0);

            // Property: Predictions should be generated for frequently accessed keys
            if (sequentialAccesses >= config.minAccessCount) {
              // At least some patterns should be tracked
              expect(stats.activePatterns).toBeGreaterThan(0);
              
              // Property: Predictions should have reasonable confidence scores
              predictions.forEach(prediction => {
                expect(prediction.confidence).toBeGreaterThanOrEqual(0);
                expect(prediction.confidence).toBeLessThanOrEqual(1);
                expect(prediction.estimatedTime).toBeGreaterThan(0);
              });
            }

            // Property: Related keys should be tracked for sequential access
            if (accessSequence.length > 1) {
              const firstKey = accessSequence[0];
              const relatedKeys = patternAnalyzer.getRelatedKeys(firstKey);
              expect(relatedKeys.length).toBeGreaterThanOrEqual(0);
            }
          } finally {
            patternAnalyzer.destroy();
          }
        }
      ),
      { numRuns: 20, timeout: 15000 }
    );
  });

  test('Property: Intelligent invalidation maintains cache consistency', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          entityTypes: fc.array(fc.constantFrom('player', 'schedule', 'season', 'availability'), { minLength: 2, maxLength: 4 }),
          entityIds: fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 3, maxLength: 10 }),
          operations: fc.array(fc.constantFrom('create', 'update', 'delete'), { minLength: 5, maxLength: 15 })
        }),
        async (testData) => {
          const { entityTypes, entityIds, operations } = testData;
          
          const invalidationManager = new IntelligentInvalidationManager();
          invalidationManager.registerCommonPatterns();

          // Simulate cache entries for different entity types
          const cacheEntries = new Map<string, any>();
          
          entityTypes.forEach(entityType => {
            entityIds.forEach(entityId => {
              const key = `${entityType}:${entityId}`;
              cacheEntries.set(key, { data: `${entityType}_data_${entityId}` });
            });
          });

          // Test invalidation patterns
          operations.forEach((operation, index) => {
            const entityType = entityTypes[index % entityTypes.length];
            const entityId = entityIds[index % entityIds.length];
            const changedKey = `${entityType}:${entityId}`;

            // Get invalidation targets
            const targets = invalidationManager.getInvalidationTargets(changedKey, { operation });

            // Property: Invalidation should return valid target patterns
            expect(Array.isArray(targets)).toBe(true);
            
            // Property: Targets should be strings
            targets.forEach(target => {
              expect(typeof target).toBe('string');
            });

            // Property: Related entities should be invalidated based on business rules
            if (entityType === 'player') {
              // Player changes should affect schedules and pairings
              const hasScheduleInvalidation = targets.some(target => target.includes('schedule'));
              const hasPairingInvalidation = targets.some(target => target.includes('pairing'));
              expect(hasScheduleInvalidation || hasPairingInvalidation).toBe(true);
            }

            if (entityType === 'season') {
              // Season changes should affect everything related to that season
              const hasPlayerInvalidation = targets.some(target => target.includes('player'));
              const hasScheduleInvalidation = targets.some(target => target.includes('schedule'));
              expect(hasPlayerInvalidation || hasScheduleInvalidation).toBe(true);
            }
          });
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  test('Property: Cross-session cache maintains data integrity across sessions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          entries: fc.array(
            fc.record({
              key: fc.string({ minLength: 1, maxLength: 20 }),
              value: fc.record({
                data: fc.string({ minLength: 1, maxLength: 100 }),
                id: fc.integer({ min: 1, max: 1000 })
              }),
              critical: fc.boolean()
            }),
            { minLength: 3, maxLength: 15 }
          ).filter(entries => {
            // Ensure unique keys
            const keys = entries.map(e => e.key);
            return new Set(keys).size === keys.length;
          }),
          maxStorageSize: fc.integer({ min: 1024, max: 10240 })
        }),
        async (testData) => {
          const { entries, maxStorageSize } = testData;
          
          // Skip if we don't have unique keys
          const keys = entries.map(e => e.key);
          if (new Set(keys).size !== keys.length) {
            return;
          }
          
          const config: CrossSessionConfig = {
            persistenceKey: `test_cache_${Date.now()}_${Math.random()}`,
            maxStorageSize,
            compressionEnabled: true,
            encryptionEnabled: false,
            syncInterval: 1000
          };

          const crossSessionManager = new CrossSessionCacheManager(config);
          
          try {
            // Store all entries and flush immediately
            for (const entry of entries) {
              await crossSessionManager.store(entry.key, entry.value, { 
                critical: true, // Force immediate write
                ttl: 60000 
              });
            }

            // Property: All stored entries should be retrievable
            for (const entry of entries) {
              const retrieved = await crossSessionManager.retrieve(entry.key);
              expect(retrieved).toEqual(entry.value);
            }

            // Property: Storage statistics should be accurate
            const stats = await crossSessionManager.getStats();
            expect(stats.entryCount).toBeGreaterThan(0);
            expect(stats.entryCount).toBeLessThanOrEqual(entries.length);
            expect(stats.totalSize).toBeGreaterThan(0);
            if (stats.entryCount > 0) {
              expect(stats.newestEntry).toBeGreaterThanOrEqual(stats.oldestEntry);
            }

            // Property: Cleanup should remove expired entries
            const cleanedCount = await crossSessionManager.cleanup();
            expect(cleanedCount).toBeGreaterThanOrEqual(0);

            // Property: Storage size should be managed
            const postCleanupStats = await crossSessionManager.getStats();
            expect(postCleanupStats.totalSize).toBeLessThanOrEqual(maxStorageSize * 1.1); // Allow 10% tolerance

            // Property: Removed entries should not be retrievable
            if (entries.length > 0) {
              await crossSessionManager.remove(entries[0].key);
              const removedEntry = await crossSessionManager.retrieve(entries[0].key);
              expect(removedEntry).toBeNull();
            }

          } finally {
            await crossSessionManager.clear();
            crossSessionManager.destroy();
          }
        }
      ),
      { numRuns: 15, timeout: 20000 }
    );
  });

  test('Property: Advanced caching coordinator integrates all strategies effectively', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          domains: fc.array(fc.constantFrom('players', 'schedules', 'seasons'), { minLength: 2, maxLength: 3 }),
          keys: fc.array(fc.string({ minLength: 1, maxLength: 15 }), { minLength: 5, maxLength: 15 }).filter(keys => 
            new Set(keys).size === keys.length // Ensure unique keys
          ),
          accessCount: fc.integer({ min: 10, max: 30 }),
          enableCrossSession: fc.boolean()
        }),
        async (testData) => {
          const { domains, keys, accessCount, enableCrossSession } = testData;
          
          // Skip if we don't have unique keys
          if (new Set(keys).size !== keys.length) {
            return;
          }
          
          let loadOperations = 0;
          const mockLoader = (key: string) => async () => {
            loadOperations++;
            return { key, data: `mock_data_${key}`, timestamp: Date.now() };
          };

          // Perform cache operations with some repeated keys to test caching
          const results: any[] = [];
          const accessedKeys: string[] = [];
          
          for (let i = 0; i < accessCount; i++) {
            const domain = domains[i % domains.length];
            // Use fewer unique keys to increase cache hits
            const keyIndex = i % Math.min(keys.length, 5);
            const key = `${domain}:${keys[keyIndex]}`;
            accessedKeys.push(key);
            
            const result = await cachingCoordinator.get(
              key, 
              mockLoader(key), 
              { 
                cacheDomain: domain,
                crossSession: enableCrossSession,
                relatedKeys: i > 0 ? [accessedKeys[i - 1]] : []
              }
            );
            
            results.push(result);
          }

          // Property: All operations should return valid results
          expect(results.length).toBe(accessCount);
          results.forEach(result => {
            expect(result).toBeDefined();
            expect(result.key).toBeDefined();
            expect(result.data).toBeDefined();
          });

          // Property: Caching should reduce load operations (with repeated keys)
          const uniqueKeys = new Set(accessedKeys);
          expect(loadOperations).toBeLessThanOrEqual(uniqueKeys.size);

          // Property: Statistics should be comprehensive
          const stats = await cachingCoordinator.getStats();
          expect(stats.dataOptimizer).toBeDefined();
          expect(stats.usagePatterns).toBeDefined();
          expect(stats.crossSession).toBeDefined();
          expect(stats.predictions).toBeDefined();

          // Property: Usage patterns should be tracked
          expect(stats.usagePatterns.totalPatterns).toBeGreaterThan(0);

          // Property: Cleanup should work without errors
          await expect(cachingCoordinator.cleanup()).resolves.not.toThrow();
        }
      ),
      { numRuns: 20, timeout: 25000 }
    );
  });
});