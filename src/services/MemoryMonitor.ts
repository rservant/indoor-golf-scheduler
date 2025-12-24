/**
 * Memory Monitoring Service
 * 
 * Provides comprehensive memory monitoring, leak detection, and resource management
 * for the Indoor Golf Scheduler application.
 */

export interface MemoryInfo {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

export interface MemorySnapshot {
  timestamp: number;
  memoryInfo: MemoryInfo;
  activeObjects: number;
  gcCount?: number;
}

export interface MemoryThresholds {
  warning: number;      // Memory usage warning threshold (bytes)
  critical: number;     // Memory usage critical threshold (bytes)
  leakDetection: number; // Memory growth threshold for leak detection (bytes)
}

export interface MemoryPressureEvent {
  timestamp: number;
  memoryUsage: MemoryInfo;
  severity: 'warning' | 'critical';
  action: 'cleanup' | 'alert' | 'throttle';
}

export interface MemoryLeakDetection {
  detected: boolean;
  growthRate: number; // bytes per second
  duration: number;   // milliseconds
  snapshots: MemorySnapshot[];
}

export type MemoryPressureCallback = (event: MemoryPressureEvent) => void;
export type CleanupCallback = () => void;

/**
 * Memory Monitor Service
 * 
 * Monitors memory usage, detects leaks, and manages memory pressure
 */
export class MemoryMonitor {
  private snapshots: MemorySnapshot[] = [];
  private thresholds: MemoryThresholds;
  private pressureCallbacks: MemoryPressureCallback[] = [];
  private cleanupCallbacks: CleanupCallback[] = [];
  private monitoringInterval: number | null = null;
  private isMonitoring = false;
  private maxSnapshots = 1000; // Limit memory usage of monitoring itself
  private monitoringFrequency = 5000; // 5 seconds

  constructor(thresholds?: Partial<MemoryThresholds>) {
    this.thresholds = {
      warning: 100 * 1024 * 1024,    // 100MB
      critical: 200 * 1024 * 1024,   // 200MB
      leakDetection: 50 * 1024 * 1024, // 50MB growth
      ...thresholds
    };
  }

  /**
   * Start memory monitoring
   */
  startMonitoring(frequency: number = this.monitoringFrequency): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.monitoringFrequency = frequency;

    // Take initial snapshot
    this.takeSnapshot();

    // Set up periodic monitoring
    this.monitoringInterval = window.setInterval(() => {
      this.takeSnapshot();
      this.checkMemoryPressure();
      this.detectMemoryLeaks();
    }, frequency);

    console.log(`Memory monitoring started with ${frequency}ms frequency`);
  }

  /**
   * Stop memory monitoring
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    if (this.monitoringInterval !== null) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.isMonitoring = false;
    console.log('Memory monitoring stopped');
  }

  /**
   * Take a memory snapshot
   */
  takeSnapshot(): MemorySnapshot {
    const memoryInfo = this.getMemoryInfo();
    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
      memoryInfo,
      activeObjects: this.estimateActiveObjects()
    };

    this.snapshots.push(snapshot);

    // Limit snapshots to prevent memory growth
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots = this.snapshots.slice(-this.maxSnapshots);
    }

    return snapshot;
  }

  /**
   * Get current memory usage
   */
  getMemoryUsage(): MemoryInfo {
    return this.getMemoryInfo();
  }

  /**
   * Get memory usage history
   */
  getMemoryHistory(timeRange?: { start: number; end: number }): MemorySnapshot[] {
    if (!timeRange) {
      return [...this.snapshots];
    }

    return this.snapshots.filter(snapshot => 
      snapshot.timestamp >= timeRange.start && snapshot.timestamp <= timeRange.end
    );
  }

  /**
   * Set memory thresholds
   */
  setThresholds(thresholds: Partial<MemoryThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }

  /**
   * Register callback for memory pressure events
   */
  onMemoryPressure(callback: MemoryPressureCallback): void {
    this.pressureCallbacks.push(callback);
  }

  /**
   * Register cleanup callback
   */
  onCleanupNeeded(callback: CleanupCallback): void {
    this.cleanupCallbacks.push(callback);
  }

  /**
   * Trigger manual cleanup
   */
  triggerCleanup(): void {
    console.log('Triggering memory cleanup');
    
    this.cleanupCallbacks.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error('Error in cleanup callback:', error);
      }
    });

    // Force garbage collection if available
    if (typeof global !== 'undefined' && global.gc) {
      global.gc();
    }

    // Take snapshot after cleanup
    setTimeout(() => {
      this.takeSnapshot();
    }, 100);
  }

  /**
   * Detect memory leaks based on growth patterns
   */
  detectMemoryLeaks(): MemoryLeakDetection {
    if (this.snapshots.length < 10) {
      return {
        detected: false,
        growthRate: 0,
        duration: 0,
        snapshots: []
      };
    }

    // Analyze recent snapshots for consistent growth
    const recentSnapshots = this.snapshots.slice(-10);
    const timeSpan = recentSnapshots[recentSnapshots.length - 1].timestamp - recentSnapshots[0].timestamp;
    
    if (timeSpan < 30000) { // Need at least 30 seconds of data
      return {
        detected: false,
        growthRate: 0,
        duration: timeSpan,
        snapshots: recentSnapshots
      };
    }

    // Calculate memory growth rate
    const initialMemory = recentSnapshots[0].memoryInfo.usedJSHeapSize;
    const finalMemory = recentSnapshots[recentSnapshots.length - 1].memoryInfo.usedJSHeapSize;
    const memoryGrowth = finalMemory - initialMemory;
    const growthRate = (memoryGrowth / timeSpan) * 1000; // bytes per second

    // Check if growth exceeds threshold
    const leakDetected = memoryGrowth > this.thresholds.leakDetection && growthRate > 1024; // 1KB/s minimum

    if (leakDetected) {
      console.warn(`Memory leak detected: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB growth over ${(timeSpan / 1000).toFixed(1)}s`);
      console.warn(`Growth rate: ${(growthRate / 1024).toFixed(2)}KB/s`);
    }

    return {
      detected: leakDetected,
      growthRate,
      duration: timeSpan,
      snapshots: recentSnapshots
    };
  }

  /**
   * Get memory statistics
   */
  getMemoryStats(): {
    current: MemoryInfo;
    peak: MemoryInfo;
    average: MemoryInfo;
    growthRate: number;
    leakDetection: MemoryLeakDetection;
  } {
    const current = this.getMemoryInfo();
    
    if (this.snapshots.length === 0) {
      return {
        current,
        peak: current,
        average: current,
        growthRate: 0,
        leakDetection: this.detectMemoryLeaks()
      };
    }

    // Calculate peak memory usage
    const peak = this.snapshots.reduce((max, snapshot) => {
      const memory = snapshot.memoryInfo;
      return {
        usedJSHeapSize: Math.max(max.usedJSHeapSize, memory.usedJSHeapSize),
        totalJSHeapSize: Math.max(max.totalJSHeapSize, memory.totalJSHeapSize),
        jsHeapSizeLimit: Math.max(max.jsHeapSizeLimit, memory.jsHeapSizeLimit)
      };
    }, current);

    // Calculate average memory usage
    const totalUsed = this.snapshots.reduce((sum, snapshot) => sum + snapshot.memoryInfo.usedJSHeapSize, 0);
    const totalTotal = this.snapshots.reduce((sum, snapshot) => sum + snapshot.memoryInfo.totalJSHeapSize, 0);
    const totalLimit = this.snapshots.reduce((sum, snapshot) => sum + snapshot.memoryInfo.jsHeapSizeLimit, 0);
    
    const average = {
      usedJSHeapSize: totalUsed / this.snapshots.length,
      totalJSHeapSize: totalTotal / this.snapshots.length,
      jsHeapSizeLimit: totalLimit / this.snapshots.length
    };

    // Calculate growth rate
    let growthRate = 0;
    if (this.snapshots.length >= 2) {
      const first = this.snapshots[0];
      const last = this.snapshots[this.snapshots.length - 1];
      const timeSpan = last.timestamp - first.timestamp;
      const memoryGrowth = last.memoryInfo.usedJSHeapSize - first.memoryInfo.usedJSHeapSize;
      growthRate = timeSpan > 0 ? (memoryGrowth / timeSpan) * 1000 : 0; // bytes per second
    }

    return {
      current,
      peak,
      average,
      growthRate,
      leakDetection: this.detectMemoryLeaks()
    };
  }

  /**
   * Clear monitoring history
   */
  clearHistory(): void {
    this.snapshots = [];
  }

  /**
   * Check for memory pressure and trigger callbacks
   */
  private checkMemoryPressure(): void {
    const memoryInfo = this.getMemoryInfo();
    const usedMemory = memoryInfo.usedJSHeapSize;

    let event: MemoryPressureEvent | null = null;

    if (usedMemory >= this.thresholds.critical) {
      event = {
        timestamp: Date.now(),
        memoryUsage: memoryInfo,
        severity: 'critical',
        action: 'cleanup'
      };
      
      console.error(`CRITICAL: Memory usage ${(usedMemory / 1024 / 1024).toFixed(2)}MB exceeds critical threshold ${(this.thresholds.critical / 1024 / 1024).toFixed(2)}MB`);
      
      // Trigger automatic cleanup for critical memory pressure
      this.triggerCleanup();
      
    } else if (usedMemory >= this.thresholds.warning) {
      event = {
        timestamp: Date.now(),
        memoryUsage: memoryInfo,
        severity: 'warning',
        action: 'alert'
      };
      
      console.warn(`WARNING: Memory usage ${(usedMemory / 1024 / 1024).toFixed(2)}MB exceeds warning threshold ${(this.thresholds.warning / 1024 / 1024).toFixed(2)}MB`);
    }

    if (event) {
      this.pressureCallbacks.forEach(callback => {
        try {
          callback(event!);
        } catch (error) {
          console.error('Error in memory pressure callback:', error);
        }
      });
    }
  }

  /**
   * Get memory information from browser API
   */
  private getMemoryInfo(): MemoryInfo {
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

  /**
   * Estimate number of active objects (approximation)
   */
  private estimateActiveObjects(): number {
    // This is a rough estimation based on memory usage
    // In a real implementation, you might track object creation/destruction
    const memoryInfo = this.getMemoryInfo();
    return Math.floor(memoryInfo.usedJSHeapSize / 1024); // Rough estimate: 1KB per object
  }
}

// Global memory monitor instance
export const memoryMonitor = new MemoryMonitor();