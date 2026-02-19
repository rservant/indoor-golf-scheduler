/**
 * Optimized Schedule Renderer
 * 
 * Provides efficient rendering capabilities for schedule displays with:
 * - Cached foursome rendering
 * - Smooth animations and transitions
 * - Responsive layout optimization
 * - Progressive rendering for large schedules
 * 
 * Requirements: 2.1, 2.2, 2.4, 2.5
 */

import { Schedule } from '../models/Schedule';
import { Foursome } from '../models/Foursome';
import { Player } from '../models/Player';

export interface RenderCache {
  foursomes: Map<string, HTMLElement>;
  players: Map<string, HTMLElement>;
  timeSlots: Map<string, HTMLElement>;
  lastRenderHash: string;
}

export interface AnimationConfig {
  duration: number;
  easing: string;
  stagger: number;
}

export interface ResponsiveConfig {
  breakpoints: {
    mobile: number;
    tablet: number;
    desktop: number;
  };
  layouts: {
    mobile: LayoutConfig;
    tablet: LayoutConfig;
    desktop: LayoutConfig;
  };
}

export interface LayoutConfig {
  columnsPerRow: number;
  foursomeSpacing: number;
  playerSpacing: number;
  showPlayerDetails: boolean;
  compactMode: boolean;
}

export interface ProgressiveRenderConfig {
  chunkSize: number;
  renderDelay: number;
  prioritizeVisible: boolean;
  enableVirtualization: boolean;
}

export interface RenderMetrics {
  renderTime: number;
  cacheHitRate: number;
  elementsRendered: number;
  elementsFromCache: number;
  animationTime: number;
}

/**
 * Optimized renderer for schedule displays with caching and animations
 */
export class OptimizedScheduleRenderer {
  private cache: RenderCache;
  private animationConfig: AnimationConfig;
  private responsiveConfig: ResponsiveConfig;
  private progressiveConfig: ProgressiveRenderConfig;
  private currentViewport: 'mobile' | 'tablet' | 'desktop';
  private renderMetrics: RenderMetrics;
  private resizeObserver: ResizeObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private animationFrameId: number | null = null;

  constructor(
    animationConfig?: Partial<AnimationConfig>,
    responsiveConfig?: Partial<ResponsiveConfig>,
    progressiveConfig?: Partial<ProgressiveRenderConfig>
  ) {
    this.cache = {
      foursomes: new Map(),
      players: new Map(),
      timeSlots: new Map(),
      lastRenderHash: ''
    };

    this.animationConfig = {
      duration: 300,
      easing: 'cubic-bezier(0.4, 0.0, 0.2, 1)',
      stagger: 50,
      ...animationConfig
    };

    this.responsiveConfig = {
      breakpoints: {
        mobile: 768,
        tablet: 1024,
        desktop: 1200
      },
      layouts: {
        mobile: {
          columnsPerRow: 1,
          foursomeSpacing: 12,
          playerSpacing: 8,
          showPlayerDetails: false,
          compactMode: true
        },
        tablet: {
          columnsPerRow: 2,
          foursomeSpacing: 16,
          playerSpacing: 10,
          showPlayerDetails: true,
          compactMode: false
        },
        desktop: {
          columnsPerRow: 3,
          foursomeSpacing: 20,
          playerSpacing: 12,
          showPlayerDetails: true,
          compactMode: false
        }
      },
      ...responsiveConfig
    };

    this.progressiveConfig = {
      chunkSize: 4,
      renderDelay: 16, // ~60fps
      prioritizeVisible: true,
      enableVirtualization: false,
      ...progressiveConfig
    };

    this.currentViewport = this.detectViewport();
    this.renderMetrics = this.initializeMetrics();

    this.setupResponsiveHandling();
  }

  /**
   * Render schedule with optimizations
   */
  async renderSchedule(
    schedule: Schedule,
    container: HTMLElement,
    options: {
      isEditing?: boolean;
      showAnimations?: boolean;
      forceRefresh?: boolean;
    } = {}
  ): Promise<RenderMetrics> {
    const startTime = performance.now();
    const scheduleHash = this.generateScheduleHash(schedule);
    
    // Check if we can use cached render
    if (!options.forceRefresh && this.cache.lastRenderHash === scheduleHash) {
      return this.renderMetrics;
    }

    // Clear previous content with animation if enabled
    if (options.showAnimations && container.children.length > 0) {
      await this.animateOut(container);
    }

    // Create optimized layout structure
    const scheduleGrid = this.createScheduleGrid(container);
    
    // Render time slots progressively
    const morningSlot = await this.renderTimeSlot(
      'Morning (10:30 AM)',
      schedule.timeSlots.morning,
      'morning',
      options
    );
    
    const afternoonSlot = await this.renderTimeSlot(
      'Afternoon (1:00 PM)', 
      schedule.timeSlots.afternoon,
      'afternoon',
      options
    );

    // Add time slots to grid
    scheduleGrid.appendChild(morningSlot);
    scheduleGrid.appendChild(afternoonSlot);

    // Animate in if enabled
    if (options.showAnimations) {
      await this.animateIn(scheduleGrid);
    }

    // Update cache and metrics
    this.cache.lastRenderHash = scheduleHash;
    const renderTime = performance.now() - startTime;
    
    this.renderMetrics = {
      ...this.renderMetrics,
      renderTime,
      elementsRendered: this.countElements(scheduleGrid)
    };

    return this.renderMetrics;
  }

  /**
   * Render time slot with progressive loading
   */
  private async renderTimeSlot(
    title: string,
    foursomes: Foursome[],
    timeSlotId: string,
    options: { isEditing?: boolean; showAnimations?: boolean } = {}
  ): Promise<HTMLElement> {
    const cacheKey = `timeslot_${timeSlotId}_${foursomes.length}_${options.isEditing ? 'edit' : 'view'}_${this.currentViewport}`;
    
    // Check cache only if not in editing mode and has foursomes
    if (!options.isEditing && foursomes.length > 0 && this.cache.timeSlots.has(cacheKey)) {
      const cached = this.cache.timeSlots.get(cacheKey)!;
      this.renderMetrics.elementsFromCache++;
      return cached.cloneNode(true) as HTMLElement;
    }

    const timeSlotElement = document.createElement('div');
    timeSlotElement.className = `time-slot optimized ${this.currentViewport}`;
    timeSlotElement.setAttribute('data-timeslot', timeSlotId);

    // Create header
    const header = this.createTimeSlotHeader(title);
    timeSlotElement.appendChild(header);

    // Create foursomes container
    const foursomesContainer = document.createElement('div');
    foursomesContainer.className = `foursomes-container ${options.isEditing ? 'editing-mode' : ''}`;
    
    // Apply responsive layout
    this.applyResponsiveLayout(foursomesContainer);

    // Render foursomes progressively
    if (this.progressiveConfig.enableVirtualization && foursomes.length > 8) {
      await this.renderFoursomesVirtualized(foursomes, foursomesContainer, options);
    } else {
      await this.renderFoursomesProgressive(foursomes, foursomesContainer, options);
    }

    timeSlotElement.appendChild(foursomesContainer);

    // Cache if not in editing mode and has content
    if (!options.isEditing && foursomes.length > 0) {
      this.cache.timeSlots.set(cacheKey, timeSlotElement.cloneNode(true) as HTMLElement);
    }

    return timeSlotElement;
  }

  /**
   * Render foursomes progressively in chunks
   */
  private async renderFoursomesProgressive(
    foursomes: Foursome[],
    container: HTMLElement,
    options: { isEditing?: boolean; showAnimations?: boolean } = {}
  ): Promise<void> {
    const chunks = this.chunkArray(foursomes, this.progressiveConfig.chunkSize);
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkElements: HTMLElement[] = [];

      // Render chunk
      for (let j = 0; j < chunk.length; j++) {
        const foursome = chunk[j];
        const position = i * this.progressiveConfig.chunkSize + j + 1;
        const foursomeElement = await this.renderFoursome(foursome, position, options);
        chunkElements.push(foursomeElement);
      }

      // Add elements to container
      chunkElements.forEach(element => container.appendChild(element));

      // Animate in if enabled
      if (options.showAnimations) {
        await this.animateChunkIn(chunkElements, i * this.animationConfig.stagger);
      }

      // Yield control to browser between chunks
      if (i < chunks.length - 1) {
        await this.nextFrame();
      }
    }
  }

  /**
   * Render foursomes with virtualization for large lists
   */
  private async renderFoursomesVirtualized(
    foursomes: Foursome[],
    container: HTMLElement,
    options: { isEditing?: boolean; showAnimations?: boolean } = {}
  ): Promise<void> {
    // Create virtual container
    const virtualContainer = document.createElement('div');
    virtualContainer.className = 'virtual-foursomes-container';
    
    // Set up intersection observer for lazy loading
    const visibleFoursomes = new Set<number>();
    
    // Render placeholder elements
    foursomes.forEach((foursome, index) => {
      const placeholder = this.createFoursomePlaceholder(index + 1);
      virtualContainer.appendChild(placeholder);
      
      // Set up intersection observer
      if (this.intersectionObserver) {
        this.intersectionObserver.observe(placeholder);
      }
    });

    // Set up intersection observer
    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach(async (entry) => {
          if (entry.isIntersecting) {
            const index = parseInt(entry.target.getAttribute('data-index') || '0');
            if (!visibleFoursomes.has(index) && foursomes[index]) {
              visibleFoursomes.add(index);
              const foursomeElement = await this.renderFoursome(
                foursomes[index], 
                index + 1, 
                options
              );
              entry.target.replaceWith(foursomeElement);
            }
          }
        });
      },
      { rootMargin: '50px' }
    );

    container.appendChild(virtualContainer);
  }

  /**
   * Render individual foursome with caching
   */
  private async renderFoursome(
    foursome: Foursome,
    position: number,
    options: { isEditing?: boolean } = {}
  ): Promise<HTMLElement> {
    const cacheKey = `foursome_${foursome.id}_${options.isEditing ? 'edit' : 'view'}_${this.currentViewport}`;
    
    // Check cache only if not in editing mode
    if (!options.isEditing && this.cache.foursomes.has(cacheKey)) {
      const cached = this.cache.foursomes.get(cacheKey)!;
      this.renderMetrics.elementsFromCache++;
      return cached.cloneNode(true) as HTMLElement;
    }

    const foursomeElement = document.createElement('div');
    foursomeElement.className = `foursome optimized ${options.isEditing ? 'editable' : ''} ${this.currentViewport}`;
    foursomeElement.setAttribute('data-foursome-id', foursome.id);

    // Add drag and drop handlers for editing mode
    if (options.isEditing) {
      foursomeElement.addEventListener('dragover', (e) => e.preventDefault());
      foursomeElement.addEventListener('drop', (e) => {
        e.preventDefault();
        this.handleFoursomeDrop(e, foursome.id);
      });
    }

    // Create header
    const header = this.createFoursomeHeader(position, foursome.players.length);
    foursomeElement.appendChild(header);

    // Create players container
    const playersContainer = document.createElement('div');
    playersContainer.className = `foursome-players optimized ${options.isEditing ? 'editing-mode' : ''}`;
    
    // Apply responsive spacing
    this.applyPlayerSpacing(playersContainer);

    // Render players
    const playerElements = await Promise.all(
      foursome.players.map(player => this.renderPlayer(player, foursome.id, options))
    );
    
    playerElements.forEach(element => playersContainer.appendChild(element));

    // Add empty slots if needed
    const emptySlots = 4 - foursome.players.length;
    for (let i = 0; i < emptySlots; i++) {
      const emptySlot = this.createEmptyPlayerSlot(options.isEditing || false);
      playersContainer.appendChild(emptySlot);
    }

    foursomeElement.appendChild(playersContainer);

    // Cache the element only if not in editing mode
    if (!options.isEditing) {
      this.cache.foursomes.set(cacheKey, foursomeElement.cloneNode(true) as HTMLElement);
    }
    
    this.renderMetrics.elementsRendered++;

    return foursomeElement;
  }

  /**
   * Render individual player with caching
   */
  private async renderPlayer(
    player: Player,
    foursomeId: string,
    options: { isEditing?: boolean } = {}
  ): Promise<HTMLElement> {
    const cacheKey = `player_${player.id}_${options.isEditing ? 'edit' : 'view'}_${this.currentViewport}`;
    
    // Check cache only if not in editing mode
    if (!options.isEditing && this.cache.players.has(cacheKey)) {
      const cached = this.cache.players.get(cacheKey)!;
      this.renderMetrics.elementsFromCache++;
      return cached.cloneNode(true) as HTMLElement;
    }

    const playerElement = document.createElement('div');
    playerElement.className = `player-slot filled optimized ${options.isEditing ? 'draggable' : ''} ${this.currentViewport}`;
    playerElement.setAttribute('data-player-id', player.id);

    // Add drag handlers for editing mode
    if (options.isEditing) {
      playerElement.draggable = true;
      playerElement.addEventListener('dragstart', (e) => {
        this.handlePlayerDragStart(e, player.id, foursomeId);
      });
    }

    // Create player info
    const playerInfo = this.createPlayerInfo(player);
    playerElement.appendChild(playerInfo);

    // Add remove button for editing mode
    if (options.isEditing) {
      const removeButton = this.createRemoveButton(player.id, foursomeId);
      playerElement.appendChild(removeButton);
    }

    // Cache the element only if not in editing mode
    if (!options.isEditing) {
      this.cache.players.set(cacheKey, playerElement.cloneNode(true) as HTMLElement);
    }

    return playerElement;
  }

  /**
   * Create optimized schedule grid structure
   */
  private createScheduleGrid(container: HTMLElement): HTMLElement {
    // Clear container
    container.innerHTML = '';
    
    const scheduleGrid = document.createElement('div');
    scheduleGrid.className = `schedule-grid optimized ${this.currentViewport}`;
    
    // Apply responsive grid layout
    this.applyGridLayout(scheduleGrid);
    
    container.appendChild(scheduleGrid);
    return scheduleGrid;
  }

  /**
   * Create time slot header
   */
  private createTimeSlotHeader(title: string): HTMLElement {
    const header = document.createElement('div');
    header.className = 'time-slot-header optimized';
    
    const titleElement = document.createElement('h4');
    titleElement.className = 'time-slot-title';
    titleElement.textContent = title;
    
    header.appendChild(titleElement);
    return header;
  }

  /**
   * Create foursome header
   */
  private createFoursomeHeader(position: number, playerCount: number): HTMLElement {
    const header = document.createElement('div');
    header.className = 'foursome-header optimized';
    
    const title = document.createElement('h5');
    title.textContent = `Group ${position}`;
    
    const count = document.createElement('span');
    count.className = 'player-count';
    count.textContent = `${playerCount}/4 players`;
    
    header.appendChild(title);
    header.appendChild(count);
    
    return header;
  }

  /**
   * Create player info element
   */
  private createPlayerInfo(player: Player): HTMLElement {
    const layout = this.responsiveConfig.layouts[this.currentViewport];
    
    const playerInfo = document.createElement('div');
    playerInfo.className = 'player-info optimized';
    
    const nameElement = document.createElement('div');
    nameElement.className = 'player-name';
    nameElement.textContent = `${player.firstName} ${player.lastName}`;
    
    playerInfo.appendChild(nameElement);
    
    // Add details if not in compact mode
    if (layout.showPlayerDetails) {
      const detailsElement = document.createElement('div');
      detailsElement.className = 'player-details';
      
      const handedness = document.createElement('span');
      handedness.className = `handedness ${player.handedness}`;
      handedness.textContent = player.handedness.charAt(0).toUpperCase();
      
      const preference = document.createElement('span');
      preference.className = `preference ${player.timePreference.toLowerCase()}`;
      preference.textContent = player.timePreference;
      
      detailsElement.appendChild(handedness);
      detailsElement.appendChild(preference);
      playerInfo.appendChild(detailsElement);
    }
    
    return playerInfo;
  }

  /**
   * Create remove button for editing mode
   */
  private createRemoveButton(playerId: string, foursomeId: string): HTMLElement {
    const button = document.createElement('button');
    button.className = 'remove-player-btn optimized';
    button.textContent = '×';
    button.title = 'Remove player from group';
    
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handlePlayerRemove(playerId, foursomeId);
    });
    
    return button;
  }

  /**
   * Create empty player slot
   */
  private createEmptyPlayerSlot(isEditing: boolean): HTMLElement {
    const slot = document.createElement('div');
    slot.className = `player-slot empty optimized ${this.currentViewport}`;
    
    const text = document.createElement('span');
    text.textContent = isEditing ? 'Drop player here' : 'Empty slot';
    
    slot.appendChild(text);
    return slot;
  }

  /**
   * Create foursome placeholder for virtualization
   */
  private createFoursomePlaceholder(position: number): HTMLElement {
    const placeholder = document.createElement('div');
    placeholder.className = 'foursome-placeholder optimized';
    placeholder.setAttribute('data-index', (position - 1).toString());
    
    const content = document.createElement('div');
    content.className = 'placeholder-content';
    content.textContent = `Loading Group ${position}...`;
    
    placeholder.appendChild(content);
    return placeholder;
  }

  /**
   * Apply responsive grid layout
   */
  private applyGridLayout(element: HTMLElement): void {
    const layout = this.responsiveConfig.layouts[this.currentViewport];
    
    element.style.setProperty('--columns-per-row', layout.columnsPerRow.toString());
    element.style.setProperty('--foursome-spacing', `${layout.foursomeSpacing}px`);
    
    if (layout.compactMode) {
      element.classList.add('compact-mode');
    } else {
      element.classList.remove('compact-mode');
    }
  }

  /**
   * Apply responsive layout to foursomes container
   */
  private applyResponsiveLayout(element: HTMLElement): void {
    const layout = this.responsiveConfig.layouts[this.currentViewport];
    
    element.style.setProperty('--foursome-spacing', `${layout.foursomeSpacing}px`);
    element.style.setProperty('--columns-per-row', layout.columnsPerRow.toString());
  }

  /**
   * Apply player spacing
   */
  private applyPlayerSpacing(element: HTMLElement): void {
    const layout = this.responsiveConfig.layouts[this.currentViewport];
    element.style.setProperty('--player-spacing', `${layout.playerSpacing}px`);
  }

  /**
   * Animate elements in
   */
  private async animateIn(element: HTMLElement): Promise<void> {
    const startTime = performance.now();
    
    element.style.opacity = '0';
    element.style.transform = 'translateY(20px)';
    
    // Trigger reflow
    element.offsetHeight;
    
    element.style.transition = `opacity ${this.animationConfig.duration}ms ${this.animationConfig.easing}, transform ${this.animationConfig.duration}ms ${this.animationConfig.easing}`;
    element.style.opacity = '1';
    element.style.transform = 'translateY(0)';
    
    return new Promise(resolve => {
      setTimeout(() => {
        element.style.transition = '';
        this.renderMetrics.animationTime = performance.now() - startTime;
        resolve();
      }, this.animationConfig.duration);
    });
  }

  /**
   * Animate elements out
   */
  private async animateOut(container: HTMLElement): Promise<void> {
    const elements = Array.from(container.children) as HTMLElement[];
    
    await Promise.all(elements.map((element, index) => {
      return new Promise<void>(resolve => {
        setTimeout(() => {
          element.style.transition = `opacity ${this.animationConfig.duration}ms ${this.animationConfig.easing}, transform ${this.animationConfig.duration}ms ${this.animationConfig.easing}`;
          element.style.opacity = '0';
          element.style.transform = 'translateY(-20px)';
          
          setTimeout(() => {
            if (element.parentNode) {
              element.parentNode.removeChild(element);
            }
            resolve();
          }, this.animationConfig.duration);
        }, index * this.animationConfig.stagger);
      });
    }));
  }

  /**
   * Animate chunk of elements in with stagger
   */
  private async animateChunkIn(elements: HTMLElement[], delay: number = 0): Promise<void> {
    return new Promise(resolve => {
      setTimeout(() => {
        elements.forEach((element, index) => {
          setTimeout(() => {
            element.style.opacity = '0';
            element.style.transform = 'translateY(10px)';
            
            // Trigger reflow
            element.offsetHeight;
            
            element.style.transition = `opacity ${this.animationConfig.duration}ms ${this.animationConfig.easing}, transform ${this.animationConfig.duration}ms ${this.animationConfig.easing}`;
            element.style.opacity = '1';
            element.style.transform = 'translateY(0)';
            
            if (index === elements.length - 1) {
              setTimeout(resolve, this.animationConfig.duration);
            }
          }, index * (this.animationConfig.stagger / 2));
        });
      }, delay);
    });
  }

  /**
   * Wait for next animation frame
   */
  private nextFrame(): Promise<void> {
    return new Promise(resolve => {
      this.animationFrameId = requestAnimationFrame(() => resolve());
    });
  }

  /**
   * Setup responsive handling
   */
  private setupResponsiveHandling(): void {
    // Set up resize observer
    this.resizeObserver = new ResizeObserver(() => {
      const newViewport = this.detectViewport();
      if (newViewport !== this.currentViewport) {
        this.currentViewport = newViewport;
        this.invalidateCache();
      }
    });

    // Observe document body
    this.resizeObserver.observe(document.body);
  }

  /**
   * Detect current viewport size
   */
  private detectViewport(): 'mobile' | 'tablet' | 'desktop' {
    const width = window.innerWidth;
    
    if (width < this.responsiveConfig.breakpoints.mobile) {
      return 'mobile';
    } else if (width < this.responsiveConfig.breakpoints.desktop) {
      return 'tablet';
    } else {
      return 'desktop';
    }
  }

  /**
   * Generate hash for schedule to detect changes
   */
  private generateScheduleHash(schedule: Schedule): string {
    const data = {
      id: schedule.id,
      weekId: schedule.weekId,
      morning: schedule.timeSlots.morning.map(f => ({
        id: f.id,
        players: f.players.map(p => p.id).sort()
      })),
      afternoon: schedule.timeSlots.afternoon.map(f => ({
        id: f.id,
        players: f.players.map(p => p.id).sort()
      }))
    };
    
    return btoa(JSON.stringify(data));
  }

  /**
   * Chunk array into smaller arrays
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Count elements in container
   */
  private countElements(container: HTMLElement): number {
    return container.querySelectorAll('*').length;
  }

  /**
   * Initialize metrics
   */
  private initializeMetrics(): RenderMetrics {
    return {
      renderTime: 0,
      cacheHitRate: 0,
      elementsRendered: 0,
      elementsFromCache: 0,
      animationTime: 0
    };
  }

  /**
   * Invalidate cache (e.g., on viewport change)
   */
  invalidateCache(): void {
    this.cache.foursomes.clear();
    this.cache.players.clear();
    this.cache.timeSlots.clear();
    this.cache.lastRenderHash = '';
  }

  /**
   * Get render metrics
   */
  getMetrics(): RenderMetrics {
    const totalElements = this.renderMetrics.elementsRendered + this.renderMetrics.elementsFromCache;
    this.renderMetrics.cacheHitRate = totalElements > 0 
      ? (this.renderMetrics.elementsFromCache / totalElements) * 100 
      : 0;
    
    return { ...this.renderMetrics };
  }

  /**
   * Event handlers (to be connected to external handlers)
   */
  private handlePlayerDragStart(event: DragEvent, playerId: string, foursomeId: string): void {
    // This will be connected to the main UI's drag handler
    if (event.dataTransfer) {
      event.dataTransfer.setData('text/plain', JSON.stringify({ playerId, foursomeId }));
    }
  }

  private handleFoursomeDrop(event: DragEvent, foursomeId: string): void {
    // This will be connected to the main UI's drop handler
    event.preventDefault();
  }

  private handlePlayerRemove(playerId: string, foursomeId: string): void {
    // This will be connected to the main UI's remove handler
    console.log('Remove player:', playerId, 'from foursome:', foursomeId);
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
      this.intersectionObserver = null;
    }

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    this.invalidateCache();
  }
}