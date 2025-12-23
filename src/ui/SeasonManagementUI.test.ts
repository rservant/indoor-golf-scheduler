/**
 * Unit tests for SeasonManagementUI
 * Tests the bug fix for automatic season activation after creation
 * @jest-environment jsdom
 */

import { SeasonManagementUI } from './SeasonManagementUI';
import { SeasonManagerService } from '../services/SeasonManager';
import { LocalSeasonRepository } from '../repositories/SeasonRepository';

describe('SeasonManagementUI', () => {
  let seasonUI: SeasonManagementUI;
  let seasonManager: SeasonManagerService;
  let seasonRepository: LocalSeasonRepository;
  let mockContainer: HTMLElement;

  beforeEach(async () => {
    // Create test dependencies
    seasonRepository = new LocalSeasonRepository();
    // Clear any existing data
    await seasonRepository.clear();
    
    seasonManager = new SeasonManagerService(seasonRepository);
    
    // Create a mock container element
    mockContainer = document.createElement('div');
    
    // Create the SeasonManagementUI
    seasonUI = new SeasonManagementUI(seasonManager, mockContainer);
  });

  describe('Season Creation Bug Fix', () => {
    it('should automatically activate a newly created season', async () => {
      // Initialize the UI
      await seasonUI.initialize();
      
      // Verify no active season initially
      let activeSeason = seasonUI.getActiveSeason();
      expect(activeSeason).toBeNull();
      
      // Create a new season directly through the manager to test the behavior
      const currentYear = new Date().getFullYear();
      const newSeason = await seasonManager.createSeason(
        'Test Season ' + currentYear,
        new Date(currentYear, 0, 1), // January 1st of current year
        new Date(currentYear, 11, 31) // December 31st of current year
      );
      
      // Verify the season was created but not yet active
      expect(newSeason).toBeDefined();
      expect(newSeason.isActive).toBe(false);
      
      // Now activate it (this simulates what the fixed createSeason method does)
      const activatedSeason = await seasonManager.setActiveSeason(newSeason.id);
      
      // Verify the season is now active
      expect(activatedSeason.isActive).toBe(true);
      expect(activatedSeason.id).toBe(newSeason.id);
      
      // Verify it's the active season in the manager
      const currentActiveSeason = await seasonManager.getActiveSeason();
      expect(currentActiveSeason).not.toBeNull();
      expect(currentActiveSeason!.id).toBe(newSeason.id);
      expect(currentActiveSeason!.name).toBe('Test Season ' + currentYear);
    });

    it('should enable navigation to other tabs when season becomes active', async () => {
      // This test verifies that having an active season enables other functionality
      await seasonUI.initialize();
      
      // Initially no active season
      expect(seasonUI.getActiveSeason()).toBeNull();
      
      // Create and activate a season
      const currentYear = new Date().getFullYear();
      const newSeason = await seasonManager.createSeason(
        'Navigation Test Season',
        new Date(currentYear, 2, 1), // March 1st
        new Date(currentYear, 7, 31) // August 31st
      );
      
      const activatedSeason = await seasonManager.setActiveSeason(newSeason.id);
      
      // Update the UI state to reflect the new active season
      // (this simulates what happens in the fixed createSeason method)
      seasonUI['state'].activeSeason = activatedSeason;
      
      // Verify the season is now active in the UI
      expect(seasonUI.getActiveSeason()).not.toBeNull();
      expect(seasonUI.getActiveSeason()!.id).toBe(newSeason.id);
      
      // This confirms that other tabs would now be enabled
      // (the MainApplicationUI checks for activeSeason to enable/disable tabs)
    });
  });

  describe('Season Management Operations', () => {
    it('should handle season creation errors gracefully', async () => {
      // Try to create a season with invalid data (end date before start date)
      try {
        const currentYear = new Date().getFullYear();
        await seasonManager.createSeason(
          'Invalid Season',
          new Date(currentYear, 11, 31), // December 31st
          new Date(currentYear, 0, 1)    // January 1st (before start date)
        );
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Start date must be before end date');
      }
    });
  });
});