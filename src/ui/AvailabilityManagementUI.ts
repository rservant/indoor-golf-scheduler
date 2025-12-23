import { Player } from '../models/Player';
import { Week } from '../models/Week';
import { Season } from '../models/Season';
import { PlayerManager } from '../services/PlayerManager';
import { WeekRepository } from '../repositories/WeekRepository';

export interface AvailabilityManagementUIState {
  activeSeason: Season | null;
  players: Player[];
  weeks: Week[];
  selectedWeek: Week | null;
  playerAvailability: Map<string, Map<string, boolean>>; // weekId -> playerId -> available
  error: string | null;
  isLoading: boolean;
}

export class AvailabilityManagementUI {
  private state: AvailabilityManagementUIState;
  private playerManager: PlayerManager;
  private weekRepository: WeekRepository;
  public container: HTMLElement;

  constructor(playerManager: PlayerManager, weekRepository: WeekRepository, container: HTMLElement) {
    this.playerManager = playerManager;
    this.weekRepository = weekRepository;
    this.container = container;
    this.state = {
      activeSeason: null,
      players: [],
      weeks: [],
      selectedWeek: null,
      playerAvailability: new Map(),
      error: null,
      isLoading: false
    };
  }

  /**
   * Initialize the UI
   */
  async initialize(activeSeason: Season | null): Promise<void> {
    this.state.activeSeason = activeSeason;
    if (activeSeason) {
      await this.loadData();
    }
    this.render();
  }

  /**
   * Update the active season and reload data
   */
  async setActiveSeason(season: Season | null): Promise<void> {
    this.state.activeSeason = season;
    if (season) {
      await this.loadData();
    } else {
      this.state.players = [];
      this.state.weeks = [];
      this.state.selectedWeek = null;
      this.state.playerAvailability.clear();
    }
    this.render();
  }

  /**
   * Load players and weeks for the active season
   */
  private async loadData(): Promise<void> {
    if (!this.state.activeSeason) return;

    this.state.isLoading = true;
    this.state.error = null;

    try {
      const [players, weeks] = await Promise.all([
        this.playerManager.getAllPlayers(this.state.activeSeason.id),
        this.weekRepository.findBySeasonId(this.state.activeSeason.id)
      ]);

      this.state.players = players;
      this.state.weeks = weeks.sort((a, b) => a.weekNumber - b.weekNumber);

      // Load availability data for all weeks
      await this.loadAvailabilityData();

      // Select the first week if none selected
      if (this.state.weeks.length > 0 && !this.state.selectedWeek) {
        this.state.selectedWeek = this.state.weeks[0];
      }

    } catch (error) {
      this.state.error = error instanceof Error ? error.message : 'Failed to load data';
    } finally {
      this.state.isLoading = false;
    }
  }

  /**
   * Load availability data for all weeks
   */
  private async loadAvailabilityData(): Promise<void> {
    this.state.playerAvailability.clear();

    for (const week of this.state.weeks) {
      const weekAvailability = new Map<string, boolean>();
      
      for (const player of this.state.players) {
        try {
          const isAvailable = await this.playerManager.getPlayerAvailability(player.id, week.id);
          weekAvailability.set(player.id, isAvailable);
        } catch (error) {
          // Default to false if there's an error
          weekAvailability.set(player.id, false);
        }
      }
      
      this.state.playerAvailability.set(week.id, weekAvailability);
    }
  }

  /**
   * Toggle player availability for a specific week
   */
  private async togglePlayerAvailability(playerId: string, weekId: string): Promise<void> {
    try {
      const currentAvailability = this.getPlayerAvailability(playerId, weekId);
      const newAvailability = !currentAvailability;

      await this.playerManager.setPlayerAvailability(playerId, weekId, newAvailability);

      // Update local state
      const weekAvailability = this.state.playerAvailability.get(weekId);
      if (weekAvailability) {
        weekAvailability.set(playerId, newAvailability);
      }

      this.state.error = null;
      this.render();
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : 'Failed to update availability';
      this.render();
    }
  }

  /**
   * Set all players as available for a week
   */
  private async setAllAvailable(weekId: string, available: boolean): Promise<void> {
    this.state.isLoading = true;
    this.render();

    try {
      const promises = this.state.players.map(player => 
        this.playerManager.setPlayerAvailability(player.id, weekId, available)
      );

      await Promise.all(promises);

      // Update local state
      const weekAvailability = this.state.playerAvailability.get(weekId);
      if (weekAvailability) {
        for (const player of this.state.players) {
          weekAvailability.set(player.id, available);
        }
      }

      this.state.error = null;
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : 'Failed to update availability';
    } finally {
      this.state.isLoading = false;
      this.render();
    }
  }

  /**
   * Get player availability for a specific week
   */
  private getPlayerAvailability(playerId: string, weekId: string): boolean {
    const weekAvailability = this.state.playerAvailability.get(weekId);
    return weekAvailability?.get(playerId) || false;
  }

  /**
   * Get available player count for a week
   */
  private getAvailablePlayerCount(weekId: string): number {
    const weekAvailability = this.state.playerAvailability.get(weekId);
    if (!weekAvailability) return 0;

    return Array.from(weekAvailability.values()).filter(available => available).length;
  }

  /**
   * Render the UI
   */
  private render(): void {
    if (!this.state.activeSeason) {
      this.container.innerHTML = `
        <div class="availability-management">
          <div class="no-active-season">
            <h2>Weekly Availability</h2>
            <p>Please select an active season to manage player availability.</p>
          </div>
        </div>
      `;
      return;
    }

    this.container.innerHTML = `
      <div class="availability-management">
        <div class="availability-header">
          <h2>Weekly Availability</h2>
          <div class="season-info">
            <p>Season: <strong>${this.state.activeSeason.name}</strong></p>
            <p>${this.state.players.length} players, ${this.state.weeks.length} weeks</p>
          </div>
        </div>

        ${this.state.error ? `
          <div class="alert alert-error">
            ${this.state.error}
          </div>
        ` : ''}

        ${this.state.isLoading ? `
          <div class="loading">
            <p>Loading availability data...</p>
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
                  (${this.getAvailablePlayerCount(week.id)}/${this.state.players.length} available)
                </option>
              `).join('')}
            </select>
          </div>

          ${this.state.selectedWeek ? this.renderWeekAvailability() : ''}
        `}
      </div>
    `;

    this.attachEventListeners();
  }

  /**
   * Render availability for the selected week
   */
  private renderWeekAvailability(): string {
    if (!this.state.selectedWeek) return '';

    const availableCount = this.getAvailablePlayerCount(this.state.selectedWeek.id);
    const totalCount = this.state.players.length;

    return `
      <div class="week-availability">
        <div class="week-header">
          <h3>Week ${this.state.selectedWeek.weekNumber} - ${this.formatDate(this.state.selectedWeek.date)}</h3>
          <div class="week-stats">
            <span class="available-count">${availableCount}/${totalCount} players available</span>
          </div>
        </div>

        <div class="bulk-actions">
          <button class="btn btn-sm btn-secondary" onclick="availabilityUI.setAllAvailable('${this.state.selectedWeek.id}', true)">
            Mark All Available
          </button>
          <button class="btn btn-sm btn-secondary" onclick="availabilityUI.setAllAvailable('${this.state.selectedWeek.id}', false)">
            Mark All Unavailable
          </button>
        </div>

        <div class="players-availability">
          ${this.state.players.length === 0 ? `
            <p>No players found for this season.</p>
          ` : `
            <div class="availability-grid">
              ${this.state.players.map(player => this.renderPlayerAvailability(player)).join('')}
            </div>
          `}
        </div>
      </div>
    `;
  }

  /**
   * Render availability toggle for a single player
   */
  private renderPlayerAvailability(player: Player): string {
    if (!this.state.selectedWeek) return '';

    const isAvailable = this.getPlayerAvailability(player.id, this.state.selectedWeek.id);

    return `
      <div class="player-availability ${isAvailable ? 'available' : 'unavailable'}">
        <div class="player-info">
          <strong>${player.firstName} ${player.lastName}</strong>
          <div class="player-details">
            <span class="handedness">${player.handedness}</span>
            <span class="preference">${player.timePreference}</span>
          </div>
        </div>
        
        <div class="availability-toggle">
          <label class="toggle-switch">
            <input type="checkbox" 
                   ${isAvailable ? 'checked' : ''}
                   onchange="availabilityUI.toggleAvailability('${player.id}', '${this.state.selectedWeek.id}')">
            <span class="toggle-slider"></span>
          </label>
          <span class="availability-status">
            ${isAvailable ? 'Available' : 'Not Available'}
          </span>
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
      weekSelect.addEventListener('change', (e) => {
        const selectedWeekId = (e.target as HTMLSelectElement).value;
        this.state.selectedWeek = this.state.weeks.find(w => w.id === selectedWeekId) || null;
        this.render();
      });
    }

    // Bind methods to window for onclick handlers
    (window as any).availabilityUI = {
      toggleAvailability: (playerId: string, weekId: string) => {
        this.togglePlayerAvailability(playerId, weekId);
      },
      setAllAvailable: (weekId: string, available: boolean) => {
        this.setAllAvailable(weekId, available);
      }
    };
  }

  /**
   * Get the selected week
   */
  getSelectedWeek(): Week | null {
    return this.state.selectedWeek;
  }

  /**
   * Get available players for the selected week
   */
  getAvailablePlayersForSelectedWeek(): Player[] {
    if (!this.state.selectedWeek) return [];

    const weekAvailability = this.state.playerAvailability.get(this.state.selectedWeek.id);
    if (!weekAvailability) return [];

    return this.state.players.filter(player => 
      weekAvailability.get(player.id) === true
    );
  }

  /**
   * Refresh the availability data
   */
  async refresh(): Promise<void> {
    await this.loadData();
    this.render();
  }
}