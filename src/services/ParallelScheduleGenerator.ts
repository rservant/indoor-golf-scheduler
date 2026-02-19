/**
 * Parallel Schedule Generator with Web Worker Integration
 * 
 * Extends OptimizedScheduleGenerator with true parallel processing capabilities
 * using Web Workers for CPU-intensive schedule generation operations.
 * 
 * Validates Requirements 1.1, 1.4, 1.5
 */

import { OptimizedScheduleGenerator, OptimizedGenerationOptions, GenerationProgress } from './OptimizedScheduleGenerator';
import { WorkerPool, WorkerPoolOptions } from './WorkerPool';
import { TaskDistributor, TaskDistributionOptions, TaskChunk } from './TaskDistributor';
import { Player } from '../models/Player';
import { Schedule } from '../models/Schedule';
import { Week, WeekModel } from '../models/Week';
import { Foursome } from '../models/Foursome';
import { PairingHistoryTracker } from './PairingHistoryTracker';

export interface ParallelGenerationOptions extends OptimizedGenerationOptions {
  workerPoolOptions?: WorkerPoolOptions;
  distributionOptions?: TaskDistributionOptions;
  parallelThreshold?: number; // Minimum players to trigger parallel processing
  enableWorkerFallback?: boolean; // Fall back to single-threaded if workers fail
}

export interface PlayerChunk {
  players: Player[];
  timeSlot: 'morning' | 'afternoon';
  chunkId: string;
  seasonId?: string;
}

export interface FoursomeGenerationResult {
  foursomes: Foursome[];
  processingTime: number;
  chunkId: string;
  timeSlot: 'morning' | 'afternoon';
}

export class ParallelScheduleGenerator extends OptimizedScheduleGenerator {
  private workerPool: WorkerPool;
  private taskDistributor: TaskDistributor;
  private parallelOptions: ParallelGenerationOptions;
  private isWorkerPoolInitialized = false;

  constructor(
    options: ParallelGenerationOptions = {},
    pairingHistoryTracker?: PairingHistoryTracker
  ) {
    super(options, pairingHistoryTracker);
    
    this.parallelOptions = {
      ...options,
      parallelThreshold: options.parallelThreshold || 20,
      enableWorkerFallback: options.enableWorkerFallback !== false,
      workerPoolOptions: {
        maxWorkers: Math.max(2, Math.min(navigator.hardwareConcurrency || 4, 6)),
        taskTimeout: 30000,
        enableLogging: false,
        ...options.workerPoolOptions
      },
      distributionOptions: {
        strategy: { type: 'adaptive', maxChunkSize: 15, minChunkSize: 4 },
        enableProgressReporting: true,
        maxConcurrency: 4,
        timeout: 25000,
        ...options.distributionOptions
      }
    };

    this.workerPool = new WorkerPool(this.parallelOptions.workerPoolOptions);
    this.taskDistributor = new TaskDistributor(this.workerPool, this.parallelOptions.distributionOptions);
  }

  /**
   * Generate schedule with parallel processing
   */
  async generateScheduleForWeek(week: Week | WeekModel, allPlayers: Player[]): Promise<Schedule> {
    const startTime = performance.now();
    
    try {
      this.reportParallelProgress({
        phase: 'filtering',
        percentage: 0,
        message: 'Starting parallel schedule generation...'
      });

      // Filter available players
      const availablePlayers = this.filterAvailablePlayers(allPlayers, week);
      
      this.reportParallelProgress({
        phase: 'filtering',
        percentage: 15,
        message: `Filtered ${availablePlayers.length} available players`
      });

      // Determine if we should use parallel processing
      const shouldUseParallel = this.shouldUseParallelProcessing(availablePlayers);
      
      let schedule: Schedule;
      
      if (shouldUseParallel) {
        schedule = await this.generateScheduleWithParallelProcessing(week.id, availablePlayers, week.seasonId);
      } else {
        // Fall back to base class single-threaded generation
        schedule = await super.generateScheduleForWeek(week, availablePlayers);
      }

      const duration = performance.now() - startTime;
      
      this.reportParallelProgress({
        phase: 'complete',
        percentage: 100,
        message: `Schedule generation completed in ${Math.round(duration)}ms using ${shouldUseParallel ? 'parallel' : 'single-threaded'} processing`
      });

      return schedule;

    } catch (error) {
      const duration = performance.now() - startTime;
      
      // If parallel processing failed and fallback is enabled, try single-threaded
      if (this.parallelOptions.enableWorkerFallback && error instanceof Error && error.message.includes('Worker')) {
        console.warn('[ParallelScheduleGenerator] Worker error, falling back to single-threaded generation:', error.message);
        
        try {
          const schedule = await super.generateScheduleForWeek(week, allPlayers);
          
          this.reportParallelProgress({
            phase: 'complete',
            percentage: 100,
            message: `Schedule generation completed with fallback in ${Math.round(performance.now() - startTime)}ms`
          });
          
          return schedule;
        } catch (fallbackError) {
          throw new Error(`Both parallel and fallback generation failed: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`);
        }
      }

      this.reportParallelProgress({
        phase: 'complete',
        percentage: 100,
        message: `Schedule generation failed after ${Math.round(duration)}ms: ${error instanceof Error ? error.message : 'Unknown error'}`
      });

      throw error;
    }
  }

  /**
   * Determine if parallel processing should be used
   */
  private shouldUseParallelProcessing(availablePlayers: Player[]): boolean {
    // Check if we have enough players to justify parallel processing
    if (availablePlayers.length < this.parallelOptions.parallelThreshold!) {
      return false;
    }

    // Check if Web Workers are supported
    if (typeof Worker === 'undefined') {
      return false;
    }

    // Check if parallel processing is enabled
    if (this.parallelOptions.enableParallelProcessing === false) {
      return false;
    }

    return true;
  }

  /**
   * Generate schedule using parallel processing
   */
  private async generateScheduleWithParallelProcessing(
    weekId: string,
    availablePlayers: Player[],
    seasonId?: string
  ): Promise<Schedule> {
    this.reportParallelProgress({
      phase: 'assignment',
      percentage: 20,
      message: 'Initializing parallel processing...'
    });

    // Initialize worker pool if needed
    if (!this.isWorkerPoolInitialized) {
      await this.initializeWorkerPool();
    }

    this.reportParallelProgress({
      phase: 'assignment',
      percentage: 30,
      message: 'Assigning players to time slots...'
    });

    // Separate players by time preference first
    const amPlayers = availablePlayers.filter(p => p.timePreference === 'AM');
    const pmPlayers = availablePlayers.filter(p => p.timePreference === 'PM');
    const eitherPlayers = availablePlayers.filter(p => p.timePreference === 'Either');

    // Assign players to time slots using our own logic (similar to base class)
    const { morningPlayers, afternoonPlayers } = this.distributePlayersToTimeSlots(amPlayers, pmPlayers, eitherPlayers);

    this.reportParallelProgress({
      phase: 'assignment',
      percentage: 40,
      message: `Assigned ${morningPlayers.length} morning, ${afternoonPlayers.length} afternoon players`
    });

    // Create player chunks for parallel processing
    const playerChunks = this.createPlayerChunks(morningPlayers, afternoonPlayers, seasonId);

    this.reportParallelProgress({
      phase: 'generation',
      percentage: 50,
      message: `Processing ${playerChunks.length} chunks in parallel...`
    });

    // Process chunks in parallel
    const foursomeResults = await this.processPlayerChunksParallel(playerChunks);

    this.reportParallelProgress({
      phase: 'generation',
      percentage: 80,
      message: 'Assembling schedule from parallel results...'
    });

    // Assemble final schedule
    const schedule = this.assembleScheduleFromResults(weekId, foursomeResults);

    this.reportParallelProgress({
      phase: 'generation',
      percentage: 95,
      message: 'Finalizing schedule...'
    });

    return schedule;
  }

  /**
   * Initialize the worker pool
   */
  private async initializeWorkerPool(): Promise<void> {
    try {
      await this.workerPool.initialize();
      this.isWorkerPoolInitialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize worker pool: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Distribute players to time slots based on preferences and balancing
   */
  private distributePlayersToTimeSlots(
    amPlayers: Player[],
    pmPlayers: Player[],
    eitherPlayers: Player[]
  ): { morningPlayers: Player[]; afternoonPlayers: Player[] } {
    let morningPlayers = [...amPlayers];
    let afternoonPlayers = [...pmPlayers];

    // Balance time slots by distributing "Either" players
    if (eitherPlayers.length > 0) {
      const morningCount = morningPlayers.length;
      const afternoonCount = afternoonPlayers.length;
      const totalEither = eitherPlayers.length;

      if (morningCount < afternoonCount) {
        // Morning has fewer players, add more Either players to morning
        const deficit = afternoonCount - morningCount;
        const toMorning = Math.min(Math.ceil((deficit + totalEither) / 2), totalEither);
        morningPlayers.push(...eitherPlayers.slice(0, toMorning));
        afternoonPlayers.push(...eitherPlayers.slice(toMorning));
      } else if (afternoonCount < morningCount) {
        // Afternoon has fewer players, add more Either players to afternoon
        const deficit = morningCount - afternoonCount;
        const toAfternoon = Math.min(Math.ceil((deficit + totalEither) / 2), totalEither);
        afternoonPlayers.push(...eitherPlayers.slice(0, toAfternoon));
        morningPlayers.push(...eitherPlayers.slice(toAfternoon));
      } else {
        // Equal, distribute evenly
        const halfEither = Math.floor(totalEither / 2);
        morningPlayers.push(...eitherPlayers.slice(0, halfEither));
        afternoonPlayers.push(...eitherPlayers.slice(halfEither));
      }
    }

    return { morningPlayers, afternoonPlayers };
  }

  /**
   * Create player chunks for parallel processing
   */
  private createPlayerChunks(
    morningPlayers: Player[],
    afternoonPlayers: Player[],
    seasonId?: string
  ): PlayerChunk[] {
    const chunks: PlayerChunk[] = [];
    const chunkSize = Math.max(4, Math.min(12, Math.ceil(Math.max(morningPlayers.length, afternoonPlayers.length) / 3)));

    // Create morning chunks
    for (let i = 0; i < morningPlayers.length; i += chunkSize) {
      const chunkPlayers = morningPlayers.slice(i, i + chunkSize);
      chunks.push({
        players: chunkPlayers,
        timeSlot: 'morning',
        chunkId: `morning-${chunks.length}`,
        ...(seasonId && { seasonId })
      });
    }

    // Create afternoon chunks
    for (let i = 0; i < afternoonPlayers.length; i += chunkSize) {
      const chunkPlayers = afternoonPlayers.slice(i, i + chunkSize);
      chunks.push({
        players: chunkPlayers,
        timeSlot: 'afternoon',
        chunkId: `afternoon-${chunks.length}`,
        ...(seasonId && { seasonId })
      });
    }

    return chunks;
  }

  /**
   * Process player chunks in parallel using the task distributor
   */
  private async processPlayerChunksParallel(playerChunks: PlayerChunk[]): Promise<FoursomeGenerationResult[]> {
    const chunkProcessor = (chunks: PlayerChunk[]): TaskChunk<PlayerChunk[]> => ({
      id: `batch-${Date.now()}`,
      data: chunks,
      weight: chunks.reduce((sum, chunk) => sum + chunk.players.length, 0)
    });

    try {
      const results = await this.taskDistributor.distributeTasks<PlayerChunk, FoursomeGenerationResult>(
        'generateFoursomes',
        playerChunks,
        chunkProcessor,
        {
          progressCallback: (progress) => {
            this.reportParallelProgress({
              phase: 'generation',
              percentage: 50 + Math.round(progress.percentage * 0.3),
              message: progress.message || 'Processing chunks...'
            });
          }
        }
      );

      return results;
    } catch (error) {
      throw new Error(`Parallel chunk processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Assemble final schedule from parallel processing results
   */
  private assembleScheduleFromResults(weekId: string, results: FoursomeGenerationResult[]): Schedule {
    const schedule = new (require('../models/Schedule').ScheduleModel)({ weekId });

    // Separate morning and afternoon foursomes
    const morningFoursomes: Foursome[] = [];
    const afternoonFoursomes: Foursome[] = [];

    for (const result of results) {
      if (result.timeSlot === 'morning') {
        morningFoursomes.push(...result.foursomes);
      } else {
        afternoonFoursomes.push(...result.foursomes);
      }
    }

    // Add foursomes to schedule
    for (const foursome of morningFoursomes) {
      schedule.addFoursome(foursome);
    }
    
    for (const foursome of afternoonFoursomes) {
      schedule.addFoursome(foursome);
    }

    return schedule;
  }

  /**
   * Report generation progress for parallel processing
   */
  private reportParallelProgress(progress: GenerationProgress): void {
    if (this.parallelOptions.enableProgressReporting && this.parallelOptions.progressCallback) {
      this.parallelOptions.progressCallback(progress);
    }
  }

  /**
   * Get parallel processing statistics
   */
  getParallelStats(): {
    workerPool: any;
    taskDistributor: any;
    isInitialized: boolean;
  } {
    return {
      workerPool: this.workerPool.getStats(),
      taskDistributor: this.taskDistributor.getStats(),
      isInitialized: this.isWorkerPoolInitialized
    };
  }

  /**
   * Terminate parallel processing resources
   */
  async terminate(): Promise<void> {
    try {
      await this.taskDistributor.terminate();
      await this.workerPool.terminate();
      this.isWorkerPoolInitialized = false;
    } catch (error) {
      console.warn('[ParallelScheduleGenerator] Error during termination:', error);
    }
  }

  /**
   * Check if parallel processing is available
   */
  isParallelProcessingAvailable(): boolean {
    return typeof Worker !== 'undefined' && this.parallelOptions.enableParallelProcessing !== false;
  }

  /**
   * Estimate parallel processing benefit for given player count
   */
  estimateParallelBenefit(playerCount: number): {
    recommended: boolean;
    estimatedSpeedup: number;
    reasoning: string;
  } {
    if (playerCount < this.parallelOptions.parallelThreshold!) {
      return {
        recommended: false,
        estimatedSpeedup: 1,
        reasoning: `Player count (${playerCount}) below parallel threshold (${this.parallelOptions.parallelThreshold})`
      };
    }

    if (!this.isParallelProcessingAvailable()) {
      return {
        recommended: false,
        estimatedSpeedup: 1,
        reasoning: 'Web Workers not available in this environment'
      };
    }

    // Estimate speedup based on worker count and player count
    const workerCount = this.parallelOptions.workerPoolOptions?.maxWorkers || 4;
    const estimatedSpeedup = Math.min(workerCount * 0.7, playerCount / 20); // Conservative estimate

    return {
      recommended: true,
      estimatedSpeedup: Math.max(1.2, estimatedSpeedup),
      reasoning: `Expected ${Math.round(estimatedSpeedup * 100)}% speedup with ${workerCount} workers for ${playerCount} players`
    };
  }
}