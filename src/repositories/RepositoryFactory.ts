/**
 * Repository Factory
 * 
 * Factory for creating optimized repository instances with shared
 * data access optimization infrastructure
 */

import { DataAccessOptimizer } from '../services/DataAccessOptimizer';
import { OptimizedPlayerRepository } from './OptimizedPlayerRepository';
import { OptimizedScheduleRepository } from './OptimizedScheduleRepository';
import { LocalSeasonRepository } from './SeasonRepository';
import { LocalStorageRepository } from './BaseRepository';

export interface RepositoryConfig {
  enableOptimization: boolean;
  cacheConfig?: {
    maxSize: number;
    ttl: number;
    strategy: 'LRU' | 'LFU' | 'TTL';
  };
  batchConfig?: {
    maxBatchSize: number;
    batchTimeout: number;
    enabled: boolean;
  };
}

export class RepositoryFactory {
  private static instance: RepositoryFactory;
  private optimizer: DataAccessOptimizer;
  private config: RepositoryConfig;

  private playerRepository?: OptimizedPlayerRepository;
  private scheduleRepository?: OptimizedScheduleRepository;
  private seasonRepository?: LocalSeasonRepository;

  private constructor(config: RepositoryConfig) {
    this.config = config;
    
    if (config.enableOptimization) {
      this.optimizer = new DataAccessOptimizer(
        config.cacheConfig || {
          maxSize: 1000,
          ttl: 5 * 60 * 1000,
          strategy: 'LRU'
        },
        config.batchConfig || {
          maxBatchSize: 10,
          batchTimeout: 50,
          enabled: true
        }
      );
    } else {
      // Create a no-op optimizer for consistency
      this.optimizer = new DataAccessOptimizer(
        { maxSize: 0, ttl: 0, strategy: 'LRU' },
        { maxBatchSize: 1, batchTimeout: 0, enabled: false }
      );
    }
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: RepositoryConfig): RepositoryFactory {
    if (!RepositoryFactory.instance) {
      RepositoryFactory.instance = new RepositoryFactory(
        config || {
          enableOptimization: true,
          cacheConfig: {
            maxSize: 1000,
            ttl: 5 * 60 * 1000,
            strategy: 'LRU'
          },
          batchConfig: {
            maxBatchSize: 10,
            batchTimeout: 50,
            enabled: true
          }
        }
      );
    }
    return RepositoryFactory.instance;
  }

  /**
   * Reset singleton instance (useful for testing)
   */
  static reset(): void {
    RepositoryFactory.instance = undefined as any;
  }

  /**
   * Get optimized player repository
   */
  getPlayerRepository(): OptimizedPlayerRepository {
    if (!this.playerRepository) {
      this.playerRepository = new OptimizedPlayerRepository(this.optimizer);
    }
    return this.playerRepository;
  }

  /**
   * Get optimized schedule repository
   */
  getScheduleRepository(): OptimizedScheduleRepository {
    if (!this.scheduleRepository) {
      this.scheduleRepository = new OptimizedScheduleRepository(this.optimizer);
    }
    return this.scheduleRepository;
  }

  /**
   * Get season repository (not optimized as seasons are typically small datasets)
   */
  getSeasonRepository(): LocalSeasonRepository {
    if (!this.seasonRepository) {
      this.seasonRepository = new LocalSeasonRepository();
    }
    return this.seasonRepository;
  }

  /**
   * Get shared data access optimizer
   */
  getOptimizer(): DataAccessOptimizer {
    return this.optimizer;
  }

  /**
   * Get comprehensive performance statistics across all repositories
   */
  getPerformanceStats() {
    const optimizerStats = this.optimizer.getStats();
    
    return {
      optimizer: optimizerStats,
      repositories: {
        player: this.playerRepository?.getPerformanceStats(),
        schedule: this.scheduleRepository?.getPerformanceStats()
      },
      summary: {
        totalCacheHits: optimizerStats.l1Cache.hits + optimizerStats.l2Cache.hits,
        totalCacheMisses: optimizerStats.l1Cache.misses + optimizerStats.l2Cache.misses,
        overallHitRate: this.calculateOverallHitRate(optimizerStats),
        avgQueryTime: optimizerStats.performance.avgQueryTime,
        slowQueries: optimizerStats.performance.slowQueries,
        totalQueries: optimizerStats.performance.totalQueries
      }
    };
  }

  /**
   * Warm up caches for commonly accessed data
   */
  async warmupCaches(seasonId?: string): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.playerRepository && seasonId) {
      promises.push(this.playerRepository.warmupCache(seasonId));
    }

    if (this.scheduleRepository) {
      promises.push(this.scheduleRepository.warmupCache(seasonId));
    }

    await Promise.all(promises);
  }

  /**
   * Clear all caches across repositories
   */
  async clearAllCaches(): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.playerRepository) {
      promises.push(this.playerRepository.clearCache());
    }

    if (this.scheduleRepository) {
      promises.push(this.scheduleRepository.clearCache());
    }

    await Promise.all(promises);
  }

  /**
   * Configure optimization settings at runtime
   */
  updateConfig(newConfig: Partial<RepositoryConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Note: In a production system, you might want to recreate the optimizer
    // with new settings, but that would require careful cache migration
    console.log('Repository configuration updated:', this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): RepositoryConfig {
    return { ...this.config };
  }

  /**
   * Health check for repository system
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: Record<string, any>;
  }> {
    const stats = this.getPerformanceStats();
    const details: Record<string, any> = {};

    // Check cache hit rates
    const hitRate = stats.summary.overallHitRate;
    details.cacheHitRate = hitRate;
    details.cacheStatus = hitRate > 0.7 ? 'good' : hitRate > 0.4 ? 'fair' : 'poor';

    // Check query performance
    const avgQueryTime = stats.summary.avgQueryTime;
    details.avgQueryTime = avgQueryTime;
    details.performanceStatus = avgQueryTime < 100 ? 'good' : avgQueryTime < 500 ? 'fair' : 'poor';

    // Check slow queries
    const slowQueryRate = stats.summary.totalQueries > 0 
      ? stats.summary.slowQueries / stats.summary.totalQueries 
      : 0;
    details.slowQueryRate = slowQueryRate;
    details.slowQueryStatus = slowQueryRate < 0.05 ? 'good' : slowQueryRate < 0.15 ? 'fair' : 'poor';

    // Determine overall status
    const statuses = [details.cacheStatus, details.performanceStatus, details.slowQueryStatus];
    const unhealthyCount = statuses.filter(s => s === 'poor').length;
    const degradedCount = statuses.filter(s => s === 'fair').length;

    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (unhealthyCount > 0) {
      status = 'unhealthy';
    } else if (degradedCount > 1) {
      status = 'degraded';
    } else {
      status = 'healthy';
    }

    return { status, details };
  }

  private calculateOverallHitRate(stats: any): number {
    const totalHits = stats.l1Cache.hits + stats.l2Cache.hits;
    const totalMisses = stats.l1Cache.misses + stats.l2Cache.misses;
    const total = totalHits + totalMisses;
    
    return total > 0 ? totalHits / total : 0;
  }
}