/**
 * Enhanced Player List UI with Virtual Scrolling and Progressive Loading
 * Optimizes rendering for large player lists
 */

import { Player } from '../models/Player';
import { VirtualScrollRenderer, VirtualScrollItem, ItemRenderer } from './VirtualScrollRenderer';
import { ProgressiveLoadingManager, DataLoader } from './ProgressiveLoadingManager';

export interface EnhancedPlayerListConfig {
  containerHeight: number;
  itemHeight: number;
  enableVirtualScrolling: boolean;
  enableProgressiveLoading: boolean;
  progressiveLoadingThreshold: number;
  chunkSize: number;
}

export interface PlayerListState {
  players: Player[];
  filteredPlayers: Player[];
  searchTerm: string;
  selectedPlayers: Set<string>;
  isLoading: boolean;
  loadingProgress: number;
}

export class EnhancedPlayerListUI {
  private container: HTMLElement;
  private config: EnhancedPlayerListConfig;
  private state: PlayerListState;
  private virtualScrollRenderer?: VirtualScrollRenderer<Player>;
  private progressiveLoader?: ProgressiveLoadingManager<Player>;
  private dataLoader?: DataLoader<Player>;
  private onPlayerSelect?: (player: Player, selected: boolean) => void;
  private onPlayerAction?: (player: Player, action: string) => void;

  constructor(
    container: HTMLElement,
    config: Partial<EnhancedPlayerListConfig> = {}
  ) {
    this.container = container;
    this.config = {
      containerHeight: 400,
      itemHeight: 60,
      enableVirtualScrolling: true,
      enableProgressiveLoading: true,
      progressiveLoadingThreshold: 100,
      chunkSize: 50,
      ...config
    };

    this.state = {
      players: [],
      filteredPlayers: [],
      searchTerm: '',
      selectedPlayers: new Set(),
      isLoading: false,
      loadingProgress: 0
    };

    this.initialize();
  }

  /**
   * Initialize the enhanced player list UI
   */
  private initialize(): void {
    this.container.className = 'enhanced-player-list';
    this.render();
  }

  /**
   * Set the data loader for progressive loading
   */
  setDataLoader(loader: DataLoader<Player>): void {
    this.dataLoader = loader;
  }

  /**
   * Set players data
   */
  async setPlayers(players: Player[]): Promise<void> {
    this.state.players = players;
    this.state.filteredPlayers = players;

    // Use progressive loading for large datasets
    if (this.config.enableProgressiveLoading && 
        players.length > this.config.progressiveLoadingThreshold &&
        this.dataLoader) {
      await this.setupProgressiveLoading();
    } else {
      await this.setupDirectRendering();
    }
  }

  /**
   * Setup progressive loading for large datasets
   */
  private async setupProgressiveLoading(): Promise<void> {
    if (!this.dataLoader) return;

    this.state.isLoading = true;
    this.render();

    this.progressiveLoader = new ProgressiveLoadingManager(
      {
        chunkSize: this.config.chunkSize,
        loadDelay: 100,
        maxConcurrentLoads: 3,
        enablePreloading: true
      },
      this.dataLoader,
      (loaded, total) => {
        this.state.loadingProgress = (loaded / total) * 100;
        this.updateLoadingProgress();
      }
    );

    await this.progressiveLoader.initialize(this.state.players.length);
    
    this.state.isLoading = false;
    this.setupVirtualScrolling();
  }

  /**
   * Setup direct rendering for smaller datasets
   */
  private async setupDirectRendering(): Promise<void> {
    if (this.config.enableVirtualScrolling && 
        this.state.filteredPlayers.length > 20) {
      this.setupVirtualScrolling();
    } else {
      this.renderDirectly();
    }
  }

  /**
   * Setup virtual scrolling
   */
  private setupVirtualScrolling(): void {
    // Clear container
    this.container.innerHTML = '';

    // Create search header
    this.createSearchHeader();

    // Create virtual scroll container
    const scrollContainer = document.createElement('div');
    scrollContainer.className = 'player-list-scroll-container';
    this.container.appendChild(scrollContainer);

    // Create virtual scroll items
    const items: VirtualScrollItem[] = this.state.filteredPlayers.map(player => ({
      id: player.id,
      data: player
    }));

    // Create item renderer
    const itemRenderer: ItemRenderer<Player> = ({ item, index }) => {
      return this.renderPlayerItem(item.data, index);
    };

    // Create virtual scroll renderer
    this.virtualScrollRenderer = new VirtualScrollRenderer<Player>(
      scrollContainer,
      {
        itemHeight: this.config.itemHeight,
        containerHeight: this.config.containerHeight,
        overscan: 5
      },
      itemRenderer
    );

    this.virtualScrollRenderer.setItems(items);

    // Setup scroll-based progressive loading
    if (this.progressiveLoader) {
      this.setupScrollBasedLoading();
    }
  }

  /**
   * Setup scroll-based progressive loading
   */
  private setupScrollBasedLoading(): void {
    if (!this.virtualScrollRenderer || !this.progressiveLoader) return;

    const scrollContainer = this.container.querySelector('.virtual-scroll-container') as HTMLElement;
    if (!scrollContainer) return;

    let lastScrollTop = 0;
    scrollContainer.addEventListener('scroll', () => {
      const currentScrollTop = scrollContainer.scrollTop;
      const scrollDirection = currentScrollTop > lastScrollTop ? 'down' : 'up';
      lastScrollTop = currentScrollTop;

      // Get visible range
      const visibleRange = this.virtualScrollRenderer!.getVisibleRange();
      const centerIndex = Math.floor((visibleRange.start + visibleRange.end) / 2);

      // Preload around visible area
      this.progressiveLoader!.preloadAround(centerIndex, 2);

      // Load ahead if scrolling down
      if (scrollDirection === 'down') {
        const preloadIndex = visibleRange.end + 20;
        this.progressiveLoader!.preloadAround(preloadIndex, 1);
      }
    });
  }

  /**
   * Render directly without virtual scrolling
   */
  private renderDirectly(): void {
    this.container.innerHTML = '';
    
    // Create search header
    this.createSearchHeader();

    // Create player list container
    const listContainer = document.createElement('div');
    listContainer.className = 'player-list-direct';
    listContainer.style.maxHeight = `${this.config.containerHeight}px`;
    listContainer.style.overflowY = 'auto';

    // Render all players
    this.state.filteredPlayers.forEach((player, index) => {
      const playerElement = this.renderPlayerItem(player, index);
      listContainer.appendChild(playerElement);
    });

    this.container.appendChild(listContainer);
  }

  /**
   * Create search header
   */
  private createSearchHeader(): void {
    const header = document.createElement('div');
    header.className = 'player-list-header';
    header.innerHTML = `
      <div class="search-container">
        <input type="text" 
               class="player-search-input" 
               placeholder="Search players..." 
               value="${this.state.searchTerm}">
        <div class="player-count">
          ${this.state.filteredPlayers.length} players
          ${this.state.selectedPlayers.size > 0 ? `(${this.state.selectedPlayers.size} selected)` : ''}
        </div>
      </div>
      ${this.state.isLoading ? `
        <div class="loading-progress">
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${this.state.loadingProgress}%"></div>
          </div>
          <span class="progress-text">${Math.round(this.state.loadingProgress)}%</span>
        </div>
      ` : ''}
    `;

    // Add search event listener
    const searchInput = header.querySelector('.player-search-input') as HTMLInputElement;
    searchInput.addEventListener('input', (e) => {
      this.handleSearch((e.target as HTMLInputElement).value);
    });

    this.container.appendChild(header);
  }

  /**
   * Render a single player item
   */
  private renderPlayerItem(player: Player, index: number): HTMLElement {
    const element = document.createElement('div');
    element.className = `player-item ${this.state.selectedPlayers.has(player.id) ? 'selected' : ''}`;
    element.style.height = `${this.config.itemHeight}px`;
    
    element.innerHTML = `
      <div class="player-checkbox">
        <input type="checkbox" 
               id="player-${player.id}" 
               ${this.state.selectedPlayers.has(player.id) ? 'checked' : ''}>
      </div>
      <div class="player-info">
        <div class="player-name">${player.firstName} ${player.lastName}</div>
        <div class="player-details">
          <span class="handedness-badge ${player.handedness}">
            ${player.handedness.charAt(0).toUpperCase()}
          </span>
          <span class="preference-badge ${player.timePreference.toLowerCase()}">
            ${player.timePreference}
          </span>
        </div>
      </div>
      <div class="player-actions">
        <button class="action-btn edit-btn" data-action="edit" title="Edit player">
          ✏️
        </button>
        <button class="action-btn remove-btn" data-action="remove" title="Remove player">
          🗑️
        </button>
      </div>
    `;

    // Add event listeners
    const checkbox = element.querySelector('input[type="checkbox"]') as HTMLInputElement;
    checkbox.addEventListener('change', () => {
      this.handlePlayerSelection(player, checkbox.checked);
    });

    const actionButtons = element.querySelectorAll('.action-btn');
    actionButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        const action = (e.target as HTMLElement).getAttribute('data-action');
        if (action && this.onPlayerAction) {
          this.onPlayerAction(player, action);
        }
      });
    });

    return element;
  }

  /**
   * Handle search input
   */
  private handleSearch(searchTerm: string): void {
    this.state.searchTerm = searchTerm.toLowerCase();
    
    if (searchTerm === '') {
      this.state.filteredPlayers = this.state.players;
    } else {
      this.state.filteredPlayers = this.state.players.filter(player =>
        player.firstName.toLowerCase().includes(this.state.searchTerm) ||
        player.lastName.toLowerCase().includes(this.state.searchTerm) ||
        `${player.firstName} ${player.lastName}`.toLowerCase().includes(this.state.searchTerm)
      );
    }

    // Re-render with filtered results
    this.refresh();
  }

  /**
   * Handle player selection
   */
  private handlePlayerSelection(player: Player, selected: boolean): void {
    if (selected) {
      this.state.selectedPlayers.add(player.id);
    } else {
      this.state.selectedPlayers.delete(player.id);
    }

    if (this.onPlayerSelect) {
      this.onPlayerSelect(player, selected);
    }

    // Update header count
    this.updateHeaderCount();
  }

  /**
   * Update header count display
   */
  private updateHeaderCount(): void {
    const countElement = this.container.querySelector('.player-count');
    if (countElement) {
      countElement.textContent = `${this.state.filteredPlayers.length} players` +
        (this.state.selectedPlayers.size > 0 ? ` (${this.state.selectedPlayers.size} selected)` : '');
    }
  }

  /**
   * Update loading progress display
   */
  private updateLoadingProgress(): void {
    const progressFill = this.container.querySelector('.progress-fill') as HTMLElement;
    const progressText = this.container.querySelector('.progress-text') as HTMLElement;
    
    if (progressFill) {
      progressFill.style.width = `${this.state.loadingProgress}%`;
    }
    
    if (progressText) {
      progressText.textContent = `${Math.round(this.state.loadingProgress)}%`;
    }
  }

  /**
   * Set event handlers
   */
  setEventHandlers(handlers: {
    onPlayerSelect?: (player: Player, selected: boolean) => void;
    onPlayerAction?: (player: Player, action: string) => void;
  }): void {
    this.onPlayerSelect = handlers.onPlayerSelect || (() => {});
    this.onPlayerAction = handlers.onPlayerAction || (() => {});
  }

  /**
   * Get selected players
   */
  getSelectedPlayers(): Player[] {
    return this.state.players.filter(player => 
      this.state.selectedPlayers.has(player.id)
    );
  }

  /**
   * Clear selection
   */
  clearSelection(): void {
    this.state.selectedPlayers.clear();
    this.refresh();
  }

  /**
   * Select all visible players
   */
  selectAll(): void {
    this.state.filteredPlayers.forEach(player => {
      this.state.selectedPlayers.add(player.id);
    });
    this.refresh();
  }

  /**
   * Refresh the display
   */
  refresh(): void {
    if (this.config.enableVirtualScrolling && this.virtualScrollRenderer) {
      // Update virtual scroll items
      const items: VirtualScrollItem[] = this.state.filteredPlayers.map(player => ({
        id: player.id,
        data: player
      }));
      this.virtualScrollRenderer.setItems(items);
    } else {
      // Re-render directly
      this.renderDirectly();
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<EnhancedPlayerListConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    if (this.virtualScrollRenderer) {
      this.virtualScrollRenderer.updateConfig({
        containerHeight: this.config.containerHeight,
        itemHeight: this.config.itemHeight
      });
    }
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): any {
    const metrics: any = {
      totalPlayers: this.state.players.length,
      filteredPlayers: this.state.filteredPlayers.length,
      selectedPlayers: this.state.selectedPlayers.size,
      isVirtualScrolling: !!this.virtualScrollRenderer,
      isProgressiveLoading: !!this.progressiveLoader
    };

    if (this.virtualScrollRenderer) {
      metrics.virtualScrollMetrics = this.virtualScrollRenderer.getPerformanceMetrics();
    }

    if (this.progressiveLoader) {
      metrics.progressiveLoadingMetrics = this.progressiveLoader.getProgress();
    }

    return metrics;
  }

  /**
   * Destroy and clean up resources
   */
  destroy(): void {
    if (this.virtualScrollRenderer) {
      this.virtualScrollRenderer.destroy();
      this.virtualScrollRenderer = undefined as any;
    }

    if (this.progressiveLoader) {
      this.progressiveLoader.reset();
      this.progressiveLoader = undefined as any;
    }

    this.container.innerHTML = '';
  }

  /**
   * Render the component
   */
  private render(): void {
    if (this.state.isLoading) {
      this.container.innerHTML = `
        <div class="loading-state">
          <div class="loading-spinner"></div>
          <div class="loading-text">Loading players...</div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${this.state.loadingProgress}%"></div>
          </div>
        </div>
      `;
    } else if (this.state.players.length === 0) {
      this.container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">👥</div>
          <div class="empty-text">No players available</div>
        </div>
      `;
    } else {
      // Will be handled by setupDirectRendering or setupVirtualScrolling
    }
  }
}