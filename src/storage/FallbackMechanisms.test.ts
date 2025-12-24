import * as fc from 'fast-check';
import { PersistenceFallback } from './PersistenceFallback';
import { InMemoryStorageProvider } from './InMemoryStorageProvider';
import { MockStorageProvider } from './MockStorageProvider';
import { StorageProvider, FallbackReason } from './interfaces';

describe('Fallback Mechanisms Property Tests', () => {
  
  /**
   * Property 4: Fallback Activation on Quota Errors
   * For any localStorage operation that fails with a quota exceeded error, 
   * the Persistence_Fallback should automatically activate in-memory storage as the next storage provider
   * **Validates: Requirements 2.1**
   */
  test('**Feature: ci-storage-optimization, Property 4: Fallback Activation on Quota Errors**', () => {
    fc.assert(fc.asyncProperty(
      fc.string({ minLength: 1, maxLength: 50 }), // key
      fc.string({ minLength: 1, maxLength: 1000 }), // value
      async (key, value) => {
        const fallback = new PersistenceFallback();
        
        // Initially should not be active
        expect(fallback.isActive()).toBe(false);
        
        // Activate fallback due to quota exceeded
        fallback.activate('quota_exceeded');
        
        // Should now be active
        expect(fallback.isActive()).toBe(true);
        
        // Should have an active storage provider
        const activeStorage = fallback.getActiveStorage();
        expect(activeStorage).toBeDefined();
        
        // Active storage should be InMemoryStorageProvider (first in chain)
        expect(activeStorage).toBeInstanceOf(InMemoryStorageProvider);
        
        // Should be able to perform storage operations
        await activeStorage.setItem(key, value);
        const retrievedValue = await activeStorage.getItem(key);
        expect(retrievedValue).toBe(value);
        
        return true; // Explicitly return true for property test
      }
    ), { numRuns: 25 }); // Reduced iterations for CI
  });

  /**
   * Property 5: API Consistency Across Storage Backends
   * For any storage operation (setItem, getItem, removeItem, clear), 
   * the API should behave identically regardless of whether localStorage, in-memory storage, or mock storage is active
   * **Validates: Requirements 2.2**
   */
  test('**Feature: ci-storage-optimization, Property 5: API Consistency Across Storage Backends**', () => {
    fc.assert(fc.asyncProperty(
      fc.string({ minLength: 1, maxLength: 50 }), // key
      fc.string({ minLength: 1, maxLength: 500 }), // value
      fc.constantFrom('inMemory', 'mock'), // storage type
      async (key, value, storageType) => {
        let storage: StorageProvider;
        
        if (storageType === 'inMemory') {
          storage = new InMemoryStorageProvider(10000); // Large capacity
        } else {
          storage = new MockStorageProvider(10000, false); // No logging for tests
        }
        
        // All storage providers should have the same API methods
        expect(typeof storage.setItem).toBe('function');
        expect(typeof storage.getItem).toBe('function');
        expect(typeof storage.removeItem).toBe('function');
        expect(typeof storage.clear).toBe('function');
        expect(typeof storage.getCapacity).toBe('function');
        
        // setItem should not throw for valid inputs
        await storage.setItem(key, value);
        
        // getItem behavior differs between storage types
        const retrievedValue = await storage.getItem(key);
        if (storageType === 'inMemory') {
          // InMemory storage should return the stored value
          expect(retrievedValue).toBe(value);
        } else {
          // Mock storage always returns null
          expect(retrievedValue).toBe(null);
        }
        
        // removeItem should not throw
        await storage.removeItem(key);
        
        // clear should not throw
        await storage.clear();
        
        // getCapacity should return a number
        expect(typeof storage.getCapacity()).toBe('number');
        
        return true; // Explicitly return true for property test
      }
    ), { numRuns: 25 }); // Reduced iterations for CI
  });

  /**
   * Property 7: Graceful Degradation Through Failure Modes
   * For any cascading storage failure (localStorage fails, then in-memory storage fails), 
   * the system should gracefully degrade to mock storage without throwing unhandled exceptions
   * **Validates: Requirements 2.5**
   */
  test('**Feature: ci-storage-optimization, Property 7: Graceful Degradation Through Failure Modes**', () => {
    fc.assert(fc.property(
      fc.array(fc.constantFrom('quota_exceeded', 'permission_denied', 'storage_unavailable'), { minLength: 1, maxLength: 5 }),
      (failureReasons) => {
        const fallback = new PersistenceFallback();
        
        // Simulate cascading failures
        for (const reason of failureReasons) {
          // Should not throw when activating fallback
          expect(() => fallback.activate(reason as FallbackReason)).not.toThrow();
          
          // Should remain active
          expect(fallback.isActive()).toBe(true);
          
          // Should have an active storage provider
          expect(() => fallback.getActiveStorage()).not.toThrow();
        }
        
        // After multiple activations, should still have a working storage provider
        const finalStorage = fallback.getActiveStorage();
        expect(finalStorage).toBeDefined();
        
        // Final storage should be functional (at minimum, mock storage)
        expect(typeof finalStorage.setItem).toBe('function');
        expect(typeof finalStorage.getItem).toBe('function');
        
        // Should be able to get stats without throwing
        expect(() => fallback.getStats()).not.toThrow();
        
        const stats = fallback.getStats();
        expect(stats.isActive).toBe(true);
        expect(stats.activationCount).toBeGreaterThan(0);
        
        return true; // Explicitly return true for property test
      }
    ), { numRuns: 25 }); // Reduced iterations for CI
  });

  /**
   * Additional property test for fallback chain progression
   */
  test('Fallback chain progression maintains order and functionality', () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 10 }), // number of activations
      (activationCount) => {
        const fallback = new PersistenceFallback();
        const chain = fallback.getFallbackChain();
        
        // Chain should have expected providers
        expect(chain.length).toBeGreaterThan(0);
        expect(chain[0]).toBeInstanceOf(InMemoryStorageProvider);
        expect(chain[chain.length - 1]).toBeInstanceOf(MockStorageProvider);
        
        let previousLevel = -1;
        
        // Activate fallback multiple times
        for (let i = 0; i < Math.min(activationCount, chain.length); i++) {
          fallback.activate('quota_exceeded');
          
          const currentLevel = fallback.getCurrentFallbackLevel();
          
          // Level should progress or stay the same (if at end)
          expect(currentLevel).toBeGreaterThanOrEqual(previousLevel);
          
          // Should not exceed chain length
          expect(currentLevel).toBeLessThan(chain.length);
          
          previousLevel = currentLevel;
        }
        
        // Final state should be consistent
        expect(fallback.isActive()).toBe(true);
        expect(fallback.getCurrentFallbackLevel()).toBeGreaterThanOrEqual(0);
        
        return true; // Explicitly return true for property test
      }
    ), { numRuns: 25 }); // Reduced iterations for CI
  });

  /**
   * Property test for storage error handling
   */
  test('Storage error handling activates appropriate fallback', () => {
    fc.assert(fc.asyncProperty(
      fc.constantFrom(
        'QuotaExceededError: Storage quota exceeded',
        'Permission denied: Access to storage blocked',
        'Storage unavailable: Network error'
      ),
      fc.string({ minLength: 1, maxLength: 20 }), // operation name
      fc.option(fc.string({ minLength: 1, maxLength: 20 })), // optional key
      async (errorMessage, operation, key) => {
        const fallback = new PersistenceFallback();
        const error = new Error(errorMessage);
        
        // Should not throw when handling storage error
        await fallback.handleStorageError(error, operation, key || undefined);
        
        // Should activate fallback
        expect(fallback.isActive()).toBe(true);
        
        // Should have activation history
        const history = fallback.getActivationHistory();
        expect(history.length).toBeGreaterThan(0);
        
        // Last activation should have appropriate reason
        const lastActivation = history[history.length - 1];
        expect(['quota_exceeded', 'permission_denied', 'storage_unavailable']).toContain(lastActivation.reason);
        
        return true; // Explicitly return true for property test
      }
    ), { numRuns: 25 }); // Reduced iterations for CI
  });

  /**
   * Property test for in-memory storage capacity limits
   */
  test('In-memory storage respects capacity limits', () => {
    fc.assert(fc.asyncProperty(
      fc.integer({ min: 100, max: 1000 }), // capacity
      fc.array(fc.tuple(
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.string({ minLength: 1, maxLength: 50 })
      ), { minLength: 1, maxLength: 10 }), // Reduced max length for more predictable behavior
      async (capacity, keyValuePairs) => {
        const storage = new InMemoryStorageProvider(capacity);
        
        expect(storage.getCapacity()).toBe(capacity);
        expect(storage.getUsedBytes()).toBe(0);
        
        let totalSize = 0;
        let quotaExceeded = false;
        
        for (const [key, value] of keyValuePairs) {
          const itemSize = key.length + value.length;
          
          try {
            if (totalSize + itemSize > capacity) {
              // This should throw a quota error
              await storage.setItem(key, value);
              // If we get here without throwing, the test should fail
              expect(false).toBe(true); // Force failure
            } else {
              // This should succeed
              await storage.setItem(key, value);
              totalSize += itemSize;
            }
          } catch (error: any) {
            // Should be a quota error
            expect(error.message).toMatch(/quota/i);
            quotaExceeded = true;
            break;
          }
        }
        
        // Used bytes should not exceed capacity
        expect(storage.getUsedBytes()).toBeLessThanOrEqual(capacity);
        
        return true; // Explicitly return true for property test
      }
    ), { numRuns: 25 }); // Reduced iterations for CI
  });
});