/**
 * Performance Monitoring Service
 * 
 * Provides comprehensive performance tracking, metrics collection, and alerting
 * for the Indoor Golf Scheduler application.
 */

// Define MemoryInfo interface for environments that don't have it
interface MemoryInfo {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

export interface PerformanceMetrics {
  operationName: string;
  startTime: number;
  endTime: number;
  duration: number;
  memoryUsage: MemoryInfo;
  resourceUsage: ResourceUsage;
  metadata?: Record<string, any>;
}

export interface PerformanceThresholds {
  warning: number;
  critical: number;
  timeout: number;
}

export interface ResourceUsage {
  cpuTime?: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
}

export interface AggregatedMetrics {
  operationName: string;
  totalExecutions: number;
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
  p95Duration: number;
  p99Duration: number;
  errorRate: number;
  lastExecuted: number;
}

export interface TimeRange {
  start: number;
  end: number;
}

export interface PerformanceTracker {
  id: string;
  operationName: string;
  startTime: number;
  metadata?: Record<string, any>;
}

export type ThresholdExceededCallback = (metrics: PerformanceMetrics) => void;

/**
 * Performance Monitor Service
 * 
 * Tracks operation performance, collects metrics, and provides alerting
 * when performance thresholds are exceeded.
 */
export class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private thresholds: Map<string, PerformanceThresholds> = new Map();
  private activeTrackers: Map<string, PerformanceTracker> = new Map();
  private thresholdCallbacks: ThresholdExceededCallback[] = [];
  private maxMetricsHistory = 10000; // Limit memory usage

  /**
   * Start tracking an operation
   */
  startOperation(name: string, metadata?: Record<string, any>): PerformanceTracker {
    const tracker: PerformanceTracker = {
      id: this.generateTrackerId(),
      operationName: name,
      startTime: performance.now(),
      ...(metadata && { metadata })
    };

    this.activeTrackers.set(tracker.id, tracker);
    return tracker;
  }

  /**
   * End tracking an operation and collect metrics
   */
  endOperation(tracker: PerformanceTracker): PerformanceMetrics {
    const endTime = performance.now();
    const duration = endTime - tracker.startTime;

    // Get memory usage if available
    const memoryUsage = this.getMemoryUsage();
    const resourceUsage = this.getResourceUsage();

    const metrics: PerformanceMetrics = {
      operationName: tracker.operationName,
      startTime: tracker.startTime,
      endTime,
      duration,
      memoryUsage,
      resourceUsage,
      ...(tracker.metadata && { metadata: tracker.metadata })
    };

    // Store metrics
    this.storeMetrics(metrics);

    // Check thresholds
    this.checkThresholds(metrics);

    // Remove from active trackers
    this.activeTrackers.delete(tracker.id);

    return metrics;
  }

  /**
   * Set performance thresholds for an operation
   */
  setThresholds(operation: string, thresholds: PerformanceThresholds): void {
    this.thresholds.set(operation, thresholds);
  }

  /**
   * Get metrics for a specific time range
   */
  getMetrics(timeRange?: TimeRange): PerformanceMetrics[] {
    if (!timeRange) {
      return [...this.metrics];
    }

    return this.metrics.filter(metric => 
      metric.startTime >= timeRange.start && metric.endTime <= timeRange.end
    );
  }

  /**
   * Get aggregated metrics for an operation
   */
  getAggregatedMetrics(operation: string): AggregatedMetrics {
    const operationMetrics = this.metrics.filter(m => m.operationName === operation);
    
    if (operationMetrics.length === 0) {
      return {
        operationName: operation,
        totalExecutions: 0,
        averageDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        p95Duration: 0,
        p99Duration: 0,
        errorRate: 0,
        lastExecuted: 0
      };
    }

    const durations = operationMetrics.map(m => m.duration).sort((a, b) => a - b);
    const totalDuration = durations.reduce((sum, d) => sum + d, 0);

    return {
      operationName: operation,
      totalExecutions: operationMetrics.length,
      averageDuration: totalDuration / operationMetrics.length,
      minDuration: durations[0],
      maxDuration: durations[durations.length - 1],
      p95Duration: this.calculatePercentile(durations, 0.95),
      p99Duration: this.calculatePercentile(durations, 0.99),
      errorRate: 0, // TODO: Track errors separately
      lastExecuted: Math.max(...operationMetrics.map(m => m.endTime))
    };
  }

  /**
   * Register callback for threshold exceeded events
   */
  onThresholdExceeded(callback: ThresholdExceededCallback): void {
    this.thresholdCallbacks.push(callback);
  }

  /**
   * Clear all metrics (useful for testing)
   */
  clearMetrics(): void {
    this.metrics = [];
    this.activeTrackers.clear();
  }

  /**
   * Get current performance statistics
   */
  getPerformanceStats(): {
    totalOperations: number;
    activeOperations: number;
    averageOperationTime: number;
    memoryUsage: MemoryInfo;
  } {
    const totalDuration = this.metrics.reduce((sum, m) => sum + m.duration, 0);
    
    return {
      totalOperations: this.metrics.length,
      activeOperations: this.activeTrackers.size,
      averageOperationTime: this.metrics.length > 0 ? totalDuration / this.metrics.length : 0,
      memoryUsage: this.getMemoryUsage()
    };
  }

  private generateTrackerId(): string {
    return `perf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getMemoryUsage(): MemoryInfo {
    // Check if performance.memory is available (Chrome/Edge)
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      const memory = (performance as any).memory;
      return {
        usedJSHeapSize: memory.usedJSHeapSize || 0,
        totalJSHeapSize: memory.totalJSHeapSize || 0,
        jsHeapSizeLimit: memory.jsHeapSizeLimit || 0
      };
    }
    
    // Fallback for environments without performance.memory
    return {
      usedJSHeapSize: 0,
      totalJSHeapSize: 0,
      jsHeapSizeLimit: 0
    };
  }

  private getResourceUsage(): ResourceUsage {
    const memInfo = this.getMemoryUsage();
    
    return {
      heapUsed: memInfo.usedJSHeapSize,
      heapTotal: memInfo.totalJSHeapSize,
      external: 0 // Not available in browser environment
    };
  }

  private storeMetrics(metrics: PerformanceMetrics): void {
    this.metrics.push(metrics);
    
    // Limit memory usage by removing old metrics
    if (this.metrics.length > this.maxMetricsHistory) {
      this.metrics = this.metrics.slice(-this.maxMetricsHistory);
    }
  }

  private checkThresholds(metrics: PerformanceMetrics): void {
    const thresholds = this.thresholds.get(metrics.operationName);
    if (!thresholds) return;

    if (metrics.duration >= thresholds.critical) {
      console.error(`CRITICAL: Operation ${metrics.operationName} took ${metrics.duration}ms (threshold: ${thresholds.critical}ms)`);
      this.notifyThresholdExceeded(metrics);
    } else if (metrics.duration >= thresholds.warning) {
      console.warn(`WARNING: Operation ${metrics.operationName} took ${metrics.duration}ms (threshold: ${thresholds.warning}ms)`);
      this.notifyThresholdExceeded(metrics);
    }
  }

  private notifyThresholdExceeded(metrics: PerformanceMetrics): void {
    this.thresholdCallbacks.forEach(callback => {
      try {
        callback(metrics);
      } catch (error) {
        console.error('Error in threshold exceeded callback:', error);
      }
    });
  }

  private calculatePercentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;
    
    const index = Math.ceil(sortedArray.length * percentile) - 1;
    return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
  }
}

// Global performance monitor instance
export const performanceMonitor = new PerformanceMonitor();