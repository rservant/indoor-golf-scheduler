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
  // Enhanced error handling and loading states
  errorDetails: ErrorDetails | null;
  loadingStates: LoadingStates;
  operationHistory: OperationHistoryEntry[];
}

export interface ErrorDetails {
  message: string;
  type: 'generation' | 'loading' | 'validation' | 'export' | 'network' | 'unknown';
  timestamp: Date;
  context?: string;
  recoveryActions?: RecoveryAction[];
  technicalDetails?: string;
}

export interface RecoveryAction {
  label: string;
  action: () => Promise<void>;
  type: 'primary' | 'secondary';
}

export interface LoadingStates {
  isLoadingWeeks: boolean;
  isLoadingPlayers: boolean;
  isLoadingSchedule: boolean;
  isLoadingAvailability: boolean;
  isGeneratingSchedule: boolean;
  isExporting: boolean;
  isSaving: boolean;
  isValidating: boolean;
  currentOperation: string | null;
  operationProgress: number;
}

export interface OperationHistoryEntry {
  id: string;
  operation: string;
  timestamp: Date;
  status: 'success' | 'error' | 'in_progress';
  duration?: number;
  error?: string;
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
      validationResult: null,
      // Enhanced error handling and loading states
      errorDetails: null,
      loadingStates: {
        isLoadingWeeks: false,
        isLoadingPlayers: false,
        isLoadingSchedule: false,
        isLoadingAvailability: false,
        isGeneratingSchedule: false,
        isExporting: false,
        isSaving: false,
        isValidating: false,
        currentOperation: null,
        operationProgress: 0
      },
      operationHistory: []
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
   * Enhanced error handling with detailed error information and recovery actions
   */
  private handleError(error: unknown, context: string, type: ErrorDetails['type'] = 'unknown'): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Create detailed error information
    const technicalDetails = error instanceof Error ? error.stack : undefined;
    const errorDetails: ErrorDetails = {
      message: errorMessage,
      type,
      timestamp: new Date(),
      context,
      recoveryActions: this.getRecoveryActions(type, context)
    };
    
    if (technicalDetails) {
      errorDetails.technicalDetails = technicalDetails;
    }

    this.state.errorDetails = errorDetails;
    this.state.error = errorMessage; // Keep backward compatibility

    // Log operation history
    this.addOperationHistoryEntry({
      operation: context,
      status: 'error',
      error: errorMessage
    });

    // Show appropriate notification
    applicationState.addNotification({
      type: 'error',
      title: this.getErrorTitle(type),
      message: errorMessage,
      autoHide: type !== 'generation', // Keep generation errors visible
      duration: type === 'network' ? 8000 : 5000
    });

    console.error(`ScheduleDisplayUI Error [${type}] in ${context}:`, error);
  }

  /**
   * Get appropriate recovery actions based on error type and context
   */
  private getRecoveryActions(type: ErrorDetails['type'], context: string): RecoveryAction[] {
    const actions: RecoveryAction[] = [];

    switch (type) {
      case 'generation':
        actions.push({
          label: 'Retry Generation',
          action: () => this.generateSchedule(),
          type: 'primary'
        });
        if (this.state.selectedWeek) {
          actions.push({
            label: 'Check Player Availability',
            action: () => this.loadPlayerAvailability(),
            type: 'secondary'
          });
        }
        break;

      case 'loading':
        actions.push({
          label: 'Refresh Data',
          action: () => this.refresh(),
          type: 'primary'
        });
        break;

      case 'network':
        actions.push({
          label: 'Retry Connection',
          action: () => this.refresh(),
          type: 'primary'
        });
        break;

      case 'validation':
        actions.push({
          label: 'Fix Issues',
          action: async () => this.enableEditing(),
          type: 'primary'
        });
        break;

      default:
        actions.push({
          label: 'Refresh Page',
          action: async () => window.location.reload(),
          type: 'secondary'
        });
    }

    return actions;
  }

  /**
   * Get user-friendly error title based on error type
   */
  private getErrorTitle(type: ErrorDetails['type']): string {
    switch (type) {
      case 'generation': return 'Schedule Generation Failed';
      case 'loading': return 'Data Loading Failed';
      case 'validation': return 'Validation Error';
      case 'export': return 'Export Failed';
      case 'network': return 'Connection Error';
      default: return 'An Error Occurred';
    }
  }

  /**
   * Clear current error state
   */
  private clearError(): void {
    this.state.error = null;
    this.state.errorDetails = null;
  }

  /**
   * Set loading state for specific operation
   */
  private setLoadingState(operation: keyof Omit<LoadingStates, 'currentOperation' | 'operationProgress'>, isLoading: boolean, operationName?: string): void {
    (this.state.loadingStates as any)[operation] = isLoading;
    
    if (isLoading && operationName) {
      this.state.loadingStates.currentOperation = operationName;
      this.state.loadingStates.operationProgress = 0;
    } else if (!isLoading) {
      // Check if any operations are still loading
      const stillLoading = Object.entries(this.state.loadingStates)
        .filter(([key]) => key !== 'currentOperation' && key !== 'operationProgress')
        .some(([, value]) => value === true);
      
      if (!stillLoading) {
        this.state.loadingStates.currentOperation = null;
        this.state.loadingStates.operationProgress = 0;
      }
    }
  }

  /**
   * Update operation progress
   */
  private updateOperationProgress(progress: number): void {
    this.state.loadingStates.operationProgress = Math.max(0, Math.min(100, progress));
  }

  /**
   * Add entry to operation history
   */
  private addOperationHistoryEntry(entry: Omit<OperationHistoryEntry, 'id' | 'timestamp'>): void {
    const historyEntry: OperationHistoryEntry = {
      id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      ...entry
    };

    this.state.operationHistory.unshift(historyEntry);
    
    // Keep only last 50 entries
    if (this.state.operationHistory.length > 50) {
      this.state.operationHistory = this.state.operationHistory.slice(0, 50);
    }
  }

  /**
   * Complete operation in history
   */
  private completeOperation(operationId: string, success: boolean, duration?: number): void {
    const entry = this.state.operationHistory.find(op => op.id === operationId);
    if (entry) {
      entry.status = success ? 'success' : 'error';
      if (duration !== undefined) {
        entry.duration = duration;
      }
    }
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

    const operationId = `load_weeks_${Date.now()}`;
    this.addOperationHistoryEntry({
      operation: 'Loading weeks',
      status: 'in_progress'
    });

    this.setLoadingState('isLoadingWeeks', true, 'Loading weeks...');
    this.clearError();

    try {
      this.updateOperationProgress(25);
      this.state.weeks = await this.weekRepository.findBySeasonId(this.state.activeSeason.id);
      
      this.updateOperationProgress(50);
      this.state.weeks.sort((a, b) => a.weekNumber - b.weekNumber);
      
      this.updateOperationProgress(75);
      // Select the first week if none selected
      if (this.state.weeks.length > 0 && !this.state.selectedWeek) {
        this.state.selectedWeek = this.state.weeks[0];
        await this.loadScheduleForSelectedWeek();
        await this.loadPlayerAvailability();
        await this.loadPairingMetrics();
      }
      
      this.updateOperationProgress(100);
      this.completeOperation(operationId, true);
      
    } catch (error) {
      this.handleError(error, 'Loading weeks', 'loading');
      this.completeOperation(operationId, false);
    } finally {
      this.setLoadingState('isLoadingWeeks', false);
    }
  }

  /**
   * Load all players for the active season
   */
  private async loadPlayers(): Promise<void> {
    if (!this.state.activeSeason) return;

    const operationId = `load_players_${Date.now()}`;
    this.addOperationHistoryEntry({
      operation: 'Loading players',
      status: 'in_progress'
    });

    this.setLoadingState('isLoadingPlayers', true, 'Loading players...');

    try {
      this.updateOperationProgress(50);
      this.state.allPlayers = await this.playerManager.getAllPlayers(this.state.activeSeason.id);
      this.updateOperationProgress(100);
      this.completeOperation(operationId, true);
    } catch (error) {
      this.handleError(error, 'Loading players', 'loading');
      this.completeOperation(operationId, false);
    } finally {
      this.setLoadingState('isLoadingPlayers', false);
    }
  }

  /**
   * Load player availability for the selected week
   */
  private async loadPlayerAvailability(): Promise<void> {
    if (!this.state.selectedWeek || !this.state.activeSeason) return;

    const operationId = `load_availability_${Date.now()}`;
    this.addOperationHistoryEntry({
      operation: 'Loading player availability',
      status: 'in_progress'
    });

    this.setLoadingState('isLoadingAvailability', true, 'Loading player availability...');

    try {
      const availablePlayers: Player[] = [];
      const unavailablePlayers: Player[] = [];

      const totalPlayers = this.state.allPlayers.length;
      for (let i = 0; i < totalPlayers; i++) {
        const player = this.state.allPlayers[i];
        this.updateOperationProgress((i / totalPlayers) * 100);
        
        const isAvailable = await this.playerManager.getPlayerAvailability(player.id, this.state.selectedWeek.id);
        if (isAvailable) {
          availablePlayers.push(player);
        } else {
          unavailablePlayers.push(player);
        }
      }

      this.state.availablePlayers = availablePlayers;
      this.state.unavailablePlayers = unavailablePlayers;
      this.completeOperation(operationId, true);
    } catch (error) {
      this.handleError(error, 'Loading player availability', 'loading');
      this.completeOperation(operationId, false);
    } finally {
      this.setLoadingState('isLoadingAvailability', false);
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
      
      // Set all players as available for the new week
      console.log('Setting player availability for week:', newWeek.id);
      const allPlayers = await this.playerManager.getAllPlayers(this.state.activeSeason.id);
      console.log(`Setting availability for ${allPlayers.length} players`);
      
      for (const player of allPlayers) {
        await this.weekRepository.setPlayerAvailability(newWeek.id, player.id, true);
      }
      console.log('All players set as available');
      
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

    const operationId = `generate_schedule_${Date.now()}`;
    this.addOperationHistoryEntry({
      operation: `Generating schedule for Week ${this.state.selectedWeek.weekNumber}`,
      status: 'in_progress'
    });

    // Show progress tracking
    this.showGenerationProgress('Generating Schedule', 'Creating new schedule...');
    this.setLoadingState('isGeneratingSchedule', true, `Generating Week ${this.state.selectedWeek.weekNumber} schedule...`);

    try {
      this.updateOperationProgress(25);
      
      // Pre-generation validation
      if (this.state.allPlayers.length < 4) {
        throw new Error(`Insufficient players for schedule generation. Need at least 4 players, but only ${this.state.allPlayers.length} available.`);
      }

      this.updateOperationProgress(50);
      const schedule = await this.scheduleManager.createWeeklySchedule(this.state.selectedWeek.id);
      
      this.updateOperationProgress(75);
      this.state.schedule = schedule;
      
      if (this.onScheduleGenerated) {
        this.onScheduleGenerated(schedule);
      }

      this.updateOperationProgress(100);

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
      this.completeOperation(operationId, true);

    } catch (error) {
      this.handleError(error, `Generating schedule for Week ${this.state.selectedWeek.weekNumber}`, 'generation');
      
      // Hide progress with error state
      this.progressTrackingUI.showCompletion(false, 'Schedule generation failed');
      this.completeOperation(operationId, false);
    } finally {
      this.state.isGenerating = false;
      this.setLoadingState('isGeneratingSchedule', false);
      this.operationLockUI.unlockUI();
      this.render();
    }
  }

  /**
   * Export the current schedule
   */
  private async exportSchedule(format: 'pdf' | 'csv'): Promise<void> {
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
   * Render enhanced error display with recovery actions
   */
  private renderErrorDisplay(): string {
    if (!this.state.errorDetails && !this.state.error) return '';

    const errorDetails = this.state.errorDetails;
    const errorMessage = errorDetails?.message || this.state.error || 'An unknown error occurred';
    const errorType = errorDetails?.type || 'unknown';

    return `
      <div class="alert alert-error enhanced-error">
        <div class="error-header">
          <div class="error-icon">
            ${this.getErrorIcon(errorType)}
          </div>
          <div class="error-title">
            <h4>${this.getErrorTitle(errorType)}</h4>
            <span class="error-timestamp">
              ${errorDetails?.timestamp ? this.formatTimestamp(errorDetails.timestamp) : 'Just now'}
            </span>
          </div>
          <button class="error-dismiss" onclick="scheduleDisplayUI.dismissError()" title="Dismiss error">
            ×
          </button>
        </div>
        
        <div class="error-message">
          ${errorMessage}
        </div>

        ${errorDetails?.context ? `
          <div class="error-context">
            <strong>Context:</strong> ${errorDetails.context}
          </div>
        ` : ''}

        ${errorDetails?.recoveryActions && errorDetails.recoveryActions.length > 0 ? `
          <div class="error-actions">
            <span class="error-actions-label">Try these actions:</span>
            <div class="error-action-buttons">
              ${errorDetails.recoveryActions.map((action, index) => `
                <button class="btn btn-${action.type === 'primary' ? 'primary' : 'secondary'} btn-sm" 
                        onclick="scheduleDisplayUI.executeRecoveryAction(${index})">
                  ${action.label}
                </button>
              `).join('')}
            </div>
          </div>
        ` : ''}

        ${errorDetails?.technicalDetails ? `
          <details class="error-technical-details">
            <summary>Technical Details</summary>
            <pre class="error-stack">${errorDetails.technicalDetails}</pre>
          </details>
        ` : ''}
      </div>
    `;
  }

  /**
   * Render loading indicator with current operation status
   */
  private renderLoadingIndicator(): string {
    const { loadingStates } = this.state;
    const hasActiveLoading = Object.entries(loadingStates)
      .filter(([key]) => key !== 'currentOperation' && key !== 'operationProgress')
      .some(([, value]) => value === true);

    if (!hasActiveLoading) return '';

    return `
      <div class="loading-indicator">
        <div class="loading-header">
          <div class="loading-spinner"></div>
          <div class="loading-text">
            <span class="loading-operation">
              ${loadingStates.currentOperation || 'Loading...'}
            </span>
            ${loadingStates.operationProgress > 0 ? `
              <span class="loading-progress-text">
                ${Math.round(loadingStates.operationProgress)}%
              </span>
            ` : ''}
          </div>
        </div>
        
        ${loadingStates.operationProgress > 0 ? `
          <div class="loading-progress-bar">
            <div class="loading-progress-fill" 
                 style="width: ${loadingStates.operationProgress}%"></div>
          </div>
        ` : ''}

        <div class="loading-details">
          ${this.renderActiveLoadingStates()}
        </div>
      </div>
    `;
  }

  /**
   * Render active loading states
   */
  private renderActiveLoadingStates(): string {
    const { loadingStates } = this.state;
    const activeStates = Object.entries(loadingStates)
      .filter(([key, value]) => 
        key !== 'currentOperation' && 
        key !== 'operationProgress' && 
        value === true
      )
      .map(([key]) => this.getLoadingStateLabel(key));

    if (activeStates.length === 0) return '';

    return `
      <div class="active-loading-states">
        ${activeStates.map(label => `
          <span class="loading-state-badge">${label}</span>
        `).join('')}
      </div>
    `;
  }

  /**
   * Get user-friendly label for loading state
   */
  private getLoadingStateLabel(key: string): string {
    const labels: Record<string, string> = {
      isLoadingWeeks: 'Loading weeks',
      isLoadingPlayers: 'Loading players',
      isLoadingSchedule: 'Loading schedule',
      isLoadingAvailability: 'Loading availability',
      isGeneratingSchedule: 'Generating schedule',
      isExporting: 'Exporting',
      isSaving: 'Saving changes',
      isValidating: 'Validating'
    };
    return labels[key] || key;
  }

  /**
   * Get error icon based on error type
   */
  private getErrorIcon(type: ErrorDetails['type']): string {
    const icons: Record<ErrorDetails['type'], string> = {
      generation: '⚠️',
      loading: '📡',
      validation: '❌',
      export: '📤',
      network: '🌐',
      unknown: '❗'
    };
    return icons[type] || icons.unknown;
  }

  /**
   * Format timestamp for display
   */
  private formatTimestamp(timestamp: Date): string {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} minutes ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`;
    
    return timestamp.toLocaleDateString();
  }

  /**
   * Dismiss current error
   */
  private dismissError(): void {
    this.clearError();
    this.render();
  }

  /**
   * Execute recovery action
   */
  private async executeRecoveryAction(actionIndex: number): Promise<void> {
    const action = this.state.errorDetails?.recoveryActions?.[actionIndex];
    if (!action) return;

    try {
      await action.action();
      this.clearError();
      this.render();
    } catch (error) {
      this.handleError(error, `Recovery action: ${action.label}`, 'unknown');
      this.render();
    }
  }
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

        ${this.renderErrorDisplay()}

        ${this.renderLoadingIndicator()}

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
      exportSchedule: (format: 'pdf' | 'csv') => this.exportSchedule(format),
      // Editing methods
      enableEditing: () => this.enableEditing(),
      cancelEditing: () => this.cancelEditing(),
      saveChanges: () => this.saveChanges(),
      validateSchedule: () => this.validateSchedule(),
      // Enhanced error handling methods
      dismissError: () => this.dismissError(),
      executeRecoveryAction: (actionIndex: number) => this.executeRecoveryAction(actionIndex),
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
      // Show progress tracking with detailed steps
      this.showRegenerationProgress();

      const regenerationResult = await this.scheduleManager.regenerateSchedule(
        this.state.selectedWeek.id,
        {
          forceOverwrite: result.forceOverwrite ?? false,
          preserveManualEdits: result.preserveManualEdits ?? false
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
      
      // Hide the confirmation dialog after everything is complete
      this.confirmationUI.hide();
      
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
    // Hide the confirmation dialog
    this.confirmationUI.hide();
    
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