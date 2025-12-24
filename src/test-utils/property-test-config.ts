/**
 * Property-based test configuration utilities for CI optimization
 */

import { Parameters } from 'fast-check';

/**
 * Get optimized parameters for property-based tests based on environment
 */
export function getPropertyTestParams(): Parameters<unknown> {
  const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
  
  // Get iteration count from Jest globals or use defaults
  const iterations = (global as any).PBT_ITERATIONS || (isCI ? 25 : 100);
  const timeout = (global as any).PBT_TIMEOUT || (isCI ? 5000 : 10000);
  
  const params: Parameters<unknown> = {
    numRuns: iterations,
    timeout: timeout,
    // Reduce shrinking attempts in CI for faster execution
    maxSkipsPerRun: isCI ? 100 : 1000,
    // Reduce example generation complexity in CI
    endOnFailure: isCI, // Stop on first failure in CI
    verbose: !isCI // Reduce verbosity in CI
  };

  // Add optional properties conditionally
  if (isCI) {
    params.seed = 42; // Use fixed seed in CI for reproducibility
  }

  return params;
}

/**
 * Get test scenario specific configuration
 */
export function getTestScenarioConfig(scenarioType: 'unit' | 'integration' | 'e2e'): Parameters<unknown> {
  const baseParams = getPropertyTestParams();
  const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
  
  switch (scenarioType) {
    case 'unit':
      return {
        ...baseParams,
        numRuns: isCI ? 15 : 50, // Fewer runs for unit tests
        timeout: isCI ? 2000 : 5000
      };
      
    case 'integration':
      return {
        ...baseParams,
        numRuns: isCI ? 10 : 25, // Even fewer for integration tests
        timeout: isCI ? 8000 : 15000
      };
      
    case 'e2e':
      return {
        ...baseParams,
        numRuns: isCI ? 5 : 10, // Minimal for e2e tests
        timeout: isCI ? 15000 : 30000
      };
      
    default:
      return baseParams;
  }
}

/**
 * Check if running in CI environment
 */
export function isCIEnvironment(): boolean {
  return process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
}

/**
 * Get environment-specific storage limits for test data generation
 */
export function getStorageLimits() {
  const isCI = isCIEnvironment();
  const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
  
  return {
    maxStorageSize: isGitHubActions ? 2 * 1024 * 1024 : (isCI ? 3 * 1024 * 1024 : 5 * 1024 * 1024),
    maxPlayerCount: isCI ? 10 : 50,
    maxDatasetSize: isCI ? 100 : 1000,
    compressionEnabled: isCI
  };
}