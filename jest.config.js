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
  
  // CI-specific optimizations
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json'
    },
    // CI environment detection and configuration
    CI_ENVIRONMENT: process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true',
    GITHUB_ACTIONS: process.env.GITHUB_ACTIONS === 'true',
    
    // Property-based test iteration configuration
    PBT_ITERATIONS: process.env.CI === 'true' ? 25 : 100, // Reduced iterations in CI
    PBT_TIMEOUT: process.env.CI === 'true' ? 5000 : 10000, // Reduced timeout in CI
    
    // Storage optimization settings
    STORAGE_OPTIMIZATION_ENABLED: process.env.CI === 'true',
    MAX_STORAGE_SIZE: process.env.GITHUB_ACTIONS === 'true' ? 2097152 : 5242880, // 2MB for GitHub Actions, 5MB otherwise
  },
  
  // Test timeout configuration for CI
  testTimeout: process.env.CI === 'true' ? 10000 : 30000,
  
  // Parallel execution configuration
  maxWorkers: process.env.CI === 'true' ? 2 : '50%', // Limited workers in CI to prevent resource contention
  
  // Memory management for CI
  workerIdleMemoryLimit: process.env.CI === 'true' ? '512MB' : '1GB',
  
  // Additional CI-specific settings
  ...(process.env.CI === 'true' && {
    // Disable coverage collection in CI for faster execution
    collectCoverage: false,
    // Use minimal reporter in CI
    reporters: ['default'],
    // Reduce verbose output in CI
    verbose: false,
    // Enable bail on first failure in CI for faster feedback
    bail: 1
  })
};