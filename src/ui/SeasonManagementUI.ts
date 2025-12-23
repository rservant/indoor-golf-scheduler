import { Season } from '../models/Season';
import { SeasonManager } from '../services/SeasonManager';

export interface SeasonManagementUIState {
  seasons: Season[];
  activeSeason: Season | null;
  isCreating: boolean;
  selectedSeason: Season | null;
  error: string | null;
}

export interface SeasonFormData {
  name: string;
  startDate: string;
  endDate: string;
}

export class SeasonManagementUI {
  private state: SeasonManagementUIState;
  private seasonManager: SeasonManager;
  public container: HTMLElement;
  private onSeasonChange?: (season: Season | null) => void;

  constructor(seasonManager: SeasonManager, container: HTMLElement) {
    this.seasonManager = seasonManager;
    this.container = container;
    this.state = {
      seasons: [],
      activeSeason: null,
      isCreating: false,
      selectedSeason: null,
      error: null
    };
  }

  /**
   * Initialize the UI and load initial data
   */
  async initialize(): Promise<void> {
    await this.loadSeasons();
    this.render();
  }

  /**
   * Set callback for when active season changes
   */
  onActiveSeasonChange(callback: (season: Season | null) => void): void {
    this.onSeasonChange = callback;
  }

  /**
   * Load all seasons from the service
   */
  private async loadSeasons(): Promise<void> {
    try {
      const [seasons, activeSeason] = await Promise.all([
        this.seasonManager.getAllSeasons(),
        this.seasonManager.getActiveSeason()
      ]);
      
      this.state.seasons = seasons;
      this.state.activeSeason = activeSeason;
      this.state.error = null;
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : 'Failed to load seasons';
    }
  }

  /**
   * Create a new season
   */
  private async createSeason(formData: SeasonFormData): Promise<void> {
    try {
      const startDate = new Date(formData.startDate);
      const endDate = new Date(formData.endDate);
      
      const newSeason = await this.seasonManager.createSeason(
        formData.name,
        startDate,
        endDate
      );
      
      this.state.seasons.push(newSeason);
      this.state.isCreating = false;
      this.state.error = null;
      this.render();
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : 'Failed to create season';
      this.render();
    }
  }

  /**
   * Set a season as active
   */
  private async setActiveSeason(seasonId: string): Promise<void> {
    try {
      const activatedSeason = await this.seasonManager.setActiveSeason(seasonId);
      this.state.activeSeason = activatedSeason;
      this.state.error = null;
      
      // Update the seasons list to reflect the change
      this.state.seasons = this.state.seasons.map(season => ({
        ...season,
        isActive: season.id === seasonId
      }));
      
      this.render();
      
      // Notify listeners of the change
      if (this.onSeasonChange) {
        this.onSeasonChange(activatedSeason);
      }
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : 'Failed to activate season';
      this.render();
    }
  }

  /**
   * Delete a season
   */
  private async deleteSeason(seasonId: string): Promise<void> {
    if (!confirm('Are you sure you want to delete this season? This action cannot be undone.')) {
      return;
    }

    try {
      await this.seasonManager.deleteSeason(seasonId);
      this.state.seasons = this.state.seasons.filter(s => s.id !== seasonId);
      
      if (this.state.activeSeason?.id === seasonId) {
        this.state.activeSeason = null;
        if (this.onSeasonChange) {
          this.onSeasonChange(null);
        }
      }
      
      this.state.error = null;
      this.render();
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : 'Failed to delete season';
      this.render();
    }
  }

  /**
   * Render the UI
   */
  private render(): void {
    this.container.innerHTML = `
      <div class="season-management">
        <div class="season-header">
          <h2>Season Management</h2>
          <button class="btn btn-primary" onclick="this.showCreateForm()">
            Create New Season
          </button>
        </div>

        ${this.state.error ? `
          <div class="alert alert-error">
            ${this.state.error}
          </div>
        ` : ''}

        ${this.state.activeSeason ? `
          <div class="active-season">
            <h3>Active Season</h3>
            <div class="season-card active">
              <div class="season-info">
                <h4>${this.state.activeSeason.name}</h4>
                <p>${this.formatDateRange(this.state.activeSeason.startDate, this.state.activeSeason.endDate)}</p>
                <p>${this.state.activeSeason.playerIds.length} players</p>
              </div>
            </div>
          </div>
        ` : `
          <div class="no-active-season">
            <p>No active season selected. Please select a season to begin scheduling.</p>
          </div>
        `}

        ${this.state.isCreating ? this.renderCreateForm() : ''}

        <div class="seasons-list">
          <h3>All Seasons</h3>
          ${this.state.seasons.length === 0 ? `
            <p class="no-seasons">No seasons created yet.</p>
          ` : `
            <div class="seasons-grid">
              ${this.state.seasons.map(season => this.renderSeasonCard(season)).join('')}
            </div>
          `}
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  /**
   * Render the create season form
   */
  private renderCreateForm(): string {
    return `
      <div class="create-season-form">
        <h3>Create New Season</h3>
        <form id="season-form">
          <div class="form-group">
            <label for="season-name">Season Name</label>
            <input type="text" id="season-name" name="name" required maxlength="100">
          </div>
          
          <div class="form-row">
            <div class="form-group">
              <label for="start-date">Start Date</label>
              <input type="date" id="start-date" name="startDate" required>
            </div>
            
            <div class="form-group">
              <label for="end-date">End Date</label>
              <input type="date" id="end-date" name="endDate" required>
            </div>
          </div>
          
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">Create Season</button>
            <button type="button" class="btn btn-secondary" onclick="this.cancelCreate()">
              Cancel
            </button>
          </div>
        </form>
      </div>
    `;
  }

  /**
   * Render a season card
   */
  private renderSeasonCard(season: Season): string {
    return `
      <div class="season-card ${season.isActive ? 'active' : ''}">
        <div class="season-info">
          <h4>${season.name}</h4>
          <p>${this.formatDateRange(season.startDate, season.endDate)}</p>
          <p>${season.playerIds.length} players, ${season.weekIds.length} weeks</p>
        </div>
        
        <div class="season-actions">
          ${!season.isActive ? `
            <button class="btn btn-sm btn-primary" onclick="this.activateSeason('${season.id}')">
              Activate
            </button>
          ` : `
            <span class="active-badge">Active</span>
          `}
          
          <button class="btn btn-sm btn-danger" onclick="this.deleteSeason('${season.id}')"
                  ${season.playerIds.length > 0 || season.weekIds.length > 0 ? 'disabled title="Cannot delete season with players or weeks"' : ''}>
            Delete
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Format date range for display
   */
  private formatDateRange(startDate: Date, endDate: Date): string {
    const options: Intl.DateTimeFormatOptions = { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    };
    
    return `${startDate.toLocaleDateString('en-US', options)} - ${endDate.toLocaleDateString('en-US', options)}`;
  }

  /**
   * Attach event listeners to the rendered elements
   */
  private attachEventListeners(): void {
    // Create season form submission
    const form = this.container.querySelector('#season-form') as HTMLFormElement;
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        this.createSeason({
          name: formData.get('name') as string,
          startDate: formData.get('startDate') as string,
          endDate: formData.get('endDate') as string
        });
      });
    }

    // Bind methods to window for onclick handlers
    (window as any).seasonUI = {
      showCreateForm: () => {
        this.state.isCreating = true;
        this.render();
      },
      cancelCreate: () => {
        this.state.isCreating = false;
        this.render();
      },
      activateSeason: (seasonId: string) => {
        this.setActiveSeason(seasonId);
      },
      deleteSeason: (seasonId: string) => {
        this.deleteSeason(seasonId);
      }
    };

    // Update onclick handlers to use the bound methods
    this.container.querySelectorAll('[onclick]').forEach(element => {
      const onclick = element.getAttribute('onclick');
      if (onclick) {
        element.setAttribute('onclick', onclick.replace('this.', 'seasonUI.'));
      }
    });
  }

  /**
   * Get the current active season
   */
  getActiveSeason(): Season | null {
    return this.state.activeSeason;
  }

  /**
   * Refresh the seasons list
   */
  async refresh(): Promise<void> {
    await this.loadSeasons();
    this.render();
  }
}