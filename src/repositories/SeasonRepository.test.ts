import * as fc from 'fast-check';
import { LocalSeasonRepository } from './SeasonRepository';
import { LocalPlayerRepository } from './PlayerRepository';
import { Handedness, TimePreference } from '../models/Player';

// Mock localStorage for testing
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    }
  };
})();

// Mock localStorage in global scope for Node.js environment
(global as any).localStorage = localStorageMock;

describe('SeasonRepository Property Tests', () => {
  let seasonRepository: LocalSeasonRepository;
  let playerRepository: LocalPlayerRepository;

  beforeEach(() => {
    localStorage.clear();
    seasonRepository = new LocalSeasonRepository();
    playerRepository = new LocalPlayerRepository();
  });

  /**
   * **Feature: indoor-golf-scheduler, Property 2: Active season context isolation**
   * **Validates: Requirements 1.3, 1.4**
   */
  test('Property 2: Active season context isolation', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate multiple seasons with unique names
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            startDate: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
            endDate: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
          }).filter(data => data.startDate < data.endDate),
          { minLength: 2, maxLength: 5 }
        ),
        // Generate players for each season
        fc.array(
          fc.record({
            firstName: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
            lastName: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
            handedness: fc.constantFrom('left' as Handedness, 'right' as Handedness),
            timePreference: fc.constantFrom('AM' as TimePreference, 'PM' as TimePreference, 'Either' as TimePreference)
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (seasonDataArray, playerDataArray) => {
          // Clear localStorage for each property test run
          localStorage.clear();
          
          // Ensure unique season names by adding index suffix and timestamp
          const timestamp = Date.now();
          const uniqueSeasonData = seasonDataArray.map((data, index) => ({
            ...data,
            name: `${data.name}_${timestamp}_${index}`
          }));

          if (uniqueSeasonData.length < 2) {
            return; // Skip if we don't have at least 2 seasons
          }

          // Create multiple seasons
          const createdSeasons = [];
          for (const seasonData of uniqueSeasonData) {
            const season = await seasonRepository.create(seasonData);
            createdSeasons.push(season);
          }

          // Set the first season as active
          const firstSeason = createdSeasons[0];
          await seasonRepository.setActiveSeason(firstSeason.id);

          // Add players to the first season with unique names
          const firstSeasonPlayers = [];
          for (let i = 0; i < Math.min(playerDataArray.length, 5); i++) {
            const playerData = playerDataArray[i];
            try {
              const player = await playerRepository.create({
                ...playerData,
                firstName: `${playerData.firstName}_s1_${i}`,
                lastName: `${playerData.lastName}_s1_${i}`,
                seasonId: firstSeason.id
              });
              firstSeasonPlayers.push(player);
            } catch (error) {
              // Skip if there are still duplicates
              continue;
            }
          }

          // Set the second season as active
          const secondSeason = createdSeasons[1];
          await seasonRepository.setActiveSeason(secondSeason.id);

          // Add players to the second season with unique names
          const secondSeasonPlayers = [];
          for (let i = 0; i < Math.min(playerDataArray.length, 5); i++) {
            const playerData = playerDataArray[i];
            try {
              const player = await playerRepository.create({
                ...playerData,
                firstName: `${playerData.firstName}_s2_${i}`,
                lastName: `${playerData.lastName}_s2_${i}`,
                seasonId: secondSeason.id
              });
              secondSeasonPlayers.push(player);
            } catch (error) {
              // Skip if there are still duplicates
              continue;
            }
          }

          // Verify active season context isolation
          const activeSeason = await seasonRepository.getActiveSeason();
          expect(activeSeason).not.toBeNull();
          expect(activeSeason!.id).toBe(secondSeason.id);

          // Verify that only the second season is active
          const allSeasons = await seasonRepository.findAll();
          const activeSeasons = allSeasons.filter(s => s.isActive);
          expect(activeSeasons).toHaveLength(1);
          expect(activeSeasons[0].id).toBe(secondSeason.id);

          // Verify that players are correctly scoped to their respective seasons
          const firstSeasonPlayersFromRepo = await playerRepository.findBySeasonId(firstSeason.id);
          const secondSeasonPlayersFromRepo = await playerRepository.findBySeasonId(secondSeason.id);

          // Players should be isolated by season
          expect(firstSeasonPlayersFromRepo.length).toBe(firstSeasonPlayers.length);
          expect(secondSeasonPlayersFromRepo.length).toBe(secondSeasonPlayers.length);

          // Verify no cross-contamination between seasons
          const firstSeasonPlayerIds = new Set(firstSeasonPlayersFromRepo.map(p => p.id));
          const secondSeasonPlayerIds = new Set(secondSeasonPlayersFromRepo.map(p => p.id));
          
          // No player should exist in both seasons
          const intersection = new Set([...firstSeasonPlayerIds].filter(id => secondSeasonPlayerIds.has(id)));
          expect(intersection.size).toBe(0);

          // All players in first season should have correct seasonId
          firstSeasonPlayersFromRepo.forEach(player => {
            expect(player.seasonId).toBe(firstSeason.id);
          });

          // All players in second season should have correct seasonId
          secondSeasonPlayersFromRepo.forEach(player => {
            expect(player.seasonId).toBe(secondSeason.id);
          });
        }
      ),
      { numRuns: 100 }
    );
  });
});