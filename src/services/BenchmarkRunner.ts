/**
 * Benchmark Runner
 * 
 * Orchestrates performance baseline establishment and regression detection
 * for the Indoor Golf Scheduler application.
 */

import { 
  PerformanceBenchmark, 
  BenchmarkSuiteResult, 
  performanceBenchmark 
} from './PerformanceBenchmark';
import { 
  BaselineDocumentation, 
  BaselineRecord, 
  BaselineComparison,
  baselineDocumentation 
} from './BaselineDocumentation';
import { performanceMonitor } from './PerformanceMonitor';
import { initializePerformanceMonitoring } from './PerformanceMonitoringSetup';

export interface BenchmarkRunOptions {
  environment?: string;
  version?: string;
  notes?: string;
  tags?: string[];
  compareWithPrevious?: boolean;
  recordBaseline?: boolean;
  generateReport?: boolean;
}

export interface BenchmarkRunResult {
  suiteResult: BenchmarkSuiteResult;
  baselineRecord?: BaselineRecord;
  comparison?: BaselineComparison | undefined;
  report?: string;
  regressionReport?: string | undefined;
  success: boolean;
  error?: string;
}

/**
 * Benchmark Runner
 * 
 * Main interface for running performance benchmarks and establishing baselines
 */
export class BenchmarkRunner {
  private benchmark: PerformanceBenchmark;
  private documentation: BaselineDocumentation;

  constructor() {
    this.benchmark = performanceBenchmark;
    this.documentation = baselineDocumentation;
  }

  /**
   * Run complete performance benchmark suite
   */
  async runBenchmarkSuite(options: BenchmarkRunOptions = {}): Promise<BenchmarkRunResult> {
    const {
      environment = 'development',
      version = 'unknown',
      notes,
      tags = [],
      compareWithPrevious = true,
      recordBaseline = true,
      generateReport = true
    } = options;

    console.log('🚀 Starting performance benchmark suite...');
    console.log(`Environment: ${environment}`);
    console.log(`Version: ${version}`);

    try {
      // Initialize performance monitoring
      initializePerformanceMonitoring();

      // Clear previous metrics
      performanceMonitor.clearMetrics();

      // Run the benchmark suite
      console.log('📊 Running benchmarks...');
      const suiteResult = await this.benchmark.runSuite();

      console.log(`✅ Benchmark suite completed: ${suiteResult.successfulBenchmarks}/${suiteResult.totalBenchmarks} successful`);

      const result: BenchmarkRunResult = {
        suiteResult,
        success: suiteResult.failedBenchmarks === 0
      };

      // Record baseline if requested
      if (recordBaseline) {
        console.log('📝 Recording performance baseline...');
        result.baselineRecord = this.documentation.recordBaseline(
          suiteResult,
          version,
          environment,
          notes,
          tags
        );
      }

      // Compare with previous baseline if requested
      if (compareWithPrevious) {
        console.log('🔍 Comparing with previous baseline...');
        result.comparison = this.documentation.compareWithBaseline(suiteResult, environment) || undefined;
        
        if (result.comparison) {
          result.regressionReport = this.documentation.generateRegressionReport(result.comparison);
          console.log(result.regressionReport);
        }
      }

      // Generate report if requested
      if (generateReport) {
        console.log('📋 Generating performance report...');
        result.report = this.documentation.generateBaselineReport(suiteResult.baseline);
      }

      // Log summary
      this.logBenchmarkSummary(suiteResult, result.comparison);

      return result;

    } catch (error) {
      console.error('❌ Benchmark suite failed:', error);
      return {
        suiteResult: {
          totalBenchmarks: 0,
          successfulBenchmarks: 0,
          failedBenchmarks: 0,
          totalDuration: 0,
          results: [],
          baseline: {
            scheduleGeneration: { players50: 0, players100: 0, players200: 0 },
            dataOperations: { playerQuery: 0, scheduleSave: 0, weekQuery: 0 },
            uiOperations: { scheduleDisplay: 0, playerListUpdate: 0 },
            memoryOperations: { maxMemoryUsage: 0, memoryStability: 0 }
          },
          timestamp: Date.now()
        },
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Run quick performance check (subset of benchmarks)
   */
  async runQuickCheck(environment: string = 'development'): Promise<BenchmarkRunResult> {
    console.log('⚡ Running quick performance check...');

    // Create lightweight benchmark configs for quick check
    const quickBenchmarks = [
      this.benchmark.getDefaultBenchmarks()[0], // Schedule generation - 50 players
      this.benchmark.getDefaultBenchmarks()[3], // Player query
      this.benchmark.getDefaultBenchmarks()[4]  // Schedule save
    ];

    try {
      const suiteResult = await this.benchmark.runSuite(quickBenchmarks);
      
      const comparison = this.documentation.compareWithBaseline(suiteResult, environment);
      
      return {
        suiteResult,
        comparison: comparison || undefined,
        regressionReport: comparison ? this.documentation.generateRegressionReport(comparison) : undefined,
        success: suiteResult.failedBenchmarks === 0
      };

    } catch (error) {
      return {
        suiteResult: {
          totalBenchmarks: 0,
          successfulBenchmarks: 0,
          failedBenchmarks: 0,
          totalDuration: 0,
          results: [],
          baseline: {
            scheduleGeneration: { players50: 0, players100: 0, players200: 0 },
            dataOperations: { playerQuery: 0, scheduleSave: 0, weekQuery: 0 },
            uiOperations: { scheduleDisplay: 0, playerListUpdate: 0 },
            memoryOperations: { maxMemoryUsage: 0, memoryStability: 0 }
          },
          timestamp: Date.now()
        },
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Establish initial baseline for a new environment
   */
  async establishBaseline(
    environment: string,
    version: string,
    notes?: string
  ): Promise<BenchmarkRunResult> {
    console.log(`🎯 Establishing performance baseline for ${environment} (${version})`);

    return await this.runBenchmarkSuite({
      environment,
      version,
      notes: notes || `Initial baseline for ${environment}`,
      tags: ['baseline', 'initial'],
      compareWithPrevious: false,
      recordBaseline: true,
      generateReport: true
    });
  }

  /**
   * Run regression test against existing baseline
   */
  async runRegressionTest(
    environment: string = 'development',
    version: string = 'current'
  ): Promise<BenchmarkRunResult> {
    console.log(`🔍 Running regression test for ${environment}`);

    const result = await this.runBenchmarkSuite({
      environment,
      version,
      notes: `Regression test for ${version}`,
      tags: ['regression-test'],
      compareWithPrevious: true,
      recordBaseline: false,
      generateReport: false
    });

    // Log regression results
    if (result.comparison) {
      const { regressionCount, improvementCount } = result.comparison.summary;
      
      if (regressionCount > 0) {
        console.log(`⚠️  Found ${regressionCount} performance regression(s)`);
      } else {
        console.log('✅ No performance regressions detected');
      }

      if (improvementCount > 0) {
        console.log(`🎉 Found ${improvementCount} performance improvement(s)`);
      }
    }

    return result;
  }

  /**
   * Get performance baseline history
   */
  getBaselineHistory(environment: string = 'development'): BaselineRecord[] {
    return this.documentation.getBaselineHistory(environment);
  }

  /**
   * Export all performance data
   */
  exportPerformanceData(): string {
    return this.documentation.exportBaselines();
  }

  /**
   * Import performance data
   */
  importPerformanceData(data: string): void {
    this.documentation.importBaselines(data);
  }

  /**
   * Clear all performance data (useful for testing)
   */
  clearPerformanceData(): void {
    this.documentation.clearBaselines();
    performanceMonitor.clearMetrics();
  }

  private logBenchmarkSummary(
    suiteResult: BenchmarkSuiteResult, 
    comparison?: BaselineComparison
  ): void {
    console.log('\n📊 Benchmark Summary:');
    console.log(`Total Duration: ${(suiteResult.totalDuration / 1000).toFixed(2)}s`);
    console.log(`Successful Benchmarks: ${suiteResult.successfulBenchmarks}/${suiteResult.totalBenchmarks}`);
    
    if (suiteResult.failedBenchmarks > 0) {
      console.log(`❌ Failed Benchmarks: ${suiteResult.failedBenchmarks}`);
    }

    console.log('\n🎯 Performance Targets:');
    const baseline = suiteResult.baseline;
    
    // Schedule generation targets
    console.log(`Schedule Generation (50 players): ${baseline.scheduleGeneration.players50.toFixed(0)}ms ${baseline.scheduleGeneration.players50 <= 2000 ? '✅' : '❌'} (Target: ≤2000ms)`);
    console.log(`Schedule Generation (100 players): ${baseline.scheduleGeneration.players100.toFixed(0)}ms ${baseline.scheduleGeneration.players100 <= 5000 ? '✅' : '❌'} (Target: ≤5000ms)`);
    console.log(`Schedule Generation (200 players): ${baseline.scheduleGeneration.players200.toFixed(0)}ms ${baseline.scheduleGeneration.players200 <= 10000 ? '✅' : '❌'} (Target: ≤10000ms)`);

    // Data operation targets
    console.log(`Player Query: ${baseline.dataOperations.playerQuery.toFixed(0)}ms ${baseline.dataOperations.playerQuery <= 100 ? '✅' : '❌'} (Target: ≤100ms)`);
    console.log(`Schedule Save: ${baseline.dataOperations.scheduleSave.toFixed(0)}ms ${baseline.dataOperations.scheduleSave <= 500 ? '✅' : '❌'} (Target: ≤500ms)`);

    // Memory usage
    const memoryMB = baseline.memoryOperations.maxMemoryUsage / 1024 / 1024;
    console.log(`Max Memory Usage: ${memoryMB.toFixed(1)}MB ${memoryMB <= 200 ? '✅' : '❌'} (Target: ≤200MB)`);

    if (comparison) {
      console.log('\n📈 Comparison with Previous Baseline:');
      console.log(`Regressions: ${comparison.summary.regressionCount}`);
      console.log(`Improvements: ${comparison.summary.improvementCount}`);
      console.log(`Stable: ${comparison.summary.stableCount}`);
    }

    console.log('\n');
  }
}

// Global benchmark runner instance
export const benchmarkRunner = new BenchmarkRunner();