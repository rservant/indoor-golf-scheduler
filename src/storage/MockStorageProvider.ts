import { StorageProvider } from './interfaces';

/**
 * Mock storage provider for graceful degradation
 * Provides logging and metrics collection without actual storage
 */
export class MockStorageProvider implements StorageProvider {
  private operationCount: number = 0;
  private capacity: number;
  private logOperations: boolean;
  private metrics: {
    setOperations: number;
    getOperations: number;
    removeOperations: number;
    clearOperations: number;
    totalOperations: number;
    startTime: Date;
  };

  constructor(capacity: number = 0, logOperations: boolean = true) {
    this.capacity = capacity;
    this.logOperations = logOperations;
    this.metrics = {
      setOperations: 0,
      getOperations: 0,
      removeOperations: 0,
      clearOperations: 0,
      totalOperations: 0,
      startTime: new Date()
    };
  }

  /**
   * Mock setItem operation - logs but doesn't store
   */
  public async setItem(key: string, value: string): Promise<void> {
    this.metrics.setOperations++;
    this.metrics.totalOperations++;
    this.operationCount++;

    if (this.logOperations) {
      console.warn(`[MockStorage] setItem called for key: ${key}, value length: ${value.length}`);
    }

    // Simulate successful operation without actual storage
    return Promise.resolve();
  }

  /**
   * Mock getItem operation - always returns null
   */
  public async getItem(key: string): Promise<string | null> {
    this.metrics.getOperations++;
    this.metrics.totalOperations++;
    this.operationCount++;

    if (this.logOperations) {
      console.warn(`[MockStorage] getItem called for key: ${key} - returning null (no storage)`);
    }

    // Always return null since we don't actually store anything
    return null;
  }

  /**
   * Mock removeItem operation - logs but doesn't remove
   */
  public async removeItem(key: string): Promise<void> {
    this.metrics.removeOperations++;
    this.metrics.totalOperations++;
    this.operationCount++;

    if (this.logOperations) {
      console.warn(`[MockStorage] removeItem called for key: ${key}`);
    }

    // Simulate successful operation
    return Promise.resolve();
  }

  /**
   * Mock clear operation - logs but doesn't clear
   */
  public async clear(): Promise<void> {
    this.metrics.clearOperations++;
    this.metrics.totalOperations++;
    this.operationCount++;

    if (this.logOperations) {
      console.warn(`[MockStorage] clear called - ${this.operationCount} total operations recorded`);
    }

    // Reset operation count on clear
    this.operationCount = 0;
    return Promise.resolve();
  }

  /**
   * Get mock storage capacity (always 0 for mock)
   */
  public getCapacity(): number {
    return this.capacity;
  }

  /**
   * Get operation count
   */
  public getOperationCount(): number {
    return this.operationCount;
  }

  /**
   * Get detailed metrics
   */
  public getMetrics(): {
    setOperations: number;
    getOperations: number;
    removeOperations: number;
    clearOperations: number;
    totalOperations: number;
    operationRate: number;
    uptime: number;
  } {
    const uptime = Date.now() - this.metrics.startTime.getTime();
    const operationRate = uptime > 0 ? (this.metrics.totalOperations / uptime) * 1000 : 0;

    return {
      ...this.metrics,
      operationRate,
      uptime
    };
  }

  /**
   * Enable or disable operation logging
   */
  public setLogging(enabled: boolean): void {
    this.logOperations = enabled;
  }

  /**
   * Reset all metrics
   */
  public resetMetrics(): void {
    this.metrics = {
      setOperations: 0,
      getOperations: 0,
      removeOperations: 0,
      clearOperations: 0,
      totalOperations: 0,
      startTime: new Date()
    };
    this.operationCount = 0;
  }

  /**
   * Log current metrics summary
   */
  public logMetricsSummary(): void {
    const metrics = this.getMetrics();
    console.log('[MockStorage] Metrics Summary:', {
      totalOperations: metrics.totalOperations,
      breakdown: {
        set: metrics.setOperations,
        get: metrics.getOperations,
        remove: metrics.removeOperations,
        clear: metrics.clearOperations
      },
      operationRate: `${metrics.operationRate.toFixed(2)} ops/sec`,
      uptime: `${(metrics.uptime / 1000).toFixed(2)}s`
    });
  }

  /**
   * Check if mock storage is being used (always true)
   */
  public isMockStorage(): boolean {
    return true;
  }
}