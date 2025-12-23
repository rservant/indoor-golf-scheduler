/**
 * Error Handling and User Feedback System
 * 
 * Provides centralized error handling, user feedback, and logging
 * for the Indoor Golf Scheduler application.
 */

import { applicationState } from '../state/ApplicationState';
import { debugInterface } from './DebugInterface';

export interface ErrorContext {
  component?: string;
  action?: string;
  userId?: string;
  sessionId?: string;
  timestamp?: Date;
  additionalData?: Record<string, any>;
}

export interface UserFeedbackOptions {
  title?: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  autoHide?: boolean;
  duration?: number;
  actions?: UserFeedbackAction[];
}

export interface UserFeedbackAction {
  label: string;
  action: () => void;
  style?: 'primary' | 'secondary' | 'danger';
}

export class ErrorHandler {
  private static instance: ErrorHandler;
  private errorLog: ErrorLogEntry[] = [];
  private maxLogEntries = 100;

  private constructor() {
    this.setupGlobalErrorHandlers();
  }

  static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  /**
   * Set up global error handlers
   */
  private setupGlobalErrorHandlers(): void {
    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.handleError(event.reason, {
        component: 'Global',
        action: 'unhandledrejection'
      });
      event.preventDefault();
    });

    // Handle uncaught errors
    window.addEventListener('error', (event) => {
      this.handleError(event.error, {
        component: 'Global',
        action: 'uncaught-error',
        additionalData: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno
        }
      });
    });
  }

  /**
   * Handle an error with context and user feedback
   */
  handleError(error: Error | string | any, context: ErrorContext = {}): void {
    const errorEntry = this.createErrorLogEntry(error, context);
    this.logError(errorEntry);

    // Record error for debugging
    if (debugInterface) {
      debugInterface.recordError(error, context);
    }

    // Determine user-friendly message
    const userMessage = this.getUserFriendlyMessage(error, context);
    
    // Show user feedback
    this.showUserFeedback({
      type: 'error',
      title: 'Error',
      message: userMessage,
      autoHide: false,
      actions: [
        {
          label: 'Dismiss',
          action: () => {},
          style: 'secondary'
        },
        {
          label: 'Retry',
          action: () => this.suggestRetryAction(context),
          style: 'primary'
        }
      ]
    });

    // Update application state
    applicationState.setError(true, userMessage);
  }

  /**
   * Handle success feedback
   */
  handleSuccess(message: string, context: ErrorContext = {}): void {
    this.showUserFeedback({
      type: 'success',
      message,
      autoHide: true,
      duration: 3000
    });

    // Log success for debugging
    console.log(`Success: ${message}`, context);
  }

  /**
   * Handle warning feedback
   */
  handleWarning(message: string, context: ErrorContext = {}): void {
    this.showUserFeedback({
      type: 'warning',
      message,
      autoHide: true,
      duration: 5000
    });

    // Log warning
    console.warn(`Warning: ${message}`, context);
  }

  /**
   * Handle info feedback
   */
  handleInfo(message: string, context: ErrorContext = {}): void {
    this.showUserFeedback({
      type: 'info',
      message,
      autoHide: true,
      duration: 4000
    });

    // Log info
    console.info(`Info: ${message}`, context);
  }

  /**
   * Create an error log entry
   */
  private createErrorLogEntry(error: any, context: ErrorContext): ErrorLogEntry {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    return {
      id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      message: errorMessage,
      stack: errorStack || '',
      context,
      userAgent: navigator.userAgent,
      url: window.location.href
    };
  }

  /**
   * Log an error entry
   */
  private logError(errorEntry: ErrorLogEntry): void {
    // Add to in-memory log
    this.errorLog.unshift(errorEntry);
    
    // Keep only the most recent entries
    if (this.errorLog.length > this.maxLogEntries) {
      this.errorLog = this.errorLog.slice(0, this.maxLogEntries);
    }

    // Console logging
    console.error('Error logged:', {
      message: errorEntry.message,
      context: errorEntry.context,
      stack: errorEntry.stack
    });

    // In a production environment, you might want to send errors to a logging service
    // this.sendToLoggingService(errorEntry);
  }

  /**
   * Get a user-friendly error message
   */
  private getUserFriendlyMessage(error: any, context: ErrorContext): string {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Handle empty or whitespace-only messages
    if (!errorMessage || errorMessage.trim().length === 0) {
      return 'An unexpected error occurred. Please try again or contact support if the problem persists.';
    }

    // Map technical errors to user-friendly messages
    const errorMappings: Record<string, string> = {
      'Network Error': 'Unable to connect to the server. Please check your internet connection.',
      'Failed to fetch': 'Unable to load data. Please check your internet connection and try again.',
      'Season with name': 'A season with this name already exists. Please choose a different name.',
      'Player with name': 'A player with this name already exists in the current season.',
      'No active season': 'Please create and activate a season before adding players.',
      'Week not found': 'The selected week could not be found. Please refresh and try again.',
      'Schedule not found': 'The schedule could not be found. Please generate a new schedule.',
      'Validation failed': 'The data you entered is not valid. Please check your input and try again.'
    };

    // Check for mapped messages
    for (const [key, message] of Object.entries(errorMappings)) {
      if (errorMessage.includes(key)) {
        return message;
      }
    }

    // Context-specific messages
    if (context.component === 'SeasonManager') {
      return 'There was an issue managing seasons. Please try again or contact support.';
    }

    if (context.component === 'PlayerManager') {
      return 'There was an issue managing players. Please check your input and try again.';
    }

    if (context.component === 'ScheduleGenerator') {
      return 'There was an issue generating the schedule. Please check player availability and try again.';
    }

    // Default message
    return 'An unexpected error occurred. Please try again or contact support if the problem persists.';
  }

  /**
   * Show user feedback
   */
  private showUserFeedback(options: UserFeedbackOptions): void {
    // Ensure we have a valid message
    if (!options.message || options.message.trim().length === 0) {
      options.message = 'An error occurred. Please try again.';
    }

    applicationState.addNotification({
      type: options.type,
      title: options.title || this.getDefaultTitle(options.type),
      message: options.message,
      autoHide: options.autoHide !== false,
      duration: options.duration || undefined
    });
  }

  /**
   * Get default title for feedback type
   */
  private getDefaultTitle(type: UserFeedbackOptions['type']): string {
    const titles = {
      success: 'Success',
      error: 'Error',
      warning: 'Warning',
      info: 'Information'
    };
    return titles[type];
  }

  /**
   * Suggest retry action based on context
   */
  private suggestRetryAction(context: ErrorContext): void {
    if (context.action === 'createSeason') {
      applicationState.navigateTo('seasons');
    } else if (context.action === 'addPlayer') {
      applicationState.navigateTo('players');
    } else if (context.action === 'generateSchedule') {
      applicationState.navigateTo('schedule');
    } else {
      // Generic retry - refresh the current view
      window.location.reload();
    }
  }

  /**
   * Get error log for debugging
   */
  getErrorLog(): ErrorLogEntry[] {
    return [...this.errorLog];
  }

  /**
   * Clear error log
   */
  clearErrorLog(): void {
    this.errorLog = [];
  }

  /**
   * Export error log for support
   */
  exportErrorLog(): string {
    const exportData = {
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      errors: this.errorLog
    };

    return JSON.stringify(exportData, null, 2);
  }
}

interface ErrorLogEntry {
  id: string;
  timestamp: Date;
  message: string;
  stack: string;
  context: ErrorContext;
  userAgent: string;
  url: string;
}

/**
 * Global error handler instance
 */
export const errorHandler = ErrorHandler.getInstance();

/**
 * Convenience functions for common error handling scenarios
 */
export const handleAsyncError = async <T>(
  operation: () => Promise<T>,
  context: ErrorContext = {}
): Promise<T | null> => {
  try {
    return await operation();
  } catch (error) {
    errorHandler.handleError(error, context);
    return null;
  }
};

export const handleSyncError = <T>(
  operation: () => T,
  context: ErrorContext = {}
): T | null => {
  try {
    return operation();
  } catch (error) {
    errorHandler.handleError(error, context);
    return null;
  }
};

/**
 * Decorator for automatic error handling in class methods
 */
export function HandleErrors(context: Partial<ErrorContext> = {}) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      try {
        return await originalMethod.apply(this, args);
      } catch (error) {
        errorHandler.handleError(error, {
          component: target.constructor.name,
          action: propertyKey,
          ...context
        });
        throw error;
      }
    };

    return descriptor;
  };
}