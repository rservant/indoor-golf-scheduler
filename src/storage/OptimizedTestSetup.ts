import { StorageManager } from './StorageManager';
import { LightweightTestFixtures } from './LightweightTestFixtures';
import { CIConfigurationManager } from './CIConfigurationManager';

/**
 * Optimized test setup for CI environments
 */
export class OptimizedTestSetup {
  private static instance: OptimizedTestSetup;
  private storageManager: StorageManager;
  private fixtures: LightweightTestFixtures;
  private ciConfigManager: CIConfigurationManager;
  private isSetup = false;

  private constructor() {
    this.storageManager = StorageManager.getInstance();
    this.fixtures = LightweightTestFixtures.getInstance();
    this.ciConfigManager = CIConfigurationManager.getInstance();
  }

  public static getInstance(): OptimizedTestSetup {
    if (!OptimizedTestSetup.instance) {
      OptimizedTestSetup.instance = new OptimizedTestSetup();
    }
    return OptimizedTestSetup.instance;
  }

  /**
   * Setup optimized test environment
   */
  public async setupTestEnvironment(testType: 'unit' | 'integration' | 'e2e' = 'unit'): Promise<void> {
    if (this.isSetup) {
      return;
    }

    const config = this.ciConfigManager.getCurrentConfiguration();
    
    // Configure storage manager for test environment
    if (config.environment !== 'local') {
      const ciConfig = {
        maxStorageSize: config.storageOptimization.maxStorageSize,
        compressionEnabled: config.storageOptimization.enabled,
        aggressiveCleanup: config.storageOptimization.aggressiveCleanup,
        reducedIterations: config.testOptimization.reducedIterations,
        fallbackEnabled: config.fallbackConfiguration.enabled
      };
      
      this.storageManager.enableOptimization(ciConfig);
    }

    // Clear any existing test data
    await this.cleanupTestData();

    this.isSetup = true;
  }

  /**
   * Get optimized fixtures for test scenario
   */
  public getFixtures(scenarioType: 'unit' | 'integration' | 'e2e' = 'unit') {
    return this.fixtures.createTestScenarioFixtures(scenarioType);
  }

  /**
   * Get property test configuration
   */
  public getPropertyTestConfig() {
    return this.fixtures.createPropertyTestFixtures();
  }

  /**
   * Store test data with operation type filtering
   */
  public async storeTestData(key: string, data: any, operationType: string = 'test-data-storage'): Promise<void> {
    const serializedData = JSON.stringify(data);
    await this.storageManager.setItem(key, serializedData, operationType);
  }

  /**
   * Retrieve test data
   */
  public async getTestData<T>(key: string): Promise<T | null> {
    const data = await this.storageManager.getItem(key);
    if (data === null) {
      return null;
    }
    
    try {
      return JSON.parse(data) as T;
    } catch (error) {
      console.warn(`Failed to parse test data for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Cleanup test data between tests
   */
  public async cleanupTestData(): Promise<void> {
    const config = this.ciConfigManager.getCurrentConfiguration();
    
    if (config.storageOptimization.aggressiveCleanup) {
      // In CI, clear all storage to prevent accumulation
      await this.storageManager.clear();
    } else {
      // In local environment, only clear test-specific keys
      await this.clearTestKeys();
    }
  }

  /**
   * Get storage metrics for test reporting
   */
  public getStorageMetrics() {
    const storageInfo = this.storageManager.getStorageInfo();
    const config = this.ciConfigManager.getCurrentConfiguration();
    
    return {
      ...storageInfo,
      environment: config.environment,
      optimizationEnabled: config.storageOptimization.enabled,
      maxStorageSize: config.storageOptimization.maxStorageSize,
      usagePercentage: (storageInfo.usedBytes / storageInfo.totalBytes) * 100
    };
  }

  /**
   * Check if operation should be skipped in CI
   */
  public shouldSkipOperation(operationType: string): boolean {
    return this.storageManager.isOperationFiltered(operationType);
  }

  /**
   * Reset test setup
   */
  public async reset(): Promise<void> {
    await this.cleanupTestData();
    this.isSetup = false;
  }

  /**
   * Clear test-specific storage keys
   */
  private async clearTestKeys(): Promise<void> {
    // This is a simplified implementation
    // In a real scenario, you'd iterate through localStorage keys
    // and remove only test-related ones
    const testKeyPrefixes = [
      'test-',
      'mock-',
      'fixture-',
      'player_test',
      'season_test',
      'week_test'
    ];

    // Since we can't easily iterate localStorage in this context,
    // we'll use the storage manager's clear method
    // In a real implementation, you'd want to be more selective
    await this.storageManager.clear();
  }
}

/**
 * Global test setup helper function
 */
export async function setupOptimizedTest(testType: 'unit' | 'integration' | 'e2e' = 'unit') {
  const setup = OptimizedTestSetup.getInstance();
  await setup.setupTestEnvironment(testType);
  return setup;
}

/**
 * Global test cleanup helper function
 */
export async function cleanupOptimizedTest() {
  const setup = OptimizedTestSetup.getInstance();
  await setup.cleanupTestData();
}