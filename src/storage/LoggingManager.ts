import { StorageMetricsModel, FallbackReason } from './interfaces';

/**
 * Log levels for different types of messages
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

/**
 * Storage operation types for logging
 */
export enum StorageOperation {
  SET_ITEM = 'setItem',
  GET_ITEM = 'getItem',
  REMOVE_ITEM = 'removeItem',
  CLEAR = 'clear',
  CLEANUP = 'cleanup',
  FALLBACK_ACTIVATION = 'fallbackActivation',
  COMPRESSION = 'compression',
  MONITORING = 'monitoring'
}

/**
 * Log entry structure
 */
export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  operation: StorageOperation;
  message: string;
  metadata?: Record<string, any>;
  storageMetrics?: Partial<StorageMetricsModel>;
}

/**
 * Metrics collection interface
 */
export interface MetricsCollector {
  recordOperation(operation: StorageOperation, duration: number, success: boolean): void;
  recordStorageUsage(usedBytes: number, totalBytes: number): void;
  recordFallbackActivation(reason: FallbackReason): void;
  recordCompressionSavings(originalSize: number, compressedSize: number): void;
  recordCleanupOperation(itemsRemoved: number, bytesFreed: number): void;
  getMetrics(): StorageMetricsModel;
  resetMetrics(): void;
}

/**
 * Comprehensive logging and metrics manager for storage operations
 */
export class LoggingManager implements MetricsCollector {
  private static instance: LoggingManager;
  private logs: LogEntry[] = [];
  private metrics: StorageMetricsModel;
  private maxLogEntries = 1000;
  private startTime: Date;

  private constructor() {
    this.startTime = new Date();
    this.metrics = this.initializeMetrics();
  }

  public static getInstance(): LoggingManager {
    if (!LoggingManager.instance) {
      LoggingManager.instance = new LoggingManager();
    }
    return LoggingManager.instance;
  }

  /**
   * Log a storage operation with detailed context
   */
  public logStorageOperation(
    level: LogLevel,
    operation: StorageOperation,
    message: string,
    metadata?: Record<string, any>,
    storageMetrics?: Partial<StorageMetricsModel>
  ): void {
    const logEntry: LogEntry = {
      timestamp: new Date(),
      level,
      operation,
      message,
      ...(metadata && { metadata }),
      ...(storageMetrics && { storageMetrics })
    };

    this.addLogEntry(logEntry);
    this.outputLog(logEntry);
  }

  /**
   * Log fallback activation with detailed context
   */
  public logFallbackActivation(
    reason: FallbackReason,
    fromStorage: string,
    toStorage: string,
    storageMetrics: Partial<StorageMetricsModel>
  ): void {
    this.logStorageOperation(
      LogLevel.WARN,
      StorageOperation.FALLBACK_ACTIVATION,
      `Storage fallback activated: ${reason}`,
      {
        reason,
        fromStorage,
        toStorage,
        activationTime: new Date().toISOString()
      },
      storageMetrics
    );

    this.recordFallbackActivation(reason);
  }

  /**
   * Log storage error with comprehensive metrics
   */
  public logStorageError(
    operation: StorageOperation,
    error: Error,
    key?: string,
    storageMetrics?: Partial<StorageMetricsModel>
  ): void {
    this.logStorageOperation(
      LogLevel.ERROR,
      operation,
      `Storage error during ${operation}: ${error.message}`,
      {
        errorName: error.name,
        errorMessage: error.message,
        errorStack: error.stack,
        key,
        timestamp: new Date().toISOString()
      },
      storageMetrics
    );

    this.metrics.errorCount++;
  }

  /**
   * Log cleanup operation results
   */
  public logCleanupOperation(
    itemsRemoved: number,
    bytesFreed: number,
    operationType: string,
    success: boolean,
    errors: string[] = []
  ): void {
    this.logStorageOperation(
      success ? LogLevel.INFO : LogLevel.WARN,
      StorageOperation.CLEANUP,
      `Cleanup operation ${success ? 'completed' : 'completed with errors'}: ${operationType}`,
      {
        itemsRemoved,
        bytesFreed,
        operationType,
        success,
        errors,
        timestamp: new Date().toISOString()
      }
    );

    this.recordCleanupOperation(itemsRemoved, bytesFreed);
  }

  /**
   * Log compression operation
   */
  public logCompressionOperation(
    originalSize: number,
    compressedSize: number,
    compressionRatio: number,
    success: boolean
  ): void {
    this.logStorageOperation(
      LogLevel.DEBUG,
      StorageOperation.COMPRESSION,
      `Data compression ${success ? 'successful' : 'failed'}`,
      {
        originalSize,
        compressedSize,
        compressionRatio,
        savings: originalSize - compressedSize,
        success,
        timestamp: new Date().toISOString()
      }
    );

    if (success) {
      this.recordCompressionSavings(originalSize, compressedSize);
    }
  }

  /**
   * Record operation metrics
   */
  public recordOperation(operation: StorageOperation, duration: number, success: boolean): void {
    // Update test execution time (cumulative)
    this.metrics.testExecutionTime += duration;
    
    if (!success) {
      this.metrics.errorCount++;
    }
  }

  /**
   * Record storage usage metrics
   */
  public recordStorageUsage(usedBytes: number, totalBytes: number): void {
    this.metrics.totalUsage = usedBytes;
    
    // Track peak usage
    if (usedBytes > this.metrics.peakUsage) {
      this.metrics.peakUsage = usedBytes;
    }
  }

  /**
   * Record fallback activation
   */
  public recordFallbackActivation(reason: FallbackReason): void {
    this.metrics.fallbackActivations++;
  }

  /**
   * Record compression savings
   */
  public recordCompressionSavings(originalSize: number, compressedSize: number): void {
    const savings = originalSize - compressedSize;
    this.metrics.compressionSavings += savings;
  }

  /**
   * Record cleanup operation
   */
  public recordCleanupOperation(itemsRemoved: number, bytesFreed: number): void {
    this.metrics.cleanupOperations++;
  }

  /**
   * Get current metrics
   */
  public getMetrics(): StorageMetricsModel {
    return {
      ...this.metrics,
      timestamp: new Date(),
      testExecutionTime: Date.now() - this.startTime.getTime()
    };
  }

  /**
   * Reset all metrics
   */
  public resetMetrics(): void {
    this.metrics = this.initializeMetrics();
    this.startTime = new Date();
  }

  /**
   * Get recent log entries
   */
  public getRecentLogs(count: number = 50): LogEntry[] {
    return this.logs.slice(-count);
  }

  /**
   * Get logs by level
   */
  public getLogsByLevel(level: LogLevel): LogEntry[] {
    return this.logs.filter(log => log.level === level);
  }

  /**
   * Get logs by operation type
   */
  public getLogsByOperation(operation: StorageOperation): LogEntry[] {
    return this.logs.filter(log => log.operation === operation);
  }

  /**
   * Export metrics and logs for CI reporting
   */
  public exportForCI(): {
    metrics: StorageMetricsModel;
    errorLogs: LogEntry[];
    warningLogs: LogEntry[];
    summary: string;
  } {
    const metrics = this.getMetrics();
    const errorLogs = this.getLogsByLevel(LogLevel.ERROR);
    const warningLogs = this.getLogsByLevel(LogLevel.WARN);
    
    const summary = this.generateSummary(metrics, errorLogs.length, warningLogs.length);

    return {
      metrics,
      errorLogs,
      warningLogs,
      summary
    };
  }

  /**
   * Clear old log entries to prevent memory issues
   */
  public clearOldLogs(): void {
    if (this.logs.length > this.maxLogEntries) {
      const excessLogs = this.logs.length - this.maxLogEntries;
      this.logs.splice(0, excessLogs);
    }
  }

  /**
   * Initialize metrics structure
   */
  private initializeMetrics(): StorageMetricsModel {
    return {
      timestamp: new Date(),
      environment: this.detectEnvironment(),
      totalUsage: 0,
      peakUsage: 0,
      compressionSavings: 0,
      fallbackActivations: 0,
      cleanupOperations: 0,
      testExecutionTime: 0,
      errorCount: 0
    };
  }

  /**
   * Add log entry and manage log size
   */
  private addLogEntry(entry: LogEntry): void {
    this.logs.push(entry);
    
    // Periodically clean old logs
    if (this.logs.length > this.maxLogEntries * 1.1) {
      this.clearOldLogs();
    }
  }

  /**
   * Output log to console with appropriate formatting
   */
  private outputLog(entry: LogEntry): void {
    const timestamp = entry.timestamp.toISOString();
    const prefix = `[${timestamp}] [${entry.level.toUpperCase()}] [${entry.operation}]`;
    const message = `${prefix} ${entry.message}`;

    switch (entry.level) {
      case LogLevel.ERROR:
        console.error(message, entry.metadata);
        break;
      case LogLevel.WARN:
        console.warn(message, entry.metadata);
        break;
      case LogLevel.INFO:
        console.info(message, entry.metadata);
        break;
      case LogLevel.DEBUG:
        console.debug(message, entry.metadata);
        break;
    }
  }

  /**
   * Detect current environment
   */
  private detectEnvironment(): string {
    if (typeof process !== 'undefined' && process.env) {
      if (process.env.GITHUB_ACTIONS) return 'github-actions';
      if (process.env.CI) return 'ci';
    }
    return 'local';
  }

  /**
   * Generate summary report
   */
  private generateSummary(metrics: StorageMetricsModel, errorCount: number, warningCount: number): string {
    const lines = [
      '=== Storage Optimization Summary ===',
      `Environment: ${metrics.environment}`,
      `Total Usage: ${this.formatBytes(metrics.totalUsage)}`,
      `Peak Usage: ${this.formatBytes(metrics.peakUsage)}`,
      `Compression Savings: ${this.formatBytes(metrics.compressionSavings)}`,
      `Fallback Activations: ${metrics.fallbackActivations}`,
      `Cleanup Operations: ${metrics.cleanupOperations}`,
      `Execution Time: ${metrics.testExecutionTime}ms`,
      `Errors: ${errorCount}`,
      `Warnings: ${warningCount}`,
      '=================================='
    ];
    
    return lines.join('\n');
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