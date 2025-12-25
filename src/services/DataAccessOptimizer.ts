/**
 * Data Access Optimizer
 * 
 * Provides multi-level caching, query optimization, and batching strategies
 * for improved data access performance across all repositories
 */

import { CompatibilityCache, CacheEntry, CacheStats } from './CompatibilityCache';

export interface QueryBatch<T> {
  id: string;
  queries: Array<() => Promise<T>>;
  resolve: (results: T[]) => void;
  reject: (error: Error) => void;
  timestamp: number;
  resolvers?: Array<(result: T) => void>;
  rejecters?: Array<(error: Error) => void>;
}

export interface CacheConfig {
  maxSize: number;
  ttl: number;
  strategy: 'LRU' | 'LFU' | 'TTL';
}

export interface BatchConfig {
  maxBatchSize: number;
  batchTimeout: number;
  enabled: boolean;
}

export interface DataAccessStats {
  l1Cache: CacheStats;
  l2Cache: CacheStats;
  queryBatches: {
    total: number;
    avgBatchSize: number;
    avgLatency: number;
  };
  performance: {
    avgQueryTime: number;
    slowQueries: number;
    totalQueries: number;
  };
}

/**
 * Multi-level cache implementation with L1 (memory) and L2 (localStorage) tiers
 */
export class MultiLevelCache {
  private l1Cache: CompatibilityCache;
  private l2StorageKey: string;
  private config: CacheConfig;

  constructor(name: string, config: CacheConfig) {
    this.l1Cache = new CompatibilityCache(config.maxSize, config.ttl);
    this.l2StorageKey = `data_cache_l2_${name}`;
    this.config = config;
  }

  /**
   * Get value from cache (L1 first, then L2)
   */
  async get<T>(key: string): Promise<T | null> {
    // Try L1 cache first
    const l1Result = this.l1Cache.get<T>(key);
    if (l1Result !== null) {
      return l1Result;
    }

    // Try L2 cache (localStorage)
    const l2Result = this.getFromL2<T>(key);
    if (l2Result !== null) {
      // Promote to L1 cache
      this.l1Cache.set(key, l2Result);
      return l2Result;
    }

    return null;
  }

  /**
   * Set value in both cache levels
   */
  async set<T>(key: string, value: T): Promise<void> {
    // Set in L1 cache
    this.l1Cache.set(key, value);

    // Set in L2 cache
    this.setInL2(key, value);
  }

  /**
   * Check if key exists in either cache level
   */
  async has(key: string): Promise<boolean> {
    return this.l1Cache.has(key) || this.hasInL2(key);
  }

  /**
   * Delete from both cache levels
   */
  async delete(key: string): Promise<boolean> {
    const l1Deleted = this.l1Cache.delete(key);
    const l2Deleted = this.deleteFromL2(key);
    return l1Deleted || l2Deleted;
  }

  /**
   * Clear both cache levels
   */
  async clear(): Promise<void> {
    this.l1Cache.clear();
    this.clearL2();
  }

  /**
   * Get combined cache statistics
   */
  getStats(): { l1: CacheStats; l2: CacheStats } {
    return {
      l1: this.l1Cache.getStats(),
      l2: this.getL2Stats()
    };
  }

  /**
   * Invalidate cache entries matching pattern
   */
  async invalidatePattern(pattern: string): Promise<number> {
    let invalidated = 0;

    // Invalidate L1 cache
    const l1Stats = this.l1Cache.getStats();
    // Note: CompatibilityCache doesn't expose keys, so we clear all for now
    // In a production system, we'd need to track keys or use a different cache implementation
    if (pattern === '*') {
      this.l1Cache.clear();
      invalidated += l1Stats.size;
    }

    // Invalidate L2 cache
    invalidated += this.invalidateL2Pattern(pattern);

    return invalidated;
  }

  private getFromL2<T>(key: string): T | null {
    try {
      const l2Data = this.getL2Data();
      const entry = l2Data[key];
      
      if (!entry) return null;

      // Check if expired
      const now = Date.now();
      if (now - entry.timestamp > this.config.ttl) {
        delete l2Data[key];
        this.setL2Data(l2Data);
        return null;
      }

      return entry.value;
    } catch (error) {
      console.error('Error reading from L2 cache:', error);
      return null;
    }
  }

  private setInL2<T>(key: string, value: T): void {
    try {
      const l2Data = this.getL2Data();
      const now = Date.now();

      l2Data[key] = {
        value,
        timestamp: now,
        accessCount: 1,
        lastAccessed: now
      };

      this.setL2Data(l2Data);
    } catch (error) {
      console.error('Error writing to L2 cache:', error);
    }
  }

  private hasInL2(key: string): boolean {
    try {
      const l2Data = this.getL2Data();
      const entry = l2Data[key];
      
      if (!entry) return false;

      // Check if expired
      const now = Date.now();
      if (now - entry.timestamp > this.config.ttl) {
        delete l2Data[key];
        this.setL2Data(l2Data);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error checking L2 cache:', error);
      return false;
    }
  }

  private deleteFromL2(key: string): boolean {
    try {
      const l2Data = this.getL2Data();
      const existed = key in l2Data;
      delete l2Data[key];
      this.setL2Data(l2Data);
      return existed;
    } catch (error) {
      console.error('Error deleting from L2 cache:', error);
      return false;
    }
  }

  private clearL2(): void {
    try {
      localStorage.removeItem(this.l2StorageKey);
    } catch (error) {
      console.error('Error clearing L2 cache:', error);
    }
  }

  private getL2Data(): Record<string, CacheEntry<any>> {
    try {
      const data = localStorage.getItem(this.l2StorageKey);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error('Error parsing L2 cache data:', error);
      return {};
    }
  }

  private setL2Data(data: Record<string, CacheEntry<any>>): void {
    try {
      localStorage.setItem(this.l2StorageKey, JSON.stringify(data));
    } catch (error) {
      console.error('Error setting L2 cache data:', error);
    }
  }

  private getL2Stats(): CacheStats {
    try {
      const l2Data = this.getL2Data();
      const size = Object.keys(l2Data).length;
      
      return {
        size,
        hits: 0, // L2 doesn't track hits separately
        misses: 0,
        hitRate: 0,
        evictions: 0
      };
    } catch (error) {
      return {
        size: 0,
        hits: 0,
        misses: 0,
        hitRate: 0,
        evictions: 0
      };
    }
  }

  private invalidateL2Pattern(pattern: string): number {
    try {
      const l2Data = this.getL2Data();
      let invalidated = 0;

      if (pattern === '*') {
        invalidated = Object.keys(l2Data).length;
        this.clearL2();
      } else {
        // Simple pattern matching with proper escaping
        if (pattern === '') {
          // Empty pattern matches nothing
          return 0;
        }
        
        const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('\\*', '.*');
        const regex = new RegExp(escapedPattern);
        const keysToDelete = Object.keys(l2Data).filter(key => 
          regex.test(key)
        );
        
        keysToDelete.forEach(key => {
          delete l2Data[key];
          invalidated++;
        });

        if (invalidated > 0) {
          this.setL2Data(l2Data);
        }
      }

      return invalidated;
    } catch (error) {
      console.error('Error invalidating L2 cache pattern:', error);
      return 0;
    }
  }
}

/**
 * Query batching system for optimizing multiple concurrent queries
 */
export class QueryBatcher {
  private batches = new Map<string, QueryBatch<any>>();
  private config: BatchConfig;
  private stats = {
    totalBatches: 0,
    totalQueries: 0,
    avgBatchSize: 0,
    avgLatency: 0
  };

  constructor(config: BatchConfig) {
    this.config = config;
  }

  /**
   * Add query to batch or execute immediately if batching disabled
   */
  async batchQuery<T>(
    batchKey: string,
    query: () => Promise<T>
  ): Promise<T> {
    if (!this.config.enabled) {
      return query();
    }

    return new Promise<T>((resolve, reject) => {
      const existingBatch = this.batches.get(batchKey);
      
      if (existingBatch) {
        // Add to existing batch and track the index for this query
        const queryIndex = existingBatch.queries.length;
        existingBatch.queries.push(query);
        
        // Store the resolve/reject functions for this specific query
        if (!existingBatch.resolvers) {
          existingBatch.resolvers = [];
          existingBatch.rejecters = [];
        }
        if (!existingBatch.rejecters) {
          existingBatch.rejecters = [];
        }
        existingBatch.resolvers[queryIndex] = resolve;
        existingBatch.rejecters[queryIndex] = reject;
      } else {
        // Create new batch
        const batch: QueryBatch<T> = {
          id: batchKey,
          queries: [query],
          resolve: (results: T[]) => resolve(results[0]),
          reject: (error: Error) => reject(error),
          timestamp: Date.now(),
          resolvers: [resolve],
          rejecters: [reject]
        };
        
        this.batches.set(batchKey, batch);
        
        // Schedule batch execution
        setTimeout(() => {
          this.executeBatch(batchKey);
        }, this.config.batchTimeout);
      }
      
      // Execute immediately if batch is full
      const currentBatch = this.batches.get(batchKey);
      if (currentBatch && currentBatch.queries.length >= this.config.maxBatchSize) {
        this.executeBatch(batchKey);
      }
    });
  }

  /**
   * Execute a batch of queries
   */
  private async executeBatch(batchKey: string): Promise<void> {
    const batch = this.batches.get(batchKey);
    if (!batch) return;

    this.batches.delete(batchKey);
    
    const startTime = Date.now();
    
    try {
      // Execute all queries in parallel
      const results = await Promise.all(
        batch.queries.map(query => query())
      );
      
      const latency = Date.now() - startTime;
      this.updateStats(batch.queries.length, latency);
      
      // Resolve each query with its corresponding result
      if (batch.resolvers) {
        batch.resolvers.forEach((resolve, index) => {
          resolve(results[index]);
        });
      } else {
        // Fallback for single query batches
        batch.resolve(results);
      }
    } catch (error) {
      // Reject all queries in the batch
      if (batch.rejecters) {
        batch.rejecters.forEach(reject => {
          reject(error as Error);
        });
      } else {
        // Fallback for single query batches
        batch.reject(error as Error);
      }
    }
  }

  private updateStats(batchSize: number, latency: number): void {
    this.stats.totalBatches++;
    this.stats.totalQueries += batchSize;
    this.stats.avgBatchSize = this.stats.totalQueries / this.stats.totalBatches;
    this.stats.avgLatency = (this.stats.avgLatency * (this.stats.totalBatches - 1) + latency) / this.stats.totalBatches;
  }

  getStats() {
    return { ...this.stats };
  }
}

/**
 * Main data access optimizer that coordinates caching and batching
 */
export class DataAccessOptimizer {
  private caches = new Map<string, MultiLevelCache>();
  private batcher: QueryBatcher;
  private performanceStats = {
    avgQueryTime: 0,
    slowQueries: 0,
    totalQueries: 0
  };

  constructor(
    private defaultCacheConfig: CacheConfig = {
      maxSize: 1000,
      ttl: 5 * 60 * 1000, // 5 minutes
      strategy: 'LRU'
    },
    private batchConfig: BatchConfig = {
      maxBatchSize: 10,
      batchTimeout: 50, // 50ms
      enabled: true
    }
  ) {
    this.batcher = new QueryBatcher(batchConfig);
  }

  /**
   * Get or create cache for a specific domain
   */
  getCache(domain: string, config?: Partial<CacheConfig>): MultiLevelCache {
    if (!this.caches.has(domain)) {
      const cacheConfig = { ...this.defaultCacheConfig, ...config };
      this.caches.set(domain, new MultiLevelCache(domain, cacheConfig));
    }
    return this.caches.get(domain)!;
  }

  /**
   * Execute query with caching and performance tracking
   */
  async executeQuery<T>(
    cacheKey: string,
    query: () => Promise<T>,
    options: {
      cacheDomain?: string;
      batchKey?: string;
      skipCache?: boolean;
      ttlOverride?: number;
    } = {}
  ): Promise<T> {
    const startTime = Date.now();
    const cacheDomain = options.cacheDomain || 'default';
    const cache = this.getCache(cacheDomain);

    try {
      // Try cache first (unless skipped)
      if (!options.skipCache) {
        const cached = await cache.get<T>(cacheKey);
        if (cached !== null) {
          this.updatePerformanceStats(Date.now() - startTime);
          return cached;
        }
      }

      // Execute query (with batching if specified)
      let result: T;
      if (options.batchKey) {
        result = await this.batcher.batchQuery(options.batchKey, query);
      } else {
        result = await query();
      }

      // Cache result
      if (!options.skipCache) {
        await cache.set(cacheKey, result);
      }

      this.updatePerformanceStats(Date.now() - startTime);
      return result;
    } catch (error) {
      this.updatePerformanceStats(Date.now() - startTime);
      throw error;
    }
  }

  /**
   * Batch multiple queries together
   */
  async batchQueries<T>(
    queries: Array<{
      cacheKey: string;
      query: () => Promise<T>;
      cacheDomain?: string;
    }>,
    batchKey: string
  ): Promise<T[]> {
    return Promise.all(
      queries.map(({ cacheKey, query, cacheDomain }) =>
        this.executeQuery(cacheKey, query, cacheDomain ? { cacheDomain, batchKey } : { batchKey })
      )
    );
  }

  /**
   * Invalidate cache entries across all domains
   */
  async invalidateCache(pattern: string, domain?: string): Promise<number> {
    let totalInvalidated = 0;

    if (domain) {
      const cache = this.caches.get(domain);
      if (cache) {
        totalInvalidated += await cache.invalidatePattern(pattern);
      }
    } else {
      // Invalidate across all domains
      for (const cache of this.caches.values()) {
        totalInvalidated += await cache.invalidatePattern(pattern);
      }
    }

    return totalInvalidated;
  }

  /**
   * Get comprehensive statistics
   */
  getStats(): DataAccessStats {
    const cacheStats = Array.from(this.caches.entries()).reduce(
      (acc, [domain, cache]) => {
        const stats = cache.getStats();
        acc[domain] = stats;
        return acc;
      },
      {} as Record<string, { l1: CacheStats; l2: CacheStats }>
    );

    // Aggregate L1 and L2 stats
    const l1Totals = Object.values(cacheStats).reduce(
      (acc, stats) => ({
        size: acc.size + stats.l1.size,
        hits: acc.hits + stats.l1.hits,
        misses: acc.misses + stats.l1.misses,
        hitRate: 0, // Will calculate after
        evictions: acc.evictions + stats.l1.evictions
      }),
      { size: 0, hits: 0, misses: 0, hitRate: 0, evictions: 0 }
    );
    l1Totals.hitRate = l1Totals.hits + l1Totals.misses > 0 
      ? l1Totals.hits / (l1Totals.hits + l1Totals.misses) 
      : 0;

    const l2Totals = Object.values(cacheStats).reduce(
      (acc, stats) => ({
        size: acc.size + stats.l2.size,
        hits: acc.hits + stats.l2.hits,
        misses: acc.misses + stats.l2.misses,
        hitRate: 0, // Will calculate after
        evictions: acc.evictions + stats.l2.evictions
      }),
      { size: 0, hits: 0, misses: 0, hitRate: 0, evictions: 0 }
    );
    l2Totals.hitRate = l2Totals.hits + l2Totals.misses > 0 
      ? l2Totals.hits / (l2Totals.hits + l2Totals.misses) 
      : 0;

    return {
      l1Cache: l1Totals,
      l2Cache: l2Totals,
      queryBatches: {
        total: this.batcher.getStats().totalBatches,
        avgBatchSize: this.batcher.getStats().avgBatchSize,
        avgLatency: this.batcher.getStats().avgLatency
      },
      performance: { ...this.performanceStats }
    };
  }

  private updatePerformanceStats(queryTime: number): void {
    this.performanceStats.totalQueries++;
    this.performanceStats.avgQueryTime = 
      (this.performanceStats.avgQueryTime * (this.performanceStats.totalQueries - 1) + queryTime) / 
      this.performanceStats.totalQueries;
    
    if (queryTime > 1000) { // Queries over 1 second are considered slow
      this.performanceStats.slowQueries++;
    }
  }
}