import { PlayerStatsService, PlayerStats, SeasonLeaderboardEntry } from '../services/PlayerStatsService';
import { PairingHistoryTracker } from '../services/PairingHistoryTracker';
import { PlayerRepository } from '../repositories/PlayerRepository';
import { escapeHtml } from '../utils/escapeHtml';

export class PlayerStatsDashboardUI {
    private container: HTMLElement | null = null;
    private seasonId: string | null = null;
    private selectedPlayerId: string | null = null;
    private playerStats: PlayerStats | null = null;
    private leaderboard: SeasonLeaderboardEntry[] = [];

    constructor(
        private statsService: PlayerStatsService,
        private pairingHistoryTracker: PairingHistoryTracker,
        private playerRepository: PlayerRepository
    ) { }

    setContainer(container: HTMLElement): void {
        this.container = container;
    }

    async initialize(seasonId: string | null): Promise<void> {
        this.seasonId = seasonId;
        this.selectedPlayerId = null;
        this.playerStats = null;
        this.leaderboard = [];

        if (seasonId) {
            try {
                this.leaderboard = await this.statsService.getSeasonLeaderboard(seasonId);
            } catch {
                this.leaderboard = [];
            }
        }
        this.render();
    }

    private async selectPlayer(playerId: string): Promise<void> {
        if (!this.seasonId) return;
        this.selectedPlayerId = playerId;
        try {
            this.playerStats = await this.statsService.getPlayerStats(playerId, this.seasonId);
        } catch {
            this.playerStats = null;
        }
        this.render();
    }

    private render(): void {
        if (!this.container) return;

        if (!this.seasonId) {
            this.container.innerHTML = `
        <div class="stats-dashboard">
          <h2>Player Statistics</h2>
          <p class="empty-state">Select a season to view player statistics.</p>
        </div>
      `;
            return;
        }

        this.container.innerHTML = `
      <div class="stats-dashboard">
        <h2>Player Statistics</h2>
        <div class="stats-layout">
          <div class="stats-sidebar">
            <h3>Season Leaderboard</h3>
            ${this.renderLeaderboard()}
          </div>
          <div class="stats-detail">
            ${this.selectedPlayerId && this.playerStats
                ? this.renderPlayerDetail()
                : '<p class="empty-state">Select a player to view their statistics.</p>'
            }
          </div>
        </div>
      </div>
    `;

        this.attachEventListeners();
    }

    private renderLeaderboard(): string {
        if (this.leaderboard.length === 0) {
            return '<p class="empty-state">No games played yet.</p>';
        }

        return `
      <div class="leaderboard-list">
        ${this.leaderboard.map((entry, i) => `
          <div class="leaderboard-row ${entry.playerId === this.selectedPlayerId ? 'selected' : ''}"
               data-player-id="${entry.playerId}">
            <span class="rank">${i + 1}</span>
            <span class="name">${escapeHtml(entry.playerName)}</span>
            <span class="games">${entry.gamesPlayed} games</span>
          </div>
        `).join('')}
      </div>
    `;
    }

    private renderPlayerDetail(): string {
        const s = this.playerStats!;
        const totalGames = s.amGames + s.pmGames;
        const amPct = totalGames > 0 ? Math.round((s.amGames / totalGames) * 100) : 0;
        const pmPct = totalGames > 0 ? Math.round((s.pmGames / totalGames) * 100) : 0;

        return `
      <div class="player-stats-detail">
        <h3>${escapeHtml(s.playerName)}</h3>

        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">${s.gamesPlayed}</div>
            <div class="stat-label">Games Played</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${s.uniquePartners}</div>
            <div class="stat-label">Unique Partners</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${s.averageFoursomeSkill}</div>
            <div class="stat-label">Avg Group Skill</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${s.mostFrequentPartner ? escapeHtml(s.mostFrequentPartner.name) : '—'}</div>
            <div class="stat-label">Most Frequent Partner ${s.mostFrequentPartner ? `(${s.mostFrequentPartner.count}×)` : ''}</div>
          </div>
        </div>

        <div class="time-slot-breakdown">
          <h4>AM / PM Breakdown</h4>
          <div class="time-bar">
            <div class="time-bar-am" style="width: ${amPct}%">
              ${s.amGames > 0 ? `AM: ${s.amGames}` : ''}
            </div>
            <div class="time-bar-pm" style="width: ${pmPct}%">
              ${s.pmGames > 0 ? `PM: ${s.pmGames}` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
    }

    private attachEventListeners(): void {
        if (!this.container) return;

        const rows = this.container.querySelectorAll('.leaderboard-row');
        rows.forEach(row => {
            row.addEventListener('click', () => {
                const playerId = (row as HTMLElement).dataset.playerId;
                if (playerId) {
                    this.selectPlayer(playerId);
                }
            });
        });
    }
}
