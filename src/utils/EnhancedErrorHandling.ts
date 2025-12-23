/**
 * Enhanced Error Handling Integration
 * 
 * Integrates all error handling components into a cohesive system
 * with application-wide error boundaries, user-friendly messages,
 * and development debugging interfaces.
 */

import { ErrorHandler, errorHandler } from './ErrorHandler';
import { ErrorBoundary, GlobalErrorBoundary } from './ErrorBoundary';
import { DebugInterface, debugInterface } from './DebugInterface';
import { NotificationUI } from '../ui/NotificationUI';
import { DebugUI } from '../ui/DebugUI';
import { applicationState } from '../state/ApplicationState';

export interface EnhancedErrorHandlingConfig {
  enableGlobalErrorBoundary: boolean;
  enableNotificationUI: boolean;
  enableDebugUI: boolean;
  enableConsoleLogging: boolean;
  enablePerformanceTracking: boolean;
  enableStateMonitoring: boolean;
  debugMode: boolean;
}

/**
 * Enhanced Error Handling System
 * 
 * Provides a complete error handling solution with:
 * - Global error boundaries
 * - User-friendly error messages
 * - Development debugging interfaces
 * - Notification system
 * - Performance monitoring
 */
export class EnhancedErrorHandling {
  private static instance: EnhancedErrorHandling | null = null;
  private config: EnhancedErrorHandlingConfig;
  private isInitialized: boolean = false;

  // Component instances
  private errorHandler: ErrorHandler;
  private globalErrorBoundary: GlobalErrorBoundary | null = null;
  private debugInterface: DebugInterface;
  private notificationUI: NotificationUI | null = null;
  private debugUI: DebugUI | null = null;

  constructor(config: Partial<EnhancedErrorHandlingConfig> = {}) {
    this.config = {
      enableGlobalErrorBoundary: true,
      enableNotificationUI: true,
      enableDebugUI: process.env.NODE_ENV === 'development',
      enableConsoleLogging: true,
      enablePerformanceTracking: true,
      enableStateMonitoring: true,
      debugMode: process.env.NODE_ENV === 'development',
      ...config
    };

    // Use existing global instances
    this.errorHandler = errorHandler;
    this.debugInterface = debugInterface;

    EnhancedErrorHandling.instance = this;
  }

  /**
   * Get the singleton instance
   */
  static getInstance(config?: Partial<EnhancedErrorHandlingConfig>): EnhancedErrorHandling {
    if (!EnhancedErrorHandling.instance) {
      EnhancedErrorHandling.instance = new EnhancedErrorHandling(config);
    }
    return EnhancedErrorHandling.instance;
  }

  /**
   * Initialize the enhanced error handling system
   */
  public initialize(container: HTMLElement): void {
    if (this.isInitialized) {
      console.warn('Enhanced error handling system is already initialized');
      return;
    }

    try {
      // Set up global error boundary
      if (this.config.enableGlobalErrorBoundary) {
        this.setupGlobalErrorBoundary(container);
      }

      // Set up notification UI
      if (this.config.enableNotificationUI) {
        this.setupNotificationUI(container);
      }

      // Set up debug UI
      if (this.config.enableDebugUI) {
        this.setupDebugUI(container);
      }

      // Configure debug interface
      this.configureDebugInterface();

      // Set up additional error handling
      this.setupAdditionalErrorHandling();

      this.isInitialized = true;

      if (this.config.enableConsoleLogging) {
        console.log('✅ Enhanced error handling system initialized successfully');
      }

      // Show initialization success notification
      applicationState.addNotification({
        type: 'success',
        title: 'System Ready',
        message: 'Enhanced error handling system is active',
        autoHide: true,
        duration: 3000
      });

    } catch (error) {
      console.error('Failed to initialize enhanced error handling system:', error);
      
      // Fallback error handling
      this.setupFallbackErrorHandling();
    }
  }

  /**
   * Set up global error boundary
   */
  private setupGlobalErrorBoundary(container: HTMLElement): void {
    this.globalErrorBoundary = GlobalErrorBoundary.create(container);
    
    if (this.config.enableConsoleLogging) {
      console.log('🛡️ Global error boundary activated');
    }
  }

  /**
   * Set up notification UI
   */
  private setupNotificationUI(container: HTMLElement): void {
    this.notificationUI = new NotificationUI(container);
    
    if (this.config.enableConsoleLogging) {
      console.log('🔔 Notification system activated');
    }
  }

  /**
   * Set up debug UI
   */
  private setupDebugUI(container: HTMLElement): void {
    this.debugUI = new DebugUI(container);
    
    if (this.config.enableConsoleLogging) {
      console.log('🐛 Debug interface activated');
    }
  }

  /**
   * Configure debug interface
   */
  private configureDebugInterface(): void {
    this.debugInterface.updateConfig({
      enableErrorTracking: true,
      enablePerformanceTracking: this.config.enablePerformanceTracking,
      enableStateMonitoring: this.config.enableStateMonitoring,
      enableConsoleLogging: this.config.enableConsoleLogging
    });

    if (this.config.debugMode) {
      this.debugInterface.setDebugMode(true);
    }
  }

  /**
   * Set up additional error handling
   */
  private setupAdditionalErrorHandling(): void {
    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.errorHandler.handleError(event.reason, {
        component: 'Global',
        action: 'unhandledrejection',
        additionalData: {
          promise: event.promise,
          type: 'unhandledrejection'
        }
      });
      
      // Prevent default browser behavior
      event.preventDefault();
    });

    // Handle uncaught errors
    window.addEventListener('error', (event) => {
      this.errorHandler.handleError(event.error || event.message, {
        component: 'Global',
        action: 'uncaught-error',
        additionalData: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          type: 'uncaught-error'
        }
      });
    });

    // Handle resource loading errors
    window.addEventListener('error', (event) => {
      if (event.target && event.target !== window) {
        const target = event.target as HTMLElement;
        this.errorHandler.handleError(`Failed to load resource: ${target.tagName}`, {
          component: 'ResourceLoader',
          action: 'resource-load-error',
          additionalData: {
            tagName: target.tagName,
            src: (target as any).src || (target as any).href,
            type: 'resource-error'
          }
        });
      }
    }, true);

    if (this.config.enableConsoleLogging) {
      console.log('🔧 Additional error handlers configured');
    }
  }

  /**
   * Set up fallback error handling when initialization fails
   */
  private setupFallbackErrorHandling(): void {
    // Minimal error handling fallback
    window.addEventListener('error', (event) => {
      console.error('Fallback error handler:', event.error || event.message);
      
      // Show basic error message
      const errorDiv = document.createElement('div');
      errorDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #dc3545;
        color: white;
        padding: 1rem;
        border-radius: 4px;
        z-index: 9999;
        max-width: 300px;
      `;
      errorDiv.textContent = 'An error occurred. Please refresh the page.';
      document.body.appendChild(errorDiv);
      
      setTimeout(() => {
        if (errorDiv.parentNode) {
          errorDiv.parentNode.removeChild(errorDiv);
        }
      }, 5000);
    });

    console.log('⚠️ Fallback error handling activated');
  }

  /**
   * Wrap a function with error boundary
   */
  public wrapWithErrorBoundary<T extends any[], R>(
    fn: (...args: T) => R,
    context?: { component?: string; action?: string }
  ): (...args: T) => R | null {
    return (...args: T) => {
      try {
        return fn(...args);
      } catch (error) {
        this.errorHandler.handleError(error, {
          component: context?.component || 'Unknown',
          action: context?.action || 'function-call',
          additionalData: {
            functionName: fn.name,
            arguments: args
          }
        });
        return null;
      }
    };
  }

  /**
   * Wrap an async function with error boundary
   */
  public wrapAsyncWithErrorBoundary<T extends any[], R>(
    fn: (...args: T) => Promise<R>,
    context?: { component?: string; action?: string }
  ): (...args: T) => Promise<R | null> {
    return async (...args: T) => {
      try {
        return await fn(...args);
      } catch (error) {
        this.errorHandler.handleError(error, {
          component: context?.component || 'Unknown',
          action: context?.action || 'async-function-call',
          additionalData: {
            functionName: fn.name,
            arguments: args
          }
        });
        return null;
      }
    };
  }

  /**
   * Show a user-friendly error message
   */
  public showUserError(message: string, title: string = 'Error'): void {
    applicationState.addNotification({
      type: 'error',
      title,
      message,
      autoHide: false
    });
  }

  /**
   * Show a success message
   */
  public showSuccess(message: string, title: string = 'Success'): void {
    applicationState.addNotification({
      type: 'success',
      title,
      message,
      autoHide: true,
      duration: 3000
    });
  }

  /**
   * Show a warning message
   */
  public showWarning(message: string, title: string = 'Warning'): void {
    applicationState.addNotification({
      type: 'warning',
      title,
      message,
      autoHide: true,
      duration: 5000
    });
  }

  /**
   * Show an info message
   */
  public showInfo(message: string, title: string = 'Information'): void {
    applicationState.addNotification({
      type: 'info',
      title,
      message,
      autoHide: true,
      duration: 4000
    });
  }

  /**
   * Get error statistics
   */
  public getErrorStatistics(): {
    totalErrors: number;
    recentErrors: number;
    errorsByComponent: Record<string, number>;
    errorsByType: Record<string, number>;
  } {
    const errors = this.debugInterface.getErrorDebugInfo();
    const recentErrors = errors.filter(e => 
      Date.now() - e.timestamp.getTime() < 5 * 60 * 1000 // Last 5 minutes
    );

    const errorsByComponent: Record<string, number> = {};
    const errorsByType: Record<string, number> = {};

    errors.forEach(error => {
      const component = error.context.component || 'Unknown';
      const type = error.error instanceof Error ? error.error.constructor.name : 'Unknown';
      
      errorsByComponent[component] = (errorsByComponent[component] || 0) + 1;
      errorsByType[type] = (errorsByType[type] || 0) + 1;
    });

    return {
      totalErrors: errors.length,
      recentErrors: recentErrors.length,
      errorsByComponent,
      errorsByType
    };
  }

  /**
   * Export error report
   */
  public exportErrorReport(): string {
    const stats = this.getErrorStatistics();
    const debugData = this.debugInterface.exportDebugData();
    
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      statistics: stats,
      debugData: JSON.parse(debugData)
    }, null, 2);
  }

  /**
   * Test the error handling system
   */
  public testErrorHandling(): void {
    if (!this.config.debugMode) {
      console.warn('Error handling test is only available in debug mode');
      return;
    }

    console.log('🧪 Testing error handling system...');

    // Test different types of errors
    setTimeout(() => {
      this.errorHandler.handleError(new Error('Test error'), {
        component: 'TestComponent',
        action: 'test-error'
      });
    }, 100);

    setTimeout(() => {
      this.showSuccess('Error handling test completed');
    }, 500);
  }

  /**
   * Destroy the enhanced error handling system
   */
  public destroy(): void {
    if (!this.isInitialized) {
      return;
    }

    try {
      // Clean up UI components
      if (this.notificationUI) {
        this.notificationUI.destroy();
        this.notificationUI = null;
      }

      if (this.debugUI) {
        this.debugUI.destroy();
        this.debugUI = null;
      }

      if (this.globalErrorBoundary) {
        this.globalErrorBoundary.destroy();
        this.globalErrorBoundary = null;
      }

      this.isInitialized = false;

      if (this.config.enableConsoleLogging) {
        console.log('🧹 Enhanced error handling system destroyed');
      }

    } catch (error) {
      console.error('Error during enhanced error handling cleanup:', error);
    }
  }

  /**
   * Check if the system is initialized
   */
  public isSystemInitialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Get system configuration
   */
  public getConfig(): EnhancedErrorHandlingConfig {
    return { ...this.config };
  }

  /**
   * Update system configuration
   */
  public updateConfig(newConfig: Partial<EnhancedErrorHandlingConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Apply configuration changes
    if (this.isInitialized) {
      this.configureDebugInterface();
    }
  }
}

/**
 * Global enhanced error handling instance
 */
export const enhancedErrorHandling = EnhancedErrorHandling.getInstance();

/**
 * Utility function to initialize enhanced error handling
 */
export function initializeEnhancedErrorHandling(
  container: HTMLElement,
  config?: Partial<EnhancedErrorHandlingConfig>
): EnhancedErrorHandling {
  const system = EnhancedErrorHandling.getInstance(config);
  system.initialize(container);
  return system;
}

/**
 * Decorator for automatic error handling in class methods
 */
export function WithErrorHandling(
  context: { component?: string; action?: string } = {}
) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const isAsync = originalMethod.constructor.name === 'AsyncFunction';

    if (isAsync) {
      descriptor.value = enhancedErrorHandling.wrapAsyncWithErrorBoundary(
        originalMethod,
        {
          component: context.component || target.constructor.name,
          action: context.action || propertyKey
        }
      );
    } else {
      descriptor.value = enhancedErrorHandling.wrapWithErrorBoundary(
        originalMethod,
        {
          component: context.component || target.constructor.name,
          action: context.action || propertyKey
        }
      );
    }

    return descriptor;
  };
}