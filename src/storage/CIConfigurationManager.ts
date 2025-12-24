import { 
  CIConfiguration, 
  CIConfigurationModel, 
  StorageType 
} from './interfaces';
import { EnvironmentDetector } from './EnvironmentDetector';

/**
 * Manages CI-specific configuration loading and operation filtering
 */
export class CIConfigurationManager {
  private static instance: CIConfigurationManager;
  private environmentDetector: EnvironmentDetector;
  private currentConfiguration: CIConfigurationModel | null = null;
  private nonEssentialOperationsDisabled = false;

  private constructor() {
    this.environmentDetector = EnvironmentDetector.getInstance();
    this.loadConfiguration();
  }

  public static getInstance(): CIConfigurationManager {
    if (!CIConfigurationManager.instance) {
      CIConfigurationManager.instance = new CIConfigurationManager();
    }
    return CIConfigurationManager.instance;
  }

  /**
   * Load CI-specific configuration based on environment
   */
  public loadConfiguration(): CIConfigurationModel {
    const environmentType = this.environmentDetector.getEnvironmentType();
    const baseCIConfig = this.environmentDetector.getCIConfiguration();

    // Create comprehensive configuration model
    this.currentConfiguration = this.createConfigurationModel(environmentType, baseCIConfig);
    
    // Enable non-essential operation filtering in CI
    this.nonEssentialOperationsDisabled = environmentType !== 'local';

    return this.currentConfiguration;
  }

  /**
   * Get current configuration
   */
  public getCurrentConfiguration(): CIConfigurationModel {
    if (!this.currentConfiguration) {
      return this.loadConfiguration();
    }
    return this.currentConfiguration;
  }

  /**
   * Check if non-essential operations should be filtered
   */
  public shouldFilterNonEssentialOperations(): boolean {
    return this.nonEssentialOperationsDisabled;
  }

  /**
   * Check if a specific operation is essential
   */
  public isEssentialOperation(operationType: string): boolean {
    if (!this.shouldFilterNonEssentialOperations()) {
      return true; // All operations allowed in local environment
    }

    const essentialOperations = [
      'test-data-storage',
      'test-result-storage', 
      'player-data-storage',
      'schedule-data-storage',
      'pairing-history-storage',
      'season-data-storage',
      'week-data-storage',
      'foursome-data-storage'
    ];

    const nonEssentialOperations = [
      'debug-logging-storage',
      'performance-metrics-storage',
      'temporary-cache-storage',
      'ui-state-storage',
      'user-preferences-storage',
      'analytics-storage',
      'diagnostic-storage'
    ];

    // If explicitly non-essential, filter it out
    if (nonEssentialOperations.includes(operationType)) {
      return false;
    }

    // If explicitly essential or unknown, allow it
    return true;
  }

  /**
   * Get optimized configuration for specific test scenarios
   */
  public getTestScenarioConfiguration(scenarioType: 'unit' | 'integration' | 'e2e'): Partial<CIConfigurationModel> {
    const baseConfig = this.getCurrentConfiguration();

    switch (scenarioType) {
      case 'unit':
        return {
          ...baseConfig,
          testOptimization: {
            ...baseConfig.testOptimization,
            maxIterationCount: Math.min(25, baseConfig.testOptimization.maxIterationCount),
            maxDatasetSize: Math.min(100, baseConfig.testOptimization.maxDatasetSize)
          }
        };

      case 'integration':
        return {
          ...baseConfig,
          testOptimization: {
            ...baseConfig.testOptimization,
            maxIterationCount: Math.min(50, baseConfig.testOptimization.maxIterationCount),
            maxDatasetSize: Math.min(500, baseConfig.testOptimization.maxDatasetSize)
          }
        };

      case 'e2e':
        return {
          ...baseConfig,
          testOptimization: {
            ...baseConfig.testOptimization,
            maxIterationCount: Math.min(10, baseConfig.testOptimization.maxIterationCount),
            maxDatasetSize: Math.min(50, baseConfig.testOptimization.maxDatasetSize)
          }
        };

      default:
        return baseConfig;
    }
  }

  /**
   * Override configuration for testing purposes
   */
  public overrideConfiguration(config: Partial<CIConfigurationModel>): void {
    if (this.currentConfiguration) {
      this.currentConfiguration = {
        ...this.currentConfiguration,
        ...config
      };
    }
  }

  /**
   * Reset configuration to environment defaults
   */
  public resetToDefaults(): void {
    this.currentConfiguration = null;
    this.loadConfiguration();
  }

  /**
   * Create comprehensive configuration model
   */
  private createConfigurationModel(
    environmentType: 'local' | 'ci' | 'github-actions',
    baseCIConfig: CIConfiguration
  ): CIConfigurationModel {
    const baseIterationCount = this.getBaseIterationCount(environmentType);
    const baseDatasetSize = this.getBaseDatasetSize(environmentType);

    return {
      environment: environmentType,
      storageOptimization: {
        enabled: baseCIConfig.compressionEnabled || baseCIConfig.aggressiveCleanup,
        maxStorageSize: baseCIConfig.maxStorageSize,
        compressionLevel: this.getCompressionLevel(environmentType),
        aggressiveCleanup: baseCIConfig.aggressiveCleanup
      },
      testOptimization: {
        reducedIterations: baseCIConfig.reducedIterations,
        maxIterationCount: baseIterationCount,
        minimalDatasets: environmentType !== 'local',
        maxDatasetSize: baseDatasetSize
      },
      fallbackConfiguration: {
        enabled: baseCIConfig.fallbackEnabled,
        fallbackChain: this.getFallbackChain(environmentType),
        gracefulDegradation: true
      }
    };
  }

  /**
   * Get base iteration count for environment
   */
  private getBaseIterationCount(environmentType: 'local' | 'ci' | 'github-actions'): number {
    switch (environmentType) {
      case 'github-actions':
        return 25; // Reduced for GitHub Actions
      case 'ci':
        return 50; // Moderate reduction for generic CI
      case 'local':
      default:
        return 100; // Full iterations for local development
    }
  }

  /**
   * Get base dataset size for environment
   */
  private getBaseDatasetSize(environmentType: 'local' | 'ci' | 'github-actions'): number {
    switch (environmentType) {
      case 'github-actions':
        return 100; // Small datasets for GitHub Actions
      case 'ci':
        return 500; // Medium datasets for generic CI
      case 'local':
      default:
        return 1000; // Full datasets for local development
    }
  }

  /**
   * Get compression level for environment
   */
  private getCompressionLevel(environmentType: 'local' | 'ci' | 'github-actions'): number {
    switch (environmentType) {
      case 'github-actions':
        return 9; // Maximum compression for GitHub Actions
      case 'ci':
        return 6; // Balanced compression for generic CI
      case 'local':
      default:
        return 1; // Minimal compression for local development
    }
  }

  /**
   * Get fallback chain for environment
   */
  private getFallbackChain(environmentType: 'local' | 'ci' | 'github-actions'): StorageType[] {
    switch (environmentType) {
      case 'github-actions':
      case 'ci':
        return ['localStorage', 'inMemory', 'mock']; // Full fallback chain for CI
      case 'local':
      default:
        return ['localStorage']; // Only localStorage for local development
    }
  }
}