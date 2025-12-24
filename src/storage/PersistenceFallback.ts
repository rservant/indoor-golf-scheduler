import { PersistenceFallback as IPersistenceFallback, FallbackReason, StorageProvider } from './interfaces';
import { InMemoryStorageProvider } from './InMemoryStorageProvider';
import { MockStorageProvider } from './MockStorageProvider';

/**
 * Coordinates fallback storage mechanisms with automatic activation on quota errors
 * Manages fallback chain and provides graceful degradation
 */
export class PersistenceFallback implements IPersistenceFallback {
  private active = false;
  private activeStorage: StorageProvider | null = null;
  private fallbackChain: StorageProvider[] = [];
  private currentFallbackIndex = -1;
  private activationHistory: Array<{
    reason: FallbackReason;
    timestamp: Date;
    storageType: string;
  }> = [];

  constructor() {
    this.initializeFallbackChain();
  }

  /**
   * Initialize the fallback chain with available storage providers
   */
  private initializeFallbackChain(): void {
    // Create fallback chain: InMemory -> Mock
    this.fallbackChain = [
      new InMemoryStorageProvider(1024 * 1024), // 1MB in-memory storage
      new MockStorageProvider(0, true) // Mock storage with logging
    ];
  }

  /**
   * Activate fallback storage for the given reason
   */
  public activate(reason: FallbackReason): void {
    if (this.active && this.currentFallbackIndex >= 0) {
      // Already active, try to move to next fallback in chain
      this.activateNextFallback(reason);
      return;
    }

    // First activation - start with first fallback
    this.currentFallbackIndex = 0;
    this.activeStorage = this.fallbackChain[0];
    this.active = true;

    // Record activation
    this.recordActivation(reason, this.getStorageTypeName(this.activeStorage));

    console.warn(`[PersistenceFallback] Activated fallback storage due to: ${reason}`);
    console.warn(`[PersistenceFallback] Using: ${this.getStorageTypeName(this.activeStorage)}`);
  }

  /**
   * Activate the next fallback in the chain
   */
  private activateNextFallback(reason: FallbackReason): void {
    if (this.currentFallbackIndex >= this.fallbackChain.length - 1) {
      console.error('[PersistenceFallback] No more fallback options available');
      return;
    }

    this.currentFallbackIndex++;
    this.activeStorage = this.fallbackChain[this.currentFallbackIndex];

    // Record activation
    this.recordActivation(reason, this.getStorageTypeName(this.activeStorage));

    console.warn(`[PersistenceFallback] Escalated to next fallback: ${this.getStorageTypeName(this.activeStorage)}`);
  }

  /**
   * Check if fallback is currently active
   */
  public isActive(): boolean {
    return this.active;
  }

  /**
   * Get the currently active storage provider
   */
  public getActiveStorage(): StorageProvider {
    if (!this.activeStorage) {
      throw new Error('No active fallback storage provider');
    }
    return this.activeStorage;
  }

  /**
   * Get the complete fallback chain
   */
  public getFallbackChain(): StorageProvider[] {
    return [...this.fallbackChain];
  }

  /**
   * Get the current fallback level (0-based index)
   */
  public getCurrentFallbackLevel(): number {
    return this.currentFallbackIndex;
  }

  /**
   * Check if we're at the last fallback option
   */
  public isAtLastFallback(): boolean {
    return this.currentFallbackIndex >= this.fallbackChain.length - 1;
  }

  /**
   * Attempt to handle storage error and activate appropriate fallback
   */
  public async handleStorageError(error: any, operation: string, key?: string): Promise<void> {
    const errorMessage = error?.message || String(error);
    let reason: FallbackReason;

    // Determine fallback reason based on error
    if (this.isQuotaError(errorMessage)) {
      reason = 'quota_exceeded';
    } else if (this.isPermissionError(errorMessage)) {
      reason = 'permission_denied';
    } else {
      reason = 'storage_unavailable';
    }

    console.warn(`[PersistenceFallback] Storage error during ${operation}${key ? ` for key ${key}` : ''}:`, errorMessage);

    // If already at last fallback, log critical error
    if (this.active && this.isAtLastFallback()) {
      console.error('[PersistenceFallback] All fallback options exhausted');
      throw new Error(`Storage completely unavailable: ${errorMessage}`);
    }

    // Activate or escalate fallback
    this.activate(reason);
  }

  /**
   * Reset fallback to inactive state
   */
  public reset(): void {
    this.active = false;
    this.activeStorage = null;
    this.currentFallbackIndex = -1;
    console.log('[PersistenceFallback] Reset to inactive state');
  }

  /**
   * Get activation history for debugging
   */
  public getActivationHistory(): Array<{
    reason: FallbackReason;
    timestamp: Date;
    storageType: string;
  }> {
    return [...this.activationHistory];
  }

  /**
   * Get fallback statistics
   */
  public getStats(): {
    isActive: boolean;
    currentLevel: number;
    totalLevels: number;
    activationCount: number;
    lastActivation: Date | null;
  } {
    return {
      isActive: this.active,
      currentLevel: this.currentFallbackIndex,
      totalLevels: this.fallbackChain.length,
      activationCount: this.activationHistory.length,
      lastActivation: this.activationHistory.length > 0 
        ? this.activationHistory[this.activationHistory.length - 1].timestamp 
        : null
    };
  }

  /**
   * Record fallback activation for metrics
   */
  private recordActivation(reason: FallbackReason, storageType: string): void {
    this.activationHistory.push({
      reason,
      timestamp: new Date(),
      storageType
    });
  }

  /**
   * Get human-readable storage type name
   */
  private getStorageTypeName(storage: StorageProvider): string {
    if (storage instanceof InMemoryStorageProvider) {
      return 'InMemoryStorage';
    } else if (storage instanceof MockStorageProvider) {
      return 'MockStorage';
    }
    return 'UnknownStorage';
  }

  /**
   * Check if error is related to storage quota
   */
  private isQuotaError(errorMessage: string): boolean {
    const quotaErrorPatterns = [
      'QuotaExceededError',
      'NS_ERROR_DOM_QUOTA_REACHED',
      'quota exceeded',
      'storage quota',
      'not enough storage'
    ];
    
    return quotaErrorPatterns.some(pattern => 
      errorMessage.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  /**
   * Check if error is related to permissions
   */
  private isPermissionError(errorMessage: string): boolean {
    const permissionErrorPatterns = [
      'permission denied',
      'access denied',
      'security error',
      'not allowed'
    ];
    
    return permissionErrorPatterns.some(pattern => 
      errorMessage.toLowerCase().includes(pattern.toLowerCase())
    );
  }
}