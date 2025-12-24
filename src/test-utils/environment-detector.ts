/**
 * Environment detection utilities for test output optimization
 */

export type Environment = 'local' | 'ci' | 'debug';

export interface EnvironmentDetector {
  getCurrentEnvironment(): Environment;
  isVerboseMode(): boolean;
  isCIEnvironment(): boolean;
  isDebugMode(): boolean;
}

export class TestEnvironmentDetector implements EnvironmentDetector {
  /**
   * Determines the current execution environment
   */
  getCurrentEnvironment(): Environment {
    if (this.isDebugMode()) {
      return 'debug';
    }
    
    if (this.isCIEnvironment()) {
      return 'ci';
    }
    
    return 'local';
  }

  /**
   * Checks if verbose mode is enabled via environment variables or command line
   */
  isVerboseMode(): boolean {
    return (
      process.env.VERBOSE_TESTS === 'true' ||
      process.env.VERBOSE === 'true' ||
      process.argv.includes('--verbose') ||
      process.argv.includes('-v')
    );
  }

  /**
   * Detects if running in a CI environment
   */
  isCIEnvironment(): boolean {
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
   * Checks if debug mode is enabled
   */
  isDebugMode(): boolean {
    return (
      process.env.DEBUG_TESTS === 'true' ||
      process.env.NODE_ENV === 'debug' ||
      process.argv.includes('--debug')
    );
  }

  /**
   * Checks if quiet mode is requested
   */
  isQuietMode(): boolean {
    return (
      process.env.QUIET_TESTS === 'true' ||
      process.argv.includes('--quiet') ||
      process.argv.includes('-q')
    );
  }
}

// Singleton instance for easy access
export const environmentDetector = new TestEnvironmentDetector();