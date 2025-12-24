import fc from 'fast-check';
import { CIConfigurationManager } from './CIConfigurationManager';
import { LightweightTestFixtures } from './LightweightTestFixtures';
import { StorageIsolationManager, IsolatedLocalStorage } from './StorageIsolationManager';
import { OptimizedTestSetup } from './OptimizedTestSetup';
import { StorageManager } from './StorageManager';

describe('CI Optimizations Property Tests', () => {
  let ciConfigManager: CIConfigurationManager;
  let fixtures: LightweightTestFixtures;
  let isolationManager: StorageIsolationManager;
  let optimizedSetup: OptimizedTestSetup;
  let storageManager: StorageManager;

  beforeEach(async () => {
    ciConfigManager = CIConfigurationManager.getInstance();
    fixtures = LightweightTestFixtures.getInstance();
    isolationManager = StorageIsolationManager.getInstance();
    optimizedSetup = OptimizedTestSetup.getInstance();
    storageManager = StorageManager.getInstance();

    // Reset state
    ciConfigManager.resetToDefaults();
    isolationManager.reset();
    await optimizedSetup.reset();
  });

  afterEach(async () => {
    await optimizedSetup.cleanupTestData();
    isolationManager.reset();
  });

  describe('Property 15: CI-Specific Configuration Loading', () => {
    it('should load CI-specific configuration in CI environments', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('ci', 'github-actions', 'local'),
          (environmentType) => {
            // Feature: ci-storage-optimization, Property 15: CI-Specific Configuration Loading
            
            // Mock environment
            const originalEnv = process.env.CI;
            const originalGithubActions = process.env.GITHUB_ACTIONS;
            
            try {
              if (environmentType === 'ci') {
                process.env.CI = 'true';
                delete process.env.GITHUB_ACTIONS;
              } else if (environmentType === 'github-actions') {
                process.env.GITHUB_ACTIONS = 'true';
                process.env.CI = 'true';
              } else {
                delete process.env.CI;
                delete process.env.GITHUB_ACTIONS;
              }

              // Reset and reload configuration
              ciConfigManager.resetToDefaults();
              
              // Also reset the environment detector cache
              const environmentDetector = require('./EnvironmentDetector').EnvironmentDetector.getInstance();
              environmentDetector.resetCache();
              
              const config = ciConfigManager.loadConfiguration();

              // Property: For any environment type, the configuration should match the environment
              expect(config.environment).toBe(environmentType);

              // Property: CI environments should have optimization enabled
              if (environmentType !== 'local') {
                expect(config.storageOptimization.enabled).toBe(true);
                expect(config.testOptimization.reducedIterations).toBe(true);
                expect(config.fallbackConfiguration.enabled).toBe(true);
              } else {
                expect(config.storageOptimization.enabled).toBe(false);
                expect(config.testOptimization.reducedIterations).toBe(false);
                expect(config.fallbackConfiguration.enabled).toBe(false);
              }

              return true;
            } finally {
              // Restore environment
              if (originalEnv !== undefined) {
                process.env.CI = originalEnv;
              } else {
                delete process.env.CI;
              }
              
              if (originalGithubActions !== undefined) {
                process.env.GITHUB_ACTIONS = originalGithubActions;
              } else {
                delete process.env.GITHUB_ACTIONS;
              }
            }
          }
        ),
        { numRuns: 25 }
      );
    });
  });

  describe('Property 16: Non-Essential Operation Filtering', () => {
    it('should filter non-essential operations in CI environments', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            'debug-logging-storage',
            'performance-metrics-storage',
            'temporary-cache-storage',
            'ui-state-storage',
            'user-preferences-storage',
            'analytics-storage',
            'diagnostic-storage'
          ),
          fc.constantFrom('ci', 'github-actions', 'local'),
          (operationType, environmentType) => {
            // Feature: ci-storage-optimization, Property 16: Non-Essential Operation Filtering
            
            // Mock environment
            const originalEnv = process.env.CI;
            const originalGithubActions = process.env.GITHUB_ACTIONS;
            
            try {
              if (environmentType === 'ci') {
                process.env.CI = 'true';
                delete process.env.GITHUB_ACTIONS;
              } else if (environmentType === 'github-actions') {
                process.env.GITHUB_ACTIONS = 'true';
                process.env.CI = 'true';
              } else {
                delete process.env.CI;
                delete process.env.GITHUB_ACTIONS;
              }

              // Reset and reload configuration
              ciConfigManager.resetToDefaults();
              
              // Also reset the environment detector cache
              const environmentDetector = require('./EnvironmentDetector').EnvironmentDetector.getInstance();
              environmentDetector.resetCache();
              
              ciConfigManager.loadConfiguration();

              const isEssential = ciConfigManager.isEssentialOperation(operationType);
              const shouldFilter = ciConfigManager.shouldFilterNonEssentialOperations();

              // Property: For any non-essential operation in CI, it should be filtered
              if (environmentType !== 'local') {
                expect(shouldFilter).toBe(true);
                expect(isEssential).toBe(false);
              } else {
                expect(shouldFilter).toBe(false);
                expect(isEssential).toBe(true); // All operations allowed in local
              }

              return true;
            } finally {
              // Restore environment
              if (originalEnv !== undefined) {
                process.env.CI = originalEnv;
              } else {
                delete process.env.CI;
              }
              
              if (originalGithubActions !== undefined) {
                process.env.GITHUB_ACTIONS = originalGithubActions;
              } else {
                delete process.env.GITHUB_ACTIONS;
              }
            }
          }
        ),
        { numRuns: 25 }
      );
    });
  });

  describe('Property 17: Lightweight Test Fixtures', () => {
    it('should create lightweight fixtures in CI environments', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('unit', 'integration', 'e2e'),
          fc.constantFrom('ci', 'github-actions', 'local'),
          fc.integer({ min: 1, max: 50 }),
          (scenarioType, environmentType, requestedPlayerCount) => {
            // Feature: ci-storage-optimization, Property 17: Lightweight Test Fixtures
            
            // Mock environment
            const originalEnv = process.env.CI;
            const originalGithubActions = process.env.GITHUB_ACTIONS;
            
            try {
              if (environmentType === 'ci') {
                process.env.CI = 'true';
                delete process.env.GITHUB_ACTIONS;
              } else if (environmentType === 'github-actions') {
                process.env.GITHUB_ACTIONS = 'true';
                process.env.CI = 'true';
              } else {
                delete process.env.CI;
                delete process.env.GITHUB_ACTIONS;
              }

              // Reset and reload configuration
              ciConfigManager.resetToDefaults();
              ciConfigManager.loadConfiguration();

              const testFixtures = fixtures.createTestScenarioFixtures(scenarioType as 'unit' | 'integration' | 'e2e');
              const minimalPlayers = fixtures.createMinimalPlayers(requestedPlayerCount);

              // Property: For any test scenario in CI, fixtures should be smaller than in local
              if (environmentType !== 'local') {
                // CI environments should have limited fixture sizes
                expect(testFixtures.players.length).toBeLessThanOrEqual(12);
                expect(testFixtures.weeks.length).toBeLessThanOrEqual(3);
                expect(minimalPlayers.length).toBeLessThanOrEqual(Math.min(requestedPlayerCount, 12));
              }

              // Property: Fixtures should be appropriate for scenario type
              const expectedMaxPlayers = scenarioType === 'unit' ? 4 : scenarioType === 'integration' ? 8 : 12;
              const expectedMaxWeeks = scenarioType === 'unit' ? 1 : scenarioType === 'integration' ? 2 : 3;

              expect(testFixtures.players.length).toBeLessThanOrEqual(expectedMaxPlayers);
              expect(testFixtures.weeks.length).toBeLessThanOrEqual(expectedMaxWeeks);

              // Property: All fixtures should be valid
              expect(testFixtures.season).toBeDefined();
              expect(testFixtures.season.id).toBeTruthy();
              expect(testFixtures.players.every(p => p.id && p.firstName && p.lastName)).toBe(true);
              expect(testFixtures.weeks.every(w => w.id && w.seasonId && w.weekNumber > 0)).toBe(true);

              return true;
            } finally {
              // Restore environment
              if (originalEnv !== undefined) {
                process.env.CI = originalEnv;
              } else {
                delete process.env.CI;
              }
              
              if (originalGithubActions !== undefined) {
                process.env.GITHUB_ACTIONS = originalGithubActions;
              } else {
                delete process.env.GITHUB_ACTIONS;
              }
            }
          }
        ),
        { numRuns: 25 }
      );
    });
  });

  describe('Property 18: Storage Isolation in Parallel Tests', () => {
    it('should provide isolated storage for parallel test processes', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 10 }),
          fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 1, maxLength: 10 }),
          async (keys, values) => {
            // Feature: ci-storage-optimization, Property 18: Storage Isolation in Parallel Tests
            
            // Enable isolation
            isolationManager.enableIsolation();
            
            try {
              const testKey = keys[0] || 'test-key';
              const namespace = isolationManager.getProcessNamespace();

              // Property: Isolated keys should include namespace
              const isolatedKey = isolationManager.createIsolatedKey(testKey);
              expect(isolatedKey).toContain(':');
              expect(isolatedKey).toContain(namespace);

              // Property: Original key should be extractable from isolated key
              const extractedKey = isolationManager.extractOriginalKey(isolatedKey);
              expect(extractedKey).toBe(testKey);

              // Property: Non-isolated keys should pass through unchanged when isolation disabled
              isolationManager.disableIsolation();
              const nonIsolatedKey = isolationManager.createIsolatedKey(testKey);
              expect(nonIsolatedKey).toBe(testKey);

              // Property: Extraction of non-isolated keys should return original
              const extractedNonIsolated = isolationManager.extractOriginalKey(testKey);
              expect(extractedNonIsolated).toBe(testKey);

              return true;
            } finally {
              isolationManager.disableIsolation();
            }
          }
        ),
        { numRuns: 25 }
      );
    });

    it('should maintain storage isolation across operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            key: fc.string({ minLength: 1, maxLength: 20 }),
            value: fc.string({ minLength: 1, maxLength: 100 })
          }),
          async (testData) => {
            // Feature: ci-storage-optimization, Property 18: Storage Isolation in Parallel Tests
            
            // Enable isolation
            isolationManager.enableIsolation();
            storageManager.enableStorageIsolation();
            
            try {
              // Store data using storage manager
              await storageManager.setItem(testData.key, testData.value, 'test-data-storage');
              
              // Retrieve data
              const retrievedValue = await storageManager.getItem(testData.key);
              
              // Property: Data should be retrievable within same isolation context
              expect(retrievedValue).toBe(testData.value);
              
              // Property: Isolation config should be available
              const isolationConfig = storageManager.getIsolationConfig();
              expect(isolationConfig.processNamespace).toBeTruthy();
              expect(isolationConfig.isolationEnabled).toBe(true);
              expect(isolationConfig.processId).toBeDefined();
              
              return true;
            } finally {
              await storageManager.cleanupIsolation();
              storageManager.disableStorageIsolation();
              isolationManager.disableIsolation();
            }
          }
        ),
        { numRuns: 25 }
      );
    });
  });
});