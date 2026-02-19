/**
 * Player Compatibility Cache
 * 
 * Caches player compatibility matrices to improve performance
 * for repeated schedule generation operations
 */

import { Player } from '../models/Player';

export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
}

export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
  evictions: number;
}

export class CompatibilityCache {
  private cache = new Map<string, CacheEntry<any>>();
  private maxSize: number;
  private ttl: number; // Time to live in milliseconds
  private stats: CacheStats = {
    size: 0,
    hits: 0,
    misses: 0,
    hitRate: 0,
    evictions: 0
  };

  constructor(maxSize: number = 1000, ttl: number = 5 * 60 * 1000) {
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  /**
   * Get value from cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    const now = Date.now();

    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    // Check if entry has expired
    if (now - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      this.stats.size--;
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccessed = now;
    this.stats.hits++;
    this.updateHitRate();

    return entry.value;
  }

  /**
   * Set value in cache
   */
  set<T>(key: string, value: T): void {
    const now = Date.now();

    // Special case: if maxSize is 0, don't store anything
    if (this.maxSize === 0) {
      return;
    }

    // Check if we need to evict entries
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLeastRecentlyUsed();
    }

    const entry: CacheEntry<T> = {
      value,
      timestamp: now,
      accessCount: 1,
      lastAccessed: now
    };

    const wasExisting = this.cache.has(key);
    this.cache.set(key, entry);

    if (!wasExisting) {
      this.stats.size++;
    }
  }

  /**
   * Check if key exists in cache (without updating access stats)
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // Check if expired
    const now = Date.now();
    if (now - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      this.stats.size--;
      return false;
    }

    return true;
  }

  /**
   * Delete entry from cache
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.stats.size--;
    }
    return deleted;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
    this.stats.size = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Evict least recently used entry
   */
  private evictLeastRecentlyUsed(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.size--;
      this.stats.evictions++;
    }
  }

  /**
   * Update hit rate calculation
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  /**
   * Clean up expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    this.stats.size -= cleaned;
    return cleaned;
  }

  /**
   * Generate cache key for player compatibility
   */
  static generateCompatibilityKey(seasonId: string, playerId1: string, playerId2: string): string {
    // Ensure consistent ordering for bidirectional compatibility
    const [id1, id2] = [playerId1, playerId2].sort();
    return `compat:${seasonId}:${id1}:${id2}`;
  }

  /**
   * Generate cache key for player pairing count
   */
  static generatePairingCountKey(seasonId: string, playerId1: string, playerId2: string): string {
    // Ensure consistent ordering for bidirectional pairing counts
    const [id1, id2] = [playerId1, playerId2].sort();
    return `pairing:${seasonId}:${id1}:${id2}`;
  }

  /**
   * Generate cache key for player availability
   */
  static generateAvailabilityKey(weekId: string, playerId: string): string {
    return `avail:${weekId}:${playerId}`;
  }
}