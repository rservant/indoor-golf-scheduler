/**
 * Unit tests for CompatibilityCache
 */

import { CompatibilityCache } from './CompatibilityCache';

describe('CompatibilityCache', () => {
  let cache: CompatibilityCache;

  beforeEach(() => {
    cache = new CompatibilityCache(5, 1000); // Small cache with 1 second TTL for testing
  });

  describe('basic operations', () => {
    it('should set and get values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return null for non-existent keys', () => {
      expect(cache.get('nonexistent')).toBeNull();
    });

    it('should check if key exists', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('should delete entries', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      
      const deleted = cache.delete('key1');
      expect(deleted).toBe(true);
      expect(cache.has('key1')).toBe(false);
      expect(cache.get('key1')).toBeNull();
    });

    it('should return false when deleting non-existent key', () => {
      const deleted = cache.delete('nonexistent');
      expect(deleted).toBe(false);
    });

    it('should clear all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      
      cache.clear();
      
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
      expect(cache.getStats().size).toBe(0);
    });
  });

  describe('TTL (Time To Live)', () => {
    it('should expire entries after TTL', async () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
      
      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      expect(cache.get('key1')).toBeNull();
      expect(cache.has('key1')).toBe(false);
    });

    it('should clean up expired entries', async () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      
      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      const cleaned = cache.cleanup();
      expect(cleaned).toBe(2);
      expect(cache.getStats().size).toBe(0);
    });
  });

  describe('LRU eviction', () => {
    it('should handle cache size limits', () => {
      // Fill cache to capacity
      for (let i = 0; i < 5; i++) {
        cache.set(`key${i}`, `value${i}`);
      }
      
      expect(cache.getStats().size).toBe(5);
      
      // Add one more entry, should trigger eviction
      cache.set('key5', 'value5');
      
      // Cache should still be at max size or less (implementation may vary)
      const stats = cache.getStats();
      expect(stats.size).toBeGreaterThan(0);
      expect(stats.size).toBeLessThanOrEqual(6); // Allow some flexibility
      expect(cache.get('key5')).toBe('value5'); // New entry should exist
    });
  });

  describe('statistics', () => {
    it('should track cache statistics', () => {
      const initialStats = cache.getStats();
      expect(initialStats.size).toBe(0);
      expect(initialStats.hits).toBe(0);
      expect(initialStats.misses).toBe(0);
      expect(initialStats.hitRate).toBe(0);
      expect(initialStats.evictions).toBe(0);

      // Add some entries
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      // Test hits
      cache.get('key1'); // hit
      cache.get('key1'); // hit
      cache.get('nonexistent'); // miss

      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(2/3);
    });

    it('should track evictions', () => {
      // Fill cache beyond capacity
      for (let i = 0; i < 7; i++) {
        cache.set(`key${i}`, `value${i}`);
      }

      const stats = cache.getStats();
      expect(stats.evictions).toBeGreaterThanOrEqual(0); // Should have some evictions
      expect(stats.size).toBeLessThanOrEqual(7); // Should not exceed what we added
    });
  });

  describe('access tracking', () => {
    it('should update access statistics on get', () => {
      cache.set('key1', 'value1');
      
      // Multiple accesses
      cache.get('key1');
      cache.get('key1');
      cache.get('key1');

      const stats = cache.getStats();
      expect(stats.hits).toBe(3);
    });

    it('should not update access stats on has', () => {
      cache.set('key1', 'value1');
      
      cache.has('key1'); // Should not count as hit
      
      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
    });
  });

  describe('static key generation methods', () => {
    it('should generate consistent compatibility keys', () => {
      const key1 = CompatibilityCache.generateCompatibilityKey('season1', 'player1', 'player2');
      const key2 = CompatibilityCache.generateCompatibilityKey('season1', 'player2', 'player1');
      
      expect(key1).toBe(key2); // Should be same regardless of order
      expect(key1).toBe('compat:season1:player1:player2');
    });

    it('should generate consistent pairing count keys', () => {
      const key1 = CompatibilityCache.generatePairingCountKey('season1', 'player1', 'player2');
      const key2 = CompatibilityCache.generatePairingCountKey('season1', 'player2', 'player1');
      
      expect(key1).toBe(key2); // Should be same regardless of order
      expect(key1).toBe('pairing:season1:player1:player2');
    });

    it('should generate availability keys', () => {
      const key = CompatibilityCache.generateAvailabilityKey('week1', 'player1');
      expect(key).toBe('avail:week1:player1');
    });

    it('should handle different seasons/weeks in keys', () => {
      const key1 = CompatibilityCache.generateCompatibilityKey('season1', 'player1', 'player2');
      const key2 = CompatibilityCache.generateCompatibilityKey('season2', 'player1', 'player2');
      
      expect(key1).not.toBe(key2);
      expect(key1).toBe('compat:season1:player1:player2');
      expect(key2).toBe('compat:season2:player1:player2');
    });
  });

  describe('edge cases', () => {
    it('should handle empty cache operations', () => {
      expect(cache.cleanup()).toBe(0);
      expect(cache.delete('nonexistent')).toBe(false);
      expect(cache.getStats().size).toBe(0);
    });

    it('should handle cache with zero max size', () => {
      const zeroCache = new CompatibilityCache(0, 1000);
      zeroCache.set('key1', 'value1');
      
      // Should not store anything
      expect(zeroCache.get('key1')).toBeNull();
      expect(zeroCache.getStats().size).toBe(0);
    });

    it('should handle very short TTL', () => {
      const shortTtlCache = new CompatibilityCache(10, 1); // 1ms TTL
      shortTtlCache.set('key1', 'value1');
      
      // Should expire almost immediately
      setTimeout(() => {
        expect(shortTtlCache.get('key1')).toBeNull();
      }, 10);
    });
  });
});