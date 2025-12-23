/**
 * Application Bootstrap and Integration
 * 
 * This file wires together all services, repositories, UI components,
 * state management, error handling, and routing to create the complete
 * Indoor Golf Scheduler application.
 */

import { MainApplicationUI } from './ui/MainApplicationUI';

// Import all repositories
import { LocalSeasonRepository } from './repositories/SeasonRepository';
import { LocalPlayerRepository } from './repositories/PlayerRepository';
import { LocalWeekRepository } from './repositories/WeekRepository';
import { LocalScheduleRepository } from './repositories/ScheduleRepository';
import { LocalPairingHistoryRepository } from './repositories/PairingHistoryRepository';

// Import all services
import { SeasonManagerService } from './services/SeasonManager';
import { PlayerManagerService } from './services/PlayerManager';
import { ScheduleManager } from './services/ScheduleManager';
import { ScheduleGenerator } from './services/ScheduleGenerator';
import { ExportService } from './services/ExportService';
import { ImportExportService } from './services/ImportExportService';
import { PairingHistoryTracker } from './services/PairingHistoryTracker';

// Import state management and utilities
import { applicationState, ApplicationStateManager } from './state/ApplicationState';
import { errorHandler, ErrorHandler } from './utils/ErrorHandler';
import { ErrorBoundary, GlobalErrorBoundary } from './utils/ErrorBoundary';
import { debugInterface, DebugInterface } from './utils/DebugInterface';
import { enhancedErrorHandling, initializeEnhancedErrorHandling } from './utils/EnhancedErrorHandling';
import { applicationRouter, ApplicationRouter } from './routing/ApplicationRouter';

// Import UI components
import { NotificationUI } from './ui/NotificationUI';
import { DebugUI } from './ui/DebugUI';

export interface ApplicationConfig {
  containerElementId: string;
  enableErrorReporting?: boolean;
  enableRouting?: boolean;
  debugMode?: boolean;
  autoInitializeDemo?: boolean;
}

export interface ApplicationState {
  isInitialized: boolean;
  hasError: boolean;
  errorMessage?: string;
}

/**
 * Main Application class that orchestrates all components
 */
export class IndoorGolfSchedulerApp {
  private config: ApplicationConfig;
  private state: ApplicationState;
  private container: HTMLElement;

  // Repository instances
  private seasonRepository!: LocalSeasonRepository;
  private playerRepository!: LocalPlayerRepository;
  private weekRepository!: LocalWeekRepository;
  private scheduleRepository!: LocalScheduleRepository;
  private pairingHistoryRepository!: LocalPairingHistoryRepository;

  // Service instances
  private seasonManager!: SeasonManagerService;
  private playerManager!: PlayerManagerService;
  private scheduleManager!: ScheduleManager;
  private scheduleGenerator!: ScheduleGenerator;
  private exportService!: ExportService;
  private importExportService!: ImportExportService;
  private pairingHistoryTracker!: PairingHistoryTracker;

  // System instances
  private stateManager!: ApplicationStateManager;
  private errorHandler!: ErrorHandler;
  private router!: ApplicationRouter;
  private errorBoundary!: GlobalErrorBoundary;
  private debugInterface!: DebugInterface;

  // UI instances
  private mainUI!: MainApplicationUI;
  private notificationUI!: NotificationUI;
  private debugUI!: DebugUI;

  constructor(config: ApplicationConfig) {
    this.config = {
      enableErrorReporting: true,
      enableRouting: true,
      debugMode: false,
      autoInitializeDemo: false,
      ...config
    };

    this.state = {
      isInitialized: false,
      hasError: false
    };

    // Get container element
    const containerElement = document.getElementById(this.config.containerElementId);
    if (!containerElement) {
      throw new Error(`Container element with ID "${this.config.containerElementId}" not found`);
    }
    this.container = containerElement;

    // Initialize all components
    this.initializeSystemComponents();
    this.initializeRepositories();
    this.initializeServices();
    this.initializeUI();
    this.setupIntegrations();
  }

  /**
   * Initialize system components (state, error handling, routing)
   */
  private initializeSystemComponents(): void {
    try {
      // Use global instances
      this.stateManager = applicationState;
      this.errorHandler = errorHandler;
      this.debugInterface = debugInterface;
      
      // Initialize enhanced error handling system
      initializeEnhancedErrorHandling(this.container, {
        debugMode: this.config.debugMode,
        enableConsoleLogging: this.config.debugMode
      });
      
      // Set up global error boundary
      this.errorBoundary = GlobalErrorBoundary.create(this.container);
      
      if (this.config.enableRouting) {
        this.router = applicationRouter;
      }

      if (this.config.debugMode) {
        console.log('System components initialized successfully');
      }
    } catch (error) {
      this.handleError('Failed to initialize system components', error);
    }
  }

  /**
   * Initialize all repository instances
   */
  private initializeRepositories(): void {
    try {
      this.seasonRepository = new LocalSeasonRepository();
      this.playerRepository = new LocalPlayerRepository();
      this.weekRepository = new LocalWeekRepository();
      this.scheduleRepository = new LocalScheduleRepository();
      this.pairingHistoryRepository = new LocalPairingHistoryRepository();

      if (this.config.debugMode) {
        console.log('Repositories initialized successfully');
      }
    } catch (error) {
      this.handleError('Failed to initialize repositories', error);
    }
  }

  /**
   * Initialize all service instances with proper dependency injection
   */
  private initializeServices(): void {
    try {
      // Initialize services in dependency order
      this.seasonManager = new SeasonManagerService(this.seasonRepository);
      
      this.playerManager = new PlayerManagerService(
        this.playerRepository,
        this.weekRepository,
        this.scheduleRepository,
        this.seasonRepository
      );

      this.pairingHistoryTracker = new PairingHistoryTracker(this.pairingHistoryRepository);

      this.scheduleGenerator = new ScheduleGenerator(
        {
          prioritizeCompleteGroups: true,
          balanceTimeSlots: true,
          optimizePairings: true
        },
        this.pairingHistoryTracker
      );

      this.scheduleManager = new ScheduleManager(
        this.scheduleRepository,
        this.weekRepository,
        this.playerRepository,
        this.scheduleGenerator,
        this.pairingHistoryTracker
      );

      this.exportService = new ExportService();

      this.importExportService = new ImportExportService(
        this.playerManager,
        this.seasonManager
      );

      if (this.config.debugMode) {
        console.log('Services initialized successfully');
      }
    } catch (error) {
      this.handleError('Failed to initialize services', error);
    }
  }

  /**
   * Initialize the main UI component
   */
  private initializeUI(): void {
    try {
      this.mainUI = new MainApplicationUI(
        this.container,
        this.seasonManager,
        this.playerManager,
        this.scheduleManager,
        this.scheduleGenerator,
        this.weekRepository,
        this.exportService,
        this.importExportService,
        this.pairingHistoryTracker
      );

      // Enhanced error handling system already initializes notification and debug UI
      // No need to create them separately here

      if (this.config.debugMode) {
        console.log('UI initialized successfully');
      }
    } catch (error) {
      this.handleError('Failed to initialize UI', error);
    }
  }

  /**
   * Set up integrations between different systems
   */
  private setupIntegrations(): void {
    try {
      // Set up state synchronization with services
      this.setupStateSync();

      // Set up error handling integration
      this.setupErrorHandling();

      // Set up routing integration
      if (this.config.enableRouting) {
        this.setupRouting();
      }

      if (this.config.debugMode) {
        console.log('System integrations configured successfully');
      }
    } catch (error) {
      this.handleError('Failed to set up integrations', error);
    }
  }

  /**
   * Set up state synchronization between services and UI
   */
  private setupStateSync(): void {
    // Subscribe to state changes and update UI accordingly
    this.stateManager.subscribe('activeSeason', async (newSeason) => {
      if (newSeason) {
        // Load related data when season changes
        const players = await this.playerManager.getAllPlayers(newSeason.id);
        const weeks = await this.weekRepository.findBySeasonId(newSeason.id);
        
        this.stateManager.updatePlayers(players);
        this.stateManager.updateWeeks(weeks);
      }
    });

    this.stateManager.subscribe('selectedWeek', async (newWeek) => {
      if (newWeek) {
        // Load schedule for selected week
        const schedule = await this.scheduleManager.getSchedule(newWeek.id);
        this.stateManager.updateCurrentSchedule(schedule);
      }
    });
  }

  /**
   * Set up error handling integration
   */
  private setupErrorHandling(): void {
    if (this.config.enableErrorReporting) {
      // Error handler is already set up globally
      // Additional app-specific error handling can be added here
      
      this.stateManager.subscribe('hasError', (hasError) => {
        if (hasError) {
          const errorMessage = this.stateManager.get('errorMessage');
          if (errorMessage) {
            this.renderErrorState(errorMessage);
          }
        }
      });
    }
  }

  /**
   * Set up routing integration
   */
  private setupRouting(): void {
    // Router is already initialized and listening to state changes
    // Additional routing configuration can be added here
  }

  /**
   * Start the application
   */
  async start(): Promise<void> {
    try {
      if (this.state.hasError) {
        throw new Error(`Cannot start application: ${this.state.errorMessage}`);
      }

      // Set application as loading
      this.stateManager.setLoading(true);

      // Initialize the main UI
      await this.mainUI.initialize();

      // Load initial data
      await this.loadInitialData();

      // Set up demo data if requested
      if (this.config.autoInitializeDemo) {
        await this.initializeDemoData();
      }

      // Mark as initialized
      this.state.isInitialized = true;
      this.stateManager.update({
        isInitialized: true,
        isLoading: false
      });

      if (this.config.debugMode) {
        console.log('Indoor Golf Scheduler application started successfully');
      }

      // Expose application instance for debugging
      if (this.config.debugMode) {
        (window as any).golfSchedulerApp = this;
      }

      // Show success notification
      this.errorHandler.handleSuccess('Application loaded successfully');

    } catch (error) {
      this.handleError('Failed to start application', error);
      throw error;
    }
  }

  /**
   * Load initial application data
   */
  private async loadInitialData(): Promise<void> {
    try {
      // Load all seasons
      const seasons = await this.seasonManager.getAllSeasons();
      this.stateManager.updateSeasons(seasons);

      // Set active season if one exists
      const activeSeason = await this.seasonManager.getActiveSeason();
      if (activeSeason) {
        this.stateManager.setActiveSeason(activeSeason);
      }

    } catch (error) {
      this.errorHandler.handleError(error, {
        component: 'IndoorGolfSchedulerApp',
        action: 'loadInitialData'
      });
    }
  }

  /**
   * Initialize demo data for testing
   */
  private async initializeDemoData(): Promise<void> {
    try {
      const existingSeasons = await this.seasonManager.getAllSeasons();
      
      if (existingSeasons.length === 0) {
        console.log('Setting up demo data...');
        
        // Create a demo season
        const currentDate = new Date();
        const startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 3, 0);
        
        const demoSeason = await this.seasonManager.createSeason(
          'Demo Season - ' + currentDate.getFullYear(),
          startDate,
          endDate
        );
        
        await this.seasonManager.setActiveSeason(demoSeason.id);
        
        // Re-initialize the SeasonUI to trigger the active season callback
        if (this.mainUI) {
          await this.mainUI.seasonUI.initialize();
        }
        
        // Add some demo players
        const demoPlayers = [
          { firstName: 'John', lastName: 'Smith', handedness: 'right' as const, timePreference: 'AM' as const },
          { firstName: 'Jane', lastName: 'Doe', handedness: 'left' as const, timePreference: 'PM' as const },
          { firstName: 'Bob', lastName: 'Johnson', handedness: 'right' as const, timePreference: 'Either' as const },
          { firstName: 'Alice', lastName: 'Williams', handedness: 'left' as const, timePreference: 'Either' as const },
          { firstName: 'Charlie', lastName: 'Brown', handedness: 'right' as const, timePreference: 'AM' as const },
          { firstName: 'Diana', lastName: 'Davis', handedness: 'left' as const, timePreference: 'PM' as const }
        ];
        
        for (const playerData of demoPlayers) {
          await this.playerManager.addPlayer(playerData);
        }
        
        console.log('Demo data created successfully!');
        this.errorHandler.handleSuccess('Demo data loaded successfully');
      }
    } catch (error) {
      this.errorHandler.handleError(error, {
        component: 'IndoorGolfSchedulerApp',
        action: 'initializeDemoData'
      });
    }
  }

  /**
   * Stop the application and clean up resources
   */
  async stop(): Promise<void> {
    try {
      this.state.isInitialized = false;
      this.stateManager.update({
        isInitialized: false,
        isLoading: false
      });

      // Clean up enhanced error handling system
      enhancedErrorHandling.destroy();

      if (this.errorBoundary) {
        this.errorBoundary.destroy();
      }

      // Clear the container
      this.container.innerHTML = '';

      // Clean up debug references
      if ((window as any).golfSchedulerApp === this) {
        delete (window as any).golfSchedulerApp;
      }

      if (this.config.debugMode) {
        console.log('Indoor Golf Scheduler application stopped');
      }

    } catch (error) {
      this.handleError('Error during application shutdown', error);
    }
  }

  /**
   * Restart the application
   */
  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  /**
   * Handle application errors
   */
  private handleError(message: string, error?: any): void {
    this.state.hasError = true;
    this.state.errorMessage = message;

    const fullErrorMessage = error ? `${message}: ${error.message || error}` : message;

    if (this.config.enableErrorReporting) {
      console.error(fullErrorMessage, error);
    }

    // Update state
    this.stateManager.setError(true, fullErrorMessage);

    // Display error in UI if container is available
    if (this.container) {
      this.renderErrorState(fullErrorMessage);
    }
  }

  /**
   * Render error state in the UI
   */
  private renderErrorState(errorMessage: string): void {
    this.container.innerHTML = `
      <div class="app-error-state">
        <div class="error-container">
          <h1>Indoor Golf Scheduler</h1>
          <div class="error-content">
            <h2>Application Error</h2>
            <p class="error-message">${errorMessage}</p>
            <div class="error-actions">
              <button class="btn btn-primary" onclick="location.reload()">
                Reload Application
              </button>
              ${this.config.debugMode ? `
                <button class="btn btn-secondary" onclick="console.log(window.golfSchedulerApp)">
                  Debug Info
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Get application state
   */
  getState(): ApplicationState {
    return { ...this.state };
  }

  /**
   * Get application configuration
   */
  getConfig(): ApplicationConfig {
    return { ...this.config };
  }

  /**
   * Get service instances (for debugging or advanced usage)
   */
  getServices() {
    return {
      seasonManager: this.seasonManager,
      playerManager: this.playerManager,
      scheduleManager: this.scheduleManager,
      scheduleGenerator: this.scheduleGenerator,
      exportService: this.exportService,
      importExportService: this.importExportService,
      pairingHistoryTracker: this.pairingHistoryTracker
    };
  }

  /**
   * Get repository instances (for debugging or advanced usage)
   */
  getRepositories() {
    return {
      seasonRepository: this.seasonRepository,
      playerRepository: this.playerRepository,
      weekRepository: this.weekRepository,
      scheduleRepository: this.scheduleRepository,
      pairingHistoryRepository: this.pairingHistoryRepository
    };
  }

  /**
   * Get system instances (for debugging or advanced usage)
   */
  getSystems() {
    return {
      stateManager: this.stateManager,
      errorHandler: this.errorHandler,
      router: this.router,
      errorBoundary: this.errorBoundary,
      debugInterface: this.debugInterface
    };
  }

  /**
   * Get UI instance (for debugging or advanced usage)
   */
  getUI(): MainApplicationUI {
    return this.mainUI;
  }
}

/**
 * Factory function to create and start the application
 */
export async function createIndoorGolfSchedulerApp(config: ApplicationConfig): Promise<IndoorGolfSchedulerApp> {
  const app = new IndoorGolfSchedulerApp(config);
  await app.start();
  return app;
}

/**
 * Default application factory with common configuration
 */
export async function createDefaultApp(containerElementId: string): Promise<IndoorGolfSchedulerApp> {
  return createIndoorGolfSchedulerApp({
    containerElementId,
    enableErrorReporting: true,
    enableRouting: true,
    debugMode: process.env.NODE_ENV === 'development',
    autoInitializeDemo: true
  });
}