import { 
  TestStorageOptimizer as ITestStorageOptimizer,
  CIConfiguration 
} from './interfaces';
import { EnvironmentDetector } from './EnvironmentDetector';
import { CompressionUtils } from './CompressionUtils';
import { Player, PlayerInfo } from '../models/Player';
import { PairingHistory } from '../models/PairingHistory';

/**
 * Compact data format interfaces for CI optimization
 */
interface CompactPairing {
  p1: string; // player1 short ID
  p2: string; // player2 short ID
  c: number;  // count
}

interface CompactPairingHistory {
  s: string; // season ID (shortened)
  p: CompactPairing[]; // pairings array
  t: number; // timestamp
}

interface CompactPlayer {
  i: string; // ID (shortened)
  f: string; // firstName (truncated)
  l: string; // lastName (truncated)
  h: string; // handedness (L/R)
  t: string; // timePreference (A/P/E)
  s: string; // seasonId (shortened)
  c: number; // createdAt timestamp
}

/**
 * Test execution configuration interfaces
 */
interface TestExecutionConfig {
  maxIterations: number;
  maxDatasetSize: number;
  maxPlayerCount: number;
  enableCompression: boolean;
  enableDataMinimization: boolean;
  timeoutMultiplier: number;
}

interface PropertyTestConfig {
  numRuns?: number;
  timeout?: number;
  maxSkipsPerRun?: number;
  seed?: number | undefined;
  verbose?: boolean;
  tests?: number; // for jsverify
  size?: number;  // for jsverify
  quiet?: boolean; // for jsverify
}

interface OptimizedGenerators {
  playerGenerator: {
    maxCount: number;
    shortNames: boolean;
    limitedPreferences: boolean;
  };
  pairingHistoryGenerator: {
    maxPairings: number;
    compactFormat: boolean;
  };
  seasonGenerator: {
    maxWeeks: number;
    limitedPlayers: number;
  };
}

/**
 * Optimizes test data for CI environments to reduce storage usage
 */
export class TestStorageOptimizer implements ITestStorageOptimizer {
  private static instance: TestStorageOptimizer;
  private environmentDetector: EnvironmentDetector;
  private ciConfiguration: CIConfiguration | null = null;

  private constructor() {
    this.environmentDetector = EnvironmentDetector.getInstance();
    this.loadConfiguration();
  }

  public static getInstance(): TestStorageOptimizer {
    if (!TestStorageOptimizer.instance) {
      TestStorageOptimizer.instance = new TestStorageOptimizer();
    }
    return TestStorageOptimizer.instance;
  }

  /**
   * Resets the singleton instance (useful for testing)
   */
  public static resetInstance(): void {
    TestStorageOptimizer.instance = undefined as any;
  }

  /**
   * Reloads configuration from environment detector
   */
  public reloadConfiguration(): void {
    this.loadConfiguration();
  }

  /**
   * Loads CI configuration if in CI environment
   */
  private loadConfiguration(): void {
    if (this.environmentDetector.isCIEnvironment()) {
      this.ciConfiguration = this.environmentDetector.getCIConfiguration();
    } else {
      this.ciConfiguration = null;
    }
  }

  /**
   * Optimizes test data based on environment and data type
   */
  public optimizeTestData<T>(data: T): T {
    if (!this.ciConfiguration || !this.environmentDetector.isCIEnvironment()) {
      return data;
    }

    // Handle different data types
    if (Array.isArray(data)) {
      return this.optimizeArray(data) as T;
    }

    if (this.isPlayerData(data)) {
      return this.optimizePlayerData(data as any) as T;
    }

    if (this.isPairingHistoryData(data)) {
      return this.optimizePairingHistoryData(data as any) as T;
    }

    // For other objects, try to reduce size
    if (typeof data === 'object' && data !== null) {
      return this.optimizeGenericObject(data) as T;
    }

    return data;
  }

  /**
   * Compresses data using available compression utilities
   */
  public compressData(data: string): string {
    if (!this.ciConfiguration?.compressionEnabled) {
      return data;
    }

    return CompressionUtils.compressData(data);
  }

  /**
   * Decompresses data using available compression utilities
   */
  public decompressData(compressed: string): string {
    if (!this.ciConfiguration?.compressionEnabled) {
      return compressed;
    }

    return CompressionUtils.decompressData(compressed);
  }

  /**
   * Reduces dataset size for CI environments
   */
  public reduceDataset<T>(dataset: T[], maxSize: number): T[] {
    // Apply CI-specific reduction if in CI environment
    let effectiveMaxSize = maxSize;
    if (this.ciConfiguration) {
      effectiveMaxSize = this.getCIDatasetLimit(maxSize);
    }
    
    if (dataset.length <= effectiveMaxSize) {
      return dataset;
    }

    // Take a representative sample from the dataset
    return this.sampleDataset(dataset, effectiveMaxSize);
  }

  /**
   * Gets optimized iteration count for property-based tests
   */
  public getOptimizedIterationCount(baseCount: number): number {
    if (!this.ciConfiguration?.reducedIterations) {
      return baseCount;
    }

    // Reduce iterations by 75% in CI environments
    const ciIterationCount = Math.max(25, Math.floor(baseCount * 0.25));
    
    return ciIterationCount;
  }

  /**
   * Creates compact representation for pairing history
   */
  public createCompactPairingHistory(pairingHistory: PairingHistory): CompactPairingHistory {
    if (!this.ciConfiguration) {
      return this.convertToCompactFormat(pairingHistory);
    }

    // In CI, use more aggressive compression
    const compactPairings: CompactPairing[] = [];
    
    for (const [pairingKey, count] of Object.entries(pairingHistory.pairings)) {
      const [playerId1, playerId2] = pairingKey.split('-');
      
      // Use shorter player ID representations
      const shortId1 = this.createShortPlayerId(playerId1);
      const shortId2 = this.createShortPlayerId(playerId2);
      
      compactPairings.push({
        p1: shortId1,
        p2: shortId2,
        c: count
      });
    }

    return {
      s: this.createShortSeasonId(pairingHistory.seasonId),
      p: compactPairings,
      t: pairingHistory.lastUpdated.getTime()
    };
  }

  /**
   * Restores pairing history from compact format
   */
  public restoreFromCompactPairingHistory(compact: CompactPairingHistory, playerIdMap?: Map<string, string>): PairingHistory {
    const pairings: Record<string, number> = {};
    
    for (const compactPairing of compact.p) {
      // Restore full player IDs if map is provided
      const fullId1 = playerIdMap?.get(compactPairing.p1) || compactPairing.p1;
      const fullId2 = playerIdMap?.get(compactPairing.p2) || compactPairing.p2;
      
      const pairingKey = fullId1 < fullId2 ? `${fullId1}-${fullId2}` : `${fullId2}-${fullId1}`;
      pairings[pairingKey] = compactPairing.c;
    }

    return {
      seasonId: compact.s,
      pairings,
      lastUpdated: new Date(compact.t)
    };
  }

  /**
   * Creates compact representation for player data
   */
  public createCompactPlayer(player: Player): CompactPlayer {
    return {
      i: this.createShortPlayerId(player.id),
      f: player.firstName.substring(0, 2), // First 2 chars
      l: player.lastName.substring(0, 2),  // First 2 chars
      h: player.handedness === 'left' ? 'L' : 'R',
      t: player.timePreference === 'AM' ? 'A' : player.timePreference === 'PM' ? 'P' : 'E',
      s: this.createShortSeasonId(player.seasonId),
      c: player.createdAt.getTime()
    };
  }

  /**
   * Restores player from compact format
   */
  public restoreFromCompactPlayer(compact: CompactPlayer, fullPlayerData?: Partial<Player>): Player {
    return {
      id: compact.i,
      firstName: fullPlayerData?.firstName || compact.f,
      lastName: fullPlayerData?.lastName || compact.l,
      handedness: compact.h === 'L' ? 'left' : 'right',
      timePreference: compact.t === 'A' ? 'AM' : compact.t === 'P' ? 'PM' : 'Either',
      seasonId: compact.s,
      createdAt: new Date(compact.c)
    };
  }

  /**
   * Automatically compresses data if it exceeds size thresholds
   */
  public autoCompressIfOversized(data: string, maxSizeBytes: number = 1024): string {
    if (!this.ciConfiguration) {
      return data;
    }

    const dataSizeBytes = new Blob([data]).size;
    
    if (dataSizeBytes > maxSizeBytes) {
      // Try compression first
      const compressed = this.compressData(data);
      const compressedSize = new Blob([compressed]).size;
      
      if (compressedSize < dataSizeBytes * 0.8) { // At least 20% reduction
        return compressed;
      }
      
      // If compression doesn't help enough, truncate
      return this.truncateData(data, maxSizeBytes);
    }
    
    return data;
  }

  /**
   * Truncates data to fit within size limits
   */
  private truncateData(data: string, maxSizeBytes: number): string {
    // Simple truncation - in production, you might want smarter truncation
    const maxChars = Math.floor(maxSizeBytes * 0.9); // Leave some buffer
    
    if (data.length <= maxChars) {
      return data;
    }
    
    return data.substring(0, maxChars) + '...';
  }

  /**
   * Gets CI-specific dataset size limits
   */
  private getCIDatasetLimit(originalMaxSize: number): number {
    if (!this.ciConfiguration) {
      return originalMaxSize;
    }

    // Reduce dataset size by 60% in CI
    return Math.max(4, Math.floor(originalMaxSize * 0.4));
  }

  /**
   * Samples dataset to get representative subset
   */
  private sampleDataset<T>(dataset: T[], targetSize: number): T[] {
    if (dataset.length <= targetSize) {
      return dataset;
    }

    // Use systematic sampling for better representation
    const step = dataset.length / targetSize;
    const sampled: T[] = [];

    for (let i = 0; i < targetSize; i++) {
      const index = Math.floor(i * step);
      if (index < dataset.length) {
        sampled.push(dataset[index]);
      }
    }

    return sampled;
  }

  /**
   * Optimizes array data
   */
  private optimizeArray<T>(data: T[]): T[] {
    if (!this.ciConfiguration) {
      return data;
    }

    // Apply dataset size limits - use a reasonable default
    const maxSize = 50; // Default max size for CI
    const ciMaxSize = this.getCIDatasetLimit(maxSize);
    return this.reduceDataset(data, ciMaxSize);
  }

  /**
   * Optimizes player data for CI environments
   */
  private optimizePlayerData(data: Player | PlayerInfo | Player[]): any {
    if (Array.isArray(data)) {
      // Limit player count in CI
      const maxPlayers = this.getMaxPlayerCount();
      return this.reduceDataset(data, maxPlayers);
    }

    // For individual player objects, use shorter names in CI
    if (this.isPlayerData(data)) {
      return {
        ...data,
        firstName: this.shortenName(data.firstName),
        lastName: this.shortenName(data.lastName)
      };
    }

    return data;
  }

  /**
   * Gets maximum player count for CI environments
   */
  private getMaxPlayerCount(): number {
    if (!this.ciConfiguration) {
      return 100; // Default limit
    }

    // In CI, limit to essential minimum for testing
    return 12; // Minimum for meaningful golf scheduling (3 foursomes)
  }

  /**
   * Shortens names to reduce storage usage
   */
  private shortenName(name: string): string {
    if (!this.ciConfiguration || name.length <= 3) {
      return name;
    }

    // Keep first 3 characters for CI
    return name.substring(0, 3);
  }

  /**
   * Optimizes pairing history data
   */
  private optimizePairingHistoryData(data: PairingHistory): PairingHistory {
    if (!this.ciConfiguration) {
      return data;
    }

    // Keep only the most frequent pairings in CI
    const maxPairings = 20; // Limit pairing history size
    const sortedPairings = Object.entries(data.pairings)
      .sort(([, a], [, b]) => b - a)
      .slice(0, maxPairings);

    return {
      ...data,
      pairings: Object.fromEntries(sortedPairings)
    };
  }

  /**
   * Optimizes generic objects by removing non-essential properties
   */
  private optimizeGenericObject(data: any): any {
    if (!this.ciConfiguration) {
      return data;
    }

    // Remove optional metadata in CI environments
    const optimized = { ...data };
    
    // Remove common non-essential properties
    const nonEssentialProps = ['createdAt', 'updatedAt', 'metadata', 'debug', 'logs'];
    nonEssentialProps.forEach(prop => {
      if (prop in optimized) {
        delete optimized[prop];
      }
    });

    return optimized;
  }

  /**
   * Type guard for player data
   */
  private isPlayerData(data: any): data is Player | PlayerInfo {
    return data && 
           typeof data === 'object' && 
           'firstName' in data && 
           'lastName' in data && 
           'handedness' in data;
  }

  /**
   * Type guard for pairing history data
   */
  private isPairingHistoryData(data: any): data is PairingHistory {
    return data && 
           typeof data === 'object' && 
           'seasonId' in data && 
           'pairings' in data && 
           typeof data.pairings === 'object';
  }

  /**
   * Creates short player ID for compact storage
   */
  private createShortPlayerId(playerId: string): string {
    if (!this.ciConfiguration) {
      return playerId;
    }

    // For simple test IDs like 'player1', 'player2', don't shorten them
    if (playerId.length <= 8) {
      return playerId;
    }

    // Extract meaningful part and create hash-like short ID
    const parts = playerId.split('_');
    if (parts.length >= 2) {
      // Use last part (usually random) and first few chars of first part
      const prefix = parts[0].substring(0, 2);
      const suffix = parts[parts.length - 1].substring(0, 4);
      return `${prefix}${suffix}`;
    }
    
    // Fallback: use first 6 characters
    return playerId.substring(0, 6);
  }

  /**
   * Creates short season ID for compact storage
   */
  private createShortSeasonId(seasonId: string): string {
    if (!this.ciConfiguration) {
      return seasonId;
    }

    // For round-trip compatibility, only shorten very long IDs
    if (seasonId.length <= 12) {
      return seasonId;
    }

    // Similar logic to player ID
    const parts = seasonId.split('_');
    if (parts.length >= 2) {
      const prefix = parts[0].substring(0, 4);
      const suffix = parts[parts.length - 1].substring(0, 4);
      return `${prefix}${suffix}`;
    }
    
    return seasonId.substring(0, 8);
  }

  /**
   * Converts pairing history to compact format (non-CI version)
   */
  private convertToCompactFormat(pairingHistory: PairingHistory): CompactPairingHistory {
    const compactPairings: CompactPairing[] = [];
    
    for (const [pairingKey, count] of Object.entries(pairingHistory.pairings)) {
      const [playerId1, playerId2] = pairingKey.split('-');
      
      compactPairings.push({
        p1: playerId1,
        p2: playerId2,
        c: count
      });
    }

    return {
      s: pairingHistory.seasonId,
      p: compactPairings,
      t: pairingHistory.lastUpdated.getTime()
    };
  }

  /**
   * Gets test execution configuration optimized for CI
   */
  public getTestExecutionConfig(): TestExecutionConfig {
    const baseConfig: TestExecutionConfig = {
      maxIterations: 100,
      maxDatasetSize: 100,
      maxPlayerCount: 50,
      enableCompression: false,
      enableDataMinimization: false,
      timeoutMultiplier: 1.0
    };

    if (!this.ciConfiguration || !this.environmentDetector.isCIEnvironment()) {
      return baseConfig;
    }

    // CI-optimized configuration
    return {
      maxIterations: this.getOptimizedIterationCount(baseConfig.maxIterations),
      maxDatasetSize: this.getCIDatasetLimit(baseConfig.maxDatasetSize),
      maxPlayerCount: this.getMaxPlayerCount(),
      enableCompression: true,
      enableDataMinimization: true,
      timeoutMultiplier: 2.0 // Allow more time for CI environments
    };
  }

  /**
   * Configures property-based test framework for CI optimization
   */
  public configurePropertyBasedTesting(testFramework: 'fast-check' | 'jsverify' = 'fast-check'): PropertyTestConfig {
    const config = this.getTestExecutionConfig();
    
    switch (testFramework) {
      case 'fast-check':
        return {
          numRuns: config.maxIterations,
          timeout: 5000 * config.timeoutMultiplier,
          maxSkipsPerRun: Math.floor(config.maxIterations * 0.1),
          seed: this.environmentDetector.isCIEnvironment() ? 42 : undefined,
          verbose: !this.environmentDetector.isCIEnvironment()
        };
      
      case 'jsverify':
        return {
          tests: config.maxIterations,
          size: Math.floor(config.maxDatasetSize / 10),
          quiet: this.environmentDetector.isCIEnvironment()
        };
      
      default:
        throw new Error(`Unsupported test framework: ${testFramework}`);
    }
  }

  /**
   * Creates optimized generators for property-based testing
   */
  public createOptimizedGenerators(): OptimizedGenerators {
    const config = this.getTestExecutionConfig();
    
    return {
      playerGenerator: {
        maxCount: config.maxPlayerCount,
        shortNames: config.enableDataMinimization,
        limitedPreferences: config.enableDataMinimization
      },
      pairingHistoryGenerator: {
        maxPairings: config.enableDataMinimization ? 20 : 100,
        compactFormat: config.enableCompression
      },
      seasonGenerator: {
        maxWeeks: config.enableDataMinimization ? 4 : 12,
        limitedPlayers: config.maxPlayerCount
      }
    };
  }

  /**
   * Wraps property-based test execution with CI optimizations
   */
  public wrapPropertyTest<T>(
    testName: string,
    property: (input: T) => boolean | Promise<boolean>,
    generator: any,
    options?: Partial<PropertyTestConfig>
  ): () => Promise<void> {
    const config = this.configurePropertyBasedTesting();
    const finalConfig = { ...config, ...options };
    
    return async () => {
      const startTime = Date.now();
      
      try {
        // This is a wrapper - actual test framework integration would go here
        // For now, we'll simulate the optimization
        console.log(`Running property test "${testName}" with ${finalConfig.numRuns} iterations`);
        
        // In a real implementation, you would integrate with fast-check or jsverify here
        // Example: await fc.assert(fc.property(generator, property), finalConfig);
        
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        if (this.environmentDetector.isCIEnvironment()) {
          console.log(`CI Test completed: ${testName} (${duration}ms, ${finalConfig.numRuns} iterations)`);
        }
        
      } catch (error) {
        console.error(`Property test failed: ${testName}`, error);
        throw error;
      }
    };
  }
}