/**
 * Baseline Documentation System
 * 
 * Manages performance baseline documentation, tracking, and regression detection
 * for the Indoor Golf Scheduler application.
 */

import { BenchmarkSuiteResult, PerformanceBaseline } from './PerformanceBenchmark';

export interface BaselineRecord {
  id: string;
  timestamp: number;
  version: string;
  environment: string;
  baseline: PerformanceBaseline;
  benchmarkResults: BenchmarkSuiteResult;
  notes?: string;
  tags: string[];
}

export interface RegressionAlert {
  metric: string;
  currentValue: number;
  baselineValue: number;
  percentageChange: number;
  severity: 'warning' | 'critical';
  threshold: number;
  timestamp: number;
}

export interface BaselineComparison {
  current: PerformanceBaseline;
  previous: PerformanceBaseline;
  regressions: RegressionAlert[];
  improvements: RegressionAlert[];
  summary: {
    totalMetrics: number;
    regressionCount: number;
    improvementCount: number;
    stableCount: number;
  };
}

/**
 * Baseline Documentation Manager
 * 
 * Tracks performance baselines over time and detects regressions
 */
export class BaselineDocumentation {
  private baselines: BaselineRecord[] = [];
  private storageKey = 'golf_scheduler_performance_baselines';

  // Regression detection thresholds
  private readonly REGRESSION_THRESHOLDS = {
    warning: 0.15,   // 15% performance degradation
    critical: 0.30   // 30% performance degradation
  };

  constructor() {
    this.loadBaselines();
  }

  /**
   * Record a new performance baseline
   */
  recordBaseline(
    benchmarkResults: BenchmarkSuiteResult,
    version: string = 'unknown',
    environment: string = 'development',
    notes?: string,
    tags: string[] = []
  ): BaselineRecord {
    const record: BaselineRecord = {
      id: this.generateBaselineId(),
      timestamp: Date.now(),
      version,
      environment,
      baseline: benchmarkResults.baseline,
      benchmarkResults,
      ...(notes && { notes }),
      tags: [...tags, environment, version]
    };

    this.baselines.push(record);
    this.saveBaselines();

    console.log(`Performance baseline recorded: ${record.id}`);
    return record;
  }

  /**
   * Get the most recent baseline for an environment
   */
  getLatestBaseline(environment: string = 'development'): BaselineRecord | null {
    const environmentBaselines = this.baselines
      .filter(b => b.environment === environment)
      .sort((a, b) => b.timestamp - a.timestamp);

    return environmentBaselines[0] || null;
  }

  /**
   * Compare current results with previous baseline
   */
  compareWithBaseline(
    currentResults: BenchmarkSuiteResult,
    environment: string = 'development'
  ): BaselineComparison | null {
    const previousBaseline = this.getLatestBaseline(environment);
    if (!previousBaseline) {
      console.log('No previous baseline found for comparison');
      return null;
    }

    const current = currentResults.baseline;
    const previous = previousBaseline.baseline;

    const regressions: RegressionAlert[] = [];
    const improvements: RegressionAlert[] = [];

    // Compare schedule generation metrics
    this.compareMetric(
      'Schedule Generation (50 players)',
      current.scheduleGeneration.players50,
      previous.scheduleGeneration.players50,
      regressions,
      improvements
    );

    this.compareMetric(
      'Schedule Generation (100 players)',
      current.scheduleGeneration.players100,
      previous.scheduleGeneration.players100,
      regressions,
      improvements
    );

    this.compareMetric(
      'Schedule Generation (200 players)',
      current.scheduleGeneration.players200,
      previous.scheduleGeneration.players200,
      regressions,
      improvements
    );

    // Compare data operation metrics
    this.compareMetric(
      'Player Query',
      current.dataOperations.playerQuery,
      previous.dataOperations.playerQuery,
      regressions,
      improvements
    );

    this.compareMetric(
      'Schedule Save',
      current.dataOperations.scheduleSave,
      previous.dataOperations.scheduleSave,
      regressions,
      improvements
    );

    this.compareMetric(
      'Week Query',
      current.dataOperations.weekQuery,
      previous.dataOperations.weekQuery,
      regressions,
      improvements
    );

    // Compare memory metrics
    this.compareMetric(
      'Max Memory Usage',
      current.memoryOperations.maxMemoryUsage,
      previous.memoryOperations.maxMemoryUsage,
      regressions,
      improvements
    );

    this.compareMetric(
      'Memory Stability',
      current.memoryOperations.memoryStability,
      previous.memoryOperations.memoryStability,
      regressions,
      improvements
    );

    const totalMetrics = 8; // Total number of metrics compared
    const stableCount = totalMetrics - regressions.length - improvements.length;

    return {
      current,
      previous,
      regressions,
      improvements,
      summary: {
        totalMetrics,
        regressionCount: regressions.length,
        improvementCount: improvements.length,
        stableCount
      }
    };
  }

  /**
   * Generate performance baseline report
   */
  generateBaselineReport(baseline: PerformanceBaseline): string {
    const report = `
# Performance Baseline Report

Generated: ${new Date().toISOString()}

## Schedule Generation Performance
- 50 Players: ${baseline.scheduleGeneration.players50.toFixed(2)}ms (Target: ≤2000ms)
- 100 Players: ${baseline.scheduleGeneration.players100.toFixed(2)}ms (Target: ≤5000ms)
- 200 Players: ${baseline.scheduleGeneration.players200.toFixed(2)}ms (Target: ≤10000ms)

## Data Operations Performance
- Player Query: ${baseline.dataOperations.playerQuery.toFixed(2)}ms (Target: ≤100ms)
- Schedule Save: ${baseline.dataOperations.scheduleSave.toFixed(2)}ms (Target: ≤500ms)
- Week Query: ${baseline.dataOperations.weekQuery.toFixed(2)}ms (Target: ≤100ms)

## UI Operations Performance
- Schedule Display: ${baseline.uiOperations.scheduleDisplay.toFixed(2)}ms (Target: ≤100ms)
- Player List Update: ${baseline.uiOperations.playerListUpdate.toFixed(2)}ms (Target: ≤200ms)

## Memory Operations
- Max Memory Usage: ${(baseline.memoryOperations.maxMemoryUsage / 1024 / 1024).toFixed(2)}MB (Target: ≤200MB)
- Memory Stability: ${baseline.memoryOperations.memoryStability.toFixed(2)}ms

## Performance Targets Status
${this.generateTargetStatusReport(baseline)}
`;

    return report.trim();
  }

  /**
   * Generate regression alert report
   */
  generateRegressionReport(comparison: BaselineComparison): string {
    if (comparison.regressions.length === 0) {
      return '✅ No performance regressions detected';
    }

    let report = `⚠️  Performance Regression Alert\n\n`;
    report += `Found ${comparison.regressions.length} performance regression(s):\n\n`;

    comparison.regressions.forEach(regression => {
      const icon = regression.severity === 'critical' ? '🔴' : '🟡';
      report += `${icon} ${regression.metric}\n`;
      report += `  Current: ${regression.currentValue.toFixed(2)}ms\n`;
      report += `  Baseline: ${regression.baselineValue.toFixed(2)}ms\n`;
      report += `  Change: +${regression.percentageChange.toFixed(1)}% (${regression.severity})\n\n`;
    });

    if (comparison.improvements.length > 0) {
      report += `\n✅ Performance Improvements:\n\n`;
      comparison.improvements.forEach(improvement => {
        report += `🟢 ${improvement.metric}\n`;
        report += `  Current: ${improvement.currentValue.toFixed(2)}ms\n`;
        report += `  Baseline: ${improvement.baselineValue.toFixed(2)}ms\n`;
        report += `  Change: ${improvement.percentageChange.toFixed(1)}% (improvement)\n\n`;
      });
    }

    return report;
  }

  /**
   * Get all baselines for an environment
   */
  getBaselineHistory(environment: string = 'development'): BaselineRecord[] {
    return this.baselines
      .filter(b => b.environment === environment)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Export baseline data for external analysis
   */
  exportBaselines(): string {
    return JSON.stringify(this.baselines, null, 2);
  }

  /**
   * Import baseline data
   */
  importBaselines(data: string): void {
    try {
      const imported = JSON.parse(data) as BaselineRecord[];
      this.baselines = imported;
      this.saveBaselines();
      console.log(`Imported ${imported.length} baseline records`);
    } catch (error) {
      throw new Error(`Failed to import baselines: ${error}`);
    }
  }

  /**
   * Clear all baselines (useful for testing)
   */
  clearBaselines(): void {
    this.baselines = [];
    this.saveBaselines();
  }

  private compareMetric(
    name: string,
    currentValue: number,
    baselineValue: number,
    regressions: RegressionAlert[],
    improvements: RegressionAlert[]
  ): void {
    if (baselineValue === 0) return; // Skip comparison if baseline is zero

    const percentageChange = (currentValue - baselineValue) / baselineValue;

    if (percentageChange > this.REGRESSION_THRESHOLDS.critical) {
      regressions.push({
        metric: name,
        currentValue,
        baselineValue,
        percentageChange,
        severity: 'critical',
        threshold: this.REGRESSION_THRESHOLDS.critical,
        timestamp: Date.now()
      });
    } else if (percentageChange > this.REGRESSION_THRESHOLDS.warning) {
      regressions.push({
        metric: name,
        currentValue,
        baselineValue,
        percentageChange,
        severity: 'warning',
        threshold: this.REGRESSION_THRESHOLDS.warning,
        timestamp: Date.now()
      });
    } else if (percentageChange < -0.05) { // 5% improvement threshold
      improvements.push({
        metric: name,
        currentValue,
        baselineValue,
        percentageChange,
        severity: 'warning', // Reusing severity field for consistency
        threshold: 0.05,
        timestamp: Date.now()
      });
    }
  }

  private generateTargetStatusReport(baseline: PerformanceBaseline): string {
    const checks = [
      { name: 'Schedule Generation (50 players)', value: baseline.scheduleGeneration.players50, target: 2000 },
      { name: 'Schedule Generation (100 players)', value: baseline.scheduleGeneration.players100, target: 5000 },
      { name: 'Schedule Generation (200 players)', value: baseline.scheduleGeneration.players200, target: 10000 },
      { name: 'Player Query', value: baseline.dataOperations.playerQuery, target: 100 },
      { name: 'Schedule Save', value: baseline.dataOperations.scheduleSave, target: 500 },
      { name: 'Week Query', value: baseline.dataOperations.weekQuery, target: 100 },
      { name: 'Max Memory Usage (MB)', value: baseline.memoryOperations.maxMemoryUsage / 1024 / 1024, target: 200 }
    ];

    return checks.map(check => {
      const status = check.value <= check.target ? '✅' : '❌';
      const unit = check.name.includes('Memory') ? 'MB' : 'ms';
      return `${status} ${check.name}: ${check.value.toFixed(2)}${unit} (Target: ≤${check.target}${unit})`;
    }).join('\n');
  }

  private generateBaselineId(): string {
    return `baseline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private loadBaselines(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        this.baselines = JSON.parse(stored);
      }
    } catch (error) {
      console.warn('Failed to load performance baselines:', error);
      this.baselines = [];
    }
  }

  private saveBaselines(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.baselines));
    } catch (error) {
      console.warn('Failed to save performance baselines:', error);
    }
  }
}

// Global baseline documentation instance
export const baselineDocumentation = new BaselineDocumentation();