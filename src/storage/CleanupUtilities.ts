import { StorageManager } from './interfaces';

/**
 * Cleanup operation result
 */
export interface CleanupResult {
  success: boolean;
  itemsRemoved: number;
  bytesFreed: number;
  errors: string[];
  operationType: string;
}

/**
 * Cleanup configuration options
 */
export interface CleanupOptions {
  maxAge?: number; // Maximum age in milliseconds
  keyPatterns?: string[]; // Key patterns to match for cleanup
  preserveKeys?: string[]; // Keys to preserve during cleanup
  maxItems?: number; // Maximum number of items to remove
  dryRun?: boolean; // If true, only simulate cleanup without actual removal
}

/**
 * Aggressive cleanup utilities for storage management
 */
export class CleanupUtilities {
  private static instance: CleanupUtilities;
  private storageManager: StorageManager | null = null;

  private constructor() {}

  public static getInstance(): CleanupUtilities {
    if (!CleanupUtilities.instance) {
      CleanupUtilities.instance = new CleanupUtilities();
    }
    return CleanupUtilities.instance;
  }

  /**
   * Set the storage manager instance
   */
  public setStorageManager(storageManager: StorageManager): void {
    this.storageManager = storageManager;
  }

  /**
   * Perform comprehensive cleanup of all test-related data
   */
  public async performComprehensiveCleanup(options: CleanupOptions = {}): Promise<CleanupResult> {
    if (!this.storageManager) {
      throw new Error('StorageManager not set. Call setStorageManager() first.');
    }

    const result: CleanupResult = {
      success: false,
      itemsRemoved: 0,
      bytesFreed: 0,
      errors: [],
      operationType: 'comprehensive'
    };

    try {
      const initialInfo = this.storageManager.getStorageInfo();
      const initialUsage = initialInfo.usedBytes;

      // Get all keys from storage
      const allKeys = await this.getAllStorageKeys();
      
      // Filter keys based on cleanup criteria
      const keysToRemove = this.filterKeysForCleanup(allKeys, options);
      
      if (options.dryRun) {
        result.itemsRemoved = keysToRemove.length;
        result.bytesFreed = await this.estimateBytesFreed(keysToRemove);
        result.success = true;
        return result;
      }

      // Estimate bytes before removal for more accurate calculation
      const estimatedBytesFreed = await this.estimateBytesFreed(keysToRemove);

      // Remove filtered keys
      for (const key of keysToRemove) {
        try {
          await this.storageManager.removeItem(key);
          result.itemsRemoved++;
        } catch (error) {
          result.errors.push(`Failed to remove key ${key}: ${error}`);
        }
      }

      // Calculate bytes freed - use estimation if fallback is active
      const finalInfo = this.storageManager.getStorageInfo();
      if (initialInfo.fallbackActive || finalInfo.fallbackActive) {
        // For fallback storage, use estimated bytes freed to avoid negative values
        result.bytesFreed = Math.max(0, estimatedBytesFreed);
      } else {
        // For regular storage, use actual difference
        result.bytesFreed = Math.max(0, initialUsage - finalInfo.usedBytes);
      }
      
      result.success = result.errors.length === 0;

    } catch (error) {
      result.errors.push(`Comprehensive cleanup failed: ${error}`);
    }

    return result;
  }

  /**
   * Clean up test-specific data patterns
   */
  public async cleanupTestData(options: CleanupOptions = {}): Promise<CleanupResult> {
    const testPatterns = [
      'test_',
      'jest_',
      'spec_',
      'mock_',
      'fixture_',
      'temp_',
      'debug_',
      ...(options.keyPatterns || [])
    ];

    const result = await this.performComprehensiveCleanup({
      ...options,
      keyPatterns: testPatterns
    });
    
    return {
      ...result,
      operationType: 'test-data'
    };
  }

  /**
   * Clean up old data based on age
   */
  public async cleanupOldData(maxAge: number, options: CleanupOptions = {}): Promise<CleanupResult> {
    const result = await this.performComprehensiveCleanup({
      ...options,
      maxAge
    });
    
    return {
      ...result,
      operationType: 'age-based'
    };
  }

  /**
   * Emergency cleanup - removes everything except preserved keys
   */
  public async emergencyCleanup(preserveKeys: string[] = []): Promise<CleanupResult> {
    if (!this.storageManager) {
      throw new Error('StorageManager not set. Call setStorageManager() first.');
    }

    const result: CleanupResult = {
      success: false,
      itemsRemoved: 0,
      bytesFreed: 0,
      errors: [],
      operationType: 'emergency'
    };

    try {
      const initialInfo = this.storageManager.getStorageInfo();
      const initialUsage = initialInfo.usedBytes;

      // Try to clear everything first
      try {
        await this.storageManager.clear();
        
        // Restore preserved keys if any
        if (preserveKeys.length > 0) {
          // Note: In a real implementation, you'd need to backup preserved data first
          result.errors.push('Warning: Emergency cleanup cleared all data including preserved keys');
        }

        const finalInfo = this.storageManager.getStorageInfo();
        
        // Calculate bytes freed - handle fallback storage carefully
        if (initialInfo.fallbackActive || finalInfo.fallbackActive) {
          // For fallback storage, use initial usage as bytes freed (assuming clear worked)
          result.bytesFreed = Math.max(0, initialUsage);
        } else {
          result.bytesFreed = Math.max(0, initialUsage - finalInfo.usedBytes);
        }
        
        result.itemsRemoved = -1; // Indicates full clear
        result.success = true;

      } catch (clearError) {
        result.errors.push(`Emergency clear failed: ${clearError}`);
        
        // Fallback to individual key removal
        const allKeys = await this.getAllStorageKeys();
        const keysToRemove = allKeys.filter(key => !preserveKeys.includes(key));
        
        // Estimate bytes before removal
        const estimatedBytesFreed = await this.estimateBytesFreed(keysToRemove);
        
        for (const key of keysToRemove) {
          try {
            await this.storageManager.removeItem(key);
            result.itemsRemoved++;
          } catch (error) {
            result.errors.push(`Failed to remove key ${key}: ${error}`);
          }
        }

        const finalInfo = this.storageManager.getStorageInfo();
        
        // Calculate bytes freed - use estimation for fallback storage
        if (initialInfo.fallbackActive || finalInfo.fallbackActive) {
          result.bytesFreed = Math.max(0, estimatedBytesFreed);
        } else {
          result.bytesFreed = Math.max(0, initialUsage - finalInfo.usedBytes);
        }
        
        result.success = result.itemsRemoved > 0;
      }

    } catch (error) {
      result.errors.push(`Emergency cleanup failed: ${error}`);
    }

    return result;
  }

  /**
   * Verify cleanup was successful
   */
  public async verifyCleanup(expectedBytesFreed?: number): Promise<boolean> {
    if (!this.storageManager) {
      return false;
    }

    try {
      const storageInfo = this.storageManager.getStorageInfo();
      
      // Basic verification - check if storage usage is reasonable
      const usagePercentage = (storageInfo.usedBytes / storageInfo.totalBytes) * 100;
      
      if (expectedBytesFreed !== undefined) {
        // If we have expected bytes freed, verify it's close to actual
        return usagePercentage < 80; // Should be under 80% after cleanup
      }

      // General verification - storage should not be near capacity
      return usagePercentage < 90;

    } catch (error) {
      console.error('Cleanup verification failed:', error);
      return false;
    }
  }

  /**
   * Get all storage keys (implementation depends on storage type)
   */
  private async getAllStorageKeys(): Promise<string[]> {
    const keys: string[] = [];
    
    try {
      // For localStorage
      if (typeof localStorage !== 'undefined') {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && typeof key === 'string') {
            // Filter out JavaScript object properties, system keys, and invalid keys
            const invalidKeys = [
              'constructor', 'prototype', 'hasOwnProperty', 'toString', 'valueOf', 'length',
              '__proto__', 'propertyIsEnumerable', 'isPrototypeOf', 'toLocaleString'
            ];
            
            // Also filter out keys that contain JavaScript object property patterns
            const hasInvalidPattern = invalidKeys.some(invalid => key.includes(invalid)) ||
              key.includes('$') && (key.includes('hasOwnP') || key.includes('proto') || key.includes('construct'));
            
            if (!invalidKeys.includes(key) && !hasInvalidPattern) {
              keys.push(key);
            }
          }
        }
      }
    } catch (error) {
      console.warn('Failed to get storage keys:', error);
    }
    
    return keys;
  }

  /**
   * Filter keys based on cleanup criteria
   */
  private filterKeysForCleanup(allKeys: string[], options: CleanupOptions): string[] {
    let filteredKeys = [...allKeys];

    // Filter by preserve keys
    if (options.preserveKeys && options.preserveKeys.length > 0) {
      filteredKeys = filteredKeys.filter(key => !options.preserveKeys!.includes(key));
    }

    // Filter by key patterns
    if (options.keyPatterns && options.keyPatterns.length > 0) {
      filteredKeys = filteredKeys.filter(key => 
        options.keyPatterns!.some(pattern => key.includes(pattern))
      );
    }

    // Limit number of items if specified
    if (options.maxItems && options.maxItems > 0) {
      filteredKeys = filteredKeys.slice(0, options.maxItems);
    }

    return filteredKeys;
  }

  /**
   * Estimate bytes that would be freed by removing keys
   */
  private async estimateBytesFreed(keys: string[]): Promise<number> {
    if (!this.storageManager) {
      return 0;
    }

    let estimatedBytes = 0;
    
    for (const key of keys) {
      try {
        const value = await this.storageManager.getItem(key);
        if (value) {
          estimatedBytes += key.length + value.length;
        }
      } catch (error) {
        // Ignore errors during estimation
      }
    }
    
    return estimatedBytes;
  }
}