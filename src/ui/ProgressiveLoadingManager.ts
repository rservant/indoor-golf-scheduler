/**
 * Progressive Loading Manager for Large Datasets
 * Manages loading and rendering of large datasets in chunks
 */

export interface ProgressiveLoadingConfig {
  chunkSize: number;
  loadDelay: number;
  maxConcurrentLoads: number;
  enablePreloading: boolean;
}

export interface LoadingChunk<T> {
  id: string;
  startIndex: number;
  endIndex: number;
  data: T[];
  isLoaded: boolean;
  isLoading: boolean;
  loadPromise?: Promise<T[]>;
}

export interface ProgressiveLoadingState<T> {
  totalItems: number;
  loadedItems: number;
  chunks: LoadingChunk<T>[];
  isComplete: boolean;
}

export type DataLoader<T> = (startIndex: number, count: number) => Promise<T[]>;
export type LoadingProgressCallback = (loaded: number, total: number) => void;

export class ProgressiveLoadingManager<T> {
  private config: ProgressiveLoadingConfig;
  private dataLoader: DataLoader<T>;
  private state: ProgressiveLoadingState<T>;
  private onProgress?: LoadingProgressCallback;
  private activeLoads = new Set<Promise<any>>();

  constructor(
    config: ProgressiveLoadingConfig,
    dataLoader: DataLoader<T>,
    onProgress?: LoadingProgressCallback
  ) {
    this.config = config;
    this.dataLoader = dataLoader;
    this.onProgress = onProgress || (() => {});
    this.state = {
      totalItems: 0,
      loadedItems: 0,
      chunks: [],
      isComplete: false
    };
  }

  /**
   * Initialize progressive loading for a dataset
   */
  async initialize(totalItems: number): Promise<void> {
    this.state.totalItems = totalItems;
    this.state.loadedItems = 0;
    this.state.chunks = [];
    this.state.isComplete = false;

    // Create chunks
    const chunkCount = Math.ceil(totalItems / this.config.chunkSize);
    for (let i = 0; i < chunkCount; i++) {
      const startIndex = i * this.config.chunkSize;
      const endIndex = Math.min(startIndex + this.config.chunkSize - 1, totalItems - 1);
      
      this.state.chunks.push({
        id: `chunk-${i}`,
        startIndex,
        endIndex,
        data: [],
        isLoaded: false,
        isLoading: false
      });
    }

    // Load initial chunks
    await this.loadInitialChunks();
  }

  /**
   * Load initial chunks (first few chunks)
   */
  private async loadInitialChunks(): Promise<void> {
    const initialChunkCount = Math.min(2, this.state.chunks.length);
    const loadPromises: Promise<void>[] = [];

    for (let i = 0; i < initialChunkCount; i++) {
      loadPromises.push(this.loadChunk(i));
    }

    await Promise.all(loadPromises);
  }

  /**
   * Load a specific chunk
   */
  async loadChunk(chunkIndex: number): Promise<void> {
    const chunk = this.state.chunks[chunkIndex];
    if (!chunk || chunk.isLoaded || chunk.isLoading) {
      return;
    }

    // Check concurrent load limit
    if (this.activeLoads.size >= this.config.maxConcurrentLoads) {
      await Promise.race(this.activeLoads);
    }

    chunk.isLoading = true;
    const itemCount = chunk.endIndex - chunk.startIndex + 1;
    
    const loadPromise = this.dataLoader(chunk.startIndex, itemCount)
      .then(data => {
        chunk.data = data;
        chunk.isLoaded = true;
        chunk.isLoading = false;
        this.state.loadedItems += data.length;
        
        if (this.onProgress) {
          this.onProgress(this.state.loadedItems, this.state.totalItems);
        }

        // Check if all chunks are loaded
        if (this.state.chunks.every(c => c.isLoaded)) {
          this.state.isComplete = true;
        }

        return data;
      })
      .catch(error => {
        chunk.isLoading = false;
        console.error(`Failed to load chunk ${chunkIndex}:`, error);
        throw error;
      })
      .finally(() => {
        this.activeLoads.delete(loadPromise);
      });

    chunk.loadPromise = loadPromise;
    this.activeLoads.add(loadPromise);

    await loadPromise;
  }

  /**
   * Load chunks for a specific range (for virtual scrolling)
   */
  async loadRange(startIndex: number, endIndex: number): Promise<T[]> {
    const startChunk = Math.floor(startIndex / this.config.chunkSize);
    const endChunk = Math.floor(endIndex / this.config.chunkSize);
    
    const loadPromises: Promise<void>[] = [];
    
    // Load all chunks in the range
    for (let i = startChunk; i <= endChunk; i++) {
      if (i < this.state.chunks.length) {
        loadPromises.push(this.loadChunk(i));
      }
    }

    await Promise.all(loadPromises);

    // Collect data from loaded chunks
    const result: T[] = [];
    for (let i = startChunk; i <= endChunk; i++) {
      const chunk = this.state.chunks[i];
      if (chunk && chunk.isLoaded) {
        const chunkStartIndex = Math.max(startIndex, chunk.startIndex);
        const chunkEndIndex = Math.min(endIndex, chunk.endIndex);
        const relativeStart = chunkStartIndex - chunk.startIndex;
        const relativeEnd = chunkEndIndex - chunk.startIndex;
        
        result.push(...chunk.data.slice(relativeStart, relativeEnd + 1));
      }
    }

    return result;
  }

  /**
   * Preload chunks around a specific index
   */
  async preloadAround(centerIndex: number, radius: number = 1): Promise<void> {
    if (!this.config.enablePreloading) return;

    const centerChunk = Math.floor(centerIndex / this.config.chunkSize);
    const startChunk = Math.max(0, centerChunk - radius);
    const endChunk = Math.min(this.state.chunks.length - 1, centerChunk + radius);

    const preloadPromises: Promise<void>[] = [];
    
    for (let i = startChunk; i <= endChunk; i++) {
      // Add delay to prevent overwhelming the system
      setTimeout(() => {
        this.loadChunk(i).catch(error => {
          console.warn(`Preload failed for chunk ${i}:`, error);
        });
      }, (i - startChunk) * this.config.loadDelay);
    }
  }

  /**
   * Get items for a specific range (may return partial data if not loaded)
   */
  getItems(startIndex: number, endIndex: number): T[] {
    const result: T[] = [];
    const startChunk = Math.floor(startIndex / this.config.chunkSize);
    const endChunk = Math.floor(endIndex / this.config.chunkSize);

    for (let i = startChunk; i <= endChunk; i++) {
      const chunk = this.state.chunks[i];
      if (chunk && chunk.isLoaded) {
        const chunkStartIndex = Math.max(startIndex, chunk.startIndex);
        const chunkEndIndex = Math.min(endIndex, chunk.endIndex);
        const relativeStart = chunkStartIndex - chunk.startIndex;
        const relativeEnd = chunkEndIndex - chunk.startIndex;
        
        result.push(...chunk.data.slice(relativeStart, relativeEnd + 1));
      }
    }

    return result;
  }

  /**
   * Check if a range is fully loaded
   */
  isRangeLoaded(startIndex: number, endIndex: number): boolean {
    const startChunk = Math.floor(startIndex / this.config.chunkSize);
    const endChunk = Math.floor(endIndex / this.config.chunkSize);

    for (let i = startChunk; i <= endChunk; i++) {
      const chunk = this.state.chunks[i];
      if (!chunk || !chunk.isLoaded) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get loading progress
   */
  getProgress(): { loaded: number; total: number; percentage: number } {
    const percentage = this.state.totalItems > 0 
      ? (this.state.loadedItems / this.state.totalItems) * 100 
      : 0;

    return {
      loaded: this.state.loadedItems,
      total: this.state.totalItems,
      percentage
    };
  }

  /**
   * Get current state
   */
  getState(): ProgressiveLoadingState<T> {
    return { ...this.state };
  }

  /**
   * Clear all loaded data and reset
   */
  reset(): void {
    // Cancel active loads
    this.activeLoads.clear();
    
    this.state = {
      totalItems: 0,
      loadedItems: 0,
      chunks: [],
      isComplete: false
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ProgressiveLoadingConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}