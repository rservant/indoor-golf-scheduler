import * as fc from 'fast-check';
import { InMemorySeasonManager } from './SeasonManager';

describe('SeasonManager Property Tests', () => {
  /**
   * Feature: indoor-golf-scheduler, Property 1: Season data round trip
   * Validates: Requirements 1.1, 1.2
   */
  test('Property 1: Season data round trip - creating and retrieving season preserves all data', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }), // season name
        fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }), // start date
        fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }), // end date
        (name, startDate, endDate) => {
          // Ensure end date is after start date
          const actualStartDate = startDate;
          const actualEndDate = endDate > startDate ? endDate : new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
          
          const manager = new InMemorySeasonManager();
          
          // Create season with the generated data
          const createdSeason = manager.createSeason(name, actualStartDate, actualEndDate);
          
          // Retrieve the season
          const retrievedSeason = manager.getSeason(createdSeason.id);
          
          // Verify all fields are preserved
          expect(retrievedSeason).not.toBeNull();
          expect(retrievedSeason!.name).toBe(name);
          expect(retrievedSeason!.startDate).toEqual(actualStartDate);
          expect(retrievedSeason!.endDate).toEqual(actualEndDate);
          expect(retrievedSeason!.id).toBe(createdSeason.id);
          expect(retrievedSeason!.isActive).toBe(false); // new seasons start inactive
          expect(retrievedSeason!.playerIds).toEqual([]);
          expect(retrievedSeason!.weekIds).toEqual([]);
          expect(retrievedSeason!.createdAt).toEqual(createdSeason.createdAt);
        }
      ),
      { numRuns: 100 }
    );
  });
});