/**
 * Property-based tests for environment detection utilities
 * Feature: test-output-optimization, Property 3: Environment-Aware Configuration
 * Validates: Requirements 3.4, 4.4, 5.3, 5.4, 7.1
 */

import * as fc from 'fast-check';
import { TestEnvironmentDetector } from '../environment-detector';

describe('Environment Detection Properties', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let originalArgv: string[];

  beforeEach(() => {
    originalEnv = { ...process.env };
    originalArgv = [...process.argv];
  });

  afterEach(() => {
    process.env = originalEnv;
    process.argv = originalArgv;
  });

  /**
   * Property 3: Environment-Aware Configuration
   * For any test execution environment (local, CI, debug), the test runner should apply 
   * appropriate output verbosity settings that match the environment's requirements
   */
  test('Property 3: Environment detection should be consistent and deterministic', () => {
    const envVarArbitrary = fc.record({
      CI: fc.oneof(fc.constant('true'), fc.constant('false'), fc.constant(undefined)),
      GITHUB_ACTIONS: fc.oneof(fc.constant('true'), fc.constant('false'), fc.constant(undefined)),
      DEBUG_TESTS: fc.oneof(fc.constant('true'), fc.constant('false'), fc.constant(undefined)),
      VERBOSE_TESTS: fc.oneof(fc.constant('true'), fc.constant('false'), fc.constant(undefined)),
      NODE_ENV: fc.oneof(fc.constant('debug'), fc.constant('test'), fc.constant('production'), fc.constant(undefined))
    });

    const argvArbitrary = fc.array(fc.oneof(
      fc.constant('--verbose'),
      fc.constant('--debug'),
      fc.constant('--quiet'),
      fc.constant('-v'),
      fc.constant('-q')
    ), { maxLength: 3 });

    fc.assert(
      fc.property(envVarArbitrary, argvArbitrary, (envVars, argv) => {
        // Set up environment
        Object.keys(envVars).forEach(key => {
          if (envVars[key as keyof typeof envVars] === undefined) {
            delete process.env[key];
          } else {
            process.env[key] = envVars[key as keyof typeof envVars] as string;
          }
        });
        
        process.argv = ['node', 'test', ...argv];
        
        const detector = new TestEnvironmentDetector();
        const environment = detector.getCurrentEnvironment();
        
        // Environment should be one of the valid types
        expect(['local', 'ci', 'debug']).toContain(environment);
        
        // Environment detection should be consistent
        const environment2 = detector.getCurrentEnvironment();
        expect(environment).toBe(environment2);
        
        // Debug mode should take precedence over CI
        if (detector.isDebugMode()) {
          expect(environment).toBe('debug');
        } else if (detector.isCIEnvironment()) {
          expect(environment).toBe('ci');
        } else {
          expect(environment).toBe('local');
        }
        
        // Verbose mode detection should be consistent
        const verbose1 = detector.isVerboseMode();
        const verbose2 = detector.isVerboseMode();
        expect(verbose1).toBe(verbose2);
        
        // CI detection should be consistent
        const ci1 = detector.isCIEnvironment();
        const ci2 = detector.isCIEnvironment();
        expect(ci1).toBe(ci2);
      }),
      { numRuns: 100 }
    );
  });

  test('CI environment detection should recognize common CI platforms', () => {
    const ciEnvironments = [
      { CI: 'true' },
      { GITHUB_ACTIONS: 'true' },
      { GITLAB_CI: 'true' },
      { JENKINS_URL: 'http://jenkins.example.com' },
      { BUILDKITE: 'true' },
      { CIRCLECI: 'true' }
    ];

    ciEnvironments.forEach(envVar => {
      // Clear environment
      Object.keys(process.env).forEach(key => {
        if (key.startsWith('CI') || key.includes('JENKINS') || key.includes('BUILDKITE') || key.includes('CIRCLE')) {
          delete process.env[key];
        }
      });
      
      // Set specific CI environment
      Object.assign(process.env, envVar);
      
      const detector = new TestEnvironmentDetector();
      expect(detector.isCIEnvironment()).toBe(true);
      expect(detector.getCurrentEnvironment()).toBe('ci');
    });
  });

  test('Verbose mode detection should recognize various verbose flags', () => {
    const verboseConfigs = [
      { env: { VERBOSE_TESTS: 'true' }, argv: [] },
      { env: { VERBOSE: 'true' }, argv: [] },
      { env: {}, argv: ['--verbose'] },
      { env: {}, argv: ['-v'] },
      { env: { VERBOSE_TESTS: 'true' }, argv: ['--verbose'] } // Multiple sources
    ];

    verboseConfigs.forEach(({ env, argv }) => {
      // Clear environment
      delete process.env.VERBOSE_TESTS;
      delete process.env.VERBOSE;
      process.argv = ['node', 'test'];
      
      // Set configuration
      Object.assign(process.env, env);
      process.argv.push(...argv);
      
      const detector = new TestEnvironmentDetector();
      expect(detector.isVerboseMode()).toBe(true);
    });
  });

  test('Debug mode should take precedence over CI mode', () => {
    process.env.CI = 'true';
    process.env.DEBUG_TESTS = 'true';
    
    const detector = new TestEnvironmentDetector();
    expect(detector.getCurrentEnvironment()).toBe('debug');
    expect(detector.isDebugMode()).toBe(true);
    expect(detector.isCIEnvironment()).toBe(true); // Still detects CI, but debug takes precedence
  });

  test('Local environment should be default when no special flags are set', () => {
    // Clear all relevant environment variables
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;
    delete process.env.DEBUG_TESTS;
    delete process.env.VERBOSE_TESTS;
    delete process.env.NODE_ENV;
    process.argv = ['node', 'test'];
    
    const detector = new TestEnvironmentDetector();
    expect(detector.getCurrentEnvironment()).toBe('local');
    expect(detector.isCIEnvironment()).toBe(false);
    expect(detector.isDebugMode()).toBe(false);
    expect(detector.isVerboseMode()).toBe(false);
  });
});