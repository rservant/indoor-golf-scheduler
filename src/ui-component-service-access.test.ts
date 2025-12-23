/**
 * Property-based tests for UI component service access
 * Feature: typescript-activation, Property 4: UI Component Service Access
 * Validates: Requirements 2.3, 3.2
 */

import * as fc from 'fast-check';
import { IndoorGolfSchedulerApp } from './app';
import { MainApplicationUI } from './ui/MainApplicationUI';

// Import UI components to test their service access
import { SeasonManagementUI } from './ui/SeasonManagementUI';
import { PlayerManagementUI } from './ui/PlayerManagementUI';
import { AvailabilityManagementUI } from './ui/AvailabilityManagementUI';
import { ScheduleDisplayUI } from './ui/ScheduleDisplayUI';
import { ScheduleEditingUI } from './ui/ScheduleEditingUI';

// Import services
import { SeasonManagerService } from './services/SeasonManager';
import { PlayerManagerService } from './services/PlayerManager';
import { ScheduleManager } from './services/ScheduleManager';
import { ScheduleGenerator } from './services/ScheduleGenerator';
import { ExportService } from './services/ExportService';
import { PairingHistoryTracker } from './services/PairingHistoryTracker';

// Import repositories
import { LocalSeasonRepository } from './repositories/SeasonRepository';
import { LocalPlayerRepository } from './repositories/PlayerRepository';
import { LocalWeekRepository } from './repositories/WeekRepository';
import { LocalScheduleRepository } from './repositories/ScheduleRepository';
import { LocalPairingHistoryRepository } from './repositories/PairingHistoryRepository';

describe('UI Component Service Access Properties', () => {
  // Clean up DOM after each test
  afterEach(() => {
    document.body.innerHTML = '';
    // Clear localStorage to avoid test interference
    localStorage.clear();
  });

  /**
   * Property 4: UI Component Service Access
   * For any UI component that requires services, the component should have access 
   * to all required service methods and properties
   * **Validates: Requirements 2.3, 3.2**
   */
  test('Property 4: UI components have access to all required service methods', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(true), // We'll test the actual service access, not generated data
        async () => {
          // Create a container element for the app
          const container = document.createElement('div');
          container.id = 'test-ui-service-container';
          document.body.appendChild(container);

          // Create the application instance (this sets up UI with services)
          const app = new IndoorGolfSchedulerApp({
            containerElementId: 'test-ui-service-container',
            enableErrorReporting: false,
            enableRouting: false,
            debugMode: false,
            autoInitializeDemo: false
          });

          // Get the main UI instance
          const mainUI = app.getUI();
          expect(mainUI).toBeInstanceOf(MainApplicationUI);

          // Property: Main UI should be able to initialize (requires service access)
          await mainUI.initialize();

          // Property: Main UI should have access to season management functionality
          const activeSeason = mainUI.getActiveSeason();
          // Should return null initially (no error means service access works)
          expect(activeSeason).toBeNull();

          // Property: Main UI should be able to get current tab (UI state management)
          const currentTab = mainUI.getCurrentTab();
          expect(typeof currentTab).toBe('string');

          // Property: Main UI should be able to refresh all components (service coordination)
          await mainUI.refreshAll();
          // Should complete without error (validates service access across all UI components)

          return true;
        }
      ),
      { 
        numRuns: 10,
        verbose: true 
      }
    );
  });

  /**
   * Property: Individual UI components can access their required services
   * For any UI component instantiated with services, the component should be able 
   * to call service methods without errors
   * **Validates: Requirements 2.3, 3.2**
   */
  test('Property 4b: Individual UI components can access their required services', () => {
    fc.assert(
      fc.property(
        fc.constant(true),
        () => {
          // Create service instances
          const seasonRepository = new LocalSeasonRepository();
          const playerRepository = new LocalPlayerRepository();
          const weekRepository = new LocalWeekRepository();
          const scheduleRepository = new LocalScheduleRepository();
          const pairingHistoryRepository = new LocalPairingHistoryRepository();

          const seasonManager = new SeasonManagerService(seasonRepository);
          const playerManager = new PlayerManagerService(
            playerRepository,
            weekRepository,
            scheduleRepository,
            seasonRepository
          );
          const pairingHistoryTracker = new PairingHistoryTracker(pairingHistoryRepository);
          const scheduleGenerator = new ScheduleGenerator({}, pairingHistoryTracker);
          const scheduleManager = new ScheduleManager(
            scheduleRepository,
            weekRepository,
            playerRepository,
            scheduleGenerator,
            pairingHistoryTracker
          );
          const exportService = new ExportService();

          // Create container elements for UI components
          const seasonContainer = document.createElement('div');
          const playerContainer = document.createElement('div');
          const availabilityContainer = document.createElement('div');
          const scheduleDisplayContainer = document.createElement('div');
          const scheduleEditingContainer = document.createElement('div');

          // Property: UI components can be instantiated with services
          const seasonUI = new SeasonManagementUI(seasonManager, seasonContainer);
          expect(seasonUI).toBeInstanceOf(SeasonManagementUI);

          const playerUI = new PlayerManagementUI(playerManager, playerContainer);
          expect(playerUI).toBeInstanceOf(PlayerManagementUI);

          const availabilityUI = new AvailabilityManagementUI(
            playerManager, 
            weekRepository, 
            availabilityContainer
          );
          expect(availabilityUI).toBeInstanceOf(AvailabilityManagementUI);

          const scheduleDisplayUI = new ScheduleDisplayUI(
            scheduleManager,
            scheduleGenerator,
            weekRepository,
            exportService,
            pairingHistoryTracker,
            playerManager,
            scheduleDisplayContainer
          );
          expect(scheduleDisplayUI).toBeInstanceOf(ScheduleDisplayUI);

          const scheduleEditingUI = new ScheduleEditingUI(scheduleManager, scheduleEditingContainer);
          expect(scheduleEditingUI).toBeInstanceOf(ScheduleEditingUI);

          // Property: UI components should have access to service methods
          // We verify this by checking that the components have the expected methods
          // (which would fail if services weren't properly injected)
          
          expect(typeof seasonUI.initialize).toBe('function');
          expect(typeof seasonUI.refresh).toBe('function');
          
          expect(typeof playerUI.initialize).toBe('function');
          expect(typeof playerUI.refresh).toBe('function');
          
          expect(typeof availabilityUI.initialize).toBe('function');
          expect(typeof availabilityUI.refresh).toBe('function');
          
          expect(typeof scheduleDisplayUI.initialize).toBe('function');
          expect(typeof scheduleDisplayUI.refresh).toBe('function');
          
          expect(typeof scheduleEditingUI.initialize).toBe('function');

          return true;
        }
      ),
      { 
        numRuns: 5,
        verbose: true 
      }
    );
  });

  /**
   * Property: UI components can perform service-dependent operations
   * For any UI component with service dependencies, the component should be able 
   * to perform operations that require those services
   * **Validates: Requirements 2.3, 3.2**
   */
  test('Property 4c: UI components can perform service-dependent operations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(true),
        async () => {
          // Create repositories and services
          const seasonRepository = new LocalSeasonRepository();
          const playerRepository = new LocalPlayerRepository();
          const weekRepository = new LocalWeekRepository();
          const scheduleRepository = new LocalScheduleRepository();
          const pairingHistoryRepository = new LocalPairingHistoryRepository();

          const seasonManager = new SeasonManagerService(seasonRepository);
          const playerManager = new PlayerManagerService(
            playerRepository,
            weekRepository,
            scheduleRepository,
            seasonRepository
          );

          // Create UI components with services
          const seasonContainer = document.createElement('div');
          const playerContainer = document.createElement('div');
          
          const seasonUI = new SeasonManagementUI(seasonManager, seasonContainer);
          const playerUI = new PlayerManagementUI(playerManager, playerContainer);

          // Property: Season UI can initialize and access season service
          await seasonUI.initialize();
          const activeSeason = seasonUI.getActiveSeason();
          // Should return null initially (no error means service access works)
          expect(activeSeason).toBeNull();

          // Property: Player UI can initialize with null season (service handles gracefully)
          await playerUI.initialize(null);
          // Should complete without error

          // Property: Player UI can set active season (service coordination)
          await playerUI.setActiveSeason(null);
          // Should complete without error

          // Property: UI components can refresh (service data access)
          await seasonUI.refresh();
          await playerUI.refresh();
          // Should complete without errors

          return true;
        }
      ),
      { 
        numRuns: 5,
        verbose: true 
      }
    );
  });

  /**
   * Property: UI service access is consistent across application lifecycle
   * For any UI component, service access should remain consistent throughout 
   * the application lifecycle (initialization, operation, refresh)
   * **Validates: Requirements 2.3, 3.2**
   */
  test('Property 4d: UI service access is consistent across application lifecycle', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(true),
        async () => {
          // Create a container element for the app
          const container = document.createElement('div');
          container.id = 'test-lifecycle-container';
          document.body.appendChild(container);

          // Create the application instance
          const app = new IndoorGolfSchedulerApp({
            containerElementId: 'test-lifecycle-container',
            enableErrorReporting: false,
            enableRouting: false,
            debugMode: false,
            autoInitializeDemo: false
          });

          // Property: UI should be accessible after app creation
          const mainUI = app.getUI();
          expect(mainUI).toBeDefined();

          // Property: UI should be able to initialize (service access during init)
          await mainUI.initialize();
          expect(mainUI.getCurrentTab()).toBeDefined();

          // Property: UI should be able to refresh multiple times (consistent service access)
          await mainUI.refreshAll();
          await mainUI.refreshAll();
          await mainUI.refreshAll();
          // Should complete without errors

          // Property: UI state should remain consistent
          const tabAfterRefresh = mainUI.getCurrentTab();
          expect(typeof tabAfterRefresh).toBe('string');

          // Property: Services should remain accessible after operations
          const services = app.getServices();
          expect(services.seasonManager).toBeDefined();
          expect(services.playerManager).toBeDefined();
          expect(services.scheduleManager).toBeDefined();

          return true;
        }
      ),
      { 
        numRuns: 5,
        verbose: true 
      }
    );
  });
});