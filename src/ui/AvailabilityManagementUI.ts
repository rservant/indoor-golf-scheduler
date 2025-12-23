import { Player } from '../models/Player';
import { Week } from '../models/Week';
import { Season } from '../models/Season';
import { PlayerManager } from '../services/PlayerManager';
import { WeekRepository } from '../repositories/WeekRepository';
import { availabilityErrorHandler, withAvailabilityErrorHandling } from '../utils/AvailabilityErrorHandler';
import { OperationInterruptionManager } from '../services/OperationInterruptionManager';

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
  private interruptionManager: OperationInterruptionManager;
  public container: HTMLElement;
  private lastDataRefresh: Date | null = null;
  private visibilityChangeHandler: () => void;
  private focusHandler: () => void;
  private stalenessThresholdMs: number = 30000; // 30 seconds

  constructor(playerManager: PlayerManager, weekRepository: WeekRepository, container: HTMLElement) {
    this.playerManager = playerManager;
    this.weekRepository = weekRepository;
    this.interruptionManager = playerManager.getInterruptionManager();
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

    // Set up navigation freshness detection
    this.visibilityChangeHandler = () => this.handleVisibilityChange();
    this.focusHandler = () => this.handleFocusChange();
    
    // Add event listeners for tab focus/visibility changes
    document.addEventListener('visibilitychange', this.visibilityChangeHandler);
    window.addEventListener('focus', this.focusHandler);
  }

  /**
   * Initialize the UI with interruption detection and recovery
   */
  async initialize(activeSeason: Season | null): Promise<void> {
    this.state.activeSeason = activeSeason;
    
    // Check for interrupted operations first
    await this.checkAndRecoverFromInterruptions();
    
    if (activeSeason) {
      await this.loadData();
      this.lastDataRefresh = new Date();
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
      this.lastDataRefresh = new Date();
    } else {
      this.state.players = [];
      this.state.weeks = [];
      this.state.selectedWeek = null;
      this.state.playerAvailability.clear();
      this.lastDataRefresh = null;
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
   * Load availability data for all weeks (always from persistence layer)
   */
  private async loadAvailabilityData(): Promise<void> {
    this.state.playerAvailability.clear();

    if (this.state.weeks.length === 0) {
      console.log('No weeks found, skipping availability data load');
      return;
    }

    console.log(`Loading availability data for ${this.state.weeks.length} weeks and ${this.state.players.length} players`);

    for (const week of this.state.weeks) {
      const weekAvailability = new Map<string, boolean>();
      
      for (const player of this.state.players) {
        try {
          // Always fetch from persistence layer to ensure freshness
          const isAvailable = await this.playerManager.getPlayerAvailability(player.id, week.id);
          weekAvailability.set(player.id, isAvailable);
        } catch (error) {
          console.warn(`Failed to get availability for player ${player.id} in week ${week.id}:`, error);
          // Default to false if there's an error
          weekAvailability.set(player.id, false);
        }
      }
      
      this.state.playerAvailability.set(week.id, weekAvailability);
      console.log(`Loaded availability for week ${week.weekNumber}: ${Array.from(weekAvailability.values()).filter(Boolean).length}/${weekAvailability.size} available`);
    }

    // Update last refresh timestamp
    this.lastDataRefresh = new Date();
  }

  /**
   * Toggle player availability for a specific week (pessimistic update with comprehensive error handling)
   */
  private async togglePlayerAvailability(playerId: string, weekId: string): Promise<void> {
    // Show loading state during persistence operation
    this.state.isLoading = true;
    this.state.error = null;
    this.render();

    const result = await withAvailabilityErrorHandling(
      async () => {
        const currentAvailability = this.getPlayerAvailability(playerId, weekId);
        const newAvailability = !currentAvailability;

        // Use atomic persistence operation and wait for confirmation
        await this.playerManager.setPlayerAvailabilityAtomic(playerId, weekId, newAvailability);

        // Verify the change was persisted successfully
        const verificationSuccess = await this.playerManager.verifyAvailabilityPersisted(playerId, weekId, newAvailability);
        
        if (!verificationSuccess) {
          await availabilityErrorHandler.handleVerificationError(playerId, weekId, newAvailability, !newAvailability);
          throw new Error('Failed to verify availability change was persisted');
        }

        return newAvailability;
      },
      {
        operationName: 'toggle-player-availability',
        playerId,
        weekId,
        retryConfig: {
          maxAttempts: 3,
          baseDelayMs: 500
        }
      }
    );

    if (result !== null) {
      // Only update UI state after successful persistence and verification
      const weekAvailability = this.state.playerAvailability.get(weekId);
      if (weekAvailability) {
        weekAvailability.set(playerId, result);
      }
      this.state.error = null;
    } else {
      // Error was handled by the error handler, reload data to ensure UI shows correct state
      await this.loadAvailabilityData();
    }

    this.state.isLoading = false;
    this.render();
  }

  /**
   * Set all players as available for a week (pessimistic update with comprehensive error handling)
   */
  private async setAllAvailable(weekId: string, available: boolean): Promise<void> {
    console.log(`Setting all players ${available ? 'available' : 'unavailable'} for week ${weekId}`);
    
    // Prevent multiple simultaneous operations
    if (this.state.isLoading) {
      console.log('Operation already in progress, ignoring click');
      return;
    }
    
    if (this.state.players.length === 0) {
      this.state.error = 'No players found to update availability';
      this.render();
      return;
    }

    // Ensure we have availability data for this week
    if (!this.state.playerAvailability.has(weekId)) {
      console.log('Initializing availability data for week', weekId);
      this.state.playerAvailability.set(weekId, new Map());
    }

    this.state.isLoading = true;
    this.state.error = null;
    this.render();

    const operation = available ? 'mark-all-available' : 'mark-all-unavailable';
    const playerIds = this.state.players.map(player => player.id);

    const result = await withAvailabilityErrorHandling(
      async () => {
        // Capture original state for potential rollback
        const originalState = new Map<string, boolean>();
        const weekAvailability = this.state.playerAvailability.get(weekId);
        if (weekAvailability) {
          for (const player of this.state.players) {
            originalState.set(player.id, weekAvailability.get(player.id) || false);
          }
        }

        // Use atomic bulk operation with verified persistence
        await this.playerManager.setBulkAvailabilityAtomic(weekId, playerIds, available);

        // Verify all changes were persisted successfully
        const failedPlayers: string[] = [];
        
        for (const player of this.state.players) {
          const verified = await this.playerManager.verifyAvailabilityPersisted(player.id, weekId, available);
          if (!verified) {
            failedPlayers.push(`${player.firstName} ${player.lastName}`);
          }
        }

        if (failedPlayers.length > 0) {
          throw new Error(`Verification failed for ${failedPlayers.length} player(s): ${failedPlayers.join(', ')}`);
        }

        return true;
      },
      {
        operationName: `bulk-availability-${operation}`,
        weekId,
        retryConfig: {
          maxAttempts: 2,
          baseDelayMs: 1000
        }
      }
    );

    if (result !== null) {
      // Only update UI state after successful persistence and verification
      const weekAvailability = this.state.playerAvailability.get(weekId);
      if (weekAvailability) {
        for (const player of this.state.players) {
          weekAvailability.set(player.id, available);
        }
      }
      console.log(`Successfully updated and verified availability for all ${this.state.players.length} players`);
    } else {
      // Error was handled by the error handler, reload data to ensure UI shows correct state
      await this.loadAvailabilityData();
    }

    this.state.isLoading = false;
    this.render();
  }

  /**
   * Get player availability for a specific week
   */
  private getPlayerAvailability(playerId: string, weekId: string): boolean {
    const weekAvailability = this.state.playerAvailability.get(weekId);
    if (!weekAvailability) {
      console.warn(`No availability data found for week ${weekId}`);
      return false;
    }
    return weekAvailability.get(playerId) || false;
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
    console.log('AvailabilityManagementUI.render() called, state:', {
      activeSeason: this.state.activeSeason?.name,
      playersCount: this.state.players.length,
      weeksCount: this.state.weeks.length,
      selectedWeek: this.state.selectedWeek?.weekNumber,
      isLoading: this.state.isLoading,
      error: this.state.error
    });

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

        ${(this.state as any).temporaryMessage ? `
          <div class="alert alert-${(this.state as any).temporaryMessage.type}">
            ${(this.state as any).temporaryMessage.message}
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
          <button class="btn btn-sm btn-secondary" data-action="mark-all-available" data-week-id="${this.state.selectedWeek.id}">
            Mark All Available
          </button>
          <button class="btn btn-sm btn-secondary" data-action="mark-all-unavailable" data-week-id="${this.state.selectedWeek.id}">
            Mark All Unavailable
          </button>
        </div>

        <div class="verification-actions">
          <button class="btn btn-sm btn-outline" data-action="verify-consistency" data-week-id="${this.state.selectedWeek.id}">
            Verify Data Consistency
          </button>
          <button class="btn btn-sm btn-outline" data-action="refresh-data" data-week-id="${this.state.selectedWeek.id}">
            Refresh from Storage
          </button>
          <button class="btn btn-sm btn-outline" data-action="force-refresh" data-week-id="${this.state.selectedWeek.id}">
            Force Refresh
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
                   data-action="toggle-availability"
                   data-player-id="${player.id}"
                   data-week-id="${this.state.selectedWeek.id}">>
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

    // Use event delegation for bulk actions
    this.container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const action = target.getAttribute('data-action');
      
      if (action === 'mark-all-available') {
        const weekId = target.getAttribute('data-week-id');
        if (weekId) {
          console.log('Mark All Available clicked for week:', weekId);
          this.setAllAvailable(weekId, true);
        }
      } else if (action === 'mark-all-unavailable') {
        const weekId = target.getAttribute('data-week-id');
        if (weekId) {
          console.log('Mark All Unavailable clicked for week:', weekId);
          this.setAllAvailable(weekId, false);
        }
      } else if (action === 'verify-consistency') {
        const weekId = target.getAttribute('data-week-id');
        if (weekId) {
          console.log('Verify Consistency clicked for week:', weekId);
          this.handleVerifyConsistency();
        }
      } else if (action === 'refresh-data') {
        const weekId = target.getAttribute('data-week-id');
        if (weekId) {
          console.log('Refresh Data clicked for week:', weekId);
          this.handleRefreshData();
        }
      } else if (action === 'force-refresh') {
        const weekId = target.getAttribute('data-week-id');
        if (weekId) {
          console.log('Force Refresh clicked for week:', weekId);
          this.handleForceRefresh();
        }
      }
    });

    // Use event delegation for individual toggles
    this.container.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      const action = target.getAttribute('data-action');
      
      if (action === 'toggle-availability') {
        const playerId = target.getAttribute('data-player-id');
        const weekId = target.getAttribute('data-week-id');
        if (playerId && weekId) {
          console.log('Toggle availability clicked:', { playerId, weekId });
          this.togglePlayerAvailability(playerId, weekId);
        }
      }
    });

    // Keep the window binding as fallback (for any remaining onclick handlers)
    (window as any).availabilityUI = {
      toggleAvailability: (playerId: string, weekId: string) => {
        console.log('Toggle availability called via window binding:', { playerId, weekId });
        this.togglePlayerAvailability(playerId, weekId);
      },
      setAllAvailable: (weekId: string, available: boolean) => {
        console.log('Set all available called via window binding:', { weekId, available });
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
   * Refresh the availability data (ensures data freshness)
   */
  async refresh(): Promise<void> {
    await this.loadData();
    this.render();
  }

  /**
   * Refresh data from persistence layer (pessimistic data loading)
   */
  async refreshFromPersistence(): Promise<void> {
    if (!this.state.activeSeason) return;

    this.state.isLoading = true;
    this.state.error = null;
    this.render();

    try {
      // Always reload from persistence layer to ensure freshness
      await this.loadAvailabilityData();
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : 'Failed to refresh data';
    } finally {
      this.state.isLoading = false;
      this.render();
    }
  }

  /**
   * Verify data consistency between UI and persistence
   */
  async verifyDataConsistency(): Promise<boolean> {
    if (!this.state.activeSeason || !this.state.selectedWeek) {
      return true; // No data to verify
    }

    try {
      for (const player of this.state.players) {
        const uiAvailability = this.getPlayerAvailability(player.id, this.state.selectedWeek.id);
        const persistedAvailability = await this.playerManager.getPlayerAvailability(player.id, this.state.selectedWeek.id);
        
        if (uiAvailability !== persistedAvailability) {
          console.warn(`Data inconsistency detected for player ${player.id}: UI=${uiAvailability}, Persisted=${persistedAvailability}`);
          return false;
        }
      }
      return true;
    } catch (error) {
      console.error('Error verifying data consistency:', error);
      return false;
    }
  }

  /**
   * Handle visibility change events (tab focus/blur) with interruption detection
   */
  private async handleVisibilityChange(): Promise<void> {
    if (!document.hidden && this.state.activeSeason) {
      // Tab became visible - check for interrupted operations and stale data
      await this.checkAndRecoverFromInterruptions();
      await this.checkAndRefreshStaleData();
    }
  }

  /**
   * Handle window focus events with interruption detection
   */
  private async handleFocusChange(): Promise<void> {
    if (this.state.activeSeason) {
      // Window gained focus - check for interrupted operations and stale data
      await this.checkAndRecoverFromInterruptions();
      await this.checkAndRefreshStaleData();
    }
  }

  /**
   * Check if data is stale and refresh if necessary
   */
  private async checkAndRefreshStaleData(): Promise<void> {
    if (!this.lastDataRefresh) {
      // No previous refresh timestamp, refresh to be safe
      await this.refreshFromPersistence();
      return;
    }

    const now = new Date();
    const timeSinceRefresh = now.getTime() - this.lastDataRefresh.getTime();

    if (timeSinceRefresh > this.stalenessThresholdMs) {
      console.log(`Data is stale (${timeSinceRefresh}ms since last refresh), refreshing from persistence`);
      await this.refreshFromPersistence();
    } else {
      // Data is fresh, but still verify consistency
      const isConsistent = await this.verifyDataConsistency();
      if (!isConsistent) {
        console.log('Data inconsistency detected, refreshing from persistence');
        await this.refreshFromPersistence();
      }
    }
  }

  /**
   * Force refresh data from persistence layer (bypasses cache)
   */
  async forceRefreshFromPersistence(): Promise<void> {
    console.log('Force refreshing data from persistence layer');
    await this.refreshFromPersistence();
  }

  /**
   * Get data freshness information
   */
  getDataFreshnessInfo(): { lastRefresh: Date | null; isStale: boolean; timeSinceRefresh: number | null } {
    if (!this.lastDataRefresh) {
      return {
        lastRefresh: null,
        isStale: true,
        timeSinceRefresh: null
      };
    }

    const now = new Date();
    const timeSinceRefresh = now.getTime() - this.lastDataRefresh.getTime();
    const isStale = timeSinceRefresh > this.stalenessThresholdMs;

    return {
      lastRefresh: this.lastDataRefresh,
      isStale,
      timeSinceRefresh
    };
  }

  /**
   * Set staleness threshold (for testing purposes)
   */
  setStalenessThreshold(thresholdMs: number): void {
    this.stalenessThresholdMs = thresholdMs;
  }

  /**
   * Clean up event listeners
   */
  destroy(): void {
    document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
    window.removeEventListener('focus', this.focusHandler);
  }

  /**
   * Check for interrupted operations and recover if needed
   */
  private async checkAndRecoverFromInterruptions(): Promise<void> {
    try {
      const detectionResult = await this.interruptionManager.detectInterruptions();
      
      if (detectionResult.hasInterruption) {
        console.log(`Detected ${detectionResult.interruptedOperations.length} interrupted operations`);
        
        // Show user notification about recovery
        this.state.error = `Recovering from ${detectionResult.interruptedOperations.length} interrupted operation(s)...`;
        this.render();
        
        // Perform recovery
        await this.interruptionManager.recoverFromInterruptions(detectionResult.interruptedOperations);
        
        // Refresh data to ensure UI shows accurate state
        await this.refreshFromPersistence();
        
        // Clear error message
        this.state.error = null;
        console.log('Successfully recovered from interrupted operations');
      }
    } catch (error) {
      console.error('Failed to recover from interrupted operations:', error);
      this.state.error = 'Failed to recover from interrupted operations. Please refresh the page.';
      this.render();
    }
  }

  /**
   * Handle user-triggered data consistency verification
   */
  private async handleVerifyConsistency(): Promise<void> {
    if (!this.state.activeSeason || !this.state.selectedWeek) {
      this.state.error = 'No active season or selected week for verification';
      this.render();
      return;
    }

    this.state.isLoading = true;
    this.state.error = null;
    this.render();

    try {
      const isConsistent = await this.verifyDataConsistency();
      
      if (isConsistent) {
        this.state.error = null;
        // Show success message temporarily
        const successMessage = 'Data consistency verified - UI and storage are in sync';
        this.showTemporaryMessage(successMessage, 'success');
      } else {
        this.state.error = 'Data inconsistency detected between UI and storage. Consider refreshing data.';
      }
    } catch (error) {
      this.state.error = `Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    } finally {
      this.state.isLoading = false;
      this.render();
    }
  }

  /**
   * Handle user-triggered data refresh from persistence
   */
  private async handleRefreshData(): Promise<void> {
    if (!this.state.activeSeason) {
      this.state.error = 'No active season to refresh data for';
      this.render();
      return;
    }

    this.state.isLoading = true;
    this.state.error = null;
    this.render();

    try {
      await this.refreshFromPersistence();
      
      // Verify consistency after refresh
      const isConsistent = await this.verifyDataConsistency();
      
      if (isConsistent) {
        const successMessage = 'Data refreshed successfully from storage';
        this.showTemporaryMessage(successMessage, 'success');
      } else {
        this.state.error = 'Data refreshed but inconsistencies remain. Storage may be corrupted.';
      }
    } catch (error) {
      this.state.error = `Refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    } finally {
      this.state.isLoading = false;
      this.render();
    }
  }

  /**
   * Handle user-triggered force refresh (bypasses cache)
   */
  private async handleForceRefresh(): Promise<void> {
    if (!this.state.activeSeason) {
      this.state.error = 'No active season to force refresh data for';
      this.render();
      return;
    }

    this.state.isLoading = true;
    this.state.error = null;
    this.render();

    try {
      await this.forceRefreshFromPersistence();
      
      // Verify consistency after force refresh
      const isConsistent = await this.verifyDataConsistency();
      
      if (isConsistent) {
        const successMessage = 'Data force refreshed successfully - all caches bypassed';
        this.showTemporaryMessage(successMessage, 'success');
      } else {
        this.state.error = 'Data force refreshed but inconsistencies remain. Storage may be corrupted.';
      }
    } catch (error) {
      this.state.error = `Force refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    } finally {
      this.state.isLoading = false;
      this.render();
    }
  }

  /**
   * Show a temporary success message
   */
  private showTemporaryMessage(message: string, type: 'success' | 'info' = 'success'): void {
    // Store the message temporarily in state
    (this.state as any).temporaryMessage = { message, type };
    this.render();
    
    // Clear the message after 3 seconds
    setTimeout(() => {
      (this.state as any).temporaryMessage = null;
      this.render();
    }, 3000);
  }

  /**
   * Enhanced data consistency validation with detailed reporting
   */
  async verifyDataConsistencyDetailed(): Promise<{
    isConsistent: boolean;
    discrepancies: Array<{
      playerId: string;
      playerName: string;
      uiState: boolean;
      persistedState: boolean;
    }>;
    totalPlayers: number;
    checkedPlayers: number;
  }> {
    const result = {
      isConsistent: true,
      discrepancies: [] as Array<{
        playerId: string;
        playerName: string;
        uiState: boolean;
        persistedState: boolean;
      }>,
      totalPlayers: this.state.players.length,
      checkedPlayers: 0
    };

    if (!this.state.activeSeason || !this.state.selectedWeek) {
      return result; // No data to verify
    }

    try {
      for (const player of this.state.players) {
        const uiAvailability = this.getPlayerAvailability(player.id, this.state.selectedWeek.id);
        const persistedAvailability = await this.playerManager.getPlayerAvailability(player.id, this.state.selectedWeek.id);
        
        result.checkedPlayers++;
        
        if (uiAvailability !== persistedAvailability) {
          result.isConsistent = false;
          result.discrepancies.push({
            playerId: player.id,
            playerName: `${player.firstName} ${player.lastName}`,
            uiState: uiAvailability,
            persistedState: persistedAvailability
          });
        }
      }
    } catch (error) {
      console.error('Error in detailed consistency verification:', error);
      result.isConsistent = false;
    }

    return result;
  }

  /**
   * Get comprehensive data integrity report
   */
  async getDataIntegrityReport(): Promise<{
    weekId: string;
    weekNumber: number;
    isConsistent: boolean;
    lastRefresh: Date | null;
    isStale: boolean;
    timeSinceRefresh: number | null;
    discrepancies: Array<{
      playerId: string;
      playerName: string;
      uiState: boolean;
      persistedState: boolean;
    }>;
    totalPlayers: number;
    checkedPlayers: number;
  }> {
    const freshnessInfo = this.getDataFreshnessInfo();
    const consistencyReport = await this.verifyDataConsistencyDetailed();
    
    return {
      weekId: this.state.selectedWeek?.id || '',
      weekNumber: this.state.selectedWeek?.weekNumber || 0,
      isConsistent: consistencyReport.isConsistent,
      lastRefresh: freshnessInfo.lastRefresh,
      isStale: freshnessInfo.isStale,
      timeSinceRefresh: freshnessInfo.timeSinceRefresh,
      discrepancies: consistencyReport.discrepancies,
      totalPlayers: consistencyReport.totalPlayers,
      checkedPlayers: consistencyReport.checkedPlayers
    };
  }

  /**
   * Check if there are any active operations for the current week
   */
  private hasActiveOperationsForCurrentWeek(): boolean {
    if (!this.state.selectedWeek) return false;
    return this.interruptionManager.hasActiveOperations(this.state.selectedWeek.id);
  }

  /**
   * Get operation state information for debugging
   */
  getOperationStateInfo(): { hasActiveOperations: boolean; operationState: any } {
    if (!this.state.selectedWeek) {
      return { hasActiveOperations: false, operationState: null };
    }
    
    const operationState = this.interruptionManager.getOperationState(this.state.selectedWeek.id);
    return {
      hasActiveOperations: operationState !== null,
      operationState
    };
  }
}