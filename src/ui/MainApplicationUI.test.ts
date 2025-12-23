import { MainApplicationUI } from './MainApplicationUI';
import { Season } from '../models/Season';

// Mock the UI components
jest.mock('./SeasonManagementUI', () => {
  return {
    SeasonManagementUI: jest.fn().mockImplementation(() => ({
      initialize: jest.fn().mockResolvedValue(undefined),
      getActiveSeason: jest.fn().mockReturnValue({
        id: 'season-1',
        name: 'Winter 2024',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-03-31'),
        createdAt: new Date('2024-01-01'),
        isActive: true,
        playerIds: ['player1', 'player2'],
        weekIds: ['week1', 'week2']
      }), // Return an active season
      onActiveSeasonChange: jest.fn(),
      refresh: jest.fn().mockResolvedValue(undefined),
      container: document.createElement('div')
    }))
  };
});

jest.mock('./PlayerManagementUI', () => {
  return {
    PlayerManagementUI: jest.fn().mockImplementation(() => ({
      initialize: jest.fn().mockResolvedValue(undefined),
      setActiveSeason: jest.fn().mockResolvedValue(undefined),
      refresh: jest.fn().mockResolvedValue(undefined),
      container: document.createElement('div')
    }))
  };
});

jest.mock('./AvailabilityManagementUI', () => {
  return {
    AvailabilityManagementUI: jest.fn().mockImplementation(() => ({
      initialize: jest.fn().mockResolvedValue(undefined),
      setActiveSeason: jest.fn().mockResolvedValue(undefined),
      refresh: jest.fn().mockResolvedValue(undefined),
      container: document.createElement('div')
    }))
  };
});

jest.mock('./ScheduleDisplayUI', () => {
  return {
    ScheduleDisplayUI: jest.fn().mockImplementation(() => ({
      initialize: jest.fn().mockResolvedValue(undefined),
      setActiveSeason: jest.fn().mockResolvedValue(undefined),
      refresh: jest.fn().mockResolvedValue(undefined),
      onScheduleGeneratedCallback: jest.fn(),
      getSelectedWeek: jest.fn(),
      container: document.createElement('div')
    }))
  };
});

// No need to mock ScheduleEditingUI anymore since it's been merged into ScheduleDisplayUI

describe('MainApplicationUI Navigation Bug Tests', () => {
  let mainUI: MainApplicationUI;
  let container: HTMLElement;
  let mockSeasonManager: any;
  let mockPlayerManager: any;
  let mockScheduleManager: any;
  let mockScheduleGenerator: any;
  let mockWeekRepository: any;
  let mockExportService: any;
  let mockPairingHistoryTracker: any;

  // Test seasons
  const season1: Season = {
    id: 'season-1',
    name: 'Winter 2024',
    startDate: new Date('2024-01-01'),
    endDate: new Date('2024-03-31'),
    createdAt: new Date('2024-01-01'),
    isActive: true,
    playerIds: ['player1', 'player2'],
    weekIds: ['week1', 'week2']
  };

  const season2: Season = {
    id: 'season-2',
    name: 'Spring 2024',
    startDate: new Date('2024-04-01'),
    endDate: new Date('2024-06-30'),
    createdAt: new Date('2024-04-01'),
    isActive: false,
    playerIds: ['player3', 'player4'],
    weekIds: ['week3', 'week4']
  };

  beforeEach(() => {
    // Set up DOM
    document.body.innerHTML = '<div id="app-container"></div>';
    container = document.getElementById('app-container')!;

    // Create simple mocks
    mockSeasonManager = {
      getAllSeasons: jest.fn().mockResolvedValue([season1, season2]),
      getActiveSeason: jest.fn().mockResolvedValue(season1), // Return season1 as active initially
      setActiveSeason: jest.fn().mockImplementation(async (seasonId: string) => {
        const season = [season1, season2].find(s => s.id === seasonId);
        if (season) {
          return { ...season, isActive: true };
        }
        throw new Error('Season not found');
      }),
      createSeason: jest.fn(),
      deleteSeason: jest.fn()
    };

    mockPlayerManager = {
      initialize: jest.fn().mockResolvedValue(undefined),
      setActiveSeason: jest.fn().mockResolvedValue(undefined),
      refresh: jest.fn().mockResolvedValue(undefined),
      getAllPlayers: jest.fn().mockResolvedValue([]),
      getPlayersForSeason: jest.fn().mockResolvedValue([])
    };

    mockScheduleManager = {
      initialize: jest.fn().mockResolvedValue(undefined),
      setActiveSeason: jest.fn().mockResolvedValue(undefined),
      refresh: jest.fn().mockResolvedValue(undefined)
    };

    mockScheduleGenerator = {
      generateSchedule: jest.fn()
    };

    mockWeekRepository = {
      getWeeksForSeason: jest.fn().mockResolvedValue([])
    };

    mockExportService = {
      exportToCsv: jest.fn()
    };

    mockPairingHistoryTracker = {
      trackPairing: jest.fn()
    };

    // Create MainApplicationUI instance
    mainUI = new MainApplicationUI(
      container,
      mockSeasonManager,
      mockPlayerManager,
      mockScheduleManager,
      mockScheduleGenerator,
      mockWeekRepository,
      mockExportService,
      mockPairingHistoryTracker
    );
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  describe('Navigation Bug Reproduction', () => {
    test('should maintain clickable navigation after season switch', async () => {
      console.log('=== TEST: Navigation Bug Reproduction ===');
      
      // Step 1: Initialize the application
      console.log('Step 1: Initializing application...');
      await mainUI.initialize();
      
      // Verify initial state
      expect(container.querySelector('.main-application')).toBeTruthy();
      expect(container.querySelector('.app-navigation')).toBeTruthy();
      
      const navButtons = container.querySelectorAll('.nav-tab');
      expect(navButtons).toHaveLength(6); // Updated to include Import/Export tab
      
      console.log('Initial navigation buttons found:', navButtons.length);
      
      // Step 2: Verify initial navigation works
      console.log('Step 2: Testing initial navigation...');
      const playersButton = container.querySelector('[data-tab="players"]') as HTMLButtonElement;
      const scheduleButton = container.querySelector('[data-tab="schedule"]') as HTMLButtonElement;
      
      expect(playersButton).toBeTruthy();
      expect(scheduleButton).toBeTruthy();
      expect(playersButton.hasAttribute('disabled')).toBe(false);
      expect(scheduleButton.hasAttribute('disabled')).toBe(false);
      
      // Test clicking players button initially
      console.log('Clicking players button initially...');
      playersButton.click();
      expect(mainUI.getCurrentTab()).toBe('players');
      
      // Step 3: Switch to a different existing season (this is where the bug occurs)
      console.log('Step 3: Switching to different season...');
      
      // Simulate clicking the activate button for season2
      // First we need to trigger the season change through the SeasonManagementUI
      // Since we can't easily access the SeasonManagementUI directly, we'll simulate
      // the callback that would be triggered
      const seasonUI = (mainUI as any).seasonUI;
      const onSeasonChangeCallback = (seasonUI as any).onSeasonChange;
      
      if (onSeasonChangeCallback) {
        console.log('Triggering season change callback...');
        await onSeasonChangeCallback(season2);
      }
      
      // Step 4: Verify navigation buttons are still clickable
      console.log('Step 4: Testing navigation after season switch...');
      
      // Re-query buttons (they might have been recreated)
      const playersButtonAfter = container.querySelector('[data-tab="players"]') as HTMLButtonElement;
      const scheduleButtonAfter = container.querySelector('[data-tab="schedule"]') as HTMLButtonElement;
      
      expect(playersButtonAfter).toBeTruthy();
      expect(scheduleButtonAfter).toBeTruthy();
      
      // Check if buttons are enabled
      console.log('Players button disabled after switch:', playersButtonAfter.hasAttribute('disabled'));
      console.log('Schedule button disabled after switch:', scheduleButtonAfter.hasAttribute('disabled'));
      
      expect(playersButtonAfter.hasAttribute('disabled')).toBe(false);
      expect(scheduleButtonAfter.hasAttribute('disabled')).toBe(false);
      
      // Step 5: Test clicking navigation after season switch (this should work but currently fails)
      console.log('Step 5: Testing click functionality after season switch...');
      
      const currentTabBefore = mainUI.getCurrentTab();
      console.log('Current tab before click:', currentTabBefore);
      
      // Try clicking the schedule button
      console.log('Clicking schedule button after season switch...');
      scheduleButtonAfter.click();
      
      const currentTabAfter = mainUI.getCurrentTab();
      console.log('Current tab after click:', currentTabAfter);
      
      // This is the assertion that should pass but currently fails
      expect(currentTabAfter).toBe('schedule');
      
      // Additional debugging
      console.log('=== DEBUG INFO ===');
      console.log('Navigation element exists:', !!container.querySelector('.app-navigation'));
      console.log('Navigation has listener setup:', container.querySelector('.app-navigation')?.hasAttribute('data-listener-setup'));
      console.log('Schedule button element:', scheduleButtonAfter);
      console.log('Schedule button classes:', scheduleButtonAfter.className);
      console.log('Schedule button data-tab:', scheduleButtonAfter.getAttribute('data-tab'));
    });

    test('should maintain event listeners through DOM manipulations', async () => {
      console.log('=== TEST: Event Listener Persistence ===');
      
      await mainUI.initialize();
      
      const navigation = container.querySelector('.app-navigation') as HTMLElement;
      expect(navigation).toBeTruthy();
      
      // Check if event listener setup attribute exists
      expect(navigation.hasAttribute('data-listener-setup')).toBe(true);
      
      // Simulate multiple season switches
      const seasonUI = (mainUI as any).seasonUI;
      const onSeasonChangeCallback = (seasonUI as any).onSeasonChange;
      
      if (onSeasonChangeCallback) {
        // Switch to season2
        await onSeasonChangeCallback(season2);
        
        // Verify listener is still there
        const navigationAfter1 = container.querySelector('.app-navigation') as HTMLElement;
        expect(navigationAfter1.hasAttribute('data-listener-setup')).toBe(true);
        
        // Switch back to season1
        await onSeasonChangeCallback(season1);
        
        // Verify listener is still there
        const navigationAfter2 = container.querySelector('.app-navigation') as HTMLElement;
        expect(navigationAfter2.hasAttribute('data-listener-setup')).toBe(true);
      }
    });

    test('should handle click events with proper event delegation', async () => {
      console.log('=== TEST: Event Delegation ===');
      
      await mainUI.initialize();
      
      const navigation = container.querySelector('.app-navigation') as HTMLElement;
      const playersButton = container.querySelector('[data-tab="players"]') as HTMLButtonElement;
      
      // Create a custom click event
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window
      });
      
      // Dispatch the event on the button (should bubble up to navigation)
      Object.defineProperty(clickEvent, 'target', {
        value: playersButton,
        enumerable: true
      });
      
      // Manually trigger the event on navigation (simulating event delegation)
      navigation.dispatchEvent(clickEvent);
      
      // Check if tab switched
      expect(mainUI.getCurrentTab()).toBe('players');
    });
  });

  describe('DOM Structure Integrity', () => {
    test('should not recreate DOM structure unnecessarily', async () => {
      await mainUI.initialize();
      
      const originalNavigation = container.querySelector('.app-navigation');
      const originalMainApp = container.querySelector('.main-application');
      
      // Trigger a re-render by switching seasons
      const seasonUI = (mainUI as any).seasonUI;
      const onSeasonChangeCallback = (seasonUI as any).onSeasonChange;
      
      if (onSeasonChangeCallback) {
        await onSeasonChangeCallback(season2);
      }
      
      // Check if the same DOM elements are still there
      const navigationAfter = container.querySelector('.app-navigation');
      const mainAppAfter = container.querySelector('.main-application');
      
      expect(navigationAfter).toBe(originalNavigation);
      expect(mainAppAfter).toBe(originalMainApp);
    });
  });
});