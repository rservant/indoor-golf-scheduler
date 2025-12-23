/**
 * Availability-specific Error Handling System
 * 
 * Provides comprehensive error handling for availability persistence operations
 * with automatic retry, exponential backoff, and user-friendly recovery options.
 */

import { errorHandler, ErrorContext } from './ErrorHandler';
import { applicationState, NotificationAction } from '../state/ApplicationState';

export interface AvailabilityError extends Error {
  code: AvailabilityErrorCode;
  playerId?: string;
  weekId?: string;
  operation?: string;
  retryable: boolean;
  originalError?: Error;
}

export enum AvailabilityErrorCode {
  PERSISTENCE_FAILED = 'PERSISTENCE_FAILED',
  VERIFICATION_FAILED = 'VERIFICATION_FAILED',
  PLAYER_NOT_FOUND = 'PLAYER_NOT_FOUND',
  WEEK_NOT_FOUND = 'WEEK_NOT_FOUND',
  BULK_OPERATION_FAILED = 'BULK_OPERATION_FAILED',
  CONCURRENT_OPERATION = 'CONCURRENT_OPERATION',
  STORAGE_QUOTA_EXCEEDED = 'STORAGE_QUOTA_EXCEEDED',
  STORAGE_CORRUPTED = 'STORAGE_CORRUPTED',
  OPERATION_TIMEOUT = 'OPERATION_TIMEOUT',
  ROLLBACK_FAILED = 'ROLLBACK_FAILED'
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors: AvailabilityErrorCode[];
}

export interface AvailabilityOperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: AvailabilityError;
  attempts: number;
  totalTime: number;
}

export interface RecoveryOption {
  label: string;
  description: string;
  action: () => Promise<void>;
  style: 'primary' | 'secondary' | 'danger';
}

/**
 * Comprehensive error handler for availability operations
 */
export class AvailabilityErrorHandler {
  private static instance: AvailabilityErrorHandler;
  
  private readonly defaultRetryConfig: RetryConfig = {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
    retryableErrors: [
      AvailabilityErrorCode.PERSISTENCE_FAILED,
      AvailabilityErrorCode.VERIFICATION_FAILED,
      AvailabilityErrorCode.OPERATION_TIMEOUT,
      AvailabilityErrorCode.CONCURRENT_OPERATION
    ]
  };

  private constructor() {}

  static getInstance(): AvailabilityErrorHandler {
    if (!AvailabilityErrorHandler.instance) {
      AvailabilityErrorHandler.instance = new AvailabilityErrorHandler();
    }
    return AvailabilityErrorHandler.instance;
  }

  /**
   * Execute an operation with automatic retry and error handling
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: {
      operationName: string;
      playerId?: string;
      weekId?: string;
      retryConfig?: Partial<RetryConfig>;
    }
  ): Promise<AvailabilityOperationResult<T>> {
    const config = { ...this.defaultRetryConfig, ...context.retryConfig };
    const startTime = Date.now();
    let lastError: AvailabilityError | null = null;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        const result = await operation();
        
        return {
          success: true,
          data: result,
          attempts: attempt,
          totalTime: Date.now() - startTime
        };
      } catch (error) {
        lastError = this.normalizeError(error, context);
        
        // Check if error is retryable
        if (!this.isRetryableError(lastError, config) || attempt === config.maxAttempts) {
          break;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt - 1),
          config.maxDelayMs
        );

        console.warn(`Attempt ${attempt} failed for ${context.operationName}, retrying in ${delay}ms:`, lastError);
        
        // Wait before retry
        await this.delay(delay);
      }
    }

    // All attempts failed
    const result: AvailabilityOperationResult<T> = {
      success: false,
      error: lastError!,
      attempts: config.maxAttempts,
      totalTime: Date.now() - startTime
    };

    // Handle the error with user feedback and recovery options
    await this.handleOperationFailure(lastError!, context);

    return result;
  }

  /**
   * Handle individual player availability operation errors
   */
  async handlePlayerAvailabilityError(
    error: Error,
    playerId: string,
    weekId: string,
    operation: 'toggle' | 'set'
  ): Promise<void> {
    const availabilityError = this.normalizeError(error, {
      operationName: `player-availability-${operation}`,
      playerId,
      weekId
    });

    const context: ErrorContext = {
      component: 'AvailabilityManagementUI',
      action: `player-availability-${operation}`,
      additionalData: {
        playerId,
        weekId,
        errorCode: availabilityError.code
      }
    };

    // Show user-friendly error message with recovery options
    const recoveryOptions = this.getPlayerAvailabilityRecoveryOptions(playerId, weekId, operation);
    
    applicationState.addNotification({
      type: 'error',
      title: 'Player Availability Error',
      message: this.getUserFriendlyMessage(availabilityError),
      autoHide: false,
      actions: recoveryOptions.map(option => ({
        label: option.label,
        action: option.action,
        style: option.style
      }))
    });

    // Log the error
    errorHandler.handleError(availabilityError, context);
  }

  /**
   * Handle bulk availability operation errors
   */
  async handleBulkAvailabilityError(
    error: Error,
    weekId: string,
    playerIds: string[],
    operation: 'mark-all-available' | 'mark-all-unavailable'
  ): Promise<void> {
    const availabilityError = this.normalizeError(error, {
      operationName: `bulk-availability-${operation}`,
      weekId
    });

    const context: ErrorContext = {
      component: 'AvailabilityManagementUI',
      action: `bulk-availability-${operation}`,
      additionalData: {
        weekId,
        playerCount: playerIds.length,
        errorCode: availabilityError.code
      }
    };

    // Show detailed error message for bulk operations
    const recoveryOptions = this.getBulkAvailabilityRecoveryOptions(weekId, playerIds, operation);
    
    applicationState.addNotification({
      type: 'error',
      title: 'Bulk Availability Error',
      message: this.getBulkOperationErrorMessage(availabilityError, playerIds.length),
      autoHide: false,
      actions: recoveryOptions.map(option => ({
        label: option.label,
        action: option.action,
        style: option.style
      }))
    });

    // Log the error
    errorHandler.handleError(availabilityError, context);
  }

  /**
   * Handle persistence verification errors
   */
  async handleVerificationError(
    playerId: string,
    weekId: string,
    expected: boolean,
    actual: boolean
  ): Promise<void> {
    const error = this.createAvailabilityError(
      AvailabilityErrorCode.VERIFICATION_FAILED,
      `Verification failed: expected ${expected}, got ${actual}`,
      { playerId, weekId }
    );

    const context: ErrorContext = {
      component: 'PlayerManager',
      action: 'verify-availability-persistence',
      additionalData: {
        playerId,
        weekId,
        expected,
        actual
      }
    };

    // Show verification error with data refresh option
    applicationState.addNotification({
      type: 'warning',
      title: 'Data Verification Failed',
      message: 'The availability change could not be verified. The data may not have been saved correctly.',
      autoHide: false,
      actions: [
        {
          label: 'Refresh Data',
          action: async () => {
            // Trigger data refresh in the UI
            applicationState.triggerDataRefresh();
          },
          style: 'primary'
        },
        {
          label: 'Retry Operation',
          action: async () => {
            // This would need to be implemented by the calling component
            console.log('Retry operation requested');
          },
          style: 'secondary'
        }
      ]
    });

    errorHandler.handleError(error, context);
  }

  /**
   * Handle storage-related errors
   */
  async handleStorageError(error: Error, operation: string): Promise<void> {
    let errorCode = AvailabilityErrorCode.PERSISTENCE_FAILED;
    
    // Detect specific storage errors
    if (error.message.includes('quota') || error.message.includes('storage')) {
      errorCode = AvailabilityErrorCode.STORAGE_QUOTA_EXCEEDED;
    } else if (error.message.includes('corrupt') || error.message.includes('invalid')) {
      errorCode = AvailabilityErrorCode.STORAGE_CORRUPTED;
    }

    const availabilityError = this.createAvailabilityError(
      errorCode,
      error.message,
      { operation }
    );

    const context: ErrorContext = {
      component: 'WeekRepository',
      action: 'storage-operation',
      additionalData: {
        operation,
        errorCode
      }
    };

    // Show storage-specific error message with recovery options
    const recoveryOptions = this.getStorageRecoveryOptions(errorCode);
    
    applicationState.addNotification({
      type: 'error',
      title: 'Storage Error',
      message: this.getStorageErrorMessage(errorCode),
      autoHide: false,
      actions: recoveryOptions.map(option => ({
        label: option.label,
        action: option.action,
        style: option.style
      }))
    });

    errorHandler.handleError(availabilityError, context);
  }

  /**
   * Normalize any error to AvailabilityError
   */
  private normalizeError(
    error: any,
    context: { operationName: string; playerId?: string; weekId?: string }
  ): AvailabilityError {
    if (error instanceof Error && 'code' in error) {
      return error as AvailabilityError;
    }

    // Determine error code based on error message
    let code = AvailabilityErrorCode.PERSISTENCE_FAILED;
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('not found') && context.playerId) {
      code = AvailabilityErrorCode.PLAYER_NOT_FOUND;
    } else if (message.includes('not found') && context.weekId) {
      code = AvailabilityErrorCode.WEEK_NOT_FOUND;
    } else if (message.includes('verification')) {
      code = AvailabilityErrorCode.VERIFICATION_FAILED;
    } else if (message.includes('bulk') || message.includes('multiple')) {
      code = AvailabilityErrorCode.BULK_OPERATION_FAILED;
    } else if (message.includes('concurrent') || message.includes('conflict')) {
      code = AvailabilityErrorCode.CONCURRENT_OPERATION;
    } else if (message.includes('timeout')) {
      code = AvailabilityErrorCode.OPERATION_TIMEOUT;
    } else if (message.includes('rollback')) {
      code = AvailabilityErrorCode.ROLLBACK_FAILED;
    }

    return this.createAvailabilityError(code, message, context);
  }

  /**
   * Create a standardized AvailabilityError
   */
  private createAvailabilityError(
    code: AvailabilityErrorCode,
    message: string,
    context: { playerId?: string; weekId?: string; operation?: string },
    originalError?: Error
  ): AvailabilityError {
    const error = new Error(message) as AvailabilityError;
    error.code = code;
    if (context.playerId) error.playerId = context.playerId;
    if (context.weekId) error.weekId = context.weekId;
    if (context.operation) error.operation = context.operation;
    error.retryable = this.defaultRetryConfig.retryableErrors.includes(code);
    if (originalError) error.originalError = originalError;
    error.name = 'AvailabilityError';
    
    return error;
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: AvailabilityError, config: RetryConfig): boolean {
    return error.retryable && config.retryableErrors.includes(error.code);
  }

  /**
   * Get user-friendly error message
   */
  private getUserFriendlyMessage(error: AvailabilityError): string {
    const messages: Record<AvailabilityErrorCode, string> = {
      [AvailabilityErrorCode.PERSISTENCE_FAILED]: 'Failed to save the availability change. Please try again.',
      [AvailabilityErrorCode.VERIFICATION_FAILED]: 'The availability change could not be verified. Please refresh and try again.',
      [AvailabilityErrorCode.PLAYER_NOT_FOUND]: 'The selected player could not be found. Please refresh the page.',
      [AvailabilityErrorCode.WEEK_NOT_FOUND]: 'The selected week could not be found. Please refresh the page.',
      [AvailabilityErrorCode.BULK_OPERATION_FAILED]: 'The bulk availability operation failed. Some players may not have been updated.',
      [AvailabilityErrorCode.CONCURRENT_OPERATION]: 'Another operation is in progress. Please wait and try again.',
      [AvailabilityErrorCode.STORAGE_QUOTA_EXCEEDED]: 'Storage space is full. Please clear some data or contact support.',
      [AvailabilityErrorCode.STORAGE_CORRUPTED]: 'Data storage appears to be corrupted. Please refresh the page.',
      [AvailabilityErrorCode.OPERATION_TIMEOUT]: 'The operation took too long to complete. Please try again.',
      [AvailabilityErrorCode.ROLLBACK_FAILED]: 'Failed to restore previous state after an error. Please refresh the page.'
    };

    return messages[error.code] || 'An unexpected error occurred while updating availability.';
  }

  /**
   * Get bulk operation error message
   */
  private getBulkOperationErrorMessage(error: AvailabilityError, playerCount: number): string {
    const baseMessage = this.getUserFriendlyMessage(error);
    return `${baseMessage} (${playerCount} players affected)`;
  }

  /**
   * Get storage error message
   */
  private getStorageErrorMessage(errorCode: AvailabilityErrorCode): string {
    switch (errorCode) {
      case AvailabilityErrorCode.STORAGE_QUOTA_EXCEEDED:
        return 'Your browser storage is full. Please clear some data or use a different browser.';
      case AvailabilityErrorCode.STORAGE_CORRUPTED:
        return 'The data storage appears to be corrupted. Refreshing the page may help restore functionality.';
      default:
        return 'A storage error occurred. Please try refreshing the page.';
    }
  }

  /**
   * Get recovery options for player availability errors
   */
  private getPlayerAvailabilityRecoveryOptions(
    playerId: string,
    weekId: string,
    operation: string
  ): RecoveryOption[] {
    return [
      {
        label: 'Retry',
        description: 'Try the operation again',
        action: async () => {
          // This would trigger a retry in the UI component
          console.log(`Retry requested for player ${playerId} in week ${weekId}`);
        },
        style: 'primary'
      },
      {
        label: 'Refresh Data',
        description: 'Reload the latest data from storage',
        action: async () => {
          applicationState.triggerDataRefresh();
        },
        style: 'secondary'
      },
      {
        label: 'Dismiss',
        description: 'Close this error message',
        action: async () => {
          // Just dismiss the notification
        },
        style: 'secondary'
      }
    ];
  }

  /**
   * Get recovery options for bulk availability errors
   */
  private getBulkAvailabilityRecoveryOptions(
    weekId: string,
    playerIds: string[],
    operation: string
  ): RecoveryOption[] {
    return [
      {
        label: 'Retry All',
        description: 'Retry the bulk operation for all players',
        action: async () => {
          console.log(`Bulk retry requested for week ${weekId}, operation: ${operation}`);
        },
        style: 'primary'
      },
      {
        label: 'Manual Update',
        description: 'Update players individually',
        action: async () => {
          applicationState.addNotification({
            type: 'info',
            title: 'Manual Update',
            message: 'Please update each player\'s availability individually.',
            autoHide: true,
            duration: 5000
          });
        },
        style: 'secondary'
      },
      {
        label: 'Refresh Data',
        description: 'Reload the latest data from storage',
        action: async () => {
          applicationState.triggerDataRefresh();
        },
        style: 'secondary'
      }
    ];
  }

  /**
   * Get recovery options for storage errors
   */
  private getStorageRecoveryOptions(errorCode: AvailabilityErrorCode): RecoveryOption[] {
    const options: RecoveryOption[] = [
      {
        label: 'Refresh Page',
        description: 'Reload the application',
        action: async () => {
          window.location.reload();
        },
        style: 'primary'
      }
    ];

    if (errorCode === AvailabilityErrorCode.STORAGE_QUOTA_EXCEEDED) {
      options.unshift({
        label: 'Clear Data',
        description: 'Clear application data to free up space',
        action: async () => {
          if (confirm('This will clear all application data. Are you sure?')) {
            localStorage.clear();
            window.location.reload();
          }
        },
        style: 'danger'
      });
    }

    return options;
  }

  /**
   * Handle operation failure with comprehensive error reporting
   */
  private async handleOperationFailure(
    error: AvailabilityError,
    context: { operationName: string; playerId?: string; weekId?: string }
  ): Promise<void> {
    // Log detailed error information
    console.error(`Operation ${context.operationName} failed after all retry attempts:`, {
      error: error.message,
      code: error.code,
      playerId: context.playerId,
      weekId: context.weekId,
      retryable: error.retryable
    });

    // Record error for debugging
    errorHandler.handleError(error, {
      component: 'AvailabilityErrorHandler',
      action: context.operationName,
      additionalData: {
        errorCode: error.code,
        playerId: context.playerId,
        weekId: context.weekId,
        retryable: error.retryable
      }
    });
  }

  /**
   * Utility method for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Global availability error handler instance
 */
export const availabilityErrorHandler = AvailabilityErrorHandler.getInstance();

/**
 * Convenience function for wrapping availability operations with error handling
 */
export async function withAvailabilityErrorHandling<T>(
  operation: () => Promise<T>,
  context: {
    operationName: string;
    playerId?: string;
    weekId?: string;
    retryConfig?: Partial<RetryConfig>;
  }
): Promise<T | null> {
  const result = await availabilityErrorHandler.executeWithRetry(operation, context);
  
  if (result.success) {
    return result.data!;
  } else {
    return null;
  }
}