import { Season } from '../models/Season';
import { Schedule } from '../models/Schedule';

// Import all UI components
import { SeasonManagementUI } from './SeasonManagementUI';
import { PlayerManagementUI } from './PlayerManagementUI';
import { AvailabilityManagementUI } from './AvailabilityManagementUI';
import { ScheduleDisplayUI } from './ScheduleDisplayUI';
import { ScheduleEditingUI } from './ScheduleEditingUI';
import { ImportExportUI } from './ImportExportUI';

// Import services
import { SeasonManager } from '../services/SeasonManager';
import { PlayerManager } from '../services/PlayerManager';
import { ScheduleManager } from '../services/ScheduleManager';
import { ScheduleGenerator } from '../services/ScheduleGenerator';
import { ExportService } from '../services/ExportService';
import { ImportExportService } from '../services/ImportExportService';
import { PairingHistoryTracker } from '../services/PairingHistoryTracker';

// Import repositories
import { WeekRepository } from '../repositories/WeekRepository';

export interface MainApplicationUIState {
  activeSeason: Season | null;
  currentTab: 'seasons' | 'players' | 'availability' | 'schedule' | 'edit' | 'import-export';
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
  private importExportUI!: ImportExportUI;

  // Service dependencies
  private seasonManager: SeasonManager;
  private playerManager: PlayerManager;
  private scheduleManager: ScheduleManager;
  private scheduleGenerator: ScheduleGenerator;
  private weekRepository: WeekRepository;
  private exportService: ExportService;
  private importExportService: ImportExportService;
  private pairingHistoryTracker: PairingHistoryTracker;

  constructor(
    container: HTMLElement,
    seasonManager: SeasonManager,
    playerManager: PlayerManager,
    scheduleManager: ScheduleManager,
    scheduleGenerator: ScheduleGenerator,
    weekRepository: WeekRepository,
    exportService: ExportService,
    importExportService: ImportExportService,
    pairingHistoryTracker: PairingHistoryTracker
  ) {
    this.container = container;
    this.seasonManager = seasonManager;
    this.playerManager = playerManager;
    this.scheduleManager = scheduleManager;
    this.scheduleGenerator = scheduleGenerator;
    this.weekRepository = weekRepository;
    this.exportService = exportService;
    this.importExportService = importExportService;
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
    const importExportContainer = document.createElement('div');

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
    this.importExportUI = new ImportExportUI(importExportContainer, this.importExportService);

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

      // Initialize other components with the active season but DON'T render them yet
      // They will be rendered when their tabs are activated
      await Promise.all([
        this.playerUI.setActiveSeason(this.state.activeSeason),
        this.availabilityUI.setActiveSeason(this.state.activeSeason),
        this.scheduleDisplayUI.setActiveSeason(this.state.activeSeason)
      ]);

      this.state.isInitialized = true;
      await this.render();
      
      // Add app-loaded class to indicate successful initialization
      this.container.classList.add('app-loaded');
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

    await this.render();
  }

  /**
   * Handle schedule generation
   */
  private async handleScheduleGenerated(schedule: Schedule): Promise<void> {
    const selectedWeek = this.scheduleDisplayUI.getSelectedWeek();
    if (selectedWeek) {
      await this.scheduleEditingUI.initialize(schedule, selectedWeek);
      await this.switchTab('edit');
    }
  }

  /**
   * Handle schedule update
   */
  private async handleScheduleUpdated(_schedule: Schedule): Promise<void> {
    // Refresh the schedule display
    await this.scheduleDisplayUI.refresh();
    await this.switchTab('schedule');
  }

  /**
   * Switch to a different tab
   */
  private async switchTab(tab: 'seasons' | 'players' | 'availability' | 'schedule' | 'edit' | 'import-export'): Promise<void> {
    this.state.currentTab = tab;
    
    // Clear ALL tab contents first to prevent overlap
    const tabContents = this.container.querySelectorAll('.tab-content');
    tabContents.forEach(content => {
      content.innerHTML = '';
      content.classList.remove('active');
    });
    
    // Set the active tab content
    const activeTabContent = this.container.querySelector(`[data-tab-content="${tab}"]`);
    if (activeTabContent) {
      activeTabContent.classList.add('active');
    }
    
    // Render specific UI components when their tab is activated
    if (tab === 'seasons') {
      await this.seasonUI.refresh();
    } else if (tab === 'players') {
      await this.playerUI.refresh();
    } else if (tab === 'availability') {
      await this.availabilityUI.refresh();
    } else if (tab === 'schedule') {
      await this.scheduleDisplayUI.refresh();
    } else if (tab === 'edit') {
      // Initialize with null schedule to show "no schedule" message
      await this.scheduleEditingUI.initialize(null, null);
    } else if (tab === 'import-export') {
      this.importExportUI.render();
    }
    
    // Update navigation state
    this.updateNavigationState();
  }

  /**
   * Render the main application UI
   */
  private async render(): Promise<void> {
    console.log('MainApplicationUI.render() called, isInitialized:', this.state.isInitialized);
    
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
    console.log('Existing main app element:', mainApp);
    
    if (!mainApp) {
      console.log('Creating main structure...');
      await this.createMainStructure();
    } else {
      // Verify navigation listener is still there
      const navigation = this.container.querySelector('.app-navigation');
      const hasListenerSetup = navigation?.hasAttribute('data-listener-setup');
      console.log('Navigation element:', navigation, 'Has listener setup:', hasListenerSetup);
      
      if (!hasListenerSetup) {
        this.setupNavigationListeners();
      }
    }

    // Update the header content
    this.updateHeader();

    // Update navigation state
    this.updateNavigationState();

    // Update tab visibility
    await this.updateTabVisibility();
    
    console.log('MainApplicationUI.render() completed, currentTab:', this.state.currentTab);
  }

  /**
   * Create the main application structure (called only once)
   */
  private async createMainStructure(): Promise<void> {
    if (this.isStructureCreated) {
      console.log('Structure already created, skipping...');
      return; // Prevent recreation
    }

    console.log('Creating main application structure...');
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
          <button class="nav-tab" data-tab="import-export">Import/Export</button>
        </nav>

        <main class="app-content">
          <div class="tab-content" data-tab-content="seasons"></div>
          <div class="tab-content" data-tab-content="players"></div>
          <div class="tab-content" data-tab-content="availability"></div>
          <div class="tab-content" data-tab-content="schedule"></div>
          <div class="tab-content" data-tab-content="edit"></div>
          <div class="tab-content" data-tab-content="import-export"></div>
        </main>
      </div>
    `;

    console.log('HTML structure created, DOM structure:');
    console.log('Container:', this.container);
    console.log('Main app:', this.container.querySelector('.main-application'));
    console.log('Navigation:', this.container.querySelector('.app-navigation'));
    console.log('Content:', this.container.querySelector('.app-content'));

    console.log('HTML structure created, assigning containers...');
    // Assign containers to UI components (only once)
    await this.assignContainers();

    console.log('Setting up navigation listeners...');
    // Set up navigation event listeners (only once)
    this.setupNavigationListeners();

    this.isStructureCreated = true;
    console.log('Main structure creation completed');
  }

  /**
   * Assign containers to UI components
   */
  private async assignContainers(): Promise<void> {
    const seasonsContainer = this.container.querySelector('[data-tab-content="seasons"]') as HTMLElement;
    console.log('Assigning seasons container:', seasonsContainer);
    
    this.seasonUI.container = seasonsContainer;
    this.playerUI.container = this.container.querySelector('[data-tab-content="players"]') as HTMLElement;
    this.availabilityUI.container = this.container.querySelector('[data-tab-content="availability"]') as HTMLElement;
    this.scheduleDisplayUI.container = this.container.querySelector('[data-tab-content="schedule"]') as HTMLElement;
    this.scheduleEditingUI.container = this.container.querySelector('[data-tab-content="edit"]') as HTMLElement;
    this.importExportUI.container = this.container.querySelector('[data-tab-content="import-export"]') as HTMLElement;
    
    // Only render the current active tab's content
    if (this.state.currentTab === 'seasons') {
      console.log('Calling seasonUI.refresh() for active tab');
      await this.seasonUI.refresh();
      console.log('seasonUI.refresh() completed');
    }
    // Other components will be refreshed when their tabs are activated via tab switching
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
  private handleNavClick = async (event: Event) => {
    const target = event.target as HTMLElement;
    
    // Check if the clicked element is a nav button
    if (!target.classList.contains('nav-tab')) {
      return;
    }
    
    const button = target as HTMLButtonElement;
    const tab = button.getAttribute('data-tab') as any;
    const isDisabled = button.hasAttribute('disabled');
    
    if (tab && !isDisabled) {
      await this.switchTab(tab);
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
      const shouldBeDisabled = !this.state.activeSeason && (tab === 'players' || tab === 'availability' || tab === 'schedule' || tab === 'edit' || tab === 'import-export');
      
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
  private async updateTabVisibility(): Promise<void> {
    const tabContents = this.container.querySelectorAll('.tab-content');
    console.log('updateTabVisibility: Found', tabContents.length, 'tab contents, currentTab:', this.state.currentTab);
    
    tabContents.forEach(content => {
      const tab = content.getAttribute('data-tab-content');
      if (tab === this.state.currentTab) {
        content.classList.add('active');
        console.log('Setting tab', tab, 'as active');
      } else {
        content.classList.remove('active');
        // Clear inactive tab content to prevent overlap
        content.innerHTML = '';
        console.log('Setting tab', tab, 'as inactive and clearing content');
      }
    });

    // Re-render the active tab content
    if (this.state.currentTab === 'seasons') {
      await this.seasonUI.refresh();
    } else if (this.state.currentTab === 'players') {
      await this.playerUI.refresh();
    } else if (this.state.currentTab === 'availability') {
      await this.availabilityUI.refresh();
    } else if (this.state.currentTab === 'schedule') {
      await this.scheduleDisplayUI.refresh();
    } else if (this.state.currentTab === 'edit') {
      await this.scheduleEditingUI.initialize(null, null);
    } else if (this.state.currentTab === 'import-export') {
      this.importExportUI.render();
    }
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