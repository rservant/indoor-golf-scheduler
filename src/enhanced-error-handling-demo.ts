/**
 * Enhanced Error Handling Demo
 * 
 * Demonstrates the enhanced error handling system capabilities
 */

import { enhancedErrorHandling, WithErrorHandling } from './utils/EnhancedErrorHandling';
import { applicationState } from './state/ApplicationState';

/**
 * Demo class showing error handling features
 */
export class ErrorHandlingDemo {
  
  /**
   * Demonstrate basic error handling
   */
  @WithErrorHandling({ component: 'ErrorHandlingDemo', action: 'basicError' })
  public demonstrateBasicError(): void {
    throw new Error('This is a demonstration error');
  }

  /**
   * Demonstrate async error handling
   */
  @WithErrorHandling({ component: 'ErrorHandlingDemo', action: 'asyncError' })
  public async demonstrateAsyncError(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 100));
    throw new Error('This is a demonstration async error');
  }

  /**
   * Demonstrate different notification types
   */
  public demonstrateNotifications(): void {
    enhancedErrorHandling.showSuccess('Operation completed successfully!');
    
    setTimeout(() => {
      enhancedErrorHandling.showWarning('This is a warning message');
    }, 1000);
    
    setTimeout(() => {
      enhancedErrorHandling.showInfo('Here is some information');
    }, 2000);
    
    setTimeout(() => {
      enhancedErrorHandling.showUserError('This is an error message', 'Demo Error');
    }, 3000);
  }

  /**
   * Demonstrate error statistics
   */
  public demonstrateErrorStatistics(): void {
    // Generate some test errors
    try {
      this.demonstrateBasicError();
    } catch (error) {
      // Error is handled by decorator
    }

    setTimeout(() => {
      const stats = enhancedErrorHandling.getErrorStatistics();
      console.log('Error Statistics:', stats);
      
      enhancedErrorHandling.showInfo(
        `Total errors: ${stats.totalErrors}, Recent errors: ${stats.recentErrors}`,
        'Error Statistics'
      );
    }, 500);
  }

  /**
   * Run all demonstrations
   */
  public runAllDemos(): void {
    console.log('🎭 Starting Enhanced Error Handling Demo...');
    
    // Show initial success message
    enhancedErrorHandling.showSuccess('Enhanced Error Handling Demo Started!', 'Demo');
    
    // Demonstrate notifications
    setTimeout(() => {
      console.log('📢 Demonstrating notifications...');
      this.demonstrateNotifications();
    }, 1000);
    
    // Demonstrate error handling
    setTimeout(() => {
      console.log('🚨 Demonstrating error handling...');
      try {
        this.demonstrateBasicError();
      } catch (error) {
        // Error is handled by decorator
      }
    }, 5000);
    
    // Demonstrate async error handling
    setTimeout(() => {
      console.log('⏰ Demonstrating async error handling...');
      this.demonstrateAsyncError().catch(() => {
        // Error is handled by decorator
      });
    }, 6000);
    
    // Show error statistics
    setTimeout(() => {
      console.log('📊 Demonstrating error statistics...');
      this.demonstrateErrorStatistics();
    }, 7000);
    
    // Final message
    setTimeout(() => {
      enhancedErrorHandling.showSuccess('Enhanced Error Handling Demo Completed!', 'Demo Complete');
      console.log('✅ Enhanced Error Handling Demo completed!');
    }, 10000);
  }
}

/**
 * Initialize and run the demo
 */
export function runErrorHandlingDemo(): void {
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      const demo = new ErrorHandlingDemo();
      demo.runAllDemos();
    });
  } else {
    const demo = new ErrorHandlingDemo();
    demo.runAllDemos();
  }
}

// Auto-run demo in development mode
if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  // Make demo available globally for manual testing
  (window as any).errorHandlingDemo = {
    run: runErrorHandlingDemo,
    testError: () => {
      const demo = new ErrorHandlingDemo();
      demo.demonstrateBasicError();
    },
    testNotifications: () => {
      const demo = new ErrorHandlingDemo();
      demo.demonstrateNotifications();
    },
    getStats: () => enhancedErrorHandling.getErrorStatistics(),
    exportReport: () => enhancedErrorHandling.exportErrorReport()
  };
  
  console.log('🎭 Error Handling Demo available at window.errorHandlingDemo');
  console.log('Available commands:', Object.keys((window as any).errorHandlingDemo));
}