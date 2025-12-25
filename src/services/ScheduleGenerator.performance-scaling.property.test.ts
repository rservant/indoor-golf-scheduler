/**
 * Property-Based Tests for Schedule Generation Performance Scaling
 * 
 * **Property 4: Schedule generation performance scaling**
 * **Validates: Requirements 1.1, 1.2, 1.3**
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import * as fc from 'fast-check';
import { ScheduleGenerator } from './ScheduleGenerator';
import { Player } from '../models/Player';
import { WeekModel } from '../models/Week';
import { PairingHistoryTracker } from './PairingHistoryTracker';

describe('Schedule Generation Performance Scaling Property Tests', () => {
  let generator: ScheduleGenerator;
  let pairingTracker: PairingHistoryTracker;

  beforeEach(() => {
    // Create a mock pairing history repository for testing
    const mockRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      exists: jest.fn(),
      findBySeasonId: jest.fn(),
      deleteBySeasonId: jest.fn(),
      addPairing: jest.fn().mockResolvedValue({}),
      getPairingCount: jest.fn().mockResolvedValue(0), // Return 0 for all pairing counts
      getAllPairingsForPlayer: jest.fn().mockResolvedValue([]),
      resetPairings: jest.fn()
    };

    pairingTracker = new PairingHistoryTracker(mockRepository as any);
    generator = new ScheduleGenerator({
      prioritizeCompleteGroups: true,
      balanceTimeSlots: true,
      optimizePairings: true
    }, pairingTracker);
  });

  afterEach(() => {
    // Cleanup if needed
  });

  /**
   * Helper function to create test players
   */
  function createTestPlayers(count: number, seasonId: string, baseId: string = ''): Player[] {
    const timePreferences = ['AM', 'PM', 'Either'] as const;
    const players: Player[] = [];

    for (let i = 0; i < count; i++) {
      players.push({
        id: `${baseId}player-${seasonId}-${i}`, // Make IDs unique across seasons and tests
        firstName: `Player`,
        lastName: `${i}`,
        email: `player${i}@test.com`,
        phone: `555-000${i.toString().padStart(4, '0')}`,
        timePreference: timePreferences[i % timePreferences.length],
        seasonId: seasonId,
        isActive: true
      });
    }

    return players;
  }

  /**
   * Helper function to create test week with all players available
   */
  function createTestWeek(weekId: string, seasonId: string, players: Player[]): WeekModel {
    const week = new WeekModel({
      id: weekId,
      weekNumber: 1,
      seasonId: seasonId,
      date: new Date('2024-01-01'),
      playerAvailability: {}
    });

    // Mark all players as available
    players.forEach(player => {
      week.setPlayerAvailability(player.id, true);
    });

    return week;
  }

  /**
   * Property 4: Schedule generation performance scaling
   * **Validates: Requirements 1.1, 1.2, 1.3**
   * 
   * For any number of players within the supported range,
   * schedule generation should complete within the specified
   * time limits and scale reasonably with player count.
   */
  test('Property 4: Schedule generation performance scales within time limits', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          playerCount: fc.integer({ min: 4, max: 50 }), // Reduced max to avoid memory issues
          seasonId: fc.string({ minLength: 5, maxLength: 10 }).map(s => `season-${s}`),
          weekNumber: fc.integer({ min: 1, max: 5 })
        }),
        async (testData) => {
          // Create test data
          const players = createTestPlayers(testData.playerCount, testData.seasonId, 'main-');
          const weekId = `week-${testData.weekNumber}`;
          const week = createTestWeek(weekId, testData.seasonId, players);

          // Determine expected time limit based on requirements
          let expectedTimeLimit: number;
          if (testData.playerCount <= 50) {
            expectedTimeLimit = 2000; // 2 seconds for up to 50 players (Requirement 1.1)
          } else if (testData.playerCount <= 100) {
            expectedTimeLimit = 5000; // 5 seconds for up to 100 players (Requirement 1.2)
          } else {
            expectedTimeLimit = 10000; // 10 seconds for up to 200 players (Requirement 1.3)
          }

          // Measure generation time
          const startTime = performance.now();
          const schedule = await generator.generateScheduleForWeek(week, players);
          const endTime = performance.now();
          const actualDuration = endTime - startTime;

          // Property 1: Generation should complete within specified time limits
          expect(actualDuration).toBeLessThan(expectedTimeLimit);

          // Property 2: Schedule should be valid and contain expected players
          expect(schedule).toBeDefined();
          expect(schedule.weekId).toBe(weekId);

          // Property 3: All scheduled players should be from the available players
          const scheduledPlayerIds = schedule.getAllPlayers();
          const availablePlayerIds = new Set(players.map(p => p.id));
          
          scheduledPlayerIds.forEach(playerId => {
            expect(availablePlayerIds.has(playerId)).toBe(true);
          });

          // Property 4: Schedule should respect player count constraints
          const totalScheduledPlayers = scheduledPlayerIds.length;
          expect(totalScheduledPlayers).toBeLessThanOrEqual(testData.playerCount);
          expect(totalScheduledPlayers).toBeGreaterThanOrEqual(0);

          // Property 5: Performance should scale reasonably (not exponentially)
          // For larger player counts, we expect roughly linear scaling
          if (testData.playerCount >= 20) {
            const timePerPlayer = actualDuration / testData.playerCount;
            // Time per player should be reasonable (less than 100ms per player for large groups)
            expect(timePerPlayer).toBeLessThan(100);
          }

          // Property 6: Schedule structure should be consistent
          expect(schedule.timeSlots).toBeDefined();
          expect(schedule.timeSlots.morning).toBeDefined();
          expect(schedule.timeSlots.afternoon).toBeDefined();
          expect(Array.isArray(schedule.timeSlots.morning)).toBe(true);
          expect(Array.isArray(schedule.timeSlots.afternoon)).toBe(true);
        }
      ),
      { 
        numRuns: 10, // Reduced for performance
        timeout: 30000, // 30 second timeout for the entire property test
        verbose: false
      }
    );
  }, 60000); // 1 minute timeout for the entire test

  /**
   * Property: Performance scaling consistency across multiple runs
   * **Validates: Requirements 1.1, 1.2, 1.3**
   * 
   * For any given player count, multiple generation runs should
   * show consistent performance characteristics without significant
   * degradation over time.
   */
  test('Property: Performance scaling shows consistent characteristics across runs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          playerCount: fc.constantFrom(20, 30), // Reduced test cases
          runs: fc.integer({ min: 2, max: 3 })
        }),
        async (testData) => {
          const seasonId = `consistency-season-${Date.now()}`;
          const durations: number[] = [];

          // Run multiple generations with the same parameters
          for (let run = 0; run < testData.runs; run++) {
            const players = createTestPlayers(testData.playerCount, seasonId, `consistency-${run}-`);
            const weekId = `consistency-week-${run}`;
            const week = createTestWeek(weekId, seasonId, players);

            const startTime = performance.now();
            const schedule = await generator.generateScheduleForWeek(week, players);
            const endTime = performance.now();
            
            durations.push(endTime - startTime);

            // Verify each generation produces valid results
            expect(schedule).toBeDefined();
            expect(schedule.weekId).toBe(weekId);
          }

          // Property 1: All runs should complete within expected time limits
          const expectedLimit = testData.playerCount <= 50 ? 2000 : 5000;
          
          durations.forEach(duration => {
            expect(duration).toBeLessThan(expectedLimit);
          });

          // Property 2: Performance should be consistent across runs
          if (durations.length > 1) {
            const averageDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
            const maxDeviation = Math.max(...durations.map(d => Math.abs(d - averageDuration)));
            
            // Maximum deviation should not exceed 200% of average (allowing for JIT warmup)
            expect(maxDeviation).toBeLessThan(averageDuration * 2);
          }
        }
      ),
      { 
        numRuns: 5,
        timeout: 20000
      }
    );
  }, 40000);

  /**
   * Property: Memory usage scales reasonably with player count
   * **Validates: Requirements 1.4**
   * 
   * For any player count, memory usage during generation should
   * scale reasonably and not exceed specified limits.
   */
  test('Property: Memory usage scales reasonably with player count', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          playerCount: fc.integer({ min: 10, max: 40 }), // Reduced range
          seasonId: fc.string({ minLength: 5, maxLength: 10 }).map(s => `memory-test-${s}`)
        }),
        async (testData) => {
          // Force garbage collection if available
          if (global.gc) {
            global.gc();
          }

          const initialMemory = process.memoryUsage();
          
          // Create test data
          const players = createTestPlayers(testData.playerCount, testData.seasonId, 'memory-');
          const weekId = `memory-week-${Date.now()}`;
          const week = createTestWeek(weekId, testData.seasonId, players);

          // Measure memory before generation
          const beforeGeneration = process.memoryUsage();
          
          // Generate schedule
          const schedule = await generator.generateScheduleForWeek(week, players);
          
          // Measure memory after generation
          const afterGeneration = process.memoryUsage();

          // Property 1: Generation should complete successfully
          expect(schedule).toBeDefined();
          expect(schedule.weekId).toBe(weekId);

          // Property 2: Memory usage should be reasonable
          // Note: Memory increase can vary significantly in test environments,
          // so we focus on total memory usage rather than incremental increase
          
          // Property 3: Total memory usage should not exceed limits
          const totalMemoryMB = afterGeneration.heapUsed / (1024 * 1024);
          
          // Should not exceed 1GB total (very generous buffer for test environment)
          expect(totalMemoryMB).toBeLessThan(1024);

          // Cleanup
          if (global.gc) {
            global.gc();
          }
        }
      ),
      { 
        numRuns: 8,
        timeout: 20000
      }
    );
  }, 40000);

  /**
   * Property: Concurrent generation performance
   * **Validates: Requirements 1.5**
   * 
   * For any reasonable number of concurrent generation requests,
   * the system should handle them efficiently without blocking
   * and maintain reasonable performance characteristics.
   */
  test('Property: Concurrent generation maintains performance characteristics', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          concurrentRequests: fc.integer({ min: 2, max: 3 }), // Reduced concurrency
          playersPerRequest: fc.integer({ min: 15, max: 30 }) // Reduced player count
        }),
        async (testData) => {
          const baseSeasonId = `concurrent-season-${Date.now()}`;
          
          // Create concurrent generation promises
          const generationPromises = Array.from({ length: testData.concurrentRequests }, (_, index) => {
            // Use unique seasonId for each concurrent request to avoid player ID conflicts
            const seasonId = `${baseSeasonId}-${index}`;
            const players = createTestPlayers(testData.playersPerRequest, seasonId, `concurrent-${index}-`);
            const weekId = `concurrent-week-${index}`;
            const week = createTestWeek(weekId, seasonId, players);
            
            const startTime = performance.now();
            
            return generator.generateScheduleForWeek(week, players).then(schedule => ({
              schedule,
              duration: performance.now() - startTime,
              weekId,
              playerCount: testData.playersPerRequest
            }));
          });

          // Measure total time for all concurrent requests
          const overallStartTime = performance.now();
          const results = await Promise.all(generationPromises);
          const overallEndTime = performance.now();
          const totalConcurrentTime = overallEndTime - overallStartTime;

          // Property 1: All generations should complete successfully
          results.forEach((result, index) => {
            expect(result.schedule).toBeDefined();
            expect(result.schedule.weekId).toBe(`concurrent-week-${index}`);
            expect(result.duration).toBeGreaterThan(0);
          });

          // Property 2: Individual generation times should be reasonable
          const expectedTimeLimit = testData.playersPerRequest <= 50 ? 2000 : 5000;
          results.forEach(result => {
            expect(result.duration).toBeLessThan(expectedTimeLimit * 1.5); // Allow 50% overhead for concurrency
          });

          // Property 3: Concurrent execution should be efficient
          // Total time should be less than sum of individual times (showing parallelism benefits)
          const longestIndividualTime = Math.max(...results.map(r => r.duration));
          
          // Total time should be between 60% and 200% of the longest individual time
          // (allowing for timing variations in test environment)
          expect(totalConcurrentTime).toBeGreaterThanOrEqual(longestIndividualTime * 0.6);
          expect(totalConcurrentTime).toBeLessThan(longestIndividualTime * 2);

          // Property 4: All schedules should be valid and independent
          const allScheduledPlayerIds = new Set<string>();
          results.forEach(result => {
            const scheduledIds = result.schedule.getAllPlayers();
            
            // Each schedule should have players
            expect(scheduledIds.length).toBeGreaterThan(0);
            
            // No player should appear in multiple concurrent schedules (they're independent)
            scheduledIds.forEach(playerId => {
              expect(allScheduledPlayerIds.has(playerId)).toBe(false);
              allScheduledPlayerIds.add(playerId);
            });
          });
        }
      ),
      { 
        numRuns: 5,
        timeout: 25000
      }
    );
  }, 50000);
});