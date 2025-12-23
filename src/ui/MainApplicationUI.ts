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

    this.container.innerHTML = `
      <div class="main-application">
        <header class="app-header">
          <h1>Indoor Golf Scheduler</h1>
          <div class="active-season-display">
            ${this.state.activeSeason ? `
              <span class="active-season-label">Active Season:</span>
              <span class="active-season-name">${this.state.activeSeason.name}</span>
            ` : `
              <span class="no-active-season">No Active Season</span>
            `}
          </div>
        </header>

        <nav class="app-navigation">
          <button class="nav-tab ${this.state.currentTab === 'seasons' ? 'active' : ''}"
                  onclick="mainAppUI.switchTab('seasons')">
            Seasons
          </button>
          <button class="nav-tab ${this.state.currentTab === 'players' ? 'active' : ''}"
                  onclick="mainAppUI.switchTab('players')"
                  ${!this.state.activeSeason ? 'disabled' : ''}>
            Players
          </button>
          <button class="nav-tab ${this.state.currentTab === 'availability' ? 'active' : ''}"
                  onclick="mainAppUI.switchTab('availability')"
                  ${!this.state.activeSeason ? 'disabled' : ''}>
            Availability
          </button>
          <button class="nav-tab ${this.state.currentTab === 'schedule' ? 'active' : ''}"
                  onclick="mainAppUI.switchTab('schedule')"
                  ${!this.state.activeSeason ? 'disabled' : ''}>
            Schedule
          </button>
          <button class="nav-tab ${this.state.currentTab === 'edit' ? 'active' : ''}"
                  onclick="mainAppUI.switchTab('edit')"
                  ${!this.state.activeSeason ? 'disabled' : ''}>
            Edit Schedule
          </button>
        </nav>

        <main class="app-content">
          <div class="tab-content ${this.state.currentTab === 'seasons' ? 'active' : ''}">
            ${this.seasonUI.container.outerHTML}
          </div>
          <div class="tab-content ${this.state.currentTab === 'players' ? 'active' : ''}">
            ${this.playerUI.container.outerHTML}
          </div>
          <div class="tab-content ${this.state.currentTab === 'availability' ? 'active' : ''}">
            ${this.availabilityUI.container.outerHTML}
          </div>
          <div class="tab-content ${this.state.currentTab === 'schedule' ? 'active' : ''}">
            ${this.scheduleDisplayUI.container.outerHTML}
          </div>
          <div class="tab-content ${this.state.currentTab === 'edit' ? 'active' : ''}">
            ${this.scheduleEditingUI.container.outerHTML}
          </div>
        </main>
      </div>
    `;

    this.attachEventListeners();
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
   * Attach event listeners
   */
  private attachEventListeners(): void {
    // Bind methods to window for onclick handlers
    (window as any).mainAppUI = {
      switchTab: (tab: string) => {
        this.switchTab(tab as any);
      }
    };

    // Re-attach event listeners for active UI components
    const activeTabContent = this.container.querySelector('.tab-content.active');
    if (activeTabContent) {
      switch (this.state.currentTab) {
        case 'seasons':
          this.seasonUI.container = activeTabContent as HTMLElement;
          break;
        case 'players':
          this.playerUI.container = activeTabContent as HTMLElement;
          break;
        case 'availability':
          this.availabilityUI.container = activeTabContent as HTMLElement;
          break;
        case 'schedule':
          this.scheduleDisplayUI.container = activeTabContent as HTMLElement;
          break;
        case 'edit':
          this.scheduleEditingUI.container = activeTabContent as HTMLElement;
          break;
      }
    }
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