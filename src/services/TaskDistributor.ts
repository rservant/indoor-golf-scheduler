/**
 * Task Distribution and Load Balancing for Parallel Processing
 * 
 * Manages the distribution of computational tasks across available workers
 * with intelligent load balancing and progress tracking.
 * 
 * Validates Requirements 1.1, 1.4, 1.5
 */

import { WorkerPool } from './WorkerPool';
import { ProgressReporter, ProgressUpdate } from './ProgressReporter';

export interface TaskChunk<T = any> {
  id: string;
  data: T;
  weight: number; // Computational weight for load balancing
  dependencies?: string[]; // Task dependencies
}

export interface DistributionStrategy {
  type: 'round-robin' | 'weighted' | 'adaptive';
  maxChunkSize?: number;
  minChunkSize?: number;
  balanceThreshold?: number;
}

export interface TaskDistributionOptions {
  strategy?: DistributionStrategy;
  enableProgressReporting?: boolean;
  progressCallback?: (progress: ProgressUpdate) => void;
  maxConcurrency?: number;
  timeout?: number;
}

export interface TaskResult<R = any> {
  chunkId: string;
  result: R;
  processingTime: number;
  workerStats?: any;
}

export interface DistributionStats {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  averageProcessingTime: number;
  totalProcessingTime: number;
  workerUtilization: number;
  throughput: number; // tasks per second
}

export class TaskDistributor {
  private workerPool: WorkerPool;
  private progressReporter: ProgressReporter;
  private options: Required<TaskDistributionOptions>;
  private stats: DistributionStats;
  private activeDistributions: Map<string, Promise<any>> = new Map();

  constructor(
    workerPool: WorkerPool,
    options: TaskDistributionOptions = {}
  ) {
    this.workerPool = workerPool;
    this.progressReporter = new ProgressReporter();
    
    this.options = {
      strategy: options.strategy || { type: 'adaptive' },
      enableProgressReporting: options.enableProgressReporting || true,
      progressCallback: options.progressCallback || (() => {}),
      maxConcurrency: options.maxConcurrency || 0, // 0 = unlimited
      timeout: options.timeout || 60000 // 1 minute
    };

    this.stats = {
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      averageProcessingTime: 0,
      totalProcessingTime: 0,
      workerUtilization: 0,
      throughput: 0
    };
  }

  /**
   * Distribute and execute tasks across workers
   */
  async distributeTasks<T, R>(
    taskType: string,
    data: T[],
    chunkProcessor: (chunk: T[]) => TaskChunk<T[]>,
    options?: Partial<TaskDistributionOptions>
  ): Promise<R[]> {
    const distributionId = `dist-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    try {
      // Merge options
      const effectiveOptions = { ...this.options, ...options };

      // Initialize progress reporting
      if (effectiveOptions.enableProgressReporting) {
        this.progressReporter.report('distribution', 0, `Starting distribution of ${data.length} items`, { distributionId, totalItems: data.length });
      }

      // Create task chunks
      const chunks = this.createTaskChunks(data, chunkProcessor, effectiveOptions.strategy);
      
      this.reportProgress(distributionId, {
        phase: 'chunking',
        percentage: 10,
        message: `Created ${chunks.length} task chunks`,
        metadata: { totalItems: data.length },
        timestamp: Date.now()
      });

      // Distribute chunks across workers
      const results = await this.executeChunks<T[], R>(
        distributionId,
        taskType,
        chunks,
        effectiveOptions
      );

      // Update statistics
      const totalTime = Date.now() - startTime;
      this.updateStats(chunks.length, totalTime);

      this.reportProgress(distributionId, {
        phase: 'complete',
        percentage: 100,
        message: `Completed ${chunks.length} tasks in ${totalTime}ms`,
        metadata: { totalItems: data.length },
        timestamp: Date.now()
      });

      return results;

    } catch (error) {
      const totalTime = Date.now() - startTime;
      this.stats.failedTasks += data.length;
      
      this.reportProgress(distributionId, {
        phase: 'error',
        percentage: 100,
        message: `Distribution failed after ${totalTime}ms: ${error instanceof Error ? error.message : 'Unknown error'}`,
        metadata: { totalItems: data.length },
        timestamp: Date.now()
      });

      throw error;
    } finally {
      this.activeDistributions.delete(distributionId);
      
      if (this.options.enableProgressReporting) {
        this.progressReporter.report('distribution', 100, `Distribution ${distributionId} completed`);
      }
    }
  }

  /**
   * Create task chunks based on distribution strategy
   */
  private createTaskChunks<T>(
    data: T[],
    chunkProcessor: (chunk: T[]) => TaskChunk<T[]>,
    strategy: DistributionStrategy
  ): TaskChunk<T[]>[] {
    const chunks: TaskChunk<T[]>[] = [];
    
    switch (strategy.type) {
      case 'round-robin':
        return this.createRoundRobinChunks(data, chunkProcessor, strategy);
      
      case 'weighted':
        return this.createWeightedChunks(data, chunkProcessor, strategy);
      
      case 'adaptive':
      default:
        return this.createAdaptiveChunks(data, chunkProcessor, strategy);
    }
  }

  /**
   * Create chunks using round-robin distribution
   */
  private createRoundRobinChunks<T>(
    data: T[],
    chunkProcessor: (chunk: T[]) => TaskChunk<T[]>,
    strategy: DistributionStrategy
  ): TaskChunk<T[]>[] {
    const chunkSize = Math.min(
      strategy.maxChunkSize || 10,
      Math.max(strategy.minChunkSize || 1, Math.ceil(data.length / this.workerPool.getTotalWorkerCount()))
    );

    const chunks: TaskChunk<T[]>[] = [];
    
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunkData = data.slice(i, i + chunkSize);
      const chunk = chunkProcessor(chunkData);
      chunk.id = `chunk-${chunks.length}`;
      chunks.push(chunk);
    }

    return chunks;
  }

  /**
   * Create chunks using weighted distribution
   */
  private createWeightedChunks<T>(
    data: T[],
    chunkProcessor: (chunk: T[]) => TaskChunk<T[]>,
    strategy: DistributionStrategy
  ): TaskChunk<T[]>[] {
    // For weighted distribution, we create chunks based on computational complexity
    // This is a simplified implementation - in practice, you'd analyze the data complexity
    
    const chunks: TaskChunk<T[]>[] = [];
    const targetWeight = 100; // Target computational weight per chunk
    let currentChunk: T[] = [];
    let currentWeight = 0;

    for (const item of data) {
      // Estimate weight (simplified - in practice, analyze item complexity)
      const itemWeight = this.estimateItemWeight(item);
      
      if (currentWeight + itemWeight > targetWeight && currentChunk.length > 0) {
        // Create chunk
        const chunk = chunkProcessor(currentChunk);
        chunk.id = `chunk-${chunks.length}`;
        chunk.weight = currentWeight;
        chunks.push(chunk);
        
        // Start new chunk
        currentChunk = [item];
        currentWeight = itemWeight;
      } else {
        currentChunk.push(item);
        currentWeight += itemWeight;
      }
    }

    // Handle remaining items
    if (currentChunk.length > 0) {
      const chunk = chunkProcessor(currentChunk);
      chunk.id = `chunk-${chunks.length}`;
      chunk.weight = currentWeight;
      chunks.push(chunk);
    }

    return chunks;
  }

  /**
   * Create chunks using adaptive distribution
   */
  private createAdaptiveChunks<T>(
    data: T[],
    chunkProcessor: (chunk: T[]) => TaskChunk<T[]>,
    strategy: DistributionStrategy
  ): TaskChunk<T[]>[] {
    // Adaptive strategy considers worker pool size and data characteristics
    const workerCount = this.workerPool.getTotalWorkerCount();
    const dataSize = data.length;
    
    // Calculate optimal chunk size based on worker count and data size
    let chunkSize: number;
    
    if (dataSize <= workerCount) {
      // Few items, one per worker
      chunkSize = 1;
    } else if (dataSize <= workerCount * 4) {
      // Moderate items, distribute evenly
      chunkSize = Math.ceil(dataSize / workerCount);
    } else {
      // Many items, use smaller chunks for better load balancing
      chunkSize = Math.max(
        strategy.minChunkSize || 2,
        Math.min(strategy.maxChunkSize || 20, Math.ceil(dataSize / (workerCount * 2)))
      );
    }

    const chunks: TaskChunk<T[]>[] = [];
    
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunkData = data.slice(i, i + chunkSize);
      const chunk = chunkProcessor(chunkData);
      chunk.id = `chunk-${chunks.length}`;
      chunk.weight = this.estimateChunkWeight(chunkData);
      chunks.push(chunk);
    }

    return chunks;
  }

  /**
   * Execute chunks across workers with load balancing
   */
  private async executeChunks<T, R>(
    distributionId: string,
    taskType: string,
    chunks: TaskChunk<T>[],
    options: Required<TaskDistributionOptions>
  ): Promise<R[]> {
    const results: R[] = [];
    const completedChunks = new Set<string>();
    const maxConcurrency = options.maxConcurrency || chunks.length;
    
    // Execute chunks with concurrency control
    const executePromises: Promise<void>[] = [];
    let chunkIndex = 0;

    const executeNextChunk = async (): Promise<void> => {
      while (chunkIndex < chunks.length) {
        const chunk = chunks[chunkIndex++];
        
        try {
          const startTime = Date.now();
          const result = await this.workerPool.executeTask<T, R>(
            taskType,
            chunk.data,
            options.timeout
          );
          
          const processingTime = Date.now() - startTime;
          results.push(result);
          completedChunks.add(chunk.id);

          // Report progress
          this.reportProgress(distributionId, {
            phase: 'processing',
            percentage: Math.round((completedChunks.size / chunks.length) * 90) + 10,
            message: `Completed ${completedChunks.size}/${chunks.length} chunks`,
            metadata: { completedChunks: completedChunks.size, totalChunks: chunks.length },
            timestamp: Date.now()
          });

        } catch (error) {
          this.stats.failedTasks++;
          throw new Error(`Chunk ${chunk.id} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    };

    // Start concurrent execution
    const concurrency = Math.min(maxConcurrency, this.workerPool.getAvailableWorkerCount());
    for (let i = 0; i < concurrency; i++) {
      executePromises.push(executeNextChunk());
    }

    await Promise.all(executePromises);
    return results;
  }

  /**
   * Estimate computational weight of an item
   */
  private estimateItemWeight<T>(item: T): number {
    // Simplified weight estimation
    // In practice, this would analyze the item's computational complexity
    if (typeof item === 'object' && item !== null) {
      return Object.keys(item).length * 2;
    }
    return 1;
  }

  /**
   * Estimate computational weight of a chunk
   */
  private estimateChunkWeight<T>(chunk: T[]): number {
    return chunk.reduce((total, item) => total + this.estimateItemWeight(item), 0);
  }

  /**
   * Report progress to callback
   */
  private reportProgress(distributionId: string, progress: ProgressUpdate): void {
    if (this.options.enableProgressReporting) {
      this.progressReporter.report(progress.phase, progress.percentage, progress.message, progress.metadata);
      this.options.progressCallback(progress);
    }
  }

  /**
   * Update distribution statistics
   */
  private updateStats(taskCount: number, totalTime: number): void {
    this.stats.totalTasks += taskCount;
    this.stats.completedTasks += taskCount;
    this.stats.totalProcessingTime += totalTime;
    
    // Update average processing time
    this.stats.averageProcessingTime = this.stats.totalProcessingTime / this.stats.completedTasks;
    
    // Calculate throughput (tasks per second)
    this.stats.throughput = (this.stats.completedTasks * 1000) / this.stats.totalProcessingTime;
    
    // Calculate worker utilization (simplified)
    const workerStats = this.workerPool.getStats();
    this.stats.workerUtilization = workerStats.activeWorkers / workerStats.totalWorkers;
  }

  /**
   * Get distribution statistics
   */
  getStats(): DistributionStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      averageProcessingTime: 0,
      totalProcessingTime: 0,
      workerUtilization: 0,
      throughput: 0
    };
  }

  /**
   * Check if distributor is ready
   */
  isReady(): boolean {
    return this.workerPool.isReady();
  }

  /**
   * Terminate the distributor and clean up resources
   */
  async terminate(): Promise<void> {
    // Wait for active distributions to complete or timeout
    const activePromises = Array.from(this.activeDistributions.values());
    if (activePromises.length > 0) {
      try {
        await Promise.race([
          Promise.all(activePromises),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Termination timeout')), 5000)
          )
        ]);
      } catch (error) {
        // Ignore timeout errors during termination
      }
    }

    this.activeDistributions.clear();
  }
}