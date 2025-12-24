/**
 * Verbosity override system for test output optimization
 */

export interface VerbosityConfig {
  verbose: boolean;
  quiet: boolean;
  debug: boolean;
}

export class VerbosityOverrideManager {
  /**
   * Parse command line arguments and environment variables to determine verbosity settings
   */
  static getVerbosityConfig(): VerbosityConfig {
    const verbose = this.isVerboseMode();
    const quiet = this.isQuietMode();
    const debug = this.isDebugMode();
    
    return {
      verbose,
      quiet,
      debug
    };
  }

  /**
   * Check if verbose mode is enabled via environment variables or command line
   */
  static isVerboseMode(): boolean {
    return (
      process.env.VERBOSE_TESTS === 'true' ||
      process.env.VERBOSE === 'true' ||
      process.argv.includes('--verbose') ||
      process.argv.includes('-v')
    );
  }

  /**
   * Check if quiet mode is enabled via environment variables or command line
   */
  static isQuietMode(): boolean {
    return (
      process.env.QUIET_TESTS === 'true' ||
      process.argv.includes('--quiet') ||
      process.argv.includes('-q')
    );
  }

  /**
   * Check if debug mode is enabled
   */
  static isDebugMode(): boolean {
    return (
      process.env.DEBUG_TESTS === 'true' ||
      process.env.NODE_ENV === 'debug' ||
      process.argv.includes('--debug')
    );
  }

  /**
   * Override verbosity settings programmatically
   * Useful for testing and dynamic configuration
   */
  static overrideVerbosity(config: Partial<VerbosityConfig>): void {
    if (config.verbose !== undefined) {
      process.env.VERBOSE_TESTS = config.verbose ? 'true' : 'false';
    }
    
    if (config.quiet !== undefined) {
      process.env.QUIET_TESTS = config.quiet ? 'true' : 'false';
    }
    
    if (config.debug !== undefined) {
      process.env.DEBUG_TESTS = config.debug ? 'true' : 'false';
    }
  }

  /**
   * Reset verbosity settings to defaults
   */
  static resetVerbosity(): void {
    delete process.env.VERBOSE_TESTS;
    delete process.env.QUIET_TESTS;
    delete process.env.DEBUG_TESTS;
  }

  /**
   * Get appropriate Jest reporter configuration based on verbosity
   */
  static getJestReporterConfig(): string | [string, any] {
    const config = this.getVerbosityConfig();
    
    if (config.verbose || config.debug) {
      return 'default';
    }
    
    if (config.quiet) {
      return ['summary', { summaryThreshold: 0 }];
    }
    
    return 'default';
  }

  /**
   * Get appropriate Playwright reporter configuration based on verbosity
   */
  static getPlaywrightReporterConfig(): string | Array<string | [string, any]> {
    const config = this.getVerbosityConfig();
    
    if (config.verbose || config.debug) {
      return ['list', 'html'];
    }
    
    if (config.quiet) {
      return 'dot';
    }
    
    return ['line', ['html', { open: 'never' }]];
  }

  /**
   * Determine if console output should be suppressed
   */
  static shouldSuppressConsole(): boolean {
    const config = this.getVerbosityConfig();
    return !config.verbose && !config.debug && config.quiet;
  }
}