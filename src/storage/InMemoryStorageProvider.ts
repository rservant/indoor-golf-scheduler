import { StorageProvider } from './interfaces';

/**
 * In-memory storage provider that implements the same API as localStorage
 * Includes capacity limits and quota simulation for CI environments
 */
export class InMemoryStorageProvider implements StorageProvider {
  private storage: Map<string, string> = new Map();
  private capacity: number;
  private usedBytes: number = 0;

  constructor(capacity: number = 1024 * 1024) { // Default 1MB capacity
    this.capacity = capacity;
  }

  /**
   * Set item in memory storage with quota checking
   */
  public async setItem(key: string, value: string): Promise<void> {
    const existingValue = this.storage.get(key);
    const existingSize = existingValue ? key.length + existingValue.length : 0;
    const newSize = key.length + value.length;
    const sizeDelta = newSize - existingSize;

    // Check if adding this item would exceed capacity
    if (this.usedBytes + sizeDelta > this.capacity) {
      throw new Error('QuotaExceededError: In-memory storage quota exceeded');
    }

    // Update storage and track usage
    this.storage.set(key, value);
    this.usedBytes += sizeDelta;
  }

  /**
   * Get item from memory storage
   */
  public async getItem(key: string): Promise<string | null> {
    return this.storage.get(key) || null;
  }

  /**
   * Remove item from memory storage
   */
  public async removeItem(key: string): Promise<void> {
    const existingValue = this.storage.get(key);
    if (existingValue) {
      const size = key.length + existingValue.length;
      this.storage.delete(key);
      this.usedBytes -= size;
    }
  }

  /**
   * Clear all items from memory storage
   */
  public async clear(): Promise<void> {
    this.storage.clear();
    this.usedBytes = 0;
  }

  /**
   * Get storage capacity
   */
  public getCapacity(): number {
    return this.capacity;
  }

  /**
   * Get current usage in bytes
   */
  public getUsedBytes(): number {
    return this.usedBytes;
  }

  /**
   * Get available bytes
   */
  public getAvailableBytes(): number {
    return Math.max(0, this.capacity - this.usedBytes);
  }

  /**
   * Get usage percentage
   */
  public getUsagePercentage(): number {
    return (this.usedBytes / this.capacity) * 100;
  }

  /**
   * Check if storage is near capacity (>80%)
   */
  public isNearCapacity(): boolean {
    return this.getUsagePercentage() > 80;
  }

  /**
   * Get all keys (for debugging/testing)
   */
  public getAllKeys(): string[] {
    return Array.from(this.storage.keys());
  }

  /**
   * Get storage statistics
   */
  public getStats(): {
    itemCount: number;
    usedBytes: number;
    availableBytes: number;
    capacity: number;
    usagePercentage: number;
  } {
    return {
      itemCount: this.storage.size,
      usedBytes: this.usedBytes,
      availableBytes: this.getAvailableBytes(),
      capacity: this.capacity,
      usagePercentage: this.getUsagePercentage()
    };
  }
}