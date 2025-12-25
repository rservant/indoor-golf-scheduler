/**
 * Enhanced Schedule Display UI
 * 
 * Integrates OptimizedScheduleRenderer with the existing ScheduleDisplayUI
 * to provide improved rendering performance, smooth animations, and responsive layouts.
 * 
 * Requirements: 2.1, 2.2, 2.4, 2.5
 */

import { ScheduleDisplayUI } from './ScheduleDisplayUI';
import { OptimizedScheduleRenderer, RenderMetrics, AnimationConfig, ResponsiveConfig, ProgressiveRenderConfig } from './OptimizedScheduleRenderer';
import { Schedule } from '../models/Schedule';
import { Foursome } from '../models/Foursome';
import { Player } from '../models/Player';
import { ScheduleManager } from '../services/ScheduleManager';
import { ScheduleGenerator } from '../services/ScheduleGenerator';
import { WeekRepository } from '../repositories/WeekRepository';
import { ExportService } from '../services/ExportService';
import { PairingHistoryTracker } from '../services/PairingHistoryTracker';
import { PlayerManager } from '../services/PlayerManager';

export interface EnhancedRenderOptions {
  enableAnimations: boolean;
  enableCaching: boolean;
  enableProgressiveLoading: boolean;
  enableResponsiveLayout: boolean;
  performanceMode: 'high' | 'balanced' | 'battery';
}

export interface PerformanceMetrics {
  renderMetrics: RenderMetrics;
  frameRate: number;
  memoryUsage: number;
  renderingTime: number;
  cacheEfficiency: number;
}

/**
 * Enhanced Schedule Display UI with optimized rendering
 */
export class EnhancedScheduleDisplayUI extends ScheduleDisplayUI {
  private optimizedRenderer: OptimizedScheduleRenderer;
  private renderOptions: EnhancedRenderOptions;
  private performanceMetrics: PerformanceMetrics;
  private frameRateMonitor: FrameRateMonitor;
  private renderingContainer: HTMLElement | null = null;

  constructor(
    scheduleManager: ScheduleManager,
    scheduleGenerator: ScheduleGenerator,
    weekRepository: WeekRepository,
    exportService: ExportService,
    pairingHistoryTracker: PairingHistoryTracker,
    playerManager: PlayerManager,
    container: HTMLElement,
    renderOptions?: Partial<EnhancedRenderOptions>
  ) {
    super(
      scheduleManager,
      scheduleGenerator,
      weekRepository,
      exportService,
      pairingHistoryTracker,
      playerManager,
      container
    );

    this.renderOptions = {
      enableAnimations: true,
      enableCaching: true,
      enableProgressiveLoading: true,
      enableResponsiveLayout: true,
      performanceMode: 'balanced',
      ...renderOptions
    };

    // Configure renderer based on performance mode
    const rendererConfig = this.getRendererConfig();
    this.optimizedRenderer = new OptimizedScheduleRenderer(
      rendererConfig.animation,
      rendererConfig.responsive,
      rendererConfig.progressive
    );

    this.frameRateMonitor = new FrameRateMonitor();
    this.performanceMetrics = this.initializePerformanceMetrics();

    this.setupEnhancedEventHandlers();
  }

  /**
   * Enhanced render method with optimized rendering
   */
  protected async renderScheduleContent(): Promise<string> {
    const schedule = this.getCurrentSchedule();
    if (!schedule) {
      return super['renderScheduleContent']();
    }

    // Create or get rendering container
    if (!this.renderingContainer) {
      this.renderingContainer = document.createElement('div');
      this.renderingContainer.className = 'enhanced-schedule-content';
    }

    const startTime = performance.now();
    this.frameRateMonitor.start();

    try {
      // Use optimized renderer for schedule display
      const renderMetrics = await this.optimizedRenderer.renderSchedule(
        schedule,
        this.renderingContainer,
        {
          isEditing: this.isEditingMode(),
          showAnimations: this.renderOptions.enableAnimations,
          forceRefresh: false
        }
      );

      // Update performance metrics
      this.updatePerformanceMetrics(renderMetrics, performance.now() - startTime);

      // Return the rendered HTML
      return this.renderingContainer.outerHTML;

    } catch (error) {
      console.error('Enhanced rendering failed, falling back to standard rendering:', error);
      return super['renderScheduleContent']();
    } finally {
      this.frameRateMonitor.stop();
    }
  }

  /**
   * Enhanced foursome rendering with caching
   */
  async renderFoursomeOptimized(foursome: Foursome, position: number, isEditing: boolean = false): Promise<HTMLElement> {
    const container = document.createElement('div');
    
    const renderMetrics = await this.optimizedRenderer.renderSchedule(
      {
        id: 'temp',
        weekId: 'temp',
        timeSlots: {
          morning: [foursome],
          afternoon: []
        }
      } as Schedule,
      container,
      {
        isEditing,
        showAnimations: this.renderOptions.enableAnimations
      }
    );

    this.updatePerformanceMetrics(renderMetrics, 0);
    
    return container.firstElementChild as HTMLElement;
  }

  /**
   * Smooth transition between schedule views
   */
  async transitionToSchedule(newSchedule: Schedule): Promise<void> {
    if (!this.renderOptions.enableAnimations) {
      return;
    }

    const container = this.container.querySelector('.schedule-grid');
    if (!container) return;

    // Animate out current content
    await this.animateContentOut(container as HTMLElement);

    // Render new content
    await this.renderScheduleContent();

    // Animate in new content
    await this.animateContentIn(container as HTMLElement);
  }

  /**
   * Animate content out
   */
  private async animateContentOut(container: HTMLElement): Promise<void> {
    return new Promise(resolve => {
      container.style.transition = 'opacity 300ms ease-out, transform 300ms ease-out';
      container.style.opacity = '0';
      container.style.transform = 'translateY(-20px)';
      
      setTimeout(resolve, 300);
    });
  }

  /**
   * Animate content in
   */
  private async animateContentIn(container: HTMLElement): Promise<void> {
    return new Promise(resolve => {
      container.style.opacity = '0';
      container.style.transform = 'translateY(20px)';
      
      // Trigger reflow
      container.offsetHeight;
      
      container.style.transition = 'opacity 300ms ease-out, transform 300ms ease-out';
      container.style.opacity = '1';
      container.style.transform = 'translateY(0)';
      
      setTimeout(() => {
        container.style.transition = '';
        resolve();
      }, 300);
    });
  }

  /**
   * Get renderer configuration based on performance mode
   */
  private getRendererConfig(): {
    animation: Partial<AnimationConfig>;
    responsive: Partial<ResponsiveConfig>;
    progressive: Partial<ProgressiveRenderConfig>;
  } {
    switch (this.renderOptions.performanceMode) {
      case 'high':
        return {
          animation: {
            duration: 400,
            easing: 'cubic-bezier(0.4, 0.0, 0.2, 1)',
            stagger: 75
          },
          responsive: {},
          progressive: {
            chunkSize: 2,
            renderDelay: 8,
            prioritizeVisible: true,
            enableVirtualization: true
          }
        };

      case 'battery':
        return {
          animation: {
            duration: 200,
            easing: 'ease-out',
            stagger: 25
          },
          responsive: {},
          progressive: {
            chunkSize: 8,
            renderDelay: 32,
            prioritizeVisible: false,
            enableVirtualization: false
          }
        };

      default: // balanced
        return {
          animation: {
            duration: 300,
            easing: 'cubic-bezier(0.4, 0.0, 0.2, 1)',
            stagger: 50
          },
          responsive: {},
          progressive: {
            chunkSize: 4,
            renderDelay: 16,
            prioritizeVisible: true,
            enableVirtualization: false
          }
        };
    }
  }

  /**
   * Setup enhanced event handlers
   */
  private setupEnhancedEventHandlers(): void {
    // Override drag and drop handlers to work with optimized renderer
    const originalHandlers = (window as any).scheduleDisplayUI;
    
    (window as any).scheduleDisplayUI = {
      ...originalHandlers,
      handlePlayerDragStart: (event: DragEvent, playerId: string, foursomeId: string) => {
        this.handleEnhancedPlayerDragStart(event, playerId, foursomeId);
      },
      handleFoursomeDrop: (event: DragEvent, foursomeId: string) => {
        this.handleEnhancedFoursomeDrop(event, foursomeId);
      },
      removePlayer: (playerId: string, foursomeId: string) => {
        this.handleEnhancedPlayerRemove(playerId, foursomeId);
      }
    };
  }

  /**
   * Enhanced drag start handler
   */
  private handleEnhancedPlayerDragStart(event: DragEvent, playerId: string, foursomeId: string): void {
    // Add visual feedback for drag operation
    if (this.renderOptions.enableAnimations) {
      const draggedElement = event.target as HTMLElement;
      draggedElement.style.transition = 'transform 200ms ease-out, opacity 200ms ease-out';
      draggedElement.style.transform = 'scale(1.05)';
      draggedElement.style.opacity = '0.8';
    }

    // Call original handler
    const player = this.findPlayerById(playerId);
    if (player) {
      this['handleDragStart'](player, foursomeId);
      if (event.dataTransfer) {
        event.dataTransfer.setData('text/plain', playerId);
      }
    }
  }

  /**
   * Enhanced drop handler
   */
  private async handleEnhancedFoursomeDrop(event: DragEvent, foursomeId: string): Promise<void> {
    event.preventDefault();
    
    // Add visual feedback
    const dropTarget = event.currentTarget as HTMLElement;
    if (this.renderOptions.enableAnimations) {
      dropTarget.style.transition = 'background-color 200ms ease-out';
      dropTarget.style.backgroundColor = 'rgba(0, 255, 0, 0.1)';
      
      setTimeout(() => {
        dropTarget.style.backgroundColor = '';
      }, 200);
    }

    // Call original handler
    await this['handleDrop'](foursomeId);

    // Refresh rendering with animation
    if (this.renderOptions.enableAnimations) {
      await this.refreshWithAnimation();
    }
  }

  /**
   * Enhanced player remove handler
   */
  private async handleEnhancedPlayerRemove(playerId: string, foursomeId: string): Promise<void> {
    if (!confirm('Are you sure you want to remove this player from the group?')) {
      return;
    }

    // Add removal animation
    if (this.renderOptions.enableAnimations) {
      const playerElement = this.container.querySelector(`[data-player-id="${playerId}"]`) as HTMLElement;
      if (playerElement) {
        await this.animatePlayerRemoval(playerElement);
      }
    }

    // Call original handler
    await this['removePlayer'](playerId, foursomeId);

    // Refresh rendering
    if (this.renderOptions.enableAnimations) {
      await this.refreshWithAnimation();
    }
  }

  /**
   * Animate player removal
   */
  private async animatePlayerRemoval(element: HTMLElement): Promise<void> {
    return new Promise(resolve => {
      element.style.transition = 'transform 300ms ease-out, opacity 300ms ease-out';
      element.style.transform = 'scale(0.8) translateX(-20px)';
      element.style.opacity = '0';
      
      setTimeout(resolve, 300);
    });
  }

  /**
   * Refresh rendering with animation
   */
  private async refreshWithAnimation(): Promise<void> {
    const scheduleGrid = this.container.querySelector('.schedule-grid') as HTMLElement;
    if (!scheduleGrid) return;

    // Animate refresh
    scheduleGrid.style.transition = 'opacity 150ms ease-out';
    scheduleGrid.style.opacity = '0.7';
    
    setTimeout(() => {
      this.render();
      scheduleGrid.style.opacity = '1';
    }, 150);
  }

  /**
   * Update performance metrics
   */
  private updatePerformanceMetrics(renderMetrics: RenderMetrics, renderingTime: number): void {
    this.performanceMetrics = {
      renderMetrics,
      frameRate: this.frameRateMonitor.getAverageFrameRate(),
      memoryUsage: this.getMemoryUsage(),
      renderingTime,
      cacheEfficiency: renderMetrics.cacheHitRate
    };
  }

  /**
   * Get memory usage
   */
  private getMemoryUsage(): number {
    if ('memory' in performance) {
      return (performance as any).memory.usedJSHeapSize / 1024 / 1024; // MB
    }
    return 0;
  }

  /**
   * Initialize performance metrics
   */
  private initializePerformanceMetrics(): PerformanceMetrics {
    return {
      renderMetrics: {
        renderTime: 0,
        cacheHitRate: 0,
        elementsRendered: 0,
        elementsFromCache: 0,
        animationTime: 0
      },
      frameRate: 60,
      memoryUsage: 0,
      renderingTime: 0,
      cacheEfficiency: 0
    };
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  /**
   * Update render options
   */
  updateRenderOptions(options: Partial<EnhancedRenderOptions>): void {
    this.renderOptions = { ...this.renderOptions, ...options };
    
    // Reconfigure renderer if needed
    if (options.performanceMode) {
      const config = this.getRendererConfig();
      this.optimizedRenderer.destroy();
      this.optimizedRenderer = new OptimizedScheduleRenderer(
        config.animation,
        config.responsive,
        config.progressive
      );
    }
  }

  /**
   * Check if in editing mode
   */
  private isEditingMode(): boolean {
    return this['state']?.isEditing || false;
  }

  /**
   * Find player by ID
   */
  private findPlayerById(playerId: string): Player | null {
    return this['findPlayerById'](playerId);
  }

  /**
   * Cleanup enhanced resources
   */
  destroy(): void {
    this.frameRateMonitor.stop();
    this.optimizedRenderer.destroy();
    super.destroy();
  }
}

/**
 * Frame rate monitor for performance tracking
 */
class FrameRateMonitor {
  private frameCount: number = 0;
  private startTime: number = 0;
  private lastFrameTime: number = 0;
  private frameRates: number[] = [];
  private isRunning: boolean = false;
  private animationFrameId: number | null = null;

  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.frameCount = 0;
    this.startTime = performance.now();
    this.lastFrameTime = this.startTime;
    this.frameRates = [];
    
    this.measureFrame();
  }

  stop(): void {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private measureFrame(): void {
    if (!this.isRunning) return;
    
    const currentTime = performance.now();
    const deltaTime = currentTime - this.lastFrameTime;
    
    if (deltaTime > 0) {
      const fps = 1000 / deltaTime;
      this.frameRates.push(fps);
      
      // Keep only last 60 measurements
      if (this.frameRates.length > 60) {
        this.frameRates.shift();
      }
    }
    
    this.lastFrameTime = currentTime;
    this.frameCount++;
    
    this.animationFrameId = requestAnimationFrame(() => this.measureFrame());
  }

  getAverageFrameRate(): number {
    if (this.frameRates.length === 0) return 60;
    
    const sum = this.frameRates.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.frameRates.length);
  }

  getCurrentFrameRate(): number {
    return this.frameRates.length > 0 ? Math.round(this.frameRates[this.frameRates.length - 1]) : 60;
  }
}