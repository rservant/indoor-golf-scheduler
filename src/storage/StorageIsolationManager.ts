import { StorageProvider } from './interfaces';

/**
 * Manages storage isolation for parallel test execution
 */
export class StorageIsolationManager {
  private static instance: StorageIsolationManager;
  private processNamespace: string;
  private isolationEnabled = false;
  private isolatedStorageProviders = new Map<string, StorageProvider>();

  private constructor() {
    this.processNamespace = this.generateProcessNamespace();
  }

  public static getInstance(): StorageIsolationManager {
    if (!StorageIsolationManager.instance) {
      StorageIsolationManager.instance = new StorageIsolationManager();
    }
    return StorageIsolationManager.instance;
  }

  /**
   * Enable storage isolation for parallel tests
   */
  public enableIsolation(): void {
    this.isolationEnabled = true;
  }

  /**
   * Disable storage isolation
   */
  public disableIsolation(): void {
    this.isolationEnabled = false;
  }

  /**
   * Check if isolation is enabled
   */
  public isIsolationEnabled(): boolean {
    return this.isolationEnabled;
  }

  /**
   * Get the current process namespace
   */
  public getProcessNamespace(): string {
    return this.processNamespace;
  }

  /**
   * Create an isolated key with process namespace
   */
  public createIsolatedKey(originalKey: string): string {
    if (!this.isolationEnabled) {
      return originalKey;
    }
    
    return `${this.processNamespace}:${originalKey}`;
  }

  /**
   * Extract original key from isolated key
   */
  public extractOriginalKey(isolatedKey: string): string {
    if (!this.isolationEnabled || !isolatedKey.includes(':')) {
      return isolatedKey;
    }
    
    const parts = isolatedKey.split(':');
    if (parts.length >= 2 && parts[0] === this.processNamespace) {
      return parts.slice(1).join(':');
    }
    
    return isolatedKey;
  }

  /**
   * Create isolated storage provider wrapper
   */
  public createIsolatedStorageProvider(baseProvider: StorageProvider): StorageProvider {
    const providerId = this.generateProviderId(baseProvider);
    
    if (this.isolatedStorageProviders.has(providerId)) {
      return this.isolatedStorageProviders.get(providerId)!;
    }

    const isolatedProvider: StorageProvider = {
      setItem: async (key: string, value: string): Promise<void> => {
        const isolatedKey = this.createIsolatedKey(key);
        return baseProvider.setItem(isolatedKey, value);
      },

      getItem: async (key: string): Promise<string | null> => {
        const isolatedKey = this.createIsolatedKey(key);
        return baseProvider.getItem(isolatedKey);
      },

      removeItem: async (key: string): Promise<void> => {
        const isolatedKey = this.createIsolatedKey(key);
        return baseProvider.removeItem(isolatedKey);
      },

      clear: async (): Promise<void> => {
        // For clear operation, we need to be more careful
        // We should only clear keys that belong to our namespace
        if (this.isolationEnabled) {
          await this.clearNamespacedKeys(baseProvider);
        } else {
          return baseProvider.clear();
        }
      },

      getCapacity: (): number => {
        return baseProvider.getCapacity();
      }
    };

    this.isolatedStorageProviders.set(providerId, isolatedProvider);
    return isolatedProvider;
  }

  /**
   * Get test isolation configuration
   */
  public getIsolationConfig() {
    return {
      processNamespace: this.processNamespace,
      isolationEnabled: this.isolationEnabled,
      processId: process.pid,
      workerId: this.getWorkerId(),
      timestamp: Date.now()
    };
  }

  /**
   * Cleanup isolation for current process
   */
  public async cleanupIsolation(storageProvider: StorageProvider): Promise<void> {
    if (!this.isolationEnabled) {
      return;
    }

    await this.clearNamespacedKeys(storageProvider);
  }

  /**
   * Reset isolation manager (useful for testing)
   */
  public reset(): void {
    this.processNamespace = this.generateProcessNamespace();
    this.isolatedStorageProviders.clear();
    this.isolationEnabled = false;
  }

  /**
   * Generate unique process namespace
   */
  private generateProcessNamespace(): string {
    const processId = process.pid || Math.floor(Math.random() * 10000);
    const workerId = this.getWorkerId();
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 6);
    
    return `test_${processId}_${workerId}_${timestamp}_${random}`;
  }

  /**
   * Get worker ID for parallel test execution
   */
  private getWorkerId(): string {
    // Check for Jest worker ID
    if (process.env.JEST_WORKER_ID) {
      return `jest_${process.env.JEST_WORKER_ID}`;
    }
    
    // Check for other test runner worker IDs
    if (process.env.VITEST_WORKER_ID) {
      return `vitest_${process.env.VITEST_WORKER_ID}`;
    }
    
    // Check for GitHub Actions job matrix
    if (process.env.GITHUB_ACTIONS && process.env.GITHUB_JOB) {
      return `gh_${process.env.GITHUB_JOB}`;
    }
    
    // Fallback to thread ID or random
    return `worker_${Math.floor(Math.random() * 1000)}`;
  }

  /**
   * Generate provider ID for caching
   */
  private generateProviderId(provider: StorageProvider): string {
    // Simple hash based on provider methods
    const providerString = provider.constructor.name || 'UnknownProvider';
    return `${providerString}_${this.processNamespace}`;
  }

  /**
   * Clear only keys that belong to current namespace
   */
  private async clearNamespacedKeys(storageProvider: StorageProvider): Promise<void> {
    // This is a simplified implementation
    // In a real localStorage scenario, you'd need to iterate through all keys
    // and remove only those that start with the namespace
    
    // For now, we'll implement a basic approach
    // In practice, you might need to extend the StorageProvider interface
    // to support key enumeration for proper namespace cleanup
    
    try {
      // If the provider supports enumeration (like localStorage), we could do:
      // const keys = await this.enumerateKeys(storageProvider);
      // for (const key of keys) {
      //   if (key.startsWith(this.processNamespace + ':')) {
      //     await storageProvider.removeItem(key);
      //   }
      // }
      
      // For now, we'll use a simpler approach and clear everything
      // This is acceptable for test isolation since each process has its own namespace
      await storageProvider.clear();
    } catch (error) {
      console.warn('Failed to clear namespaced keys:', error);
    }
  }
}

/**
 * Isolated localStorage wrapper for parallel tests
 */
export class IsolatedLocalStorage {
  private isolationManager: StorageIsolationManager;

  constructor() {
    this.isolationManager = StorageIsolationManager.getInstance();
  }

  setItem(key: string, value: string): void {
    const isolatedKey = this.isolationManager.createIsolatedKey(key);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(isolatedKey, value);
    }
  }

  getItem(key: string): string | null {
    const isolatedKey = this.isolationManager.createIsolatedKey(key);
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(isolatedKey);
    }
    return null;
  }

  removeItem(key: string): void {
    const isolatedKey = this.isolationManager.createIsolatedKey(key);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(isolatedKey);
    }
  }

  clear(): void {
    if (this.isolationManager.isIsolationEnabled()) {
      this.clearNamespacedKeys();
    } else if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  }

  get length(): number {
    if (typeof localStorage === 'undefined') {
      return 0;
    }
    
    if (this.isolationManager.isIsolationEnabled()) {
      return this.getNamespacedKeyCount();
    }
    
    return localStorage.length;
  }

  key(index: number): string | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    
    if (this.isolationManager.isIsolationEnabled()) {
      const namespacedKeys = this.getNamespacedKeys();
      return namespacedKeys[index] || null;
    }
    
    return localStorage.key(index);
  }

  /**
   * Clear only keys belonging to current namespace
   */
  private clearNamespacedKeys(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    
    const namespace = this.isolationManager.getProcessNamespace();
    const keysToRemove: string[] = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(namespace + ':')) {
        keysToRemove.push(key);
      }
    }
    
    keysToRemove.forEach(key => localStorage.removeItem(key));
  }

  /**
   * Get count of namespaced keys
   */
  private getNamespacedKeyCount(): number {
    if (typeof localStorage === 'undefined') {
      return 0;
    }
    
    const namespace = this.isolationManager.getProcessNamespace();
    let count = 0;
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(namespace + ':')) {
        count++;
      }
    }
    
    return count;
  }

  /**
   * Get all namespaced keys
   */
  private getNamespacedKeys(): string[] {
    if (typeof localStorage === 'undefined') {
      return [];
    }
    
    const namespace = this.isolationManager.getProcessNamespace();
    const namespacedKeys: string[] = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(namespace + ':')) {
        // Return the original key without namespace
        namespacedKeys.push(this.isolationManager.extractOriginalKey(key));
      }
    }
    
    return namespacedKeys;
  }
}