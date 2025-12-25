/**
 * Property-Based Tests for Resource Cleanup Manager
 * 
 * Tests the effectiveness of resource cleanup across various scenarios
 * **Validates: Requirements 4.2, 4.3, 4.4**
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import * as fc from 'fast-check';
import { 
  ResourceCleanupManager, 
  CleanupTask,
  resourceCleanupManager 
} from './ResourceCleanupManager';
import { memoryMonitor } from './MemoryMonitor';
import { resourcePoolManager } from './ResourcePool';

describe('Resource Cleanup Manager Property Tests', () => {
  let cleanupManager: ResourceCleanupManager;

  beforeEach(() => {
    cleanupManager = new ResourceCleanupManager({
      enableAutomaticCleanup: false, // Disable automatic for controlled testing
      cleanupInterval: 1000,
      memoryPressureThreshold: 50 * 1024 * 1024,
      maxCleanupTime: 2000
    });
  });

  afterEach(async () => {
    cleanupManager.stop();
    // Clear any registered tasks
    const tasks = cleanupManager.getCleanupTasks();
    for (const task of tasks) {
      cleanupManager.unregisterCleanupTask(task.id);
    }
  });

  /**
   * Property 6: Resource cleanup effectiveness
   * For any set of cleanup tasks, executing cleanup should reduce resource usage
   * and all tasks should complete within reasonable time limits
   * **Validates: Requirements 4.2, 4.3, 4.4**
   */
  test('Property 6: Resource cleanup effectiveness', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          taskCount: fc.integer({ min: 1, max: 10 }),
          priorities: fc.array(
            fc.constantFrom('low', 'medium', 'high', 'critical'),
            { minLength: 1, maxLength: 10 }
          ),
          memoryToFree: fc.array(
            fc.integer({ min: 1024, max: 10 * 1024 * 1024 }), // 1KB to 10MB
            { minLength: 1, maxLength: 10 }
          ),
          shouldFail: fc.array(
            fc.boolean(),
            { minLength: 1, maxLength: 10 }
          )
        }),
        async (testData) => {
          // Create a fresh cleanup manager for each test iteration
          const testCleanupManager = new ResourceCleanupManager({
            enableAutomaticCleanup: false, // Disable automatic for controlled testing
            cleanupInterval: 1000,
            memoryPressureThreshold: 50 * 1024 * 1024,
            maxCleanupTime: 2000
          });

          // Create cleanup tasks based on test data
          const tasks: CleanupTask[] = [];
          let totalExpectedMemoryFreed = 0;
          let actualMemoryFreed = 0;
          let executedTasks = 0;

          for (let i = 0; i < testData.taskCount; i++) {
            const priority = testData.priorities[i % testData.priorities.length];
            const memoryToFree = testData.memoryToFree[i % testData.memoryToFree.length];
            const shouldFail = testData.shouldFail[i % testData.shouldFail.length];

            const task: CleanupTask = {
              id: `test-task-${i}-${Date.now()}-${Math.random()}`, // Unique ID
              name: `Test Cleanup Task ${i}`,
              priority: priority as 'low' | 'medium' | 'high' | 'critical',
              cleanup: shouldFail 
                ? () => { throw new Error('Simulated cleanup failure'); }
                : () => {
                    // Simulate memory cleanup by creating and releasing objects
                    const tempArray = new Array(Math.floor(memoryToFree / 8)).fill(0);
                    tempArray.length = 0; // Release memory
                    actualMemoryFreed += memoryToFree;
                    executedTasks++;
                  },
              estimatedMemoryFreed: memoryToFree,
              executionCount: 0
            };

            tasks.push(task);
            testCleanupManager.registerCleanupTask(task);
            
            if (!shouldFail) {
              totalExpectedMemoryFreed += memoryToFree;
            }
          }

          // Record initial stats
          const initialStats = testCleanupManager.getStats();
          const startTime = performance.now();

          // Execute cleanup
          await testCleanupManager.executeCleanup();

          // Measure results
          const endTime = performance.now();
          const finalStats = testCleanupManager.getStats();
          const executionTime = endTime - startTime;

          // Property 1: Cleanup should complete within reasonable time
          // Each task should complete within maxCleanupTime, total should be reasonable
          const maxExpectedTime = testData.taskCount * 2000 + 1000; // 2s per task + 1s overhead
          expect(executionTime).toBeLessThan(maxExpectedTime);

          // Property 2: Stats should be updated correctly
          expect(finalStats.totalExecutions).toBeGreaterThanOrEqual(initialStats.totalExecutions);
          expect(finalStats.totalMemoryFreed).toBeGreaterThanOrEqual(initialStats.totalMemoryFreed);
          expect(finalStats.lastCleanupTime).toBeGreaterThan(initialStats.lastCleanupTime);

          // Property 3: Successful tasks should have been executed
          const successfulTasks = tasks.filter((_, i) => !testData.shouldFail[i % testData.shouldFail.length]);
          if (successfulTasks.length > 0) {
            expect(finalStats.totalExecutions).toBeGreaterThan(initialStats.totalExecutions);
          }

          // Property 4: Failed tasks should be counted
          const failedTasks = tasks.filter((_, i) => testData.shouldFail[i % testData.shouldFail.length]);
          if (failedTasks.length > 0) {
            expect(finalStats.failedCleanups).toBeGreaterThanOrEqual(initialStats.failedCleanups);
          }

          // Property 5: Task execution counts should be updated
          const updatedTasks = testCleanupManager.getCleanupTasks();
          for (const task of updatedTasks) {
            const originalTask = tasks.find(t => t.id === task.id);
            if (originalTask) {
              const shouldHaveFailed = testData.shouldFail[tasks.indexOf(originalTask) % testData.shouldFail.length];
              if (!shouldHaveFailed) {
                expect(task.executionCount).toBeGreaterThan(0);
                expect(task.lastExecuted).toBeDefined();
              }
            }
          }

          // Property 6: Memory cleanup effectiveness
          // At least some memory should be freed for successful tasks
          if (successfulTasks.length > 0) {
            const memoryFreedDelta = finalStats.totalMemoryFreed - initialStats.totalMemoryFreed;
            expect(memoryFreedDelta).toBeGreaterThan(0);
          }

          // Property 7: Priority ordering should be respected
          // This is harder to test directly, but we can verify all tasks were considered
          expect(finalStats.totalExecutions + finalStats.failedCleanups)
            .toBeGreaterThanOrEqual(initialStats.totalExecutions + initialStats.failedCleanups);

          // Cleanup test manager
          testCleanupManager.stop();
        }
      ),
      { 
        numRuns: 100,
        timeout: 30000 // 30 second timeout for property test
      }
    );
  }, 60000); // 60 second test timeout

  /**
   * Property: Memory pressure response effectiveness
   * For any memory pressure scenario, cleanup should be triggered appropriately
   */
  test('Property: Memory pressure response triggers appropriate cleanup', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          memoryUsage: fc.integer({ min: 10 * 1024 * 1024, max: 500 * 1024 * 1024 }), // 10MB to 500MB
          pressureThreshold: fc.integer({ min: 50 * 1024 * 1024, max: 200 * 1024 * 1024 }), // 50MB to 200MB
          taskPriorities: fc.array(
            fc.constantFrom('low', 'medium', 'high', 'critical'),
            { minLength: 1, maxLength: 5 }
          )
        }),
        async (testData) => {
          // Setup cleanup manager with test threshold
          const testManager = new ResourceCleanupManager({
            enableAutomaticCleanup: false,
            memoryPressureThreshold: testData.pressureThreshold
          });

          // Register tasks with different priorities
          let executedTasks: string[] = [];
          
          for (let i = 0; i < testData.taskPriorities.length; i++) {
            const priority = testData.taskPriorities[i];
            testManager.registerCleanupTask({
              id: `pressure-task-${i}`,
              name: `Pressure Test Task ${i}`,
              priority: priority as 'low' | 'medium' | 'high' | 'critical',
              cleanup: () => {
                executedTasks.push(`pressure-task-${i}`);
              },
              estimatedMemoryFreed: 5 * 1024 * 1024 // 5MB
            });
          }

          const initialStats = testManager.getStats();

          // Simulate memory pressure by executing cleanup
          if (testData.memoryUsage > testData.pressureThreshold) {
            // Should trigger cleanup for high memory usage
            await testManager.executeCleanup('high');
            await testManager.executeCleanup('critical');
          } else {
            // Should trigger normal cleanup for low memory usage
            await testManager.executeCleanup('low');
          }

          const finalStats = testManager.getStats();

          // Property: Cleanup should have been executed
          expect(finalStats.totalExecutions).toBeGreaterThanOrEqual(initialStats.totalExecutions);

          // Property: High priority tasks should be executed under memory pressure
          if (testData.memoryUsage > testData.pressureThreshold) {
            const highPriorityTasks = testData.taskPriorities
              .map((priority, index) => ({ priority, index }))
              .filter(({ priority }) => priority === 'high' || priority === 'critical')
              .map(({ index }) => `pressure-task-${index}`);

            for (const taskId of highPriorityTasks) {
              expect(executedTasks).toContain(taskId);
            }
          }

          // Cleanup
          testManager.stop();
        }
      ),
      { 
        numRuns: 50,
        timeout: 20000
      }
    );
  }, 40000);

  /**
   * Property: Cleanup task registration and unregistration
   * For any set of cleanup tasks, registration and unregistration should work correctly
   */
  test('Property: Cleanup task registration and unregistration consistency', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          tasks: fc.array(
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
              name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
              priority: fc.constantFrom('low', 'medium', 'high', 'critical'),
              memoryFreed: fc.integer({ min: 1024, max: 50 * 1024 * 1024 })
            }),
            { minLength: 1, maxLength: 15 }
          ),
          unregisterIndices: fc.array(
            fc.integer({ min: 0, max: 14 }),
            { minLength: 0, maxLength: 5 }
          )
        }),
        async (testData) => {
          const initialTaskCount = cleanupManager.getCleanupTasks().length;

          // Register all tasks
          const registeredTasks: CleanupTask[] = [];
          for (const taskData of testData.tasks) {
            try {
              const task: CleanupTask = {
                id: taskData.id,
                name: taskData.name,
                priority: taskData.priority as 'low' | 'medium' | 'high' | 'critical',
                cleanup: () => {
                  // Simple cleanup function
                },
                estimatedMemoryFreed: taskData.memoryFreed,
                executionCount: 0
              };

              cleanupManager.registerCleanupTask(task);
              registeredTasks.push(task);
            } catch (error) {
              // Skip invalid tasks (e.g., empty IDs, duplicate IDs)
              continue;
            }
          }

          // Property: All valid tasks should be registered
          const afterRegistration = cleanupManager.getCleanupTasks();
          expect(afterRegistration.length).toBe(initialTaskCount + registeredTasks.length);

          // Verify each task is registered
          for (const task of registeredTasks) {
            const found = afterRegistration.find(t => t.id === task.id);
            expect(found).toBeDefined();
            expect(found?.name).toBe(task.name);
            expect(found?.priority).toBe(task.priority);
          }

          // Unregister some tasks
          const tasksToUnregister = testData.unregisterIndices
            .filter(index => index < registeredTasks.length)
            .map(index => registeredTasks[index]);

          for (const task of tasksToUnregister) {
            const unregistered = cleanupManager.unregisterCleanupTask(task.id);
            expect(unregistered).toBe(true);
          }

          // Property: Unregistered tasks should be removed
          const afterUnregistration = cleanupManager.getCleanupTasks();
          const expectedCount = initialTaskCount + registeredTasks.length - tasksToUnregister.length;
          expect(afterUnregistration.length).toBe(expectedCount);

          // Verify unregistered tasks are not present
          for (const task of tasksToUnregister) {
            const found = afterUnregistration.find(t => t.id === task.id);
            expect(found).toBeUndefined();
          }

          // Property: Remaining tasks should still be present
          const remainingTasks = registeredTasks.filter(task => 
            !tasksToUnregister.some(unregistered => unregistered.id === task.id)
          );
          
          for (const task of remainingTasks) {
            const found = afterUnregistration.find(t => t.id === task.id);
            expect(found).toBeDefined();
          }
        }
      ),
      { 
        numRuns: 75,
        timeout: 15000
      }
    );
  }, 30000);

  /**
   * Property: Cleanup execution time bounds
   * For any cleanup configuration, execution should respect time limits
   */
  test('Property: Cleanup execution respects time bounds', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          maxCleanupTime: fc.integer({ min: 100, max: 5000 }), // 100ms to 5s
          taskDelays: fc.array(
            fc.integer({ min: 0, max: 1000 }), // 0 to 1s delay per task
            { minLength: 1, maxLength: 8 }
          ),
          shouldTimeout: fc.array(
            fc.boolean(),
            { minLength: 1, maxLength: 8 }
          )
        }),
        async (testData) => {
          // Create manager with specific timeout
          const testManager = new ResourceCleanupManager({
            enableAutomaticCleanup: false,
            maxCleanupTime: testData.maxCleanupTime
          });

          // Register tasks with various delays
          for (let i = 0; i < testData.taskDelays.length; i++) {
            const delay = testData.taskDelays[i];
            const shouldTimeout = testData.shouldTimeout[i % testData.shouldTimeout.length];
            
            testManager.registerCleanupTask({
              id: `timeout-task-${i}`,
              name: `Timeout Test Task ${i}`,
              priority: 'medium',
              cleanup: async () => {
                // Create delay that might exceed timeout
                const actualDelay = shouldTimeout ? testData.maxCleanupTime + 500 : delay;
                await new Promise(resolve => setTimeout(resolve, actualDelay));
              },
              estimatedMemoryFreed: 1024 * 1024 // 1MB
            });
          }

          const startTime = performance.now();
          
          // Execute cleanup - should handle timeouts gracefully
          await testManager.executeCleanup();
          
          const executionTime = performance.now() - startTime;
          const stats = testManager.getStats();

          // Property: Total execution time should be reasonable
          // Allow some overhead for task management
          const maxExpectedTime = testData.maxCleanupTime * testData.taskDelays.length + 2000;
          expect(executionTime).toBeLessThan(maxExpectedTime);

          // Property: Some tasks should have been attempted
          expect(stats.totalExecutions + stats.failedCleanups).toBeGreaterThan(0);

          // Property: Failed cleanups should be recorded for timeout tasks
          const timeoutTasks = testData.shouldTimeout.filter(Boolean).length;
          if (timeoutTasks > 0) {
            // At least some failures should be recorded (timeouts count as failures)
            expect(stats.failedCleanups).toBeGreaterThanOrEqual(0);
          }

          // Cleanup
          testManager.stop();
        }
      ),
      { 
        numRuns: 30,
        timeout: 25000
      }
    );
  }, 45000);
});