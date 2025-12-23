import * as fc from 'fast-check';
import { InMemorySeasonManager } from './SeasonManager';

describe('SeasonManager Property Tests', () => {
  /**
   * Feature: indoor-golf-scheduler, Property 1: Season data round trip
   * Validates: Requirements 1.1, 1.2
   */
  test('Property 1: Season data round trip - creating and retrieving season preserves all data', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0), // season name (non-empty after trim)
        fc.date({ min: new Date('2025-01-01'), max: new Date('2030-12-31') }), // start date
        fc.date({ min: new Date('2025-01-01'), max: new Date('2030-12-31') }), // end date
        async (name, startDate, endDate) => {
          // Ensure end date is after start date
          const actualStartDate = startDate;
          const actualEndDate = endDate > startDate ? endDate : new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
          
          const manager = new InMemorySeasonManager();
          
          // Create season with the generated data
          const createdSeason = await manager.createSeason(name, actualStartDate, actualEndDate);
          
          // Retrieve the season
          const retrievedSeason = await manager.getSeason(createdSeason.id);
          
          // Verify all fields are preserved (note: name is trimmed during creation)
          expect(retrievedSeason).not.toBeNull();
          expect(retrievedSeason!.name).toBe(name.trim()); // Names are trimmed during creation
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

describe('SeasonManager Unit Tests', () => {
  let manager: InMemorySeasonManager;

  beforeEach(() => {
    manager = new InMemorySeasonManager();
  });

  describe('Season Creation', () => {
    test('should create season with valid data', async () => {
      const name = 'Spring 2025';
      const startDate = new Date('2025-03-01');
      const endDate = new Date('2025-05-31');

      const season = await manager.createSeason(name, startDate, endDate);

      expect(season.name).toBe(name);
      expect(season.startDate).toEqual(startDate);
      expect(season.endDate).toEqual(endDate);
      expect(season.isActive).toBe(false);
      expect(season.playerIds).toEqual([]);
      expect(season.weekIds).toEqual([]);
      expect(season.id).toBeDefined();
      expect(season.createdAt).toBeInstanceOf(Date);
    });

    test('should reject empty season name', async () => {
      const startDate = new Date('2025-03-01');
      const endDate = new Date('2025-05-31');

      await expect(manager.createSeason('', startDate, endDate))
        .rejects.toThrow('Season name is required and cannot be empty');
    });

    test('should reject start date after end date', async () => {
      const name = 'Invalid Season';
      const startDate = new Date('2025-05-31');
      const endDate = new Date('2025-03-01');

      await expect(manager.createSeason(name, startDate, endDate))
        .rejects.toThrow('Start date must be before end date');
    });

    test('should reject duplicate season names', async () => {
      const name = 'Spring 2025';
      const startDate = new Date('2025-03-01');
      const endDate = new Date('2025-05-31');

      await manager.createSeason(name, startDate, endDate);
      
      await expect(manager.createSeason(name, new Date('2025-06-01'), new Date('2025-08-31')))
        .rejects.toThrow('Season with name "Spring 2025" already exists');
    });
  });

  describe('Active Season Management', () => {
    test('should set and get active season', async () => {
      const season1 = await manager.createSeason('Season 1', new Date('2025-01-01'), new Date('2025-03-31'));
      const season2 = await manager.createSeason('Season 2', new Date('2025-04-01'), new Date('2025-06-30'));

      // Initially no active season
      expect(await manager.getActiveSeason()).toBeNull();

      // Set season1 as active
      const activatedSeason = await manager.setActiveSeason(season1.id);
      expect(activatedSeason.isActive).toBe(true);
      expect((await manager.getActiveSeason())?.id).toBe(season1.id);

      // Switch to season2
      await manager.setActiveSeason(season2.id);
      expect((await manager.getActiveSeason())?.id).toBe(season2.id);
      
      // Verify season1 is no longer active
      const deactivatedSeason = await manager.getSeason(season1.id);
      expect(deactivatedSeason?.isActive).toBe(false);
    });

    test('should reject setting non-existent season as active', async () => {
      await expect(manager.setActiveSeason('non-existent-id'))
        .rejects.toThrow('Season with ID "non-existent-id" not found');
    });
  });

  describe('Season Updates', () => {
    test('should update season data', async () => {
      const season = await manager.createSeason('Original Name', new Date('2025-01-01'), new Date('2025-03-31'));
      
      const updatedSeason = await manager.updateSeason(season.id, {
        name: 'Updated Name'
      });

      expect(updatedSeason.name).toBe('Updated Name');
      expect(updatedSeason.startDate).toEqual(season.startDate);
      expect(updatedSeason.endDate).toEqual(season.endDate);
    });

    test('should reject updating to duplicate name', async () => {
      const season1 = await manager.createSeason('Season 1', new Date('2025-01-01'), new Date('2025-03-31'));
      await manager.createSeason('Season 2', new Date('2025-04-01'), new Date('2025-06-30'));

      await expect(manager.updateSeason(season1.id, { name: 'Season 2' }))
        .rejects.toThrow('Season with name "Season 2" already exists');
    });
  });

  describe('Season Deletion and Archiving', () => {
    test('should delete empty season', async () => {
      const season = await manager.createSeason('Test Season', new Date('2025-01-01'), new Date('2025-03-31'));
      
      await manager.deleteSeason(season.id);
      
      expect(await manager.getSeason(season.id)).toBeNull();
    });

    test('should reject deleting season with associated data', async () => {
      const season = await manager.createSeason('Test Season', new Date('2025-01-01'), new Date('2025-03-31'));
      
      // Simulate adding a player
      await manager.updateSeason(season.id, { playerIds: ['player1'] });
      
      await expect(manager.deleteSeason(season.id))
        .rejects.toThrow('Cannot delete season with associated players or weeks. Archive the season instead.');
    });

    test('should archive season', async () => {
      const season = await manager.createSeason('Test Season', new Date('2025-01-01'), new Date('2025-03-31'));
      await manager.setActiveSeason(season.id);
      
      const archivedSeason = await manager.archiveSeason(season.id);
      
      expect(archivedSeason.isActive).toBe(false);
      expect(await manager.getActiveSeason()).toBeNull();
    });
  });

  describe('Input Validation', () => {
    test('should reject empty season ID', async () => {
      await expect(manager.getSeason(''))
        .rejects.toThrow('Season ID is required');
      
      await expect(manager.setActiveSeason(''))
        .rejects.toThrow('Season ID is required');
      
      await expect(manager.updateSeason('', {}))
        .rejects.toThrow('Season ID is required');
      
      await expect(manager.deleteSeason(''))
        .rejects.toThrow('Season ID is required');
      
      await expect(manager.archiveSeason(''))
        .rejects.toThrow('Season ID is required');
    });

    test('should validate season name length', async () => {
      const longName = 'a'.repeat(101);
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-03-31');

      await expect(manager.createSeason(longName, startDate, endDate))
        .rejects.toThrow('Season name cannot exceed 100 characters');
    });

    test('should reject dates too far in the past', async () => {
      const name = 'Old Season';
      const startDate = new Date('2020-01-01');
      const endDate = new Date('2020-03-31'); // More than a year ago

      await expect(manager.createSeason(name, startDate, endDate))
        .rejects.toThrow('End date cannot be more than one year in the past');
    });
  });
});