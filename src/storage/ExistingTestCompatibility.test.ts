/**
 * Integration tests for existing test compatibility with storage optimization
 * Validates: Requirements 2.2
 */

import { StorageManager } from './StorageManager';
import { EnvironmentDetector } from './EnvironmentDetector';
import { getPropertyTestParams } from '../test-utils/property-test-config';
import * as fc from 'fast-check';

describe('Existing Test Compatibility', () => {
  let storageManager: StorageManager;
  let environmentDetector: EnvironmentDetector;

  beforeEach(async () => {
    // Clear localStorage before each test
    localStorage.clear();
    
    // Reset environment detector cache
    environmentDetector = EnvironmentDetector.getInstance();
    environmentDetector.resetCache();
    
    // Get fresh instance
    storageManager = StorageManager.getInstance();
    
    // Clear storage using the manager
    await storageManager.clear();
  });

  afterEach(async () => {
    localStorage.clear();
    if (storageManager) {
      await storageManager.clear();
    }
  });

  /**
   * Test that existing localStorage patterns work with storage manager
   */
  test('should maintain backward compatibility with direct localStorage usage', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({
          key: fc.string({ minLength: 1, maxLength: 50 }),
          value: fc.string({ minLength: 1, maxLength: 1000 })
        }), { minLength: 1, maxLength: 10 }),
        
        async (testData) => {
          // Create map to handle duplicate keys (last value wins)
          const testMap = new Map<string, string>();
          for (const { key, value } of testData) {
            testMap.set(key, value);
          }
          
          // Test direct localStorage usage (existing pattern)
          for (const { key, value } of testData) {
            localStorage.setItem(key, value);
          }
          
          // Verify data can be retrieved via storage manager (check against final values for duplicate keys)
          for (const [key, expectedValue] of testMap) {
            const retrievedValue = await storageManager.getItem(key);
            expect(retrievedValue).toBe(expectedValue);
          }
          
          // Test storage manager usage
          const managerKey = 'manager_test_key';
          const managerValue = 'manager_test_value';
          await storageManager.setItem(managerKey, managerValue);
          
          // Verify data can be retrieved via direct localStorage
          const directValue = localStorage.getItem(managerKey);
          expect(directValue).toBeTruthy();
          
          // Clear using storage manager
          await storageManager.clear();
          
          // Verify all data is cleared
          expect(localStorage.length).toBe(0);
          
          return true;
        }
      ),
      getPropertyTestParams()
    );
  });

  /**
   * Test that existing test cleanup patterns work with storage manager
   */
  test('should support existing test cleanup patterns', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 5, maxLength: 15 }),
        
        async (keys) => {
          // Simulate existing test pattern - setup data
          for (const key of keys) {
            localStorage.setItem(key, `value_${key}`);
          }
          
          // Verify data exists
          expect(localStorage.length).toBeGreaterThan(0);
          
          // Test existing cleanup pattern (localStorage.clear())
          localStorage.clear();
          expect(localStorage.length).toBe(0);
          
          // Setup data again using storage manager
          for (const key of keys) {
            await storageManager.setItem(key, `manager_value_${key}`);
          }
          
          // Test storage manager cleanup
          await storageManager.clear();
          expect(localStorage.length).toBe(0);
          
          return true;
        }
      ),
      getPropertyTestParams()
    );
  });

  /**
   * Test that existing test isolation patterns work
   */
  test('should maintain test isolation with storage optimization', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          test1Data: fc.array(fc.record({
            key: fc.string({ minLength: 1, maxLength: 20 }),
            value: fc.string({ minLength: 1, maxLength: 100 })
          }), { minLength: 1, maxLength: 5 }),
          test2Data: fc.array(fc.record({
            key: fc.string({ minLength: 1, maxLength: 20 }),
            value: fc.string({ minLength: 1, maxLength: 100 })
          }), { minLength: 1, maxLength: 5 })
        }),
        
        async ({ test1Data, test2Data }) => {
          // Create maps to handle duplicate keys (last value wins)
          const test1Map = new Map<string, string>();
          const test2Map = new Map<string, string>();
          
          // Build maps with last-value-wins for duplicates
          for (const { key, value } of test1Data) {
            test1Map.set(key, value);
          }
          for (const { key, value } of test2Data) {
            test2Map.set(key, value);
          }
          
          // Simulate test 1 execution
          for (const { key, value } of test1Data) {
            await storageManager.setItem(`test1_${key}`, value);
          }
          
          // Verify test 1 data exists (check against final values for duplicate keys)
          for (const [key, expectedValue] of test1Map) {
            const retrievedValue = await storageManager.getItem(`test1_${key}`);
            expect(retrievedValue).toBe(expectedValue);
          }
          
          // Simulate test cleanup (existing pattern)
          await storageManager.clear();
          
          // Verify cleanup worked
          expect(localStorage.length).toBe(0);
          
          // Simulate test 2 execution
          for (const { key, value } of test2Data) {
            await storageManager.setItem(`test2_${key}`, value);
          }
          
          // Verify test 2 data exists and test 1 data doesn't (check against final values for duplicate keys)
          for (const [key, expectedValue] of test2Map) {
            const retrievedValue = await storageManager.getItem(`test2_${key}`);
            expect(retrievedValue).toBe(expectedValue);
          }
          
          for (const [key] of test1Map) {
            const retrievedValue = await storageManager.getItem(`test1_${key}`);
            expect(retrievedValue).toBeNull();
          }
          
          return true;
        }
      ),
      getPropertyTestParams()
    );
  });

  /**
   * Test that existing error handling patterns work
   */
  test('should maintain existing error handling behavior', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 1000 }),
        
        async (key, value) => {
          // Test normal operation
          await storageManager.setItem(key, value);
          const retrievedValue = await storageManager.getItem(key);
          expect(retrievedValue).toBe(value);
          
          // Test removal
          await storageManager.removeItem(key);
          const removedValue = await storageManager.getItem(key);
          expect(removedValue).toBeNull();
          
          // Test non-existent key (existing pattern)
          const nonExistentValue = await storageManager.getItem('non_existent_key');
          expect(nonExistentValue).toBeNull();
          
          // This should match existing localStorage behavior
          const directNonExistentValue = localStorage.getItem('non_existent_key');
          expect(nonExistentValue).toBe(directNonExistentValue);
          
          return true;
        }
      ),
      getPropertyTestParams()
    );
  });

  /**
   * Test that storage manager doesn't break existing synchronous patterns
   */
  test('should not break existing synchronous localStorage patterns', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({
          key: fc.string({ minLength: 1, maxLength: 20 }),
          value: fc.string({ minLength: 1, maxLength: 100 })
        }), { minLength: 1, maxLength: 10 }),
        
        (testData) => {
          // Test existing synchronous patterns still work
          for (const { key, value } of testData) {
            localStorage.setItem(key, value);
            const retrieved = localStorage.getItem(key);
            expect(retrieved).toBe(value);
          }
          
          // Test synchronous cleanup
          localStorage.clear();
          expect(localStorage.length).toBe(0);
          
          return true;
        }
      ),
      getPropertyTestParams()
    );
  });

  /**
   * Test that CI optimizations don't break existing functionality
   */
  test('should maintain functionality with CI optimizations enabled', async () => {
    // Enable CI optimization
    const ciConfig = environmentDetector.getCIConfiguration();
    storageManager.enableOptimization(ciConfig);
    
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({
          key: fc.string({ minLength: 1, maxLength: 20 }),
          value: fc.string({ minLength: 1, maxLength: 500 }) // Smaller values for CI
        }), { minLength: 1, maxLength: 5 }), // Fewer items for CI
        
        async (testData) => {
          // Test that basic operations still work with optimization
          // Create a map to handle duplicate keys - last value wins
          const keyValueMap = new Map<string, string>();
          for (const { key, value } of testData) {
            keyValueMap.set(key, value);
            await storageManager.setItem(key, value);
          }
          
          // Verify data integrity using the final values for each key
          for (const [key, expectedValue] of keyValueMap) {
            const retrievedValue = await storageManager.getItem(key);
            expect(retrievedValue).toBe(expectedValue);
          }
          
          // Test cleanup with optimization
          await storageManager.clear();
          
          // Verify cleanup worked
          for (const { key } of testData) {
            const retrievedValue = await storageManager.getItem(key);
            expect(retrievedValue).toBeNull();
          }
          
          return true;
        }
      ),
      getPropertyTestParams()
    );
  });

  /**
   * Test that property-based test configuration works correctly
   */
  test('should use optimized iteration counts in CI environment', () => {
    const params = getPropertyTestParams();
    
    // Verify that parameters are appropriate for environment
    expect(params.numRuns).toBeGreaterThan(0);
    expect(params.timeout).toBeGreaterThan(0);
    
    // In CI, should have reduced iterations
    const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
    if (isCI) {
      expect(params.numRuns).toBeLessThanOrEqual(25);
      expect(params.timeout).toBeLessThanOrEqual(5000);
    } else {
      expect(params.numRuns).toBeGreaterThanOrEqual(50);
    }
  });
});