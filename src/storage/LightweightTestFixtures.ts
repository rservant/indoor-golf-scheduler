import { Player, PlayerInfo, Handedness, TimePreference } from '../models/Player';
import { Season, CreateSeasonData } from '../models/Season';
import { Week } from '../models/Week';
import { CIConfigurationManager } from './CIConfigurationManager';

/**
 * Provides lightweight test fixtures optimized for CI environments
 */
export class LightweightTestFixtures {
  private static instance: LightweightTestFixtures;
  private ciConfigurationManager: CIConfigurationManager;

  private constructor() {
    this.ciConfigurationManager = CIConfigurationManager.getInstance();
  }

  public static getInstance(): LightweightTestFixtures {
    if (!LightweightTestFixtures.instance) {
      LightweightTestFixtures.instance = new LightweightTestFixtures();
    }
    return LightweightTestFixtures.instance;
  }

  /**
   * Create minimal player fixtures for testing
   */
  public createMinimalPlayers(count?: number, seasonId?: string): Player[] {
    const config = this.ciConfigurationManager.getCurrentConfiguration();
    const maxPlayers = count || (config.environment === 'local' ? 20 : 8);
    const testSeasonId = seasonId || 'test-season-1';

    const players: Player[] = [];
    const handedness: Handedness[] = ['left', 'right'];
    const timePreferences: TimePreference[] = ['AM', 'PM', 'Either'];

    for (let i = 0; i < Math.min(maxPlayers, 12); i++) {
      players.push({
        id: `test-player-${i + 1}`,
        firstName: `Player${i + 1}`,
        lastName: `Test`,
        handedness: handedness[i % 2],
        timePreference: timePreferences[i % 3],
        seasonId: testSeasonId,
        createdAt: new Date('2024-01-01')
      });
    }

    return players;
  }

  /**
   * Create minimal season fixture for testing
   */
  public createMinimalSeason(overrides?: Partial<CreateSeasonData>): Season {
    const config = this.ciConfigurationManager.getCurrentConfiguration();
    const isCI = config.environment !== 'local';

    const baseData: CreateSeasonData = {
      name: 'Test Season',
      startDate: new Date('2024-01-01'),
      endDate: new Date(isCI ? '2024-02-01' : '2024-12-31') // Shorter season in CI
    };

    return {
      id: 'test-season-1',
      ...baseData,
      ...overrides,
      isActive: true,
      createdAt: new Date('2024-01-01'),
      playerIds: [],
      weekIds: []
    };
  }

  /**
   * Create minimal week fixtures for testing
   */
  public createMinimalWeeks(seasonId: string, count?: number, playerIds?: string[]): Week[] {
    const config = this.ciConfigurationManager.getCurrentConfiguration();
    const maxWeeks = count || (config.environment === 'local' ? 10 : 3);
    const testPlayerIds = playerIds || this.createMinimalPlayers(8, seasonId).map(p => p.id);

    const weeks: Week[] = [];
    const baseDate = new Date('2024-01-01');

    for (let i = 0; i < maxWeeks; i++) {
      const weekDate = new Date(baseDate);
      weekDate.setDate(baseDate.getDate() + (i * 7));

      // Create simplified availability - alternate between available/unavailable
      const playerAvailability: Record<string, boolean> = {};
      testPlayerIds.forEach((playerId, index) => {
        playerAvailability[playerId] = (index + i) % 2 === 0;
      });

      weeks.push({
        id: `test-week-${i + 1}`,
        seasonId,
        weekNumber: i + 1,
        date: weekDate,
        playerAvailability
      });
    }

    return weeks;
  }

  /**
   * Create minimal pairing history data
   */
  public createMinimalPairingHistory(playerIds: string[]): Array<{ player1Id: string; player2Id: string; count: number }> {
    const config = this.ciConfigurationManager.getCurrentConfiguration();
    const isCI = config.environment !== 'local';
    
    // In CI, create minimal pairing history
    if (isCI && playerIds.length > 4) {
      // Only create pairings for first 4 players to keep it minimal
      const limitedPlayerIds = playerIds.slice(0, 4);
      return this.generatePairings(limitedPlayerIds);
    }

    return this.generatePairings(playerIds);
  }

  /**
   * Create test scenario specific fixtures
   */
  public createTestScenarioFixtures(scenarioType: 'unit' | 'integration' | 'e2e') {
    const scenarioConfig = this.ciConfigurationManager.getTestScenarioConfiguration(scenarioType);
    
    switch (scenarioType) {
      case 'unit':
        return {
          players: this.createMinimalPlayers(4),
          season: this.createMinimalSeason(),
          weeks: this.createMinimalWeeks('test-season-1', 1)
        };

      case 'integration':
        return {
          players: this.createMinimalPlayers(8),
          season: this.createMinimalSeason(),
          weeks: this.createMinimalWeeks('test-season-1', 2)
        };

      case 'e2e':
        return {
          players: this.createMinimalPlayers(12),
          season: this.createMinimalSeason(),
          weeks: this.createMinimalWeeks('test-season-1', 3)
        };

      default:
        return {
          players: this.createMinimalPlayers(4),
          season: this.createMinimalSeason(),
          weeks: this.createMinimalWeeks('test-season-1', 1)
        };
    }
  }

  /**
   * Create optimized test data for property-based testing
   */
  public createPropertyTestFixtures() {
    const config = this.ciConfigurationManager.getCurrentConfiguration();
    
    return {
      maxPlayers: Math.min(config.testOptimization.maxDatasetSize / 10, 20),
      maxWeeks: Math.min(config.testOptimization.maxDatasetSize / 50, 5),
      maxIterations: config.testOptimization.maxIterationCount,
      compactData: config.environment !== 'local'
    };
  }

  /**
   * Create minimal storage test data
   */
  public createStorageTestData(size: 'small' | 'medium' | 'large' = 'small'): Record<string, any> {
    const config = this.ciConfigurationManager.getCurrentConfiguration();
    const isCI = config.environment !== 'local';

    const baseSizes = {
      small: isCI ? 10 : 50,
      medium: isCI ? 50 : 200,
      large: isCI ? 100 : 500
    };

    const dataSize = baseSizes[size];
    
    return {
      testString: 'A'.repeat(dataSize),
      testArray: Array.from({ length: Math.min(dataSize / 10, 20) }, (_, i) => ({ id: i, value: `item-${i}` })),
      testObject: {
        id: 'test-object',
        data: 'B'.repeat(Math.min(dataSize, 100)),
        nested: {
          level1: 'C'.repeat(Math.min(dataSize / 2, 50)),
          level2: {
            deep: 'D'.repeat(Math.min(dataSize / 4, 25))
          }
        }
      }
    };
  }

  /**
   * Get fixture optimization settings
   */
  public getOptimizationSettings() {
    const config = this.ciConfigurationManager.getCurrentConfiguration();
    
    return {
      useMinimalFixtures: config.environment !== 'local',
      maxDataSize: config.testOptimization.maxDatasetSize,
      maxIterations: config.testOptimization.maxIterationCount,
      compressionEnabled: config.storageOptimization.enabled,
      aggressiveCleanup: config.storageOptimization.aggressiveCleanup
    };
  }

  /**
   * Generate pairing combinations
   */
  private generatePairings(playerIds: string[]): Array<{ player1Id: string; player2Id: string; count: number }> {
    const pairings: Array<{ player1Id: string; player2Id: string; count: number }> = [];
    
    for (let i = 0; i < playerIds.length; i++) {
      for (let j = i + 1; j < playerIds.length; j++) {
        pairings.push({
          player1Id: playerIds[i],
          player2Id: playerIds[j],
          count: Math.floor(Math.random() * 3) // 0-2 previous pairings
        });
      }
    }
    
    return pairings;
  }
}