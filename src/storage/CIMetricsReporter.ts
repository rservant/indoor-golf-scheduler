import { LoggingManager, LogLevel, StorageOperation } from './LoggingManager';
import { StorageMetricsModel } from './interfaces';
import { EnvironmentDetector } from './EnvironmentDetector';

/**
 * CI-specific metrics reporting and collection
 */
export class CIMetricsReporter {
  private static instance: CIMetricsReporter;
  private loggingManager: LoggingManager;
  private environmentDetector: EnvironmentDetector;
  private metricsStartTime: Date;
  private reportingEnabled: boolean;

  private constructor() {
    this.loggingManager = LoggingManager.getInstance();
    this.environmentDetector = new EnvironmentDetector();
    this.metricsStartTime = new Date();
    this.reportingEnabled = this.shouldEnableReporting();
  }

  public static getInstance(): CIMetricsReporter {
    if (!CIMetricsReporter.instance) {
      CIMetricsReporter.instance = new CIMetricsReporter();
    }
    return CIMetricsReporter.instance;
  }

  /**
   * Initialize CI metrics collection
   */
  public initializeMetricsCollection(): void {
    if (!this.reportingEnabled) {
      return;
    }

    this.logCIStart();
    this.setupPeriodicReporting();
  }

  /**
   * Report final metrics at the end of CI execution
   */
  public reportFinalMetrics(): void {
    if (!this.reportingEnabled) {
      return;
    }

    const ciExport = this.loggingManager.exportForCI();
    const executionTime = Date.now() - this.metricsStartTime.getTime();

    // Output structured metrics for GitHub Actions
    this.outputGitHubActionsMetrics(ciExport.metrics, executionTime);
    
    // Output summary
    console.log('\n' + ciExport.summary);

    // Output detailed error information if any
    if (ciExport.errorLogs.length > 0) {
      console.log('\n=== Storage Errors ===');
      ciExport.errorLogs.forEach(log => {
        console.log(`${log.timestamp.toISOString()}: ${log.message}`);
        if (log.metadata) {
          console.log('  Metadata:', JSON.stringify(log.metadata, null, 2));
        }
      });
    }

    // Output warnings
    if (ciExport.warningLogs.length > 0) {
      console.log('\n=== Storage Warnings ===');
      ciExport.warningLogs.forEach(log => {
        console.log(`${log.timestamp.toISOString()}: ${log.message}`);
      });
    }

    // Set GitHub Actions outputs if available
    this.setGitHubActionsOutputs(ciExport.metrics, executionTime);
  }

  /**
   * Report storage usage during test execution
   */
  public reportStorageUsage(usedBytes: number, totalBytes: number, context: string): void {
    if (!this.reportingEnabled) {
      return;
    }

    const usagePercentage = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;
    
    this.loggingManager.logStorageOperation(
      LogLevel.INFO,
      StorageOperation.MONITORING,
      `Storage usage report: ${context}`,
      {
        usedBytes,
        totalBytes,
        usagePercentage: usagePercentage.toFixed(2),
        context,
        timestamp: new Date().toISOString()
      }
    );

    // Log warning if usage is high
    if (usagePercentage > 80) {
      this.loggingManager.logStorageOperation(
        LogLevel.WARN,
        StorageOperation.MONITORING,
        `High storage usage detected: ${usagePercentage.toFixed(2)}%`,
        {
          usedBytes,
          totalBytes,
          usagePercentage: usagePercentage.toFixed(2),
          context,
          recommendedAction: 'cleanup'
        }
      );
    }

    this.loggingManager.recordStorageUsage(usedBytes, totalBytes);
  }

  /**
   * Report optimization effectiveness
   */
  public reportOptimizationEffectiveness(
    originalSize: number,
    optimizedSize: number,
    optimizationType: string
  ): void {
    if (!this.reportingEnabled) {
      return;
    }

    const savings = originalSize - optimizedSize;
    const savingsPercentage = originalSize > 0 ? (savings / originalSize) * 100 : 0;

    this.loggingManager.logStorageOperation(
      LogLevel.INFO,
      StorageOperation.COMPRESSION,
      `Storage optimization effectiveness: ${optimizationType}`,
      {
        originalSize,
        optimizedSize,
        savings,
        savingsPercentage: savingsPercentage.toFixed(2),
        optimizationType,
        timestamp: new Date().toISOString()
      }
    );

    if (savingsPercentage >= 50) {
      console.log(`✅ Storage optimization target met: ${savingsPercentage.toFixed(2)}% reduction`);
    } else if (savingsPercentage >= 25) {
      console.log(`⚠️  Storage optimization partial: ${savingsPercentage.toFixed(2)}% reduction`);
    } else {
      console.log(`❌ Storage optimization insufficient: ${savingsPercentage.toFixed(2)}% reduction`);
    }
  }

  /**
   * Report test execution metrics
   */
  public reportTestExecutionMetrics(
    testName: string,
    duration: number,
    storageOperations: number,
    success: boolean
  ): void {
    if (!this.reportingEnabled) {
      return;
    }

    this.loggingManager.logStorageOperation(
      success ? LogLevel.INFO : LogLevel.ERROR,
      StorageOperation.MONITORING,
      `Test execution metrics: ${testName}`,
      {
        testName,
        duration,
        storageOperations,
        success,
        timestamp: new Date().toISOString()
      }
    );

    this.loggingManager.recordOperation(StorageOperation.MONITORING, duration, success);
  }

  /**
   * Check if reporting should be enabled
   */
  private shouldEnableReporting(): boolean {
    // Enable if explicitly requested
    if (process.env.CI_STORAGE_METRICS_REPORTING === 'true') {
      return true;
    }

    // Enable if in CI environment and monitoring is enabled
    if (this.environmentDetector.isCIEnvironment() && 
        process.env.CI_STORAGE_MONITORING === 'true') {
      return true;
    }

    return false;
  }

  /**
   * Log CI execution start
   */
  private logCIStart(): void {
    const config = this.environmentDetector.getCIConfiguration();
    
    console.log('\n=== CI Storage Optimization Started ===');
    console.log(`Environment: ${this.environmentDetector.getEnvironmentType()}`);
    console.log(`Max Storage Size: ${this.formatBytes(config.maxStorageSize)}`);
    console.log(`Compression Enabled: ${config.compressionEnabled}`);
    console.log(`Aggressive Cleanup: ${config.aggressiveCleanup}`);
    console.log(`Reduced Iterations: ${config.reducedIterations}`);
    console.log(`Fallback Enabled: ${config.fallbackEnabled}`);
    console.log('==========================================\n');
  }

  /**
   * Setup periodic reporting during test execution
   */
  private setupPeriodicReporting(): void {
    // Report metrics every 30 seconds during CI execution
    const reportingInterval = setInterval(() => {
      const metrics = this.loggingManager.getMetrics();
      console.log(`\n[METRICS] Peak Usage: ${this.formatBytes(metrics.peakUsage)}, ` +
                 `Compression Savings: ${this.formatBytes(metrics.compressionSavings)}, ` +
                 `Fallbacks: ${metrics.fallbackActivations}, ` +
                 `Errors: ${metrics.errorCount}`);
    }, 30000);

    // Clear interval after 10 minutes to prevent long-running processes
    setTimeout(() => {
      clearInterval(reportingInterval);
    }, 600000);
  }

  /**
   * Output metrics in GitHub Actions format
   */
  private outputGitHubActionsMetrics(metrics: StorageMetricsModel, executionTime: number): void {
    console.log('\n::group::Storage Optimization Metrics');
    console.log(`Total Storage Usage: ${this.formatBytes(metrics.totalUsage)}`);
    console.log(`Peak Storage Usage: ${this.formatBytes(metrics.peakUsage)}`);
    console.log(`Compression Savings: ${this.formatBytes(metrics.compressionSavings)}`);
    console.log(`Fallback Activations: ${metrics.fallbackActivations}`);
    console.log(`Cleanup Operations: ${metrics.cleanupOperations}`);
    console.log(`Total Execution Time: ${executionTime}ms`);
    console.log(`Storage Errors: ${metrics.errorCount}`);
    
    // Calculate optimization effectiveness
    const maxAllowedSize = parseInt(process.env.CI_STORAGE_MAX_SIZE || '2097152', 10);
    const usagePercentage = (metrics.peakUsage / maxAllowedSize) * 100;
    console.log(`Storage Usage vs Limit: ${usagePercentage.toFixed(2)}%`);
    
    if (metrics.compressionSavings > 0) {
      const compressionRatio = (metrics.compressionSavings / (metrics.totalUsage + metrics.compressionSavings)) * 100;
      console.log(`Compression Effectiveness: ${compressionRatio.toFixed(2)}%`);
    }
    
    console.log('::endgroup::');
  }

  /**
   * Set GitHub Actions outputs for use in subsequent steps
   */
  private setGitHubActionsOutputs(metrics: StorageMetricsModel, executionTime: number): void {
    if (!process.env.GITHUB_ACTIONS) {
      return;
    }

    const outputs = [
      `storage-total-usage=${metrics.totalUsage}`,
      `storage-peak-usage=${metrics.peakUsage}`,
      `storage-compression-savings=${metrics.compressionSavings}`,
      `storage-fallback-activations=${metrics.fallbackActivations}`,
      `storage-cleanup-operations=${metrics.cleanupOperations}`,
      `storage-execution-time=${executionTime}`,
      `storage-error-count=${metrics.errorCount}`,
    ];

    outputs.forEach(output => {
      console.log(`::set-output name=${output}`);
    });
  }

  /**
   * Format bytes for human-readable output
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }
}

/**
 * Initialize CI metrics reporting if in CI environment
 */
export function initializeCIMetricsReporting(): CIMetricsReporter {
  const reporter = CIMetricsReporter.getInstance();
  reporter.initializeMetricsCollection();
  return reporter;
}

/**
 * Report final CI metrics (call at end of test execution)
 */
export function reportFinalCIMetrics(): void {
  const reporter = CIMetricsReporter.getInstance();
  reporter.reportFinalMetrics();
}