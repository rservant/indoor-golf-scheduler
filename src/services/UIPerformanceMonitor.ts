/**
 * UI Performance Monitor Service
 * 
 * Provides frame rate monitoring, user interaction latency tracking,
 * and performance feedback for UI operations.
 * 
 * Requirements: 2.3, 2.4, 2.5, 5.1, 5.2
 */

import { performanceMonitor, PerformanceThresholds } from './PerformanceMonitor';

export interface UIPerformanceMetrics {
  frameRate: number;
  averageFrameTime: number;
  droppedFrames: number;
  interactionLatency: number;
  renderTime: number;
  timestamp: number;
}

export interface InteractionMetrics {
  type: 'click' | 'scroll' | 'input' | 'drag' | 'resize';
  startTime: number;
  endTime: number;
  latency: number;
  target: string;
}

export interface FrameMetrics {
  frameTime: number;
  timestamp: number;
  isDropped: boolean;
}

export interface UIPerformanceConfig {
  targetFrameRate: number;
  frameDropThreshold: number;
  interactionLatencyThreshold: number;
  monitoringInterval: number;
  maxHistorySize: number;
}

export interface PerformanceFeedback {
  level: 'good' | 'warning' | 'critical';
  message: string;
  suggestions: string[];
  metrics: UIPerformanceMetrics;
}

export type PerformanceFeedbackCallback = (feedback: PerformanceFeedback) => void;

/**
 * UI Performance Monitor
 * 
 * Monitors frame rate, interaction latency, and provides performance feedback
 */
export class UIPerformanceMonitor {
  private config: UIPerformanceConfig;
  private isMonitoring = false;
  private frameMetrics: FrameMetrics[] = [];
  private interactionMetrics: InteractionMetrics[] = [];
  private feedbackCallbacks: PerformanceFeedbackCallback[] = [];
  private animationFrameId: number | null = null;
  private lastFrameTime = 0;
  private frameCount = 0;
  private droppedFrameCount = 0;
  private monitoringStartTime = 0;
  private activeInteractions = new Map<string, number>();

  constructor(config: Partial<UIPerformanceConfig> = {}) {
    this.config = {
      targetFrameRate: 60,
      frameDropThreshold: 16.67, // 60fps = 16.67ms per frame
      interactionLatencyThreshold: 100, // 100ms for responsive interactions
      monitoringInterval: 1000, // Report metrics every second
      maxHistorySize: 300, // Keep 5 minutes of history at 1-second intervals
      ...config
    };

    this.setupInteractionListeners();
  }

  /**
   * Start monitoring UI performance
   */
  startMonitoring(): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.monitoringStartTime = performance.now();
    this.lastFrameTime = this.monitoringStartTime;
    this.frameCount = 0;
    this.droppedFrameCount = 0;

    // Start frame rate monitoring
    this.monitorFrameRate();

    // Start periodic metrics reporting
    this.startPeriodicReporting();

    console.log('UI Performance monitoring started');
  }

  /**
   * Stop monitoring UI performance
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    console.log('UI Performance monitoring stopped');
  }

  /**
   * Monitor frame rate using requestAnimationFrame
   */
  private monitorFrameRate(): void {
    if (!this.isMonitoring) return;

    const currentTime = performance.now();
    const frameTime = currentTime - this.lastFrameTime;

    // Record frame metrics
    const isDropped = frameTime > this.config.frameDropThreshold * 1.5; // 1.5x threshold for dropped frame
    this.frameMetrics.push({
      frameTime,
      timestamp: currentTime,
      isDropped
    });

    // Update counters
    this.frameCount++;
    if (isDropped) {
      this.droppedFrameCount++;
    }

    // Limit history size
    if (this.frameMetrics.length > this.config.maxHistorySize * 60) { // 60 frames per second
      this.frameMetrics = this.frameMetrics.slice(-this.config.maxHistorySize * 60);
    }

    this.lastFrameTime = currentTime;

    // Schedule next frame
    this.animationFrameId = requestAnimationFrame(() => this.monitorFrameRate());
  }

  /**
   * Start periodic metrics reporting
   */
  private startPeriodicReporting(): void {
    const reportMetrics = () => {
      if (!this.isMonitoring) return;

      const metrics = this.getCurrentMetrics();
      const feedback = this.generatePerformanceFeedback(metrics);

      // Notify callbacks
      this.feedbackCallbacks.forEach(callback => {
        try {
          callback(feedback);
        } catch (error) {
          console.error('Error in performance feedback callback:', error);
        }
      });

      // Schedule next report
      setTimeout(reportMetrics, this.config.monitoringInterval);
    };

    setTimeout(reportMetrics, this.config.monitoringInterval);
  }

  /**
   * Setup interaction event listeners
   */
  private setupInteractionListeners(): void {
    // Click interactions
    document.addEventListener('mousedown', (event) => {
      if (event.target) {
        this.startInteraction('click', event.target as Element);
      }
    });

    document.addEventListener('mouseup', (event) => {
      if (event.target) {
        this.endInteraction('click', event.target as Element);
      }
    });

    // Touch interactions
    document.addEventListener('touchstart', (event) => {
      if (event.target) {
        this.startInteraction('click', event.target as Element);
      }
    });

    document.addEventListener('touchend', (event) => {
      if (event.target) {
        this.endInteraction('click', event.target as Element);
      }
    });

    // Scroll interactions
    document.addEventListener('scroll', (event) => {
      if (event.target) {
        this.recordInstantInteraction('scroll', event.target as Element);
      }
    }, { passive: true });

    // Input interactions
    document.addEventListener('input', (event) => {
      if (event.target) {
        this.recordInstantInteraction('input', event.target as Element);
      }
    });

    // Resize interactions
    window.addEventListener('resize', () => {
      this.recordInstantInteraction('resize', document.body);
    });
  }

  /**
   * Start tracking an interaction
   */
  private startInteraction(type: InteractionMetrics['type'], target: Element): void {
    const targetSelector = this.getElementSelector(target);
    const interactionKey = `${type}:${targetSelector}`;
    this.activeInteractions.set(interactionKey, performance.now());
  }

  /**
   * End tracking an interaction
   */
  private endInteraction(type: InteractionMetrics['type'], target: Element): void {
    const targetSelector = this.getElementSelector(target);
    const interactionKey = `${type}:${targetSelector}`;
    const startTime = this.activeInteractions.get(interactionKey);

    if (startTime) {
      const endTime = performance.now();
      const latency = endTime - startTime;

      this.interactionMetrics.push({
        type,
        startTime,
        endTime,
        latency,
        target: targetSelector
      });

      // Limit history size
      if (this.interactionMetrics.length > this.config.maxHistorySize) {
        this.interactionMetrics = this.interactionMetrics.slice(-this.config.maxHistorySize);
      }

      this.activeInteractions.delete(interactionKey);

      // Track with global performance monitor
      performanceMonitor.endOperation({
        id: interactionKey,
        operationName: `UI.${type}`,
        startTime,
        metadata: { target: targetSelector, latency }
      });
    }
  }

  /**
   * Record an instant interaction (like scroll or input)
   */
  private recordInstantInteraction(type: InteractionMetrics['type'], target: Element): void {
    const targetSelector = this.getElementSelector(target);
    const timestamp = performance.now();

    this.interactionMetrics.push({
      type,
      startTime: timestamp,
      endTime: timestamp,
      latency: 0,
      target: targetSelector
    });

    // Limit history size
    if (this.interactionMetrics.length > this.config.maxHistorySize) {
      this.interactionMetrics = this.interactionMetrics.slice(-this.config.maxHistorySize);
    }
  }

  /**
   * Get element selector for tracking
   */
  private getElementSelector(element: Element): string {
    if (!element) {
      return 'unknown';
    }
    
    if (element.id) {
      return `#${element.id}`;
    }
    
    if (element.className) {
      const classes = element.className.toString().split(' ').filter(c => c.length > 0);
      if (classes.length > 0) {
        return `.${classes[0]}`;
      }
    }

    return element.tagName ? element.tagName.toLowerCase() : 'unknown';
  }

  /**
   * Get current performance metrics
   */
  getCurrentMetrics(): UIPerformanceMetrics {
    const currentTime = performance.now();
    const monitoringDuration = currentTime - this.monitoringStartTime;

    // Calculate frame rate
    const frameRate = monitoringDuration > 0 ? (this.frameCount / monitoringDuration) * 1000 : 0;

    // Calculate average frame time
    const recentFrames = this.frameMetrics.slice(-60); // Last 60 frames
    const averageFrameTime = recentFrames.length > 0 
      ? recentFrames.reduce((sum, frame) => sum + frame.frameTime, 0) / recentFrames.length
      : 0;

    // Calculate interaction latency
    const recentInteractions = this.interactionMetrics.slice(-10); // Last 10 interactions
    const averageInteractionLatency = recentInteractions.length > 0
      ? recentInteractions.reduce((sum, interaction) => sum + interaction.latency, 0) / recentInteractions.length
      : 0;

    return {
      frameRate: Math.min(frameRate, this.config.targetFrameRate), // Cap at target frame rate
      averageFrameTime,
      droppedFrames: this.droppedFrameCount,
      interactionLatency: averageInteractionLatency,
      renderTime: averageFrameTime,
      timestamp: currentTime
    };
  }

  /**
   * Generate performance feedback based on metrics
   */
  private generatePerformanceFeedback(metrics: UIPerformanceMetrics): PerformanceFeedback {
    const suggestions: string[] = [];
    let level: PerformanceFeedback['level'] = 'good';
    let message = 'UI performance is optimal';

    // Check frame rate
    const frameRateRatio = metrics.frameRate / this.config.targetFrameRate;
    if (frameRateRatio < 0.8) {
      level = 'critical';
      message = 'Poor frame rate detected';
      suggestions.push('Reduce DOM complexity');
      suggestions.push('Optimize animations');
      suggestions.push('Enable virtual scrolling for large lists');
    } else if (frameRateRatio < 0.9) {
      level = 'warning';
      message = 'Frame rate below target';
      suggestions.push('Consider optimizing rendering');
    }

    // Check interaction latency
    if (metrics.interactionLatency > this.config.interactionLatencyThreshold * 2) {
      level = 'critical';
      message = 'High interaction latency detected';
      suggestions.push('Optimize event handlers');
      suggestions.push('Debounce frequent interactions');
      suggestions.push('Use requestAnimationFrame for smooth updates');
    } else if (metrics.interactionLatency > this.config.interactionLatencyThreshold) {
      if (level !== 'critical') {
        level = 'warning';
        message = 'Interaction latency above threshold';
      }
      suggestions.push('Review interaction handlers');
    }

    // Check dropped frames
    const droppedFrameRatio = metrics.droppedFrames / Math.max(this.frameCount, 1);
    if (droppedFrameRatio > 0.1) {
      level = 'critical';
      message = 'Frequent frame drops detected';
      suggestions.push('Reduce rendering complexity');
      suggestions.push('Optimize CSS animations');
    } else if (droppedFrameRatio > 0.05) {
      if (level !== 'critical') {
        level = 'warning';
        message = 'Occasional frame drops detected';
      }
      suggestions.push('Monitor rendering performance');
    }

    return {
      level,
      message,
      suggestions: [...new Set(suggestions)], // Remove duplicates
      metrics
    };
  }

  /**
   * Register callback for performance feedback
   */
  onPerformanceFeedback(callback: PerformanceFeedbackCallback): void {
    this.feedbackCallbacks.push(callback);
  }

  /**
   * Remove performance feedback callback
   */
  removePerformanceFeedback(callback: PerformanceFeedbackCallback): void {
    const index = this.feedbackCallbacks.indexOf(callback);
    if (index !== -1) {
      this.feedbackCallbacks.splice(index, 1);
    }
  }

  /**
   * Set performance thresholds for specific operations
   */
  setUIPerformanceThresholds(operation: string, thresholds: PerformanceThresholds): void {
    performanceMonitor.setThresholds(`UI.${operation}`, thresholds);
  }

  /**
   * Get interaction metrics for analysis
   */
  getInteractionMetrics(timeRange?: { start: number; end: number }): InteractionMetrics[] {
    if (!timeRange) {
      return [...this.interactionMetrics];
    }

    return this.interactionMetrics.filter(metric => 
      metric.startTime >= timeRange.start && metric.endTime <= timeRange.end
    );
  }

  /**
   * Get frame metrics for analysis
   */
  getFrameMetrics(timeRange?: { start: number; end: number }): FrameMetrics[] {
    if (!timeRange) {
      return [...this.frameMetrics];
    }

    return this.frameMetrics.filter(metric => 
      metric.timestamp >= timeRange.start && metric.timestamp <= timeRange.end
    );
  }

  /**
   * Clear all metrics history
   */
  clearMetrics(): void {
    this.frameMetrics = [];
    this.interactionMetrics = [];
    this.frameCount = 0;
    this.droppedFrameCount = 0;
    this.activeInteractions.clear();
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(): {
    isMonitoring: boolean;
    monitoringDuration: number;
    totalFrames: number;
    totalInteractions: number;
    averageFrameRate: number;
    averageInteractionLatency: number;
  } {
    const currentTime = performance.now();
    const monitoringDuration = currentTime - this.monitoringStartTime;
    const averageFrameRate = monitoringDuration > 0 ? (this.frameCount / monitoringDuration) * 1000 : 0;
    const averageInteractionLatency = this.interactionMetrics.length > 0
      ? this.interactionMetrics.reduce((sum, metric) => sum + metric.latency, 0) / this.interactionMetrics.length
      : 0;

    return {
      isMonitoring: this.isMonitoring,
      monitoringDuration,
      totalFrames: this.frameCount,
      totalInteractions: this.interactionMetrics.length,
      averageFrameRate: Math.min(averageFrameRate, this.config.targetFrameRate),
      averageInteractionLatency
    };
  }

  /**
   * Destroy the monitor and clean up resources
   */
  destroy(): void {
    this.stopMonitoring();
    this.feedbackCallbacks = [];
    this.clearMetrics();
  }
}

// Global UI performance monitor instance
export const uiPerformanceMonitor = new UIPerformanceMonitor();