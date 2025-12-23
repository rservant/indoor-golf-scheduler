/**
 * Main entry point for the Indoor Golf Scheduler
 * 
 * This file provides the main application bootstrap and exports
 * for both programmatic usage and direct browser usage.
 */

// Import CSS styles
import './ui/styles.css';

// Export all models, services, repositories, and UI components
export * from './models';
export * from './services';
export * from './repositories';
export * from './ui';
export * from './utils';

// Export the main application class and factory functions
export * from './app';

// Import the application for browser usage
import { createDefaultApp, IndoorGolfSchedulerApp } from './app';

/**
 * Browser-specific initialization
 * Automatically starts the application when DOM is ready if a container element exists
 */
if (typeof window !== 'undefined') {
  // Function to initialize the app when DOM is ready
  const initializeApp = async () => {
    // Look for a container element with the default ID
    const defaultContainer = document.getElementById('golf-scheduler-app');
    
    if (defaultContainer) {
      try {
        const app = await createDefaultApp('golf-scheduler-app');
        
        // Make the app instance globally available for debugging
        (window as any).golfSchedulerApp = app;
        
        console.log('Indoor Golf Scheduler initialized successfully');
      } catch (error) {
        console.error('Failed to initialize Indoor Golf Scheduler:', error);
        
        // Display a basic error message
        defaultContainer.innerHTML = `
          <div style="padding: 20px; text-align: center; color: #d32f2f;">
            <h2>Failed to Load Indoor Golf Scheduler</h2>
            <p>Please refresh the page or contact support if the problem persists.</p>
            <button onclick="location.reload()" style="padding: 10px 20px; margin-top: 10px;">
              Reload Page
            </button>
          </div>
        `;
      }
    }
  };

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
  } else {
    // DOM is already ready
    initializeApp();
  }
}

/**
 * Export a convenience function for manual initialization
 */
export const initializeGolfScheduler = async (containerElementId: string = 'golf-scheduler-app'): Promise<IndoorGolfSchedulerApp> => {
  return createDefaultApp(containerElementId);
};