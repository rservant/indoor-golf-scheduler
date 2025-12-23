/**
 * Base repository interface defining common CRUD operations
 */
export interface BaseRepository<T, TCreate = Partial<T>> {
  /**
   * Create a new entity
   */
  create(data: TCreate): Promise<T>;

  /**
   * Find an entity by ID
   */
  findById(id: string): Promise<T | null>;

  /**
   * Find all entities
   */
  findAll(): Promise<T[]>;

  /**
   * Update an entity
   */
  update(id: string, data: Partial<T>): Promise<T | null>;

  /**
   * Delete an entity
   */
  delete(id: string): Promise<boolean>;

  /**
   * Check if an entity exists
   */
  exists(id: string): Promise<boolean>;
}

/**
 * Local storage implementation of base repository
 */
export abstract class LocalStorageRepository<T extends { id: string }, TCreate = Partial<T>> implements BaseRepository<T, TCreate> {
  protected abstract storageKey: string;

  protected getStorageData(): T[] {
    try {
      const data = localStorage.getItem(this.storageKey);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error(`Error reading from localStorage for key ${this.storageKey}:`, error);
      return [];
    }
  }

  protected setStorageData(data: T[]): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (error) {
      console.error(`Error writing to localStorage for key ${this.storageKey}:`, error);
      throw new Error(`Failed to save data to storage: ${error}`);
    }
  }

  protected abstract createEntity(data: TCreate): T;

  async create(data: TCreate): Promise<T> {
    const entity = this.createEntity(data);
    const allData = this.getStorageData();
    
    // Check for duplicate ID
    if (allData.some(item => item.id === entity.id)) {
      throw new Error(`Entity with ID ${entity.id} already exists`);
    }
    
    allData.push(entity);
    this.setStorageData(allData);
    return entity;
  }

  async findById(id: string): Promise<T | null> {
    const allData = this.getStorageData();
    return allData.find(item => item.id === id) || null;
  }

  async findAll(): Promise<T[]> {
    return this.getStorageData();
  }

  async update(id: string, updates: Partial<T>): Promise<T | null> {
    const allData = this.getStorageData();
    const index = allData.findIndex(item => item.id === id);
    
    if (index === -1) {
      return null;
    }

    // Merge updates with existing data
    const updatedEntity = { ...allData[index], ...updates };
    allData[index] = updatedEntity;
    this.setStorageData(allData);
    
    return updatedEntity;
  }

  async delete(id: string): Promise<boolean> {
    const allData = this.getStorageData();
    const index = allData.findIndex(item => item.id === id);
    
    if (index === -1) {
      return false;
    }

    allData.splice(index, 1);
    this.setStorageData(allData);
    return true;
  }

  async exists(id: string): Promise<boolean> {
    const allData = this.getStorageData();
    return allData.some(item => item.id === id);
  }

  /**
   * Clear all data from storage (useful for testing)
   */
  async clear(): Promise<void> {
    this.setStorageData([]);
  }

  /**
   * Get count of entities
   */
  async count(): Promise<number> {
    return this.getStorageData().length;
  }
}