/**
 * Resource Cleanup Manager
 * 
 * Provides automatic resource cleanup, garbage collection hints, and memory pressure response
 * for the Indoor Golf Scheduler application.
 */

import { memoryMonitor, MemoryPressureEvent } from './MemoryMonitor';
import { resourcePoolManager } from './ResourcePool';

export interface CleanupTask {
  id: string;
  name: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  cleanup: () => void | Promise<void>;
  estimatedMemoryFreed: number; // bytes
  lastExecuted?: number;
  executionCount: number;
}

export interface CleanupStats {
  totalCleanupTasks: number;
  totalExecutions: number;
  totalMemoryFreed: number;
  lastCleanupTime: number;
  averageCleanupTime: number;
  failedCleanups: number;
}

export interface ResourceCleanupConfig {
  enableAutomaticCleanup: boolean;
  cleanupInterval: number; // milliseconds
  memoryPressureThreshold: number; // bytes
  maxCleanupTime: number; // milliseconds
  enableGarbageCollectionHints: boolean;
}

/**
 * Resource Cleanup Manager
 * 
 * Manages automatic resource cleanup and memory pressure response
 */
export class ResourceCleanupManager {
  private cleanupTasks: Map<string, CleanupTask> = new Map();
  private config: ResourceCleanupConfig;
  private stats: CleanupStats;
  private cleanupInterval: number | null = null;
  private isRunning = false;

  constructor(config?: Partial<ResourceCleanupConfig>) {
    this.config = {
      enableAutomaticCleanup: true,
      cleanupInterval: 30000, // 30 seconds
      memoryPressureThreshold: 150 * 1024 * 1024, // 150MB
      maxCleanupTime: 5000, // 5 seconds
      enableGarbageCollectionHints: true,
      ...config
    };

    this.stats = {
      totalCleanupTasks: 0,
      totalExecutions: 0,
      totalMemoryFreed: 0,
      lastCleanupTime: 0,
      averageCleanupTime: 0,
      failedCleanups: 0
    };

    this.setupMemoryPressureHandling();
  }

  /**
   * Start automatic resource cleanup
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    if (this.config.enableAutomaticCleanup) {
      this.cleanupInterval = window.setInterval(() => {
        this.performScheduledCleanup();
      }, this.config.cleanupInterval);
    }

    console.log('Resource cleanup manager started');
  }

  /**
   * Stop automatic resource cleanup
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.cleanupInterval !== null) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.isRunning = false;
    console.log('Resource cleanup manager stopped');
  }

  /**
   * Register a cleanup task
   */
  registerCleanupTask(task: Omit<CleanupTask, 'executionCount'>): void {
    // Validate task input
    if (!task.id || task.id.trim().length === 0) {
      throw new Error('Task ID cannot be empty or whitespace-only');
    }
    
    if (!task.name || task.name.trim().length === 0) {
      throw new Error('Task name cannot be empty or whitespace-only');
    }

    if (this.cleanupTasks.has(task.id)) {
      throw new Error(`Task with ID '${task.id}' already exists`);
    }

    const cleanupTask: CleanupTask = {
      ...task,
      executionCount: 0
    };

    this.cleanupTasks.set(task.id, cleanupTask);
    this.stats.totalCleanupTasks = this.cleanupTasks.size;

    console.log(`Registered cleanup task: ${task.name} (${task.priority} priority)`);
  }

  /**
   * Unregister a cleanup task
   */
  unregisterCleanupTask(taskId: string): boolean {
    const removed = this.cleanupTasks.delete(taskId);
    if (removed) {
      this.stats.totalCleanupTasks = this.cleanupTasks.size;
      console.log(`Unregistered cleanup task: ${taskId}`);
    }
    return removed;
  }

  /**
   * Execute cleanup tasks based on priority and memory pressure
   */
  async executeCleanup(priority?: CleanupTask['priority']): Promise<void> {
    const startTime = performance.now();
    let totalMemoryFreed = 0;
    let executedTasks = 0;
    let failedTasks = 0;

    // Get tasks to execute
    const tasksToExecute = Array.from(this.cleanupTasks.values())
      .filter(task => !priority || task.priority === priority)
      .sort((a, b) => this.getPriorityWeight(b.priority) - this.getPriorityWeight(a.priority));

    console.log(`Executing ${tasksToExecute.length} cleanup tasks${priority ? ` (${priority} priority)` : ''}`);

    // Execute tasks with timeout protection
    for (const task of tasksToExecute) {
      try {
        const taskStartTime = performance.now();
        
        // Execute with timeout
        await Promise.race([
          Promise.resolve(task.cleanup()),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Cleanup timeout')), this.config.maxCleanupTime)
          )
        ]);

        const taskDuration = performance.now() - taskStartTime;
        
        // Update task stats
        task.executionCount++;
        task.lastExecuted = Date.now();
        totalMemoryFreed += task.estimatedMemoryFreed;
        executedTasks++;

        console.log(`Cleanup task '${task.name}' completed in ${taskDuration.toFixed(2)}ms`);

      } catch (error) {
        console.error(`Cleanup task '${task.name}' failed:`, error);
        failedTasks++;
      }
    }

    // Update global stats
    const totalDuration = performance.now() - startTime;
    this.stats.totalExecutions += executedTasks;
    this.stats.totalMemoryFreed += totalMemoryFreed;
    this.stats.lastCleanupTime = Date.now();
    this.stats.failedCleanups += failedTasks;
    
    // Update average cleanup time
    if (this.stats.totalExecutions > 0) {
      this.stats.averageCleanupTime = 
        (this.stats.averageCleanupTime * (this.stats.totalExecutions - executedTasks) + totalDuration) / 
        this.stats.totalExecutions;
    }

    // Trigger garbage collection hint if enabled
    if (this.config.enableGarbageCollectionHints && totalMemoryFreed > 0) {
      this.triggerGarbageCollectionHint();
    }

    console.log(`Cleanup completed: ${executedTasks} tasks, ${(totalMemoryFreed / 1024 / 1024).toFixed(2)}MB freed, ${totalDuration.toFixed(2)}ms`);
  }

  /**
   * Force immediate cleanup of all tasks
   */
  async forceCleanup(): Promise<void> {
    console.log('Force cleanup initiated');
    await this.executeCleanup();
    
    // Additional aggressive cleanup
    this.clearResourcePools();
    this.triggerGarbageCollectionHint();
  }

  /**
   * Get cleanup statistics
   */
  getStats(): CleanupStats {
    return { ...this.stats };
  }

  /**
   * Get registered cleanup tasks
   */
  getCleanupTasks(): CleanupTask[] {
    return Array.from(this.cleanupTasks.values());
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ResourceCleanupConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Restart if interval changed and we're running
    if (this.isRunning && config.cleanupInterval) {
      this.stop();
      this.start();
    }
  }

  /**
   * Setup memory pressure handling
   */
  private setupMemoryPressureHandling(): void {
    memoryMonitor.onMemoryPressure((event: MemoryPressureEvent) => {
      this.handleMemoryPressure(event);
    });
  }

  /**
   * Handle memory pressure events
   */
  private async handleMemoryPressure(event: MemoryPressureEvent): Promise<void> {
    console.log(`Memory pressure detected (${event.severity}): ${(event.memoryUsage.usedJSHeapSize / 1024 / 1024).toFixed(2)}MB`);

    if (event.severity === 'critical') {
      // Execute all high and critical priority cleanup tasks immediately
      await this.executeCleanup('critical');
      await this.executeCleanup('high');
      
      // Force garbage collection
      this.triggerGarbageCollectionHint();
      
    } else if (event.severity === 'warning') {
      // Execute high priority cleanup tasks
      await this.executeCleanup('high');
    }
  }

  /**
   * Perform scheduled cleanup
   */
  private async performScheduledCleanup(): Promise<void> {
    const memoryUsage = memoryMonitor.getMemoryUsage();
    
    // Check if we need cleanup based on memory usage
    if (memoryUsage.usedJSHeapSize > this.config.memoryPressureThreshold) {
      await this.executeCleanup('medium');
    } else {
      // Regular low-priority cleanup
      await this.executeCleanup('low');
    }
  }

  /**
   * Get priority weight for sorting
   */
  private getPriorityWeight(priority: CleanupTask['priority']): number {
    switch (priority) {
      case 'critical': return 4;
      case 'high': return 3;
      case 'medium': return 2;
      case 'low': return 1;
      default: return 0;
    }
  }

  /**
   * Clear all resource pools
   */
  private clearResourcePools(): void {
    try {
      const poolStats = resourcePoolManager.getAllStats();
      let totalCleared = 0;
      
      for (const [poolName, stats] of Object.entries(poolStats)) {
        totalCleared += stats.currentAvailable;
      }
      
      resourcePoolManager.clearAll();
      console.log(`Cleared ${totalCleared} objects from resource pools`);
      
    } catch (error) {
      console.error('Error clearing resource pools:', error);
    }
  }

  /**
   * Trigger garbage collection hint
   */
  private triggerGarbageCollectionHint(): void {
    if (!this.config.enableGarbageCollectionHints) {
      return;
    }

    try {
      // Force garbage collection if available (Node.js with --expose-gc)
      if (typeof global !== 'undefined' && global.gc) {
        global.gc();
        console.log('Garbage collection triggered');
      }
      
      // Browser-specific hints
      if (typeof window !== 'undefined') {
        // Create memory pressure to encourage GC
        const tempArrays: any[] = [];
        for (let i = 0; i < 100; i++) {
          tempArrays.push(new Array(1000).fill(null));
        }
        tempArrays.length = 0; // Clear references
      }
      
    } catch (error) {
      console.error('Error triggering garbage collection:', error);
    }
  }
}

// Global resource cleanup manager instance
export const resourceCleanupManager = new ResourceCleanupManager();

// Register default cleanup tasks for the Indoor Golf Scheduler
export function registerDefaultCleanupTasks(): void {
  // Clear expired cache entries
  resourceCleanupManager.registerCleanupTask({
    id: 'clear-expired-cache',
    name: 'Clear Expired Cache Entries',
    priority: 'medium',
    cleanup: () => {
      // This would integrate with caching system when implemented
      console.log('Clearing expired cache entries');
    },
    estimatedMemoryFreed: 5 * 1024 * 1024 // 5MB
  });

  // Clean up temporary arrays and objects
  resourceCleanupManager.registerCleanupTask({
    id: 'cleanup-temp-objects',
    name: 'Cleanup Temporary Objects',
    priority: 'high',
    cleanup: () => {
      // Clear resource pools
      resourcePoolManager.clearAll();
    },
    estimatedMemoryFreed: 10 * 1024 * 1024 // 10MB
  });

  // Clear DOM event listeners and references
  resourceCleanupManager.registerCleanupTask({
    id: 'cleanup-dom-references',
    name: 'Cleanup DOM References',
    priority: 'low',
    cleanup: () => {
      // This would clean up any dangling DOM references
      console.log('Cleaning up DOM references');
    },
    estimatedMemoryFreed: 2 * 1024 * 1024 // 2MB
  });

  // Clear large data structures
  resourceCleanupManager.registerCleanupTask({
    id: 'cleanup-large-data',
    name: 'Cleanup Large Data Structures',
    priority: 'critical',
    cleanup: () => {
      // This would clean up large temporary data structures
      console.log('Cleaning up large data structures');
    },
    estimatedMemoryFreed: 20 * 1024 * 1024 // 20MB
  });
}