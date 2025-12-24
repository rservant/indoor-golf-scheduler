import { 
  StorageManager as IStorageManager, 
  StorageInfo, 
  CIConfiguration,
  StorageProvider 
} from './interfaces';
import { EnvironmentDetector } from './EnvironmentDetector';
import { PersistenceFallback } from './PersistenceFallback';
import { CompressionUtils } from './CompressionUtils';
import { CIConfigurationManager } from './CIConfigurationManager';
import { StorageIsolationManager } from './StorageIsolationManager';

/**
 * Central storage manager with CI optimization capabilities
 */
export class StorageManager implements IStorageManager {
  private static instance: StorageManager;
  private environmentDetector: EnvironmentDetector;
  private persistenceFallback: PersistenceFallback;
  private ciConfigurationManager: CIConfigurationManager;
  private storageIsolationManager: StorageIsolationManager;
  private optimizationEnabled = false;
  private ciConfiguration: CIConfiguration | null = null;
  private compressionEnabled = false;

  private constructor() {
    this.environmentDetector = EnvironmentDetector.getInstance();
    this.persistenceFallback = new PersistenceFallback();
    this.ciConfigurationManager = CIConfigurationManager.getInstance();
    this.storageIsolationManager = StorageIsolationManager.getInstance();
    
    // Auto-enable optimization in CI environments
    if (this.environmentDetector.isCIEnvironment()) {
      const config = this.environmentDetector.getCIConfiguration();
      this.enableOptimization(config);
      
      // Enable isolation for parallel tests in CI
      this.storageIsolationManager.enableIsolation();
    }
  }

  public static getInstance(): StorageManager {
    if (!StorageManager.instance) {
      StorageManager.instance = new StorageManager();
    }
    return StorageManager.instance;
  }

  /**
   * Enable optimization with CI-specific configuration
   */
  public enableOptimization(config: CIConfiguration): void {
    this.optimizationEnabled = true;
    this.ciConfiguration = config;
    this.compressionEnabled = config.compressionEnabled;
  }

  /**
   * Set item in storage with optimization and operation filtering
   */
  public async setItem(key: string, value: string, operationType?: string): Promise<void> {
    // Filter non-essential operations in CI
    if (operationType && !this.ciConfigurationManager.isEssentialOperation(operationType)) {
      // Skip non-essential operations in CI
      return;
    }

    // Apply isolation if enabled
    const isolatedKey = this.storageIsolationManager.createIsolatedKey(key);

    try {
      let processedValue = value;
      
      // Apply compression if enabled
      if (this.compressionEnabled && CompressionUtils.shouldCompress(value)) {
        processedValue = CompressionUtils.compressData(value);
      }

      // Check if we should use fallback storage
      if (this.persistenceFallback.isActive()) {
        const activeStorage = this.persistenceFallback.getActiveStorage();
        const isolatedStorage = this.storageIsolationManager.createIsolatedStorageProvider(activeStorage);
        await isolatedStorage.setItem(key, processedValue);
        return;
      }

      // Try localStorage first, but check if it's available
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(isolatedKey, processedValue);
      } else {
        // localStorage not available, activate fallback and retry
        this.persistenceFallback.activate('storage_unavailable');
        const activeStorage = this.persistenceFallback.getActiveStorage();
        const isolatedStorage = this.storageIsolationManager.createIsolatedStorageProvider(activeStorage);
        await isolatedStorage.setItem(key, processedValue);
      }
    } catch (error) {
      await this.handleStorageError(error, key, value);
    }
  }

  /**
   * Get item from storage with decompression
   */
  public async getItem(key: string): Promise<string | null> {
    // Apply isolation if enabled
    const isolatedKey = this.storageIsolationManager.createIsolatedKey(key);

    try {
      let value: string | null;

      // Check if we should use fallback storage
      if (this.persistenceFallback.isActive()) {
        const activeStorage = this.persistenceFallback.getActiveStorage();
        const isolatedStorage = this.storageIsolationManager.createIsolatedStorageProvider(activeStorage);
        value = await isolatedStorage.getItem(key);
      } else if (typeof localStorage !== 'undefined') {
        value = localStorage.getItem(isolatedKey);
      } else {
        // localStorage not available, activate fallback and retry
        this.persistenceFallback.activate('storage_unavailable');
        const activeStorage = this.persistenceFallback.getActiveStorage();
        const isolatedStorage = this.storageIsolationManager.createIsolatedStorageProvider(activeStorage);
        value = await isolatedStorage.getItem(key);
      }

      if (value === null) {
        return null;
      }

      // Decompress if needed
      if (this.compressionEnabled && CompressionUtils.isCompressed(value)) {
        return CompressionUtils.decompressData(value);
      }

      return value;
    } catch (error) {
      // If getting item fails, try to activate fallback and retry once
      if (!this.persistenceFallback.isActive()) {
        try {
          this.persistenceFallback.activate('storage_unavailable');
          const activeStorage = this.persistenceFallback.getActiveStorage();
          const isolatedStorage = this.storageIsolationManager.createIsolatedStorageProvider(activeStorage);
          const value = await isolatedStorage.getItem(key);
          
          if (value && this.compressionEnabled && CompressionUtils.isCompressed(value)) {
            return CompressionUtils.decompressData(value);
          }
          
          return value;
        } catch (fallbackError) {
          console.warn(`Failed to get item ${key} from fallback:`, fallbackError);
          return null;
        }
      }
      
      console.warn(`Failed to get item ${key}:`, error);
      return null;
    }
  }

  /**
   * Remove item from storage
   */
  public async removeItem(key: string): Promise<void> {
    // Apply isolation if enabled
    const isolatedKey = this.storageIsolationManager.createIsolatedKey(key);

    try {
      if (this.persistenceFallback.isActive()) {
        const activeStorage = this.persistenceFallback.getActiveStorage();
        const isolatedStorage = this.storageIsolationManager.createIsolatedStorageProvider(activeStorage);
        await isolatedStorage.removeItem(key);
      } else if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(isolatedKey);
      } else {
        // localStorage not available, activate fallback and retry
        this.persistenceFallback.activate('storage_unavailable');
        const activeStorage = this.persistenceFallback.getActiveStorage();
        const isolatedStorage = this.storageIsolationManager.createIsolatedStorageProvider(activeStorage);
        await isolatedStorage.removeItem(key);
      }
    } catch (error) {
      console.warn(`Failed to remove item ${key}:`, error);
    }
  }

  /**
   * Clear all storage
   */
  public async clear(): Promise<void> {
    try {
      if (this.persistenceFallback.isActive()) {
        const activeStorage = this.persistenceFallback.getActiveStorage();
        const isolatedStorage = this.storageIsolationManager.createIsolatedStorageProvider(activeStorage);
        await isolatedStorage.clear();
      } else if (typeof localStorage !== 'undefined') {
        if (this.storageIsolationManager.isIsolationEnabled()) {
          // Clear only namespaced keys
          await this.storageIsolationManager.cleanupIsolation({
            setItem: async (key: string, value: string) => localStorage.setItem(key, value),
            getItem: async (key: string) => localStorage.getItem(key),
            removeItem: async (key: string) => localStorage.removeItem(key),
            clear: async () => localStorage.clear(),
            getCapacity: () => 5 * 1024 * 1024 // 5MB default
          });
        } else {
          localStorage.clear();
        }
      } else {
        // localStorage not available, activate fallback and retry
        this.persistenceFallback.activate('storage_unavailable');
        const activeStorage = this.persistenceFallback.getActiveStorage();
        const isolatedStorage = this.storageIsolationManager.createIsolatedStorageProvider(activeStorage);
        await isolatedStorage.clear();
      }
    } catch (error) {
      console.warn('Failed to clear storage:', error);
    }
  }

  /**
   * Get storage information and metrics
   */
  public getStorageInfo(): StorageInfo {
    const usedBytes = this.calculateUsedBytes();
    const totalBytes = this.getTotalCapacity();
    const availableBytes = Math.max(0, totalBytes - usedBytes);
    
    return {
      usedBytes,
      availableBytes,
      totalBytes,
      compressionRatio: this.calculateCompressionRatio(),
      fallbackActive: this.persistenceFallback.isActive()
    };
  }

  /**
   * Get current CI configuration
   */
  public getCIConfigurationModel() {
    return this.ciConfigurationManager.getCurrentConfiguration();
  }

  /**
   * Check if operation should be filtered
   */
  public isOperationFiltered(operationType: string): boolean {
    return !this.ciConfigurationManager.isEssentialOperation(operationType);
  }

  /**
   * Get test scenario specific configuration
   */
  public getTestScenarioConfiguration(scenarioType: 'unit' | 'integration' | 'e2e') {
    return this.ciConfigurationManager.getTestScenarioConfiguration(scenarioType);
  }

  /**
   * Enable storage isolation for parallel tests
   */
  public enableStorageIsolation(): void {
    this.storageIsolationManager.enableIsolation();
  }

  /**
   * Disable storage isolation
   */
  public disableStorageIsolation(): void {
    this.storageIsolationManager.disableIsolation();
  }

  /**
   * Get isolation configuration
   */
  public getIsolationConfig() {
    return this.storageIsolationManager.getIsolationConfig();
  }

  /**
   * Cleanup isolation for current process
   */
  public async cleanupIsolation(): Promise<void> {
    if (this.persistenceFallback.isActive()) {
      const activeStorage = this.persistenceFallback.getActiveStorage();
      await this.storageIsolationManager.cleanupIsolation(activeStorage);
    } else if (typeof localStorage !== 'undefined') {
      const localStorageProvider = {
        setItem: async (key: string, value: string) => localStorage.setItem(key, value),
        getItem: async (key: string) => localStorage.getItem(key),
        removeItem: async (key: string) => localStorage.removeItem(key),
        clear: async () => localStorage.clear(),
        getCapacity: () => 5 * 1024 * 1024
      };
      await this.storageIsolationManager.cleanupIsolation(localStorageProvider);
    }
  }

  /**
   * Handle storage errors and activate fallbacks
   */
  private async handleStorageError(error: any, key: string, value: string): Promise<void> {
    const errorMessage = error?.message || String(error);
    
    // Apply compression if enabled (same as in setItem)
    let processedValue = value;
    if (this.compressionEnabled && CompressionUtils.shouldCompress(value)) {
      processedValue = CompressionUtils.compressData(value);
    }
    
    // Check if it's a localStorage unavailable error
    if (errorMessage.includes('localStorage is not available')) {
      console.warn('localStorage not available, activating fallback storage');
      this.persistenceFallback.activate('storage_unavailable');
      
      // Retry with fallback storage
      if (this.persistenceFallback.isActive()) {
        const activeStorage = this.persistenceFallback.getActiveStorage();
        const isolatedStorage = this.storageIsolationManager.createIsolatedStorageProvider(activeStorage);
        await isolatedStorage.setItem(key, processedValue);
        return;
      }
    }
    
    // Check if it's a quota exceeded error
    if (this.isQuotaError(errorMessage)) {
      console.warn('Storage quota exceeded, activating fallback storage');
      this.persistenceFallback.activate('quota_exceeded');
      
      // Retry with fallback storage
      if (this.persistenceFallback.isActive()) {
        const activeStorage = this.persistenceFallback.getActiveStorage();
        const isolatedStorage = this.storageIsolationManager.createIsolatedStorageProvider(activeStorage);
        await isolatedStorage.setItem(key, processedValue);
        return;
      }
    }

    // If fallback also fails or other error, log and throw
    console.error(`Storage operation failed for key ${key}:`, error);
    throw error;
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
   * Determine if data should be compressed
   */
  private shouldCompress(data: string): boolean {
    return CompressionUtils.shouldCompress(data);
  }

  /**
   * Calculate used storage bytes
   */
  private calculateUsedBytes(): number {
    let totalBytes = 0;
    
    try {
      if (this.persistenceFallback.isActive()) {
        // For fallback storage, we'll estimate based on active storage capacity
        const activeStorage = this.persistenceFallback.getActiveStorage();
        const capacity = activeStorage.getCapacity();
        // Estimate 50% usage for fallback storage
        return Math.floor(capacity * 0.5);
      }

      // Calculate localStorage usage if available
      if (typeof localStorage !== 'undefined') {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key) {
            const value = localStorage.getItem(key);
            if (value) {
              totalBytes += key.length + value.length;
            }
          }
        }
      } else {
        // localStorage not available, return 0
        return 0;
      }
    } catch (error) {
      console.warn('Failed to calculate storage usage:', error);
    }
    
    return totalBytes;
  }

  /**
   * Get total storage capacity
   */
  private getTotalCapacity(): number {
    if (this.ciConfiguration) {
      return this.ciConfiguration.maxStorageSize;
    }
    
    // Default localStorage limit (5MB)
    return 5 * 1024 * 1024;
  }

  /**
   * Calculate compression ratio
   */
  private calculateCompressionRatio(): number {
    // This is a simplified calculation
    // In a real implementation, you'd track original vs compressed sizes
    return this.compressionEnabled ? 0.7 : 1.0;
  }
}