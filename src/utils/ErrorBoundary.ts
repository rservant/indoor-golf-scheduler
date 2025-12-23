/**
 * Error Boundary Implementation
 * 
 * Provides application-wide error boundaries to catch and handle
 * errors that occur in UI components and other parts of the application.
 */

import { errorHandler, ErrorContext } from './ErrorHandler';
import { applicationState } from '../state/ApplicationState';

export interface ErrorInfo {
  componentStack?: string;
  errorBoundary?: string;
  errorBoundaryStack?: string;
}

export interface ErrorBoundaryOptions {
  fallbackUI?: (error: Error, errorInfo: ErrorInfo) => HTMLElement;
  onError?: (error: Error, errorInfo: ErrorInfo) => boolean; // return true to recover
  enableLogging?: boolean;
  enableRetry?: boolean;
}

/**
 * Error Boundary class for catching and handling errors in UI components
 */
export class ErrorBoundary {
  private container: HTMLElement;
  private options: ErrorBoundaryOptions;
  private hasError: boolean = false;
  private lastError: Error | null = null;
  private retryCount: number = 0;
  private maxRetries: number = 3;

  // Public callback for testing
  public onError?: (error: Error, errorInfo: ErrorInfo) => boolean;

  constructor(container: HTMLElement, options: ErrorBoundaryOptions = {}) {
    this.container = container;
    this.options = {
      enableLogging: true,
      enableRetry: true,
      ...options
    };

    this.setupErrorBoundary();
  }

  /**
   * Set up the error boundary
   */
  private setupErrorBoundary(): void {
    // Wrap the container to catch errors
    this.wrapContainer();
  }

  /**
   * Wrap the container with error handling
   */
  private wrapContainer(): void {
    const originalInnerHTML = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    const originalAppendChild = this.container.appendChild;
    const originalInsertBefore = this.container.insertBefore;
    const originalReplaceChild = this.container.replaceChild;

    // Check if innerHTML is already redefined on this container
    const existingDescriptor = Object.getOwnPropertyDescriptor(this.container, 'innerHTML');
    if (existingDescriptor && existingDescriptor.configurable === false) {
      // Property is already redefined and not configurable, skip innerHTML wrapping
      console.warn('ErrorBoundary: innerHTML property already redefined on container, skipping innerHTML wrapping');
    } else {
      try {
        // Override innerHTML to catch errors during DOM updates
        Object.defineProperty(this.container, 'innerHTML', {
          set: (value: string) => {
            try {
              if (originalInnerHTML?.set) {
                originalInnerHTML.set.call(this.container, value);
              }
              this.clearError();
            } catch (error) {
              this.handleError(error as Error, {
                componentStack: 'innerHTML setter',
                errorBoundary: 'ErrorBoundary'
              });
            }
          },
      get: () => {
        return originalInnerHTML?.get?.call(this.container) || '';
      },
      configurable: true
    });
      } catch (error) {
        console.warn('ErrorBoundary: Failed to redefine innerHTML property:', error);
      }
    }

    // Override DOM manipulation methods
    this.container.appendChild = <T extends Node>(node: T): T => {
      try {
        const result = originalAppendChild.call(this.container, node);
        this.clearError();
        return result as T;
      } catch (error) {
        this.handleError(error as Error, {
          componentStack: 'appendChild',
          errorBoundary: 'ErrorBoundary'
        });
        throw error;
      }
    };

    this.container.insertBefore = <T extends Node>(newNode: T, referenceNode: Node | null): T => {
      try {
        const result = originalInsertBefore.call(this.container, newNode, referenceNode);
        this.clearError();
        return result as T;
      } catch (error) {
        this.handleError(error as Error, {
          componentStack: 'insertBefore',
          errorBoundary: 'ErrorBoundary'
        });
        throw error;
      }
    };

    this.container.replaceChild = <T extends Node>(newChild: Node, oldChild: T): T => {
      try {
        const result = originalReplaceChild.call(this.container, newChild, oldChild);
        this.clearError();
        return result as T;
      } catch (error) {
        this.handleError(error as Error, {
          componentStack: 'replaceChild',
          errorBoundary: 'ErrorBoundary'
        });
        throw error;
      }
    };
  }

  /**
   * Catch and handle errors in a function
   */
  public catchError<T>(fn: () => T): T | null {
    try {
      const result = fn();
      this.clearError();
      return result;
    } catch (error) {
      const errorInfo: ErrorInfo = {
        componentStack: 'catchError wrapper',
        errorBoundary: 'ErrorBoundary'
      };

      const shouldRecover = this.handleError(error as Error, errorInfo);
      
      if (shouldRecover) {
        return null; // Return null but don't re-throw
      } else {
        throw error; // Re-throw if not recovering
      }
    }
  }

  /**
   * Catch and handle async errors
   */
  public async catchAsyncError<T>(fn: () => Promise<T>): Promise<T | null> {
    try {
      const result = await fn();
      this.clearError();
      return result;
    } catch (error) {
      const errorInfo: ErrorInfo = {
        componentStack: 'catchAsyncError wrapper',
        errorBoundary: 'ErrorBoundary'
      };

      const shouldRecover = this.handleError(error as Error, errorInfo);
      
      if (shouldRecover) {
        return null;
      } else {
        throw error;
      }
    }
  }

  /**
   * Handle an error that occurred within the boundary
   */
  private handleError(error: Error, errorInfo: ErrorInfo): boolean {
    this.hasError = true;
    this.lastError = error;

    // Ensure we have a valid error message
    const errorMessage = error.message && error.message.trim().length > 0 
      ? error.message 
      : 'Unknown error occurred';

    // Create a new error with safe message if needed
    const safeError = error.message && error.message.trim().length > 0 
      ? error 
      : new Error(errorMessage);

    // Log the error if enabled
    if (this.options.enableLogging) {
      const context: ErrorContext = {
        component: 'ErrorBoundary',
        action: 'boundary-catch',
        additionalData: {
          errorInfo,
          retryCount: this.retryCount,
          hasError: this.hasError
        }
      };

      errorHandler.handleError(safeError, context);
    }

    // Call custom error handler if provided
    let shouldRecover = false;
    if (this.options.onError) {
      shouldRecover = this.options.onError(safeError, errorInfo);
    } else if (this.onError) {
      shouldRecover = this.onError(safeError, errorInfo);
    }

    // Show fallback UI if not recovering
    if (!shouldRecover) {
      this.showFallbackUI(safeError, errorInfo);
    }

    return shouldRecover;
  }

  /**
   * Show fallback UI when an error occurs
   */
  private showFallbackUI(error: Error, errorInfo: ErrorInfo): void {
    let fallbackElement: HTMLElement;

    if (this.options.fallbackUI) {
      fallbackElement = this.options.fallbackUI(error, errorInfo);
    } else {
      fallbackElement = this.createDefaultFallbackUI(error, errorInfo);
    }

    // Replace container content with fallback UI
    try {
      this.container.innerHTML = '';
      this.container.appendChild(fallbackElement);
    } catch (fallbackError) {
      // If even the fallback fails, show minimal error message
      this.container.innerHTML = `
        <div class="error-boundary-fallback">
          <h3>Something went wrong</h3>
          <p>Please refresh the page or contact support.</p>
          <button onclick="location.reload()">Refresh Page</button>
        </div>
      `;
    }
  }

  /**
   * Create default fallback UI
   */
  private createDefaultFallbackUI(error: Error, errorInfo: ErrorInfo): HTMLElement {
    const fallbackDiv = document.createElement('div');
    fallbackDiv.className = 'error-boundary-fallback';
    
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    fallbackDiv.innerHTML = `
      <div class="error-boundary-content">
        <div class="error-icon">⚠️</div>
        <h3>Something went wrong</h3>
        <p class="error-message">
          We encountered an unexpected error. Please try refreshing the page.
        </p>
        
        ${this.options.enableRetry && this.retryCount < this.maxRetries ? `
          <div class="error-actions">
            <button class="btn btn-primary retry-btn">
              Try Again
            </button>
            <button class="btn btn-secondary refresh-btn">
              Refresh Page
            </button>
          </div>
        ` : `
          <div class="error-actions">
            <button class="btn btn-primary refresh-btn">
              Refresh Page
            </button>
          </div>
        `}
        
        ${isDevelopment ? `
          <details class="error-details">
            <summary>Error Details (Development)</summary>
            <div class="error-technical">
              <p><strong>Error:</strong> ${error.message}</p>
              ${error.stack ? `<pre class="error-stack">${error.stack}</pre>` : ''}
              ${errorInfo.componentStack ? `
                <p><strong>Component Stack:</strong></p>
                <pre class="component-stack">${errorInfo.componentStack}</pre>
              ` : ''}
            </div>
          </details>
        ` : ''}
      </div>
    `;

    // Add event listeners
    const retryBtn = fallbackDiv.querySelector('.retry-btn');
    const refreshBtn = fallbackDiv.querySelector('.refresh-btn');

    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        this.retry();
      });
    }

    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        window.location.reload();
      });
    }

    return fallbackDiv;
  }

  /**
   * Retry the last operation
   */
  public retry(): void {
    if (this.retryCount >= this.maxRetries) {
      errorHandler.handleWarning('Maximum retry attempts reached. Please refresh the page.');
      return;
    }

    this.retryCount++;
    this.clearError();

    // Notify that we're retrying
    applicationState.addNotification({
      type: 'info',
      title: 'Retrying',
      message: `Attempting to recover... (${this.retryCount}/${this.maxRetries})`,
      autoHide: true,
      duration: 2000
    });

    // Trigger a re-render or recovery mechanism
    // This would typically involve calling the component's render method again
    this.triggerRecovery();
  }

  /**
   * Trigger recovery mechanism
   */
  private triggerRecovery(): void {
    // Emit a custom event that components can listen to for recovery
    const recoveryEvent = new CustomEvent('errorBoundaryRecovery', {
      detail: {
        retryCount: this.retryCount,
        lastError: this.lastError
      }
    });

    this.container.dispatchEvent(recoveryEvent);
  }

  /**
   * Clear error state
   */
  public clearError(): void {
    this.hasError = false;
    this.lastError = null;
    this.retryCount = 0;
  }

  /**
   * Check if the boundary has an error
   */
  public getHasError(): boolean {
    return this.hasError;
  }

  /**
   * Get the last error
   */
  public getLastError(): Error | null {
    return this.lastError;
  }

  /**
   * Get retry count
   */
  public getRetryCount(): number {
    return this.retryCount;
  }

  /**
   * Reset the error boundary
   */
  public reset(): void {
    this.clearError();
    
    // Clear any error UI
    if (this.container.querySelector('.error-boundary-fallback')) {
      this.container.innerHTML = '';
    }
  }

  /**
   * Destroy the error boundary and clean up
   */
  public destroy(): void {
    this.reset();
    
    // Remove event listeners and restore original methods
    // This is a simplified cleanup - in a real implementation,
    // you'd want to restore the original DOM methods
  }
}

/**
 * Global error boundary for the entire application
 */
export class GlobalErrorBoundary extends ErrorBoundary {
  private static instance: GlobalErrorBoundary | null = null;

  constructor(container: HTMLElement) {
    super(container, {
      enableLogging: true,
      enableRetry: true,
      onError: (error, errorInfo) => {
        // Global error handling logic
        console.error('Global error boundary caught error:', error, errorInfo);
        
        // Update application state
        applicationState.setError(true, 'A critical error occurred. Please refresh the page.');
        
        // Don't recover automatically for global errors
        return false;
      }
    });

    GlobalErrorBoundary.instance = this;
  }

  static getInstance(): GlobalErrorBoundary | null {
    return GlobalErrorBoundary.instance;
  }

  static create(container: HTMLElement): GlobalErrorBoundary {
    if (GlobalErrorBoundary.instance) {
      GlobalErrorBoundary.instance.destroy();
    }
    return new GlobalErrorBoundary(container);
  }
}

/**
 * Utility function to wrap a function with error boundary
 */
export function withErrorBoundary<T extends any[], R>(
  fn: (...args: T) => R,
  errorBoundary: ErrorBoundary
): (...args: T) => R | null {
  return (...args: T) => {
    return errorBoundary.catchError(() => fn(...args));
  };
}

/**
 * Utility function to wrap an async function with error boundary
 */
export function withAsyncErrorBoundary<T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  errorBoundary: ErrorBoundary
): (...args: T) => Promise<R | null> {
  return async (...args: T) => {
    return errorBoundary.catchAsyncError(() => fn(...args));
  };
}