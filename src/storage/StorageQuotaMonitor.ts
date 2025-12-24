import { 
  StorageQuotaMonitor as IStorageQuotaMonitor,
  StorageUsage,
  QuotaStatus,
  StorageManager
} from './interfaces';

/**
 * Monitors storage usage and triggers cleanup operations when thresholds are exceeded
 */
export class StorageQuotaMonitor implements IStorageQuotaMonitor {
  private static instance: StorageQuotaMonitor;
  private cleanupTriggers: Map<number, () => void> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private storageManager: StorageManager | null = null;

  private constructor() {}

  public static getInstance(): StorageQuotaMonitor {
    if (!StorageQuotaMonitor.instance) {
      StorageQuotaMonitor.instance = new StorageQuotaMonitor();
    }
    return StorageQuotaMonitor.instance;
  }

  /**
   * Set the storage manager instance to monitor
   */
  public setStorageManager(storageManager: StorageManager): void {
    this.storageManager = storageManager;
  }

  /**
   * Get current storage usage statistics
   */
  public async getCurrentUsage(): Promise<StorageUsage> {
    if (!this.storageManager) {
      throw new Error('StorageManager not set. Call setStorageManager() first.');
    }

    const storageInfo = this.storageManager.getStorageInfo();
    const percentage = storageInfo.totalBytes > 0 
      ? (storageInfo.usedBytes / storageInfo.totalBytes) * 100 
      : 0;

    return {
      used: storageInfo.usedBytes,
      available: storageInfo.availableBytes,
      percentage: Math.round(percentage * 100) / 100 // Round to 2 decimal places
    };
  }

  /**
   * Check current quota status and determine recommended actions
   */
  public async checkQuotaStatus(): Promise<QuotaStatus> {
    const usage = await this.getCurrentUsage();
    
    const exceeded = usage.percentage >= 100;
    const nearLimit = usage.percentage >= 80;
    const withinLimits = usage.percentage < 80;

    let recommendedAction: 'none' | 'cleanup' | 'fallback' = 'none';
    
    if (exceeded) {
      recommendedAction = 'fallback';
    } else if (nearLimit) {
      recommendedAction = 'cleanup';
    }

    return {
      withinLimits,
      nearLimit,
      exceeded,
      recommendedAction
    };
  }

  /**
   * Register a cleanup trigger that fires when usage exceeds threshold
   */
  public registerCleanupTrigger(threshold: number, callback: () => void): void {
    if (threshold < 0 || threshold > 100) {
      throw new Error('Threshold must be between 0 and 100');
    }
    
    this.cleanupTriggers.set(threshold, callback);
  }

  /**
   * Start monitoring storage usage at specified interval
   */
  public startMonitoring(interval: number): void {
    if (interval <= 0) {
      throw new Error('Monitoring interval must be positive');
    }

    // Stop existing monitoring if running
    this.stopMonitoring();

    this.monitoringInterval = setInterval(async () => {
      try {
        await this.checkAndTriggerCleanup();
      } catch (error) {
        console.error('Error during storage monitoring:', error);
      }
    }, interval);
  }

  /**
   * Stop storage monitoring
   */
  public stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  /**
   * Check current usage and trigger cleanup callbacks if thresholds are exceeded
   */
  private async checkAndTriggerCleanup(): Promise<void> {
    if (!this.storageManager) {
      return;
    }

    const usage = await this.getCurrentUsage();
    
    // Sort thresholds in descending order to trigger highest threshold first
    const sortedThresholds = Array.from(this.cleanupTriggers.keys()).sort((a, b) => b - a);
    
    for (const threshold of sortedThresholds) {
      if (usage.percentage >= threshold) {
        const callback = this.cleanupTriggers.get(threshold);
        if (callback) {
          try {
            callback();
            // Only trigger the highest exceeded threshold
            break;
          } catch (error) {
            console.error(`Error executing cleanup trigger for threshold ${threshold}:`, error);
          }
        }
      }
    }
  }

  /**
   * Get all registered cleanup triggers
   */
  public getCleanupTriggers(): Map<number, () => void> {
    return new Map(this.cleanupTriggers);
  }

  /**
   * Clear all cleanup triggers
   */
  public clearCleanupTriggers(): void {
    this.cleanupTriggers.clear();
  }

  /**
   * Check if monitoring is currently active
   */
  public isMonitoring(): boolean {
    return this.monitoringInterval !== null;
  }
}