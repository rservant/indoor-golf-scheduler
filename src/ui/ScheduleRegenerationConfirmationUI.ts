import { Schedule } from '../models/Schedule';
import { Player } from '../models/Player';
import { Week } from '../models/Week';

export interface RegenerationImpactAnalysis {
  currentPairings: Array<{
    player1: Player;
    player2: Player;
    timeSlot: 'morning' | 'afternoon';
    groupNumber: number;
  }>;
  totalPlayersScheduled: number;
  morningPlayersCount: number;
  afternoonPlayersCount: number;
  hasManualEdits: boolean;
  lastModified: Date;
  timePreferenceConflicts: Array<{
    player: Player;
    preferredTime: string;
    scheduledTime: 'morning' | 'afternoon';
  }>;
}

export interface ConfirmationResult {
  confirmed: boolean;
  preserveManualEdits?: boolean;
  forceOverwrite?: boolean;
}

export class ScheduleRegenerationConfirmationUI {
  private container: HTMLElement;
  private currentSchedule: Schedule | null = null;
  private currentWeek: Week | null = null;
  private allPlayers: Player[] = [];
  private onConfirmCallback: ((result: ConfirmationResult) => void) | undefined;
  private onCancelCallback: (() => void) | undefined;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  /**
   * Show confirmation dialog for schedule regeneration
   */
  async showConfirmation(
    schedule: Schedule,
    week: Week,
    allPlayers: Player[],
    onConfirm: (result: ConfirmationResult) => void,
    onCancel: () => void
  ): Promise<void> {
    this.currentSchedule = schedule;
    this.currentWeek = week;
    this.allPlayers = allPlayers;
    this.onConfirmCallback = onConfirm;
    this.onCancelCallback = onCancel;

    // Make sure container is visible
    this.container.style.display = 'block';

    const impactAnalysis = this.analyzeRegenerationImpact(schedule, allPlayers);
    this.render(impactAnalysis);
  }

  /**
   * Hide the confirmation dialog
   */
  hide(): void {
    this.container.innerHTML = '';
    this.container.style.display = 'none';
    this.currentSchedule = null;
    this.currentWeek = null;
    this.allPlayers = [];
    this.onConfirmCallback = undefined;
    this.onCancelCallback = undefined;
  }

  /**
   * Analyze the impact of regenerating the current schedule
   */
  private analyzeRegenerationImpact(schedule: Schedule, allPlayers: Player[]): RegenerationImpactAnalysis {
    const currentPairings: RegenerationImpactAnalysis['currentPairings'] = [];
    const timePreferenceConflicts: RegenerationImpactAnalysis['timePreferenceConflicts'] = [];

    // Analyze morning time slot
    schedule.timeSlots.morning.forEach((foursome, groupIndex) => {
      const players = foursome.players;
      
      // Check for time preference conflicts
      players.forEach(player => {
        if (player.timePreference === 'PM') {
          timePreferenceConflicts.push({
            player,
            preferredTime: 'PM',
            scheduledTime: 'morning'
          });
        }
      });

      // Generate pairings for this foursome
      for (let i = 0; i < players.length; i++) {
        for (let j = i + 1; j < players.length; j++) {
          currentPairings.push({
            player1: players[i],
            player2: players[j],
            timeSlot: 'morning',
            groupNumber: groupIndex + 1
          });
        }
      }
    });

    // Analyze afternoon time slot
    schedule.timeSlots.afternoon.forEach((foursome, groupIndex) => {
      const players = foursome.players;
      
      // Check for time preference conflicts
      players.forEach(player => {
        if (player.timePreference === 'AM') {
          timePreferenceConflicts.push({
            player,
            preferredTime: 'AM',
            scheduledTime: 'afternoon'
          });
        }
      });

      // Generate pairings for this foursome
      for (let i = 0; i < players.length; i++) {
        for (let j = i + 1; j < players.length; j++) {
          currentPairings.push({
            player1: players[i],
            player2: players[j],
            timeSlot: 'afternoon',
            groupNumber: groupIndex + 1
          });
        }
      }
    });

    const morningPlayersCount = schedule.timeSlots.morning.reduce((sum, f) => sum + f.players.length, 0);
    const afternoonPlayersCount = schedule.timeSlots.afternoon.reduce((sum, f) => sum + f.players.length, 0);

    // Determine if schedule has manual edits (heuristic: modified more than 5 minutes after creation)
    const timeDiff = schedule.lastModified.getTime() - schedule.createdAt.getTime();
    const hasManualEdits = timeDiff > 5 * 60 * 1000; // 5 minutes

    return {
      currentPairings,
      totalPlayersScheduled: morningPlayersCount + afternoonPlayersCount,
      morningPlayersCount,
      afternoonPlayersCount,
      hasManualEdits,
      lastModified: schedule.lastModified,
      timePreferenceConflicts
    };
  }

  /**
   * Render the confirmation dialog
   */
  private render(impactAnalysis: RegenerationImpactAnalysis): void {
    if (!this.currentWeek) return;

    this.container.innerHTML = `
      <div class="regeneration-confirmation-overlay">
        <div class="regeneration-confirmation-dialog">
          <div class="confirmation-header">
            <h3>Confirm Schedule Regeneration</h3>
            <p class="confirmation-subtitle">
              Week ${this.currentWeek.weekNumber} - ${this.formatDate(this.currentWeek.date)}
            </p>
          </div>

          <div class="confirmation-content">
            ${this.renderWarningSection(impactAnalysis)}
            ${this.renderImpactAnalysis(impactAnalysis)}
            ${this.renderDataLossWarning(impactAnalysis)}
            ${impactAnalysis.hasManualEdits ? this.renderManualEditsWarning(impactAnalysis) : ''}
            ${this.renderOptions()}
          </div>

          <div class="confirmation-actions">
            <button class="btn btn-secondary" onclick="scheduleRegenerationConfirmation.cancel()">
              Cancel
            </button>
            <button class="btn btn-primary btn-destructive" onclick="scheduleRegenerationConfirmation.confirm()">
              Regenerate Schedule
            </button>
          </div>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  /**
   * Render warning section
   */
  private renderWarningSection(impactAnalysis: RegenerationImpactAnalysis): string {
    const warningLevel = impactAnalysis.hasManualEdits ? 'critical' : 'standard';
    
    return `
      <div class="confirmation-warning ${warningLevel}">
        <div class="warning-icon">⚠️</div>
        <div class="warning-content">
          <h4>This action will replace the existing schedule</h4>
          <p>
            ${impactAnalysis.hasManualEdits 
              ? 'This schedule appears to have manual edits that will be permanently lost.'
              : 'The current schedule will be backed up before regeneration.'
            }
          </p>
          ${impactAnalysis.hasManualEdits ? `
            <p class="manual-edits-warning">
              <strong>Warning:</strong> Manual changes made since 
              ${this.formatDateTime(impactAnalysis.lastModified)} will be lost.
            </p>
          ` : ''}
        </div>
      </div>
    `;
  }

  /**
   * Render impact analysis section
   */
  private renderImpactAnalysis(impactAnalysis: RegenerationImpactAnalysis): string {
    return `
      <div class="impact-analysis">
        <h4>Current Schedule Overview</h4>
        <div class="impact-stats">
          <div class="impact-stat">
            <span class="stat-label">Total Players</span>
            <span class="stat-value">${impactAnalysis.totalPlayersScheduled}</span>
          </div>
          <div class="impact-stat">
            <span class="stat-label">Morning Players</span>
            <span class="stat-value">${impactAnalysis.morningPlayersCount}</span>
          </div>
          <div class="impact-stat">
            <span class="stat-label">Afternoon Players</span>
            <span class="stat-value">${impactAnalysis.afternoonPlayersCount}</span>
          </div>
          <div class="impact-stat">
            <span class="stat-label">Player Pairings</span>
            <span class="stat-value">${impactAnalysis.currentPairings.length}</span>
          </div>
        </div>

        ${impactAnalysis.timePreferenceConflicts.length > 0 ? `
          <div class="preference-conflicts">
            <h5>Time Preference Issues</h5>
            <p class="conflicts-description">
              The following players are scheduled against their time preferences:
            </p>
            <div class="conflicts-list">
              ${impactAnalysis.timePreferenceConflicts.map(conflict => `
                <div class="conflict-item">
                  <span class="player-name">${conflict.player.firstName} ${conflict.player.lastName}</span>
                  <span class="conflict-detail">
                    Prefers ${conflict.preferredTime} but scheduled in ${conflict.scheduledTime}
                  </span>
                </div>
              `).join('')}
            </div>
            <p class="regeneration-benefit">
              Regeneration may resolve these conflicts with updated player availability.
            </p>
          </div>
        ` : ''}
      </div>
    `;
  }

  /**
   * Render data loss warning
   */
  private renderDataLossWarning(impactAnalysis: RegenerationImpactAnalysis): string {
    return `
      <div class="data-loss-warning">
        <h4>Data That Will Be Lost</h4>
        <div class="loss-categories">
          <div class="loss-category">
            <h5>Current Player Pairings</h5>
            <p>All ${impactAnalysis.currentPairings.length} current player pairings will be replaced with new ones.</p>
          </div>
          
          <div class="loss-category">
            <h5>Group Arrangements</h5>
            <p>
              Current groupings (${impactAnalysis.morningPlayersCount > 0 ? Math.ceil(impactAnalysis.morningPlayersCount / 4) : 0} morning groups, 
              ${impactAnalysis.afternoonPlayersCount > 0 ? Math.ceil(impactAnalysis.afternoonPlayersCount / 4) : 0} afternoon groups) will be recreated.
            </p>
          </div>

          ${impactAnalysis.hasManualEdits ? `
            <div class="loss-category critical">
              <h5>Manual Edits</h5>
              <p>
                Any manual changes made to player assignments, group compositions, 
                or time slot arrangements will be permanently lost.
              </p>
            </div>
          ` : ''}
        </div>

        <div class="backup-assurance">
          <div class="backup-icon">💾</div>
          <div class="backup-text">
            <strong>Safety Backup:</strong> The current schedule will be automatically backed up 
            before regeneration and can be restored if needed.
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render manual edits warning
   */
  private renderManualEditsWarning(impactAnalysis: RegenerationImpactAnalysis): string {
    return `
      <div class="manual-edits-warning-section">
        <div class="manual-edits-header">
          <div class="warning-icon critical">🚨</div>
          <h4>Manual Edits Detected</h4>
        </div>
        
        <div class="manual-edits-content">
          <p class="edits-description">
            This schedule has been manually modified since its creation. 
            Last modified: <strong>${this.formatDateTime(impactAnalysis.lastModified)}</strong>
          </p>
          
          <div class="edits-impact">
            <h5>What This Means:</h5>
            <ul>
              <li>Custom player arrangements will be lost</li>
              <li>Manual group optimizations will be reset</li>
              <li>Any special accommodations will need to be reapplied</li>
              <li>Time slot adjustments will be overwritten</li>
            </ul>
          </div>

          <div class="alternative-suggestion">
            <h5>Consider These Alternatives:</h5>
            <ul>
              <li>Make availability changes and keep current schedule</li>
              <li>Create a new week instead of regenerating this one</li>
              <li>Export current schedule before regenerating</li>
            </ul>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render confirmation options
   */
  private renderOptions(): string {
    return `
      <div class="confirmation-options">
        <h4>Regeneration Options</h4>
        <div class="options-list">
          <label class="option-item">
            <input type="checkbox" id="force-overwrite" class="option-checkbox">
            <div class="option-content">
              <div class="option-title">Force Overwrite</div>
              <div class="option-description">
                Proceed with regeneration even if there are validation warnings
              </div>
            </div>
          </label>
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
   * Format date and time for display
   */
  private formatDateTime(date: Date): string {
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  /**
   * Attach event listeners
   */
  private attachEventListeners(): void {
    // Bind methods to window for onclick handlers
    (window as any).scheduleRegenerationConfirmation = {
      confirm: () => {
        this.handleConfirm();
      },
      cancel: () => {
        this.handleCancel();
      }
    };

    // Handle escape key
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        this.handleCancel();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);

    // Handle overlay click
    const overlay = this.container.querySelector('.regeneration-confirmation-overlay');
    if (overlay) {
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) {
          this.handleCancel();
        }
      });
    }
  }

  /**
   * Handle confirmation
   */
  private handleConfirm(): void {
    const forceOverwriteCheckbox = this.container.querySelector('#force-overwrite') as HTMLInputElement;
    
    const result: ConfirmationResult = {
      confirmed: true,
      forceOverwrite: forceOverwriteCheckbox?.checked || false
    };

    if (this.onConfirmCallback) {
      this.onConfirmCallback(result);
    }

    this.hide();
  }

  /**
   * Handle cancellation
   */
  private handleCancel(): void {
    const result: ConfirmationResult = {
      confirmed: false
    };

    if (this.onCancelCallback) {
      this.onCancelCallback();
    }

    this.hide();
  }

  /**
   * Destroy the confirmation UI and cleanup resources
   */
  destroy(): void {
    // Clear any existing content
    this.container.innerHTML = '';
    
    // Clear callbacks
    this.onConfirmCallback = undefined;
    this.onCancelCallback = undefined;
    
    // Clear references
    this.currentSchedule = null;
    this.currentWeek = null;
    this.allPlayers = [];
  }
}