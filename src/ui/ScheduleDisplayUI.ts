import { Schedule } from '../models/Schedule';
import { Foursome } from '../models/Foursome';
import { Player } from '../models/Player';
import { Week } from '../models/Week';
import { Season } from '../models/Season';
import { ScheduleManager, RegenerationStatus } from '../services/ScheduleManager';
import { ScheduleGenerator } from '../services/ScheduleGenerator';
import { WeekRepository } from '../repositories/WeekRepository';
import { ExportService, ExportFormat } from '../services/ExportService';
import { PairingHistoryTracker, PairingOptimizationResult } from '../services/PairingHistoryTracker';
import { PlayerManager } from '../services/PlayerManager';
import { ScheduleRegenerationConfirmationUI, ConfirmationResult } from './ScheduleRegenerationConfirmationUI';
import { ProgressTrackingUI, ProgressTrackingOptions } from './ProgressTrackingUI';
import { OperationLockUI, OperationLockOptions } from './OperationLockUI';
import { applicationState } from '../state/ApplicationState';

export interface ScheduleDisplayUIState {
  activeSeason: Season | null;
  weeks: Week[];
  selectedWeek: Week | null;
  schedule: Schedule | null;
  isGenerating: boolean;
  error: string | null;
  showExportOptions: boolean;
  showAddWeekForm: boolean;
  allPlayers: Player[];
  availablePlayers: Player[];
  unavailablePlayers: Player[];
  pairingMetrics: PairingOptimizationResult | null;
  showPairingHistory: boolean;
  showPlayerDistribution: boolean;
  // Schedule editing state
  isEditing: boolean;
  draggedPlayer: Player | null;
  draggedFromFoursome: string | null;
  hasUnsavedChanges: boolean;
  validationResult: any | null;
}

export class ScheduleDisplayUI {
  private state: ScheduleDisplayUIState;
  private scheduleManager: ScheduleManager;
  private weekRepository: WeekRepository;
  private exportService: ExportService;
  private pairingHistoryTracker: PairingHistoryTracker;
  private playerManager: PlayerManager;
  private confirmationUI: ScheduleRegenerationConfirmationUI;
  private progressTrackingUI: ProgressTrackingUI;
  private operationLockUI: OperationLockUI;
  public container: HTMLElement;
  private onScheduleGenerated?: (schedule: Schedule) => void;
  private regenerationStatusInterval: number | null = null;

  constructor(
    scheduleManager: ScheduleManager,
    _scheduleGenerator: ScheduleGenerator,
    weekRepository: WeekRepository,
    exportService: ExportService,
    pairingHistoryTracker: PairingHistoryTracker,
    playerManager: PlayerManager,
    container: HTMLElement
  ) {
    this.scheduleManager = scheduleManager;
    this.weekRepository = weekRepository;
    this.exportService = exportService;
    this.pairingHistoryTracker = pairingHistoryTracker;
    this.playerManager = playerManager;
    this.container = container;
    
    // Create confirmation UI container
    const confirmationContainer = document.createElement('div');
    confirmationContainer.id = 'schedule-regeneration-confirmation';
    document.body.appendChild(confirmationContainer);
    this.confirmationUI = new ScheduleRegenerationConfirmationUI(confirmationContainer);
    
    // Create progress tracking UI
    this.progressTrackingUI = new ProgressTrackingUI(document.body);
    
    // Create operation lock UI
    this.operationLockUI = new OperationLockUI(this.container);
    
    this.state = {
      activeSeason: null,
      weeks: [],
      selectedWeek: null,
      schedule: null,
      isGenerating: false,
      error: null,
      showExportOptions: false,
      showAddWeekForm: false,
      allPlayers: [],
      availablePlayers: [],
      unavailablePlayers: [],
      pairingMetrics: null,
      showPairingHistory: false,
      showPlayerDistribution: false,
      // Schedule editing state
      isEditing: false,
      draggedPlayer: null,
      draggedFromFoursome: null,
      hasUnsavedChanges: false,
      validationResult: null
    };
  }

  /**
   * Initialize the UI
   */
  async initialize(activeSeason: Season | null): Promise<void> {
    this.state.activeSeason = activeSeason;
    if (activeSeason) {
      await this.loadWeeks();
      await this.loadPlayers();
    }
    this.render();
  }

  /**
   * Set callback for when schedule is generated
   */
  onScheduleGeneratedCallback(callback: (schedule: Schedule) => void): void {
    this.onScheduleGenerated = callback;
  }

  /**
   * Update the active season and reload data
   */
  async setActiveSeason(season: Season | null): Promise<void> {
    this.state.activeSeason = season;
    if (season) {
      await this.loadWeeks();
      await this.loadPlayers();
    } else {
      this.state.weeks = [];
      this.state.selectedWeek = null;
      this.state.schedule = null;
      this.state.allPlayers = [];
      this.state.availablePlayers = [];
      this.state.unavailablePlayers = [];
      this.state.pairingMetrics = null;
      this.state.showAddWeekForm = false;
    }
    this.render();
  }

  /**
   * Load weeks for the active season
   */
  private async loadWeeks(): Promise<void> {
    if (!this.state.activeSeason) return;

    try {
      this.state.weeks = await this.weekRepository.findBySeasonId(this.state.activeSeason.id);
      this.state.weeks.sort((a, b) => a.weekNumber - b.weekNumber);
      
      // Select the first week if none selected
      if (this.state.weeks.length > 0 && !this.state.selectedWeek) {
        this.state.selectedWeek = this.state.weeks[0];
        await this.loadScheduleForSelectedWeek();
        await this.loadPlayerAvailability();
        await this.loadPairingMetrics();
      }
      
      this.state.error = null;
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : 'Failed to load weeks';
    }
  }

  /**
   * Load all players for the active season
   */
  private async loadPlayers(): Promise<void> {
    if (!this.state.activeSeason) return;

    try {
      this.state.allPlayers = await this.playerManager.getAllPlayers(this.state.activeSeason.id);
      this.state.error = null;
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : 'Failed to load players';
    }
  }

  /**
   * Load player availability for the selected week
   */
  private async loadPlayerAvailability(): Promise<void> {
    if (!this.state.selectedWeek || !this.state.activeSeason) return;

    try {
      const availablePlayers: Player[] = [];
      const unavailablePlayers: Player[] = [];

      for (const player of this.state.allPlayers) {
        const isAvailable = await this.playerManager.getPlayerAvailability(player.id, this.state.selectedWeek.id);
        if (isAvailable) {
          availablePlayers.push(player);
        } else {
          unavailablePlayers.push(player);
        }
      }

      this.state.availablePlayers = availablePlayers;
      this.state.unavailablePlayers = unavailablePlayers;
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : 'Failed to load player availability';
    }
  }

  /**
   * Load pairing metrics for the active season
   */
  private async loadPairingMetrics(): Promise<void> {
    if (!this.state.activeSeason || this.state.allPlayers.length === 0) return;

    try {
      this.state.pairingMetrics = await this.pairingHistoryTracker.calculatePairingMetrics(
        this.state.activeSeason.id,
        this.state.allPlayers
      );
    } catch (error) {
      // Don't show error for pairing metrics as it's not critical
      this.state.pairingMetrics = null;
    }
  }

  /**
   * Load schedule for the selected week
   */
  private async loadScheduleForSelectedWeek(): Promise<void> {
    console.log('loadScheduleForSelectedWeek called, selectedWeek:', this.state.selectedWeek?.id, 'current schedule:', this.state.schedule?.id);
    
    if (!this.state.selectedWeek) {
      console.log('No selected week, clearing schedule');
      this.state.schedule = null;
      return;
    }

    try {
      // Only reload schedule if we don't already have one for this week
      // This prevents overwriting a freshly created schedule that might not be persisted yet
      if (!this.state.schedule || this.state.schedule.weekId !== this.state.selectedWeek.id) {
        console.log('Loading schedule from repository for week:', this.state.selectedWeek.id);
        const loadedSchedule = await this.scheduleManager.getSchedule(this.state.selectedWeek.id);
        console.log('Loaded schedule from repository:', loadedSchedule?.id || 'null');
        this.state.schedule = loadedSchedule;
      } else {
        console.log('Keeping existing schedule for week:', this.state.selectedWeek.id);
      }
      await this.loadPlayerAvailability();
      await this.loadPairingMetrics();
      this.state.error = null;
    } catch (error) {
      console.log('Error loading schedule:', error);
      this.state.error = error instanceof Error ? error.message : 'Failed to load schedule';
    }
  }

  /**
   * Add a new week to the season
   */
  private async addNewWeek(): Promise<void> {
    if (!this.state.activeSeason) return;

    const dateInput = this.container.querySelector('#new-week-date') as HTMLInputElement;
    if (!dateInput || !dateInput.value) {
      this.state.error = 'Please select a date for the new week';
      this.render();
      return;
    }

    try {
      // Calculate next week number
      const maxWeekNumber = Math.max(...this.state.weeks.map(w => w.weekNumber), 0);
      const nextWeekNumber = maxWeekNumber + 1;

      // Create the new week
      const weekData = {
        seasonId: this.state.activeSeason.id,
        weekNumber: nextWeekNumber,
        date: new Date(dateInput.value)
      };

      const newWeek = await this.weekRepository.create(weekData);
      
      // Update state
      this.state.weeks.push(newWeek);
      this.state.weeks.sort((a, b) => a.weekNumber - b.weekNumber);
      this.state.selectedWeek = newWeek;
      this.state.schedule = null; // New week has no schedule yet
      this.state.showAddWeekForm = false;
      this.state.error = null;
      
      this.render();
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : 'Failed to add new week';
      this.render();
    }
  }

  /**
   * Create the first week for a season and generate its schedule
   */
  private async createFirstWeek(): Promise<void> {
    console.log('createFirstWeek called');
    
    if (!this.state.activeSeason) {
      console.log('No active season, returning');
      return;
    }

    const dateInput = this.container.querySelector('#first-week-date') as HTMLInputElement;
    let weekDate: Date;
    
    if (dateInput && dateInput.value) {
      weekDate = new Date(dateInput.value);
    } else {
      // Use default date - next Monday from today
      const today = new Date();
      const nextMonday = new Date(today);
      nextMonday.setDate(today.getDate() + (1 + 7 - today.getDay()) % 7);
      weekDate = nextMonday;
    }

    // Show progress tracking
    this.showGenerationProgress('Creating First Week', 'Setting up season and generating schedule...');

    try {
      // Create the first week
      const weekData = {
        seasonId: this.state.activeSeason.id,
        weekNumber: 1,
        date: weekDate
      };
      
      console.log('Creating first week with data:', weekData);

      const newWeek = await this.weekRepository.create(weekData);
      console.log('Week created successfully:', newWeek);
      
      // Generate schedule for the new week
      console.log('Generating schedule for week:', newWeek.id);
      const schedule = await this.scheduleManager.createWeeklySchedule(newWeek.id);
      console.log('Schedule generated successfully:', schedule);
      
      // Update state
      this.state.weeks = [newWeek];
      this.state.selectedWeek = newWeek;
      this.state.schedule = schedule;
      
      // Load player data for the new week
      await this.loadPlayerAvailability();
      await this.loadPairingMetrics();
      
      if (this.onScheduleGenerated) {
        this.onScheduleGenerated(schedule);
      }

      // Show success notification
      applicationState.addNotification({
        type: 'success',
        title: 'First Week Created',
        message: `Successfully created Week 1 and generated schedule for ${this.state.activeSeason.name}`,
        autoHide: true,
        duration: 4000
      });

      // Hide progress with success state
      this.progressTrackingUI.showCompletion(true, 'First week created successfully!');
      
      console.log('First week creation completed successfully');
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : 'Failed to create first week and schedule';
      
      // Show error notification
      applicationState.addNotification({
        type: 'error',
        title: 'First Week Creation Failed',
        message: this.state.error,
        autoHide: false
      });

      // Hide progress with error state
      this.progressTrackingUI.showCompletion(false, 'First week creation failed');
    } finally {
      this.state.isGenerating = false;
      this.operationLockUI.unlockUI();
      this.render();
    }
  }

  /**
   * Generate a new schedule for the selected week
   */
  private async generateSchedule(): Promise<void> {
    if (!this.state.selectedWeek) return;

    // Show progress tracking
    this.showGenerationProgress('Generating Schedule', 'Creating new schedule...');

    try {
      const schedule = await this.scheduleManager.createWeeklySchedule(this.state.selectedWeek.id);
      this.state.schedule = schedule;
      
      if (this.onScheduleGenerated) {
        this.onScheduleGenerated(schedule);
      }

      // Show success notification
      applicationState.addNotification({
        type: 'success',
        title: 'Schedule Generated',
        message: `Successfully generated schedule for Week ${this.state.selectedWeek.weekNumber}`,
        autoHide: true,
        duration: 3000
      });

      // Hide progress with success state
      this.progressTrackingUI.showCompletion(true, 'Schedule generated successfully!');

    } catch (error) {
      this.state.error = error instanceof Error ? error.message : 'Failed to generate schedule';
      
      // Show error notification
      applicationState.addNotification({
        type: 'error',
        title: 'Generation Failed',
        message: this.state.error,
        autoHide: false
      });

      // Hide progress with error state
      this.progressTrackingUI.showCompletion(false, 'Schedule generation failed');
    } finally {
      this.state.isGenerating = false;
      this.operationLockUI.unlockUI();
      this.render();
    }
  }

  /**
   * Export the current schedule
   */
  private async exportSchedule(format: 'pdf' | 'excel' | 'csv'): Promise<void> {
    if (!this.state.schedule || !this.state.selectedWeek) return;

    try {
      const options = {
        format: format as ExportFormat,
        includeHandedness: true,
        includeTimePreferences: true,
        title: `Week ${this.state.selectedWeek.weekNumber} Schedule`
      };

      const result = await this.exportService.exportSchedule(this.state.schedule, options);
      
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Export failed');
      }

      // Create download link
      const blobData = typeof result.data === 'string' ? result.data : new Uint8Array(result.data);
      const blob = new Blob([blobData], { type: result.mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      this.state.showExportOptions = false;
      this.render();
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : 'Failed to export schedule';
      this.render();
    }
  }

  /**
   * Render the UI
   */
  private render(): void {
    console.log('ScheduleDisplayUI.render() called, state:', {
      activeSeason: this.state.activeSeason?.name,
      weeksCount: this.state.weeks.length,
      selectedWeek: this.state.selectedWeek?.weekNumber,
      hasSchedule: !!this.state.schedule,
      isGenerating: this.state.isGenerating,
      error: this.state.error
    });
    
    if (!this.state.activeSeason) {
      this.container.innerHTML = `
        <div class="schedule-display">
          <div class="no-active-season">
            <h2>Schedule Display</h2>
            <p>Please select an active season to view and generate schedules.</p>
          </div>
        </div>
      `;
      return;
    }

    this.container.innerHTML = `
      <div class="schedule-display">
        <div class="schedule-header">
          <h2>Schedule Display</h2>
          <div class="season-info">
            <p>Season: <strong>${this.state.activeSeason.name}</strong></p>
          </div>
        </div>

        ${this.state.error ? `
          <div class="alert alert-error">
            ${this.state.error}
          </div>
        ` : ''}

        ${this.state.weeks.length === 0 ? `
          <div class="no-weeks">
            <h3>No Weeks Created Yet</h3>
            ${this.state.allPlayers.length < 4 ? `
              <div class="insufficient-players">
                <p>You need at least 4 players to generate a schedule.</p>
                <p>Current players: ${this.state.allPlayers.length}</p>
                <p>Please add more players before creating your first week.</p>
              </div>
            ` : `
              <p>Start by creating your first week and generating a schedule.</p>
              <div class="first-week-creation">
                <div class="form-group">
                  <label for="first-week-date">Week 1 Date:</label>
                  <input type="date" id="first-week-date" class="form-control">
                </div>
                <button class="btn btn-primary" onclick="scheduleDisplayUI.createFirstWeek()">
                  Generate Schedule
                </button>
              </div>
            `}
          </div>
        ` : `
          <div class="week-selector">
            <div class="week-selector-header">
              <div class="week-select-group">
                <label for="week-select">Select Week:</label>
                <select id="week-select">
                  ${this.state.weeks.map(week => `
                    <option value="${week.id}" ${this.state.selectedWeek?.id === week.id ? 'selected' : ''}>
                      Week ${week.weekNumber} - ${this.formatDate(week.date)}
                      ${week.scheduleId ? ' (Scheduled)' : ' (No Schedule)'}
                    </option>
                  `).join('')}
                </select>
              </div>
              <button class="btn btn-secondary btn-sm" onclick="scheduleDisplayUI.showAddWeekForm()">
                Add Week
              </button>
            </div>
            
            ${this.state.showAddWeekForm ? `
              <div class="add-week-form">
                <h4>Add New Week</h4>
                <div class="form-row">
                  <div class="form-group">
                    <label for="new-week-date">Week Date:</label>
                    <input type="date" id="new-week-date" class="form-control">
                  </div>
                  <div class="form-actions">
                    <button class="btn btn-primary btn-sm" onclick="scheduleDisplayUI.addNewWeek()">
                      Add Week
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="scheduleDisplayUI.hideAddWeekForm()">
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            ` : ''}
          </div>

          ${this.renderScheduleContent()}
        `}
      </div>
    `;

    this.attachEventListeners();
  }

  /**
   * Render the schedule content area
   */
  private renderScheduleContent(): string {
    console.log('renderScheduleContent called, selectedWeek:', this.state.selectedWeek?.weekNumber, 'schedule:', this.state.schedule?.id, 'isGenerating:', this.state.isGenerating);
    
    if (!this.state.selectedWeek) {
      console.log('No selectedWeek, returning empty');
      return '';
    }

    if (this.state.isGenerating) {
      console.log('Is generating, showing loading');
      return `
        <div class="generating-schedule">
          <div class="loading-spinner"></div>
          <p>Generating schedule for Week ${this.state.selectedWeek.weekNumber}...</p>
        </div>
      `;
    }

    if (!this.state.schedule) {
      console.log('No schedule, showing no-schedule content');
      // Check if there are insufficient players
      const playerCount = this.state.allPlayers.length;
      if (playerCount < 4) {
        return `
          <div class="no-schedule">
            <h3>Week ${this.state.selectedWeek.weekNumber} - ${this.formatDate(this.state.selectedWeek.date)}</h3>
            <div class="insufficient-players">
              <p>You need at least 4 players to generate a schedule.</p>
              <p>Current players: ${playerCount}</p>
              <p>Please add more players to continue.</p>
            </div>
          </div>
        `;
      }
      
      return `
        <div class="no-schedule">
          <h3>Week ${this.state.selectedWeek.weekNumber} - ${this.formatDate(this.state.selectedWeek.date)}</h3>
          <p>No schedule generated for this week yet.</p>
          <button class="btn btn-primary" onclick="scheduleDisplayUI.generateSchedule()">
            Generate Schedule
          </button>
        </div>
      `;
    }

    console.log('Has schedule, rendering schedule content');
    return `
      <div class="schedule-content">
        <div class="schedule-actions">
          <h3>Week ${this.state.selectedWeek.weekNumber} - ${this.formatDate(this.state.selectedWeek.date)}</h3>
          <div class="action-buttons">
            ${!this.state.isEditing ? `
              <button class="btn btn-secondary" onclick="scheduleDisplayUI.regenerateSchedule()">
                Regenerate
              </button>
              <button class="btn btn-outline" onclick="scheduleDisplayUI.enableEditing()">
                Edit Schedule
              </button>
              <button class="btn btn-primary" onclick="scheduleDisplayUI.showExportOptions()">
                Export
              </button>
            ` : `
              <button class="btn btn-secondary" onclick="scheduleDisplayUI.validateSchedule()">
                Validate
              </button>
              <button class="btn btn-primary" onclick="scheduleDisplayUI.saveChanges()"
                      ${this.state.validationResult && !this.state.validationResult.isValid ? 'disabled' : ''}>
                Save Changes
              </button>
              <button class="btn btn-outline" onclick="scheduleDisplayUI.cancelEditing()">
                Cancel
              </button>
            `}
            <button class="btn btn-outline ${this.state.showPlayerDistribution ? 'active' : ''}" onclick="scheduleDisplayUI.togglePlayerDistribution()">
              Player Distribution
            </button>
            <button class="btn btn-outline ${this.state.showPairingHistory ? 'active' : ''}" onclick="scheduleDisplayUI.togglePairingHistory()">
              Pairing History
            </button>
          </div>
        </div>

        ${this.state.hasUnsavedChanges ? `
          <div class="alert alert-warning">
            <strong>Unsaved Changes:</strong> You have made changes to this schedule. Don't forget to save!
          </div>
        ` : ''}

        ${this.state.validationResult ? this.renderValidationResult() : ''}

        ${this.state.isEditing ? `
          <div class="editing-instructions">
            <p><strong>Editing Mode:</strong> Drag and drop players between groups, or use the remove buttons to take players out of groups.</p>
          </div>
        ` : ''}

        ${this.state.showExportOptions ? this.renderExportOptions() : ''}

        ${this.state.showPlayerDistribution ? this.renderPlayerDistribution() : ''}

        ${this.state.showPairingHistory ? this.renderPairingHistory() : ''}

        <div class="schedule-grid ${this.state.isEditing ? 'editing-mode' : 'view-mode'}">
          ${this.renderTimeSlot('Morning (10:30 AM)', this.state.schedule.timeSlots.morning, 'morning')}
          ${this.renderTimeSlot('Afternoon (1:00 PM)', this.state.schedule.timeSlots.afternoon, 'afternoon')}
        </div>

        <div class="schedule-summary">
          ${this.renderScheduleSummary()}
        </div>

        ${this.renderAvailabilityStatus()}
      </div>
    `;
  }

  /**
   * Render export options
   */
  private renderExportOptions(): string {
    return `
      <div class="export-options">
        <h4>Export Schedule</h4>
        <div class="export-buttons">
          <button class="btn btn-sm btn-secondary" onclick="scheduleDisplayUI.exportSchedule('pdf')">
            Export as PDF
          </button>
          <button class="btn btn-sm btn-secondary" onclick="scheduleDisplayUI.exportSchedule('excel')">
            Export as Excel
          </button>
          <button class="btn btn-sm btn-secondary" onclick="scheduleDisplayUI.exportSchedule('csv')">
            Export as CSV
          </button>
          <button class="btn btn-sm btn-outline" onclick="scheduleDisplayUI.hideExportOptions()">
            Cancel
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Render a time slot with its foursomes
   */
  private renderTimeSlot(title: string, foursomes: Foursome[], timeSlot?: 'morning' | 'afternoon'): string {
    return `
      <div class="time-slot">
        <h4 class="time-slot-title">${title}</h4>
        <div class="foursomes ${this.state.isEditing ? 'editing-mode' : ''}"
             ${this.state.isEditing && timeSlot ? `
               ondragover="event.preventDefault()" 
               ondrop="scheduleDisplayUI.handleTimeSlotDrop(event, '${timeSlot}')"
             ` : ''}>
          ${foursomes.length === 0 ? `
            <div class="no-foursomes">
              <p>No players scheduled for this time slot</p>
            </div>
          ` : foursomes.map((foursome, index) => this.renderFoursome(foursome, index + 1)).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Render a single foursome
   */
  private renderFoursome(foursome: Foursome, position: number): string {
    return `
      <div class="foursome ${this.state.isEditing ? 'editable' : ''}"
           ${this.state.isEditing ? `
             ondragover="event.preventDefault()" 
             ondrop="scheduleDisplayUI.handleFoursomeDrop(event, '${foursome.id}')"
           ` : ''}>
        <div class="foursome-header">
          <h5>Group ${position}</h5>
          <span class="player-count">${foursome.players.length}/4 players</span>
        </div>
        <div class="foursome-players ${this.state.isEditing ? 'editing-mode' : ''}">
          ${foursome.players.map(player => this.renderPlayer(player, foursome.id)).join('')}
          ${this.state.isEditing ? Array(4 - foursome.players.length).fill(0).map((_, index) => `
            <div class="player-slot empty" key="empty-${index}">
              <span>Drop player here</span>
            </div>
          `).join('') : Array(4 - foursome.players.length).fill(0).map(() => `
            <div class="player-slot empty">
              <span>Empty slot</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Render a single player
   */
  private renderPlayer(player: Player, foursomeId?: string): string {
    return `
      <div class="player-slot filled ${this.state.isEditing ? 'draggable' : ''}"
           ${this.state.isEditing && foursomeId ? `
             draggable="true"
             ondragstart="scheduleDisplayUI.handlePlayerDragStart(event, '${player.id}', '${foursomeId}')"
           ` : ''}>
        <div class="player-info">
          <div class="player-name">${player.firstName} ${player.lastName}</div>
          <div class="player-details">
            <span class="handedness ${player.handedness}">${player.handedness.charAt(0).toUpperCase()}</span>
            <span class="preference ${player.timePreference.toLowerCase()}">${player.timePreference}</span>
          </div>
        </div>
        ${this.state.isEditing && foursomeId ? `
          <button class="remove-player-btn" onclick="scheduleDisplayUI.removePlayer('${player.id}', '${foursomeId}')"
                  title="Remove player from group">
            ×
          </button>
        ` : ''}
      </div>
    `;
  }

  /**
   * Render player distribution visualization
   */
  private renderPlayerDistribution(): string {
    if (!this.state.schedule) return '';

    const morningPlayers = this.state.schedule.timeSlots.morning.reduce((players, foursome) => {
      return players.concat(foursome.players);
    }, [] as Player[]);

    const afternoonPlayers = this.state.schedule.timeSlots.afternoon.reduce((players, foursome) => {
      return players.concat(foursome.players);
    }, [] as Player[]);

    // Analyze time preference distribution
    const morningPrefs = { AM: 0, PM: 0, Either: 0 };
    const afternoonPrefs = { AM: 0, PM: 0, Either: 0 };
    const morningHandedness = { left: 0, right: 0 };
    const afternoonHandedness = { left: 0, right: 0 };

    morningPlayers.forEach(player => {
      morningPrefs[player.timePreference]++;
      morningHandedness[player.handedness]++;
    });

    afternoonPlayers.forEach(player => {
      afternoonPrefs[player.timePreference]++;
      afternoonHandedness[player.handedness]++;
    });

    return `
      <div class="player-distribution-panel">
        <h4>Player Distribution Analysis</h4>
        <div class="distribution-grid">
          <div class="distribution-section">
            <h5>Time Slot Distribution</h5>
            <div class="distribution-stats">
              <div class="time-slot-stats">
                <div class="slot-stat">
                  <span class="slot-label">Morning</span>
                  <span class="slot-count">${morningPlayers.length} players</span>
                </div>
                <div class="slot-stat">
                  <span class="slot-label">Afternoon</span>
                  <span class="slot-count">${afternoonPlayers.length} players</span>
                </div>
              </div>
            </div>
          </div>

          <div class="distribution-section">
            <h5>Time Preference Compliance</h5>
            <div class="preference-compliance">
              <div class="compliance-slot">
                <h6>Morning Slot</h6>
                <div class="compliance-stats">
                  <span class="pref-stat am">AM: ${morningPrefs.AM}</span>
                  <span class="pref-stat pm">PM: ${morningPrefs.PM}</span>
                  <span class="pref-stat either">Either: ${morningPrefs.Either}</span>
                </div>
                ${morningPrefs.PM > 0 ? `<div class="conflict-indicator">⚠️ ${morningPrefs.PM} PM preference conflicts</div>` : ''}
              </div>
              <div class="compliance-slot">
                <h6>Afternoon Slot</h6>
                <div class="compliance-stats">
                  <span class="pref-stat am">AM: ${afternoonPrefs.AM}</span>
                  <span class="pref-stat pm">PM: ${afternoonPrefs.PM}</span>
                  <span class="pref-stat either">Either: ${afternoonPrefs.Either}</span>
                </div>
                ${afternoonPrefs.AM > 0 ? `<div class="conflict-indicator">⚠️ ${afternoonPrefs.AM} AM preference conflicts</div>` : ''}
              </div>
            </div>
          </div>

          <div class="distribution-section">
            <h5>Handedness Balance</h5>
            <div class="handedness-balance">
              <div class="balance-slot">
                <h6>Morning</h6>
                <div class="handedness-stats">
                  <span class="hand-stat left">Left: ${morningHandedness.left}</span>
                  <span class="hand-stat right">Right: ${morningHandedness.right}</span>
                </div>
              </div>
              <div class="balance-slot">
                <h6>Afternoon</h6>
                <div class="handedness-stats">
                  <span class="hand-stat left">Left: ${afternoonHandedness.left}</span>
                  <span class="hand-stat right">Right: ${afternoonHandedness.right}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render pairing history and optimization results
   */
  private renderPairingHistory(): string {
    if (!this.state.pairingMetrics || !this.state.schedule) return '';

    const { pairingCounts, minPairings, maxPairings, averagePairings } = this.state.pairingMetrics;
    
    // Get current schedule pairings for comparison
    const currentPairings = this.getCurrentSchedulePairings();

    return `
      <div class="pairing-history-panel">
        <h4>Pairing History & Optimization</h4>
        <div class="pairing-metrics">
          <div class="metrics-summary">
            <div class="metric">
              <span class="metric-label">Min Pairings</span>
              <span class="metric-value">${minPairings}</span>
            </div>
            <div class="metric">
              <span class="metric-label">Max Pairings</span>
              <span class="metric-value">${maxPairings}</span>
            </div>
            <div class="metric">
              <span class="metric-label">Average</span>
              <span class="metric-value">${averagePairings.toFixed(1)}</span>
            </div>
            <div class="metric">
              <span class="metric-label">Spread</span>
              <span class="metric-value">${maxPairings - minPairings}</span>
            </div>
          </div>

          <div class="optimization-status">
            ${this.renderOptimizationStatus(currentPairings, pairingCounts)}
          </div>

          <div class="current-pairings">
            <h5>This Week's New Pairings</h5>
            <div class="new-pairings-list">
              ${this.renderCurrentPairings(currentPairings, pairingCounts)}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Get current schedule pairings
   */
  private getCurrentSchedulePairings(): Set<string> {
    if (!this.state.schedule) return new Set();

    const pairings = new Set<string>();
    const allFoursomes = [...this.state.schedule.timeSlots.morning, ...this.state.schedule.timeSlots.afternoon];

    allFoursomes.forEach(foursome => {
      const players = foursome.players;
      for (let i = 0; i < players.length; i++) {
        for (let j = i + 1; j < players.length; j++) {
          const key = players[i].id < players[j].id 
            ? `${players[i].id}-${players[j].id}` 
            : `${players[j].id}-${players[i].id}`;
          pairings.add(key);
        }
      }
    });

    return pairings;
  }

  /**
   * Render optimization status
   */
  private renderOptimizationStatus(currentPairings: Set<string>, historicalPairings: Map<string, number>): string {
    let newPairings = 0;
    let repeatPairings = 0;
    let totalRepeatCount = 0;

    currentPairings.forEach(pairingKey => {
      const count = historicalPairings.get(pairingKey) || 0;
      if (count === 0) {
        newPairings++;
      } else {
        repeatPairings++;
        totalRepeatCount += count;
      }
    });

    const optimizationScore = newPairings / (newPairings + repeatPairings) * 100;

    return `
      <div class="optimization-metrics">
        <div class="optimization-score ${optimizationScore >= 80 ? 'excellent' : optimizationScore >= 60 ? 'good' : 'needs-improvement'}">
          <span class="score-label">Optimization Score</span>
          <span class="score-value">${optimizationScore.toFixed(0)}%</span>
        </div>
        <div class="pairing-breakdown">
          <div class="breakdown-item new">
            <span class="breakdown-label">New Pairings</span>
            <span class="breakdown-value">${newPairings}</span>
          </div>
          <div class="breakdown-item repeat">
            <span class="breakdown-label">Repeat Pairings</span>
            <span class="breakdown-value">${repeatPairings}</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render current pairings with history context
   */
  private renderCurrentPairings(currentPairings: Set<string>, historicalPairings: Map<string, number>): string {
    const pairingsList = Array.from(currentPairings).map(pairingKey => {
      const [playerId1, playerId2] = pairingKey.split('-');
      const player1 = this.state.allPlayers.find(p => p.id === playerId1);
      const player2 = this.state.allPlayers.find(p => p.id === playerId2);
      const count = historicalPairings.get(pairingKey) || 0;

      if (!player1 || !player2) return '';

      return `
        <div class="pairing-item ${count === 0 ? 'new-pairing' : 'repeat-pairing'}">
          <div class="pairing-players">
            <span class="player-name">${player1.firstName} ${player1.lastName}</span>
            <span class="pairing-connector">↔</span>
            <span class="player-name">${player2.firstName} ${player2.lastName}</span>
          </div>
          <div class="pairing-history">
            ${count === 0 
              ? '<span class="new-badge">NEW</span>' 
              : `<span class="repeat-badge">×${count + 1}</span>`
            }
          </div>
        </div>
      `;
    }).filter(item => item !== '');

    return pairingsList.length > 0 ? pairingsList.join('') : '<p class="no-pairings">No pairings in current schedule</p>';
  }

  /**
   * Render player availability status and conflicts
   */
  private renderAvailabilityStatus(): string {
    if (!this.state.selectedWeek) return '';

    const totalPlayers = this.state.allPlayers.length;
    const availableCount = this.state.availablePlayers.length;
    const unavailableCount = this.state.unavailablePlayers.length;
    const scheduledPlayers = this.state.schedule ? this.getScheduledPlayerIds(this.state.schedule) : [];

    // Find conflicts - players scheduled but not available
    const conflicts = scheduledPlayers.filter(playerId => 
      !this.state.availablePlayers.some(p => p.id === playerId)
    );

    return `
      <div class="availability-status-panel">
        <h4>Player Availability Status</h4>
        <div class="availability-overview">
          <div class="availability-stats">
            <div class="availability-stat available">
              <span class="stat-label">Available</span>
              <span class="stat-value">${availableCount}/${totalPlayers}</span>
            </div>
            <div class="availability-stat unavailable">
              <span class="stat-label">Unavailable</span>
              <span class="stat-value">${unavailableCount}/${totalPlayers}</span>
            </div>
            <div class="availability-stat scheduled">
              <span class="stat-label">Scheduled</span>
              <span class="stat-value">${scheduledPlayers.length}</span>
            </div>
          </div>

          ${conflicts.length > 0 ? `
            <div class="availability-conflicts">
              <h5>⚠️ Scheduling Conflicts</h5>
              <p class="conflict-description">The following players are scheduled but marked as unavailable:</p>
              <div class="conflict-list">
                ${conflicts.map(playerId => {
                  const player = this.state.allPlayers.find(p => p.id === playerId);
                  return player ? `<span class="conflict-player">${player.firstName} ${player.lastName}</span>` : '';
                }).filter(item => item !== '').join('')}
              </div>
            </div>
          ` : ''}

          <div class="availability-details">
            <div class="available-players">
              <h5>Available Players (${availableCount})</h5>
              <div class="player-list available-list">
                ${this.state.availablePlayers.map(player => `
                  <div class="player-item available ${scheduledPlayers.includes(player.id) ? 'scheduled' : 'unscheduled'}">
                    <span class="player-name">${player.firstName} ${player.lastName}</span>
                    <div class="player-badges">
                      <span class="handedness-badge ${player.handedness}">${player.handedness.charAt(0).toUpperCase()}</span>
                      <span class="preference-badge ${player.timePreference.toLowerCase()}">${player.timePreference}</span>
                      ${scheduledPlayers.includes(player.id) ? '<span class="scheduled-badge">Scheduled</span>' : '<span class="unscheduled-badge">Not Scheduled</span>'}
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>

            ${unavailableCount > 0 ? `
              <div class="unavailable-players">
                <h5>Unavailable Players (${unavailableCount})</h5>
                <div class="player-list unavailable-list">
                  ${this.state.unavailablePlayers.map(player => `
                    <div class="player-item unavailable">
                      <span class="player-name">${player.firstName} ${player.lastName}</span>
                      <div class="player-badges">
                        <span class="handedness-badge ${player.handedness}">${player.handedness.charAt(0).toUpperCase()}</span>
                        <span class="preference-badge ${player.timePreference.toLowerCase()}">${player.timePreference}</span>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render schedule summary statistics
   */
  private renderScheduleSummary(): string {
    if (!this.state.schedule) return '';

    const morningPlayers = this.state.schedule.timeSlots.morning.reduce((sum, f) => sum + f.players.length, 0);
    const afternoonPlayers = this.state.schedule.timeSlots.afternoon.reduce((sum, f) => sum + f.players.length, 0);
    const totalPlayers = morningPlayers + afternoonPlayers;
    const morningGroups = this.state.schedule.timeSlots.morning.length;
    const afternoonGroups = this.state.schedule.timeSlots.afternoon.length;

    return `
      <div class="summary-stats">
        <h4>Schedule Summary</h4>
        <div class="stats-grid">
          <div class="stat">
            <span class="stat-label">Total Players</span>
            <span class="stat-value">${totalPlayers}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Morning Players</span>
            <span class="stat-value">${morningPlayers}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Afternoon Players</span>
            <span class="stat-value">${afternoonPlayers}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Morning Groups</span>
            <span class="stat-value">${morningGroups}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Afternoon Groups</span>
            <span class="stat-value">${afternoonGroups}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Total Groups</span>
            <span class="stat-value">${morningGroups + afternoonGroups}</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Get all player IDs from the current schedule
   */
  private getScheduledPlayerIds(schedule: Schedule): string[] {
    const playerIds = new Set<string>();
    
    [...schedule.timeSlots.morning, ...schedule.timeSlots.afternoon].forEach(foursome => {
      foursome.players.forEach(player => {
        playerIds.add(player.id);
      });
    });

    return Array.from(playerIds);
  }

  /**
   * Format date for display
   */
  private formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  }

  /**
   * Attach event listeners
   */
  private attachEventListeners(): void {
    // Week selector
    const weekSelect = this.container.querySelector('#week-select') as HTMLSelectElement;
    if (weekSelect) {
      weekSelect.addEventListener('change', async (e) => {
        const selectedWeekId = (e.target as HTMLSelectElement).value;
        this.state.selectedWeek = this.state.weeks.find(w => w.id === selectedWeekId) || null;
        await this.loadScheduleForSelectedWeek();
        this.render();
      });
    }

    // Bind methods to window for onclick handlers
    (window as any).scheduleDisplayUI = {
      ...this,
      // Core schedule methods
      createFirstWeek: () => this.createFirstWeek(),
      addNewWeek: () => this.addNewWeek(),
      generateSchedule: () => this.generateSchedule(),
      regenerateSchedule: () => this.regenerateSchedule(),
      // UI toggle methods
      showAddWeekForm: () => this.showAddWeekForm(),
      hideAddWeekForm: () => this.hideAddWeekForm(),
      showExportOptions: () => this.showExportOptions(),
      hideExportOptions: () => this.hideExportOptions(),
      togglePlayerDistribution: () => this.togglePlayerDistribution(),
      togglePairingHistory: () => this.togglePairingHistory(),
      // Export methods
      exportSchedule: (format: 'pdf' | 'excel' | 'csv') => this.exportSchedule(format),
      // Editing methods
      enableEditing: () => this.enableEditing(),
      cancelEditing: () => this.cancelEditing(),
      saveChanges: () => this.saveChanges(),
      validateSchedule: () => this.validateSchedule(),
      handlePlayerDragStart: (event: DragEvent, playerId: string, foursomeId: string) => {
        const player = this.findPlayerById(playerId);
        if (player) {
          this.handleDragStart(player, foursomeId);
          if (event.dataTransfer) {
            event.dataTransfer.setData('text/plain', playerId);
          }
        }
      },
      handleFoursomeDrop: (event: DragEvent, foursomeId: string) => {
        event.preventDefault();
        this.handleDrop(foursomeId);
      },
      handleTimeSlotDrop: (event: DragEvent, _timeSlot: 'morning' | 'afternoon') => {
        event.preventDefault();
        // For now, we'll just clear the drag state if dropped on empty time slot
        this.clearDragState();
      },
      removePlayer: (playerId: string, foursomeId: string) => {
        if (confirm('Are you sure you want to remove this player from the group?')) {
          this.removePlayer(playerId, foursomeId);
        }
      }
    };
  }

  /**
   * Render validation results
   */
  private renderValidationResult(): string {
    if (!this.state.validationResult) return '';

    const { isValid, errors, warnings } = this.state.validationResult;

    return `
      <div class="validation-result">
        <div class="validation-status ${isValid ? 'valid' : 'invalid'}">
          <strong>${isValid ? '✓ Schedule is valid' : '✗ Schedule has errors'}</strong>
        </div>
        
        ${errors.length > 0 ? `
          <div class="validation-errors">
            <h4>Errors:</h4>
            <ul>
              ${errors.map((error: string) => `<li>${error}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
        
        ${warnings.length > 0 ? `
          <div class="validation-warnings">
            <h4>Warnings:</h4>
            <ul>
              ${warnings.map((warning: string) => `<li>${warning}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
      </div>
    `;
  }

  /**
   * Get the current schedule
   */
  getCurrentSchedule(): Schedule | null {
    return this.state.schedule;
  }

  /**
   * Get the selected week
   */
  getSelectedWeek(): Week | null {
    return this.state.selectedWeek;
  }

  /**
   * Refresh the display
   */
  async refresh(): Promise<void> {
    await this.loadWeeks();
    await this.loadPlayers(); // Add this line to refresh player data
    if (this.state.selectedWeek) {
      await this.loadScheduleForSelectedWeek();
    }
    this.render();
  }

  /**
   * Cleanup resources when component is destroyed
   */
  destroy(): void {
    // Stop any ongoing status tracking
    this.stopRegenerationStatusTracking();

    // Cleanup UI components
    if (this.progressTrackingUI) {
      this.progressTrackingUI.destroy();
    }

    if (this.operationLockUI) {
      this.operationLockUI.destroy();
    }

    if (this.confirmationUI) {
      this.confirmationUI.destroy();
    }
  }

  /**
   * Show regeneration confirmation dialog
   */
  private async showRegenerationConfirmation(): Promise<void> {
    if (!this.state.selectedWeek || !this.state.schedule) {
      this.state.error = 'No schedule selected for regeneration';
      this.render();
      return;
    }

    // Check if regeneration is allowed (but don't set lock yet)
    const isAllowed = await this.scheduleManager.isRegenerationAllowed(this.state.selectedWeek.id);
    if (!isAllowed) {
      this.state.error = 'Regeneration is already in progress for this week';
      this.render();
      return;
    }

    try {
      // Show confirmation dialog WITHOUT setting the lock first
      // The lock will be set only after user confirms
      await this.confirmationUI.showConfirmation(
        this.state.schedule,
        this.state.selectedWeek,
        this.state.allPlayers,
        (result: ConfirmationResult) => this.handleRegenerationConfirmation(result),
        () => this.handleRegenerationCancellation()
      );

    } catch (error) {
      this.state.error = error instanceof Error ? error.message : 'Failed to show regeneration confirmation';
      this.render();
    }
  }

  /**
   * Handle regeneration confirmation
   */
  private async handleRegenerationConfirmation(result: ConfirmationResult): Promise<void> {
    if (!this.state.selectedWeek) return;

    try {
      // Set regeneration lock ONLY after user confirms
      await this.scheduleManager.setRegenerationLock(this.state.selectedWeek.id, true);

      // Show progress tracking with detailed steps
      this.showRegenerationProgress();

      const regenerationResult = await this.scheduleManager.regenerateSchedule(
        this.state.selectedWeek.id,
        {
          forceOverwrite: result.forceOverwrite,
          preserveManualEdits: result.preserveManualEdits
        }
      );

      if (regenerationResult.success && regenerationResult.newScheduleId) {
        // Reload the schedule to get the updated version
        await this.loadScheduleForSelectedWeek();
        
        if (this.onScheduleGenerated && this.state.schedule) {
          this.onScheduleGenerated(this.state.schedule);
        }

        // Show success message with changes detected
        this.showRegenerationSuccess(regenerationResult);
        
        // Hide progress with success state
        this.progressTrackingUI.showCompletion(true, 'Schedule regenerated successfully!');
      } else {
        this.state.error = regenerationResult.error || 'Regeneration failed';
        
        // Show error notification
        applicationState.addNotification({
          type: 'error',
          title: 'Regeneration Failed',
          message: this.state.error,
          autoHide: false
        });

        // Hide progress with error state
        this.progressTrackingUI.showCompletion(false, 'Schedule regeneration failed');
      }

    } catch (error) {
      this.state.error = error instanceof Error ? error.message : 'Failed to regenerate schedule';
      
      // Show error notification
      applicationState.addNotification({
        type: 'error',
        title: 'Regeneration Error',
        message: this.state.error,
        autoHide: false
      });

      // Hide progress with error state
      this.progressTrackingUI.showCompletion(false, 'An error occurred during regeneration');
    } finally {
      this.state.isGenerating = false;
      this.operationLockUI.unlockUI();
      this.stopRegenerationStatusTracking();
      
      // Always release regeneration lock in finally block
      if (this.state.selectedWeek) {
        try {
          await this.scheduleManager.setRegenerationLock(this.state.selectedWeek.id, false);
        } catch (lockError) {
          console.warn('Failed to release regeneration lock:', lockError);
          // Don't throw - we don't want to mask the original error
        }
      }
      this.render();
    }
  }

  /**
   * Handle regeneration cancellation
   */
  private async handleRegenerationCancellation(): Promise<void> {
    // Since we no longer set the lock before confirmation,
    // we don't need to clear it on cancellation
    // This method is kept for consistency and future extensibility
    console.log('Regeneration cancelled by user');
  }

  /**
   * Show regeneration success message
   */
  private showRegenerationSuccess(result: any): void {
    const changes = result.changesDetected;
    let message = 'Schedule regenerated successfully!';
    
    if (changes.playersAdded.length > 0 || changes.playersRemoved.length > 0) {
      message += ` Players added: ${changes.playersAdded.length}, removed: ${changes.playersRemoved.length}.`;
    }
    
    if (changes.pairingChanges > 0) {
      message += ` ${changes.pairingChanges} pairing changes detected.`;
    }

    // Show success notification with detailed information
    applicationState.addNotification({
      type: 'success',
      title: 'Schedule Regenerated',
      message: message,
      autoHide: true,
      duration: 5000
    });

    // For now, just clear any existing error to show success
    // In a real implementation, you might want a proper notification system
    this.state.error = null;
    console.log(message);
  }

  /**
   * Show progress tracking for schedule generation
   */
  private showGenerationProgress(title: string, initialMessage: string): void {
    this.state.isGenerating = true;
    this.state.error = null;

    // Lock UI to prevent other operations
    this.operationLockUI.lockUI({
      message: 'Please wait while the schedule is being generated',
      operationType: 'Schedule Generation',
      allowedActions: ['.progress-cancel'] // Allow cancel button if present
    });

    // Show progress tracking
    this.progressTrackingUI.showProgress({
      title: title,
      showPercentage: true,
      showCurrentStep: true,
      showElapsedTime: true,
      allowCancel: false
    });

    this.render();
  }

  /**
   * Show progress tracking for schedule regeneration with status monitoring
   */
  private showRegenerationProgress(): void {
    if (!this.state.selectedWeek) return;

    this.state.isGenerating = true;
    this.state.error = null;

    // Lock UI to prevent other operations
    this.operationLockUI.lockUI({
      message: 'Please wait while the schedule is being regenerated',
      operationType: 'Schedule Regeneration',
      allowedActions: ['.progress-cancel'] // Allow cancel button if present
    });

    // Show progress tracking
    this.progressTrackingUI.showProgress({
      title: `Regenerating Week ${this.state.selectedWeek.weekNumber} Schedule`,
      showPercentage: true,
      showCurrentStep: true,
      showElapsedTime: true,
      allowCancel: false
    });

    // Start monitoring regeneration status
    this.startRegenerationStatusTracking();

    this.render();
  }

  /**
   * Start tracking regeneration status and updating progress
   */
  private startRegenerationStatusTracking(): void {
    if (!this.state.selectedWeek || this.regenerationStatusInterval) return;

    this.regenerationStatusInterval = window.setInterval(() => {
      if (!this.state.selectedWeek) {
        this.stopRegenerationStatusTracking();
        return;
      }

      const status = this.scheduleManager.getRegenerationStatus(this.state.selectedWeek.id);
      if (status) {
        // Update progress tracking with current status
        this.progressTrackingUI.updateProgress(status, {
          title: `Regenerating Week ${this.state.selectedWeek.weekNumber} Schedule`,
          showPercentage: true,
          showCurrentStep: true,
          showElapsedTime: true,
          allowCancel: false
        });

        // Update operation lock message based on current step
        this.operationLockUI.updateLockMessage(
          `${status.currentStep} (${Math.round(status.progress)}%)`
        );

        // Stop tracking if operation is complete
        if (status.status === 'completed' || status.status === 'failed') {
          this.stopRegenerationStatusTracking();
        }
      }
    }, 500); // Update every 500ms for smooth progress
  }

  /**
   * Stop tracking regeneration status
   */
  private stopRegenerationStatusTracking(): void {
    if (this.regenerationStatusInterval) {
      clearInterval(this.regenerationStatusInterval);
      this.regenerationStatusInterval = null;
    }
  }

  // ===== UI TOGGLE METHODS =====

  /**
   * Show the add week form
   */
  private showAddWeekForm(): void {
    this.state.showAddWeekForm = true;
    this.render();
  }

  /**
   * Hide the add week form
   */
  private hideAddWeekForm(): void {
    this.state.showAddWeekForm = false;
    this.render();
  }

  /**
   * Show export options
   */
  private showExportOptions(): void {
    this.state.showExportOptions = true;
    this.render();
  }

  /**
   * Hide export options
   */
  private hideExportOptions(): void {
    this.state.showExportOptions = false;
    this.render();
  }

  /**
   * Toggle player distribution display
   */
  private togglePlayerDistribution(): void {
    this.state.showPlayerDistribution = !this.state.showPlayerDistribution;
    this.render();
  }

  /**
   * Toggle pairing history display
   */
  private togglePairingHistory(): void {
    this.state.showPairingHistory = !this.state.showPairingHistory;
    this.render();
  }

  /**
   * Regenerate the current schedule
   */
  private async regenerateSchedule(): Promise<void> {
    await this.showRegenerationConfirmation();
  }

  // ===== SCHEDULE EDITING METHODS =====

  /**
   * Enable editing mode
   */
  private enableEditing(): void {
    this.state.isEditing = true;
    this.render();
  }

  /**
   * Cancel editing and revert changes
   */
  private cancelEditing(): void {
    if (this.state.hasUnsavedChanges) {
      if (!confirm('You have unsaved changes. Are you sure you want to cancel?')) {
        return;
      }
    }
    
    this.state.isEditing = false;
    this.state.hasUnsavedChanges = false;
    this.state.validationResult = null;
    this.state.error = null;
    this.render();
  }

  /**
   * Save changes to the schedule
   */
  private async saveChanges(): Promise<void> {
    if (!this.state.schedule || !this.state.selectedWeek) return;

    try {
      const updatedSchedule = await this.scheduleManager.updateSchedule(
        this.state.selectedWeek.id, 
        this.state.schedule
      );
      
      this.state.schedule = updatedSchedule;
      this.state.isEditing = false;
      this.state.hasUnsavedChanges = false;
      this.state.validationResult = null;
      this.state.error = null;
      
      // Show success notification
      applicationState.addNotification({
        type: 'success',
        title: 'Schedule Updated',
        message: 'Schedule changes have been saved successfully.',
        autoHide: true,
        duration: 3000
      });
      
      this.render();
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : 'Failed to save changes';
      this.render();
    }
  }

  /**
   * Validate the current schedule
   */
  private async validateSchedule(): Promise<void> {
    if (!this.state.schedule || !this.state.selectedWeek) return;

    try {
      const validation = await this.scheduleManager.validateManualEdit(
        this.state.selectedWeek.id,
        this.state.schedule
      );
      
      this.state.validationResult = validation;
      this.render();
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : 'Failed to validate schedule';
      this.render();
    }
  }

  /**
   * Handle drag start event
   */
  private handleDragStart(player: Player, foursomeId: string): void {
    this.state.draggedPlayer = player;
    this.state.draggedFromFoursome = foursomeId;
  }

  /**
   * Handle drop event
   */
  private async handleDrop(targetFoursomeId: string): Promise<void> {
    if (!this.state.draggedPlayer || !this.state.draggedFromFoursome || !this.state.selectedWeek) {
      return;
    }

    // Don't do anything if dropping on the same foursome
    if (this.state.draggedFromFoursome === targetFoursomeId) {
      this.clearDragState();
      return;
    }

    try {
      const operation = {
        type: 'move_player' as const,
        playerId: this.state.draggedPlayer.id,
        fromFoursomeId: this.state.draggedFromFoursome,
        toFoursomeId: targetFoursomeId
      };

      await this.scheduleManager.applyManualEdit(this.state.selectedWeek.id, operation);
      
      // Reload the schedule to get the updated version
      const updatedSchedule = await this.scheduleManager.getSchedule(this.state.selectedWeek.id);
      if (updatedSchedule) {
        this.state.schedule = updatedSchedule;
        this.state.hasUnsavedChanges = true;
      }
      
      this.clearDragState();
      this.render();
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : 'Failed to move player';
      this.clearDragState();
      this.render();
    }
  }

  /**
   * Clear drag state
   */
  private clearDragState(): void {
    this.state.draggedPlayer = null;
    this.state.draggedFromFoursome = null;
  }

  /**
   * Remove a player from their current foursome
   */
  private async removePlayer(playerId: string, foursomeId: string): Promise<void> {
    if (!this.state.selectedWeek) return;

    try {
      const operation = {
        type: 'remove_player' as const,
        playerId,
        fromFoursomeId: foursomeId
      };

      await this.scheduleManager.applyManualEdit(this.state.selectedWeek.id, operation);
      
      // Reload the schedule
      const updatedSchedule = await this.scheduleManager.getSchedule(this.state.selectedWeek.id);
      if (updatedSchedule) {
        this.state.schedule = updatedSchedule;
        this.state.hasUnsavedChanges = true;
      }
      
      this.render();
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : 'Failed to remove player';
      this.render();
    }
  }

  /**
   * Find a player by ID in the current schedule
   */
  private findPlayerById(playerId: string): Player | null {
    if (!this.state.schedule) return null;

    const allFoursomes = [
      ...this.state.schedule.timeSlots.morning,
      ...this.state.schedule.timeSlots.afternoon
    ];

    for (const foursome of allFoursomes) {
      const player = foursome.players.find(p => p.id === playerId);
      if (player) return player;
    }

    return null;
  }
}