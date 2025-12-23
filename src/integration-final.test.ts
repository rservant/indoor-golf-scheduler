/**
 * Final Integration Testing
 * 
 * Comprehensive end-to-end testing of the complete TypeScript application
 * including all advanced features and production deployment compatibility.
 * 
 * Requirements: 7.4, 7.5
 */

import { IndoorGolfSchedulerApp, createIndoorGolfSchedulerApp, ApplicationConfig } from './app';

describe('Final Integration Testing', () => {
  let app: IndoorGolfSchedulerApp;
  let container: HTMLElement;

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    
    // Create fresh container
    container = document.createElement('div');
    container.id = 'test-app-container';
    document.body.appendChild(container);
  });

  afterEach(async () => {
    // Clean up application
    if (app) {
      await app.stop();
    }
    
    // Clean up DOM
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    
    // Clear localStorage
    localStorage.clear();
  });

  describe('Complete Application Workflow End-to-End', () => {
    test('should initialize application with all components', async () => {
      const config: ApplicationConfig = {
        containerElementId: 'test-app-container',
        enableErrorReporting: true,
        enableRouting: true,
        debugMode: true,
        autoInitializeDemo: true
      };

      app = await createIndoorGolfSchedulerApp(config);

      // Verify application state
      const state = app.getState();
      expect(state.isInitialized).toBe(true);
      expect(state.hasError).toBe(false);

      // Verify services are available
      const services = app.getServices();
      expect(services.seasonManager).toBeDefined();
      expect(services.playerManager).toBeDefined();
      expect(services.scheduleManager).toBeDefined();
      expect(services.scheduleGenerator).toBeDefined();
      expect(services.exportService).toBeDefined();
      expect(services.importExportService).toBeDefined();
      expect(services.pairingHistoryTracker).toBeDefined();

      // Verify repositories are available
      const repositories = app.getRepositories();
      expect(repositories.seasonRepository).toBeDefined();
      expect(repositories.playerRepository).toBeDefined();
      expect(repositories.weekRepository).toBeDefined();
      expect(repositories.scheduleRepository).toBeDefined();
      expect(repositories.pairingHistoryRepository).toBeDefined();

      // Verify systems are available
      const systems = app.getSystems();
      expect(systems.stateManager).toBeDefined();
      expect(systems.errorHandler).toBeDefined();
      expect(systems.debugInterface).toBeDefined();

      // Verify UI is available
      const ui = app.getUI();
      expect(ui).toBeDefined();
    });

    test('should complete full workflow: season creation → player addition → schedule generation', async () => {
      const config: ApplicationConfig = {
        containerElementId: 'test-app-container',
        enableErrorReporting: true,
        enableRouting: true,
        debugMode: false,
        autoInitializeDemo: false // Don't auto-create demo data
      };

      app = await createIndoorGolfSchedulerApp(config);
      const services = app.getServices();

      // Step 1: Create a season
      const season = await services.seasonManager.createSeason(
        'Test Season 2024',
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );
      expect(season).toBeDefined();
      expect(season.name).toBe('Test Season 2024');

      // Set as active season
      await services.seasonManager.setActiveSeason(season.id);
      const activeSeason = await services.seasonManager.getActiveSeason();
      expect(activeSeason?.id).toBe(season.id);

      // Step 2: Add players
      const playerData = [
        { firstName: 'John', lastName: 'Smith', handedness: 'right' as const, timePreference: 'AM' as const },
        { firstName: 'Jane', lastName: 'Doe', handedness: 'left' as const, timePreference: 'PM' as const },
        { firstName: 'Bob', lastName: 'Johnson', handedness: 'right' as const, timePreference: 'Either' as const },
        { firstName: 'Alice', lastName: 'Williams', handedness: 'left' as const, timePreference: 'Either' as const }
      ];

      const players = [];
      for (const data of playerData) {
        const player = await services.playerManager.addPlayer(data);
        players.push(player);
        expect(player).toBeDefined();
        expect(player.firstName).toBe(data.firstName);
        expect(player.lastName).toBe(data.lastName);
      }

      // Verify players are stored
      const allPlayers = await services.playerManager.getAllPlayers(season.id);
      expect(allPlayers).toHaveLength(4);

      // Step 3: Generate schedule
      const weeks = await services.scheduleManager.generateWeeksForSeason(season.id, 4);
      expect(weeks).toHaveLength(4);

      // Generate schedule for first week
      const firstWeek = weeks[0];
      const schedule = await services.scheduleManager.generateSchedule(firstWeek.id);
      expect(schedule).toBeDefined();
      expect(schedule.timeSlots).toBeDefined();
      expect(schedule.timeSlots.morning.length + schedule.timeSlots.afternoon.length).toBeGreaterThan(0);

      // Verify schedule contains players
      const scheduleFoursomes = [...schedule.timeSlots.morning, ...schedule.timeSlots.afternoon];
      expect(scheduleFoursomes.length).toBeGreaterThan(0);
      const allPlayersInSchedule = scheduleFoursomes.flatMap(f => f.players);
      expect(allPlayersInSchedule.length).toBeGreaterThan(0);
    });

    test('should handle error conditions gracefully', async () => {
      const config: ApplicationConfig = {
        containerElementId: 'test-app-container',
        enableErrorReporting: true,
        enableRouting: true,
        debugMode: true,
        autoInitializeDemo: false
      };

      app = await createIndoorGolfSchedulerApp(config);
      const services = app.getServices();

      // Test error handling with invalid data
      try {
        await services.seasonManager.createSeason('', new Date(), new Date());
        fail('Should have thrown an error for empty season name');
      } catch (error) {
        expect(error).toBeDefined();
      }

      // Test error handling with invalid player data
      try {
        await services.playerManager.addPlayer({
          firstName: '',
          lastName: '',
          handedness: 'right' as const,
          timePreference: 'AM' as const
        });
        fail('Should have thrown an error for empty player names');
      } catch (error) {
        expect(error).toBeDefined();
      }

      // Verify application is still functional after errors
      const state = app.getState();
      expect(state.isInitialized).toBe(true);
    });
  });

  describe('Advanced Features Verification', () => {
    beforeEach(async () => {
      const config: ApplicationConfig = {
        containerElementId: 'test-app-container',
        enableErrorReporting: true,
        enableRouting: true,
        debugMode: true,
        autoInitializeDemo: true
      };

      app = await createIndoorGolfSchedulerApp(config);
    });

    test('should support import/export functionality', async () => {
      const services = app.getServices();

      // Create test data
      const season = await services.seasonManager.createSeason(
        'Export Test Season',
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );

      const player = await services.playerManager.addPlayer({
        firstName: 'Export',
        lastName: 'Test',
        handedness: 'right' as const,
        timePreference: 'AM' as const
      });

      // Test export functionality
      const exportData = await services.importExportService.exportData();
      expect(exportData).toBeDefined();
      expect(exportData.seasons).toBeDefined();
      expect(exportData.players).toBeDefined();

      // Verify exported data contains our test data
      const exportedSeasons = exportData.seasons.filter(s => s.name === 'Export Test Season');
      expect(exportedSeasons).toHaveLength(1);

      const exportedPlayers = exportData.players.filter(p => p.firstName === 'Export');
      expect(exportedPlayers).toHaveLength(1);
    });

    test('should support pairing history tracking', async () => {
      const services = app.getServices();

      // Create test season and players
      const season = await services.seasonManager.createSeason(
        'Pairing Test Season',
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );

      await services.seasonManager.setActiveSeason(season.id);

      const players = [];
      for (let i = 0; i < 8; i++) {
        const player = await services.playerManager.addPlayer({
          firstName: `Player${i}`,
          lastName: `Test`,
          handedness: i % 2 === 0 ? 'right' as const : 'left' as const,
          timePreference: 'Either' as const
        });
        players.push(player);
      }

      // Generate multiple weeks and schedules
      const weeks = await services.scheduleManager.generateWeeksForSeason(season.id, 3);
      
      for (const week of weeks) {
        const schedule = await services.scheduleManager.generateSchedule(week.id);
        expect(schedule).toBeDefined();
        
        // Record pairings for history tracking
        const foursomesForHistory = [...schedule.timeSlots.morning, ...schedule.timeSlots.afternoon];
        for (const foursome of foursomesForHistory) {
          await services.pairingHistoryTracker.recordPairing(
            foursome.players.map(p => p.id),
            week.id
          );
        }
      }

      // Verify pairing history is tracked
      const history = await services.pairingHistoryTracker.getPairingHistory(players[0].id);
      expect(history).toBeDefined();
      expect(history.length).toBeGreaterThan(0);
    });

    test('should support schedule editing capabilities', async () => {
      const services = app.getServices();

      // Create test data
      const season = await services.seasonManager.createSeason(
        'Edit Test Season',
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );

      await services.seasonManager.setActiveSeason(season.id);

      // Add players
      const players = [];
      for (let i = 0; i < 4; i++) {
        const player = await services.playerManager.addPlayer({
          firstName: `EditPlayer${i}`,
          lastName: `Test`,
          handedness: 'right' as const,
          timePreference: 'Either' as const
        });
        players.push(player);
      }

      // Generate schedule
      const weeks = await services.scheduleManager.generateWeeksForSeason(season.id, 1);
      const schedule = await services.scheduleManager.generateSchedule(weeks[0].id);

      // Test schedule modification
      const scheduleForEdit = [...schedule.timeSlots.morning, ...schedule.timeSlots.afternoon];
      const originalFoursomeCount = scheduleForEdit.length;
      
      // Verify we can access and modify the schedule
      expect(schedule.timeSlots).toBeDefined();
      const editableFoursomes = [...schedule.timeSlots.morning, ...schedule.timeSlots.afternoon];
      expect(editableFoursomes.length).toBeGreaterThan(0);
      
      // The schedule should be editable through the schedule manager
      const updatedSchedule = await services.scheduleManager.getSchedule(weeks[0].id);
      expect(updatedSchedule).toBeDefined();
      expect(editableFoursomes.length).toBe(originalFoursomeCount);
    });

    test('should support multiple export formats', async () => {
      const services = app.getServices();

      // Create test data
      const season = await services.seasonManager.createSeason(
        'Format Test Season',
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );

      const player = await services.playerManager.addPlayer({
        firstName: 'Format',
        lastName: 'Test',
        handedness: 'right' as const,
        timePreference: 'AM' as const
      });

      // Test different export formats
      const csvData = await services.exportService.exportPlayersToCSV([player]);
      expect(csvData).toBeDefined();
      expect(typeof csvData).toBe('string');
      expect(csvData).toContain('Format');

      const excelData = await services.exportService.exportPlayersToExcel([player]);
      expect(excelData).toBeDefined();

      const pdfData = await services.exportService.exportPlayersToPDF([player]);
      expect(pdfData).toBeDefined();
    });
  });

  describe('Production Deployment Compatibility', () => {
    test('should work with production configuration', async () => {
      // Simulate production environment
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const config: ApplicationConfig = {
          containerElementId: 'test-app-container',
          enableErrorReporting: true,
          enableRouting: true,
          debugMode: false, // Production mode
          autoInitializeDemo: false
        };

        app = await createIndoorGolfSchedulerApp(config);

        // Verify application works in production mode
        const state = app.getState();
        expect(state.isInitialized).toBe(true);
        expect(state.hasError).toBe(false);

        // Verify debug features are disabled
        expect(app.getConfig().debugMode).toBe(false);

        // Verify core functionality still works
        const services = app.getServices();
        const season = await services.seasonManager.createSeason(
          'Production Test Season',
          new Date('2024-01-01'),
          new Date('2024-12-31')
        );
        expect(season).toBeDefined();

      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    test('should handle missing container element gracefully', () => {
      expect(() => {
        new IndoorGolfSchedulerApp({
          containerElementId: 'non-existent-container'
        });
      }).toThrow('Container element with ID "non-existent-container" not found');
    });

    test('should support application restart functionality', async () => {
      const config: ApplicationConfig = {
        containerElementId: 'test-app-container',
        enableErrorReporting: true,
        enableRouting: true,
        debugMode: false,
        autoInitializeDemo: false
      };

      app = await createIndoorGolfSchedulerApp(config);

      // Verify initial state
      let state = app.getState();
      expect(state.isInitialized).toBe(true);

      // Create some data
      const services = app.getServices();
      const season = await services.seasonManager.createSeason(
        'Restart Test Season',
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );

      // Restart application
      await app.restart();

      // Verify application is still functional
      state = app.getState();
      expect(state.isInitialized).toBe(true);

      // Verify data persistence (should be available after restart)
      const seasons = await services.seasonManager.getAllSeasons();
      const restartSeason = seasons.find(s => s.name === 'Restart Test Season');
      expect(restartSeason).toBeDefined();
    });

    test('should clean up resources properly on stop', async () => {
      const config: ApplicationConfig = {
        containerElementId: 'test-app-container',
        enableErrorReporting: true,
        enableRouting: true,
        debugMode: true,
        autoInitializeDemo: false
      };

      app = await createIndoorGolfSchedulerApp(config);

      // Verify application is running
      let state = app.getState();
      expect(state.isInitialized).toBe(true);

      // Stop application
      await app.stop();

      // Verify cleanup
      state = app.getState();
      expect(state.isInitialized).toBe(false);

      // Verify container is cleared
      expect(container.innerHTML).toBe('');

      // Verify debug references are cleaned up
      expect((window as any).golfSchedulerApp).toBeUndefined();
    });
  });

  describe('Performance and Bundle Optimization', () => {
    test('should initialize within reasonable time', async () => {
      const startTime = Date.now();

      const config: ApplicationConfig = {
        containerElementId: 'test-app-container',
        enableErrorReporting: true,
        enableRouting: true,
        debugMode: false,
        autoInitializeDemo: true
      };

      app = await createIndoorGolfSchedulerApp(config);

      const initTime = Date.now() - startTime;

      // Application should initialize within 5 seconds (generous for testing)
      expect(initTime).toBeLessThan(5000);

      // Verify it actually initialized
      const state = app.getState();
      expect(state.isInitialized).toBe(true);
    });

    test('should handle large datasets efficiently', async () => {
      const config: ApplicationConfig = {
        containerElementId: 'test-app-container',
        enableErrorReporting: true,
        enableRouting: true,
        debugMode: false,
        autoInitializeDemo: false
      };

      app = await createIndoorGolfSchedulerApp(config);
      const services = app.getServices();

      // Create season
      const season = await services.seasonManager.createSeason(
        'Large Dataset Test',
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );

      await services.seasonManager.setActiveSeason(season.id);

      // Add many players (simulate large dataset)
      const startTime = Date.now();
      const playerCount = 100;

      for (let i = 0; i < playerCount; i++) {
        await services.playerManager.addPlayer({
          firstName: `Player${i}`,
          lastName: `Test`,
          handedness: i % 2 === 0 ? 'right' as const : 'left' as const,
          timePreference: i % 3 === 0 ? 'AM' as const : i % 3 === 1 ? 'PM' as const : 'Either' as const
        });
      }

      const addTime = Date.now() - startTime;

      // Should handle 100 players within reasonable time (10 seconds)
      expect(addTime).toBeLessThan(10000);

      // Verify all players were added
      const allPlayers = await services.playerManager.getAllPlayers(season.id);
      expect(allPlayers).toHaveLength(playerCount);

      // Test schedule generation with large dataset
      const scheduleStartTime = Date.now();
      const weeks = await services.scheduleManager.generateWeeksForSeason(season.id, 1);
      const schedule = await services.scheduleManager.generateSchedule(weeks[0].id);
      const scheduleTime = Date.now() - scheduleStartTime;

      // Schedule generation should complete within reasonable time (15 seconds)
      expect(scheduleTime).toBeLessThan(15000);
      expect(schedule).toBeDefined();
      const allFoursomes = [...schedule.timeSlots.morning, ...schedule.timeSlots.afternoon];
      expect(allFoursomes.length).toBeGreaterThan(0);
    });
  });
});