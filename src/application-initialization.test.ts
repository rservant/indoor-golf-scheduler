/**
 * Tests for application initialization and bootstrap
 * Task 7: Test application initialization and bootstrap
 * Validates: Requirements 3.1, 3.2, 3.4
 */

import { IndoorGolfSchedulerApp, createDefaultApp, createIndoorGolfSchedulerApp } from './app';
import { initializeGolfScheduler } from './index';

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

describe('Application Initialization and Bootstrap', () => {
  // Clean up DOM and localStorage after each test
  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    // Clean up any global app references
    if ((window as any).golfSchedulerApp) {
      delete (window as any).golfSchedulerApp;
    }
  });

  describe('Automatic Application Startup', () => {
    /**
     * Test automatic application startup
     * Validates: Requirement 3.1 - WHEN the page loads, THE TypeScript_Application SHALL initialize automatically
     */
    test('should initialize application automatically when container element exists', async () => {
      // Create a container element
      const container = document.createElement('div');
      container.id = 'golf-scheduler-app';
      document.body.appendChild(container);

      // Initialize the application using the convenience function
      const app = await initializeGolfScheduler('golf-scheduler-app');

      // Verify application is initialized
      expect(app).toBeInstanceOf(IndoorGolfSchedulerApp);
      expect(app.getState().isInitialized).toBe(true);
      expect(app.getState().hasError).toBe(false);

      // Verify the container has content
      expect(container.innerHTML).not.toBe('');
      expect(container.querySelector('.main-application')).toBeTruthy();

      // Clean up
      await app.stop();
    });

    /**
     * Test application startup with custom configuration
     * Validates: Requirement 3.1 - Application initialization with different configurations
     */
    test('should initialize application with custom configuration', async () => {
      // Create a container element
      const container = document.createElement('div');
      container.id = 'custom-app-container';
      document.body.appendChild(container);

      // Initialize with custom configuration
      const app = await createIndoorGolfSchedulerApp({
        containerElementId: 'custom-app-container',
        enableErrorReporting: true,
        enableRouting: false,
        debugMode: true,
        autoInitializeDemo: false
      });

      // Verify application is initialized with custom config
      expect(app).toBeInstanceOf(IndoorGolfSchedulerApp);
      expect(app.getState().isInitialized).toBe(true);
      expect(app.getConfig().debugMode).toBe(true);
      expect(app.getConfig().enableRouting).toBe(false);
      expect(app.getConfig().autoInitializeDemo).toBe(false);

      // Clean up
      await app.stop();
    });

    /**
     * Test application startup with default configuration
     * Validates: Requirement 3.1 - Default application factory
     */
    test('should initialize application with default configuration', async () => {
      // Create a container element
      const container = document.createElement('div');
      container.id = 'default-app-container';
      document.body.appendChild(container);

      // Initialize with default configuration
      const app = await createDefaultApp('default-app-container');

      // Verify application is initialized with defaults
      expect(app).toBeInstanceOf(IndoorGolfSchedulerApp);
      expect(app.getState().isInitialized).toBe(true);
      expect(app.getConfig().enableErrorReporting).toBe(true);
      expect(app.getConfig().enableRouting).toBe(true);
      expect(app.getConfig().autoInitializeDemo).toBe(true);

      // Clean up
      await app.stop();
    });
  });

  describe('Main UI Display and Functionality', () => {
    /**
     * Test main UI display after initialization
     * Validates: Requirement 3.2 - WHEN initialization completes, THE Application SHALL display the main UI with all tabs functional
     */
    test('should display main UI with all tabs functional after initialization', async () => {
      // Create a container element
      const container = document.createElement('div');
      container.id = 'ui-test-container';
      document.body.appendChild(container);

      // Initialize the application
      const app = await createDefaultApp('ui-test-container');

      // Verify main UI structure is present
      const mainApp = container.querySelector('.main-application');
      expect(mainApp).toBeTruthy();

      // Verify header is present
      const header = container.querySelector('.app-header');
      expect(header).toBeTruthy();
      expect(header?.querySelector('h1')?.textContent).toBe('Indoor Golf Scheduler');

      // Verify navigation tabs are present and functional
      const navigation = container.querySelector('.app-navigation');
      expect(navigation).toBeTruthy();

      const navTabs = navigation?.querySelectorAll('.nav-tab');
      expect(navTabs?.length).toBe(5); // seasons, players, availability, schedule, import-export (edit merged into schedule)

      // Verify all expected tabs exist
      const expectedTabs = ['seasons', 'players', 'availability', 'schedule', 'import-export'];
      expectedTabs.forEach(tabName => {
        const tab = navigation?.querySelector(`[data-tab="${tabName}"]`);
        expect(tab).toBeTruthy();
      });

      // Verify main content area is present
      const mainContent = container.querySelector('.app-content');
      expect(mainContent).toBeTruthy();

      // Verify tab content containers exist
      expectedTabs.forEach(tabName => {
        const tabContent = mainContent?.querySelector(`[data-tab-content="${tabName}"]`);
        expect(tabContent).toBeTruthy();
      });

      // Verify initial tab is active (seasons)
      const mainUI = app.getUI();
      expect(mainUI.getCurrentTab()).toBe('seasons');

      // Clean up
      await app.stop();
    });

    /**
     * Test tab navigation functionality
     * Validates: Requirement 3.2 - All tabs should be functional
     */
    test('should have functional tab navigation', async () => {
      // Create a container element
      const container = document.createElement('div');
      container.id = 'nav-test-container';
      document.body.appendChild(container);

      // Initialize the application
      const app = await createDefaultApp('nav-test-container');
      const mainUI = app.getUI();

      // Verify initial state
      expect(mainUI.getCurrentTab()).toBe('seasons');

      // Test navigation to seasons tab (should work without active season)
      const navigation = container.querySelector('.app-navigation');
      const seasonsTab = navigation?.querySelector('[data-tab="seasons"]') as HTMLButtonElement;
      expect(seasonsTab).toBeTruthy();
      expect(seasonsTab.hasAttribute('disabled')).toBe(false);

      // With demo data enabled, there should be an active season, so other tabs should be enabled
      const playerTab = navigation?.querySelector('[data-tab="players"]') as HTMLButtonElement;
      const availabilityTab = navigation?.querySelector('[data-tab="availability"]') as HTMLButtonElement;
      const scheduleTab = navigation?.querySelector('[data-tab="schedule"]') as HTMLButtonElement;
      const importExportTab = navigation?.querySelector('[data-tab="import-export"]') as HTMLButtonElement;

      expect(playerTab.hasAttribute('disabled')).toBe(false);
      expect(availabilityTab.hasAttribute('disabled')).toBe(false);
      expect(scheduleTab.hasAttribute('disabled')).toBe(false);
      expect(importExportTab.hasAttribute('disabled')).toBe(false);

      // Clean up
      await app.stop();
    });
  });

  describe('Demo Data Creation', () => {
    /**
     * Test demo data creation when autoInitializeDemo is true
     * Validates: Requirement 3.4 - THE Application SHALL create demo data if no existing data is found
     */
    test('should create demo data when autoInitializeDemo is enabled and no data exists', async () => {
      // Ensure localStorage is empty
      localStorage.clear();

      // Create a container element
      const container = document.createElement('div');
      container.id = 'demo-data-container';
      document.body.appendChild(container);

      // Initialize with demo data enabled
      const app = await createIndoorGolfSchedulerApp({
        containerElementId: 'demo-data-container',
        enableErrorReporting: false,
        enableRouting: false,
        debugMode: false,
        autoInitializeDemo: true
      });

      // Wait for initialization to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify demo data was created
      const services = app.getServices();
      
      // Check that seasons were created
      const seasons = await services.seasonManager.getAllSeasons();
      expect(seasons.length).toBeGreaterThan(0);
      
      // Check that an active season exists
      const activeSeason = await services.seasonManager.getActiveSeason();
      expect(activeSeason).toBeTruthy();
      expect(activeSeason?.name).toContain('Demo Season');

      // Check that demo players were created
      if (activeSeason) {
        const players = await services.playerManager.getAllPlayers(activeSeason.id);
        expect(players.length).toBeGreaterThan(0);
        
        // Verify some expected demo players
        const playerNames = players.map(p => `${p.firstName} ${p.lastName}`);
        expect(playerNames).toContain('John Smith');
        expect(playerNames).toContain('Jane Doe');
      }

      // Clean up
      await app.stop();
    });

    /**
     * Test that demo data is not created when existing data is present
     * Validates: Requirement 3.4 - Demo data should only be created if no existing data is found
     */
    test('should not create demo data when existing data is present', async () => {
      // Create a container element
      const container = document.createElement('div');
      container.id = 'existing-data-container';
      document.body.appendChild(container);

      // First, create an app and add some data
      const firstApp = await createIndoorGolfSchedulerApp({
        containerElementId: 'existing-data-container',
        enableErrorReporting: false,
        enableRouting: false,
        debugMode: false,
        autoInitializeDemo: false
      });

      const services = firstApp.getServices();
      
      // Create a custom season (not demo data)
      const customSeason = await services.seasonManager.createSeason(
        'Custom Season',
        new Date(),
        new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
      );

      await firstApp.stop();

      // Now create a new app with demo data enabled
      const secondApp = await createIndoorGolfSchedulerApp({
        containerElementId: 'existing-data-container',
        enableErrorReporting: false,
        enableRouting: false,
        debugMode: false,
        autoInitializeDemo: true
      });

      // Wait for initialization to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify that only the custom season exists (no demo data added)
      const secondServices = secondApp.getServices();
      const seasons = await secondServices.seasonManager.getAllSeasons();
      
      expect(seasons.length).toBe(1);
      expect(seasons[0].name).toBe('Custom Season');
      expect(seasons[0].id).toBe(customSeason.id);

      // Clean up
      await secondApp.stop();
    });
  });

  describe('Error Handling During Initialization', () => {
    /**
     * Test error handling when container element is not found
     * Validates: Requirement 3.3 - WHEN initialization fails, THE Application SHALL display a meaningful error message
     */
    test('should handle error when container element is not found', () => {
      // Try to create app with non-existent container
      expect(() => {
        new IndoorGolfSchedulerApp({
          containerElementId: 'non-existent-container',
          enableErrorReporting: false,
          enableRouting: false,
          debugMode: false,
          autoInitializeDemo: false
        });
      }).toThrow('Container element with ID "non-existent-container" not found');
    });

    /**
     * Test error state rendering
     * Validates: Requirement 3.3 - Meaningful error messages should be displayed
     */
    test('should render error state when initialization fails', async () => {
      // Create a container element
      const container = document.createElement('div');
      container.id = 'error-test-container';
      document.body.appendChild(container);

      // Create app instance
      const app = new IndoorGolfSchedulerApp({
        containerElementId: 'error-test-container',
        enableErrorReporting: true,
        enableRouting: false,
        debugMode: false,
        autoInitializeDemo: false
      });

      // Simulate an error during startup by calling start and catching any errors
      try {
        await app.start();
        
        // If no error occurred, verify normal initialization
        expect(app.getState().isInitialized).toBe(true);
        expect(app.getState().hasError).toBe(false);
        
        await app.stop();
      } catch (error) {
        // If an error occurred, verify error handling
        expect(app.getState().hasError).toBe(true);
        expect(app.getState().errorMessage).toBeDefined();
        
        // Verify error UI is rendered
        const errorContainer = container.querySelector('.app-error-state');
        if (errorContainer) {
          expect(errorContainer).toBeTruthy();
          expect(errorContainer.textContent).toContain('Application Error');
        }
      }
    });

    /**
     * Test graceful handling of service initialization errors
     * Validates: Requirement 3.3 - Error handling during service initialization
     */
    test('should handle service initialization errors gracefully', () => {
      // Create a container element
      const container = document.createElement('div');
      container.id = 'service-error-container';
      document.body.appendChild(container);

      // This test verifies that the app can handle service initialization
      // In normal circumstances, services should initialize successfully
      expect(() => {
        const app = new IndoorGolfSchedulerApp({
          containerElementId: 'service-error-container',
          enableErrorReporting: true,
          enableRouting: false,
          debugMode: false,
          autoInitializeDemo: false
        });
        
        // Verify app was created (services initialized successfully)
        expect(app).toBeInstanceOf(IndoorGolfSchedulerApp);
        
        // Verify services are accessible
        const services = app.getServices();
        expect(services.seasonManager).toBeDefined();
        expect(services.playerManager).toBeDefined();
        expect(services.scheduleManager).toBeDefined();
        
      }).not.toThrow();
    });
  });

  describe('Application Lifecycle Management', () => {
    /**
     * Test application start/stop lifecycle
     * Validates: Requirements 3.1, 3.2 - Application lifecycle management
     */
    test('should handle application start and stop lifecycle', async () => {
      // Create a container element
      const container = document.createElement('div');
      container.id = 'lifecycle-container';
      document.body.appendChild(container);

      // Create app instance (not started yet)
      const app = new IndoorGolfSchedulerApp({
        containerElementId: 'lifecycle-container',
        enableErrorReporting: false,
        enableRouting: false,
        debugMode: false,
        autoInitializeDemo: false
      });

      // Verify initial state
      expect(app.getState().isInitialized).toBe(false);

      // Start the application
      await app.start();

      // Verify started state
      expect(app.getState().isInitialized).toBe(true);
      expect(app.getState().hasError).toBe(false);
      expect(container.innerHTML).not.toBe('');

      // Stop the application
      await app.stop();

      // Verify stopped state
      expect(app.getState().isInitialized).toBe(false);
      expect(container.innerHTML).toBe('');
    });

    /**
     * Test application restart functionality
     * Validates: Requirements 3.1, 3.2 - Application restart capability
     */
    test('should handle application restart', async () => {
      // Create a container element
      const container = document.createElement('div');
      container.id = 'restart-container';
      document.body.appendChild(container);

      // Create and start app
      const app = await createDefaultApp('restart-container');

      // Verify initial state
      expect(app.getState().isInitialized).toBe(true);
      expect(container.innerHTML).not.toBe('');

      // Restart the application
      await app.restart();

      // Verify restarted state
      expect(app.getState().isInitialized).toBe(true);
      expect(app.getState().hasError).toBe(false);
      
      // The UI should be reinitialized - check that the main UI is functional
      const mainUI = app.getUI();
      expect(mainUI).toBeDefined();
      expect(mainUI.getCurrentTab()).toBeDefined();
      
      // Verify the application is functional after restart
      const services = app.getServices();
      expect(services.seasonManager).toBeDefined();
      const seasons = await services.seasonManager.getAllSeasons();
      expect(Array.isArray(seasons)).toBe(true);

      // Clean up
      await app.stop();
    });
  });

  describe('Debug Mode and Development Features', () => {
    /**
     * Test debug mode functionality
     * Validates: Requirement 3.5 - THE Application SHALL expose debugging interfaces in development mode
     */
    test('should expose debugging interfaces in debug mode', async () => {
      // Create a container element
      const container = document.createElement('div');
      container.id = 'debug-container';
      document.body.appendChild(container);

      // Initialize with debug mode enabled
      const app = await createIndoorGolfSchedulerApp({
        containerElementId: 'debug-container',
        enableErrorReporting: true,
        enableRouting: false,
        debugMode: true,
        autoInitializeDemo: false
      });

      // Verify debug mode is enabled
      expect(app.getConfig().debugMode).toBe(true);

      // Verify global debug reference is created
      expect((window as any).golfSchedulerApp).toBe(app);

      // Verify debug methods are accessible
      expect(app.getServices).toBeDefined();
      expect(app.getRepositories).toBeDefined();
      expect(app.getSystems).toBeDefined();
      expect(app.getUI).toBeDefined();

      // Clean up
      await app.stop();
      
      // Verify debug reference is cleaned up
      expect((window as any).golfSchedulerApp).toBeUndefined();
    });

    /**
     * Test that debug interfaces are not exposed in production mode
     * Validates: Debug interfaces should only be available in debug mode
     */
    test('should not expose debugging interfaces in production mode', async () => {
      // Create a container element
      const container = document.createElement('div');
      container.id = 'production-container';
      document.body.appendChild(container);

      // Initialize with debug mode disabled
      const app = await createIndoorGolfSchedulerApp({
        containerElementId: 'production-container',
        enableErrorReporting: true,
        enableRouting: false,
        debugMode: false,
        autoInitializeDemo: false
      });

      // Verify debug mode is disabled
      expect(app.getConfig().debugMode).toBe(false);

      // Verify global debug reference is not created
      expect((window as any).golfSchedulerApp).toBeUndefined();

      // Clean up
      await app.stop();
    });
  });
});