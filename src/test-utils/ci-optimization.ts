/**
 * CI-specific optimizations for test output
 */

export interface CIOptimizationConfig {
  isCI: boolean;
  platform: string;
  maxWorkers: number | string;
  timeout: number;
  retries: number;
}

export class CIOptimizationManager {
  /**
   * Detect CI environment and return optimization configuration
   */
  static getCIConfig(): CIOptimizationConfig {
    const isCI = this.isCIEnvironment();
    const platform = this.detectCIPlatform();
    
    return {
      isCI,
      platform,
      maxWorkers: isCI ? 2 : '50%',
      timeout: isCI ? 10000 : 30000,
      retries: isCI ? 2 : 0
    };
  }

  /**
   * Detect if running in a CI environment
   */
  static isCIEnvironment(): boolean {
    return (
      process.env.CI === 'true' ||
      process.env.GITHUB_ACTIONS === 'true' ||
      process.env.GITLAB_CI === 'true' ||
      process.env.JENKINS_URL !== undefined ||
      process.env.BUILDKITE === 'true' ||
      process.env.CIRCLECI === 'true'
    );
  }

  /**
   * Detect specific CI platform
   */
  static detectCIPlatform(): string {
    if (process.env.GITHUB_ACTIONS === 'true') return 'github-actions';
    if (process.env.GITLAB_CI === 'true') return 'gitlab-ci';
    if (process.env.JENKINS_URL !== undefined) return 'jenkins';
    if (process.env.BUILDKITE === 'true') return 'buildkite';
    if (process.env.CIRCLECI === 'true') return 'circleci';
    if (process.env.CI === 'true') return 'generic-ci';
    return 'local';
  }

  /**
   * Get optimized Jest configuration for CI
   */
  static getOptimizedJestConfig() {
    const config = this.getCIConfig();
    
    if (!config.isCI) {
      return {};
    }

    return {
      // Use minimal reporter for CI
      reporters: [['summary', { summaryThreshold: 0 }]],
      
      // Suppress console output
      silent: true,
      verbose: false,
      
      // Optimize for CI performance
      maxWorkers: config.maxWorkers,
      testTimeout: config.timeout,
      
      // Disable coverage collection for faster execution
      collectCoverage: false,
      
      // Bail on first failure for faster feedback
      bail: 1,
      
      // Reduce memory usage
      workerIdleMemoryLimit: '512MB'
    };
  }

  /**
   * Get optimized Playwright configuration for CI
   */
  static getOptimizedPlaywrightConfig() {
    const config = this.getCIConfig();
    
    if (!config.isCI) {
      return {};
    }

    return {
      // Use minimal reporter for CI
      reporter: 'dot',
      
      // Optimize for CI performance
      workers: 1,
      retries: config.retries,
      
      // Disable interactive elements
      forbidOnly: true,
      
      // Minimal artifact collection
      use: {
        trace: 'retain-on-failure',
        video: 'retain-on-failure',
        screenshot: 'only-on-failure'
      }
    };
  }

  /**
   * Check if output should be prioritized for failure information
   */
  static shouldPrioritizeFailureInfo(): boolean {
    const config = this.getCIConfig();
    return config.isCI;
  }

  /**
   * Get platform-specific optimizations
   */
  static getPlatformOptimizations(): Record<string, any> {
    const platform = this.detectCIPlatform();
    
    switch (platform) {
      case 'github-actions':
        return {
          // GitHub Actions has generous resource limits
          maxWorkers: 4,
          timeout: 15000
        };
        
      case 'gitlab-ci':
        return {
          // GitLab CI can be resource constrained
          maxWorkers: 2,
          timeout: 10000
        };
        
      case 'jenkins':
        return {
          // Jenkins varies by setup
          maxWorkers: 2,
          timeout: 12000
        };
        
      default:
        return {
          maxWorkers: 2,
          timeout: 10000
        };
    }
  }
}