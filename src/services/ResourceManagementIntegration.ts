/**
 * Resource Management Integration
 * 
 * Integrates all resource management components and provides a unified interface
 * for automatic resource cleanup, memory monitoring, and performance optimization.
 */

import { memoryMonitor } from './MemoryMonitor';
import { resourceCleanupManager, registerDefaultCleanupTasks } from './ResourceCleanupManager';
import { garbageCollectionManager } from './GarbageCollectionManager';
import { resourcePoolManager, createPlayerPool, createFoursomePool } from './ResourcePool';

export interface ResourceManagementConfig {
  enableMemoryMonitoring: boolean;
  enableAutomaticCleanup: boolean;
  enableGarbageCollection: boolean;
  enableResourcePools: boolean;
  monitoringFrequency: number;
  cleanupInterval: number;
  memoryThresholds: {
    warning: number;
    critical: number;
  };
}

export interface ResourceManagementStats {
  memoryStats: any;
  cleanupStats: any;
  gcStats: any;
  poolStats: any;
  isActive: boolean;
  uptime: number;
}

/**
 * Resource Management Integration Service
 * 
 * Provides unified resource management for the Indoor Golf Scheduler
 */
export class ResourceManagementIntegration {
  private config: ResourceManagementConfig;
  private isInitialized = false;
  private startTime = 0;

  constructor(config?: Partial<ResourceManagementConfig>) {
    this.config = {
      enableMemoryMonitoring: true,
      enableAutomaticCleanup: true,
      enableGarbageCollection: true,
      enableResourcePools: true,
      monitoringFrequency: 5000, // 5 seconds
      cleanupInterval: 30000, // 30 seconds
      memoryThresholds: {
        warning: 100 * 1024 * 1024, // 100MB
        critical: 200 * 1024 * 1024  // 200MB
      },
      ...config
    };
  }

  /**
   * Initialize resource management system
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.warn('Resource management already initialized');
      return;
    }

    console.log('Initializing resource management system...');
    this.startTime = Date.now();

    try {
      // Initialize memory monitoring
      if (this.config.enableMemoryMonitoring) {
        memoryMonitor.setThresholds({
          warning: this.config.memoryThresholds.warning,
          critical: this.config.memoryThresholds.critical,
          leakDetection: 50 * 1024 * 1024 // 50MB
        });
        memoryMonitor.startMonitoring(this.config.monitoringFrequency);
        console.log('Memory monitoring started');
      }

      // Initialize resource cleanup
      if (this.config.enableAutomaticCleanup) {
        resourceCleanupManager.updateConfig({
          enableAutomaticCleanup: true,
          cleanupInterval: this.config.cleanupInterval,
          memoryPressureThreshold: this.config.memoryThresholds.warning
        });
        
        registerDefaultCleanupTasks();
        resourceCleanupManager.start();
        console.log('Resource cleanup manager started');
      }

      // Initialize garbage collection management
      if (this.config.enableGarbageCollection) {
        garbageCollectionManager.updateConfig({
          enableAutomaticGC: true,
          gcThreshold: this.config.memoryThresholds.warning,
          enableMemoryPressureGC: true
        });
        console.log('Garbage collection manager initialized');
      }

      // Initialize resource pools
      if (this.config.enableResourcePools) {
        await this.initializeResourcePools();
        console.log('Resource pools initialized');
      }

      // Setup integration between components
      this.setupIntegration();

      this.isInitialized = true;
      console.log('Resource management system initialized successfully');

    } catch (error) {
      console.error('Failed to initialize resource management:', error);
      throw error;
    }
  }

  /**
   * Shutdown resource management system
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    console.log('Shutting down resource management system...');

    try {
      // Stop memory monitoring
      if (this.config.enableMemoryMonitoring) {
        memoryMonitor.stopMonitoring();
      }

      // Stop resource cleanup
      if (this.config.enableAutomaticCleanup) {
        resourceCleanupManager.stop();
      }

      // Clear resource pools
      if (this.config.enableResourcePools) {
        resourcePoolManager.clearAll();
      }

      // Force final cleanup
      await this.performFinalCleanup();

      this.isInitialized = false;
      console.log('Resource management system shut down');

    } catch (error) {
      console.error('Error during resource management shutdown:', error);
    }
  }

  /**
   * Get comprehensive resource management statistics
   */
  getStats(): ResourceManagementStats {
    return {
      memoryStats: this.config.enableMemoryMonitoring ? memoryMonitor.getMemoryStats() : null,
      cleanupStats: this.config.enableAutomaticCleanup ? resourceCleanupManager.getStats() : null,
      gcStats: this.config.enableGarbageCollection ? garbageCollectionManager.getStats() : null,
      poolStats: this.config.enableResourcePools ? resourcePoolManager.getAllStats() : null,
      isActive: this.isInitialized,
      uptime: this.startTime > 0 ? Date.now() - this.startTime : 0
    };
  }

  /**
   * Force immediate resource cleanup
   */
  async forceCleanup(): Promise<void> {
    console.log('Forcing immediate resource cleanup...');

    try {
      // Force cleanup manager execution
      if (this.config.enableAutomaticCleanup) {
        await resourceCleanupManager.forceCleanup();
      }

      // Force garbage collection
      if (this.config.enableGarbageCollection) {
        garbageCollectionManager.forceGarbageCollection();
      }

      // Clear resource pools
      if (this.config.enableResourcePools) {
        resourcePoolManager.clearAll();
      }

      console.log('Force cleanup completed');

    } catch (error) {
      console.error('Error during force cleanup:', error);
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ResourceManagementConfig>): void {
    this.config = { ...this.config, ...config };

    // Update component configurations
    if (this.isInitialized) {
      if (config.memoryThresholds && this.config.enableMemoryMonitoring) {
        memoryMonitor.setThresholds({
          warning: this.config.memoryThresholds.warning,
          critical: this.config.memoryThresholds.critical
        });
      }

      if (config.cleanupInterval && this.config.enableAutomaticCleanup) {
        resourceCleanupManager.updateConfig({
          cleanupInterval: this.config.cleanupInterval
        });
      }

      if (config.memoryThresholds && this.config.enableGarbageCollection) {
        garbageCollectionManager.updateConfig({
          gcThreshold: this.config.memoryThresholds.warning
        });
      }
    }
  }

  /**
   * Check system health
   */
  checkHealth(): {
    status: 'healthy' | 'warning' | 'critical';
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';

    if (!this.isInitialized) {
      issues.push('Resource management not initialized');
      status = 'critical';
      return { status, issues, recommendations };
    }

    // Check memory usage
    if (this.config.enableMemoryMonitoring) {
      const memoryStats = memoryMonitor.getMemoryStats();
      const currentMemory = memoryStats.current.usedJSHeapSize;

      if (currentMemory > this.config.memoryThresholds.critical) {
        issues.push(`Critical memory usage: ${(currentMemory / 1024 / 1024).toFixed(2)}MB`);
        status = 'critical';
        recommendations.push('Force immediate cleanup');
      } else if (currentMemory > this.config.memoryThresholds.warning) {
        issues.push(`High memory usage: ${(currentMemory / 1024 / 1024).toFixed(2)}MB`);
        if (status === 'healthy') status = 'warning';
        recommendations.push('Consider triggering cleanup');
      }

      // Check for memory leaks
      if (memoryStats.leakDetection.detected) {
        issues.push(`Memory leak detected: ${(memoryStats.leakDetection.growthRate / 1024).toFixed(2)}KB/s growth`);
        if (status === 'healthy') status = 'warning';
        recommendations.push('Investigate memory leak sources');
      }
    }

    // Check cleanup effectiveness
    if (this.config.enableAutomaticCleanup) {
      const cleanupStats = resourceCleanupManager.getStats();
      
      if (cleanupStats.failedCleanups > cleanupStats.totalExecutions * 0.1) {
        issues.push(`High cleanup failure rate: ${cleanupStats.failedCleanups}/${cleanupStats.totalExecutions}`);
        if (status === 'healthy') status = 'warning';
        recommendations.push('Review cleanup task implementations');
      }
    }

    // Check GC effectiveness
    if (this.config.enableGarbageCollection) {
      const gcStats = garbageCollectionManager.getStats();
      
      if (gcStats.gcEffectiveness < 10 && gcStats.totalHints > 5) {
        issues.push(`Low GC effectiveness: ${gcStats.gcEffectiveness.toFixed(1)}%`);
        if (status === 'healthy') status = 'warning';
        recommendations.push('Review memory allocation patterns');
      }
    }

    return { status, issues, recommendations };
  }

  /**
   * Initialize resource pools
   */
  private async initializeResourcePools(): Promise<void> {
    try {
      // Create player pool
      createPlayerPool();
      
      // Create foursome pool
      createFoursomePool();
      
      // Pre-warm pools
      const playerPool = resourcePoolManager.getPool('players');
      const foursomePool = resourcePoolManager.getPool('foursomes');
      
      if (playerPool) {
        playerPool.preWarm(25);
      }
      
      if (foursomePool) {
        foursomePool.preWarm(10);
      }

    } catch (error) {
      console.error('Error initializing resource pools:', error);
    }
  }

  /**
   * Setup integration between components
   */
  private setupIntegration(): void {
    // Register cleanup task for resource pools
    resourceCleanupManager.registerCleanupTask({
      id: 'clear-resource-pools',
      name: 'Clear Resource Pools',
      priority: 'medium',
      cleanup: () => {
        const stats = resourcePoolManager.getAllStats();
        let totalCleared = 0;
        
        for (const poolStats of Object.values(stats)) {
          totalCleared += poolStats.currentAvailable;
        }
        
        resourcePoolManager.clearAll();
        console.log(`Cleared ${totalCleared} objects from resource pools`);
      },
      estimatedMemoryFreed: 15 * 1024 * 1024 // 15MB
    });

    // Setup memory pressure response
    memoryMonitor.onMemoryPressure((event) => {
      console.log(`Memory pressure integration response: ${event.severity}`);
      
      if (event.severity === 'critical') {
        // Immediate aggressive cleanup
        this.forceCleanup();
      }
    });
  }

  /**
   * Perform final cleanup during shutdown
   */
  private async performFinalCleanup(): Promise<void> {
    try {
      // Force final cleanup
      await resourceCleanupManager.forceCleanup();
      
      // Force garbage collection
      garbageCollectionManager.forceGarbageCollection();
      
      // Clear all caches and pools
      resourcePoolManager.clearAll();
      
      console.log('Final cleanup completed');

    } catch (error) {
      console.error('Error during final cleanup:', error);
    }
  }
}

// Global resource management integration instance
export const resourceManagement = new ResourceManagementIntegration();

// Auto-initialize with default configuration
export async function initializeResourceManagement(config?: Partial<ResourceManagementConfig>): Promise<void> {
  if (config) {
    resourceManagement.updateConfig(config);
  }
  
  await resourceManagement.initialize();
}

// Auto-cleanup on page unload (browser environment)
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    resourceManagement.shutdown();
  });
}