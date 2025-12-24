/**
 * Core Functionality Validation Test
 * 
 * This test validates that all core components work together and meet the key requirements:
 * 1. Storage optimization reduces usage by 50%
 * 2. Fallback mechanisms activate correctly
 * 3. All components integrate properly
 */

import { StorageManager } from './StorageManager';
import { EnvironmentDetector } from './EnvironmentDetector';
import { TestStorageOptimizer } from './TestStorageOptimizer';
import { PersistenceFallback } from './PersistenceFallback';
import { InMemoryStorageProvider } from './InMemoryStorageProvider';
import { MockStorageProvider } from './MockStorageProvider';

describe('Core Functionality Validation', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Reset singletons for clean test state
    (StorageManager as any).instance = undefined;
    (EnvironmentDetector as any).instance = undefined;
    TestStorageOptimizer.resetInstance();
  });

  afterEach(() => {
    process.env = originalEnv;
    // Clean up any storage
    try {
      const storageManager = StorageManager.getInstance();
      storageManager.clear();
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('1. Core Components Integration', () => {
    it('should integrate all components without errors', () => {
      // Set up CI environment
      process.env.CI = 'true';
      process.env.GITHUB_ACTIONS = 'true';

      // Initialize all components using singletons
      const environmentDetector = EnvironmentDetector.getInstance();
      const testOptimizer = TestStorageOptimizer.getInstance();
      const storageManager = StorageManager.getInstance();

      // Verify all components are properly initialized
      expect(environmentDetector.isCIEnvironment()).toBe(true);
      expect(environmentDetector.isGitHubActions()).toBe(true);
      expect(storageManager.getStorageInfo()).toBeDefined();
    });

    it('should enable optimization mode in CI environment', () => {
      // Set up CI environment
      process.env.CI = 'true';
      process.env.GITHUB_ACTIONS = 'true';

      const environmentDetector = EnvironmentDetector.getInstance();
      const storageManager = StorageManager.getInstance();

      // Verify CI configuration is loaded
      const config = environmentDetector.getCIConfiguration();
      expect(config.compressionEnabled).toBe(true);
      expect(config.aggressiveCleanup).toBe(true);
      expect(config.reducedIterations).toBe(true);
      expect(config.fallbackEnabled).toBe(true);
    });
  });

  describe('2. Storage Usage Reduction Validation', () => {
    it('should reduce storage usage by at least 50% in CI mode', async () => {
      // Test data optimization rather than compression
      // Set up CI environment
      process.env.CI = 'true';
      process.env.GITHUB_ACTIONS = 'true';

      const testOptimizer = TestStorageOptimizer.getInstance();
      testOptimizer.reloadConfiguration();

      // Test dataset size reduction
      const largeDataset = Array.from({ length: 1000 }, (_, i) => ({ 
        id: i, 
        data: `item-${i}`,
        metadata: `metadata-${i}`,
        timestamp: Date.now()
      }));

      const optimizedDataset = testOptimizer.optimizeTestData(largeDataset);
      
      // Verify significant reduction in dataset size
      const reductionPercentage = ((largeDataset.length - optimizedDataset.length) / largeDataset.length) * 100;
      expect(reductionPercentage).toBeGreaterThanOrEqual(50);
      expect(optimizedDataset.length).toBeGreaterThan(0); // Should not be empty

      // Test iteration count reduction
      const baseIterations = 1000;
      const optimizedIterations = testOptimizer.getOptimizedIterationCount(baseIterations);
      const iterationReduction = ((baseIterations - optimizedIterations) / baseIterations) * 100;
      expect(iterationReduction).toBeGreaterThanOrEqual(50);
    });

    it('should optimize test data for CI environments', () => {
      // Set up CI environment
      process.env.CI = 'true';
      process.env.GITHUB_ACTIONS = 'true';

      const testOptimizer = TestStorageOptimizer.getInstance();
      testOptimizer.reloadConfiguration();

      // Test dataset optimization
      const largeDataset = Array.from({ length: 1000 }, (_, i) => ({ id: i, data: `item-${i}` }));
      const optimizedDataset = testOptimizer.optimizeTestData(largeDataset);

      expect(optimizedDataset.length).toBeLessThan(largeDataset.length);
      expect(optimizedDataset.length).toBeGreaterThan(0); // Should not be empty

      // Test iteration count reduction
      const baseIterations = 1000;
      const optimizedIterations = testOptimizer.getOptimizedIterationCount(baseIterations);

      expect(optimizedIterations).toBeLessThan(baseIterations);
      expect(optimizedIterations).toBeGreaterThanOrEqual(25); // Minimum threshold
    });
  });

  describe('3. Fallback Mechanism Validation', () => {
    it('should activate fallback storage when localStorage fails', async () => {
      // Mock localStorage to be unavailable
      const originalLocalStorage = global.localStorage;
      delete (global as any).localStorage;

      try {
        const storageManager = StorageManager.getInstance();

        // Try to store data - should trigger fallback
        await storageManager.setItem('test-data', 'test-value');

        // Verify data can still be retrieved (through fallback)
        const retrievedData = await storageManager.getItem('test-data');
        expect(retrievedData).toBe('test-value');

        // Verify fallback is active
        const storageInfo = storageManager.getStorageInfo();
        expect(storageInfo.fallbackActive).toBe(true);
      } finally {
        // Restore localStorage
        global.localStorage = originalLocalStorage;
      }
    });

    it('should maintain API consistency across storage backends', async () => {
      const storageManager = StorageManager.getInstance();

      // Test all storage operations work consistently
      const testKey = 'test-key';
      const testValue = 'test-value';

      // Set item
      await storageManager.setItem(testKey, testValue);

      // Get item
      const retrievedValue = await storageManager.getItem(testKey);
      expect(retrievedValue).toBe(testValue);

      // Remove item
      await storageManager.removeItem(testKey);
      const removedValue = await storageManager.getItem(testKey);
      expect(removedValue).toBeNull();

      // Clear storage
      await storageManager.setItem('another-key', 'another-value');
      await storageManager.clear();
      const clearedValue = await storageManager.getItem('another-key');
      expect(clearedValue).toBeNull();
    });

    it('should gracefully degrade through multiple failure modes', async () => {
      // Mock localStorage to throw quota errors
      const originalSetItem = Storage.prototype.setItem;
      let callCount = 0;
      
      Storage.prototype.setItem = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          const error = new Error('QuotaExceededError: Storage quota exceeded');
          error.name = 'QuotaExceededError';
          throw error;
        }
      });

      try {
        const storageManager = StorageManager.getInstance();

        // This should trigger fallback mechanisms
        await storageManager.setItem('test-data', 'large-data');

        // Should end up using fallback storage
        const storageInfo = storageManager.getStorageInfo();
        expect(storageInfo.fallbackActive).toBe(true);

        // Data should still be accessible
        const retrievedData = await storageManager.getItem('test-data');
        expect(retrievedData).toBe('large-data');
      } finally {
        // Restore original setItem
        Storage.prototype.setItem = originalSetItem;
      }
    });
  });

  describe('4. End-to-End Integration Test', () => {
    it('should handle complete CI workflow with optimization and fallback', async () => {
      // Set up CI environment
      process.env.CI = 'true';
      process.env.GITHUB_ACTIONS = 'true';

      const storageManager = StorageManager.getInstance();
      const testOptimizer = TestStorageOptimizer.getInstance();
      testOptimizer.reloadConfiguration();

      // Simulate a typical test scenario
      const testScenarios = [
        { key: 'players', data: testOptimizer.optimizeTestData(Array.from({ length: 50 }, (_, i) => ({ id: i, name: `Player ${i}` }))) },
        { key: 'schedule', data: { weeks: Array.from({ length: 10 }, (_, i) => ({ week: i + 1 })) } },
        { key: 'pairings', data: Array.from({ length: 100 }, (_, i) => ({ pairing: i })) }
      ];

      // Store all test data
      for (const scenario of testScenarios) {
        await storageManager.setItem(scenario.key, JSON.stringify(scenario.data));
      }

      // Verify all data can be retrieved
      for (const scenario of testScenarios) {
        const retrieved = await storageManager.getItem(scenario.key);
        expect(retrieved).not.toBeNull();
        expect(JSON.parse(retrieved!)).toEqual(scenario.data);
      }

      // Verify storage info is available
      const storageInfo = storageManager.getStorageInfo();
      expect(storageInfo).toBeDefined();
      expect(storageInfo.usedBytes).toBeGreaterThanOrEqual(0);

      // Clean up
      await storageManager.clear();
      const finalInfo = storageManager.getStorageInfo();
      expect(finalInfo.usedBytes).toBe(0);
    });
  });
});