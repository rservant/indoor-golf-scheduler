import { Schedule } from '../models/Schedule';
import { Foursome } from '../models/Foursome';
import { Player } from '../models/Player';
import { Week } from '../models/Week';
import { ScheduleManager, ScheduleEditOperation, ValidationResult } from '../services/ScheduleManager';

export interface ScheduleEditingUIState {
  schedule: Schedule | null;
  selectedWeek: Week | null;
  draggedPlayer: Player | null;
  draggedFromFoursome: string | null;
  isEditing: boolean;
  validationResult: ValidationResult | null;
  error: string | null;
  hasUnsavedChanges: boolean;
}

export interface DragDropData {
  playerId: string;
  fromFoursomeId: string;
  fromTimeSlot: 'morning' | 'afternoon';
}

export class ScheduleEditingUI {
  private state: ScheduleEditingUIState;
  private scheduleManager: ScheduleManager;
  public container: HTMLElement;
  private onScheduleUpdated?: (schedule: Schedule) => void;

  constructor(scheduleManager: ScheduleManager, container: HTMLElement) {
    this.scheduleManager = scheduleManager;
    this.container = container;
    this.state = {
      schedule: null,
      selectedWeek: null,
      draggedPlayer: null,
      draggedFromFoursome: null,
      isEditing: false,
      validationResult: null,
      error: null,
      hasUnsavedChanges: false
    };
  }

  /**
   * Initialize the editing UI with a schedule
   */
  async initialize(schedule: Schedule | null, week: Week | null): Promise<void> {
    this.state.schedule = schedule;
    this.state.selectedWeek = week;
    this.state.isEditing = false;
    this.state.hasUnsavedChanges = false;
    this.render();
  }

  /**
   * Set callback for when schedule is updated
   */
  onScheduleUpdatedCallback(callback: (schedule: Schedule) => void): void {
    this.onScheduleUpdated = callback;
  }

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
      
      if (this.onScheduleUpdated) {
        this.onScheduleUpdated(updatedSchedule);
      }
      
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
      const operation: ScheduleEditOperation = {
        type: 'move_player',
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
      const operation: ScheduleEditOperation = {
        type: 'remove_player',
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
   * Render the UI
   */
  private render(): void {
    if (!this.state.schedule || !this.state.selectedWeek) {
      this.container.innerHTML = `
        <div class="schedule-editing">
          <div class="no-schedule">
            <h2>Schedule Editing</h2>
            <p>No schedule selected for editing.</p>
          </div>
        </div>
      `;
      return;
    }

    this.container.innerHTML = `
      <div class="schedule-editing">
        <div class="editing-header">
          <h2>Edit Schedule - Week ${this.state.selectedWeek.weekNumber}</h2>
          <div class="editing-controls">
            ${!this.state.isEditing ? `
              <button class="btn btn-primary" onclick="scheduleEditingUI.enableEditing()">
                Edit Schedule
              </button>
            ` : `
              <button class="btn btn-secondary" onclick="scheduleEditingUI.validateSchedule()">
                Validate
              </button>
              <button class="btn btn-primary" onclick="scheduleEditingUI.saveChanges()"
                      ${this.state.validationResult && !this.state.validationResult.isValid ? 'disabled' : ''}>
                Save Changes
              </button>
              <button class="btn btn-outline" onclick="scheduleEditingUI.cancelEditing()">
                Cancel
              </button>
            `}
          </div>
        </div>

        ${this.state.hasUnsavedChanges ? `
          <div class="alert alert-warning">
            <strong>Unsaved Changes:</strong> You have made changes to this schedule. Don't forget to save!
          </div>
        ` : ''}

        ${this.state.error ? `
          <div class="alert alert-error">
            ${this.state.error}
          </div>
        ` : ''}

        ${this.state.validationResult ? this.renderValidationResult() : ''}

        <div class="editing-instructions">
          ${this.state.isEditing ? `
            <p><strong>Editing Mode:</strong> Drag and drop players between groups, or use the remove buttons to take players out of groups.</p>
          ` : `
            <p>Click "Edit Schedule" to make changes to player assignments.</p>
          `}
        </div>

        <div class="schedule-editor ${this.state.isEditing ? 'editing-mode' : 'view-mode'}">
          ${this.renderTimeSlotEditor('Morning (10:30 AM)', this.state.schedule.timeSlots.morning, 'morning')}
          ${this.renderTimeSlotEditor('Afternoon (1:00 PM)', this.state.schedule.timeSlots.afternoon, 'afternoon')}
        </div>
      </div>
    `;

    this.attachEventListeners();
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
              ${errors.map(error => `<li>${error}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
        
        ${warnings.length > 0 ? `
          <div class="validation-warnings">
            <h4>Warnings:</h4>
            <ul>
              ${warnings.map(warning => `<li>${warning}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
      </div>
    `;
  }

  /**
   * Render a time slot editor
   */
  private renderTimeSlotEditor(title: string, foursomes: Foursome[], timeSlot: 'morning' | 'afternoon'): string {
    return `
      <div class="time-slot-editor">
        <h3 class="time-slot-title">${title}</h3>
        <div class="foursomes-editor" 
             ondragover="event.preventDefault()" 
             ondrop="scheduleEditingUI.handleTimeSlotDrop(event, '${timeSlot}')">
          ${foursomes.length === 0 ? `
            <div class="empty-time-slot">
              <p>No groups in this time slot</p>
            </div>
          ` : foursomes.map((foursome, index) => this.renderFoursomeEditor(foursome, index + 1)).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Render a foursome editor
   */
  private renderFoursomeEditor(foursome: Foursome, position: number): string {
    return `
      <div class="foursome-editor" 
           ondragover="event.preventDefault()" 
           ondrop="scheduleEditingUI.handleFoursomeDrop(event, '${foursome.id}')">
        <div class="foursome-header">
          <h4>Group ${position}</h4>
          <span class="player-count">${foursome.players.length}/4 players</span>
        </div>
        <div class="foursome-players-editor">
          ${foursome.players.map(player => this.renderPlayerEditor(player, foursome.id)).join('')}
          ${Array(4 - foursome.players.length).fill(0).map((_, index) => `
            <div class="player-slot-editor empty" key="empty-${index}">
              <span>Drop player here</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Render a player editor
   */
  private renderPlayerEditor(player: Player, foursomeId: string): string {
    return `
      <div class="player-slot-editor filled ${this.state.isEditing ? 'draggable' : ''}"
           ${this.state.isEditing ? `
             draggable="true"
             ondragstart="scheduleEditingUI.handlePlayerDragStart(event, '${player.id}', '${foursomeId}')"
           ` : ''}>
        <div class="player-info">
          <div class="player-name">${player.firstName} ${player.lastName}</div>
          <div class="player-details">
            <span class="handedness ${player.handedness}">${player.handedness.charAt(0).toUpperCase()}</span>
            <span class="preference ${player.timePreference.toLowerCase()}">${player.timePreference}</span>
          </div>
        </div>
        ${this.state.isEditing ? `
          <button class="remove-player-btn" onclick="scheduleEditingUI.removePlayer('${player.id}', '${foursomeId}')"
                  title="Remove player from group">
            ×
          </button>
        ` : ''}
      </div>
    `;
  }

  /**
   * Attach event listeners
   */
  private attachEventListeners(): void {
    // Bind methods to window for onclick handlers
    (window as any).scheduleEditingUI = {
      enableEditing: () => {
        this.enableEditing();
      },
      cancelEditing: () => {
        this.cancelEditing();
      },
      saveChanges: () => {
        this.saveChanges();
      },
      validateSchedule: () => {
        this.validateSchedule();
      },
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

  /**
   * Get the current schedule
   */
  getCurrentSchedule(): Schedule | null {
    return this.state.schedule;
  }

  /**
   * Check if there are unsaved changes
   */
  hasUnsavedChanges(): boolean {
    return this.state.hasUnsavedChanges;
  }

  /**
   * Update the schedule being edited
   */
  updateSchedule(schedule: Schedule, week: Week): void {
    this.state.schedule = schedule;
    this.state.selectedWeek = week;
    this.state.hasUnsavedChanges = false;
    this.render();
  }
}