/**
 * Optimized Schedule Repository
 * 
 * Enhanced schedule repository with multi-level caching, query optimization,
 * and efficient data structures for large datasets
 */

import { Schedule, ScheduleModel } from '../models/Schedule';
import { LocalScheduleRepository, ScheduleCreateData, ScheduleRepository, ScheduleStatus } from './ScheduleRepository';
import { DataAccessOptimizer } from '../services/DataAccessOptimizer';

export class OptimizedScheduleRepository extends LocalScheduleRepository implements ScheduleRepository {
  private optimizer: DataAccessOptimizer;
  private readonly CACHE_DOMAIN = 'schedules';

  constructor(optimizer?: DataAccessOptimizer) {
    super();
    this.optimizer = optimizer || new DataAccessOptimizer(
      {
        maxSize: 500, // Schedules are larger objects
        ttl: 15 * 60 * 1000, // 15 minutes TTL
        strategy: 'LRU'
      },
      {
        maxBatchSize: 10,
        batchTimeout: 50,
        enabled: true
      }
    );
  }

  /**
   * Optimized findById with caching
   */
  async findById(id: string): Promise<Schedule | null> {
    const cacheKey = `schedule:${id}`;
    
    return this.optimizer.executeQuery(
      cacheKey,
      () => super.findById(id),
      { cacheDomain: this.CACHE_DOMAIN }
    );
  }

  /**
   * Optimized findByWeekId with caching
   */
  async findByWeekId(weekId: string): Promise<Schedule | null> {
    const cacheKey = `schedule:week:${weekId}`;
    
    return this.optimizer.executeQuery(
      cacheKey,
      () => super.findByWeekId(weekId),
      { cacheDomain: this.CACHE_DOMAIN }
    );
  }

  /**
   * Optimized findBySeasonId with caching and efficient filtering
   */
  async findBySeasonId(seasonId: string): Promise<Schedule[]> {
    const cacheKey = `schedules:season:${seasonId}`;
    
    return this.optimizer.executeQuery(
      cacheKey,
      async () => {
        // Use efficient filtering on cached all schedules if available
        const cache = this.optimizer.getCache(this.CACHE_DOMAIN);
        const allSchedules = await cache.get<Schedule[]>('schedules:all');
        
        if (allSchedules) {
          return allSchedules.filter(schedule => schedule.weekId.includes(seasonId));
        }
        
        // Fallback to base implementation
        return super.findBySeasonId(seasonId);
      },
      { cacheDomain: this.CACHE_DOMAIN }
    );
  }

  /**
   * Optimized findAll with caching
   */
  async findAll(): Promise<Schedule[]> {
    const cacheKey = 'schedules:all';
    
    return this.optimizer.executeQuery(
      cacheKey,
      () => super.findAll(),
      { 
        cacheDomain: this.CACHE_DOMAIN,
        ttlOverride: 5 * 60 * 1000 // Shorter TTL for all schedules
      }
    );
  }

  /**
   * Batch multiple schedule lookups efficiently
   */
  async findByWeekIds(weekIds: string[]): Promise<(Schedule | null)[]> {
    const queries = weekIds.map(weekId => ({
      cacheKey: `schedule:week:${weekId}`,
      query: () => super.findByWeekId(weekId),
      cacheDomain: this.CACHE_DOMAIN
    }));

    return this.optimizer.batchQueries(queries, `schedules:batch:${Date.now()}`);
  }

  /**
   * Optimized findRecent with caching
   */
  async findRecent(limit: number = 10): Promise<Schedule[]> {
    const cacheKey = `schedules:recent:${limit}`;
    
    return this.optimizer.executeQuery(
      cacheKey,
      () => super.findRecent(limit),
      { 
        cacheDomain: this.CACHE_DOMAIN,
        ttlOverride: 2 * 60 * 1000 // Shorter TTL for recent schedules
      }
    );
  }

  /**
   * Optimized findByDateRange with caching
   */
  async findByDateRange(startDate: Date, endDate: Date): Promise<Schedule[]> {
    const cacheKey = `schedules:range:${startDate.getTime()}:${endDate.getTime()}`;
    
    return this.optimizer.executeQuery(
      cacheKey,
      () => super.findByDateRange(startDate, endDate),
      { cacheDomain: this.CACHE_DOMAIN }
    );
  }

  /**
   * Batch query for multiple date ranges
   */
  async findByDateRanges(
    ranges: Array<{ start: Date; end: Date; label?: string }>
  ): Promise<Record<string, Schedule[]>> {
    const queries = ranges.map((range, index) => ({
      cacheKey: `schedules:range:${range.start.getTime()}:${range.end.getTime()}`,
      query: () => super.findByDateRange(range.start, range.end),
      cacheDomain: this.CACHE_DOMAIN
    }));

    const results = await this.optimizer.batchQueries(queries, `schedules:ranges:${Date.now()}`);
    
    return ranges.reduce((acc, range, index) => {
      const key = range.label || `range_${index}`;
      acc[key] = results[index];
      return acc;
    }, {} as Record<string, Schedule[]>);
  }

  /**
   * Optimized getScheduleStatus with caching
   */
  async getScheduleStatus(weekId: string): Promise<ScheduleStatus> {
    const cacheKey = `schedule:status:${weekId}`;
    
    return this.optimizer.executeQuery(
      cacheKey,
      () => super.getScheduleStatus(weekId),
      { 
        cacheDomain: this.CACHE_DOMAIN,
        ttlOverride: 30 * 1000 // 30 seconds TTL for status
      }
    );
  }

  /**
   * Batch status queries for multiple weeks
   */
  async getScheduleStatuses(weekIds: string[]): Promise<Record<string, ScheduleStatus>> {
    const queries = weekIds.map(weekId => ({
      cacheKey: `schedule:status:${weekId}`,
      query: () => super.getScheduleStatus(weekId),
      cacheDomain: this.CACHE_DOMAIN
    }));

    const results = await this.optimizer.batchQueries(queries, `schedules:statuses:${Date.now()}`);
    
    return weekIds.reduce((acc, weekId, index) => {
      acc[weekId] = results[index];
      return acc;
    }, {} as Record<string, ScheduleStatus>);
  }

  /**
   * Override create to invalidate relevant caches
   */
  async create(data: ScheduleCreateData): Promise<Schedule> {
    const schedule = await super.create(data);
    
    // Invalidate relevant caches
    await this.optimizer.invalidateCache('schedules:all', this.CACHE_DOMAIN);
    await this.optimizer.invalidateCache('schedules:recent', this.CACHE_DOMAIN);
    await this.optimizer.invalidateCache(`schedules:season:`, this.CACHE_DOMAIN);
    
    // Cache the new schedule
    const cache = this.optimizer.getCache(this.CACHE_DOMAIN);
    await cache.set(`schedule:${schedule.id}`, schedule);
    await cache.set(`schedule:week:${data.weekId}`, schedule);
    
    return schedule;
  }

  /**
   * Override update to invalidate relevant caches
   */
  async update(id: string, updates: Partial<Schedule>): Promise<Schedule | null> {
    const existingSchedule = await this.findById(id);
    if (!existingSchedule) {
      return null;
    }

    const updatedSchedule = await super.update(id, updates);
    
    if (updatedSchedule) {
      // Invalidate relevant caches
      await this.optimizer.invalidateCache('schedules:all', this.CACHE_DOMAIN);
      await this.optimizer.invalidateCache('schedules:recent', this.CACHE_DOMAIN);
      await this.optimizer.invalidateCache(`schedule:${id}`, this.CACHE_DOMAIN);
      await this.optimizer.invalidateCache(`schedule:week:${existingSchedule.weekId}`, this.CACHE_DOMAIN);
      await this.optimizer.invalidateCache(`schedule:status:${existingSchedule.weekId}`, this.CACHE_DOMAIN);
      
      // Update cached schedule
      const cache = this.optimizer.getCache(this.CACHE_DOMAIN);
      await cache.set(`schedule:${id}`, updatedSchedule);
      await cache.set(`schedule:week:${updatedSchedule.weekId}`, updatedSchedule);
    }
    
    return updatedSchedule;
  }

  /**
   * Override replaceScheduleAtomic to invalidate relevant caches
   */
  async replaceScheduleAtomic(weekId: string, newSchedule: Schedule, backupId: string): Promise<void> {
    await super.replaceScheduleAtomic(weekId, newSchedule, backupId);
    
    // Invalidate relevant caches
    await this.optimizer.invalidateCache('schedules:all', this.CACHE_DOMAIN);
    await this.optimizer.invalidateCache('schedules:recent', this.CACHE_DOMAIN);
    await this.optimizer.invalidateCache(`schedule:week:${weekId}`, this.CACHE_DOMAIN);
    await this.optimizer.invalidateCache(`schedule:status:${weekId}`, this.CACHE_DOMAIN);
    
    // Cache the new schedule
    const cache = this.optimizer.getCache(this.CACHE_DOMAIN);
    await cache.set(`schedule:${newSchedule.id}`, newSchedule);
    await cache.set(`schedule:week:${weekId}`, newSchedule);
  }

  /**
   * Override delete to invalidate relevant caches
   */
  async delete(id: string): Promise<boolean> {
    const existingSchedule = await this.findById(id);
    const result = await super.delete(id);
    
    if (result && existingSchedule) {
      // Invalidate relevant caches
      await this.optimizer.invalidateCache('schedules:all', this.CACHE_DOMAIN);
      await this.optimizer.invalidateCache('schedules:recent', this.CACHE_DOMAIN);
      await this.optimizer.invalidateCache(`schedule:${id}`, this.CACHE_DOMAIN);
      await this.optimizer.invalidateCache(`schedule:week:${existingSchedule.weekId}`, this.CACHE_DOMAIN);
      await this.optimizer.invalidateCache(`schedule:status:${existingSchedule.weekId}`, this.CACHE_DOMAIN);
    }
    
    return result;
  }

  /**
   * Override deleteByWeekId to invalidate relevant caches
   */
  async deleteByWeekId(weekId: string): Promise<boolean> {
    const result = await super.deleteByWeekId(weekId);
    
    if (result) {
      // Invalidate relevant caches
      await this.optimizer.invalidateCache('schedules:all', this.CACHE_DOMAIN);
      await this.optimizer.invalidateCache('schedules:recent', this.CACHE_DOMAIN);
      await this.optimizer.invalidateCache(`schedule:week:${weekId}`, this.CACHE_DOMAIN);
      await this.optimizer.invalidateCache(`schedule:status:${weekId}`, this.CACHE_DOMAIN);
    }
    
    return result;
  }

  /**
   * Override deleteBySeasonId to invalidate relevant caches
   */
  async deleteBySeasonId(seasonId: string): Promise<number> {
    const result = await super.deleteBySeasonId(seasonId);
    
    if (result > 0) {
      // Invalidate relevant caches
      await this.optimizer.invalidateCache('schedules:all', this.CACHE_DOMAIN);
      await this.optimizer.invalidateCache('schedules:recent', this.CACHE_DOMAIN);
      await this.optimizer.invalidateCache(`schedules:season:${seasonId}`, this.CACHE_DOMAIN);
    }
    
    return result;
  }

  /**
   * Override setScheduleStatus to invalidate status cache
   */
  async setScheduleStatus(weekId: string, status: Partial<ScheduleStatus>): Promise<void> {
    await super.setScheduleStatus(weekId, status);
    
    // Invalidate status cache
    await this.optimizer.invalidateCache(`schedule:status:${weekId}`, this.CACHE_DOMAIN);
  }

  /**
   * Efficient bulk operations for large datasets
   */
  async bulkFindByWeekIds(weekIds: string[]): Promise<Map<string, Schedule | null>> {
    const chunkSize = 20;
    const results = new Map<string, Schedule | null>();
    
    // Process in chunks to avoid overwhelming the system
    for (let i = 0; i < weekIds.length; i += chunkSize) {
      const chunk = weekIds.slice(i, i + chunkSize);
      const chunkResults = await this.findByWeekIds(chunk);
      
      chunk.forEach((weekId, index) => {
        results.set(weekId, chunkResults[index]);
      });
    }
    
    return results;
  }

  /**
   * Get performance statistics for this repository
   */
  getPerformanceStats() {
    return this.optimizer.getStats();
  }

  /**
   * Warm up cache with commonly accessed data
   */
  async warmupCache(seasonId?: string): Promise<void> {
    // Pre-load recent schedules
    await this.findRecent(20);
    
    if (seasonId) {
      // Pre-load season schedules
      await this.findBySeasonId(seasonId);
    }
    
    // Pre-load common date ranges (last 30 days, next 30 days)
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    
    await Promise.all([
      this.findByDateRange(thirtyDaysAgo, now),
      this.findByDateRange(now, thirtyDaysFromNow)
    ]);
  }

  /**
   * Clear all caches for this repository
   */
  async clearCache(): Promise<void> {
    await this.optimizer.invalidateCache('*', this.CACHE_DOMAIN);
  }

  /**
   * Get cache hit rate for performance monitoring
   */
  getCacheHitRate(): number {
    const stats = this.optimizer.getStats();
    return stats.l1Cache.hitRate;
  }
}