import { Season } from '../models/Season';
import { Schedule } from '../models/Schedule';

// Import all UI components
import { SeasonManagementUI } from './SeasonManagementUI';
import { PlayerManagementUI } from './PlayerManagementUI';
import { AvailabilityManagementUI } from './AvailabilityManagementUI';
import { ScheduleDisplayUI } from './ScheduleDisplayUI';
import { ScheduleEditingUI } from './ScheduleEditingUI';

// Import services
import { SeasonManager } from '../services/SeasonManager';
import { PlayerManager } from '../services/PlayerManager';
import { ScheduleManager } from '../services/ScheduleManager';
import { ScheduleGenerator } from '../services/ScheduleGenerator';
import { ExportService } from '../services/ExportService';
import { PairingHistoryTracker } from '../services/PairingHistoryTracker';

// Import repositories
import { WeekRepository } from '../repositories/WeekRepository';

export interface MainApplicationUIState {
  activeSeason: Season | null;
  currentTab: 'seasons' | 'players' | 'availability' | 'schedule' | 'edit';
  isInitialized: boolean;
}

export class MainApplicationUI {
  private state: MainApplicationUIState;
  private container: HTMLElement;
  private isStructureCreated: boolean = false;
  
  // UI Components
  private seasonUI!: SeasonManagementUI;
  private playerUI!: PlayerManagementUI;
  private availabilityUI!: AvailabilityManagementUI;
  private scheduleDisplayUI!: ScheduleDisplayUI;
  private scheduleEditingUI!: ScheduleEditingUI;

  // Service dependencies
  private seasonManager: SeasonManager;
  private playerManager: PlayerManager;
  private scheduleManager: ScheduleManager;
  private scheduleGenerator: ScheduleGenerator;
  private weekRepository: WeekRepository;
  private exportService: ExportService;
  private pairingHistoryTracker: PairingHistoryTracker;

  constructor(
    container: HTMLElement,
    seasonManager: SeasonManager,
    playerManager: PlayerManager,
    scheduleManager: ScheduleManager,
    scheduleGenerator: ScheduleGenerator,
    weekRepository: WeekRepository,
    exportService: ExportService,
    pairingHistoryTracker: PairingHistoryTracker
  ) {
    this.container = container;
    this.seasonManager = seasonManager;
    this.playerManager = playerManager;
    this.scheduleManager = scheduleManager;
    this.scheduleGenerator = scheduleGenerator;
    this.weekRepository = weekRepository;
    this.exportService = exportService;
    this.pairingHistoryTracker = pairingHistoryTracker;

    this.state = {
      activeSeason: null,
      currentTab: 'seasons',
      isInitialized: false
    };

    // Initialize UI components
    this.initializeUIComponents();
  }

  /**
   * Initialize all UI components
   */
  private initializeUIComponents(): void {
    // Create containers for each UI component
    const seasonContainer = document.createElement('div');
    const playerContainer = document.createElement('div');
    const availabilityContainer = document.createElement('div');
    const scheduleDisplayContainer = document.createElement('div');
    const scheduleEditingContainer = document.createElement('div');

    // Initialize UI components
    this.seasonUI = new SeasonManagementUI(this.seasonManager, seasonContainer);
    this.playerUI = new PlayerManagementUI(this.playerManager, playerContainer);
    this.availabilityUI = new AvailabilityManagementUI(this.playerManager, this.weekRepository, availabilityContainer);
    this.scheduleDisplayUI = new ScheduleDisplayUI(
      this.scheduleManager,
      this.scheduleGenerator,
      this.weekRepository,
      this.exportService,
      this.pairingHistoryTracker,
      this.playerManager,
      scheduleDisplayContainer
    );
    this.scheduleEditingUI = new ScheduleEditingUI(this.scheduleManager, scheduleEditingContainer);

    // Set up callbacks
    this.setupCallbacks();
  }

  /**
   * Set up callbacks between UI components
   */
  private setupCallbacks(): void {
    // When active season changes, update all other components
    this.seasonUI.onActiveSeasonChange((season) => {
      this.handleActiveSeasonChange(season);
    });

    // When schedule is generated, switch to editing tab
    this.scheduleDisplayUI.onScheduleGeneratedCallback((schedule) => {
      this.handleScheduleGenerated(schedule);
    });

    // When schedule is updated in editing, refresh display
    this.scheduleEditingUI.onScheduleUpdatedCallback((schedule) => {
      this.handleScheduleUpdated(schedule);
    });
  }

  /**
   * Initialize the application
   */
  async initialize(): Promise<void> {
    try {
      // Initialize season UI first to get active season
      await this.seasonUI.initialize();
      this.state.activeSeason = this.seasonUI.getActiveSeason();

      // Initialize other components with the active season
      await Promise.all([
        this.playerUI.initialize(this.state.activeSeason),
        this.availabilityUI.initialize(this.state.activeSeason),
        this.scheduleDisplayUI.initialize(this.state.activeSeason)
      ]);

      this.state.isInitialized = true;
      this.render();
    } catch (error) {
      console.error('Failed to initialize application:', error);
      this.renderError('Failed to initialize application. Please refresh the page.');
    }
  }

  /**
   * Handle active season change
   */
  private async handleActiveSeasonChange(season: Season | null): Promise<void> {
    this.state.activeSeason = season;

    // Update all components with the new active season
    await Promise.all([
      this.playerUI.setActiveSeason(season),
      this.availabilityUI.setActiveSeason(season),
      this.scheduleDisplayUI.setActiveSeason(season)
    ]);

    this.render();
  }

  /**
   * Handle schedule generation
   */
  private async handleScheduleGenerated(schedule: Schedule): Promise<void> {
    const selectedWeek = this.scheduleDisplayUI.getSelectedWeek();
    if (selectedWeek) {
      await this.scheduleEditingUI.initialize(schedule, selectedWeek);
      this.switchTab('edit');
    }
  }

  /**
   * Handle schedule update
   */
  private async handleScheduleUpdated(_schedule: Schedule): Promise<void> {
    // Refresh the schedule display
    await this.scheduleDisplayUI.refresh();
    this.switchTab('schedule');
  }

  /**
   * Switch to a different tab
   */
  private switchTab(tab: 'seasons' | 'players' | 'availability' | 'schedule' | 'edit'): void {
    this.state.currentTab = tab;
    this.render();
  }

  /**
   * Render the main application UI
   */
  private render(): void {
    if (!this.state.isInitialized) {
      this.container.innerHTML = `
        <div class="app-loading">
          <div class="loading-spinner"></div>
          <p>Loading Indoor Golf Scheduler...</p>
        </div>
      `;
      return;
    }

    // Check if we need to create the main structure
    const mainApp = this.container.querySelector('.main-application');
    
    if (!mainApp) {
      this.createMainStructure();
    } else {
      // Verify navigation listener is still there
      const navigation = this.container.querySelector('.app-navigation');
      const hasListenerSetup = navigation?.hasAttribute('data-listener-setup');
      
      if (!hasListenerSetup) {
        this.setupNavigationListeners();
      }
    }

    // Update the header content
    this.updateHeader();

    // Update navigation state
    this.updateNavigationState();

    // Update tab visibility
    this.updateTabVisibility();
  }

  /**
   * Create the main application structure (called only once)
   */
  private createMainStructure(): void {
    if (this.isStructureCreated) {
      return; // Prevent recreation
    }

    this.container.innerHTML = `
      <div class="main-application">
        <header class="app-header">
          <h1>Indoor Golf Scheduler</h1>
          <div class="active-season-display"></div>
        </header>

        <nav class="app-navigation">
          <button class="nav-tab" data-tab="seasons">Seasons</button>
          <button class="nav-tab" data-tab="players">Players</button>
          <button class="nav-tab" data-tab="availability">Availability</button>
          <button class="nav-tab" data-tab="schedule">Schedule</button>
          <button class="nav-tab" data-tab="edit">Edit Schedule</button>
        </nav>

        <main class="app-content">
          <div class="tab-content" data-tab="seasons"></div>
          <div class="tab-content" data-tab="players"></div>
          <div class="tab-content" data-tab="availability"></div>
          <div class="tab-content" data-tab="schedule"></div>
          <div class="tab-content" data-tab="edit"></div>
        </main>
      </div>
    `;

    // Assign containers to UI components (only once)
    this.assignContainers();

    // Set up navigation event listeners (only once)
    this.setupNavigationListeners();

    this.isStructureCreated = true;
  }

  /**
   * Assign containers to UI components
   */
  private assignContainers(): void {
    this.seasonUI.container = this.container.querySelector('[data-tab="seasons"]') as HTMLElement;
    this.playerUI.container = this.container.querySelector('[data-tab="players"]') as HTMLElement;
    this.availabilityUI.container = this.container.querySelector('[data-tab="availability"]') as HTMLElement;
    this.scheduleDisplayUI.container = this.container.querySelector('[data-tab="schedule"]') as HTMLElement;
    this.scheduleEditingUI.container = this.container.querySelector('[data-tab="edit"]') as HTMLElement;
  }

  /**
   * Update the header content
   */
  private updateHeader(): void {
    const activeSeasonDisplay = this.container.querySelector('.active-season-display');
    if (activeSeasonDisplay) {
      activeSeasonDisplay.innerHTML = this.state.activeSeason ? `
        <span class="active-season-label">Active Season:</span>
        <span class="active-season-name">${this.state.activeSeason.name}</span>
      ` : `
        <span class="no-active-season">No Active Season</span>
      `;
    }
  }

  /**
   * Set up navigation event listeners using event delegation
   */
  private setupNavigationListeners(): void {
    // Use event delegation on the navigation container instead of individual buttons
    const navigation = this.container.querySelector('.app-navigation');
    
    if (navigation) {
      // Remove any existing listeners first
      navigation.removeEventListener('click', this.handleNavClick);
      // Add the listener using event delegation
      navigation.addEventListener('click', this.handleNavClick);
      
      // Test that the listener is working by adding a test attribute
      navigation.setAttribute('data-listener-setup', 'true');
    }
  }

  /**
   * Handle navigation button clicks using event delegation
   */
  private handleNavClick = (event: Event) => {
    const target = event.target as HTMLElement;
    
    // Check if the clicked element is a nav button
    if (!target.classList.contains('nav-tab')) {
      return;
    }
    
    const button = target as HTMLButtonElement;
    const tab = button.getAttribute('data-tab') as any;
    const isDisabled = button.hasAttribute('disabled');
    
    if (tab && !isDisabled) {
      this.switchTab(tab);
    }
  };

  /**
   * Update navigation button states
   */
  private updateNavigationState(): void {
    const navButtons = this.container.querySelectorAll('.nav-tab');
    
    navButtons.forEach((button) => {
      const tab = button.getAttribute('data-tab');
      
      // Update active state
      if (tab === this.state.currentTab) {
        button.classList.add('active');
      } else {
        button.classList.remove('active');
      }

      // Update disabled state
      const shouldBeDisabled = !this.state.activeSeason && (tab === 'players' || tab === 'availability' || tab === 'schedule' || tab === 'edit');
      
      if (shouldBeDisabled) {
        button.setAttribute('disabled', 'true');
      } else {
        button.removeAttribute('disabled');
      }
    });
  }



  /**
   * Update tab content visibility
   */
  private updateTabVisibility(): void {
    const tabContents = this.container.querySelectorAll('.tab-content');
    tabContents.forEach(content => {
      const tab = content.getAttribute('data-tab');
      if (tab === this.state.currentTab) {
        content.classList.add('active');
      } else {
        content.classList.remove('active');
      }
    });
  }

  /**
   * Render error state
   */
  private renderError(message: string): void {
    this.container.innerHTML = `
      <div class="app-error">
        <h1>Indoor Golf Scheduler</h1>
        <div class="error-message">
          <h2>Error</h2>
          <p>${message}</p>
          <button class="btn btn-primary" onclick="location.reload()">
            Reload Application
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Get the current active season
   */
  getActiveSeason(): Season | null {
    return this.state.activeSeason;
  }

  /**
   * Get the current tab
   */
  getCurrentTab(): string {
    return this.state.currentTab;
  }

  /**
   * Refresh all UI components
   */
  async refreshAll(): Promise<void> {
    await Promise.all([
      this.seasonUI.refresh(),
      this.playerUI.refresh(),
      this.availabilityUI.refresh(),
      this.scheduleDisplayUI.refresh()
    ]);
  }
}