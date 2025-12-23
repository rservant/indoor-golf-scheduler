import { Schedule } from '../models/Schedule';
import { Foursome } from '../models/Foursome';
import { Player } from '../models/Player';
import { Week } from '../models/Week';
import { Season } from '../models/Season';
import { ScheduleManager } from '../services/ScheduleManager';
import { ScheduleGenerator } from '../services/ScheduleGenerator';
import { WeekRepository } from '../repositories/WeekRepository';
import { ExportService, ExportFormat } from '../services/ExportService';
import { PairingHistoryTracker, PairingOptimizationResult } from '../services/PairingHistoryTracker';
import { PlayerManager } from '../services/PlayerManager';

export interface ScheduleDisplayUIState {
  activeSeason: Season | null;
  weeks: Week[];
  selectedWeek: Week | null;
  schedule: Schedule | null;
  isGenerating: boolean;
  error: string | null;
  showExportOptions: boolean;
  allPlayers: Player[];
  availablePlayers: Player[];
  unavailablePlayers: Player[];
  pairingMetrics: PairingOptimizationResult | null;
  showPairingHistory: boolean;
  showPlayerDistribution: boolean;
}

export class ScheduleDisplayUI {
  private state: ScheduleDisplayUIState;
  private scheduleManager: ScheduleManager;
  private weekRepository: WeekRepository;
  private exportService: ExportService;
  private pairingHistoryTracker: PairingHistoryTracker;
  private playerManager: PlayerManager;
  public container: HTMLElement;
  private onScheduleGenerated?: (schedule: Schedule) => void;

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
    this.state = {
      activeSeason: null,
      weeks: [],
      selectedWeek: null,
      schedule: null,
      isGenerating: false,
      error: null,
      showExportOptions: false,
      allPlayers: [],
      availablePlayers: [],
      unavailablePlayers: [],
      pairingMetrics: null,
      showPairingHistory: false,
      showPlayerDistribution: false
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
    if (!this.state.selectedWeek) {
      this.state.schedule = null;
      return;
    }

    try {
      this.state.schedule = await this.scheduleManager.getSchedule(this.state.selectedWeek.id);
      await this.loadPlayerAvailability();
      await this.loadPairingMetrics();
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
            <button class="btn btn-outline ${this.state.showPlayerDistribution ? 'active' : ''}" onclick="scheduleDisplayUI.togglePlayerDistribution()">
              Player Distribution
            </button>
            <button class="btn btn-outline ${this.state.showPairingHistory ? 'active' : ''}" onclick="scheduleDisplayUI.togglePairingHistory()">
              Pairing History
            </button>
          </div>
        </div>

        ${this.state.showExportOptions ? this.renderExportOptions() : ''}

        ${this.state.showPlayerDistribution ? this.renderPlayerDistribution() : ''}

        ${this.state.showPairingHistory ? this.renderPairingHistory() : ''}

        <div class="schedule-grid">
          ${this.renderTimeSlot('Morning (10:30 AM)', this.state.schedule.timeSlots.morning)}
          ${this.renderTimeSlot('Afternoon (1:00 PM)', this.state.schedule.timeSlots.afternoon)}
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
    const scheduledPlayers = this.state.schedule ? this.state.schedule.getAllPlayers() : [];

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
      },
      togglePlayerDistribution: () => {
        this.state.showPlayerDistribution = !this.state.showPlayerDistribution;
        this.render();
      },
      togglePairingHistory: () => {
        this.state.showPairingHistory = !this.state.showPairingHistory;
        this.render();
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