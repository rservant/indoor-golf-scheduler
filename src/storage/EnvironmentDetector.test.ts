import * as fc from 'fast-check';
import { EnvironmentDetector } from './EnvironmentDetector';

describe('EnvironmentDetector', () => {
  let detector: EnvironmentDetector;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Get fresh instance and reset cache
    detector = EnvironmentDetector.getInstance();
    detector.resetCache();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    detector.resetCache();
  });

  /**
   * Property 1: CI Environment Detection and Optimization
   * **Feature: ci-storage-optimization, Property 1: CI Environment Detection and Optimization**
   * **Validates: Requirements 1.1**
   */
  describe('Property 1: CI Environment Detection and Optimization', () => {
    it('should detect CI environment and enable optimization when CI environment variables are present', () => {
      fc.assert(
        fc.property(
          fc.record({
            GITHUB_ACTIONS: fc.constantFrom('true', 'false', undefined),
            CI: fc.constantFrom('true', 'false', undefined),
            CONTINUOUS_INTEGRATION: fc.constantFrom('true', 'false', undefined),
            NODE_ENV: fc.constantFrom('test', 'development', 'production', undefined),
            JENKINS_URL: fc.constantFrom('http://jenkins.example.com', undefined),
            TRAVIS: fc.constantFrom('true', undefined),
            CIRCLECI: fc.constantFrom('true', undefined),
            GITLAB_CI: fc.constantFrom('true', undefined),
            BUILDKITE: fc.constantFrom('true', undefined),
            DRONE: fc.constantFrom('true', undefined)
          }),
          (envVars) => {
            // Set up environment variables
            Object.keys(envVars).forEach(key => {
              if (envVars[key as keyof typeof envVars] !== undefined) {
                process.env[key] = envVars[key as keyof typeof envVars];
              } else {
                delete process.env[key];
              }
            });

            // Reset detector cache to pick up new environment
            detector.resetCache();

            const environmentType = detector.getEnvironmentType();
            const isCIEnvironment = detector.isCIEnvironment();
            const isGitHubActions = detector.isGitHubActions();
            const ciConfig = detector.getCIConfiguration();

            // Determine expected environment type based on environment variables
            let expectedEnvironmentType: 'local' | 'ci' | 'github-actions';
            let expectedIsCIEnvironment: boolean;
            let expectedIsGitHubActions: boolean;

            if (envVars.GITHUB_ACTIONS === 'true') {
              expectedEnvironmentType = 'github-actions';
              expectedIsCIEnvironment = true;
              expectedIsGitHubActions = true;
            } else if (
              envVars.CI === 'true' ||
              envVars.CONTINUOUS_INTEGRATION === 'true' ||
              (envVars.NODE_ENV === 'test' && (
                envVars.JENKINS_URL ||
                envVars.TRAVIS ||
                envVars.CIRCLECI ||
                envVars.GITLAB_CI ||
                envVars.BUILDKITE ||
                envVars.DRONE
              ))
            ) {
              expectedEnvironmentType = 'ci';
              expectedIsCIEnvironment = true;
              expectedIsGitHubActions = false;
            } else {
              expectedEnvironmentType = 'local';
              expectedIsCIEnvironment = false;
              expectedIsGitHubActions = false;
            }

            // Verify environment detection
            expect(environmentType).toBe(expectedEnvironmentType);
            expect(isCIEnvironment).toBe(expectedIsCIEnvironment);
            expect(isGitHubActions).toBe(expectedIsGitHubActions);

            // Verify CI configuration is appropriate for detected environment
            if (expectedEnvironmentType === 'github-actions') {
              expect(ciConfig.maxStorageSize).toBe(2 * 1024 * 1024); // 2MB
              expect(ciConfig.compressionEnabled).toBe(true);
              expect(ciConfig.aggressiveCleanup).toBe(true);
              expect(ciConfig.reducedIterations).toBe(true);
              expect(ciConfig.fallbackEnabled).toBe(true);
            } else if (expectedEnvironmentType === 'ci') {
              expect(ciConfig.maxStorageSize).toBe(3 * 1024 * 1024); // 3MB
              expect(ciConfig.compressionEnabled).toBe(true);
              expect(ciConfig.aggressiveCleanup).toBe(true);
              expect(ciConfig.reducedIterations).toBe(true);
              expect(ciConfig.fallbackEnabled).toBe(true);
            } else {
              expect(ciConfig.maxStorageSize).toBe(5 * 1024 * 1024); // 5MB
              expect(ciConfig.compressionEnabled).toBe(false);
              expect(ciConfig.aggressiveCleanup).toBe(false);
              expect(ciConfig.reducedIterations).toBe(false);
              expect(ciConfig.fallbackEnabled).toBe(false);
            }

            // When CI environment variables are present, optimization should be enabled
            if (expectedIsCIEnvironment) {
              expect(ciConfig.compressionEnabled).toBe(true);
              expect(ciConfig.aggressiveCleanup).toBe(true);
              expect(ciConfig.reducedIterations).toBe(true);
              expect(ciConfig.fallbackEnabled).toBe(true);
            }
          }
        ),
        { numRuns: process.env.CI ? 25 : 100 }
      );
    });

    it('should consistently return the same environment type for identical environment variables', () => {
      fc.assert(
        fc.property(
          fc.record({
            GITHUB_ACTIONS: fc.constantFrom('true', 'false', undefined),
            CI: fc.constantFrom('true', 'false', undefined)
          }),
          (envVars) => {
            // Set up environment variables
            Object.keys(envVars).forEach(key => {
              if (envVars[key as keyof typeof envVars] !== undefined) {
                process.env[key] = envVars[key as keyof typeof envVars];
              } else {
                delete process.env[key];
              }
            });

            // Reset detector cache
            detector.resetCache();

            // Get environment type multiple times
            const firstCall = detector.getEnvironmentType();
            const secondCall = detector.getEnvironmentType();
            const thirdCall = detector.getEnvironmentType();

            // Should be consistent
            expect(firstCall).toBe(secondCall);
            expect(secondCall).toBe(thirdCall);

            // CI detection should also be consistent
            const firstCICall = detector.isCIEnvironment();
            const secondCICall = detector.isCIEnvironment();
            expect(firstCICall).toBe(secondCICall);
          }
        ),
        { numRuns: process.env.CI ? 25 : 100 }
      );
    });
  });

  // Unit tests for specific scenarios
  describe('Unit Tests', () => {
    it('should detect GitHub Actions environment', () => {
      process.env.GITHUB_ACTIONS = 'true';
      detector.resetCache();

      expect(detector.isGitHubActions()).toBe(true);
      expect(detector.isCIEnvironment()).toBe(true);
      expect(detector.getEnvironmentType()).toBe('github-actions');
    });

    it('should detect generic CI environment', () => {
      process.env.CI = 'true';
      detector.resetCache();

      expect(detector.isGitHubActions()).toBe(false);
      expect(detector.isCIEnvironment()).toBe(true);
      expect(detector.getEnvironmentType()).toBe('ci');
    });

    it('should default to local environment when no CI variables are set', () => {
      // Clear all CI-related environment variables
      delete process.env.GITHUB_ACTIONS;
      delete process.env.CI;
      delete process.env.CONTINUOUS_INTEGRATION;
      delete process.env.NODE_ENV;
      detector.resetCache();

      expect(detector.isGitHubActions()).toBe(false);
      expect(detector.isCIEnvironment()).toBe(false);
      expect(detector.getEnvironmentType()).toBe('local');
    });

    it('should provide appropriate configuration for each environment type', () => {
      // Test GitHub Actions configuration
      process.env.GITHUB_ACTIONS = 'true';
      detector.resetCache();
      let config = detector.getCIConfiguration();
      expect(config.maxStorageSize).toBe(2 * 1024 * 1024);
      expect(config.compressionEnabled).toBe(true);

      // Test generic CI configuration
      delete process.env.GITHUB_ACTIONS;
      process.env.CI = 'true';
      detector.resetCache();
      config = detector.getCIConfiguration();
      expect(config.maxStorageSize).toBe(3 * 1024 * 1024);
      expect(config.compressionEnabled).toBe(true);

      // Test local configuration
      delete process.env.CI;
      detector.resetCache();
      config = detector.getCIConfiguration();
      expect(config.maxStorageSize).toBe(5 * 1024 * 1024);
      expect(config.compressionEnabled).toBe(false);
    });
  });
});