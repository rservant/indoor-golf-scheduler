import { Season, SeasonModel } from '../models/Season';
import { Player, PlayerModel } from '../models/Player';

/**
 * Data Migration Service for converting simple version localStorage data
 * to TypeScript application format
 */
export class DataMigrationService {
  /**
   * Simple version storage keys
   */
  private static readonly SIMPLE_KEYS = {
    seasons: 'golf_seasons',
    players: 'golf_players',
    activeSeason: 'golf_active_season'
  };

  /**
   * TypeScript version storage keys
   */
  private static readonly TYPESCRIPT_KEYS = {
    seasons: 'golf_scheduler_seasons',
    players: 'golf_scheduler_players',
    weeks: 'golf_scheduler_weeks',
    schedules: 'golf_scheduler_schedules',
    pairingHistory: 'golf_scheduler_pairing_history'
  };

  /**
   * Check if simple version data exists in localStorage
   */
  static hasSimpleVersionData(): boolean {
    try {
      const seasons = localStorage.getItem(this.SIMPLE_KEYS.seasons);
      const players = localStorage.getItem(this.SIMPLE_KEYS.players);
      return !!(seasons || players);
    } catch (error) {
      console.error('Error checking for simple version data:', error);
      return false;
    }
  }

  /**
   * Check if TypeScript version data exists in localStorage
   */
  static hasTypeScriptVersionData(): boolean {
    try {
      const seasons = localStorage.getItem(this.TYPESCRIPT_KEYS.seasons);
      const players = localStorage.getItem(this.TYPESCRIPT_KEYS.players);
      return !!(seasons || players);
    } catch (error) {
      console.error('Error checking for TypeScript version data:', error);
      return false;
    }
  }

  /**
   * Migrate seasons from simple version format to TypeScript format
   */
  static migrateSeasons(): Season[] {
    try {
      const simpleSeasons = localStorage.getItem(this.SIMPLE_KEYS.seasons);
      if (!simpleSeasons) {
        return [];
      }

      const parsedSeasons = JSON.parse(simpleSeasons);
      if (!Array.isArray(parsedSeasons)) {
        console.warn('Simple seasons data is not an array');
        return [];
      }

      return parsedSeasons.map((simpleSeason: any) => {
        // Convert simple season format to TypeScript format
        const seasonData = {
          id: simpleSeason.id || `migrated_season_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: simpleSeason.name || 'Migrated Season',
          startDate: simpleSeason.startDate ? new Date(simpleSeason.startDate) : new Date(),
          endDate: simpleSeason.endDate ? new Date(simpleSeason.endDate) : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          isActive: simpleSeason.isActive || false,
          createdAt: new Date(),
          playerIds: [],
          weekIds: []
        };

        return new SeasonModel(seasonData);
      });
    } catch (error) {
      console.error('Error migrating seasons:', error);
      return [];
    }
  }

  /**
   * Migrate players from simple version format to TypeScript format
   */
  static migratePlayers(): Player[] {
    try {
      const simplePlayers = localStorage.getItem(this.SIMPLE_KEYS.players);
      if (!simplePlayers) {
        return [];
      }

      const parsedPlayers = JSON.parse(simplePlayers);
      if (!Array.isArray(parsedPlayers)) {
        console.warn('Simple players data is not an array');
        return [];
      }

      return parsedPlayers.map((simplePlayer: any) => {
        // Convert simple player format to TypeScript format
        const playerData = {
          id: simplePlayer.id || `migrated_player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          firstName: simplePlayer.firstName || 'Unknown',
          lastName: simplePlayer.lastName || 'Player',
          handedness: (simplePlayer.handedness === 'left' || simplePlayer.handedness === 'right') 
            ? simplePlayer.handedness 
            : 'right' as const,
          timePreference: (['AM', 'PM', 'Either'].includes(simplePlayer.timePreference)) 
            ? simplePlayer.timePreference 
            : 'Either' as const,
          seasonId: simplePlayer.seasonId || '',
          createdAt: new Date()
        };

        return new PlayerModel(playerData);
      });
    } catch (error) {
      console.error('Error migrating players:', error);
      return [];
    }
  }

  /**
   * Get the active season ID from simple version
   */
  static getActiveSeasonId(): string | null {
    try {
      return localStorage.getItem(this.SIMPLE_KEYS.activeSeason);
    } catch (error) {
      console.error('Error getting active season ID:', error);
      return null;
    }
  }

  /**
   * Perform complete migration from simple version to TypeScript version
   */
  static performMigration(): {
    seasons: Season[];
    players: Player[];
    activeSeasonId: string | null;
    success: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
    let seasons: Season[] = [];
    let players: Player[] = [];
    let activeSeasonId: string | null = null;

    try {
      // Check if migration is needed
      if (!this.hasSimpleVersionData()) {
        return {
          seasons: [],
          players: [],
          activeSeasonId: null,
          success: true,
          errors: ['No simple version data found to migrate']
        };
      }

      // Check if TypeScript data already exists
      if (this.hasTypeScriptVersionData()) {
        return {
          seasons: [],
          players: [],
          activeSeasonId: null,
          success: true,
          errors: ['TypeScript version data already exists, skipping migration']
        };
      }

      // Migrate seasons
      try {
        seasons = this.migrateSeasons();
      } catch (error) {
        errors.push(`Season migration failed: ${error}`);
      }

      // Migrate players
      try {
        players = this.migratePlayers();
      } catch (error) {
        errors.push(`Player migration failed: ${error}`);
      }

      // Get active season
      try {
        activeSeasonId = this.getActiveSeasonId();
      } catch (error) {
        errors.push(`Active season migration failed: ${error}`);
      }

      // Update player seasonIds to match migrated season IDs if needed
      if (seasons.length > 0 && players.length > 0) {
        const seasonIdMap = new Map<string, string>();
        
        // Create mapping from old season IDs to new season IDs
        seasons.forEach(season => {
          // Try to find the original ID in the season data
          const originalId = season.id.startsWith('migrated_') ? null : season.id;
          if (originalId) {
            seasonIdMap.set(originalId, season.id);
          }
        });

        // Update player seasonIds
        players.forEach(player => {
          if (player.seasonId && seasonIdMap.has(player.seasonId)) {
            player.seasonId = seasonIdMap.get(player.seasonId)!;
          } else if (seasons.length > 0) {
            // If no mapping found, assign to first season
            player.seasonId = seasons[0].id;
          }
        });

        // Update season playerIds
        seasons.forEach(season => {
          const seasonPlayers = players.filter(p => p.seasonId === season.id);
          season.playerIds = seasonPlayers.map(p => p.id);
        });

        // Update active season ID if it was mapped
        if (activeSeasonId && seasonIdMap.has(activeSeasonId)) {
          activeSeasonId = seasonIdMap.get(activeSeasonId)!;
        } else if (seasons.length > 0) {
          // If no mapping found, set first season as active
          activeSeasonId = seasons[0].id;
          seasons[0].isActive = true;
        }
      } else if (players.length > 0 && seasons.length === 0) {
        // If we have players but no seasons, create a default season
        const defaultSeason = new SeasonModel({
          name: 'Migrated Season',
          startDate: new Date(),
          endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          isActive: true,
          createdAt: new Date(),
          playerIds: players.map(p => p.id),
          weekIds: []
        });
        
        seasons.push(defaultSeason);
        activeSeasonId = defaultSeason.id;
        
        // Update all players to reference the new season
        players.forEach(player => {
          player.seasonId = defaultSeason.id;
        });
      }

      return {
        seasons,
        players,
        activeSeasonId,
        success: errors.length === 0,
        errors
      };

    } catch (error) {
      errors.push(`Migration failed: ${error}`);
      return {
        seasons: [],
        players: [],
        activeSeasonId: null,
        success: false,
        errors
      };
    }
  }

  /**
   * Save migrated data to TypeScript version storage keys
   */
  static saveMigratedData(seasons: Season[], players: Player[]): void {
    try {
      // Save seasons
      if (seasons.length > 0) {
        localStorage.setItem(this.TYPESCRIPT_KEYS.seasons, JSON.stringify(seasons));
      }

      // Save players
      if (players.length > 0) {
        localStorage.setItem(this.TYPESCRIPT_KEYS.players, JSON.stringify(players));
      }
    } catch (error) {
      console.error('Error saving migrated data:', error);
      throw new Error(`Failed to save migrated data: ${error}`);
    }
  }

  /**
   * Backup simple version data before migration
   */
  static backupSimpleVersionData(): void {
    try {
      const timestamp = Date.now();
      
      // Backup seasons
      const seasons = localStorage.getItem(this.SIMPLE_KEYS.seasons);
      if (seasons) {
        localStorage.setItem(`${this.SIMPLE_KEYS.seasons}_backup_${timestamp}`, seasons);
      }

      // Backup players
      const players = localStorage.getItem(this.SIMPLE_KEYS.players);
      if (players) {
        localStorage.setItem(`${this.SIMPLE_KEYS.players}_backup_${timestamp}`, players);
      }

      // Backup active season
      const activeSeason = localStorage.getItem(this.SIMPLE_KEYS.activeSeason);
      if (activeSeason) {
        localStorage.setItem(`${this.SIMPLE_KEYS.activeSeason}_backup_${timestamp}`, activeSeason);
      }
    } catch (error) {
      console.error('Error backing up simple version data:', error);
      throw new Error(`Failed to backup simple version data: ${error}`);
    }
  }

  /**
   * Complete migration process with backup
   */
  static performCompleteDataMigration(): {
    success: boolean;
    message: string;
    migratedSeasons: number;
    migratedPlayers: number;
    errors: string[];
  } {
    try {
      // Backup existing data
      this.backupSimpleVersionData();

      // Perform migration
      const migrationResult = this.performMigration();

      if (migrationResult.success && (migrationResult.seasons.length > 0 || migrationResult.players.length > 0)) {
        // Save migrated data
        this.saveMigratedData(migrationResult.seasons, migrationResult.players);

        return {
          success: true,
          message: 'Data migration completed successfully',
          migratedSeasons: migrationResult.seasons.length,
          migratedPlayers: migrationResult.players.length,
          errors: migrationResult.errors
        };
      } else {
        return {
          success: true,
          message: migrationResult.errors.length > 0 ? migrationResult.errors[0] : 'No data to migrate',
          migratedSeasons: 0,
          migratedPlayers: 0,
          errors: migrationResult.errors
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Migration failed: ${error}`,
        migratedSeasons: 0,
        migratedPlayers: 0,
        errors: [String(error)]
      };
    }
  }
}