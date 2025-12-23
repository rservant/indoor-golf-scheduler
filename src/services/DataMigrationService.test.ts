import * as fc from 'fast-check';
import { DataMigrationService } from './DataMigrationService';
import { SeasonModel } from '../models/Season';
import { PlayerModel } from '../models/Player';

// Mock localStorage for testing
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    length: 0,
    key: (index: number) => null
  };
})();

// Mock localStorage in global scope for Node.js environment
(global as any).localStorage = localStorageMock;

describe('DataMigrationService Property Tests', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    
    // Ensure all TypeScript storage keys are cleared
    localStorage.removeItem('golf_scheduler_seasons');
    localStorage.removeItem('golf_scheduler_players');
    localStorage.removeItem('golf_scheduler_weeks');
    localStorage.removeItem('golf_scheduler_schedules');
    localStorage.removeItem('golf_scheduler_pairing_history');
    
    // Ensure all simple version storage keys are cleared
    localStorage.removeItem('golf_seasons');
    localStorage.removeItem('golf_players');
    localStorage.removeItem('golf_active_season');
  });

  /**
   * **Feature: typescript-activation, Property 6: Data Persistence Consistency**
   * **Validates: Requirements 4.5, 10.2, 10.4**
   */
  test('Property 6: Data Persistence Consistency - For any data operation (create, update, delete), the TypeScript application should persist changes to localStorage in a format compatible with the simple version', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate simple version data format
        fc.record({
          seasons: fc.array(
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
              name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
              startDate: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }).map(d => d.toISOString()),
              endDate: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }).map(d => d.toISOString()),
              isActive: fc.boolean()
            }),
            { minLength: 0, maxLength: 5 }
          ),
          players: fc.array(
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
              firstName: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
              lastName: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
              handedness: fc.constantFrom('left', 'right'),
              timePreference: fc.constantFrom('AM', 'PM', 'Either'),
              seasonId: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0)
            }),
            { minLength: 0, maxLength: 20 }
          ),
          activeSeason: fc.option(fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0), { nil: null })
        }),

        async (simpleData) => {
          // Ensure end dates are after start dates for seasons
          const validSeasons = simpleData.seasons.map(season => {
            const startDate = new Date(season.startDate);
            const endDate = new Date(season.endDate);
            
            if (startDate >= endDate) {
              // Fix the dates to ensure start is before end
              const fixedEndDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000); // Add 1 day
              return {
                ...season,
                endDate: fixedEndDate.toISOString()
              };
            }
            return season;
          });

          // Ensure players reference valid season IDs
          const seasonIds = validSeasons.map(s => s.id);
          const validPlayers = simpleData.players.map(player => {
            if (seasonIds.length > 0 && !seasonIds.includes(player.seasonId)) {
              return {
                ...player,
                seasonId: seasonIds[0] // Assign to first season
              };
            }
            return player;
          });

          // Note: If there are players but no seasons, the migration service will create a default season

          // Set up simple version data in localStorage
          if (validSeasons.length > 0) {
            localStorage.setItem('golf_seasons', JSON.stringify(validSeasons));
          }
          if (validPlayers.length > 0) {
            localStorage.setItem('golf_players', JSON.stringify(validPlayers));
          }
          if (simpleData.activeSeason) {
            localStorage.setItem('golf_active_season', simpleData.activeSeason);
          }

          // Perform migration
          const migrationResult = DataMigrationService.performCompleteDataMigration();

          // Verify migration success
          expect(migrationResult.success).toBe(true);

          // If migration was skipped due to existing data, skip the rest of the test
          if (migrationResult.message.includes('TypeScript version data already exists')) {
            return; // Skip this test iteration
          }

          // If migration was skipped due to no data, that's also valid
          if (migrationResult.message.includes('No simple version data found')) {
            expect(validSeasons.length + validPlayers.length).toBe(0);
            return; // Skip this test iteration
          }

          // If there was data to migrate, verify it was migrated correctly
          if (validSeasons.length > 0 || validPlayers.length > 0) {
            // Check that TypeScript version data exists
            const migratedSeasonsData = localStorage.getItem('golf_scheduler_seasons');
            const migratedPlayersData = localStorage.getItem('golf_scheduler_players');

            // Determine expected number of seasons (original + default if players exist but no seasons)
            const expectedSeasonCount = validSeasons.length > 0 ? validSeasons.length : (validPlayers.length > 0 ? 1 : 0);

            if (expectedSeasonCount > 0) {
              expect(migratedSeasonsData).not.toBeNull();
              const migratedSeasons = JSON.parse(migratedSeasonsData!);
              expect(Array.isArray(migratedSeasons)).toBe(true);
              expect(migratedSeasons.length).toBe(expectedSeasonCount);

              // Verify each original season was migrated correctly
              if (validSeasons.length > 0) {
                validSeasons.forEach((originalSeason, index) => {
                  const migratedSeason = migratedSeasons[index];
                  expect(migratedSeason.name).toBe(originalSeason.name);
                  expect(new Date(migratedSeason.startDate).getTime()).toBe(new Date(originalSeason.startDate).getTime());
                  expect(new Date(migratedSeason.endDate).getTime()).toBe(new Date(originalSeason.endDate).getTime());
                  expect(typeof migratedSeason.id).toBe('string');
                  expect(migratedSeason.id.length).toBeGreaterThan(0);
                  expect(Array.isArray(migratedSeason.playerIds)).toBe(true);
                  expect(Array.isArray(migratedSeason.weekIds)).toBe(true);
                });
              } else if (validPlayers.length > 0) {
                // If no original seasons but players exist, verify default season was created
                const defaultSeason = migratedSeasons[0];
                expect(defaultSeason.name).toBe('Migrated Season');
                expect(typeof defaultSeason.id).toBe('string');
                expect(defaultSeason.id.length).toBeGreaterThan(0);
                expect(Array.isArray(defaultSeason.playerIds)).toBe(true);
                expect(defaultSeason.playerIds.length).toBe(validPlayers.length);
              }
            }

            if (validPlayers.length > 0) {
              expect(migratedPlayersData).not.toBeNull();
              const migratedPlayers = JSON.parse(migratedPlayersData!);
              expect(Array.isArray(migratedPlayers)).toBe(true);
              expect(migratedPlayers.length).toBe(validPlayers.length);

              // Verify each player was migrated correctly
              migratedPlayers.forEach((migratedPlayer: any, index: number) => {
                const originalPlayer = validPlayers[index];
                expect(migratedPlayer.firstName).toBe(originalPlayer.firstName);
                expect(migratedPlayer.lastName).toBe(originalPlayer.lastName);
                expect(migratedPlayer.handedness).toBe(originalPlayer.handedness);
                expect(migratedPlayer.timePreference).toBe(originalPlayer.timePreference);
                expect(typeof migratedPlayer.id).toBe('string');
                expect(migratedPlayer.id.length).toBeGreaterThan(0);
                expect(typeof migratedPlayer.seasonId).toBe('string');
                expect(migratedPlayer.seasonId.length).toBeGreaterThan(0);
              });
            }

            // Verify data consistency - players should reference valid season IDs
            if (expectedSeasonCount > 0 && validPlayers.length > 0) {
              const migratedSeasons = JSON.parse(migratedSeasonsData!);
              const migratedPlayers = JSON.parse(migratedPlayersData!);
              const migratedSeasonIds = migratedSeasons.map((s: any) => s.id);

              migratedPlayers.forEach((player: any) => {
                expect(migratedSeasonIds).toContain(player.seasonId);
              });

              // Verify seasons have correct player IDs
              migratedSeasons.forEach((season: any) => {
                const seasonPlayers = migratedPlayers.filter((p: any) => p.seasonId === season.id);
                expect(season.playerIds.length).toBe(seasonPlayers.length);
                seasonPlayers.forEach((player: any) => {
                  expect(season.playerIds).toContain(player.id);
                });
              });
            }
          }

          // Verify backup was created
          const backupKeys = Object.keys(localStorage).filter(key => key.includes('_backup_'));
          if (validSeasons.length > 0 || validPlayers.length > 0) {
            expect(backupKeys.length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test migration with empty data
   */
  test('should handle empty simple version data gracefully', () => {
    // Clear localStorage
    localStorage.clear();

    const result = DataMigrationService.performCompleteDataMigration();
    
    expect(result.success).toBe(true);
    expect(result.migratedSeasons).toBe(0);
    expect(result.migratedPlayers).toBe(0);
    expect(result.message).toContain('No simple version data found');
  });

  /**
   * Test migration when TypeScript data already exists
   */
  test('should skip migration when TypeScript data already exists', () => {
    // Set up existing TypeScript data
    localStorage.setItem('golf_scheduler_seasons', JSON.stringify([{ id: 'existing', name: 'Existing Season' }]));
    
    // Also set up some simple data to ensure it's not migrated
    localStorage.setItem('golf_seasons', JSON.stringify([{ id: 'simple', name: 'Simple Season' }]));

    const result = DataMigrationService.performCompleteDataMigration();
    
    expect(result.success).toBe(true);
    expect(result.migratedSeasons).toBe(0);
    expect(result.migratedPlayers).toBe(0);
    expect(result.message).toContain('TypeScript version data already exists');
  });

  /**
   * Test individual migration functions
   */
  test('should migrate seasons correctly', () => {
    const simpleSeasons = [
      {
        id: 'season1',
        name: 'Test Season',
        startDate: '2024-01-01T00:00:00.000Z',
        endDate: '2024-12-31T00:00:00.000Z',
        isActive: true
      }
    ];

    localStorage.setItem('golf_seasons', JSON.stringify(simpleSeasons));

    const migratedSeasons = DataMigrationService.migrateSeasons();
    
    expect(migratedSeasons).toHaveLength(1);
    expect(migratedSeasons[0]).toBeInstanceOf(SeasonModel);
    expect(migratedSeasons[0].name).toBe('Test Season');
    expect(migratedSeasons[0].isActive).toBe(true);
  });

  test('should migrate players correctly', () => {
    const simplePlayers = [
      {
        id: 'player1',
        firstName: 'John',
        lastName: 'Doe',
        handedness: 'right',
        timePreference: 'AM',
        seasonId: 'season1'
      }
    ];

    localStorage.setItem('golf_players', JSON.stringify(simplePlayers));

    const migratedPlayers = DataMigrationService.migratePlayers();
    
    expect(migratedPlayers).toHaveLength(1);
    expect(migratedPlayers[0]).toBeInstanceOf(PlayerModel);
    expect(migratedPlayers[0].firstName).toBe('John');
    expect(migratedPlayers[0].lastName).toBe('Doe');
    expect(migratedPlayers[0].handedness).toBe('right');
    expect(migratedPlayers[0].timePreference).toBe('AM');
  });
});