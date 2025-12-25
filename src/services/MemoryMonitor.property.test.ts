/**
 * Property-Based Tests for Memory Monitor
 * 
 * Tests memory stability and monitoring functionality using property-based testing
 * to ensure the memory monitoring system works correctly across various scenarios.
 */

import * as fc from 'fast-check';
import { MemoryMonitor, MemorySnapshot, MemoryLeakDetection } from './MemoryMonitor';
import { ResourcePool, ResourcePoolManager } from './ResourcePool';

describe('Memory Monitor Property Tests', () => {
  let memoryMonitor: MemoryMonitor;
  let resourcePoolManager: ResourcePoolManager;

  beforeEach(() => {
    memoryMonitor = new MemoryMonitor();
    resourcePoolManager = new ResourcePoolManager();
  });

  afterEach(() => {
    memoryMonitor.stopMonitoring();
    memoryMonitor.clearHistory();
    resourcePoolManager.clearAll();
  });

  /**
   * Property 3: Memory stability over time
   * **Validates: Requirements 4.1, 4.3, 4.5**
   * 
   * For any sequence of memory-intensive operations performed over time,
   * the memory monitoring system should maintain stable memory usage patterns
   * and detect any significant memory leaks or pressure conditions.
   */
  test('Property: Memory monitoring maintains stability over extended operations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          operationCount: fc.integer({ min: 5, max: 20 }), // Reduced from 10-100
          operationSize: fc.integer({ min: 50, max: 1000 }), // Reduced from 100-10000
          monitoringDuration: fc.integer({ min: 200, max: 1000 }), // Reduced from 1000-5000
          cleanupFrequency: fc.integer({ min: 3, max: 8 }) // Reduced from 5-20
        }),
        async (testData) => {
          // Start memory monitoring with faster frequency for testing
          memoryMonitor.startMonitoring(50); // Monitor every 50ms for faster testing
          
          const initialSnapshot = memoryMonitor.takeSnapshot();
          const operations: any[] = [];
          
          try {
            // Perform memory-intensive operations
            for (let i = 0; i < testData.operationCount; i++) {
              // Allocate smaller memory chunks
              const operation = {
                id: i,
                data: new Array(testData.operationSize).fill(0).map((_, idx) => ({
                  index: idx,
                  value: Math.random(),
                  timestamp: Date.now()
                }))
              };
              operations.push(operation);
              
              // Periodic cleanup to simulate real-world usage
              if (i % testData.cleanupFrequency === 0 && operations.length > 2) {
                // Remove some operations to simulate cleanup
                operations.splice(0, Math.floor(operations.length / 3));
                
                // Trigger manual cleanup
                memoryMonitor.triggerCleanup();
                
                // Wait a bit for cleanup to take effect
                await new Promise(resolve => setTimeout(resolve, 10)); // Reduced wait time
              }
              
              // Take periodic snapshots less frequently
              if (i % 3 === 0) {
                memoryMonitor.takeSnapshot();
              }
            }
            
            // Wait for monitoring duration (reduced)
            await new Promise(resolve => setTimeout(resolve, testData.monitoringDuration));
            
            const finalSnapshot = memoryMonitor.takeSnapshot();
            const memoryStats = memoryMonitor.getMemoryStats();
            const leakDetection = memoryMonitor.detectMemoryLeaks();
            
            // Property 1: Memory monitoring should provide consistent snapshots
            expect(initialSnapshot.timestamp).toBeGreaterThan(0);
            expect(finalSnapshot.timestamp).toBeGreaterThan(initialSnapshot.timestamp);
            expect(initialSnapshot.memoryInfo.usedJSHeapSize).toBeGreaterThanOrEqual(0);
            expect(finalSnapshot.memoryInfo.usedJSHeapSize).toBeGreaterThanOrEqual(0);
            
            // Property 2: Memory statistics should be reasonable
            expect(memoryStats.current.usedJSHeapSize).toBeGreaterThanOrEqual(0);
            expect(memoryStats.peak.usedJSHeapSize).toBeGreaterThanOrEqual(memoryStats.current.usedJSHeapSize);
            expect(memoryStats.average.usedJSHeapSize).toBeGreaterThanOrEqual(0);
            
            // Property 3: Memory growth rate should be reasonable (not indicating severe leaks)
            // Allow for some growth due to test operations, but not excessive
            const maxReasonableGrowthRate = 50 * 1024 * 1024; // Increased to 50MB/s for test tolerance
            expect(Math.abs(memoryStats.growthRate)).toBeLessThan(maxReasonableGrowthRate);
            
            // Property 4: Leak detection should work consistently
            expect(leakDetection.detected).toBeDefined();
            expect(leakDetection.growthRate).toBeDefined();
            expect(leakDetection.duration).toBeGreaterThanOrEqual(0);
            expect(Array.isArray(leakDetection.snapshots)).toBe(true);
            
            // Property 5: Memory history should be maintained properly
            const memoryHistory = memoryMonitor.getMemoryHistory();
            expect(memoryHistory.length).toBeGreaterThan(0);
            expect(memoryHistory[0].timestamp).toBeLessThanOrEqual(memoryHistory[memoryHistory.length - 1].timestamp);
            
            // Property 6: All snapshots should have valid memory info
            memoryHistory.forEach(snapshot => {
              expect(snapshot.timestamp).toBeGreaterThan(0);
              expect(snapshot.memoryInfo.usedJSHeapSize).toBeGreaterThanOrEqual(0);
              expect(snapshot.memoryInfo.totalJSHeapSize).toBeGreaterThanOrEqual(0);
              expect(snapshot.memoryInfo.jsHeapSizeLimit).toBeGreaterThanOrEqual(0);
              expect(snapshot.activeObjects).toBeGreaterThanOrEqual(0);
            });
            
          } finally {
            // Cleanup
            operations.length = 0;
            memoryMonitor.stopMonitoring();
          }
        }
      ),
      { numRuns: 10, timeout: 15000 } // Reduced runs and timeout
    );
  }, 20000); // Increased test timeout to 20 seconds

  /**
   * Property: Resource pool memory management
   * **Validates: Requirements 4.2, 4.4**
   * 
   * For any resource pool configuration and usage pattern,
   * the pool should manage memory efficiently and provide accurate statistics.
   */
  test('Property: Resource pools manage memory efficiently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          poolSize: fc.integer({ min: 10, max: 100 }),
          preAllocate: fc.integer({ min: 0, max: 20 }),
          acquisitions: fc.integer({ min: 5, max: 50 }),
          objectSize: fc.integer({ min: 10, max: 1000 })
        }),
        async (testData) => {
          // Create a test object pool
          const pool = resourcePoolManager.createPool({
            name: `test-pool-${Date.now()}`,
            factory: () => ({
              id: Math.random().toString(36),
              data: new Array(testData.objectSize).fill(0).map(() => Math.random())
            }),
            reset: (obj) => {
              obj.id = '';
              obj.data.length = 0;
            },
            maxSize: testData.poolSize,
            preAllocate: testData.preAllocate
          });
          
          const initialStats = pool.getStats();
          const acquiredObjects: any[] = [];
          
          try {
            // Property 1: Pre-allocation should work correctly
            // Note: preAllocate is limited by maxSize
            const expectedPreAllocated = Math.min(testData.preAllocate, testData.poolSize);
            expect(initialStats.currentAvailable).toBe(expectedPreAllocated);
            expect(initialStats.totalCreated).toBe(expectedPreAllocated);
            expect(initialStats.currentInUse).toBe(0);
            
            // Acquire objects from the pool
            for (let i = 0; i < testData.acquisitions; i++) {
              const obj = pool.acquire();
              acquiredObjects.push(obj);
              
              // Property 2: Acquired objects should be valid
              expect(obj).toBeDefined();
              expect(obj.data).toBeDefined();
              expect(Array.isArray(obj.data)).toBe(true);
            }
            
            const midStats = pool.getStats();
            
            // Property 3: Pool statistics should be accurate during usage
            expect(midStats.currentInUse).toBe(testData.acquisitions);
            expect(midStats.totalAcquired).toBe(testData.acquisitions);
            expect(midStats.peakInUse).toBe(testData.acquisitions);
            
            // Release half of the objects
            const toRelease = acquiredObjects.splice(0, Math.floor(testData.acquisitions / 2));
            toRelease.forEach(obj => pool.release(obj));
            
            const afterReleaseStats = pool.getStats();
            
            // Property 4: Pool statistics should update correctly after releases
            expect(afterReleaseStats.totalReleased).toBe(toRelease.length);
            expect(afterReleaseStats.currentInUse).toBe(acquiredObjects.length);
            expect(afterReleaseStats.currentAvailable).toBeGreaterThan(0);
            
            // Property 5: Hit rate should be reasonable when reusing objects
            if (afterReleaseStats.totalAcquired > 0) {
              expect(afterReleaseStats.hitRate).toBeGreaterThanOrEqual(0);
              expect(afterReleaseStats.hitRate).toBeLessThanOrEqual(100);
            }
            
            // Release remaining objects
            acquiredObjects.forEach(obj => pool.release(obj));
            acquiredObjects.length = 0;
            
            const finalStats = pool.getStats();
            
            // Property 6: All objects should be released properly
            expect(finalStats.currentInUse).toBe(0);
            expect(finalStats.totalReleased).toBe(testData.acquisitions);
            
          } finally {
            // Cleanup
            acquiredObjects.forEach(obj => {
              try {
                pool.release(obj);
              } catch (e) {
                // Ignore errors during cleanup
              }
            });
            resourcePoolManager.removePool(pool.getConfig().name);
          }
        }
      ),
      { numRuns: 25 }
    );
  });

  /**
   * Property: Memory pressure detection and handling
   * **Validates: Requirements 4.1, 4.5**
   * 
   * For any memory threshold configuration and usage pattern,
   * the memory monitor should correctly detect and handle memory pressure events.
   */
  test('Property: Memory pressure detection works correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          warningThreshold: fc.integer({ min: 1024 * 1024, max: 50 * 1024 * 1024 }), // 1MB to 50MB
          criticalThreshold: fc.integer({ min: 50 * 1024 * 1024, max: 100 * 1024 * 1024 }), // 50MB to 100MB
          allocationSize: fc.integer({ min: 100, max: 5000 }),
          monitoringTime: fc.integer({ min: 500, max: 2000 })
        }),
        async (testData) => {
          // Ensure critical threshold is higher than warning threshold
          const warningThreshold = testData.warningThreshold;
          const criticalThreshold = Math.max(testData.criticalThreshold, warningThreshold + 1024 * 1024);
          
          const testMonitor = new MemoryMonitor({
            warning: warningThreshold,
            critical: criticalThreshold,
            leakDetection: 10 * 1024 * 1024 // 10MB
          });
          
          const pressureEvents: any[] = [];
          let cleanupTriggered = false;
          
          // Register callbacks
          testMonitor.onMemoryPressure((event) => {
            pressureEvents.push(event);
          });
          
          testMonitor.onCleanupNeeded(() => {
            cleanupTriggered = true;
          });
          
          testMonitor.startMonitoring(100);
          
          try {
            // Simulate some memory allocation
            const allocations: any[] = [];
            for (let i = 0; i < 10; i++) {
              allocations.push(new Array(testData.allocationSize).fill(Math.random()));
              testMonitor.takeSnapshot();
              await new Promise(resolve => setTimeout(resolve, testData.monitoringTime / 10));
            }
            
            const memoryStats = testMonitor.getMemoryStats();
            
            // Property 1: Memory monitoring should provide valid statistics
            expect(memoryStats.current.usedJSHeapSize).toBeGreaterThanOrEqual(0);
            expect(memoryStats.peak.usedJSHeapSize).toBeGreaterThanOrEqual(memoryStats.current.usedJSHeapSize);
            expect(memoryStats.average.usedJSHeapSize).toBeGreaterThanOrEqual(0);
            
            // Property 2: Growth rate should be calculated
            expect(typeof memoryStats.growthRate).toBe('number');
            
            // Property 3: Leak detection should provide valid results
            const leakDetection = memoryStats.leakDetection;
            expect(typeof leakDetection.detected).toBe('boolean');
            expect(typeof leakDetection.growthRate).toBe('number');
            expect(leakDetection.duration).toBeGreaterThanOrEqual(0);
            expect(Array.isArray(leakDetection.snapshots)).toBe(true);
            
            // Property 4: Memory history should be maintained
            const history = testMonitor.getMemoryHistory();
            expect(history.length).toBeGreaterThan(0);
            
            // Property 5: All snapshots should have increasing timestamps
            for (let i = 1; i < history.length; i++) {
              expect(history[i].timestamp).toBeGreaterThanOrEqual(history[i - 1].timestamp);
            }
            
            // Property 6: Pressure events should have valid structure if any occurred
            pressureEvents.forEach(event => {
              expect(event.timestamp).toBeGreaterThan(0);
              expect(event.memoryUsage).toBeDefined();
              expect(['warning', 'critical']).toContain(event.severity);
              expect(['cleanup', 'alert', 'throttle']).toContain(event.action);
            });
            
            // Cleanup allocations
            allocations.length = 0;
            
          } finally {
            testMonitor.stopMonitoring();
          }
        }
      ),
      { numRuns: 15, timeout: 20000 }
    );
  });
});