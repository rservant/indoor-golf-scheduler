import { EnvironmentDetector as IEnvironmentDetector, CIConfiguration } from './interfaces';

/**
 * Detects CI environments and provides appropriate configuration
 */
export class EnvironmentDetector implements IEnvironmentDetector {
  private static instance: EnvironmentDetector;
  private cachedEnvironmentType: 'local' | 'ci' | 'github-actions' | null = null;

  public static getInstance(): EnvironmentDetector {
    if (!EnvironmentDetector.instance) {
      EnvironmentDetector.instance = new EnvironmentDetector();
    }
    return EnvironmentDetector.instance;
  }

  /**
   * Detects if running in any CI environment
   */
  public isCIEnvironment(): boolean {
    return this.getEnvironmentType() !== 'local';
  }

  /**
   * Detects if running specifically in GitHub Actions
   */
  public isGitHubActions(): boolean {
    return this.getEnvironmentType() === 'github-actions';
  }

  /**
   * Determines the specific environment type
   */
  public getEnvironmentType(): 'local' | 'ci' | 'github-actions' {
    if (this.cachedEnvironmentType) {
      return this.cachedEnvironmentType;
    }

    // Check for GitHub Actions first (most specific)
    if (process.env.GITHUB_ACTIONS === 'true') {
      this.cachedEnvironmentType = 'github-actions';
      return this.cachedEnvironmentType;
    }

    // Check for generic CI environment
    if (process.env.CI === 'true' || 
        process.env.CONTINUOUS_INTEGRATION === 'true' ||
        process.env.NODE_ENV === 'test' && (
          process.env.JENKINS_URL ||
          process.env.TRAVIS ||
          process.env.CIRCLECI ||
          process.env.GITLAB_CI ||
          process.env.BUILDKITE ||
          process.env.DRONE
        )) {
      this.cachedEnvironmentType = 'ci';
      return this.cachedEnvironmentType;
    }

    // Default to local environment
    this.cachedEnvironmentType = 'local';
    return this.cachedEnvironmentType;
  }

  /**
   * Gets CI-specific configuration based on detected environment
   */
  public getCIConfiguration(): CIConfiguration {
    const environmentType = this.getEnvironmentType();

    switch (environmentType) {
      case 'github-actions':
        return {
          maxStorageSize: 2 * 1024 * 1024, // 2MB for GitHub Actions
          compressionEnabled: true,
          aggressiveCleanup: true,
          reducedIterations: true,
          fallbackEnabled: true
        };

      case 'ci':
        return {
          maxStorageSize: 3 * 1024 * 1024, // 3MB for generic CI
          compressionEnabled: true,
          aggressiveCleanup: true,
          reducedIterations: true,
          fallbackEnabled: true
        };

      case 'local':
      default:
        return {
          maxStorageSize: 5 * 1024 * 1024, // 5MB for local development
          compressionEnabled: false,
          aggressiveCleanup: false,
          reducedIterations: false,
          fallbackEnabled: false
        };
    }
  }

  /**
   * Resets cached environment detection (useful for testing)
   */
  public resetCache(): void {
    this.cachedEnvironmentType = null;
  }

  /**
   * Resets the singleton instance (useful for testing)
   */
  public static resetInstance(): void {
    EnvironmentDetector.instance = undefined as any;
  }
}