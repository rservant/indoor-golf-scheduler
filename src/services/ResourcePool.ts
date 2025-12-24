/**
 * Resource Pool Service
 * 
 * Provides object pooling for frequently allocated objects to reduce
 * memory allocation overhead and improve performance.
 */

export interface PoolStats {
  totalCreated: number;
  totalAcquired: number;
  totalReleased: number;
  totalReused: number; // Track reused acquisitions directly
  currentAvailable: number;
  currentInUse: number;
  peakInUse: number;
  hitRate: number; // Percentage of acquisitions that reused existing objects
}

export interface PoolConfig<T> {
  name: string;
  factory: () => T;
  reset?: (item: T) => void;
  validate?: (item: T) => boolean;
  maxSize?: number;
  preAllocate?: number;
}

/**
 * Generic Resource Pool
 * 
 * Manages a pool of reusable objects to reduce allocation overhead
 */
export class ResourcePool<T> {
  private available: T[] = [];
  private inUse: Set<T> = new Set();
  private config: Required<PoolConfig<T>>;
  private stats: PoolStats;

  constructor(config: PoolConfig<T>) {
    this.config = {
      maxSize: 100,
      preAllocate: 0,
      reset: () => {}, // Default no-op reset
      validate: () => true, // Default always valid
      ...config
    };

    this.stats = {
      totalCreated: 0,
      totalAcquired: 0,
      totalReleased: 0,
      totalReused: 0,
      currentAvailable: 0,
      currentInUse: 0,
      peakInUse: 0,
      hitRate: 0
    };

    // Pre-allocate objects if requested
    if (this.config.preAllocate > 0) {
      this.preAllocateObjects(this.config.preAllocate);
    }
  }

  /**
   * Acquire an object from the pool
   */
  acquire(): T {
    this.stats.totalAcquired++;

    let item: T;
    let wasReused = false;

    // Try to reuse an existing object
    if (this.available.length > 0) {
      item = this.available.pop()!;
      wasReused = true;
      
      // Validate the object before reuse
      if (!this.config.validate(item)) {
        // Object is invalid, create a new one
        item = this.createNewObject();
        wasReused = false;
      }
    } else {
      // Create new object
      item = this.createNewObject();
    }

    // Track usage
    this.inUse.add(item);
    this.updateStats(wasReused);

    return item;
  }

  /**
   * Release an object back to the pool
   */
  release(item: T): void {
    if (!this.inUse.has(item)) {
      console.warn('Attempting to release object that was not acquired from this pool');
      return;
    }

    this.inUse.delete(item);
    this.stats.totalReleased++;

    // Reset the object for reuse
    try {
      this.config.reset(item);
      
      // Add back to available pool if under max size
      if (this.available.length < this.config.maxSize) {
        this.available.push(item);
      }
      // If pool is full, let the object be garbage collected
      
    } catch (error) {
      console.error(`Error resetting object in pool ${this.config.name}:`, error);
      // Don't add the object back to the pool if reset failed
    }

    this.updateStats(false);
  }

  /**
   * Clear the pool and release all objects
   */
  clear(): void {
    this.available.length = 0;
    this.inUse.clear();
    this.resetStats();
  }

  /**
   * Get pool statistics
   */
  getStats(): PoolStats {
    return { ...this.stats };
  }

  /**
   * Get pool configuration
   */
  getConfig(): PoolConfig<T> {
    return { ...this.config };
  }

  /**
   * Resize the pool
   */
  resize(newMaxSize: number): void {
    this.config.maxSize = newMaxSize;
    
    // If new size is smaller, remove excess objects
    if (this.available.length > newMaxSize) {
      this.available = this.available.slice(0, newMaxSize);
    }
  }

  /**
   * Pre-warm the pool with objects
   */
  preWarm(count: number): void {
    const toCreate = Math.min(count, this.config.maxSize - this.available.length);
    this.preAllocateObjects(toCreate);
  }

  /**
   * Create a new object using the factory
   */
  private createNewObject(): T {
    try {
      const item = this.config.factory();
      this.stats.totalCreated++;
      return item;
    } catch (error) {
      console.error(`Error creating object in pool ${this.config.name}:`, error);
      throw error;
    }
  }

  /**
   * Pre-allocate objects for the pool
   */
  private preAllocateObjects(count: number): void {
    for (let i = 0; i < count; i++) {
      if (this.available.length >= this.config.maxSize) {
        break;
      }
      
      try {
        const item = this.createNewObject();
        this.available.push(item);
      } catch (error) {
        console.error(`Error pre-allocating object ${i} in pool ${this.config.name}:`, error);
        break;
      }
    }
    
    // Update stats after pre-allocation
    this.updateStats(false);
  }

  /**
   * Update pool statistics
   */
  private updateStats(wasReused: boolean): void {
    this.stats.currentAvailable = this.available.length;
    this.stats.currentInUse = this.inUse.size;
    this.stats.peakInUse = Math.max(this.stats.peakInUse, this.stats.currentInUse);
    
    // Track reused acquisitions
    if (wasReused) {
      this.stats.totalReused++;
    }
    
    // Calculate hit rate (percentage of acquisitions that reused existing objects)
    if (this.stats.totalAcquired > 0) {
      this.stats.hitRate = (this.stats.totalReused / this.stats.totalAcquired) * 100;
    }
  }

  /**
   * Reset statistics
   */
  private resetStats(): void {
    this.stats = {
      totalCreated: 0,
      totalAcquired: 0,
      totalReleased: 0,
      totalReused: 0,
      currentAvailable: this.available.length,
      currentInUse: this.inUse.size,
      peakInUse: 0,
      hitRate: 0
    };
  }
}

/**
 * Resource Pool Manager
 * 
 * Manages multiple resource pools and provides centralized pool management
 */
export class ResourcePoolManager {
  private pools: Map<string, ResourcePool<any>> = new Map();

  /**
   * Create a new resource pool
   */
  createPool<T>(config: PoolConfig<T>): ResourcePool<T> {
    if (this.pools.has(config.name)) {
      throw new Error(`Pool with name '${config.name}' already exists`);
    }

    const pool = new ResourcePool<T>(config);
    this.pools.set(config.name, pool);
    return pool;
  }

  /**
   * Get an existing pool by name
   */
  getPool<T>(name: string): ResourcePool<T> | undefined {
    return this.pools.get(name) as ResourcePool<T> | undefined;
  }

  /**
   * Remove a pool
   */
  removePool(name: string): boolean {
    const pool = this.pools.get(name);
    if (pool) {
      pool.clear();
      return this.pools.delete(name);
    }
    return false;
  }

  /**
   * Get all pool names
   */
  getPoolNames(): string[] {
    return Array.from(this.pools.keys());
  }

  /**
   * Get statistics for all pools
   */
  getAllStats(): Record<string, PoolStats> {
    const stats: Record<string, PoolStats> = {};
    
    for (const [name, pool] of this.pools) {
      stats[name] = pool.getStats();
    }
    
    return stats;
  }

  /**
   * Clear all pools
   */
  clearAll(): void {
    for (const pool of this.pools.values()) {
      pool.clear();
    }
    this.pools.clear();
  }

  /**
   * Get total memory usage estimate for all pools
   */
  getTotalMemoryEstimate(): {
    totalObjects: number;
    availableObjects: number;
    inUseObjects: number;
  } {
    let totalObjects = 0;
    let availableObjects = 0;
    let inUseObjects = 0;

    for (const pool of this.pools.values()) {
      const stats = pool.getStats();
      totalObjects += stats.totalCreated;
      availableObjects += stats.currentAvailable;
      inUseObjects += stats.currentInUse;
    }

    return {
      totalObjects,
      availableObjects,
      inUseObjects
    };
  }
}

// Global resource pool manager
export const resourcePoolManager = new ResourcePoolManager();

// Common pool configurations for the Indoor Golf Scheduler

/**
 * Player object pool for frequently created player instances
 */
export const createPlayerPool = () => {
  return resourcePoolManager.createPool({
    name: 'players',
    factory: () => ({
      id: '',
      seasonId: '',
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      timePreference: 'Either' as const,
      handedness: 'right' as const,
      availability: {}
    }),
    reset: (player) => {
      player.id = '';
      player.seasonId = '';
      player.firstName = '';
      player.lastName = '';
      player.email = '';
      player.phone = '';
      player.timePreference = 'Either';
      player.handedness = 'right';
      player.availability = {};
    },
    maxSize: 200,
    preAllocate: 50
  });
};

/**
 * Foursome object pool for schedule generation
 */
export const createFoursomePool = () => {
  return resourcePoolManager.createPool({
    name: 'foursomes',
    factory: () => ({
      id: '',
      players: [] as string[],
      timeSlot: 'morning' as const
    }),
    reset: (foursome) => {
      foursome.id = '';
      foursome.players.length = 0;
      foursome.timeSlot = 'morning';
    },
    maxSize: 100,
    preAllocate: 20
  });
};

/**
 * Array pool for temporary arrays used in calculations
 */
export const createArrayPool = <T>() => {
  return resourcePoolManager.createPool({
    name: 'arrays',
    factory: () => [] as T[],
    reset: (array) => {
      array.length = 0;
    },
    maxSize: 50,
    preAllocate: 10
  });
};