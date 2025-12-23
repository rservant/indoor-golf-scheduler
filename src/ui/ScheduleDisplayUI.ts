import { Schedule } from '../models/Schedule';
import { Foursome } from '../models/Foursome';
import { Player } from '../models/Player';
import { Week } from '../models/Week';
import { Season } from '../models/Season';
import { ScheduleManager } from '../services/ScheduleManager';
import { ScheduleGenerator } from '../services/ScheduleGenerator';
import { WeekRepository } from '../repositories/WeekRepository';
import { ExportService, ExportFormat } from '../services/ExportService';

export interface ScheduleDisplayUIState {
  activeSeason: Season | null;
  weeks: Week[];
  selectedWeek: Week | null;
  schedule: Schedule | null;
  isGenerating: boolean;
  error: string | null;
  showExportOptions: boolean;
}

export class ScheduleDisplayUI {
  private state: ScheduleDisplayUIState;
  private scheduleManager: ScheduleManager;
  private weekRepository: WeekRepository;
  private exportService: ExportService;
  public container: HTMLElement;
  private onScheduleGenerated?: (schedule: Schedule) => void;

  constructor(
    scheduleManager: ScheduleManager,
    _scheduleGenerator: ScheduleGenerator,
    weekRepository: WeekRepository,
    exportService: ExportService,
    container: HTMLElement
  ) {
    this.scheduleManager = scheduleManager;
    this.weekRepository = weekRepository;
    this.exportService = exportService;
    this.container = container;
    this.state = {
      activeSeason: null,
      weeks: [],
      selectedWeek: null,
      schedule: null,
      isGenerating: false,
      error: null,
      showExportOptions: false
    };
  }

  /**
   * Initialize the UI
   */
  async initialize(activeSeason: Season | null): Promise<void> {
    this.state.activeSeason = activeSeason;
    if (activeSeason) {
      await this.loadWeeks();
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
    } else {
      this.state.weeks = [];
      this.state.selectedWeek = null;
      this.state.schedule = null;
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
      }
      
      this.state.error = null;
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : 'Failed to load weeks';
    }
  }

  /**
   * Load schedule for the selected week
   */
  private async loadScheduleForSelectedWeek(): Promise<void> {
    if (!this.state.selectedWeek) {
      this.state.schedule = null;
      return;
    }

    try {
      this.state.schedule = await this.scheduleManager.getSchedule(this.state.selectedWeek.id);
      this.state.error = null;
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : 'Failed to load schedule';
    }
  }

  /**
   * Generate a new schedule for the selected week
   */
  private async generateSchedule(): Promise<void> {
    if (!this.state.selectedWeek) return;

    this.state.isGenerating = true;
    this.state.error = null;
    this.render();

    try {
      const schedule = await this.scheduleManager.createWeeklySchedule(this.state.selectedWeek.id);
      this.state.schedule = schedule;
      
      if (this.onScheduleGenerated) {
        this.onScheduleGenerated(schedule);
      }
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : 'Failed to generate schedule';
    } finally {
      this.state.isGenerating = false;
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
            <p>No weeks found for this season. Weeks are created automatically when generating schedules.</p>
          </div>
        ` : `
          <div class="week-selector">
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
    if (!this.state.selectedWeek) return '';

    if (this.state.isGenerating) {
      return `
        <div class="generating-schedule">
          <div class="loading-spinner"></div>
          <p>Generating schedule for Week ${this.state.selectedWeek.weekNumber}...</p>
        </div>
      `;
    }

    if (!this.state.schedule) {
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

    return `
      <div class="schedule-content">
        <div class="schedule-actions">
          <h3>Week ${this.state.selectedWeek.weekNumber} - ${this.formatDate(this.state.selectedWeek.date)}</h3>
          <div class="action-buttons">
            <button class="btn btn-secondary" onclick="scheduleDisplayUI.regenerateSchedule()">
              Regenerate
            </button>
            <button class="btn btn-primary" onclick="scheduleDisplayUI.showExportOptions()">
              Export
            </button>
          </div>
        </div>

        ${this.state.showExportOptions ? this.renderExportOptions() : ''}

        <div class="schedule-grid">
          ${this.renderTimeSlot('Morning (10:30 AM)', this.state.schedule.timeSlots.morning)}
          ${this.renderTimeSlot('Afternoon (1:00 PM)', this.state.schedule.timeSlots.afternoon)}
        </div>

        <div class="schedule-summary">
          ${this.renderScheduleSummary()}
        </div>
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
  private renderTimeSlot(title: string, foursomes: Foursome[]): string {
    return `
      <div class="time-slot">
        <h4 class="time-slot-title">${title}</h4>
        <div class="foursomes">
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
      <div class="foursome">
        <div class="foursome-header">
          <h5>Group ${position}</h5>
          <span class="player-count">${foursome.players.length}/4 players</span>
        </div>
        <div class="foursome-players">
          ${foursome.players.map(player => this.renderPlayer(player)).join('')}
          ${Array(4 - foursome.players.length).fill(0).map(() => `
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
  private renderPlayer(player: Player): string {
    return `
      <div class="player-slot filled">
        <div class="player-name">${player.firstName} ${player.lastName}</div>
        <div class="player-details">
          <span class="handedness ${player.handedness}">${player.handedness.charAt(0).toUpperCase()}</span>
          <span class="preference ${player.timePreference.toLowerCase()}">${player.timePreference}</span>
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
      generateSchedule: () => {
        this.generateSchedule();
      },
      regenerateSchedule: () => {
        if (confirm('Are you sure you want to regenerate this schedule? This will replace the current schedule.')) {
          this.generateSchedule();
        }
      },
      showExportOptions: () => {
        this.state.showExportOptions = true;
        this.render();
      },
      hideExportOptions: () => {
        this.state.showExportOptions = false;
        this.render();
      },
      exportSchedule: (format: 'pdf' | 'excel' | 'csv') => {
        this.exportSchedule(format);
      }
    };
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
    if (this.state.selectedWeek) {
      await this.loadScheduleForSelectedWeek();
    }
    this.render();
  }
}