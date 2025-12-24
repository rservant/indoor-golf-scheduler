// Test teardown - runs after all tests complete
// This file is configured in Jest to run at the end of test execution

import { reportFinalCIMetrics } from './storage/CIMetricsReporter';

// Export the teardown function as required by Jest
export default async function globalTeardown(): Promise<void> {
  // Report final CI metrics when all tests are complete
  if (typeof process !== 'undefined' && 
      (process.env.CI_STORAGE_METRICS_REPORTING === 'true' || 
       process.env.CI_STORAGE_MONITORING === 'true')) {
    
    console.log('\n=== Test Execution Complete - Generating Final Storage Metrics ===');
    reportFinalCIMetrics();
  }
}