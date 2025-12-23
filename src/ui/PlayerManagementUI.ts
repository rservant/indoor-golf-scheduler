import { Player, PlayerInfo } from '../models/Player';
import { PlayerManager } from '../services/PlayerManager';
import { Season } from '../models/Season';

export interface PlayerManagementUIState {
  players: Player[];
  activeSeason: Season | null;
  isCreating: boolean;
  editingPlayer: Player | null;
  error: string | null;
  searchTerm: string;
}

export interface PlayerFormData {
  firstName: string;
  lastName: string;
  handedness: 'left' | 'right';
  timePreference: 'AM' | 'PM' | 'Either';
}

export class PlayerManagementUI {
  private state: PlayerManagementUIState;
  private playerManager: PlayerManager;
  public container: HTMLElement;

  constructor(playerManager: PlayerManager, container: HTMLElement) {
    this.playerManager = playerManager;
    this.container = container;
    this.state = {
      players: [],
      activeSeason: null,
      isCreating: false,
      editingPlayer: null,
      error: null,
      searchTerm: ''
    };
  }

  /**
   * Initialize the UI
   */
  async initialize(activeSeason: Season | null): Promise<void> {
    this.state.activeSeason = activeSeason;
    if (activeSeason) {
      await this.loadPlayers();
    }
    this.render();
  }

  /**
   * Update the active season and reload players
   */
  async setActiveSeason(season: Season | null): Promise<void> {
    this.state.activeSeason = season;
    if (season) {
      await this.loadPlayers();
    } else {
      this.state.players = [];
    }
    this.render();
  }

  /**
   * Load players for the active season
   */
  private async loadPlayers(): Promise<void> {
    if (!this.state.activeSeason) {
      this.state.players = [];
      return;
    }

    try {
      this.state.players = await this.playerManager.getAllPlayers(this.state.activeSeason.id);
      this.state.error = null;
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : 'Failed to load players';
    }
  }

  /**
   * Create a new player
   */
  private async createPlayer(formData: PlayerFormData): Promise<void> {
    try {
      const playerInfo: PlayerInfo = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        handedness: formData.handedness,
        timePreference: formData.timePreference
      };

      const newPlayer = await this.playerManager.addPlayer(playerInfo);
      this.state.players.push(newPlayer);
      this.state.isCreating = false;
      this.state.error = null;
      this.render();
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : 'Failed to create player';
      this.render();
    }
  }

  /**
   * Update an existing player
   */
  private async updatePlayer(playerId: string, formData: PlayerFormData): Promise<void> {
    try {
      const updates: Partial<PlayerInfo> = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        handedness: formData.handedness,
        timePreference: formData.timePreference
      };

      const updatedPlayer = await this.playerManager.updatePlayer(playerId, updates);
      
      // Update the player in the local state
      const index = this.state.players.findIndex(p => p.id === playerId);
      if (index !== -1) {
        this.state.players[index] = updatedPlayer;
      }
      
      this.state.editingPlayer = null;
      this.state.error = null;
      this.render();
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : 'Failed to update player';
      this.render();
    }
  }

  /**
   * Delete a player
   */
  private async deletePlayer(playerId: string): Promise<void> {
    const player = this.state.players.find(p => p.id === playerId);
    if (!player) return;

    if (!confirm(`Are you sure you want to remove ${player.firstName} ${player.lastName}? This will remove them from all schedules.`)) {
      return;
    }

    try {
      await this.playerManager.removePlayer(playerId);
      this.state.players = this.state.players.filter(p => p.id !== playerId);
      this.state.error = null;
      this.render();
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : 'Failed to delete player';
      this.render();
    }
  }

  /**
   * Filter players based on search term
   */
  private getFilteredPlayers(): Player[] {
    if (!this.state.searchTerm) {
      return this.state.players;
    }

    const searchLower = this.state.searchTerm.toLowerCase();
    return this.state.players.filter(player => 
      player.firstName.toLowerCase().includes(searchLower) ||
      player.lastName.toLowerCase().includes(searchLower) ||
      `${player.firstName} ${player.lastName}`.toLowerCase().includes(searchLower)
    );
  }

  /**
   * Render the UI
   */
  private render(): void {
    if (!this.state.activeSeason) {
      this.container.innerHTML = `
        <div class="player-management">
          <div class="no-active-season">
            <h2>Player Management</h2>
            <p>Please select an active season to manage players.</p>
          </div>
        </div>
      `;
      return;
    }

    const filteredPlayers = this.getFilteredPlayers();

    this.container.innerHTML = `
      <div class="player-management">
        <div class="player-header">
          <h2>Player Management</h2>
          <div class="header-actions">
            <div class="search-box">
              <input type="text" id="player-search" placeholder="Search players..." 
                     value="${this.state.searchTerm}">
            </div>
            <button class="btn btn-primary" onclick="playerUI.showCreateForm()">
              Add Player
            </button>
          </div>
        </div>

        <div class="season-info">
          <p>Managing players for: <strong>${this.state.activeSeason.name}</strong></p>
          <p>${this.state.players.length} total players</p>
        </div>

        ${this.state.error ? `
          <div class="alert alert-error">
            ${this.state.error}
          </div>
        ` : ''}

        ${this.state.isCreating ? this.renderPlayerForm() : ''}
        ${this.state.editingPlayer ? this.renderPlayerForm(this.state.editingPlayer) : ''}

        <div class="players-list">
          ${filteredPlayers.length === 0 ? `
            <div class="no-players">
              ${this.state.searchTerm ? 
                `<p>No players found matching "${this.state.searchTerm}"</p>` :
                `<p>No players added yet. Click "Add Player" to get started.</p>`
              }
            </div>
          ` : `
            <div class="players-table">
              <div class="table-header">
                <div class="col-name">Name</div>
                <div class="col-handedness">Handedness</div>
                <div class="col-preference">Time Preference</div>
                <div class="col-actions">Actions</div>
              </div>
              ${filteredPlayers.map(player => this.renderPlayerRow(player)).join('')}
            </div>
          `}
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  /**
   * Render the player form (create or edit)
   */
  private renderPlayerForm(player?: Player): string {
    const isEditing = !!player;
    const title = isEditing ? 'Edit Player' : 'Add New Player';
    
    return `
      <div class="player-form">
        <h3>${title}</h3>
        <form id="player-form">
          <div class="form-row">
            <div class="form-group">
              <label for="first-name">First Name</label>
              <input type="text" id="first-name" name="firstName" required maxlength="50"
                     value="${player?.firstName || ''}">
            </div>
            
            <div class="form-group">
              <label for="last-name">Last Name</label>
              <input type="text" id="last-name" name="lastName" required maxlength="50"
                     value="${player?.lastName || ''}">
            </div>
          </div>
          
          <div class="form-row">
            <div class="form-group">
              <label for="handedness">Handedness</label>
              <select id="handedness" name="handedness" required>
                <option value="">Select handedness</option>
                <option value="left" ${player?.handedness === 'left' ? 'selected' : ''}>Left</option>
                <option value="right" ${player?.handedness === 'right' ? 'selected' : ''}>Right</option>
              </select>
            </div>
            
            <div class="form-group">
              <label for="time-preference">Time Preference</label>
              <select id="time-preference" name="timePreference" required>
                <option value="">Select preference</option>
                <option value="AM" ${player?.timePreference === 'AM' ? 'selected' : ''}>Morning (AM)</option>
                <option value="PM" ${player?.timePreference === 'PM' ? 'selected' : ''}>Afternoon (PM)</option>
                <option value="Either" ${player?.timePreference === 'Either' ? 'selected' : ''}>Either</option>
              </select>
            </div>
          </div>
          
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">
              ${isEditing ? 'Update Player' : 'Add Player'}
            </button>
            <button type="button" class="btn btn-secondary" onclick="playerUI.cancelForm()">
              Cancel
            </button>
          </div>
        </form>
      </div>
    `;
  }

  /**
   * Render a player row in the table
   */
  private renderPlayerRow(player: Player): string {
    return `
      <div class="player-row">
        <div class="col-name">
          <strong>${player.firstName} ${player.lastName}</strong>
        </div>
        <div class="col-handedness">
          <span class="handedness-badge ${player.handedness}">
            ${player.handedness === 'left' ? 'Left' : 'Right'}
          </span>
        </div>
        <div class="col-preference">
          <span class="preference-badge ${player.timePreference.toLowerCase()}">
            ${player.timePreference}
          </span>
        </div>
        <div class="col-actions">
          <button class="btn btn-sm btn-secondary" onclick="playerUI.editPlayer('${player.id}')">
            Edit
          </button>
          <button class="btn btn-sm btn-danger" onclick="playerUI.deletePlayer('${player.id}')">
            Remove
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Attach event listeners
   */
  private attachEventListeners(): void {
    // Search functionality
    const searchInput = this.container.querySelector('#player-search') as HTMLInputElement;
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.state.searchTerm = (e.target as HTMLInputElement).value;
        this.render();
      });
    }

    // Player form submission
    const form = this.container.querySelector('#player-form') as HTMLFormElement;
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        const playerData: PlayerFormData = {
          firstName: formData.get('firstName') as string,
          lastName: formData.get('lastName') as string,
          handedness: formData.get('handedness') as 'left' | 'right',
          timePreference: formData.get('timePreference') as 'AM' | 'PM' | 'Either'
        };

        if (this.state.editingPlayer) {
          this.updatePlayer(this.state.editingPlayer.id, playerData);
        } else {
          this.createPlayer(playerData);
        }
      });
    }

    // Bind methods to window for onclick handlers
    (window as any).playerUI = {
      showCreateForm: () => {
        this.state.isCreating = true;
        this.state.editingPlayer = null;
        this.render();
      },
      cancelForm: () => {
        this.state.isCreating = false;
        this.state.editingPlayer = null;
        this.render();
      },
      editPlayer: (playerId: string) => {
        const player = this.state.players.find(p => p.id === playerId);
        if (player) {
          this.state.editingPlayer = player;
          this.state.isCreating = false;
          this.render();
        }
      },
      deletePlayer: (playerId: string) => {
        this.deletePlayer(playerId);
      }
    };
  }

  /**
   * Get all players for the current season
   */
  getPlayers(): Player[] {
    return this.state.players;
  }

  /**
   * Refresh the players list
   */
  async refresh(): Promise<void> {
    await this.loadPlayers();
    this.render();
  }
}