/**
 * Development Debugging Interface
 * 
 * Provides debugging tools and interfaces for development mode,
 * including error inspection, state monitoring, and performance tracking.
 */

import { ErrorContext } from './ErrorHandler';
import { applicationState, ApplicationState } from '../state/ApplicationState';

export interface DebugErrorInfo {
  id: string;
  error: Error | string | any;
  context: ErrorContext;
  timestamp: Date;
  stackTrace?: string;
  userAgent: string;
  url: string;
  applicationState: ApplicationState;
}

export interface PerformanceMetric {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, any>;
}

export interface DebugConfig {
  enableErrorTracking: boolean;
  enablePerformanceTracking: boolean;
  enableStateMonitoring: boolean;
  enableConsoleLogging: boolean;
  maxErrorHistory: number;
  maxPerformanceHistory: number;
}

/**
 * Debug interface for development mode
 */
export class DebugInterface {
  private static instance: DebugInterface | null = null;
  private isDebugMode: boolean = false;
  private config: DebugConfig;
  private errorHistory: DebugErrorInfo[] = [];
  private performanceMetrics: PerformanceMetric[] = [];
  private stateHistory: { timestamp: Date; state: ApplicationState }[] = [];
  private activeTimers: Map<string, number> = new Map();

  constructor(config: Partial<DebugConfig> = {}) {
    this.config = {
      enableErrorTracking: true,
      enablePerformanceTracking: true,
      enableStateMonitoring: true,
      enableConsoleLogging: true,
      maxErrorHistory: 50,
      maxPerformanceHistory: 100,
      ...config
    };

    this.setupDebugInterface();
    DebugInterface.instance = this;
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): DebugInterface {
    if (!DebugInterface.instance) {
      DebugInterface.instance = new DebugInterface();
    }
    return DebugInterface.instance;
  }

  /**
   * Set up the debug interface
   */
  private setupDebugInterface(): void {
    // Set up state monitoring
    if (this.config.enableStateMonitoring) {
      this.setupStateMonitoring();
    }

    // Set up performance monitoring
    if (this.config.enablePerformanceTracking) {
      this.setupPerformanceMonitoring();
    }

    // Expose debug interface globally in development
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      (window as any).debugInterface = this;
      (window as any).debug = {
        getErrors: () => this.getErrorDebugInfo(),
        getPerformance: () => this.getPerformanceMetrics(),
        getState: () => applicationState.getState(),
        getStateHistory: () => this.getStateHistory(),
        clearErrors: () => this.clearErrorHistory(),
        clearPerformance: () => this.clearPerformanceHistory(),
        exportDebugData: () => this.exportDebugData(),
        enableDebugMode: () => this.setDebugMode(true),
        disableDebugMode: () => this.setDebugMode(false)
      };

      if (this.config.enableConsoleLogging) {
        console.log('🐛 Debug interface available at window.debug');
        console.log('Available commands:', Object.keys((window as any).debug));
      }
    }
  }

  /**
   * Set up state monitoring
   */
  private setupStateMonitoring(): void {
    applicationState.subscribeToAll((newState, oldState) => {
      if (this.isDebugMode) {
        this.recordStateChange(newState);
        
        if (this.config.enableConsoleLogging) {
          console.log('🔄 State changed:', {
            timestamp: new Date(),
            changes: this.getStateChanges(oldState, newState),
            newState
          });
        }
      }
    });
  }

  /**
   * Set up performance monitoring
   */
  private setupPerformanceMonitoring(): void {
    // Monitor navigation timing
    if (typeof window !== 'undefined' && window.performance) {
      window.addEventListener('load', () => {
        const navigation = window.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        if (navigation) {
          this.recordPerformanceMetric('page-load', {
            domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
            loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
            totalTime: navigation.loadEventEnd - navigation.fetchStart
          });
        }
      });
    }
  }

  /**
   * Enable or disable debug mode
   */
  public setDebugMode(enabled: boolean): void {
    this.isDebugMode = enabled;
    
    if (this.config.enableConsoleLogging) {
      console.log(`🐛 Debug mode ${enabled ? 'enabled' : 'disabled'}`);
    }

    // Update application state to reflect debug mode
    if (typeof window !== 'undefined') {
      (window as any).debugModeEnabled = enabled;
    }
  }

  /**
   * Check if debug mode is enabled
   */
  public isDebugModeEnabled(): boolean {
    return this.isDebugMode;
  }

  /**
   * Record an error for debugging
   */
  public recordError(error: Error | string | any, context: ErrorContext): void {
    if (!this.config.enableErrorTracking) return;

    // Ensure we have valid error data
    const errorMessage = error instanceof Error ? error.message : String(error);
    const safeErrorMessage = errorMessage && errorMessage.trim().length > 0 
      ? errorMessage 
      : 'Unknown error';

    const debugError: DebugErrorInfo = {
      id: `debug_error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      error: error instanceof Error ? error : safeErrorMessage,
      context: {
        component: context.component || 'Unknown',
        action: context.action || 'unknown',
        userId: context.userId,
        sessionId: context.sessionId,
        timestamp: context.timestamp,
        additionalData: context.additionalData
      },
      timestamp: new Date(),
      stackTrace: error instanceof Error ? error.stack : undefined,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
      url: typeof window !== 'undefined' ? window.location.href : 'Unknown',
      applicationState: applicationState.getState()
    };

    this.errorHistory.unshift(debugError);

    // Keep only the most recent errors
    if (this.errorHistory.length > this.config.maxErrorHistory) {
      this.errorHistory = this.errorHistory.slice(0, this.config.maxErrorHistory);
    }

    if (this.isDebugMode && this.config.enableConsoleLogging) {
      console.error('🚨 Error recorded for debugging:', debugError);
    }
  }

  /**
   * Get error debug information
   */
  public getErrorDebugInfo(): DebugErrorInfo[] {
    return [...this.errorHistory];
  }

  /**
   * Clear error history
   */
  public clearErrorHistory(): void {
    this.errorHistory = [];
    
    if (this.config.enableConsoleLogging) {
      console.log('🧹 Error history cleared');
    }
  }

  /**
   * Start a performance timer
   */
  public startTimer(name: string, metadata?: Record<string, any>): void {
    if (!this.config.enablePerformanceTracking) return;

    const startTime = performance.now();
    this.activeTimers.set(name, startTime);

    if (this.isDebugMode && this.config.enableConsoleLogging) {
      console.time(`⏱️ ${name}`);
    }
  }

  /**
   * End a performance timer
   */
  public endTimer(name: string, metadata?: Record<string, any>): number | null {
    if (!this.config.enablePerformanceTracking) return null;

    const startTime = this.activeTimers.get(name);
    if (!startTime) {
      console.warn(`Timer "${name}" was not started`);
      return null;
    }

    const endTime = performance.now();
    const duration = endTime - startTime;

    this.activeTimers.delete(name);

    const metric: PerformanceMetric = {
      name,
      startTime,
      endTime,
      duration,
      metadata
    };

    this.recordPerformanceMetric(name, metadata, duration);

    if (this.isDebugMode && this.config.enableConsoleLogging) {
      console.timeEnd(`⏱️ ${name}`);
      console.log(`📊 ${name} took ${duration.toFixed(2)}ms`);
    }

    return duration;
  }

  /**
   * Record a performance metric
   */
  public recordPerformanceMetric(name: string, metadata?: Record<string, any>, duration?: number): void {
    if (!this.config.enablePerformanceTracking) return;

    const metric: PerformanceMetric = {
      name,
      startTime: performance.now(),
      duration,
      metadata
    };

    this.performanceMetrics.unshift(metric);

    // Keep only the most recent metrics
    if (this.performanceMetrics.length > this.config.maxPerformanceHistory) {
      this.performanceMetrics = this.performanceMetrics.slice(0, this.config.maxPerformanceHistory);
    }
  }

  /**
   * Get performance metrics
   */
  public getPerformanceMetrics(): PerformanceMetric[] {
    return [...this.performanceMetrics];
  }

  /**
   * Clear performance history
   */
  public clearPerformanceHistory(): void {
    this.performanceMetrics = [];
    this.activeTimers.clear();
    
    if (this.config.enableConsoleLogging) {
      console.log('🧹 Performance history cleared');
    }
  }

  /**
   * Record state change
   */
  private recordStateChange(state: ApplicationState): void {
    this.stateHistory.unshift({
      timestamp: new Date(),
      state: { ...state }
    });

    // Keep only recent state changes (last 20)
    if (this.stateHistory.length > 20) {
      this.stateHistory = this.stateHistory.slice(0, 20);
    }
  }

  /**
   * Get state history
   */
  public getStateHistory(): { timestamp: Date; state: ApplicationState }[] {
    return [...this.stateHistory];
  }

  /**
   * Get state changes between two states
   */
  private getStateChanges(oldState: ApplicationState, newState: ApplicationState): Record<string, { old: any; new: any }> {
    const changes: Record<string, { old: any; new: any }> = {};

    for (const key in newState) {
      const typedKey = key as keyof ApplicationState;
      if (oldState[typedKey] !== newState[typedKey]) {
        changes[key] = {
          old: oldState[typedKey],
          new: newState[typedKey]
        };
      }
    }

    return changes;
  }

  /**
   * Export all debug data
   */
  public exportDebugData(): string {
    const debugData = {
      timestamp: new Date().toISOString(),
      debugMode: this.isDebugMode,
      config: this.config,
      errors: this.errorHistory,
      performance: this.performanceMetrics,
      stateHistory: this.stateHistory,
      currentState: applicationState.getState(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
      url: typeof window !== 'undefined' ? window.location.href : 'Unknown'
    };

    return JSON.stringify(debugData, null, 2);
  }

  /**
   * Create a debug report
   */
  public createDebugReport(): string {
    const errors = this.errorHistory.slice(0, 5); // Last 5 errors
    const performance = this.performanceMetrics.slice(0, 10); // Last 10 metrics
    const state = applicationState.getState();

    return `
# Debug Report
Generated: ${new Date().toISOString()}

## Application State
- Initialized: ${state.isInitialized}
- Loading: ${state.isLoading}
- Has Error: ${state.hasError}
- Current View: ${state.currentView}
- Active Season: ${state.activeSeason?.name || 'None'}

## Recent Errors (${errors.length})
${errors.map(error => `
- ${error.timestamp.toISOString()}: ${error.error instanceof Error ? error.error.message : String(error.error)}
  Component: ${error.context.component || 'Unknown'}
  Action: ${error.context.action || 'Unknown'}
`).join('')}

## Performance Metrics (${performance.length})
${performance.map(metric => `
- ${metric.name}: ${metric.duration ? `${metric.duration.toFixed(2)}ms` : 'In progress'}
`).join('')}

## Browser Info
- User Agent: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown'}
- URL: ${typeof window !== 'undefined' ? window.location.href : 'Unknown'}
`;
  }

  /**
   * Log debug information to console
   */
  public logDebugInfo(): void {
    if (!this.config.enableConsoleLogging) return;

    console.group('🐛 Debug Information');
    console.log('Debug Mode:', this.isDebugMode);
    console.log('Errors:', this.errorHistory.length);
    console.log('Performance Metrics:', this.performanceMetrics.length);
    console.log('Current State:', applicationState.getState());
    console.groupEnd();
  }

  /**
   * Update debug configuration
   */
  public updateConfig(newConfig: Partial<DebugConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    if (this.config.enableConsoleLogging) {
      console.log('🔧 Debug configuration updated:', newConfig);
    }
  }

  /**
   * Get current debug configuration
   */
  public getConfig(): DebugConfig {
    return { ...this.config };
  }
}

/**
 * Global debug interface instance
 */
export const debugInterface = DebugInterface.getInstance();

/**
 * Utility function to wrap a function with performance timing
 */
export function withPerformanceTracking<T extends any[], R>(
  name: string,
  fn: (...args: T) => R,
  metadata?: Record<string, any>
): (...args: T) => R {
  return (...args: T) => {
    debugInterface.startTimer(name, metadata);
    try {
      const result = fn(...args);
      debugInterface.endTimer(name, metadata);
      return result;
    } catch (error) {
      debugInterface.endTimer(name, { ...metadata, error: true });
      throw error;
    }
  };
}

/**
 * Utility function to wrap an async function with performance timing
 */
export function withAsyncPerformanceTracking<T extends any[], R>(
  name: string,
  fn: (...args: T) => Promise<R>,
  metadata?: Record<string, any>
): (...args: T) => Promise<R> {
  return async (...args: T) => {
    debugInterface.startTimer(name, metadata);
    try {
      const result = await fn(...args);
      debugInterface.endTimer(name, metadata);
      return result;
    } catch (error) {
      debugInterface.endTimer(name, { ...metadata, error: true });
      throw error;
    }
  };
}