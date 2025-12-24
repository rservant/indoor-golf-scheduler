/**
 * Performance Decorators
 * 
 * Provides decorators for automatic performance tracking of methods and classes.
 */

import { performanceMonitor, PerformanceThresholds, PerformanceTracker } from '../services/PerformanceMonitor';

/**
 * Method decorator for automatic performance tracking
 * 
 * @param thresholds Optional performance thresholds for the method
 * @param operationName Optional custom operation name (defaults to className.methodName)
 */
export function trackPerformance(
  thresholds?: PerformanceThresholds,
  operationName?: string
) {
  return function(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const className = target.constructor.name;
    const defaultOperationName = `${className}.${propertyKey}`;
    const finalOperationName = operationName || defaultOperationName;

    // Set thresholds if provided
    if (thresholds) {
      performanceMonitor.setThresholds(finalOperationName, thresholds);
    }

    descriptor.value = function(...args: any[]) {
      const tracker = performanceMonitor.startOperation(finalOperationName, {
        className,
        methodName: propertyKey,
        argumentCount: args.length
      });

      try {
        const result = originalMethod.apply(this, args);

        // Handle both sync and async methods
        if (result && typeof result.then === 'function') {
          // Async method
          return result
            .then((asyncResult: any) => {
              performanceMonitor.endOperation(tracker);
              return asyncResult;
            })
            .catch((error: any) => {
              const metrics = performanceMonitor.endOperation(tracker);
              // Add error information to metrics
              console.error(`Performance tracked method ${finalOperationName} failed:`, error);
              throw error;
            });
        } else {
          // Sync method
          performanceMonitor.endOperation(tracker);
          return result;
        }
      } catch (error) {
        performanceMonitor.endOperation(tracker);
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Class decorator for tracking all methods in a class
 * 
 * @param thresholds Default thresholds for all methods
 * @param excludeMethods Methods to exclude from tracking
 */
export function trackClassPerformance(
  thresholds?: PerformanceThresholds,
  excludeMethods: string[] = []
) {
  return function<T extends { new(...args: any[]): {} }>(constructor: T) {
    const prototype = constructor.prototype;
    const methodNames = Object.getOwnPropertyNames(prototype)
      .filter(name => {
        return name !== 'constructor' && 
               typeof prototype[name] === 'function' &&
               !excludeMethods.includes(name);
      });

    methodNames.forEach(methodName => {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, methodName);
      if (descriptor && descriptor.value) {
        const trackedDescriptor = trackPerformance(thresholds)(prototype, methodName, descriptor);
        Object.defineProperty(prototype, methodName, trackedDescriptor);
      }
    });

    return constructor;
  };
}

/**
 * Utility function to manually track a block of code
 * 
 * @param operationName Name of the operation
 * @param operation Function to execute and track
 * @param thresholds Optional performance thresholds
 */
export async function trackOperation<T>(
  operationName: string,
  operation: () => T | Promise<T>,
  thresholds?: PerformanceThresholds
): Promise<T> {
  if (thresholds) {
    performanceMonitor.setThresholds(operationName, thresholds);
  }

  const tracker = performanceMonitor.startOperation(operationName);

  try {
    const result = await operation();
    performanceMonitor.endOperation(tracker);
    return result;
  } catch (error) {
    performanceMonitor.endOperation(tracker);
    throw error;
  }
}

/**
 * Performance tracking wrapper for functions
 * 
 * @param fn Function to wrap
 * @param operationName Name for the operation
 * @param thresholds Optional performance thresholds
 */
export function wrapWithPerformanceTracking<T extends (...args: any[]) => any>(
  fn: T,
  operationName: string,
  thresholds?: PerformanceThresholds
): T {
  if (thresholds) {
    performanceMonitor.setThresholds(operationName, thresholds);
  }

  return ((...args: any[]) => {
    const tracker = performanceMonitor.startOperation(operationName, {
      argumentCount: args.length
    });

    try {
      const result = fn(...args);

      if (result && typeof result.then === 'function') {
        // Async function
        return result
          .then((asyncResult: any) => {
            performanceMonitor.endOperation(tracker);
            return asyncResult;
          })
          .catch((error: any) => {
            performanceMonitor.endOperation(tracker);
            throw error;
          });
      } else {
        // Sync function
        performanceMonitor.endOperation(tracker);
        return result;
      }
    } catch (error) {
      performanceMonitor.endOperation(tracker);
      throw error;
    }
  }) as T;
}

/**
 * Batch performance tracking for multiple operations
 */
export class PerformanceBatch {
  private operations: { name: string; tracker: PerformanceTracker }[] = [];

  startOperation(name: string, metadata?: Record<string, any>): void {
    const tracker = performanceMonitor.startOperation(name, metadata);
    this.operations.push({ name, tracker });
  }

  endOperation(name: string): void {
    const operationIndex = this.operations.findIndex(op => op.name === name);
    if (operationIndex >= 0) {
      const operation = this.operations[operationIndex];
      performanceMonitor.endOperation(operation.tracker);
      this.operations.splice(operationIndex, 1);
    }
  }

  endAllOperations(): void {
    this.operations.forEach(operation => {
      performanceMonitor.endOperation(operation.tracker);
    });
    this.operations = [];
  }

  getActiveOperations(): string[] {
    return this.operations.map(op => op.name);
  }
}