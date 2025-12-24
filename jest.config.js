// Environment-aware configuration
const isVerbose = process.env.VERBOSE_TESTS === 'true' || 
                  process.env.VERBOSE === 'true' || 
                  process.argv.includes('--verbose') || 
                  process.argv.includes('-v');

const isCI = process.env.CI === 'true' || 
             process.env.GITHUB_ACTIONS === 'true' || 
             process.env.GITLAB_CI === 'true' || 
             process.env.JENKINS_URL !== undefined || 
             process.env.BUILDKITE === 'true' || 
             process.env.CIRCLECI === 'true';

const isQuiet = process.env.QUIET_TESTS === 'true' || 
                process.argv.includes('--quiet') || 
                process.argv.includes('-q');

// Reporter configuration based on environment and verbosity
function getReporterConfig() {
  if (isVerbose) {
    return ['default'];
  }
  
  if (isQuiet || isCI) {
    return [['summary', { summaryThreshold: 0 }]];
  }
  
  return ['default'];
}

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
  
  // Environment-aware reporter configuration
  reporters: getReporterConfig(),
  
  // Console output suppression for passing tests
  silent: !isVerbose && (isQuiet || isCI),
  verbose: isVerbose,
  
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/index.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
  globalTeardown: '<rootDir>/src/test-teardown.ts',
  
  // Test timeout configuration for CI
  testTimeout: isCI ? 10000 : 30000,
  
  // Parallel execution configuration
  maxWorkers: isCI ? 2 : '50%',
  
  // Memory management for CI
  workerIdleMemoryLimit: isCI ? '512MB' : '1GB',
  
  // Coverage collection (disabled in CI unless verbose)
  collectCoverage: isVerbose || !isCI,
  
  // Bail on first failure in CI for faster feedback
  bail: isCI && !isVerbose ? 1 : 0,
  
  // Legacy globals for backward compatibility
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json'
    },
    CI_ENVIRONMENT: isCI,
    GITHUB_ACTIONS: process.env.GITHUB_ACTIONS === 'true',
    PBT_ITERATIONS: isCI ? 25 : 100,
    PBT_TIMEOUT: isCI ? 5000 : 10000,
    STORAGE_OPTIMIZATION_ENABLED: isCI,
    MAX_STORAGE_SIZE: process.env.GITHUB_ACTIONS === 'true' ? 2097152 : 5242880,
  }
};