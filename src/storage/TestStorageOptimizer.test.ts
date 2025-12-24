import { TestStorageOptimizer } from './TestStorageOptimizer';
import { EnvironmentDetector } from './EnvironmentDetector';
import { Player, PlayerModel } from '../models/Player';
import { PairingHistory, PairingHistoryModel } from '../models/PairingHistory';

describe('TestStorageOptimizer Property Tests', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    
    // Reset singletons
    EnvironmentDetector.getInstance().resetCache();
    TestStorageOptimizer.resetInstance();
  });

  describe('Property 8: Dataset Size Optimization', () => {
    /**
     * Feature: ci-storage-optimization, Property 8: Dataset Size Optimization
     * **Validates: Requirements 3.1**
     */
    it('should generate smaller datasets in CI environment than in local environment', () => {
      // Clear all CI-related environment variables first
      const ciEnvVars = ['CI', 'GITHUB_ACTIONS', 'CI_STORAGE_OPTIMIZATION', 'CONTINUOUS_INTEGRATION', 'NODE_ENV'];
      const originalValues: Record<string, string | undefined> = {};
      ciEnvVars.forEach(key => {
        originalValues[key] = process.env[key];
        delete process.env[key];
      });
      
      try {
        // Test in local environment - explicitly set to local
        process.env.CI = 'false';
        process.env.GITHUB_ACTIONS = 'false';
        process.env.NODE_ENV = 'development';
        
        // Reset singletons to ensure clean state
        EnvironmentDetector.resetInstance();
        TestStorageOptimizer.resetInstance();
        
        const localOptimizer = TestStorageOptimizer.getInstance();
        const largeDataset = Array.from({ length: 100 }, (_, i) => ({ id: i, data: `item-${i}` }));
        const localResult = localOptimizer.reduceDataset(largeDataset, 100);
        
        // Reset and test in CI environment
        TestStorageOptimizer.resetInstance();
        EnvironmentDetector.resetInstance();
        
        // Set CI environment variables
        process.env.CI = 'true';
        process.env.GITHUB_ACTIONS = 'true';
        process.env.NODE_ENV = 'test';
        
        const ciOptimizer = TestStorageOptimizer.getInstance();
        const ciResult = ciOptimizer.reduceDataset(largeDataset, 100);
        
        // Property: CI datasets should be smaller than local datasets
        expect(ciResult.length).toBeLessThan(localResult.length);
        expect(ciResult.length).toBeLessThanOrEqual(40); // 40% of original max size
        
        // Additional verification: local should use full dataset when under limit
        expect(localResult.length).toBe(100); // Should not reduce in local environment
        
      } finally {
        // Restore original environment variables
        ciEnvVars.forEach(key => {
          if (originalValues[key] !== undefined) {
            process.env[key] = originalValues[key];
          } else {
            delete process.env[key];
          }
        });
      }
    });

    it('should maintain dataset representativeness when reducing size', () => {
      process.env.CI = 'true';
      process.env.GITHUB_ACTIONS = 'true';
      
      const ciOptimizer = TestStorageOptimizer.getInstance();
      
      // Create a dataset with clear patterns - ensure we have enough diversity
      const originalDataset = Array.from({ length: 60 }, (_, i) => ({
        id: i,
        type: i % 4 === 0 ? 'A' : i % 4 === 1 ? 'B' : i % 4 === 2 ? 'C' : 'D',
        value: i * 10
      }));
      
      const reducedDataset = ciOptimizer.reduceDataset(originalDataset, 20);
      
      // Property: Reduced dataset should contain items from different parts of original
      const originalTypes = new Set(originalDataset.map(item => item.type));
      const reducedTypes = new Set(reducedDataset.map(item => item.type));
      
      // Should maintain type diversity (at least 2 types)
      expect(reducedTypes.size).toBeGreaterThan(1);
      expect(reducedDataset.length).toBeLessThanOrEqual(20);
    });
  });

  describe('Property 9: Player Count Limits in CI', () => {
    /**
     * Feature: ci-storage-optimization, Property 9: Player Count Limits in CI
     * **Validates: Requirements 3.2**
     */
    it('should limit player count to essential minimum in CI environment', () => {
      process.env.CI = 'true';
      process.env.GITHUB_ACTIONS = 'true';
      
      const ciOptimizer = TestStorageOptimizer.getInstance();
      
      // Create a large array of players
      const manyPlayers: Player[] = Array.from({ length: 100 }, (_, i) => 
        new PlayerModel({
          firstName: `Player${i}`,
          lastName: `Last${i}`,
          handedness: i % 2 === 0 ? 'left' : 'right',
          timePreference: 'Either',
          seasonId: 'test-season'
        })
      );
      
      const optimizedPlayers = ciOptimizer.optimizeTestData(manyPlayers);
      
      // Property: Player count should be limited to essential minimum (12) in CI
      expect(optimizedPlayers.length).toBeLessThanOrEqual(12);
      expect(optimizedPlayers.length).toBeGreaterThanOrEqual(4); // Minimum for golf scheduling
    });

    it('should preserve player diversity when limiting count', () => {
      process.env.CI = 'true';
      process.env.GITHUB_ACTIONS = 'true';
      
      const ciOptimizer = TestStorageOptimizer.getInstance();
      
      // Create players with different characteristics
      const diversePlayers: Player[] = [];
      const handedness: ('left' | 'right')[] = ['left', 'right'];
      const timePrefs: ('AM' | 'PM' | 'Either')[] = ['AM', 'PM', 'Either'];
      
      for (let i = 0; i < 30; i++) {
        diversePlayers.push(new PlayerModel({
          firstName: `Player${i}`,
          lastName: `Last${i}`,
          handedness: handedness[i % 2],
          timePreference: timePrefs[i % 3],
          seasonId: 'test-season'
        }));
      }
      
      const optimizedPlayers = ciOptimizer.optimizeTestData(diversePlayers);
      
      // Property: Should maintain handedness and time preference diversity
      const handednessTypes = new Set(optimizedPlayers.map(p => p.handedness));
      const timePreferenceTypes = new Set(optimizedPlayers.map(p => p.timePreference));
      
      expect(handednessTypes.size).toBeGreaterThan(1);
      expect(timePreferenceTypes.size).toBeGreaterThan(1);
      expect(optimizedPlayers.length).toBeLessThanOrEqual(12);
    });
  });

  describe('Property 10: Compact Data Formats', () => {
    /**
     * Feature: ci-storage-optimization, Property 10: Compact Data Formats
     * **Validates: Requirements 3.3**
     */
    it('should create compact pairing history that uses less storage', () => {
      process.env.CI = 'true';
      process.env.GITHUB_ACTIONS = 'true';
      
      const ciOptimizer = TestStorageOptimizer.getInstance();
      
      // Create a pairing history with many pairings
      const pairingHistory = new PairingHistoryModel({
        seasonId: 'test-season-with-very-long-id-that-takes-space'
      });
      
      // Add many pairings
      for (let i = 0; i < 50; i++) {
        for (let j = i + 1; j < 50; j++) {
          pairingHistory.addPairing(`player-${i}-with-long-id`, `player-${j}-with-long-id`);
        }
      }
      
      const originalSize = JSON.stringify(pairingHistory.toJSON()).length;
      const compactHistory = ciOptimizer.createCompactPairingHistory(pairingHistory.toJSON());
      const compactSize = JSON.stringify(compactHistory).length;
      
      // Property: Compact format should use less storage
      expect(compactSize).toBeLessThan(originalSize);
      
      // Should be significantly smaller (at least 20% reduction)
      const reductionRatio = (originalSize - compactSize) / originalSize;
      expect(reductionRatio).toBeGreaterThan(0.2);
    });

    it('should preserve data integrity in compact format round trip', () => {
      process.env.CI = 'true';
      process.env.GITHUB_ACTIONS = 'true';
      
      const ciOptimizer = TestStorageOptimizer.getInstance();
      
      // Create original pairing history with simple IDs for testing
      const originalHistory = new PairingHistoryModel({
        seasonId: 'test-season'
      });
      
      originalHistory.addPairing('player1', 'player2');
      originalHistory.addPairing('player1', 'player3');
      originalHistory.addPairing('player2', 'player3');
      
      const originalData = originalHistory.toJSON();
      
      // Convert to compact and back
      const compactHistory = ciOptimizer.createCompactPairingHistory(originalData);
      const restoredHistory = ciOptimizer.restoreFromCompactPairingHistory(compactHistory);
      
      // Property: Round trip should preserve essential data
      expect(restoredHistory.seasonId).toBe(originalData.seasonId);
      expect(Object.keys(restoredHistory.pairings)).toHaveLength(Object.keys(originalData.pairings).length);
      
      // Check that pairing counts are preserved (allowing for key format differences)
      const originalPairCount = Object.keys(originalData.pairings).length;
      const restoredPairCount = Object.keys(restoredHistory.pairings).length;
      expect(restoredPairCount).toBe(originalPairCount);
      
      // Check that total pairing count is preserved
      const originalTotalCount = Object.values(originalData.pairings).reduce((sum, count) => sum + count, 0);
      const restoredTotalCount = Object.values(restoredHistory.pairings).reduce((sum, count) => sum + count, 0);
      expect(restoredTotalCount).toBe(originalTotalCount);
    });
  });

  describe('Property 11: Iteration Count Reduction', () => {
    /**
     * Feature: ci-storage-optimization, Property 11: Iteration Count Reduction
     * **Validates: Requirements 3.4**
     */
    it('should reduce iteration count in CI environment', () => {
      // Clear all CI-related environment variables first
      const ciEnvVars = ['CI', 'GITHUB_ACTIONS', 'CI_STORAGE_OPTIMIZATION', 'CONTINUOUS_INTEGRATION', 'NODE_ENV'];
      const originalValues: Record<string, string | undefined> = {};
      ciEnvVars.forEach(key => {
        originalValues[key] = process.env[key];
        delete process.env[key];
      });
      
      try {
        // Test local environment
        process.env.CI = 'false';
        process.env.GITHUB_ACTIONS = 'false';
        process.env.NODE_ENV = 'development';
        
        // Reset singletons to ensure clean state
        EnvironmentDetector.resetInstance();
        TestStorageOptimizer.resetInstance();
        
        const localOptimizer = TestStorageOptimizer.getInstance();
        const localIterations = localOptimizer.getOptimizedIterationCount(100);
        
        // Reset and test CI environment
        TestStorageOptimizer.resetInstance();
        EnvironmentDetector.resetInstance();
        
        process.env.CI = 'true';
        process.env.GITHUB_ACTIONS = 'true';
        process.env.NODE_ENV = 'test';
        
        const ciOptimizer = TestStorageOptimizer.getInstance();
        const ciIterations = ciOptimizer.getOptimizedIterationCount(100);
        
        // Property: CI iterations should be significantly less than local
        expect(ciIterations).toBeLessThan(localIterations);
        expect(ciIterations).toBeLessThanOrEqual(25); // 25% of original
        expect(ciIterations).toBeGreaterThanOrEqual(25); // But at least 25
        
        // Additional verification: local should return full count
        expect(localIterations).toBe(100); // Should not reduce in local environment
        
      } finally {
        // Restore original environment variables
        ciEnvVars.forEach(key => {
          if (originalValues[key] !== undefined) {
            process.env[key] = originalValues[key];
          } else {
            delete process.env[key];
          }
        });
      }
    });

    it('should maintain minimum iteration count for test reliability', () => {
      process.env.CI = 'true';
      process.env.GITHUB_ACTIONS = 'true';
      
      const ciOptimizer = TestStorageOptimizer.getInstance();
      
      // Test with very small base counts
      const smallBaseIterations = ciOptimizer.getOptimizedIterationCount(10);
      const mediumBaseIterations = ciOptimizer.getOptimizedIterationCount(50);
      const largeBaseIterations = ciOptimizer.getOptimizedIterationCount(200);
      
      // Property: Should maintain minimum of 25 iterations for reliability
      expect(smallBaseIterations).toBeGreaterThanOrEqual(25);
      expect(mediumBaseIterations).toBeGreaterThanOrEqual(25);
      expect(largeBaseIterations).toBeGreaterThanOrEqual(25);
      
      // But should still scale with base count for larger values
      expect(largeBaseIterations).toBeGreaterThan(smallBaseIterations);
    });
  });

  describe('Property 12: Automatic Data Management', () => {
    /**
     * Feature: ci-storage-optimization, Property 12: Automatic Data Management
     * **Validates: Requirements 3.5**
     */
    it('should automatically compress oversized data', () => {
      process.env.CI = 'true';
      process.env.GITHUB_ACTIONS = 'true';
      
      const ciOptimizer = TestStorageOptimizer.getInstance();
      
      // Create large data that exceeds threshold
      const largeData = 'x'.repeat(2000); // 2KB of data
      const threshold = 1024; // 1KB threshold
      
      const processedData = ciOptimizer.autoCompressIfOversized(largeData, threshold);
      
      // Property: Processed data should be smaller than original when oversized
      expect(processedData.length).toBeLessThan(largeData.length);
    });

    it('should not modify data that is within size limits', () => {
      process.env.CI = 'true';
      process.env.GITHUB_ACTIONS = 'true';
      
      const ciOptimizer = TestStorageOptimizer.getInstance();
      
      // Create small data within threshold
      const smallData = 'small data content';
      const threshold = 1024; // 1KB threshold
      
      const processedData = ciOptimizer.autoCompressIfOversized(smallData, threshold);
      
      // Property: Small data should remain unchanged
      expect(processedData).toBe(smallData);
    });

    it('should handle edge cases in data size management', () => {
      process.env.CI = 'true';
      process.env.GITHUB_ACTIONS = 'true';
      
      const ciOptimizer = TestStorageOptimizer.getInstance();
      
      // Test edge cases
      const emptyData = '';
      const exactThresholdData = 'x'.repeat(1024);
      const slightlyOverThresholdData = 'x'.repeat(1025);
      
      const threshold = 1024;
      
      // Property: Should handle edge cases gracefully
      expect(ciOptimizer.autoCompressIfOversized(emptyData, threshold)).toBe(emptyData);
      expect(ciOptimizer.autoCompressIfOversized(exactThresholdData, threshold)).toBe(exactThresholdData);
      
      const processedOverThreshold = ciOptimizer.autoCompressIfOversized(slightlyOverThresholdData, threshold);
      expect(processedOverThreshold.length).toBeLessThanOrEqual(slightlyOverThresholdData.length);
    });
  });

  describe('Test Execution Configuration', () => {
    it('should provide different configurations for local vs CI environments', () => {
      // Clear all CI-related environment variables first
      const ciEnvVars = ['CI', 'GITHUB_ACTIONS', 'CI_STORAGE_OPTIMIZATION', 'CONTINUOUS_INTEGRATION', 'NODE_ENV'];
      const originalValues: Record<string, string | undefined> = {};
      ciEnvVars.forEach(key => {
        originalValues[key] = process.env[key];
        delete process.env[key];
      });
      
      try {
        // Test local environment
        process.env.CI = 'false';
        process.env.GITHUB_ACTIONS = 'false';
        process.env.NODE_ENV = 'development';
        
        // Reset singletons to ensure clean state
        EnvironmentDetector.resetInstance();
        TestStorageOptimizer.resetInstance();
        
        const localOptimizer = TestStorageOptimizer.getInstance();
        const localConfig = localOptimizer.getTestExecutionConfig();
        
        // Reset and test CI environment
        TestStorageOptimizer.resetInstance();
        EnvironmentDetector.resetInstance();
        
        process.env.CI = 'true';
        process.env.GITHUB_ACTIONS = 'true';
        process.env.NODE_ENV = 'test';
        
        const ciOptimizer = TestStorageOptimizer.getInstance();
        const ciConfig = ciOptimizer.getTestExecutionConfig();
        
        // CI should have more restrictive limits
        expect(ciConfig.maxIterations).toBeLessThan(localConfig.maxIterations);
        expect(ciConfig.maxDatasetSize).toBeLessThan(localConfig.maxDatasetSize);
        expect(ciConfig.maxPlayerCount).toBeLessThan(localConfig.maxPlayerCount);
        expect(ciConfig.enableCompression).toBe(true);
        expect(ciConfig.enableDataMinimization).toBe(true);
        
        // Local should have more permissive settings
        expect(localConfig.enableCompression).toBe(false);
        expect(localConfig.enableDataMinimization).toBe(false);
        
      } finally {
        // Restore original environment variables
        ciEnvVars.forEach(key => {
          if (originalValues[key] !== undefined) {
            process.env[key] = originalValues[key];
          } else {
            delete process.env[key];
          }
        });
      }
    });
  });
});