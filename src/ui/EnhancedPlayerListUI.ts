/**
 * Enhanced Player List UI with Virtual Scrolling and Progressive Loading
 * Optimizes rendering for large player lists
 */

import { Player } from '../models/Player';
import { VirtualScrollRenderer, VirtualScrollItem, ItemRenderer } from './VirtualScrollRenderer';
import { ProgressiveLoadingManager, DataLoader } from './ProgressiveLoadingManager';

/**
 * HTML Sanitization utility to prevent XSS attacks
 */
class HTMLSanitizer {
  /**
   * Escape HTML special characters to prevent XSS
   */
  static escapeHTML(input: string): string {
    if (typeof input !== 'string') {
      return String(input);
    }
    
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  /**
   * Sanitize content for use in HTML attributes
   */
  static sanitizeAttribute(input: string): string {
    if (typeof input !== 'string') {
      return String(input);
    }
    
    // Remove any potentially dangerous characters for attributes
    return input
      .replace(/[<>"'&]/g, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+=/gi, '');
  }

  /**
   * Remove dangerous event handlers and scripts from text
   */
  static sanitizeText(input: string): string {
    if (typeof input !== 'string') {
      return String(input);
    }
    
    // First escape HTML
    let sanitized = this.escapeHTML(input);
    
    // Then remove any remaining event handlers that might have been partially escaped
    sanitized = sanitized.replace(/on\w+=/gi, '');
    
    return sanitized;
  }

  /**
   * Create a text node safely (alternative to innerHTML)
   */
  static createTextNode(text: string): Text {
    return document.createTextNode(text);
  }

  /**
   * Set text content safely
   */
  static setTextContent(element: HTMLElement, text: string): void {
    element.textContent = text;
  }
}

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
   * Create search header using safe DOM manipulation
   */
  private createSearchHeader(): void {
    const header = document.createElement('div');
    header.className = 'player-list-header';

    // Create search container
    const searchContainer = document.createElement('div');
    searchContainer.className = 'search-container';

    // Create search input with sanitized value
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'player-search-input';
    searchInput.placeholder = 'Search players...';
    searchInput.value = HTMLSanitizer.sanitizeAttribute(this.state.searchTerm);

    // Create player count display
    const playerCount = document.createElement('div');
    playerCount.className = 'player-count';
    
    // Safely set the count text
    const countText = `${this.state.filteredPlayers.length} players`;
    const selectedText = this.state.selectedPlayers.size > 0 
      ? ` (${this.state.selectedPlayers.size} selected)` 
      : '';
    HTMLSanitizer.setTextContent(playerCount, countText + selectedText);

    // Assemble search container
    searchContainer.appendChild(searchInput);
    searchContainer.appendChild(playerCount);
    header.appendChild(searchContainer);

    // Add loading progress if needed
    if (this.state.isLoading) {
      const loadingProgress = document.createElement('div');
      loadingProgress.className = 'loading-progress';

      const progressBar = document.createElement('div');
      progressBar.className = 'progress-bar';

      const progressFill = document.createElement('div');
      progressFill.className = 'progress-fill';
      progressFill.style.width = `${Math.max(0, Math.min(100, this.state.loadingProgress))}%`;

      const progressText = document.createElement('span');
      progressText.className = 'progress-text';
      HTMLSanitizer.setTextContent(progressText, `${Math.round(this.state.loadingProgress)}%`);

      progressBar.appendChild(progressFill);
      loadingProgress.appendChild(progressBar);
      loadingProgress.appendChild(progressText);
      header.appendChild(loadingProgress);
    }

    // Add search event listener
    searchInput.addEventListener('input', (e) => {
      this.handleSearch((e.target as HTMLInputElement).value);
    });

    this.container.appendChild(header);
  }

  /**
   * Render a single player item using safe DOM manipulation
   */
  private renderPlayerItem(player: Player, index: number): HTMLElement {
    const element = document.createElement('div');
    element.className = `player-item ${this.state.selectedPlayers.has(player.id) ? 'selected' : ''}`;
    element.style.height = `${this.config.itemHeight}px`;
    
    // Create player checkbox container
    const checkboxContainer = document.createElement('div');
    checkboxContainer.className = 'player-checkbox';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `player-${HTMLSanitizer.sanitizeAttribute(player.id)}`;
    checkbox.checked = this.state.selectedPlayers.has(player.id);
    
    checkboxContainer.appendChild(checkbox);

    // Create player info container
    const playerInfo = document.createElement('div');
    playerInfo.className = 'player-info';

    // Create player name (safely)
    const playerName = document.createElement('div');
    playerName.className = 'player-name';
    HTMLSanitizer.setTextContent(playerName, `${player.firstName} ${player.lastName}`);

    // Create player details
    const playerDetails = document.createElement('div');
    playerDetails.className = 'player-details';

    // Create handedness badge
    const handednessBadge = document.createElement('span');
    handednessBadge.className = `handedness-badge ${HTMLSanitizer.sanitizeAttribute(player.handedness)}`;
    HTMLSanitizer.setTextContent(handednessBadge, player.handedness.charAt(0).toUpperCase());

    // Create preference badge
    const preferenceBadge = document.createElement('span');
    preferenceBadge.className = `preference-badge ${HTMLSanitizer.sanitizeAttribute(player.timePreference.toLowerCase())}`;
    HTMLSanitizer.setTextContent(preferenceBadge, player.timePreference);

    playerDetails.appendChild(handednessBadge);
    playerDetails.appendChild(preferenceBadge);
    playerInfo.appendChild(playerName);
    playerInfo.appendChild(playerDetails);

    // Create player actions
    const playerActions = document.createElement('div');
    playerActions.className = 'player-actions';

    // Create edit button
    const editBtn = document.createElement('button');
    editBtn.className = 'action-btn edit-btn';
    editBtn.setAttribute('data-action', 'edit');
    editBtn.title = 'Edit player';
    HTMLSanitizer.setTextContent(editBtn, '✏️');

    // Create remove button
    const removeBtn = document.createElement('button');
    removeBtn.className = 'action-btn remove-btn';
    removeBtn.setAttribute('data-action', 'remove');
    removeBtn.title = 'Remove player';
    HTMLSanitizer.setTextContent(removeBtn, '🗑️');

    playerActions.appendChild(editBtn);
    playerActions.appendChild(removeBtn);

    // Assemble the complete element
    element.appendChild(checkboxContainer);
    element.appendChild(playerInfo);
    element.appendChild(playerActions);

    // Add event listeners
    checkbox.addEventListener('change', () => {
      this.handlePlayerSelection(player, checkbox.checked);
    });

    const actionButtons = [editBtn, removeBtn];
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
   * Update header count display safely
   */
  private updateHeaderCount(): void {
    const countElement = this.container.querySelector('.player-count');
    if (countElement) {
      const countText = `${this.state.filteredPlayers.length} players` +
        (this.state.selectedPlayers.size > 0 ? ` (${this.state.selectedPlayers.size} selected)` : '');
      HTMLSanitizer.setTextContent(countElement as HTMLElement, countText);
    }
  }

  /**
   * Update loading progress display safely
   */
  private updateLoadingProgress(): void {
    const progressFill = this.container.querySelector('.progress-fill') as HTMLElement;
    const progressText = this.container.querySelector('.progress-text') as HTMLElement;
    
    if (progressFill) {
      // Ensure progress is within valid range
      const safeProgress = Math.max(0, Math.min(100, this.state.loadingProgress));
      progressFill.style.width = `${safeProgress}%`;
    }
    
    if (progressText) {
      HTMLSanitizer.setTextContent(progressText, `${Math.round(this.state.loadingProgress)}%`);
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
   * Render the component safely
   */
  private render(): void {
    if (this.state.isLoading) {
      // Clear container
      this.container.innerHTML = '';
      
      // Create loading state elements safely
      const loadingState = document.createElement('div');
      loadingState.className = 'loading-state';

      const loadingSpinner = document.createElement('div');
      loadingSpinner.className = 'loading-spinner';

      const loadingText = document.createElement('div');
      loadingText.className = 'loading-text';
      HTMLSanitizer.setTextContent(loadingText, 'Loading players...');

      const progressBar = document.createElement('div');
      progressBar.className = 'progress-bar';

      const progressFill = document.createElement('div');
      progressFill.className = 'progress-fill';
      const safeProgress = Math.max(0, Math.min(100, this.state.loadingProgress));
      progressFill.style.width = `${safeProgress}%`;

      progressBar.appendChild(progressFill);
      loadingState.appendChild(loadingSpinner);
      loadingState.appendChild(loadingText);
      loadingState.appendChild(progressBar);
      this.container.appendChild(loadingState);
    } else if (this.state.players.length === 0) {
      // Clear container
      this.container.innerHTML = '';
      
      // Create empty state elements safely
      const emptyState = document.createElement('div');
      emptyState.className = 'empty-state';

      const emptyIcon = document.createElement('div');
      emptyIcon.className = 'empty-icon';
      HTMLSanitizer.setTextContent(emptyIcon, '👥');

      const emptyText = document.createElement('div');
      emptyText.className = 'empty-text';
      HTMLSanitizer.setTextContent(emptyText, 'No players available');

      emptyState.appendChild(emptyIcon);
      emptyState.appendChild(emptyText);
      this.container.appendChild(emptyState);
    } else {
      // Will be handled by setupDirectRendering or setupVirtualScrolling
    }
  }
}