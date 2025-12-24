import { defineConfig, devices } from '@playwright/test';

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
    return [['list'], ['html']];
  }
  
  if (isQuiet || isCI) {
    return 'dot';
  }
  
  return [['line'], ['html', { open: 'never' }]];
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  
  // Environment-aware reporter configuration
  reporter: getReporterConfig(),
  
  use: {
    baseURL: 'http://localhost:3000',
    
    // Trace and video capture optimized for failures only
    trace: isVerbose ? 'on' : 'retain-on-failure',
    video: isVerbose ? 'on' : 'retain-on-failure',
    screenshot: isVerbose ? 'on' : 'only-on-failure',
    
    // Reduce browser output in non-verbose mode
    launchOptions: {
      logger: isVerbose ? undefined : {
        isEnabled: () => false,
        log: () => {}
      }
    }
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});