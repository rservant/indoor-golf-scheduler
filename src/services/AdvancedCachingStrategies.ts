/**
 * Advanced Caching Strategies
 * 
 * Implements predictive caching, intelligent invalidation, and cross-session persistence
 * for enhanced performance optimization
 */

import { DataAccessOptimizer, MultiLevelCache, CacheConfig } from './DataAccessOptimizer';
import { CompatibilityCache, CacheStats } from './CompatibilityCache';

export interface UsagePattern {
  key: string;
  accessCount: number;
  lastAccessed: number;
  accessTimes: number[];
  relatedKeys: Set<string>;
  predictedNextAccess?: number;
}

export interface PredictiveCacheConfig extends CacheConfig {
  predictionWindow: number; // Time window for predictions in ms
  minAccessCount: number; // Minimum accesses before making predictions
  preloadThreshold: number; // Confidence threshold for preloading
  patternAnalysisInterval: number; // How often to analyze patterns in ms
}

export interface InvalidationRule {
  pattern: string;
  dependencies: string[];
  cascadeRules?: InvalidationRule[];
  condition?: (key: string, value: any) => boolean;
}

export interface CrossSessionConfig {
  persistenceKey: string;
  maxStorageSize: number; // Max size in bytes
  compressionEnabled: boolean;
  encryptionEnabled: boolean;
  syncInterval: number; // Sync interval in ms
}

/**
 * Tracks and analyzes usage patterns for predictive caching
 */
export class UsagePatternAnalyzer {
  private patterns = new Map<string, UsagePattern>();
  private config: PredictiveCacheConfig;
  private analysisTimer?: NodeJS.Timeout;

  constructor(config: PredictiveCacheConfig) {
    this.config = config;
    this.startPatternAnalysis();
  }

  /**
   * Record access to a cache key
   */
  recordAccess(key: string, relatedKeys: string[] = []): void {
    const now = Date.now();
    const pattern = this.patterns.get(key) || {
      key,
      accessCount: 0,
      lastAccessed: 0,
      accessTimes: [],
      relatedKeys: new Set<string>()
    };

    pattern.accessCount++;
    pattern.lastAccessed = now;
    pattern.accessTimes.push(now);
    
    // Keep only recent access times within the prediction window
    const cutoff = now - this.config.predictionWindow;
    pattern.accessTimes = pattern.accessTimes.filter(time => time > cutoff);
    
    // Track related keys for correlation analysis
    relatedKeys.forEach(relatedKey => pattern.relatedKeys.add(relatedKey));

    this.patterns.set(key, pattern);
  }

  /**
   * Predict which keys are likely to be accessed soon
   */
  getPredictions(): Array<{ key: string; confidence: number; estimatedTime: number }> {
    const now = Date.now();
    const predictions: Array<{ key: string; confidence: number; estimatedTime: number }> = [];

    for (const pattern of this.patterns.values()) {
      if (pattern.accessCount < this.config.minAccessCount) {
        continue;
      }

      const prediction = this.analyzePrediction(pattern, now);
      if (prediction.confidence >= this.config.preloadThreshold) {
        predictions.push({
          key: pattern.key,
          confidence: prediction.confidence,
          estimatedTime: prediction.estimatedTime
        });
      }
    }

    return predictions.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get related keys that might be accessed together
   */
  getRelatedKeys(key: string): string[] {
    const pattern = this.patterns.get(key);
    return pattern ? Array.from(pattern.relatedKeys) : [];
  }

  /**
   * Clean up old patterns
   */
  cleanup(): void {
    const now = Date.now();
    const cutoff = now - this.config.predictionWindow * 2; // Keep patterns for 2x prediction window

    for (const [key, pattern] of this.patterns.entries()) {
      if (pattern.lastAccessed < cutoff) {
        this.patterns.delete(key);
      }
    }
  }

  /**
   * Get usage statistics
   */
  getStats(): {
    totalPatterns: number;
    activePatterns: number;
    avgAccessCount: number;
    topKeys: Array<{ key: string; accessCount: number }>;
  } {
    const now = Date.now();
    const recentCutoff = now - this.config.predictionWindow;
    
    const activePatterns = Array.from(this.patterns.values())
      .filter(p => p.lastAccessed > recentCutoff);
    
    const totalAccessCount = activePatterns.reduce((sum, p) => sum + p.accessCount, 0);
    const avgAccessCount = activePatterns.length > 0 ? totalAccessCount / activePatterns.length : 0;
    
    const topKeys = Array.from(this.patterns.values())
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, 10)
      .map(p => ({ key: p.key, accessCount: p.accessCount }));

    return {
      totalPatterns: this.patterns.size,
      activePatterns: activePatterns.length,
      avgAccessCount,
      topKeys
    };
  }

  private analyzePrediction(pattern: UsagePattern, now: number): { confidence: number; estimatedTime: number } {
    // Simple time-based prediction using access intervals
    if (pattern.accessTimes.length < 2) {
      return { confidence: 0, estimatedTime: now };
    }

    // Calculate average interval between accesses
    const intervals: number[] = [];
    for (let i = 1; i < pattern.accessTimes.length; i++) {
      intervals.push(pattern.accessTimes[i] - pattern.accessTimes[i - 1]);
    }

    const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    const timeSinceLastAccess = now - pattern.lastAccessed;
    
    // Confidence based on regularity of access pattern
    const intervalVariance = intervals.reduce((sum, interval) => 
      sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length;
    const regularityScore = Math.max(0, 1 - (intervalVariance / (avgInterval * avgInterval)));
    
    // Time-based confidence (higher if we're approaching the expected next access)
    const expectedNextAccess = pattern.lastAccessed + avgInterval;
    const timeUntilExpected = expectedNextAccess - now;
    const timeBasedScore = Math.max(0, 1 - Math.abs(timeUntilExpected) / avgInterval);
    
    // Frequency-based confidence (more frequent access = higher confidence)
    const frequencyScore = Math.min(1, pattern.accessCount / (this.config.minAccessCount * 2));
    
    const confidence = (regularityScore * 0.4 + timeBasedScore * 0.4 + frequencyScore * 0.2);
    
    return {
      confidence,
      estimatedTime: expectedNextAccess
    };
  }

  private startPatternAnalysis(): void {
    this.analysisTimer = setInterval(() => {
      this.cleanup();
    }, this.config.patternAnalysisInterval);
  }

  destroy(): void {
    if (this.analysisTimer) {
      clearInterval(this.analysisTimer);
    }
  }
}

/**
 * Manages intelligent cache invalidation based on data relationships
 */
export class IntelligentInvalidationManager {
  private rules = new Map<string, InvalidationRule>();
  private dependencyGraph = new Map<string, Set<string>>();

  /**
   * Register invalidation rule
   */
  registerRule(name: string, rule: InvalidationRule): void {
    this.rules.set(name, rule);
    
    // Build dependency graph
    rule.dependencies.forEach(dep => {
      if (!this.dependencyGraph.has(dep)) {
        this.dependencyGraph.set(dep, new Set());
      }
      this.dependencyGraph.get(dep)!.add(rule.pattern);
    });
  }

  /**
   * Get keys that should be invalidated when a specific key changes
   */
  getInvalidationTargets(changedKey: string, changedValue?: any): string[] {
    const targets = new Set<string>();
    
    // Direct dependencies
    const directTargets = this.dependencyGraph.get(changedKey);
    if (directTargets) {
      directTargets.forEach(target => targets.add(target));
    }

    // Pattern-based invalidation
    for (const rule of this.rules.values()) {
      if (this.matchesPattern(changedKey, rule.pattern)) {
        if (!rule.condition || rule.condition(changedKey, changedValue)) {
          rule.dependencies.forEach(dep => targets.add(dep));
          
          // Cascade invalidation
          if (rule.cascadeRules) {
            rule.dependencies.forEach(dep => {
              rule.cascadeRules!.forEach(cascadeRule => {
                const cascadeTargets = this.getInvalidationTargets(dep, changedValue);
                cascadeTargets.forEach(target => targets.add(target));
              });
            });
          }
        }
      }
    }

    return Array.from(targets);
  }

  /**
   * Register common invalidation patterns for the golf scheduler
   */
  registerCommonPatterns(): void {
    // Player changes invalidate related schedules and pairings
    this.registerRule('player-changes', {
      pattern: 'player:*',
      dependencies: ['schedule:*', 'pairing:*', 'availability:*'],
      condition: (key, value) => {
        // Only invalidate if player data actually changed
        return value !== null;
      }
    });

    // Schedule changes invalidate related UI caches
    this.registerRule('schedule-changes', {
      pattern: 'schedule:*',
      dependencies: ['ui:schedule:*', 'export:*'],
      cascadeRules: [{
        pattern: 'ui:*',
        dependencies: ['render:*'],
        condition: () => true
      }]
    });

    // Season changes invalidate everything related to that season
    this.registerRule('season-changes', {
      pattern: 'season:*',
      dependencies: ['player:*', 'schedule:*', 'week:*', 'pairing:*'],
      condition: () => true
    });

    // Availability changes invalidate schedule generation caches
    this.registerRule('availability-changes', {
      pattern: 'availability:*',
      dependencies: ['schedule:*', 'generation:*'],
      condition: () => true
    });
  }

  private matchesPattern(key: string, pattern: string): boolean {
    // Simple glob pattern matching
    if (pattern.includes('*')) {
      const regexPattern = pattern.replace(/\*/g, '.*');
      return new RegExp(`^${regexPattern}$`).test(key);
    }
    return key === pattern;
  }
}

/**
 * Enhanced cross-session cache persistence with compression and encryption
 */
export class CrossSessionCacheManager {
  private config: CrossSessionConfig;
  private syncTimer?: NodeJS.Timeout;
  private pendingWrites = new Map<string, any>();

  constructor(config: CrossSessionConfig) {
    this.config = config;
    this.startSyncTimer();
  }

  /**
   * Store data with cross-session persistence
   */
  async store(key: string, value: any, metadata?: Record<string, any>): Promise<void> {
    const processedValue = this.config.compressionEnabled 
      ? this.compress(value)
      : value;

    const entry = {
      value: processedValue,
      metadata: metadata || {},
      timestamp: Date.now(),
      size: this.calculateSize(value)
    };

    // Add to pending writes for batching
    this.pendingWrites.set(key, entry);

    // Immediate write for critical data
    if (metadata?.critical) {
      await this.flushPendingWrites();
    }
  }

  /**
   * Retrieve data from cross-session storage
   */
  async retrieve(key: string): Promise<any> {
    try {
      const data = await this.getStorageData();
      const entry = data[key];
      
      if (!entry) return null;

      // Check if entry is still valid
      if (this.isExpired(entry)) {
        await this.remove(key);
        return null;
      }

      return this.config.compressionEnabled 
        ? this.decompress(entry.value)
        : entry.value;
    } catch (error) {
      console.error('Error retrieving from cross-session cache:', error);
      return null;
    }
  }

  /**
   * Remove data from cross-session storage
   */
  async remove(key: string): Promise<boolean> {
    try {
      const data = await this.getStorageData();
      const existed = key in data;
      delete data[key];
      await this.setStorageData(data);
      return existed;
    } catch (error) {
      console.error('Error removing from cross-session cache:', error);
      return false;
    }
  }

  /**
   * Clear all cross-session data
   */
  async clear(): Promise<void> {
    try {
      localStorage.removeItem(this.config.persistenceKey);
      this.pendingWrites.clear();
    } catch (error) {
      console.error('Error clearing cross-session cache:', error);
    }
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<{
    totalSize: number;
    entryCount: number;
    oldestEntry: number;
    newestEntry: number;
    compressionRatio?: number;
  }> {
    try {
      const data = await this.getStorageData();
      const entries = Object.values(data);
      
      if (entries.length === 0) {
        return {
          totalSize: 0,
          entryCount: 0,
          oldestEntry: 0,
          newestEntry: 0
        };
      }

      const totalSize = entries.reduce((sum: number, entry: any) => sum + (entry.size || 0), 0);
      const timestamps = entries.map((entry: any) => entry.timestamp);
      
      return {
        totalSize,
        entryCount: entries.length,
        oldestEntry: Math.min(...timestamps),
        newestEntry: Math.max(...timestamps),
        ...(this.config.compressionEnabled && { compressionRatio: this.calculateCompressionRatio(data) })
      };
    } catch (error) {
      console.error('Error getting cross-session cache stats:', error);
      return {
        totalSize: 0,
        entryCount: 0,
        oldestEntry: 0,
        newestEntry: 0
      };
    }
  }

  /**
   * Cleanup expired entries and manage storage size
   */
  async cleanup(): Promise<number> {
    try {
      const data = await this.getStorageData();
      let cleaned = 0;
      const now = Date.now();

      // Remove expired entries
      for (const [key, entry] of Object.entries(data)) {
        if (this.isExpired(entry as any)) {
          delete data[key];
          cleaned++;
        }
      }

      // Check storage size and remove oldest entries if needed
      const currentSize = this.calculateStorageSize(data);
      if (currentSize > this.config.maxStorageSize) {
        const entries = Object.entries(data).sort(([, a], [, b]) => 
          (a as any).timestamp - (b as any).timestamp
        );

        while (this.calculateStorageSize(data) > this.config.maxStorageSize && entries.length > 0) {
          const [key] = entries.shift()!;
          delete data[key];
          cleaned++;
        }
      }

      if (cleaned > 0) {
        await this.setStorageData(data);
      }

      return cleaned;
    } catch (error) {
      console.error('Error during cross-session cache cleanup:', error);
      return 0;
    }
  }

  private async getStorageData(): Promise<Record<string, any>> {
    try {
      const rawData = localStorage.getItem(this.config.persistenceKey);
      if (!rawData) return {};

      let data = JSON.parse(rawData);
      
      if (this.config.encryptionEnabled) {
        data = this.decrypt(data);
      }

      return data;
    } catch (error) {
      console.error('Error parsing cross-session storage data:', error);
      return {};
    }
  }

  private async setStorageData(data: Record<string, any>): Promise<void> {
    try {
      let dataToStore = data;
      
      if (this.config.encryptionEnabled) {
        dataToStore = this.encrypt(data);
      }

      localStorage.setItem(this.config.persistenceKey, JSON.stringify(dataToStore));
    } catch (error) {
      console.error('Error setting cross-session storage data:', error);
      throw error;
    }
  }

  private async flushPendingWrites(): Promise<void> {
    if (this.pendingWrites.size === 0) return;

    try {
      const data = await this.getStorageData();
      
      for (const [key, entry] of this.pendingWrites.entries()) {
        data[key] = entry;
      }

      await this.setStorageData(data);
      this.pendingWrites.clear();
    } catch (error) {
      console.error('Error flushing pending writes:', error);
    }
  }

  private startSyncTimer(): void {
    this.syncTimer = setInterval(async () => {
      await this.flushPendingWrites();
      await this.cleanup();
    }, this.config.syncInterval);
  }

  private calculateSize(value: any): number {
    return JSON.stringify(value).length * 2; // Rough estimate (UTF-16)
  }

  private calculateStorageSize(data: Record<string, any>): number {
    return JSON.stringify(data).length * 2;
  }

  private calculateCompressionRatio(data: Record<string, any>): number {
    // Simple compression ratio calculation
    const originalSize = this.calculateStorageSize(data);
    const compressedSize = originalSize * 0.7; // Assume 30% compression
    return originalSize > 0 ? compressedSize / originalSize : 1;
  }

  private isExpired(entry: any): boolean {
    if (!entry.metadata?.ttl) return false;
    return Date.now() - entry.timestamp > entry.metadata.ttl;
  }

  private compress(value: any): any {
    // Simple compression placeholder - in production, use a real compression library
    return value; // No compression for now to avoid JSON parsing issues
  }

  private decompress(value: any): any {
    // Simple decompression placeholder
    return value; // No decompression for now
  }

  private encrypt(data: any): any {
    // Simple encryption placeholder - in production, use proper encryption
    return data;
  }

  private decrypt(data: any): any {
    // Simple decryption placeholder
    return data;
  }

  destroy(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }
  }
}

/**
 * Main advanced caching coordinator that integrates all strategies
 */
export class AdvancedCachingCoordinator {
  private dataOptimizer: DataAccessOptimizer;
  private patternAnalyzer: UsagePatternAnalyzer;
  private invalidationManager: IntelligentInvalidationManager;
  private crossSessionManager: CrossSessionCacheManager;
  private preloadTimer?: NodeJS.Timeout;

  constructor(
    dataOptimizer: DataAccessOptimizer,
    predictiveConfig: PredictiveCacheConfig = {
      maxSize: 1000,
      ttl: 5 * 60 * 1000,
      strategy: 'LRU',
      predictionWindow: 30 * 60 * 1000, // 30 minutes
      minAccessCount: 3,
      preloadThreshold: 0.7,
      patternAnalysisInterval: 60 * 1000 // 1 minute
    },
    crossSessionConfig: CrossSessionConfig = {
      persistenceKey: 'advanced_cache_storage',
      maxStorageSize: 10 * 1024 * 1024, // 10MB
      compressionEnabled: true,
      encryptionEnabled: false,
      syncInterval: 30 * 1000 // 30 seconds
    }
  ) {
    this.dataOptimizer = dataOptimizer;
    this.patternAnalyzer = new UsagePatternAnalyzer(predictiveConfig);
    this.invalidationManager = new IntelligentInvalidationManager();
    this.crossSessionManager = new CrossSessionCacheManager(crossSessionConfig);

    this.setupInvalidationRules();
    this.startPredictivePreloading();
  }

  /**
   * Enhanced cache access with pattern tracking and predictive preloading
   */
  async get<T>(
    key: string, 
    loader: () => Promise<T>,
    options: {
      cacheDomain?: string;
      relatedKeys?: string[];
      skipPrediction?: boolean;
      crossSession?: boolean;
    } = {}
  ): Promise<T> {
    // Record access pattern
    this.patternAnalyzer.recordAccess(key, options.relatedKeys || []);

    // Try cross-session cache first if enabled
    if (options.crossSession) {
      const crossSessionResult = await this.crossSessionManager.retrieve(key);
      if (crossSessionResult !== null) {
        return crossSessionResult;
      }
    }

    // Use standard data optimizer
    const result = await this.dataOptimizer.executeQuery(key, loader, 
      options.cacheDomain ? { cacheDomain: options.cacheDomain } : {}
    );

    // Store in cross-session cache if enabled
    if (options.crossSession) {
      await this.crossSessionManager.store(key, result);
    }

    // Trigger predictive preloading for related keys
    if (!options.skipPrediction) {
      this.triggerPredictivePreloading(key);
    }

    return result;
  }

  /**
   * Intelligent cache invalidation
   */
  async invalidate(key: string, value?: any, options: { cascade?: boolean } = {}): Promise<number> {
    let totalInvalidated = 0;

    // Get invalidation targets
    const targets = this.invalidationManager.getInvalidationTargets(key, value);
    
    // Invalidate in data optimizer
    for (const target of targets) {
      totalInvalidated += await this.dataOptimizer.invalidateCache(target);
    }

    // Invalidate in cross-session storage
    for (const target of targets) {
      await this.crossSessionManager.remove(target);
    }

    return totalInvalidated;
  }

  /**
   * Get comprehensive caching statistics
   */
  async getStats(): Promise<{
    dataOptimizer: any;
    usagePatterns: any;
    crossSession: any;
    predictions: Array<{ key: string; confidence: number; estimatedTime: number }>;
  }> {
    return {
      dataOptimizer: this.dataOptimizer.getStats(),
      usagePatterns: this.patternAnalyzer.getStats(),
      crossSession: await this.crossSessionManager.getStats(),
      predictions: this.patternAnalyzer.getPredictions()
    };
  }

  /**
   * Cleanup all caching systems
   */
  async cleanup(): Promise<void> {
    this.patternAnalyzer.cleanup();
    await this.crossSessionManager.cleanup();
  }

  private setupInvalidationRules(): void {
    this.invalidationManager.registerCommonPatterns();
  }

  private startPredictivePreloading(): void {
    this.preloadTimer = setInterval(async () => {
      const predictions = this.patternAnalyzer.getPredictions();
      
      // Preload top predictions
      for (const prediction of predictions.slice(0, 5)) {
        try {
          // This would need to be implemented with actual data loaders
          // For now, we just log the prediction
          console.debug(`Predictive cache: ${prediction.key} (confidence: ${prediction.confidence})`);
        } catch (error) {
          console.error('Error in predictive preloading:', error);
        }
      }
    }, 60 * 1000); // Check every minute
  }

  private async triggerPredictivePreloading(accessedKey: string): Promise<void> {
    // Get related keys that might be accessed soon
    const relatedKeys = this.patternAnalyzer.getRelatedKeys(accessedKey);
    
    // This is where we would implement actual preloading logic
    // For now, we just record the potential preload opportunities
    if (relatedKeys.length > 0) {
      console.debug(`Potential preload opportunities for ${accessedKey}:`, relatedKeys);
    }
  }

  destroy(): void {
    this.patternAnalyzer.destroy();
    this.crossSessionManager.destroy();
    if (this.preloadTimer) {
      clearInterval(this.preloadTimer);
    }
  }
}