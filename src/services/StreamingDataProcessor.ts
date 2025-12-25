/**
 * Streaming Data Processor
 * 
 * Provides streaming and chunking strategies for processing large datasets
 * without excessive memory consumption.
 */

export interface StreamingConfig {
  chunkSize: number;
  maxConcurrentChunks: number;
  memoryThreshold: number; // bytes
  enableBackpressure: boolean;
  processingTimeout: number; // milliseconds
}

export interface ProcessingStats {
  totalItems: number;
  processedItems: number;
  failedItems: number;
  chunksProcessed: number;
  averageChunkTime: number;
  peakMemoryUsage: number;
  totalProcessingTime: number;
}

export interface ChunkResult<T> {
  success: boolean;
  processedItems: T[];
  errors: Error[];
  memoryUsage: number;
  processingTime: number;
}

export type ChunkProcessor<T, R> = (chunk: T[]) => Promise<R[]> | R[];
export type StreamingProgressCallback = (stats: ProcessingStats) => void;

/**
 * Streaming Data Processor
 * 
 * Processes large datasets in chunks to limit memory consumption
 */
export class StreamingDataProcessor<T, R = T> {
  private config: StreamingConfig;
  private stats: ProcessingStats;
  private isProcessing = false;
  private abortController: AbortController | null = null;

  constructor(config?: Partial<StreamingConfig>) {
    this.config = {
      chunkSize: 100,
      maxConcurrentChunks: 3,
      memoryThreshold: 50 * 1024 * 1024, // 50MB
      enableBackpressure: true,
      processingTimeout: 30000, // 30 seconds
      ...config
    };

    this.stats = {
      totalItems: 0,
      processedItems: 0,
      failedItems: 0,
      chunksProcessed: 0,
      averageChunkTime: 0,
      peakMemoryUsage: 0,
      totalProcessingTime: 0
    };
  }

  /**
   * Process data in streaming chunks
   */
  async processStream(
    data: T[],
    processor: ChunkProcessor<T, R>,
    progressCallback?: StreamingProgressCallback
  ): Promise<R[]> {
    if (this.isProcessing) {
      throw new Error('Processor is already running');
    }

    this.isProcessing = true;
    this.abortController = new AbortController();
    
    const startTime = performance.now();
    const results: R[] = [];
    
    try {
      // Initialize stats
      this.stats = {
        totalItems: data.length,
        processedItems: 0,
        failedItems: 0,
        chunksProcessed: 0,
        averageChunkTime: 0,
        peakMemoryUsage: 0,
        totalProcessingTime: 0
      };

      // Create chunks
      const chunks = this.createChunks(data);
      console.log(`Processing ${data.length} items in ${chunks.length} chunks`);

      // Process chunks with concurrency control
      const chunkResults = await this.processChunksWithConcurrency(
        chunks,
        processor,
        progressCallback
      );

      // Collect results
      for (const chunkResult of chunkResults) {
        if (chunkResult.success) {
          results.push(...chunkResult.processedItems);
        }
      }

      // Update final stats
      this.stats.totalProcessingTime = performance.now() - startTime;
      
      console.log(`Stream processing completed: ${results.length} items processed in ${this.stats.totalProcessingTime.toFixed(2)}ms`);
      
      return results;

    } catch (error) {
      console.error('Stream processing failed:', error);
      throw error;
    } finally {
      this.isProcessing = false;
      this.abortController = null;
    }
  }

  /**
   * Process data with memory-aware chunking
   */
  async processWithMemoryAwareness(
    data: T[],
    processor: ChunkProcessor<T, R>,
    progressCallback?: StreamingProgressCallback
  ): Promise<R[]> {
    const results: R[] = [];
    let currentIndex = 0;
    
    while (currentIndex < data.length) {
      // Check memory usage before processing next chunk
      const memoryUsage = this.getCurrentMemoryUsage();
      
      if (memoryUsage > this.config.memoryThreshold) {
        console.warn(`Memory threshold exceeded (${(memoryUsage / 1024 / 1024).toFixed(2)}MB), triggering cleanup`);
        
        // Trigger garbage collection and wait
        await this.triggerMemoryCleanup();
        await this.delay(100); // Allow GC to complete
      }

      // Adjust chunk size based on memory pressure
      const adaptiveChunkSize = this.calculateAdaptiveChunkSize(memoryUsage);
      const chunk = data.slice(currentIndex, currentIndex + adaptiveChunkSize);
      
      if (chunk.length === 0) break;

      try {
        const chunkResults = await this.processChunk(chunk, processor);
        
        if (chunkResults.success) {
          results.push(...chunkResults.processedItems);
          this.stats.processedItems += chunk.length;
        } else {
          this.stats.failedItems += chunk.length;
        }

        this.updateChunkStats(chunkResults);
        
        if (progressCallback) {
          progressCallback(this.getStats());
        }

      } catch (error) {
        console.error(`Error processing chunk at index ${currentIndex}:`, error);
        this.stats.failedItems += chunk.length;
      }

      currentIndex += adaptiveChunkSize;
      
      // Check for abort signal
      if (this.abortController?.signal.aborted) {
        throw new Error('Processing aborted');
      }
    }

    return results;
  }

  /**
   * Create an async iterator for streaming processing
   */
  async* streamProcess(
    data: T[],
    processor: ChunkProcessor<T, R>
  ): AsyncGenerator<R[], void, unknown> {
    const chunks = this.createChunks(data);
    
    for (const chunk of chunks) {
      try {
        const result = await this.processChunk(chunk, processor);
        
        if (result.success) {
          yield result.processedItems;
          this.stats.processedItems += chunk.length;
        } else {
          this.stats.failedItems += chunk.length;
        }

        this.updateChunkStats(result);

      } catch (error) {
        console.error('Error in stream processing:', error);
        this.stats.failedItems += chunk.length;
      }

      // Check for abort signal
      if (this.abortController?.signal.aborted) {
        break;
      }
    }
  }

  /**
   * Abort current processing
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      console.log('Stream processing aborted');
    }
  }

  /**
   * Get processing statistics
   */
  getStats(): ProcessingStats {
    return { ...this.stats };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<StreamingConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Create chunks from data array
   */
  private createChunks(data: T[]): T[][] {
    const chunks: T[][] = [];
    
    for (let i = 0; i < data.length; i += this.config.chunkSize) {
      chunks.push(data.slice(i, i + this.config.chunkSize));
    }
    
    return chunks;
  }

  /**
   * Process chunks with concurrency control
   */
  private async processChunksWithConcurrency(
    chunks: T[][],
    processor: ChunkProcessor<T, R>,
    progressCallback?: StreamingProgressCallback
  ): Promise<ChunkResult<R>[]> {
    const results: ChunkResult<R>[] = [];
    const activePromises: Promise<ChunkResult<R>>[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      // Create processing promise
      const chunkPromise = this.processChunk(chunk, processor);
      activePromises.push(chunkPromise);

      // Wait if we've reached max concurrency
      if (activePromises.length >= this.config.maxConcurrentChunks || i === chunks.length - 1) {
        const chunkResults = await Promise.all(activePromises);
        results.push(...chunkResults);
        
        // Update stats and call progress callback
        for (const result of chunkResults) {
          this.updateChunkStats(result);
          this.stats.processedItems += result.processedItems.length;
          this.stats.failedItems += result.errors.length;
        }
        
        if (progressCallback) {
          progressCallback(this.getStats());
        }

        // Clear active promises
        activePromises.length = 0;

        // Check memory pressure and apply backpressure if needed
        if (this.config.enableBackpressure) {
          await this.applyBackpressure();
        }
      }

      // Check for abort signal
      if (this.abortController?.signal.aborted) {
        break;
      }
    }

    return results;
  }

  /**
   * Process a single chunk
   */
  private async processChunk(
    chunk: T[],
    processor: ChunkProcessor<T, R>
  ): Promise<ChunkResult<R>> {
    const startTime = performance.now();
    const startMemory = this.getCurrentMemoryUsage();

    try {
      // Process with timeout
      const processedItems = await Promise.race([
        Promise.resolve(processor(chunk)),
        new Promise<R[]>((_, reject) => 
          setTimeout(() => reject(new Error('Processing timeout')), this.config.processingTimeout)
        )
      ]);

      const endTime = performance.now();
      const endMemory = this.getCurrentMemoryUsage();

      return {
        success: true,
        processedItems,
        errors: [],
        memoryUsage: Math.max(endMemory - startMemory, 0),
        processingTime: endTime - startTime
      };

    } catch (error) {
      const endTime = performance.now();
      const endMemory = this.getCurrentMemoryUsage();

      return {
        success: false,
        processedItems: [],
        errors: [error as Error],
        memoryUsage: Math.max(endMemory - startMemory, 0),
        processingTime: endTime - startTime
      };
    }
  }

  /**
   * Update chunk processing statistics
   */
  private updateChunkStats(result: ChunkResult<R>): void {
    this.stats.chunksProcessed++;
    
    // Update average chunk time
    if (this.stats.chunksProcessed > 0) {
      this.stats.averageChunkTime = 
        (this.stats.averageChunkTime * (this.stats.chunksProcessed - 1) + result.processingTime) / 
        this.stats.chunksProcessed;
    }

    // Update peak memory usage
    this.stats.peakMemoryUsage = Math.max(this.stats.peakMemoryUsage, result.memoryUsage);
  }

  /**
   * Apply backpressure based on memory usage
   */
  private async applyBackpressure(): Promise<void> {
    const memoryUsage = this.getCurrentMemoryUsage();
    
    if (memoryUsage > this.config.memoryThreshold) {
      const delayMs = Math.min(1000, (memoryUsage / this.config.memoryThreshold) * 100);
      console.log(`Applying backpressure: ${delayMs}ms delay due to memory usage`);
      await this.delay(delayMs);
    }
  }

  /**
   * Calculate adaptive chunk size based on memory usage
   */
  private calculateAdaptiveChunkSize(memoryUsage: number): number {
    const memoryPressure = memoryUsage / this.config.memoryThreshold;
    
    if (memoryPressure > 1.5) {
      return Math.max(10, Math.floor(this.config.chunkSize * 0.25)); // 25% of normal size
    } else if (memoryPressure > 1.0) {
      return Math.max(25, Math.floor(this.config.chunkSize * 0.5)); // 50% of normal size
    } else if (memoryPressure > 0.8) {
      return Math.max(50, Math.floor(this.config.chunkSize * 0.75)); // 75% of normal size
    } else {
      return this.config.chunkSize; // Normal size
    }
  }

  /**
   * Get current memory usage
   */
  private getCurrentMemoryUsage(): number {
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      const memory = (performance as any).memory;
      return memory.usedJSHeapSize || 0;
    }
    return 0;
  }

  /**
   * Trigger memory cleanup
   */
  private async triggerMemoryCleanup(): Promise<void> {
    // Force garbage collection if available
    if (typeof global !== 'undefined' && global.gc) {
      global.gc();
    }
    
    // Create memory pressure to encourage GC
    const temp = new Array(1000).fill(null);
    temp.length = 0;
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Utility functions for common streaming operations
 */

/**
 * Process players in streaming chunks
 */
export async function processPlayersStream<R>(
  players: any[],
  processor: ChunkProcessor<any, R>,
  config?: Partial<StreamingConfig>
): Promise<R[]> {
  const streamProcessor = new StreamingDataProcessor<any, R>(config);
  return streamProcessor.processStream(players, processor);
}

/**
 * Process schedule data in memory-aware chunks
 */
export async function processScheduleDataStream<R>(
  scheduleData: any[],
  processor: ChunkProcessor<any, R>,
  config?: Partial<StreamingConfig>
): Promise<R[]> {
  const streamProcessor = new StreamingDataProcessor<any, R>({
    chunkSize: 50, // Smaller chunks for schedule data
    memoryThreshold: 30 * 1024 * 1024, // 30MB threshold
    ...config
  });
  
  return streamProcessor.processWithMemoryAwareness(scheduleData, processor);
}