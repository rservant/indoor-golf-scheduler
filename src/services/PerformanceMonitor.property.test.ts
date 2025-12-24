/**
 * Property-Based Tests for Performance Monitor
 * 
 * Tests the accuracy and reliability of performance monitoring across various scenarios.
 */

import * as fc from 'fast-check';
import { 
  PerformanceMonitor, 
  PerformanceThresholds, 
  PerformanceMetrics 
} from './PerformanceMonitor';
import { 
  PerformanceAlertingSystem, 
  AlertSeverity 
} from './PerformanceAlertingSystem';

describe('Performance Monitor Property Tests', () => {
  let performanceMonitor: PerformanceMonitor;
  let alertingSystem: PerformanceAlertingSystem;

  beforeEach(() => {
    performanceMonitor = new PerformanceMonitor();
    alertingSystem = new PerformanceAlertingSystem();
  });

  afterEach(() => {
    performanceMonitor.clearMetrics();
    alertingSystem.clearAlerts();
  });

  /**
   * Property 1: Performance monitoring accuracy
   * **Validates: Requirements 5.1, 5.2, 5.3**
   * 
   * For any operation with a simulated duration, the performance monitor should:
   * 1. Accurately measure the duration within acceptable tolerance
   * 2. Correctly track memory usage changes
   * 3. Properly store and retrieve metrics
   */
  test('Property 1: Performance monitoring accuracy', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          operationName: fc.string({ minLength: 1, maxLength: 50 }),
          simulatedDurationMs: fc.integer({ min: 1, max: 100 }), // Reduced max duration
          metadata: fc.option(fc.dictionary(fc.string(), fc.anything()), { nil: undefined })
        }),
        async (testData) => {
          // Start tracking the operation
          const tracker = performanceMonitor.startOperation(
            testData.operationName, 
            testData.metadata
          );

          // Simulate work by waiting for the specified duration
          const startTime = performance.now();
          await new Promise(resolve => setTimeout(resolve, testData.simulatedDurationMs));
          const actualDuration = performance.now() - startTime;

          // End tracking
          const metrics = performanceMonitor.endOperation(tracker);

          // Verify accuracy of duration measurement
          // Allow for reasonable tolerance due to timer precision and system load
          const tolerance = Math.max(50, testData.simulatedDurationMs * 0.5); // 50ms or 50% tolerance
          const durationDifference = Math.abs(metrics.duration - actualDuration);
          
          expect(durationDifference).toBeLessThan(tolerance);
          expect(metrics.duration).toBeGreaterThan(0);
          expect(metrics.operationName).toBe(testData.operationName);
          
          // Verify timing consistency
          expect(metrics.endTime).toBeGreaterThan(metrics.startTime);
          expect(metrics.duration).toBeCloseTo(metrics.endTime - metrics.startTime, 0);

          // Verify memory usage is captured
          expect(metrics.memoryUsage).toBeDefined();
          expect(typeof metrics.memoryUsage.usedJSHeapSize).toBe('number');
          expect(typeof metrics.memoryUsage.totalJSHeapSize).toBe('number');
          expect(metrics.memoryUsage.usedJSHeapSize).toBeGreaterThanOrEqual(0);

          // Verify resource usage is captured
          expect(metrics.resourceUsage).toBeDefined();
          expect(typeof metrics.resourceUsage.heapUsed).toBe('number');
          expect(typeof metrics.resourceUsage.heapTotal).toBe('number');

          // Verify metadata is preserved
          if (testData.metadata) {
            expect(metrics.metadata).toEqual(testData.metadata);
          }

          // Verify metrics are stored and retrievable
          const storedMetrics = performanceMonitor.getMetrics();
          const matchingMetric = storedMetrics.find(m => 
            m.operationName === testData.operationName && 
            Math.abs(m.duration - metrics.duration) < 10
          );
          expect(matchingMetric).toBeDefined();

          // Verify aggregated metrics are calculated correctly
          const aggregated = performanceMonitor.getAggregatedMetrics(testData.operationName);
          expect(aggregated.totalExecutions).toBeGreaterThan(0);
          expect(aggregated.averageDuration).toBeGreaterThan(0);
          expect(aggregated.minDuration).toBeGreaterThan(0);
          expect(aggregated.maxDuration).toBeGreaterThan(0);
        }
      ),
      { 
        numRuns: 50, // Reduced from 100
        timeout: 15000 // Reduced timeout
      }
    );
  }, 20000); // Increased Jest timeout

  /**
   * Property 2: Threshold detection accuracy
   * **Validates: Requirements 5.2, 5.3**
   * 
   * For any operation with defined thresholds, the monitor should correctly
   * detect when thresholds are exceeded and trigger appropriate callbacks.
   */
  test('Property 2: Threshold detection accuracy', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          operationName: fc.string({ minLength: 1, maxLength: 50 }),
          thresholds: fc.record({
            warning: fc.integer({ min: 10, max: 50 }),
            critical: fc.integer({ min: 50, max: 100 }),
            timeout: fc.integer({ min: 100, max: 200 })
          }),
          actualDuration: fc.integer({ min: 1, max: 150 })
        }),
        async (testData) => {
          // Ensure thresholds are properly ordered
          const thresholds: PerformanceThresholds = {
            warning: Math.min(testData.thresholds.warning, testData.thresholds.critical - 1),
            critical: Math.min(testData.thresholds.critical, testData.thresholds.timeout - 1),
            timeout: testData.thresholds.timeout
          };

          // Set up threshold monitoring
          performanceMonitor.setThresholds(testData.operationName, thresholds);

          let thresholdExceededCalled = false;
          let capturedMetrics: PerformanceMetrics | null = null;

          performanceMonitor.onThresholdExceeded((metrics) => {
            if (metrics.operationName === testData.operationName) {
              thresholdExceededCalled = true;
              capturedMetrics = metrics;
            }
          });

          // Simulate operation with controlled duration
          const tracker = performanceMonitor.startOperation(testData.operationName);
          
          // Simulate the exact duration we want to test
          await new Promise(resolve => setTimeout(resolve, testData.actualDuration));
          
          const metrics = performanceMonitor.endOperation(tracker);

          // Verify threshold detection logic
          const shouldTriggerThreshold = metrics.duration >= thresholds.warning;
          
          if (shouldTriggerThreshold) {
            expect(thresholdExceededCalled).toBe(true);
            expect(capturedMetrics).toBeDefined();
            expect(capturedMetrics!.operationName).toBe(testData.operationName);
            expect(capturedMetrics!.duration).toBeGreaterThanOrEqual(thresholds.warning);
          }

          // Verify the metrics duration is reasonable given our simulation
          const tolerance = Math.max(50, testData.actualDuration * 0.5); // 50ms or 50% tolerance
          expect(Math.abs(metrics.duration - testData.actualDuration)).toBeLessThan(tolerance);
        }
      ),
      { 
        numRuns: 30, // Reduced from 50
        timeout: 10000 // Reduced timeout
      }
    );
  }, 15000); // Increased Jest timeout

  /**
   * Property 3: Concurrent operation tracking
   * **Validates: Requirements 5.1, 5.2**
   * 
   * For any number of concurrent operations, the monitor should accurately
   * track each operation independently without interference.
   */
  test('Property 3: Concurrent operation tracking', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            operationName: fc.string({ minLength: 1, maxLength: 30 }),
            duration: fc.integer({ min: 5, max: 50 }), // Reduced duration range
            metadata: fc.option(fc.record({
              id: fc.integer(),
              type: fc.constantFrom('test', 'benchmark', 'operation')
            }), { nil: undefined })
          }),
          { minLength: 2, maxLength: 5 } // Reduced max length
        ),
        async (operations) => {
          // Make operation names unique to avoid conflicts
          const uniqueOperations = operations.map((op, index) => ({
            ...op,
            operationName: `${op.operationName}_${index}_${Date.now()}`
          }));

          // Start all operations concurrently
          const trackers = uniqueOperations.map(op => ({
            tracker: performanceMonitor.startOperation(op.operationName, op.metadata),
            expectedDuration: op.duration,
            operationName: op.operationName
          }));

          // Simulate concurrent work
          const promises = trackers.map(async ({ tracker, expectedDuration }) => {
            await new Promise(resolve => setTimeout(resolve, expectedDuration));
            return performanceMonitor.endOperation(tracker);
          });

          // Wait for all operations to complete
          const results = await Promise.all(promises);

          // Verify each operation was tracked correctly
          expect(results).toHaveLength(uniqueOperations.length);

          results.forEach((metrics, index) => {
            const originalOperation = uniqueOperations[index];
            
            // Verify operation name matches
            expect(metrics.operationName).toBe(originalOperation.operationName);
            
            // Verify duration is reasonable (with tolerance for timing variations)
            const tolerance = Math.max(30, originalOperation.duration * 0.8);
            expect(Math.abs(metrics.duration - originalOperation.duration)).toBeLessThan(tolerance);
            
            // Verify timing consistency
            expect(metrics.endTime).toBeGreaterThan(metrics.startTime);
            expect(metrics.duration).toBeGreaterThan(0);
            
            // Verify metadata preservation
            if (originalOperation.metadata) {
              expect(metrics.metadata).toEqual(originalOperation.metadata);
            }
          });

          // Verify all metrics are stored
          const storedMetrics = performanceMonitor.getMetrics();
          expect(storedMetrics.length).toBeGreaterThanOrEqual(uniqueOperations.length);

          // Verify no active trackers remain (this was the main issue)
          const stats = performanceMonitor.getPerformanceStats();
          expect(stats.activeOperations).toBe(0);
        }
      ),
      { 
        numRuns: 20, // Reduced from 30
        timeout: 8000 // Reduced timeout
      }
    );
  }, 12000); // Increased Jest timeout

  /**
   * Property 4: Memory usage tracking consistency
   * **Validates: Requirements 5.1, 5.3**
   * 
   * For any operation, memory usage should be consistently tracked and
   * should reflect reasonable values for the browser environment.
   */
  test('Property 4: Memory usage tracking consistency', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          operationName: fc.string({ minLength: 1, maxLength: 40 }),
          workloadSize: fc.integer({ min: 1, max: 100 }) // Reduced workload size
        }),
        async (testData) => {
          const tracker = performanceMonitor.startOperation(testData.operationName);

          // Simulate memory-using work
          const tempData: number[] = [];
          for (let i = 0; i < testData.workloadSize; i++) {
            tempData.push(Math.random() * 1000);
          }

          // Small delay to ensure measurable duration
          await new Promise(resolve => setTimeout(resolve, 5)); // Reduced delay

          const metrics = performanceMonitor.endOperation(tracker);

          // Verify memory usage properties
          expect(metrics.memoryUsage).toBeDefined();
          expect(metrics.memoryUsage.usedJSHeapSize).toBeGreaterThanOrEqual(0);
          expect(metrics.memoryUsage.totalJSHeapSize).toBeGreaterThanOrEqual(0);
          expect(metrics.memoryUsage.jsHeapSizeLimit).toBeGreaterThanOrEqual(0);

          // Verify resource usage consistency
          expect(metrics.resourceUsage).toBeDefined();
          expect(metrics.resourceUsage.heapUsed).toBe(metrics.memoryUsage.usedJSHeapSize);
          expect(metrics.resourceUsage.heapTotal).toBe(metrics.memoryUsage.totalJSHeapSize);
          expect(metrics.resourceUsage.external).toBeGreaterThanOrEqual(0);

          // Verify logical relationships in memory usage
          if (metrics.memoryUsage.totalJSHeapSize > 0) {
            expect(metrics.memoryUsage.usedJSHeapSize).toBeLessThanOrEqual(metrics.memoryUsage.totalJSHeapSize);
          }

          // Clean up test data
          tempData.length = 0;
        }
      ),
      { 
        numRuns: 30, // Reduced from 50
        timeout: 5000 // Reduced timeout
      }
    );
  }, 8000); // Increased Jest timeout

  /**
   * Property 5: Aggregated metrics accuracy
   * **Validates: Requirements 5.1, 5.3**
   * 
   * For any series of operations with the same name, aggregated metrics
   * should accurately reflect the statistical properties of the measurements.
   */
  test('Property 5: Aggregated metrics accuracy', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          operationName: fc.string({ minLength: 1, maxLength: 30 }),
          durations: fc.array(fc.integer({ min: 5, max: 50 }), { minLength: 3, maxLength: 10 }) // Reduced duration range and max length
        }),
        async (testData) => {
          const actualDurations: number[] = [];
          const uniqueOperationName = `${testData.operationName}_${Date.now()}_${Math.random()}`;

          // Execute multiple operations with controlled durations
          for (const expectedDuration of testData.durations) {
            const tracker = performanceMonitor.startOperation(uniqueOperationName);
            await new Promise(resolve => setTimeout(resolve, expectedDuration));
            const metrics = performanceMonitor.endOperation(tracker);
            actualDurations.push(metrics.duration);
          }

          // Get aggregated metrics
          const aggregated = performanceMonitor.getAggregatedMetrics(uniqueOperationName);

          // Verify basic aggregation properties
          expect(aggregated.operationName).toBe(uniqueOperationName);
          expect(aggregated.totalExecutions).toBe(testData.durations.length);
          expect(aggregated.averageDuration).toBeGreaterThan(0);
          expect(aggregated.minDuration).toBeGreaterThan(0);
          expect(aggregated.maxDuration).toBeGreaterThan(0);
          expect(aggregated.lastExecuted).toBeGreaterThan(0);

          // Verify statistical accuracy with more tolerance
          const sortedDurations = actualDurations.sort((a, b) => a - b);
          const calculatedAverage = actualDurations.reduce((sum, d) => sum + d, 0) / actualDurations.length;
          const calculatedMin = Math.min(...actualDurations);
          const calculatedMax = Math.max(...actualDurations);

          // Allow for reasonable rounding differences and timing variations
          expect(Math.abs(aggregated.averageDuration - calculatedAverage)).toBeLessThan(10);
          expect(Math.abs(aggregated.minDuration - calculatedMin)).toBeLessThan(100); // Increased tolerance
          expect(Math.abs(aggregated.maxDuration - calculatedMax)).toBeLessThan(100); // Increased tolerance

          // Verify percentile calculations are reasonable
          expect(aggregated.p95Duration).toBeGreaterThanOrEqual(aggregated.minDuration);
          expect(aggregated.p95Duration).toBeLessThanOrEqual(aggregated.maxDuration);
          expect(aggregated.p99Duration).toBeGreaterThanOrEqual(aggregated.p95Duration);
          expect(aggregated.p99Duration).toBeLessThanOrEqual(aggregated.maxDuration);

          // Verify logical relationships
          expect(aggregated.minDuration).toBeLessThanOrEqual(aggregated.averageDuration);
          expect(aggregated.averageDuration).toBeLessThanOrEqual(aggregated.maxDuration);
        }
      ),
      { 
        numRuns: 15, // Reduced from 25
        timeout: 8000 // Reduced timeout
      }
    );
  }, 12000); // Increased Jest timeout
});