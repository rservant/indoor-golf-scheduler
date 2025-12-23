/**
 * Property-Based Tests for Enhanced Error Handling
 * 
 * **Feature: typescript-activation, Property 7: Error Handling Robustness**
 * **Validates: Requirements 3.3, 5.1**
 */

import fc from 'fast-check';
import { ErrorHandler, ErrorContext, UserFeedbackOptions } from './utils/ErrorHandler';
import { applicationState } from './state/ApplicationState';
import { ErrorBoundary } from './utils/ErrorBoundary';
import { debugInterface } from './utils/DebugInterface';

describe('Enhanced Error Handling Property Tests', () => {
  let errorHandler: ErrorHandler;
  let errorBoundary: ErrorBoundary;

  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '<div id="test-container"></div>';
    
    // Create fresh instances
    errorHandler = ErrorHandler.getInstance();
    errorBoundary = new ErrorBoundary(document.getElementById('test-container')!);
    
    // Clear any existing error logs and notifications
    errorHandler.clearErrorLog();
    applicationState.clearNotifications();
    debugInterface.clearErrorHistory();
  });

  afterEach(() => {
    // Clean up
    document.body.innerHTML = '';
    applicationState.clearNotifications();
    debugInterface.clearErrorHistory();
  });

  /**
   * Property 7: Error Handling Robustness
   * For any error condition that occurs during application execution, 
   * the system should display user-friendly error messages and maintain application stability
   */
  describe('Property 7: Error Handling Robustness', () => {
    test('should handle any error with user-friendly messages and maintain stability', () => {
      fc.assert(fc.property(
        // Generate various types of errors
        fc.oneof(
          fc.record({
            type: fc.constant('Error'),
            message: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0),
            stack: fc.option(fc.string())
          }),
          fc.record({
            type: fc.constant('TypeError'),
            message: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0),
            stack: fc.option(fc.string())
          }),
          fc.record({
            type: fc.constant('ReferenceError'),
            message: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0),
            stack: fc.option(fc.string())
          }),
          fc.record({
            type: fc.constant('string'),
            message: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0)
          }),
          fc.record({
            type: fc.constant('object'),
            message: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0),
            code: fc.option(fc.integer()),
            details: fc.option(fc.object())
          })
        ),
        // Generate error contexts
        fc.record({
          component: fc.option(fc.oneof(
            fc.constant('SeasonManager'),
            fc.constant('PlayerManager'),
            fc.constant('ScheduleGenerator'),
            fc.constant('UI'),
            fc.constant('Repository')
          )),
          action: fc.option(fc.oneof(
            fc.constant('create'),
            fc.constant('update'),
            fc.constant('delete'),
            fc.constant('fetch'),
            fc.constant('validate')
          )),
          userId: fc.option(fc.string()),
          additionalData: fc.option(fc.object())
        }),
        (errorData, context) => {
          // Create error object based on type
          let error: any;
          switch (errorData.type) {
            case 'Error':
              error = new Error(errorData.message);
              if ('stack' in errorData && errorData.stack) error.stack = errorData.stack;
              break;
            case 'TypeError':
              error = new TypeError(errorData.message);
              if ('stack' in errorData && errorData.stack) error.stack = errorData.stack;
              break;
            case 'ReferenceError':
              error = new ReferenceError(errorData.message);
              if ('stack' in errorData && errorData.stack) error.stack = errorData.stack;
              break;
            case 'string':
              error = errorData.message;
              break;
            case 'object':
              error = {
                message: errorData.message,
                ...('code' in errorData && { code: errorData.code }),
                ...('details' in errorData && { details: errorData.details })
              };
              break;
          }

          // Handle the error
          const initialNotificationCount = applicationState.getState().notifications.length;
          const initialErrorState = applicationState.getState().hasError;

          errorHandler.handleError(error, context);

          // Verify error handling robustness
          const finalState = applicationState.getState();
          const errorLog = errorHandler.getErrorLog();

          // 1. Error should be logged
          expect(errorLog.length).toBeGreaterThan(0);
          const latestError = errorLog[0];
          expect(latestError.message).toBeDefined();
          expect(latestError.timestamp).toBeInstanceOf(Date);
          expect(latestError.context).toEqual(context);

          // 2. User-friendly notification should be created
          expect(finalState.notifications.length).toBeGreaterThan(initialNotificationCount);
          const latestNotification = finalState.notifications[finalState.notifications.length - 1];
          expect(latestNotification.type).toBe('error');
          expect(latestNotification.message).toBeDefined();
          expect(latestNotification.message.length).toBeGreaterThan(0);
          
          // 3. Message should be user-friendly (not technical)
          const message = latestNotification.message.toLowerCase();
          expect(message).not.toContain('undefined');
          expect(message).not.toContain('null');
          expect(message).not.toContain('stack trace');
          expect(message).not.toContain('at object.');

          // 4. Application state should indicate error but remain stable
          expect(finalState.hasError).toBe(true);
          expect(finalState.errorMessage).toBeDefined();

          // 5. Application should not crash (we're still executing)
          expect(() => applicationState.getState()).not.toThrow();
        }
      ), { numRuns: 100 });
    });

    test('should provide context-specific error messages', () => {
      fc.assert(fc.property(
        fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
        fc.oneof(
          fc.constant('SeasonManager'),
          fc.constant('PlayerManager'),
          fc.constant('ScheduleGenerator'),
          fc.constant('Repository'),
          fc.constant('UI')
        ),
        fc.oneof(
          fc.constant('create'),
          fc.constant('update'),
          fc.constant('delete'),
          fc.constant('fetch'),
          fc.constant('validate')
        ),
        (errorMessage, component, action) => {
          const error = new Error(errorMessage);
          const context: ErrorContext = { component, action };

          errorHandler.handleError(error, context);

          const notifications = applicationState.getState().notifications;
          const latestNotification = notifications[notifications.length - 1];

          // Error message should be contextual and user-friendly
          expect(latestNotification.message).toBeDefined();
          expect(latestNotification.message.length).toBeGreaterThan(0);

          // Should not expose technical details (but may contain common words)
          expect(latestNotification.message).not.toContain('Error:');
          expect(latestNotification.message).not.toContain('TypeError:');
          expect(latestNotification.message).not.toContain('ReferenceError:');
          expect(latestNotification.message).not.toContain('stack trace');
          expect(latestNotification.message).not.toContain('at Object.');
        }
      ), { numRuns: 50 });
    });

    test('should handle error boundaries correctly', () => {
      fc.assert(fc.property(
        fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
        fc.boolean(),
        (errorMessage, shouldRecover) => {
          let boundaryTriggered = false;
          let errorCaught = null;

          // Set up error boundary callback
          errorBoundary.onError = (caughtError, errorInfo) => {
            boundaryTriggered = true;
            errorCaught = caughtError;
            return shouldRecover;
          };

          // Simulate component error
          let result = null;
          let threwError = false;
          
          try {
            result = errorBoundary.catchError(() => {
              const error = new Error(errorMessage);
              throw error;
            });
          } catch (error) {
            threwError = true;
          }

          // Verify error boundary behavior
          expect(boundaryTriggered).toBe(true);
          expect(errorCaught).toBeInstanceOf(Error);
          expect(errorCaught.message).toBe(errorMessage);

          if (shouldRecover) {
            expect(result).toBeNull();
            expect(threwError).toBe(false);
          } else {
            expect(threwError).toBe(true);
          }

          // Error should still be logged
          const errorLog = errorHandler.getErrorLog();
          expect(errorLog.length).toBeGreaterThan(0);
        }
      ), { numRuns: 50 });
    });

    test('should provide debugging information in development mode', () => {
      fc.assert(fc.property(
        fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
        fc.record({
          component: fc.option(fc.string()),
          action: fc.option(fc.string()),
          additionalData: fc.option(fc.object())
        }),
        (errorMessage, context) => {
          const error = new Error(errorMessage);
          
          // Enable debug mode
          debugInterface.setDebugMode(true);
          
          errorHandler.handleError(error, context);

          // Should have debug information available
          const debugInfo = debugInterface.getErrorDebugInfo();
          expect(debugInfo).toBeDefined();
          expect(debugInfo.length).toBeGreaterThan(0);

          const latestDebugInfo = debugInfo[0];
          expect(latestDebugInfo.error).toBeDefined();
          expect(latestDebugInfo.context.component).toBe(context.component || 'Unknown');
          expect(latestDebugInfo.context.action).toBe(context.action || 'unknown');
          expect(latestDebugInfo.context.additionalData).toBe(context.additionalData);
          expect(latestDebugInfo.timestamp).toBeInstanceOf(Date);
          expect(latestDebugInfo.stackTrace).toBeDefined();
        }
      ), { numRuns: 30 });
    });

    test('should handle success, warning, and info feedback correctly', () => {
      fc.assert(fc.property(
        fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0),
        fc.oneof(
          fc.constant('success'),
          fc.constant('warning'),
          fc.constant('info')
        ),
        (message, type) => {
          const initialCount = applicationState.getState().notifications.length;

          switch (type) {
            case 'success':
              errorHandler.handleSuccess(message);
              break;
            case 'warning':
              errorHandler.handleWarning(message);
              break;
            case 'info':
              errorHandler.handleInfo(message);
              break;
          }

          const notifications = applicationState.getState().notifications;
          expect(notifications.length).toBe(initialCount + 1);

          const latestNotification = notifications[notifications.length - 1];
          expect(latestNotification.type).toBe(type);
          expect(latestNotification.message).toBe(message);
          expect(latestNotification.autoHide).toBe(true);
        }
      ), { numRuns: 50 });
    });
  });
});