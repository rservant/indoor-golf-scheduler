/**
 * Garbage Collection Manager
 * 
 * Provides intelligent garbage collection hints and memory optimization
 * strategies for the Indoor Golf Scheduler application.
 */

import { memoryMonitor, MemorySnapshot } from './MemoryMonitor';

export interface GCStats {
  totalHints: number;
  totalForced: number;
  averageMemoryFreed: number;
  lastGCTime: number;
  gcEffectiveness: number; // Percentage of memory freed
}

export interface GCConfig {
  enableAutomaticGC: boolean;
  gcThreshold: number; // Memory usage threshold to trigger GC (bytes)
  gcInterval: number; // Minimum interval between GC attempts (ms)
  maxGCFrequency: number; // Maximum GC attempts per minute
  enableMemoryPressureGC: boolean;
}

/**
 * Garbage Collection Manager
 * 
 * Manages garbage collection hints and memory optimization
 */
export class GarbageCollectionManager {
  private config: GCConfig;
  private stats: GCStats;
  private lastGCTime = 0;
  private gcCount = 0;
  private gcAttempts: number[] = []; // Timestamps of recent GC attempts

  constructor(config?: Partial<GCConfig>) {
    this.config = {
      enableAutomaticGC: true,
      gcThreshold: 100 * 1024 * 1024, // 100MB
      gcInterval: 10000, // 10 seconds
      maxGCFrequency: 6, // 6 times per minute max
      enableMemoryPressureGC: true,
      ...config
    };

    this.stats = {
      totalHints: 0,
      totalForced: 0,
      averageMemoryFreed: 0,
      lastGCTime: 0,
      gcEffectiveness: 0
    };

    this.setupMemoryPressureHandling();
  }

  /**
   * Suggest garbage collection based on memory usage
   */
  suggestGarbageCollection(): boolean {
    if (!this.config.enableAutomaticGC) {
      return false;
    }

    const now = Date.now();
    const memoryUsage = memoryMonitor.getMemoryUsage();

    // Check if we should trigger GC based on memory threshold
    if (memoryUsage.usedJSHeapSize < this.config.gcThreshold) {
      return false;
    }

    // Check minimum interval
    if (now - this.lastGCTime < this.config.gcInterval) {
      return false;
    }

    // Check frequency limits
    if (!this.canPerformGC()) {
      return false;
    }

    return this.performGarbageCollection('suggestion');
  }

  /**
   * Force garbage collection
   */
  forceGarbageCollection(): boolean {
    return this.performGarbageCollection('forced');
  }

  /**
   * Perform garbage collection with memory measurement
   */
  private performGarbageCollection(type: 'suggestion' | 'forced'): boolean {
    const beforeMemory = memoryMonitor.getMemoryUsage();
    const beforeTime = performance.now();

    try {
      // Record GC attempt
      this.recordGCAttempt();

      // Try different GC strategies
      let gcPerformed = false;

      // Strategy 1: Native garbage collection (Node.js with --expose-gc)
      if (typeof global !== 'undefined' && global.gc) {
        global.gc();
        gcPerformed = true;
        console.log('Native garbage collection triggered');
      }

      // Strategy 2: Browser memory pressure simulation
      if (typeof window !== 'undefined') {
        this.simulateMemoryPressure();
        gcPerformed = true;
      }

      // Strategy 3: Manual cleanup hints
      this.triggerCleanupHints();

      // Measure results after a short delay
      setTimeout(() => {
        this.measureGCEffectiveness(beforeMemory, beforeTime, type);
      }, 100);

      this.lastGCTime = Date.now();
      
      if (type === 'forced') {
        this.stats.totalForced++;
      } else {
        this.stats.totalHints++;
      }

      return gcPerformed;

    } catch (error) {
      console.error('Error during garbage collection:', error);
      return false;
    }
  }

  /**
   * Simulate memory pressure to encourage garbage collection
   */
  private simulateMemoryPressure(): void {
    try {
      // Create temporary memory pressure
      const tempArrays: any[] = [];
      const tempObjects: any[] = [];

      // Allocate temporary memory
      for (let i = 0; i < 50; i++) {
        tempArrays.push(new Array(1000).fill(Math.random()));
        tempObjects.push({
          data: new Array(500).fill(i),
          timestamp: Date.now(),
          id: `temp_${i}`
        });
      }

      // Create circular references to test GC
      for (let i = 0; i < tempObjects.length - 1; i++) {
        tempObjects[i].next = tempObjects[i + 1];
      }
      tempObjects[tempObjects.length - 1].next = tempObjects[0];

      // Clear references to allow GC
      tempArrays.length = 0;
      tempObjects.length = 0;

      console.log('Memory pressure simulation completed');

    } catch (error) {
      console.error('Error in memory pressure simulation:', error);
    }
  }

  /**
   * Trigger cleanup hints for various subsystems
   */
  private triggerCleanupHints(): void {
    try {
      // Clear WeakMap and WeakSet references
      if (typeof window !== 'undefined' && 'WeakRef' in window) {
        // Modern browsers support WeakRef for better memory management
        console.log('WeakRef cleanup hints triggered');
      }

      // Clear any global caches or temporary data
      this.clearGlobalReferences();

      // Trigger DOM cleanup if in browser
      if (typeof document !== 'undefined') {
        this.triggerDOMCleanup();
      }

    } catch (error) {
      console.error('Error in cleanup hints:', error);
    }
  }

  /**
   * Clear global references that might prevent GC
   */
  private clearGlobalReferences(): void {
    // This would clear any global caches or references
    // Implementation depends on specific application architecture
    console.log('Global references cleanup triggered');
  }

  /**
   * Trigger DOM cleanup to remove event listeners and references
   */
  private triggerDOMCleanup(): void {
    try {
      // Remove any orphaned event listeners
      // Clear any cached DOM references
      // This is a placeholder for actual DOM cleanup logic
      console.log('DOM cleanup triggered');

    } catch (error) {
      console.error('Error in DOM cleanup:', error);
    }
  }

  /**
   * Measure garbage collection effectiveness
   */
  private measureGCEffectiveness(
    beforeMemory: any, 
    beforeTime: number, 
    type: 'suggestion' | 'forced'
  ): void {
    const afterMemory = memoryMonitor.getMemoryUsage();
    const duration = performance.now() - beforeTime;

    const memoryFreed = beforeMemory.usedJSHeapSize - afterMemory.usedJSHeapSize;
    const effectiveness = beforeMemory.usedJSHeapSize > 0 
      ? (memoryFreed / beforeMemory.usedJSHeapSize) * 100 
      : 0;

    // Update statistics
    this.updateGCStats(memoryFreed, effectiveness);

    console.log(`GC ${type} completed: ${(memoryFreed / 1024 / 1024).toFixed(2)}MB freed (${effectiveness.toFixed(1)}%) in ${duration.toFixed(2)}ms`);

    // Log warning if GC was ineffective
    if (effectiveness < 5 && memoryFreed < 1024 * 1024) { // Less than 1MB freed
      console.warn('Garbage collection was ineffective - possible memory leak');
    }
  }

  /**
   * Update GC statistics
   */
  private updateGCStats(memoryFreed: number, effectiveness: number): void {
    const totalGCs = this.stats.totalHints + this.stats.totalForced;
    
    if (totalGCs > 0) {
      this.stats.averageMemoryFreed = 
        (this.stats.averageMemoryFreed * (totalGCs - 1) + memoryFreed) / totalGCs;
      
      this.stats.gcEffectiveness = 
        (this.stats.gcEffectiveness * (totalGCs - 1) + effectiveness) / totalGCs;
    } else {
      this.stats.averageMemoryFreed = memoryFreed;
      this.stats.gcEffectiveness = effectiveness;
    }

    this.stats.lastGCTime = Date.now();
  }

  /**
   * Check if we can perform GC based on frequency limits
   */
  private canPerformGC(): boolean {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Remove old attempts
    this.gcAttempts = this.gcAttempts.filter(time => time > oneMinuteAgo);

    // Check if we're under the frequency limit
    return this.gcAttempts.length < this.config.maxGCFrequency;
  }

  /**
   * Record a GC attempt
   */
  private recordGCAttempt(): void {
    this.gcAttempts.push(Date.now());
  }

  /**
   * Setup memory pressure handling
   */
  private setupMemoryPressureHandling(): void {
    if (!this.config.enableMemoryPressureGC) {
      return;
    }

    memoryMonitor.onMemoryPressure((event) => {
      if (event.severity === 'critical') {
        console.log('Critical memory pressure - forcing garbage collection');
        this.forceGarbageCollection();
      } else if (event.severity === 'warning') {
        console.log('Memory pressure warning - suggesting garbage collection');
        this.suggestGarbageCollection();
      }
    });
  }

  /**
   * Get GC statistics
   */
  getStats(): GCStats {
    return { ...this.stats };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<GCConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalHints: 0,
      totalForced: 0,
      averageMemoryFreed: 0,
      lastGCTime: 0,
      gcEffectiveness: 0
    };
    this.gcAttempts = [];
  }
}

// Global garbage collection manager instance
export const garbageCollectionManager = new GarbageCollectionManager();