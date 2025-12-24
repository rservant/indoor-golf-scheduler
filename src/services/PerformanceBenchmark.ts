/**
 * Performance Benchmark Suite
 * 
 * Provides comprehensive benchmarking infrastructure for measuring and documenting
 * baseline performance metrics across all major components.
 */

import { performanceMonitor, PerformanceMetrics } from './PerformanceMonitor';
import { ScheduleGenerator } from './ScheduleGenerator';
import { LocalPlayerRepository } from '../repositories/PlayerRepository';
import { LocalScheduleRepository } from '../repositories/ScheduleRepository';
import { LocalWeekRepository } from '../repositories/WeekRepository';
import { Player, PlayerModel } from '../models/Player';
import { Week, WeekModel } from '../models/Week';
import { Season, SeasonModel } from '../models/Season';

export interface BenchmarkConfig {
  name: string;
  description: string;
  setup: () => Promise<void>;
  test: () => Promise<void>;
  teardown: () => Promise<void>;
  iterations: number;
  timeout: number;
  category: 'schedule-generation' | 'data-operations' | 'ui-operations' | 'memory-operations';
}

export interface BenchmarkResult {
  name: string;
  category: string;
  iterations: number;
  totalDuration: number;
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
  p95Duration: number;
  p99Duration: number;
  standardDeviation: number;
  throughput: number; // operations per second
  memoryUsage: {
    initial: number;
    peak: number;
    final: number;
    delta: number;
  };
  success: boolean;
  error?: string | undefined;
  timestamp: number;
}

export interface BenchmarkSuiteResult {
  totalBenchmarks: number;
  successfulBenchmarks: number;
  failedBenchmarks: number;
  totalDuration: number;
  results: BenchmarkResult[];
  baseline: PerformanceBaseline;
  timestamp: number;
}

export interface PerformanceBaseline {
  scheduleGeneration: {
    players50: number;    // Target: 2000ms
    players100: number;   // Target: 5000ms
    players200: number;   // Target: 10000ms
  };
  dataOperations: {
    playerQuery: number;      // Target: 100ms
    scheduleSave: number;     // Target: 500ms
    weekQuery: number;        // Target: 100ms
  };
  uiOperations: {
    scheduleDisplay: number;  // Target: 100ms
    playerListUpdate: number; // Target: 200ms
  };
  memoryOperations: {
    maxMemoryUsage: number;   // Target: 200MB
    memoryStability: number;  // Target: stable over time
  };
}

/**
 * Performance Benchmark Suite
 * 
 * Measures baseline performance across all critical operations
 */
export class PerformanceBenchmark {
  private playerRepository: LocalPlayerRepository;
  private scheduleRepository: LocalScheduleRepository;
  private weekRepository: LocalWeekRepository;
  private scheduleGenerator: ScheduleGenerator;

  constructor() {
    this.playerRepository = new LocalPlayerRepository();
    this.scheduleRepository = new LocalScheduleRepository();
    this.weekRepository = new LocalWeekRepository();
    this.scheduleGenerator = new ScheduleGenerator();
  }

  /**
   * Run a single benchmark
   */
  async runBenchmark(config: BenchmarkConfig): Promise<BenchmarkResult> {
    console.log(`Running benchmark: ${config.name}`);
    
    const durations: number[] = [];
    const memoryReadings: number[] = [];
    let error: string | undefined;
    let success = true;

    const initialMemory = this.getMemoryUsage();
    let peakMemory = initialMemory;

    try {
      // Setup
      await config.setup();

      // Run iterations
      for (let i = 0; i < config.iterations; i++) {
        const startTime = performance.now();
        const startMemory = this.getMemoryUsage();

        try {
          await Promise.race([
            config.test(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Benchmark timeout')), config.timeout)
            )
          ]);

          const endTime = performance.now();
          const endMemory = this.getMemoryUsage();
          
          durations.push(endTime - startTime);
          memoryReadings.push(endMemory);
          peakMemory = Math.max(peakMemory, endMemory);

        } catch (iterationError) {
          console.error(`Benchmark iteration ${i + 1} failed:`, iterationError);
          success = false;
          error = iterationError instanceof Error ? iterationError.message : String(iterationError);
          break;
        }
      }

      // Teardown
      await config.teardown();

    } catch (benchmarkError) {
      success = false;
      error = benchmarkError instanceof Error ? benchmarkError.message : String(benchmarkError);
    }

    const finalMemory = this.getMemoryUsage();

    // Calculate statistics
    const totalDuration = durations.reduce((sum, d) => sum + d, 0);
    const averageDuration = durations.length > 0 ? totalDuration / durations.length : 0;
    const sortedDurations = durations.sort((a, b) => a - b);
    
    return {
      name: config.name,
      category: config.category,
      iterations: durations.length,
      totalDuration,
      averageDuration,
      minDuration: sortedDurations[0] || 0,
      maxDuration: sortedDurations[sortedDurations.length - 1] || 0,
      p95Duration: this.calculatePercentile(sortedDurations, 0.95),
      p99Duration: this.calculatePercentile(sortedDurations, 0.99),
      standardDeviation: this.calculateStandardDeviation(durations, averageDuration),
      throughput: durations.length > 0 ? (durations.length * 1000) / totalDuration : 0,
      memoryUsage: {
        initial: initialMemory,
        peak: peakMemory,
        final: finalMemory,
        delta: finalMemory - initialMemory
      },
      success,
      error,
      timestamp: Date.now()
    };
  }

  /**
   * Run complete benchmark suite
   */
  async runSuite(benchmarks?: BenchmarkConfig[]): Promise<BenchmarkSuiteResult> {
    const startTime = performance.now();
    const configs = benchmarks || this.getDefaultBenchmarks();
    const results: BenchmarkResult[] = [];

    console.log(`Starting benchmark suite with ${configs.length} benchmarks`);

    for (const config of configs) {
      const result = await this.runBenchmark(config);
      results.push(result);
    }

    const endTime = performance.now();
    const successfulBenchmarks = results.filter(r => r.success).length;
    const failedBenchmarks = results.length - successfulBenchmarks;

    const baseline = this.calculateBaseline(results);

    return {
      totalBenchmarks: results.length,
      successfulBenchmarks,
      failedBenchmarks,
      totalDuration: endTime - startTime,
      results,
      baseline,
      timestamp: Date.now()
    };
  }

  /**
   * Get default benchmark configurations for critical operations
   */
  getDefaultBenchmarks(): BenchmarkConfig[] {
    return [
      // Schedule Generation Benchmarks
      this.createScheduleGenerationBenchmark(50, 'Schedule Generation - 50 Players'),
      this.createScheduleGenerationBenchmark(100, 'Schedule Generation - 100 Players'),
      this.createScheduleGenerationBenchmark(200, 'Schedule Generation - 200 Players'),

      // Data Operation Benchmarks
      this.createPlayerQueryBenchmark(500, 'Player Query - 500 Players'),
      this.createScheduleSaveBenchmark('Schedule Save Operation'),
      this.createWeekQueryBenchmark(50, 'Week Query - 50 Weeks'),

      // Memory Operation Benchmarks
      this.createMemoryStabilityBenchmark('Memory Stability Test'),
      this.createLargeDatasetBenchmark('Large Dataset Handling')
    ];
  }

  /**
   * Create schedule generation benchmark
   */
  private createScheduleGenerationBenchmark(playerCount: number, name: string): BenchmarkConfig {
    let testPlayers: Player[] = [];
    let testWeek: Week;
    let testSeason: Season;

    return {
      name,
      description: `Benchmark schedule generation with ${playerCount} players`,
      category: 'schedule-generation',
      iterations: 10,
      timeout: 30000,
      setup: async () => {
        // Create test season
        const seasonModel = new SeasonModel({
          name: `Benchmark Season ${Date.now()}`,
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-12-31')
        });
        testSeason = seasonModel.toJSON();

        // Create test week
        const weekModel = new WeekModel({
          seasonId: testSeason.id,
          weekNumber: 1,
          date: new Date('2024-01-08')
        });
        testWeek = weekModel.toJSON();

        // Create test players
        testPlayers = [];
        for (let i = 0; i < playerCount; i++) {
          const playerModel = new PlayerModel({
            seasonId: testSeason.id,
            firstName: `Player${i}`,
            lastName: `Test`,
            timePreference: i % 3 === 0 ? 'AM' : i % 3 === 1 ? 'PM' : 'Either',
            handedness: i % 2 === 0 ? 'right' : 'left'
          });
          testPlayers.push(playerModel.toJSON());
        }

        // Set all players as available
        testWeek.playerAvailability = {};
        testPlayers.forEach(player => {
          testWeek.playerAvailability![player.id] = true;
        });
      },
      test: async () => {
        await this.scheduleGenerator.generateScheduleForWeek(testWeek, testPlayers);
      },
      teardown: async () => {
        // Cleanup is handled automatically since we're using in-memory data
      }
    };
  }

  /**
   * Create player query benchmark
   */
  private createPlayerQueryBenchmark(playerCount: number, name: string): BenchmarkConfig {
    let testSeasonId: string;

    return {
      name,
      description: `Benchmark player queries with ${playerCount} players`,
      category: 'data-operations',
      iterations: 50,
      timeout: 5000,
      setup: async () => {
        // Create test season
        const seasonModel = new SeasonModel({
          name: `Query Benchmark Season ${Date.now()}`,
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-12-31')
        });
        testSeasonId = seasonModel.id;

        // Create test players
        for (let i = 0; i < playerCount; i++) {
          await this.playerRepository.create({
            seasonId: testSeasonId,
            firstName: `QueryPlayer${i}`,
            lastName: `Test`,
            timePreference: 'Either',
            handedness: 'right'
          });
        }
      },
      test: async () => {
        await this.playerRepository.findBySeasonId(testSeasonId);
      },
      teardown: async () => {
        await this.playerRepository.deleteBySeasonId(testSeasonId);
      }
    };
  }

  /**
   * Create schedule save benchmark
   */
  private createScheduleSaveBenchmark(name: string): BenchmarkConfig {
    let testSchedule: any;

    return {
      name,
      description: 'Benchmark schedule save operations',
      category: 'data-operations',
      iterations: 20,
      timeout: 5000,
      setup: async () => {
        // Create a complex schedule for saving
        testSchedule = {
          weekId: `benchmark-week-${Date.now()}`,
          morningFoursomes: Array.from({ length: 10 }, (_, i) => ({
            id: `morning-${i}`,
            players: [`player1-${i}`, `player2-${i}`, `player3-${i}`, `player4-${i}`],
            timeSlot: 'morning' as const
          })),
          afternoonFoursomes: Array.from({ length: 10 }, (_, i) => ({
            id: `afternoon-${i}`,
            players: [`player5-${i}`, `player6-${i}`, `player7-${i}`, `player8-${i}`],
            timeSlot: 'afternoon' as const
          }))
        };
      },
      test: async () => {
        const schedule = await this.scheduleRepository.create({ weekId: testSchedule.weekId });
        await this.scheduleRepository.update(schedule.id, testSchedule);
      },
      teardown: async () => {
        await this.scheduleRepository.deleteByWeekId(testSchedule.weekId);
      }
    };
  }

  /**
   * Create week query benchmark
   */
  private createWeekQueryBenchmark(weekCount: number, name: string): BenchmarkConfig {
    let testSeasonId: string;

    return {
      name,
      description: `Benchmark week queries with ${weekCount} weeks`,
      category: 'data-operations',
      iterations: 30,
      timeout: 5000,
      setup: async () => {
        // Create test season
        const seasonModel = new SeasonModel({
          name: `Week Query Season ${Date.now()}`,
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-12-31')
        });
        testSeasonId = seasonModel.id;

        // Create test weeks
        for (let i = 0; i < weekCount; i++) {
          await this.weekRepository.create({
            seasonId: testSeasonId,
            weekNumber: i + 1,
            date: new Date(2024, 0, 8 + (i * 7)) // Weekly intervals
          });
        }
      },
      test: async () => {
        await this.weekRepository.findBySeasonId(testSeasonId);
      },
      teardown: async () => {
        await this.weekRepository.deleteBySeasonId(testSeasonId);
      }
    };
  }

  /**
   * Create memory stability benchmark
   */
  private createMemoryStabilityBenchmark(name: string): BenchmarkConfig {
    return {
      name,
      description: 'Test memory stability over repeated operations',
      category: 'memory-operations',
      iterations: 100,
      timeout: 10000,
      setup: async () => {
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      },
      test: async () => {
        // Simulate memory-intensive operations
        const data = Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          data: new Array(100).fill(`test-data-${i}`)
        }));
        
        // Process the data
        const processed = data.map(item => ({
          ...item,
          processed: true,
          timestamp: Date.now()
        }));

        // Simulate cleanup
        processed.length = 0;
      },
      teardown: async () => {
        if (global.gc) {
          global.gc();
        }
      }
    };
  }

  /**
   * Create large dataset benchmark
   */
  private createLargeDatasetBenchmark(name: string): BenchmarkConfig {
    let largeDataset: any[];

    return {
      name,
      description: 'Test handling of large datasets',
      category: 'memory-operations',
      iterations: 5,
      timeout: 15000,
      setup: async () => {
        // Create large dataset
        largeDataset = Array.from({ length: 10000 }, (_, i) => ({
          id: i,
          name: `Item ${i}`,
          data: new Array(50).fill(`data-${i}`),
          metadata: {
            created: new Date(),
            index: i,
            category: `category-${i % 10}`
          }
        }));
      },
      test: async () => {
        // Simulate processing large dataset
        const filtered = largeDataset.filter(item => item.id % 2 === 0);
        const mapped = filtered.map(item => ({
          ...item,
          processed: true
        }));
        const sorted = mapped.sort((a, b) => a.id - b.id);
        
        // Simulate aggregation
        const aggregated = sorted.reduce((acc, item) => {
          const category = item.metadata.category;
          acc[category] = (acc[category] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        return aggregated;
      },
      teardown: async () => {
        largeDataset = [];
      }
    };
  }

  /**
   * Calculate performance baseline from benchmark results
   */
  private calculateBaseline(results: BenchmarkResult[]): PerformanceBaseline {
    const getResultByName = (name: string) => 
      results.find(r => r.name.includes(name))?.averageDuration || 0;

    return {
      scheduleGeneration: {
        players50: getResultByName('50 Players'),
        players100: getResultByName('100 Players'),
        players200: getResultByName('200 Players')
      },
      dataOperations: {
        playerQuery: getResultByName('Player Query'),
        scheduleSave: getResultByName('Schedule Save'),
        weekQuery: getResultByName('Week Query')
      },
      uiOperations: {
        scheduleDisplay: 0, // Will be implemented in UI benchmarks
        playerListUpdate: 0
      },
      memoryOperations: {
        maxMemoryUsage: Math.max(...results.map(r => r.memoryUsage.peak)),
        memoryStability: getResultByName('Memory Stability')
      }
    };
  }

  /**
   * Get current memory usage in bytes
   */
  private getMemoryUsage(): number {
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      return (performance as any).memory.usedJSHeapSize || 0;
    }
    return 0;
  }

  /**
   * Calculate percentile from sorted array
   */
  private calculatePercentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;
    
    const index = Math.ceil(sortedArray.length * percentile) - 1;
    return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
  }

  /**
   * Calculate standard deviation
   */
  private calculateStandardDeviation(values: number[], mean: number): number {
    if (values.length === 0) return 0;
    
    const squaredDifferences = values.map(value => Math.pow(value - mean, 2));
    const avgSquaredDiff = squaredDifferences.reduce((sum, diff) => sum + diff, 0) / values.length;
    return Math.sqrt(avgSquaredDiff);
  }
}

// Global benchmark instance
export const performanceBenchmark = new PerformanceBenchmark();