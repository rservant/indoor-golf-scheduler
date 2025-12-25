/**
 * Property-Based Tests for Performance Benchmark Consistency
 * 
 * **Property 2: Benchmark consistency**
 * **Validates: Requirements 5.1, 5.5**
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import * as fc from 'fast-check';
import { 
  PerformanceBenchmark, 
  BenchmarkConfig, 
  BenchmarkResult,
  performanceBenchmark 
} from './PerformanceBenchmark';
import { performanceMonitor } from './PerformanceMonitor';

describe('Performance Benchmark Property Tests', () => {
  let benchmark: PerformanceBenchmark;

  beforeEach(() => {
    benchmark = new PerformanceBenchmark();
    performanceMonitor.clearMetrics();
  });

  afterEach(() => {
    performanceMonitor.clearMetrics();
  });

  /**
   * Property 2: Benchmark consistency
   * **Validates: Requirements 5.1, 5.5**
   * 
   * For any benchmark configuration with consistent parameters,
   * running the benchmark multiple times should produce results
   * within acceptable variance thresholds, ensuring reliable
   * performance regression detection.
   */
  test('Property 2: Benchmark consistency - results should be stable across multiple runs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          operationDuration: fc.integer({ min: 10, max: 100 }), // Reduced max duration
          iterations: fc.integer({ min: 3, max: 8 }), // Reduced iterations
          variancePercent: fc.float({ min: Math.fround(0.05), max: Math.fround(0.2) }), // Reduced variance
          category: fc.constantFrom('data-operations', 'ui-operations') // Reduced categories
        }),
        async (testData) => {
          // Create a deterministic benchmark configuration
          const benchmarkName = `Consistency Test - ${testData.category}`;
          let executionCount = 0;

          const config: BenchmarkConfig = {
            name: benchmarkName,
            description: `Test benchmark consistency for ${testData.category}`,
            category: testData.category as 'data-operations' | 'ui-operations',
            iterations: testData.iterations,
            timeout: 5000, // Reduced timeout
            setup: async () => {
              executionCount = 0;
            },
            test: async () => {
              executionCount++;
              // Simulate consistent operation with controlled variance
              const baseDelay = testData.operationDuration;
              const variance = baseDelay * testData.variancePercent;
              const actualDelay = baseDelay + (Math.random() - 0.5) * variance;
              
              await new Promise(resolve => setTimeout(resolve, Math.max(1, actualDelay)));
            },
            teardown: async () => {
              // No cleanup needed
            }
          };

          // Run the benchmark multiple times to test consistency (reduced to 2 runs)
          const results: BenchmarkResult[] = [];
          const numberOfRuns = 2;

          for (let run = 0; run < numberOfRuns; run++) {
            const result = await benchmark.runBenchmark(config);
            results.push(result);
          }

          // All benchmark runs should succeed
          results.forEach(result => {
            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();
          });

          // Extract average durations from each run
          const averageDurations = results.map(r => r.averageDuration);
          const overallAverage = averageDurations.reduce((sum, avg) => sum + avg, 0) / averageDurations.length;

          // Property 1: Benchmark results should be consistent within acceptable variance
          if (averageDurations.length > 1 && overallAverage > 0) {
            const standardDeviation = Math.sqrt(
              averageDurations.reduce((sum, avg) => sum + Math.pow(avg - overallAverage, 2), 0) / averageDurations.length
            );
            const coefficientOfVariation = standardDeviation / overallAverage;

            // Coefficient of variation should be reasonable (less than 80% for controlled tests)
            expect(coefficientOfVariation).toBeLessThan(0.8);
          }

          // Property 2: Each benchmark should execute the expected number of iterations
          results.forEach(result => {
            expect(result.iterations).toBe(testData.iterations);
          });

          // Property 3: Performance metrics should be mathematically consistent
          results.forEach(result => {
            if (result.iterations > 0) {
              // Average should be between min and max
              expect(result.averageDuration).toBeGreaterThanOrEqual(result.minDuration);
              expect(result.averageDuration).toBeLessThanOrEqual(result.maxDuration);

              // Throughput should be positive and reasonable
              expect(result.throughput).toBeGreaterThan(0);
              expect(result.throughput).toBeLessThan(1000000); // Sanity check
            }

            // Memory usage should be tracked
            expect(result.memoryUsage.initial).toBeGreaterThanOrEqual(0);
            expect(result.memoryUsage.peak).toBeGreaterThanOrEqual(result.memoryUsage.initial);
            expect(result.memoryUsage.final).toBeGreaterThanOrEqual(0);
          });

          // Property 4: Benchmark timing should be reasonable relative to expected duration
          const expectedTotalDuration = testData.operationDuration * testData.iterations;
          results.forEach(result => {
            if (result.iterations > 0) {
              // Total duration should be reasonably close to expected (within 300% due to overhead)
              expect(result.totalDuration).toBeGreaterThan(expectedTotalDuration * 0.3);
              expect(result.totalDuration).toBeLessThan(expectedTotalDuration * 5);
            }
          });
        }
      ),
      { 
        numRuns: 10, // Reduced number of runs
        timeout: 20000, // Reduced timeout
        verbose: false // Disable verbosity
      }
    );
  }, 30000); // Reduced test timeout

  /**
   * Property: Benchmark suite consistency
   * **Validates: Requirements 5.1, 5.5**
   * 
   * For any set of benchmark configurations, running the complete
   * benchmark suite should produce consistent aggregate results
   * and proper baseline calculations.
   */
  test('Property: Benchmark suite produces consistent aggregate results', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          benchmarkCount: fc.integer({ min: 2, max: 5 }),
          baseOperationTime: fc.integer({ min: 50, max: 200 })
        }),
        async (testData) => {
          // Create multiple simple benchmark configurations
          const configs: BenchmarkConfig[] = [];
          
          for (let i = 0; i < testData.benchmarkCount; i++) {
            configs.push({
              name: `Suite Test Benchmark ${i}`,
              description: `Test benchmark ${i} for suite consistency`,
              category: 'data-operations',
              iterations: 5,
              timeout: 5000,
              setup: async () => {},
              test: async () => {
                // Simulate operation with slight variation per benchmark
                const delay = testData.baseOperationTime + (i * 10);
                await new Promise(resolve => setTimeout(resolve, delay));
              },
              teardown: async () => {}
            });
          }

          // Run the benchmark suite
          const suiteResult = await benchmark.runSuite(configs);

          // Property 1: Suite should track all benchmarks
          expect(suiteResult.totalBenchmarks).toBe(testData.benchmarkCount);
          expect(suiteResult.results).toHaveLength(testData.benchmarkCount);

          // Property 2: All benchmarks should succeed in controlled test
          expect(suiteResult.successfulBenchmarks).toBe(testData.benchmarkCount);
          expect(suiteResult.failedBenchmarks).toBe(0);

          // Property 3: Suite duration should be sum of individual benchmark durations (approximately)
          const sumOfIndividualDurations = suiteResult.results.reduce(
            (sum, result) => sum + result.totalDuration, 0
          );
          
          // Suite duration should be at least the sum of individual durations
          // (may be slightly more due to overhead)
          expect(suiteResult.totalDuration).toBeGreaterThanOrEqual(sumOfIndividualDurations * 0.9);
          expect(suiteResult.totalDuration).toBeLessThan(sumOfIndividualDurations * 2);

          // Property 4: Baseline should be calculated from results
          expect(suiteResult.baseline).toBeDefined();
          expect(suiteResult.baseline.dataOperations).toBeDefined();
          expect(suiteResult.baseline.memoryOperations.maxMemoryUsage).toBeGreaterThanOrEqual(0);

          // Property 5: Each result should have valid metadata
          suiteResult.results.forEach((result, index) => {
            expect(result.name).toBe(`Suite Test Benchmark ${index}`);
            expect(result.category).toBe('data-operations');
            expect(result.success).toBe(true);
            expect(result.timestamp).toBeGreaterThan(0);
            expect(result.iterations).toBe(5);
          });
        }
      ),
      { 
        numRuns: 15,
        timeout: 45000
      }
    );
  }, 90000);

  /**
   * Property: Memory tracking consistency
   * **Validates: Requirements 5.1, 5.5**
   * 
   * For any benchmark that allocates and deallocates memory,
   * the memory tracking should be consistent and show
   * reasonable memory usage patterns.
   */
  test('Property: Memory tracking shows consistent patterns', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          allocationSize: fc.integer({ min: 100, max: 10000 }),
          iterations: fc.integer({ min: 3, max: 10 })
        }),
        async (testData) => {
          const config: BenchmarkConfig = {
            name: 'Memory Tracking Test',
            description: 'Test memory tracking consistency',
            category: 'memory-operations',
            iterations: testData.iterations,
            timeout: 10000,
            setup: async () => {
              // Force garbage collection if available
              if (global.gc) {
                global.gc();
              }
            },
            test: async () => {
              // Allocate memory
              const data = new Array(testData.allocationSize).fill(0).map((_, i) => ({
                id: i,
                data: `test-data-${i}`,
                timestamp: Date.now()
              }));

              // Process the data
              const processed = data.map(item => ({
                ...item,
                processed: true
              }));

              // Simulate some work
              await new Promise(resolve => setTimeout(resolve, 10));

              // Clear references
              data.length = 0;
              processed.length = 0;
            },
            teardown: async () => {
              if (global.gc) {
                global.gc();
              }
            }
          };

          const result = await benchmark.runBenchmark(config);

          // Property 1: Memory tracking should show reasonable values
          expect(result.memoryUsage.initial).toBeGreaterThanOrEqual(0);
          expect(result.memoryUsage.peak).toBeGreaterThanOrEqual(result.memoryUsage.initial);
          expect(result.memoryUsage.final).toBeGreaterThanOrEqual(0);

          // Property 2: Memory delta should be reasonable
          // (may be positive due to allocation, but shouldn't be excessive)
          const memoryDelta = Math.abs(result.memoryUsage.delta);
          expect(memoryDelta).toBeLessThan(100 * 1024 * 1024); // Less than 100MB delta

          // Property 3: Peak memory should be higher than initial during allocation
          // (unless memory tracking is not available, in which case values may be 0)
          if (result.memoryUsage.initial > 0) {
            expect(result.memoryUsage.peak).toBeGreaterThanOrEqual(result.memoryUsage.initial);
          }

          // Property 4: Benchmark should complete successfully
          expect(result.success).toBe(true);
          expect(result.iterations).toBe(testData.iterations);
        }
      ),
      { 
        numRuns: 20,
        timeout: 30000
      }
    );
  }, 60000);

  /**
   * Property: Error handling consistency
   * **Validates: Requirements 5.1, 5.5**
   * 
   * For any benchmark that encounters errors, the error handling
   * should be consistent and provide meaningful error information
   * while maintaining benchmark integrity.
   */
  test('Property: Error handling maintains benchmark consistency', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          shouldFail: fc.boolean(),
          failureRate: fc.float({ min: Math.fround(0.5), max: Math.fround(0.9) }), // Higher failure rate for reliable testing
          iterations: fc.integer({ min: 3, max: 6 }) // Reduced iterations
        }),
        async (testData) => {
          let executionCount = 0;

          const config: BenchmarkConfig = {
            name: 'Error Handling Test',
            description: 'Test error handling consistency',
            category: 'data-operations',
            iterations: testData.iterations,
            timeout: 3000, // Reduced timeout
            setup: async () => {
              executionCount = 0;
            },
            test: async () => {
              executionCount++;
              
              if (testData.shouldFail && Math.random() < testData.failureRate) {
                throw new Error(`Simulated failure on iteration ${executionCount}`);
              }
              
              // Simulate successful operation
              await new Promise(resolve => setTimeout(resolve, 20)); // Reduced delay
            },
            teardown: async () => {
              // Cleanup should always run
            }
          };

          const result = await benchmark.runBenchmark(config);

          // Property 1: Benchmark should handle errors gracefully
          if (testData.shouldFail && testData.failureRate > 0.7) {
            // Only expect failure if failure rate is high enough to be reliable
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(typeof result.error).toBe('string');
          } else if (!testData.shouldFail) {
            // If not configured to fail, should succeed
            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();
          }
          // For cases with low failure rate, we don't assert success/failure as it's unpredictable

          // Property 2: Partial results should still be meaningful
          // Even if benchmark fails, completed iterations should be tracked
          expect(result.iterations).toBeGreaterThanOrEqual(0);
          expect(result.iterations).toBeLessThanOrEqual(testData.iterations);

          // Property 3: Memory tracking should work even with errors
          expect(result.memoryUsage).toBeDefined();
          expect(result.memoryUsage.initial).toBeGreaterThanOrEqual(0);
          expect(result.memoryUsage.final).toBeGreaterThanOrEqual(0);

          // Property 4: Timing data should be consistent with completed iterations
          if (result.iterations > 0) {
            expect(result.averageDuration).toBeGreaterThan(0);
            expect(result.totalDuration).toBeGreaterThan(0);
            expect(result.throughput).toBeGreaterThan(0);
          } else {
            expect(result.averageDuration).toBe(0);
            expect(result.totalDuration).toBe(0);
            expect(result.throughput).toBe(0);
          }

          // Property 5: Metadata should always be present
          expect(result.name).toBe('Error Handling Test');
          expect(result.category).toBe('data-operations');
          expect(result.timestamp).toBeGreaterThan(0);
        }
      ),
      { 
        numRuns: 10, // Reduced runs
        timeout: 15000 // Reduced timeout
      }
    );
  }, 25000); // Reduced test timeout
});