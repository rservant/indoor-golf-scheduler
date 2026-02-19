/**
 * UI Performance Feedback Component
 * 
 * Displays performance feedback and optimization suggestions to users
 * 
 * Requirements: 2.3, 2.4, 2.5, 5.1, 5.2
 */

import { UIPerformanceMonitor, PerformanceFeedback, UIPerformanceMetrics } from '../services/UIPerformanceMonitor';

export interface PerformanceFeedbackConfig {
  showInProduction: boolean;
  autoHide: boolean;
  hideDelay: number;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  showDetailedMetrics: boolean;
}

export class UIPerformanceFeedbackUI {
  private container: HTMLElement;
  private feedbackElement: HTMLElement | null = null;
  private config: PerformanceFeedbackConfig;
  private uiPerformanceMonitor: UIPerformanceMonitor;
  private isVisible = false;
  private hideTimeout: number | null = null;

  constructor(
    container: HTMLElement,
    uiPerformanceMonitor: UIPerformanceMonitor,
    config: Partial<PerformanceFeedbackConfig> = {}
  ) {
    this.container = container;
    this.uiPerformanceMonitor = uiPerformanceMonitor;
    this.config = {
      showInProduction: false,
      autoHide: true,
      hideDelay: 5000,
      position: 'bottom-right',
      showDetailedMetrics: false,
      ...config
    };

    this.initialize();
  }

  /**
   * Initialize the feedback UI
   */
  private initialize(): void {
    // Only show in development or if explicitly enabled in production
    const isDevelopment = process.env.NODE_ENV === 'development';
    if (!isDevelopment && !this.config.showInProduction) {
      return;
    }

    this.createFeedbackElement();
    this.setupEventListeners();

    // Register for performance feedback
    this.uiPerformanceMonitor.onPerformanceFeedback((feedback) => {
      this.displayFeedback(feedback);
    });
  }

  /**
   * Create the feedback display element
   */
  private createFeedbackElement(): void {
    this.feedbackElement = document.createElement('div');
    this.feedbackElement.className = 'ui-performance-feedback';
    this.feedbackElement.style.cssText = `
      position: fixed;
      z-index: 10000;
      max-width: 350px;
      min-width: 250px;
      background: rgba(0, 0, 0, 0.9);
      color: white;
      border-radius: 8px;
      padding: 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 12px;
      line-height: 1.4;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      backdrop-filter: blur(10px);
      transform: translateY(100%);
      opacity: 0;
      transition: all 0.3s ease;
      pointer-events: none;
      ${this.getPositionStyles()}
    `;

    this.container.appendChild(this.feedbackElement);
  }

  /**
   * Get CSS styles for positioning
   */
  private getPositionStyles(): string {
    switch (this.config.position) {
      case 'top-left':
        return 'top: 20px; left: 20px; transform: translateY(-100%);';
      case 'top-right':
        return 'top: 20px; right: 20px; transform: translateY(-100%);';
      case 'bottom-left':
        return 'bottom: 20px; left: 20px;';
      case 'bottom-right':
      default:
        return 'bottom: 20px; right: 20px;';
    }
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    if (!this.feedbackElement) return;

    // Make interactive when hovered
    this.feedbackElement.addEventListener('mouseenter', () => {
      if (this.feedbackElement) {
        this.feedbackElement.style.pointerEvents = 'auto';
        this.clearHideTimeout();
      }
    });

    this.feedbackElement.addEventListener('mouseleave', () => {
      if (this.feedbackElement) {
        this.feedbackElement.style.pointerEvents = 'none';
        if (this.config.autoHide) {
          this.scheduleHide();
        }
      }
    });

    // Toggle detailed metrics on click
    this.feedbackElement.addEventListener('click', () => {
      this.config.showDetailedMetrics = !this.config.showDetailedMetrics;
      this.refreshDisplay();
    });
  }

  /**
   * Display performance feedback
   */
  displayFeedback(feedback: PerformanceFeedback): void {
    if (!this.feedbackElement) return;

    // Only show warnings and critical issues, or if explicitly showing all
    if (feedback.level === 'good' && !this.config.showDetailedMetrics) {
      this.hide();
      return;
    }

    this.renderFeedback(feedback);
    this.show();

    if (this.config.autoHide) {
      this.scheduleHide();
    }
  }

  /**
   * Render feedback content
   */
  private renderFeedback(feedback: PerformanceFeedback): void {
    if (!this.feedbackElement) return;

    const levelIcon = this.getLevelIcon(feedback.level);
    const levelColor = this.getLevelColor(feedback.level);

    this.feedbackElement.innerHTML = `
      <div class="feedback-header" style="display: flex; align-items: center; margin-bottom: 8px;">
        <span class="feedback-icon" style="margin-right: 8px; font-size: 16px;">${levelIcon}</span>
        <span class="feedback-title" style="font-weight: 600; color: ${levelColor};">
          UI Performance ${feedback.level.charAt(0).toUpperCase() + feedback.level.slice(1)}
        </span>
        <button class="feedback-close" style="
          margin-left: auto;
          background: none;
          border: none;
          color: #ccc;
          cursor: pointer;
          font-size: 16px;
          padding: 0;
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
        " onclick="this.closest('.ui-performance-feedback').style.display = 'none'">×</button>
      </div>
      
      <div class="feedback-message" style="margin-bottom: 8px; color: #e0e0e0;">
        ${feedback.message}
      </div>

      ${this.renderMetrics(feedback.metrics)}

      ${feedback.suggestions.length > 0 ? `
        <div class="feedback-suggestions" style="margin-top: 8px;">
          <div style="font-weight: 600; margin-bottom: 4px; color: #ffd700;">Suggestions:</div>
          <ul style="margin: 0; padding-left: 16px; color: #ccc;">
            ${feedback.suggestions.map(suggestion => `<li>${suggestion}</li>`).join('')}
          </ul>
        </div>
      ` : ''}

      <div class="feedback-footer" style="
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid rgba(255, 255, 255, 0.2);
        font-size: 10px;
        color: #999;
        text-align: center;
      ">
        Click to ${this.config.showDetailedMetrics ? 'hide' : 'show'} detailed metrics
      </div>
    `;
  }

  /**
   * Render performance metrics
   */
  private renderMetrics(metrics: UIPerformanceMetrics): string {
    if (!this.config.showDetailedMetrics) {
      return `
        <div class="feedback-metrics-summary" style="
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: #ccc;
          margin: 4px 0;
        ">
          <span>FPS: ${Math.round(metrics.frameRate)}</span>
          <span>Latency: ${Math.round(metrics.interactionLatency)}ms</span>
        </div>
      `;
    }

    return `
      <div class="feedback-metrics-detailed" style="
        background: rgba(255, 255, 255, 0.1);
        border-radius: 4px;
        padding: 8px;
        margin: 8px 0;
        font-size: 11px;
      ">
        <div class="metrics-grid" style="
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4px;
          color: #e0e0e0;
        ">
          <div>Frame Rate: <span style="color: ${this.getMetricColor(metrics.frameRate, 60, 45)}">${Math.round(metrics.frameRate)} fps</span></div>
          <div>Frame Time: <span style="color: ${this.getMetricColor(16.67, metrics.averageFrameTime, 25)}">${Math.round(metrics.averageFrameTime)}ms</span></div>
          <div>Dropped Frames: <span style="color: ${this.getMetricColor(0, metrics.droppedFrames, 5)}">${metrics.droppedFrames}</span></div>
          <div>Interaction Latency: <span style="color: ${this.getMetricColor(50, metrics.interactionLatency, 100)}">${Math.round(metrics.interactionLatency)}ms</span></div>
        </div>
      </div>
    `;
  }

  /**
   * Get color for metric value based on thresholds
   */
  private getMetricColor(good: number, value: number, bad: number): string {
    if (good < bad) {
      // Higher is better (like frame rate)
      if (value >= good) return '#4ade80'; // green
      if (value >= bad) return '#fbbf24'; // yellow
      return '#f87171'; // red
    } else {
      // Lower is better (like latency)
      if (value <= good) return '#4ade80'; // green
      if (value <= bad) return '#fbbf24'; // yellow
      return '#f87171'; // red
    }
  }

  /**
   * Get icon for feedback level
   */
  private getLevelIcon(level: PerformanceFeedback['level']): string {
    switch (level) {
      case 'good': return '✅';
      case 'warning': return '⚠️';
      case 'critical': return '🚨';
      default: return 'ℹ️';
    }
  }

  /**
   * Get color for feedback level
   */
  private getLevelColor(level: PerformanceFeedback['level']): string {
    switch (level) {
      case 'good': return '#4ade80';
      case 'warning': return '#fbbf24';
      case 'critical': return '#f87171';
      default: return '#94a3b8';
    }
  }

  /**
   * Show the feedback element
   */
  private show(): void {
    if (!this.feedbackElement || this.isVisible) return;

    this.isVisible = true;
    this.feedbackElement.style.display = 'block';
    
    // Trigger reflow
    this.feedbackElement.offsetHeight;
    
    this.feedbackElement.style.transform = 'translateY(0)';
    this.feedbackElement.style.opacity = '1';
  }

  /**
   * Hide the feedback element
   */
  private hide(): void {
    if (!this.feedbackElement || !this.isVisible) return;

    this.isVisible = false;
    this.clearHideTimeout();
    
    const isTopPosition = this.config.position.startsWith('top');
    this.feedbackElement.style.transform = isTopPosition ? 'translateY(-100%)' : 'translateY(100%)';
    this.feedbackElement.style.opacity = '0';

    setTimeout(() => {
      if (this.feedbackElement && !this.isVisible) {
        this.feedbackElement.style.display = 'none';
      }
    }, 300);
  }

  /**
   * Schedule automatic hide
   */
  private scheduleHide(): void {
    this.clearHideTimeout();
    this.hideTimeout = window.setTimeout(() => {
      this.hide();
    }, this.config.hideDelay);
  }

  /**
   * Clear hide timeout
   */
  private clearHideTimeout(): void {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
  }

  /**
   * Refresh the current display
   */
  private refreshDisplay(): void {
    if (this.isVisible) {
      // Get current metrics and redisplay
      const currentMetrics = this.uiPerformanceMonitor.getCurrentMetrics();
      const feedback = {
        level: 'good' as const,
        message: 'Performance metrics',
        suggestions: [],
        metrics: currentMetrics
      };
      this.renderFeedback(feedback);
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<PerformanceFeedbackConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    if (this.feedbackElement && newConfig.position) {
      // Update position styles
      const positionStyles = this.getPositionStyles();
      const currentStyles = this.feedbackElement.style.cssText;
      const updatedStyles = currentStyles.replace(
        /(top|bottom|left|right): \d+px;/g, 
        ''
      ).replace(/transform: [^;]+;/, '');
      
      this.feedbackElement.style.cssText = updatedStyles + positionStyles;
    }
  }

  /**
   * Toggle visibility
   */
  toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      const currentMetrics = this.uiPerformanceMonitor.getCurrentMetrics();
      const feedback = {
        level: 'good' as const,
        message: 'Current performance metrics',
        suggestions: [],
        metrics: currentMetrics
      };
      this.displayFeedback(feedback);
    }
  }

  /**
   * Destroy the feedback UI
   */
  destroy(): void {
    this.clearHideTimeout();
    
    if (this.feedbackElement && this.feedbackElement.parentNode) {
      this.feedbackElement.parentNode.removeChild(this.feedbackElement);
    }
    
    this.feedbackElement = null;
    this.isVisible = false;
  }
}