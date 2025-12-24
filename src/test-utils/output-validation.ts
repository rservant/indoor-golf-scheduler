/**
 * Test output validation utilities for property-based testing
 */

export interface TestOutputMetrics {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  executionTime: number;
  hasVerboseOutput: boolean;
  hasStackTraces: boolean;
  hasConsoleOutput: boolean;
  hasSuccessIndicators: boolean;
  hasFailureDetails: boolean;
}

export interface TestSummary {
  framework: 'jest' | 'playwright';
  status: 'passed' | 'failed' | 'mixed';
  metrics: TestOutputMetrics;
  outputLines: string[];
}

export class TestOutputValidator {
  /**
   * Parse test output and extract metrics
   */
  static parseTestOutput(output: string, framework: 'jest' | 'playwright'): TestSummary {
    const lines = output.split('\n');
    const metrics = this.extractMetrics(output, framework);
    
    return {
      framework,
      status: this.determineStatus(metrics),
      metrics,
      outputLines: lines
    };
  }

  /**
   * Extract metrics from test output
   */
  private static extractMetrics(output: string, framework: 'jest' | 'playwright'): TestOutputMetrics {
    const lines = output.split('\n');
    
    return {
      totalTests: this.extractTestCount(output, framework),
      passedTests: this.extractPassedCount(output, framework),
      failedTests: this.extractFailedCount(output, framework),
      executionTime: this.extractExecutionTime(output, framework),
      hasVerboseOutput: this.hasVerboseOutput(output),
      hasStackTraces: this.hasStackTraces(output),
      hasConsoleOutput: this.hasConsoleOutput(output),
      hasSuccessIndicators: this.hasSuccessIndicators(output, framework),
      hasFailureDetails: this.hasFailureDetails(output)
    };
  }

  /**
   * Extract total test count from output
   */
  private static extractTestCount(output: string, framework: 'jest' | 'playwright'): number {
    if (framework === 'jest') {
      const match = output.match(/Tests:\s+(\d+)\s+total/i);
      return match ? parseInt(match[1], 10) : 0;
    } else {
      const match = output.match(/(\d+)\s+passed/i) || output.match(/Total:\s+(\d+)\s+tests/i);
      return match ? parseInt(match[1], 10) : 0;
    }
  }

  /**
   * Extract passed test count from output
   */
  private static extractPassedCount(output: string, framework: 'jest' | 'playwright'): number {
    const match = output.match(/(\d+)\s+passed/i);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Extract failed test count from output
   */
  private static extractFailedCount(output: string, framework: 'jest' | 'playwright'): number {
    const match = output.match(/(\d+)\s+failed/i);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Extract execution time from output
   */
  private static extractExecutionTime(output: string, framework: 'jest' | 'playwright'): number {
    const timeMatch = output.match(/Time:\s+([\d.]+)\s*s/i);
    return timeMatch ? parseFloat(timeMatch[1]) : 0;
  }

  /**
   * Check if output contains verbose information
   */
  private static hasVerboseOutput(output: string): boolean {
    return /describe|it\(|test\(/i.test(output) || 
           /✓|✗|√|×/.test(output) ||
           output.includes('RUNS') ||
           output.includes('PASS') && output.includes('FAIL');
  }

  /**
   * Check if output contains stack traces
   */
  private static hasStackTraces(output: string): boolean {
    return /at\s+\w+\./i.test(output) || 
           /at\s+async/i.test(output) ||
           /^\s+at\s+/m.test(output);
  }

  /**
   * Check if output contains console.log statements
   */
  private static hasConsoleOutput(output: string): boolean {
    return /console\.log/i.test(output) ||
           /console\.warn/i.test(output) ||
           /console\.error/i.test(output);
  }

  /**
   * Check if output contains success indicators
   */
  private static hasSuccessIndicators(output: string, framework: 'jest' | 'playwright'): boolean {
    if (framework === 'jest') {
      return /PASS|✓|passed/i.test(output) && /Test Suites.*passed/i.test(output);
    } else {
      return /passed|✓|√/i.test(output);
    }
  }

  /**
   * Check if output contains failure details
   */
  private static hasFailureDetails(output: string): boolean {
    return /FAIL|✗|×|failed/i.test(output) && 
           (/Error:|Expected:|Received:/i.test(output) || this.hasStackTraces(output));
  }

  /**
   * Determine overall test status
   */
  private static determineStatus(metrics: TestOutputMetrics): 'passed' | 'failed' | 'mixed' {
    if (metrics.failedTests > 0) {
      return metrics.passedTests > 0 ? 'mixed' : 'failed';
    }
    return metrics.passedTests > 0 ? 'passed' : 'failed';
  }

  /**
   * Validate that output meets minimal success criteria
   */
  static validateMinimalSuccessOutput(summary: TestSummary): boolean {
    if (summary.status !== 'passed') {
      return true; // Only validate successful test output
    }

    const { metrics } = summary;
    
    // Should have success indicators
    if (!metrics.hasSuccessIndicators) {
      return false;
    }

    // Should not have verbose debugging information
    if (metrics.hasStackTraces && !this.isVerboseMode()) {
      return false;
    }

    // Should not have console output from passing tests
    if (metrics.hasConsoleOutput && !this.isVerboseMode()) {
      return false;
    }

    return true;
  }

  /**
   * Validate that output meets comprehensive failure criteria
   */
  static validateComprehensiveFailureOutput(summary: TestSummary): boolean {
    if (summary.status === 'passed') {
      return true; // Only validate failure output
    }

    const { metrics } = summary;
    
    // Should have failure details
    if (!metrics.hasFailureDetails) {
      return false;
    }

    // Should have stack traces for failures
    if (metrics.failedTests > 0 && !metrics.hasStackTraces) {
      return false;
    }

    return true;
  }

  /**
   * Check if verbose mode is enabled
   */
  private static isVerboseMode(): boolean {
    return process.env.VERBOSE_TESTS === 'true' || 
           process.env.VERBOSE === 'true' || 
           process.argv.includes('--verbose') || 
           process.argv.includes('-v');
  }

  /**
   * Generate test output patterns for property-based testing
   */
  static generateTestOutputPattern(
    testCount: number, 
    passedCount: number, 
    failedCount: number,
    framework: 'jest' | 'playwright'
  ): string {
    const executionTime = (Math.random() * 5 + 0.1).toFixed(3);
    
    if (framework === 'jest') {
      return this.generateJestOutput(testCount, passedCount, failedCount, executionTime);
    } else {
      return this.generatePlaywrightOutput(testCount, passedCount, failedCount, executionTime);
    }
  }

  /**
   * Generate Jest output pattern
   */
  private static generateJestOutput(
    testCount: number, 
    passedCount: number, 
    failedCount: number, 
    executionTime: string
  ): string {
    const suiteStatus = failedCount > 0 ? 'FAIL' : 'PASS';
    
    return `
${suiteStatus} src/example.test.ts

Test Suites: 1 ${failedCount > 0 ? 'failed' : 'passed'}, 1 total
Tests:       ${passedCount} passed, ${failedCount} failed, ${testCount} total
Snapshots:   0 total
Time:        ${executionTime} s
`.trim();
  }

  /**
   * Generate Playwright output pattern
   */
  private static generatePlaywrightOutput(
    testCount: number, 
    passedCount: number, 
    failedCount: number, 
    executionTime: string
  ): string {
    return `
Running ${testCount} tests using 1 worker

${passedCount} passed${failedCount > 0 ? `, ${failedCount} failed` : ''} (${executionTime}s)
`.trim();
  }
}