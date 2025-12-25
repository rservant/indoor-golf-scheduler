/**
 * Optimized Player Repository
 * 
 * Enhanced player repository with multi-level caching, query optimization,
 * and batching strategies for improved performance
 */

import { Player, PlayerModel, PlayerInfo } from '../models/Player';
import { LocalPlayerRepository, PlayerCreateData, PlayerRepository } from './PlayerRepository';
import { DataAccessOptimizer } from '../services/DataAccessOptimizer';

export class OptimizedPlayerRepository extends LocalPlayerRepository implements PlayerRepository {
  private optimizer: DataAccessOptimizer;
  private readonly CACHE_DOMAIN = 'players';

  constructor(optimizer?: DataAccessOptimizer) {
    super();
    this.optimizer = optimizer || new DataAccessOptimizer(
      {
        maxSize: 2000, // Larger cache for players
        ttl: 10 * 60 * 1000, // 10 minutes TTL
        strategy: 'LRU'
      },
      {
        maxBatchSize: 10, // Smaller batch size for faster execution
        batchTimeout: 5,  // Much shorter timeout (5ms)
        enabled: true
      }
    );
  }

  /**
   * Optimized findById with caching
   */
  async findById(id: string): Promise<Player | null> {
    const cacheKey = `player:${id}`;
    
    return this.optimizer.executeQuery(
      cacheKey,
      () => super.findById(id),
      { cacheDomain: this.CACHE_DOMAIN }
    );
  }

  /**
   * Optimized findAll with caching and efficient data structures
   */
  async findAll(): Promise<Player[]> {
    const cacheKey = 'players:all';
    
    return this.optimizer.executeQuery(
      cacheKey,
      () => super.findAll(),
      { 
        cacheDomain: this.CACHE_DOMAIN,
        ttlOverride: 2 * 60 * 1000 // Shorter TTL for all players
      }
    );
  }

  /**
   * Optimized findBySeasonId with caching and indexing
   */
  async findBySeasonId(seasonId: string): Promise<Player[]> {
    const cacheKey = `players:season:${seasonId}`;
    
    return this.optimizer.executeQuery(
      cacheKey,
      async () => {
        // Always fallback to base implementation for reliability
        return super.findBySeasonId(seasonId);
      },
      { cacheDomain: this.CACHE_DOMAIN }
    );
  }

  /**
   * Batch multiple player lookups efficiently
   * Returns results in the same order as the input IDs
   */
  async findByIds(ids: string[]): Promise<(Player | null)[]> {
    // Optimize by reading storage once instead of multiple individual reads
    // This is the key optimization: 1 storage read vs N storage reads
    const allPlayers = await super.findAll();
    const playerMap = new Map(allPlayers.map(p => [p.id, p]));
    
    // Map results in the same order as input IDs
    return ids.map(id => playerMap.get(id) || null);
  }

  /**
   * Optimized findBySeasonAndName with compound caching
   */
  async findBySeasonAndName(seasonId: string, firstName: string, lastName: string): Promise<Player | null> {
    const cacheKey = `player:season:${seasonId}:name:${firstName}:${lastName}`;
    
    return this.optimizer.executeQuery(
      cacheKey,
      async () => {
        // Try to use cached season players first
        const seasonPlayers = await this.findBySeasonId(seasonId);
        return seasonPlayers.find(player => 
          player.firstName === firstName && player.lastName === lastName
        ) || null;
      },
      { cacheDomain: this.CACHE_DOMAIN }
    );
  }

  /**
   * Optimized findByTimePreference with indexed caching
   */
  async findByTimePreference(seasonId: string, timePreference: 'AM' | 'PM' | 'Either'): Promise<Player[]> {
    const cacheKey = `players:season:${seasonId}:time:${timePreference}`;
    
    return this.optimizer.executeQuery(
      cacheKey,
      async () => {
        const seasonPlayers = await this.findBySeasonId(seasonId);
        return seasonPlayers.filter(player => player.timePreference === timePreference);
      },
      { cacheDomain: this.CACHE_DOMAIN }
    );
  }

  /**
   * Optimized findByHandedness with indexed caching
   */
  async findByHandedness(seasonId: string, handedness: 'left' | 'right'): Promise<Player[]> {
    const cacheKey = `players:season:${seasonId}:hand:${handedness}`;
    
    return this.optimizer.executeQuery(
      cacheKey,
      async () => {
        const seasonPlayers = await this.findBySeasonId(seasonId);
        return seasonPlayers.filter(player => player.handedness === handedness);
      },
      { cacheDomain: this.CACHE_DOMAIN }
    );
  }

  /**
   * Batch query for multiple player attributes
   */
  async findPlayersByAttributes(
    seasonId: string,
    attributes: Array<{
      type: 'timePreference' | 'handedness';
      value: string;
    }>
  ): Promise<Record<string, Player[]>> {
    const queries = attributes.map(attr => ({
      cacheKey: `players:season:${seasonId}:${attr.type}:${attr.value}`,
      query: async () => {
        if (attr.type === 'timePreference') {
          return this.findByTimePreference(seasonId, attr.value as 'AM' | 'PM' | 'Either');
        } else {
          return this.findByHandedness(seasonId, attr.value as 'left' | 'right');
        }
      },
      cacheDomain: this.CACHE_DOMAIN
    }));

    const results = await this.optimizer.batchQueries(queries, `players:attrs:${seasonId}`);
    
    return attributes.reduce((acc, attr, index) => {
      acc[`${attr.type}:${attr.value}`] = results[index];
      return acc;
    }, {} as Record<string, Player[]>);
  }

  /**
   * Override create to invalidate relevant caches
   */
  async create(data: PlayerCreateData): Promise<Player> {
    const player = await super.create(data);
    
    // Invalidate relevant caches
    await this.optimizer.invalidateCache('players:all', this.CACHE_DOMAIN);
    await this.optimizer.invalidateCache(`players:season:${data.seasonId}`, this.CACHE_DOMAIN);
    
    // Cache the new player
    const cache = this.optimizer.getCache(this.CACHE_DOMAIN);
    await cache.set(`player:${player.id}`, player);
    
    return player;
  }

  /**
   * Override update to invalidate relevant caches
   */
  async update(id: string, updates: Partial<Player>): Promise<Player | null> {
    const existingPlayer = await super.findById(id); // Use super to bypass cache
    if (!existingPlayer) {
      return null;
    }

    const updatedPlayer = await super.update(id, updates);
    
    if (updatedPlayer) {
      // Clear all caches first to ensure consistency
      await this.clearCache();
      
      // Cache the updated player
      const cache = this.optimizer.getCache(this.CACHE_DOMAIN);
      await cache.set(`player:${id}`, updatedPlayer);
    }
    
    return updatedPlayer;
  }

  /**
   * Override delete to invalidate relevant caches
   */
  async delete(id: string): Promise<boolean> {
    const existingPlayer = await this.findById(id);
    const result = await super.delete(id);
    
    if (result && existingPlayer) {
      // Invalidate relevant caches
      await this.optimizer.invalidateCache('players:all', this.CACHE_DOMAIN);
      await this.optimizer.invalidateCache(`players:season:${existingPlayer.seasonId}`, this.CACHE_DOMAIN);
      await this.optimizer.invalidateCache(`player:${id}`, this.CACHE_DOMAIN);
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
      await this.optimizer.invalidateCache('players:all', this.CACHE_DOMAIN);
      await this.optimizer.invalidateCache(`players:season:${seasonId}`, this.CACHE_DOMAIN);
    }
    
    return result;
  }

  /**
   * Efficient bulk operations for large datasets
   */
  async bulkCreate(players: PlayerCreateData[]): Promise<Player[]> {
    const results: Player[] = [];
    
    // Process in chunks to avoid overwhelming the system
    const chunkSize = 50;
    for (let i = 0; i < players.length; i += chunkSize) {
      const chunk = players.slice(i, i + chunkSize);
      const chunkResults = await Promise.all(
        chunk.map(playerData => this.create(playerData))
      );
      results.push(...chunkResults);
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
  async warmupCache(seasonId: string): Promise<void> {
    // Pre-load season players
    await this.findBySeasonId(seasonId);
    
    // Pre-load common attribute queries
    await Promise.all([
      this.findByTimePreference(seasonId, 'AM'),
      this.findByTimePreference(seasonId, 'PM'),
      this.findByTimePreference(seasonId, 'Either'),
      this.findByHandedness(seasonId, 'left'),
      this.findByHandedness(seasonId, 'right')
    ]);
  }

  /**
   * Clear all caches for this repository
   */
  async clearCache(): Promise<void> {
    await this.optimizer.invalidateCache('*', this.CACHE_DOMAIN);
  }
}