/**
 * Property-based tests for dependency injection correctness
 * Feature: typescript-activation, Property 3: Dependency Injection Correctness
 * Validates: Requirements 2.2, 2.3
 */

import * as fc from 'fast-check';
import { IndoorGolfSchedulerApp } from './app';

// Import services to test their dependency injection
import { SeasonManagerService } from './services/SeasonManager';
import { PlayerManagerService } from './services/PlayerManager';
import { ScheduleManager } from './services/ScheduleManager';
import { LocalScheduleBackupService } from './services/ScheduleBackupService';
import { ScheduleGenerator } from './services/ScheduleGenerator';
import { PairingHistoryTracker } from './services/PairingHistoryTracker';

// Import repositories
import { LocalSeasonRepository } from './repositories/SeasonRepository';
import { LocalPlayerRepository } from './repositories/PlayerRepository';
import { LocalWeekRepository } from './repositories/WeekRepository';
import { LocalScheduleRepository } from './repositories/ScheduleRepository';
import { LocalPairingHistoryRepository } from './repositories/PairingHistoryRepository';

describe('Dependency Injection Properties', () => {
  // Clean up DOM after each test
  afterEach(() => {
    document.body.innerHTML = '';
    // Clear localStorage to avoid test interference
    localStorage.clear();
  });

  /**
   * Property 3: Dependency Injection Correctness
   * For any service class instantiation, the dependency injection system should 
   * provide the correct repository instances as specified in the constructor
   * **Validates: Requirements 2.2, 2.3**
   */
  test('Property 3: Services receive correct repository instances through dependency injection', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(true), // We'll test the actual DI system, not generated data
        async () => {
          // Create a container element for the app
          const container = document.createElement('div');
          container.id = 'test-app-container';
          document.body.appendChild(container);

          // Create the application instance (this triggers dependency injection)
          const app = new IndoorGolfSchedulerApp({
            containerElementId: 'test-app-container',
            enableErrorReporting: false,
            enableRouting: false,
            debugMode: false,
            autoInitializeDemo: false
          });

          // Get the service instances from the app
          const services = app.getServices();
          const repositories = app.getRepositories();

          // Property: All required services should be instantiated
          expect(services.seasonManager).toBeInstanceOf(SeasonManagerService);
          expect(services.playerManager).toBeInstanceOf(PlayerManagerService);
          expect(services.scheduleManager).toBeInstanceOf(ScheduleManager);
          expect(services.scheduleGenerator).toBeInstanceOf(ScheduleGenerator);
          expect(services.pairingHistoryTracker).toBeInstanceOf(PairingHistoryTracker);

          // Property: All required repositories should be instantiated
          expect(repositories.seasonRepository).toBeInstanceOf(LocalSeasonRepository);
          expect(repositories.playerRepository).toBeInstanceOf(LocalPlayerRepository);
          expect(repositories.weekRepository).toBeInstanceOf(LocalWeekRepository);
          expect(repositories.scheduleRepository).toBeInstanceOf(LocalScheduleRepository);
          expect(repositories.pairingHistoryRepository).toBeInstanceOf(LocalPairingHistoryRepository);

          // Property: Services should have access to their injected dependencies
          // We can verify this by checking that service methods work correctly
          // (which would fail if dependencies weren't properly injected)
          
          // Test SeasonManager has repository access
          expect(typeof services.seasonManager.getAllSeasons).toBe('function');
          expect(typeof services.seasonManager.createSeason).toBe('function');
          
          // Test PlayerManager has repository access
          expect(typeof services.playerManager.getAllPlayers).toBe('function');
          expect(typeof services.playerManager.addPlayer).toBe('function');
          
          // Test ScheduleManager has repository access
          expect(typeof services.scheduleManager.getSchedule).toBe('function');
          expect(typeof services.scheduleManager.createWeeklySchedule).toBe('function');

          // Property: Services should be able to perform operations that require their dependencies
          // This validates that the dependency injection actually works functionally
          const seasons = await services.seasonManager.getAllSeasons();
          // Should return an array (empty initially, but the call should succeed)
          expect(Array.isArray(seasons)).toBe(true);
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
   * Property: Service dependencies are correctly typed and functional
   * For any service with repository dependencies, the service should be able to 
   * call repository methods without type errors
   * **Validates: Requirements 2.2, 2.3**
   */
  test('Property 3b: Service dependencies are correctly typed and functional', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(true),
        async () => {
          // Create repositories directly to test dependency injection patterns
          const seasonRepository = new LocalSeasonRepository();
          const playerRepository = new LocalPlayerRepository();
          const weekRepository = new LocalWeekRepository();
          const scheduleRepository = new LocalScheduleRepository();
          const pairingHistoryRepository = new LocalPairingHistoryRepository();

          // Property: Services can be instantiated with repository dependencies
          const seasonManager = new SeasonManagerService(seasonRepository);
          expect(seasonManager).toBeInstanceOf(SeasonManagerService);

          const playerManager = new PlayerManagerService(
            playerRepository,
            weekRepository,
            scheduleRepository,
            seasonRepository
          );
          expect(playerManager).toBeInstanceOf(PlayerManagerService);

          const pairingHistoryTracker = new PairingHistoryTracker(pairingHistoryRepository);
          expect(pairingHistoryTracker).toBeInstanceOf(PairingHistoryTracker);

          const scheduleGenerator = new ScheduleGenerator(
            {
              prioritizeCompleteGroups: true,
              balanceTimeSlots: true,
              optimizePairings: true
            },
            pairingHistoryTracker
          );
          const backupService = new LocalScheduleBackupService();
          expect(scheduleGenerator).toBeInstanceOf(ScheduleGenerator);

          const scheduleManager = new ScheduleManager(
            scheduleRepository,
            weekRepository,
            playerRepository,
            scheduleGenerator,
            pairingHistoryTracker,
            backupService
          );
          expect(scheduleManager).toBeInstanceOf(ScheduleManager);

          // Property: Services can call methods on their injected dependencies
          const seasons = await seasonManager.getAllSeasons();
          expect(Array.isArray(seasons)).toBe(true);

          // Property: Complex service dependencies work correctly
          // PlayerManager depends on multiple repositories
          try {
            await playerManager.getAllPlayers('test-season-id');
            // Should not throw an error (even if no players exist)
          } catch (error) {
            // Only acceptable error is "Season ID is required" validation
            if (!(error as Error).message.includes('Season ID is required')) {
              throw new Error(`PlayerManager dependency injection failed: ${(error as Error).message}`);
            }
          }

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
   * Property: UI components receive correct service dependencies
   * For any UI component that requires services, the component should have access 
   * to all required service methods and properties
   * **Validates: Requirements 2.3, 3.2**
   */
  test('Property 3c: UI components receive correct service dependencies', () => {
    fc.assert(
      fc.property(
        fc.constant(true),
        () => {
          // Create a container element for the app
          const container = document.createElement('div');
          container.id = 'test-ui-container';
          document.body.appendChild(container);

          // Create the application instance
          const app = new IndoorGolfSchedulerApp({
            containerElementId: 'test-ui-container',
            enableErrorReporting: false,
            enableRouting: false,
            debugMode: false,
            autoInitializeDemo: false
          });

          // Get the UI instance
          const mainUI = app.getUI();
          expect(mainUI).toBeDefined();

          // Property: UI should be properly instantiated
          expect(typeof mainUI.initialize).toBe('function');

          // Property: UI should have access to services through dependency injection
          // We can't directly access private properties, but we can verify the UI was
          // constructed successfully with all required services
          expect(mainUI).toBeTruthy();

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
   * Property: Circular dependency prevention
   * For any service instantiation, there should be no circular dependencies
   * that would prevent proper initialization
   * **Validates: Requirements 2.2, 2.3**
   */
  test('Property 3d: No circular dependencies in service instantiation', () => {
    fc.assert(
      fc.property(
        fc.constant(true),
        () => {
          // Property: Application should initialize without circular dependency errors
          const container = document.createElement('div');
          container.id = 'test-circular-container';
          document.body.appendChild(container);

          let initializationError: Error | null = null;
          let app: IndoorGolfSchedulerApp | null = null;

          try {
            app = new IndoorGolfSchedulerApp({
              containerElementId: 'test-circular-container',
              enableErrorReporting: false,
              enableRouting: false,
              debugMode: false,
              autoInitializeDemo: false
            });
          } catch (error) {
            initializationError = error as Error;
          }

          // Property: No circular dependency errors should occur
          if (initializationError) {
            const isCircularDependency = initializationError.message.includes('circular') ||
                                       initializationError.message.includes('Maximum call stack') ||
                                       initializationError.message.includes('RangeError');
            
            if (isCircularDependency) {
              throw new Error(`Circular dependency detected: ${initializationError.message}`);
            }
          }

          // Property: Application should be successfully initialized
          expect(app).toBeTruthy();
          expect(app!.getState().hasError).toBe(false);

          return true;
        }
      ),
      { 
        numRuns: 10,
        verbose: true 
      }
    );
  });
});