/**
 * Debug UI Component
 * 
 * Provides a visual debug interface for development mode.
 */

import { debugInterface, DebugErrorInfo, PerformanceMetric } from '../utils/DebugInterface';
import { applicationState } from '../state/ApplicationState';

export class DebugUI {
  private container: HTMLElement;
  private debugPanel: HTMLElement | null = null;
  private debugToggle: HTMLElement | null = null;
  private isVisible: boolean = false;
  private updateInterval: number | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.createDebugToggle();
    this.setupKeyboardShortcuts();
  }

  /**
   * Create the debug toggle button
   */
  private createDebugToggle(): void {
    this.debugToggle = document.createElement('button');
    this.debugToggle.className = 'debug-toggle';
    this.debugToggle.textContent = '🐛 Debug';
    this.debugToggle.title = 'Toggle Debug Panel (Ctrl+Shift+D)';
    
    this.debugToggle.addEventListener('click', () => {
      this.toggleDebugPanel();
    });

    // Only show in development mode
    if (process.env.NODE_ENV === 'development') {
      document.body.appendChild(this.debugToggle);
    }
  }

  /**
   * Set up keyboard shortcuts
   */
  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', (e) => {
      // Ctrl+Shift+D to toggle debug panel
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        this.toggleDebugPanel();
      }
      
      // Ctrl+Shift+C to clear debug data
      if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        this.clearDebugData();
      }
      
      // Ctrl+Shift+E to export debug data
      if (e.ctrlKey && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        this.exportDebugData();
      }
    });
  }

  /**
   * Toggle the debug panel visibility
   */
  public toggleDebugPanel(): void {
    if (this.isVisible) {
      this.hideDebugPanel();
    } else {
      this.showDebugPanel();
    }
  }

  /**
   * Show the debug panel
   */
  public showDebugPanel(): void {
    if (this.debugPanel) {
      this.debugPanel.remove();
    }

    this.debugPanel = this.createDebugPanel();
    document.body.appendChild(this.debugPanel);
    
    this.isVisible = true;
    debugInterface.setDebugMode(true);
    
    if (this.debugToggle) {
      this.debugToggle.classList.add('active');
      this.debugToggle.textContent = '🐛 Hide';
    }

    // Start updating the panel
    this.startUpdating();
  }

  /**
   * Hide the debug panel
   */
  public hideDebugPanel(): void {
    if (this.debugPanel) {
      this.debugPanel.remove();
      this.debugPanel = null;
    }
    
    this.isVisible = false;
    debugInterface.setDebugMode(false);
    
    if (this.debugToggle) {
      this.debugToggle.classList.remove('active');
      this.debugToggle.textContent = '🐛 Debug';
    }

    // Stop updating
    this.stopUpdating();
  }

  /**
   * Create the debug panel
   */
  private createDebugPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'debug-panel';
    
    panel.innerHTML = `
      <div class="debug-header">
        <h4>🐛 Debug Panel</h4>
        <div class="debug-controls">
          <button class="debug-btn" data-action="clear">Clear</button>
          <button class="debug-btn" data-action="export">Export</button>
          <button class="debug-btn" data-action="close">×</button>
        </div>
      </div>
      <div class="debug-content">
        <div class="debug-section">
          <h5>Application State</h5>
          <div class="debug-state"></div>
        </div>
        <div class="debug-section">
          <h5>Recent Errors</h5>
          <div class="debug-errors"></div>
        </div>
        <div class="debug-section">
          <h5>Performance</h5>
          <div class="debug-performance"></div>
        </div>
      </div>
    `;

    // Add event listeners
    panel.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const action = target.getAttribute('data-action');
      
      switch (action) {
        case 'clear':
          this.clearDebugData();
          break;
        case 'export':
          this.exportDebugData();
          break;
        case 'close':
          this.hideDebugPanel();
          break;
      }
    });

    return panel;
  }

  /**
   * Start updating the debug panel
   */
  private startUpdating(): void {
    this.updateDebugPanel();
    this.updateInterval = window.setInterval(() => {
      this.updateDebugPanel();
    }, 1000);
  }

  /**
   * Stop updating the debug panel
   */
  private stopUpdating(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Update the debug panel content
   */
  private updateDebugPanel(): void {
    if (!this.debugPanel) return;

    this.updateStateSection();
    this.updateErrorsSection();
    this.updatePerformanceSection();
  }

  /**
   * Update the state section
   */
  private updateStateSection(): void {
    const stateContainer = this.debugPanel?.querySelector('.debug-state');
    if (!stateContainer) return;

    const state = applicationState.getState();
    
    stateContainer.innerHTML = `
      <div class="debug-item">
        <span class="debug-label">Initialized:</span>
        <span class="debug-value">${state.isInitialized}</span>
      </div>
      <div class="debug-item">
        <span class="debug-label">Loading:</span>
        <span class="debug-value">${state.isLoading}</span>
      </div>
      <div class="debug-item">
        <span class="debug-label">Has Error:</span>
        <span class="debug-value ${state.hasError ? 'debug-error' : ''}">${state.hasError}</span>
      </div>
      <div class="debug-item">
        <span class="debug-label">Current View:</span>
        <span class="debug-value">${state.currentView}</span>
      </div>
      <div class="debug-item">
        <span class="debug-label">Active Season:</span>
        <span class="debug-value">${state.activeSeason?.name || 'None'}</span>
      </div>
      <div class="debug-item">
        <span class="debug-label">Notifications:</span>
        <span class="debug-value">${state.notifications.length}</span>
      </div>
    `;
  }

  /**
   * Update the errors section
   */
  private updateErrorsSection(): void {
    const errorsContainer = this.debugPanel?.querySelector('.debug-errors');
    if (!errorsContainer) return;

    const errors = debugInterface.getErrorDebugInfo().slice(0, 3);
    
    if (errors.length === 0) {
      errorsContainer.innerHTML = '<div class="debug-item">No recent errors</div>';
      return;
    }

    errorsContainer.innerHTML = errors.map(error => `
      <div class="debug-item">
        <div class="debug-error">
          ${error.timestamp.toLocaleTimeString()}: ${this.truncateText(this.getErrorMessage(error.error), 50)}
        </div>
        <div class="debug-label">
          ${error.context.component || 'Unknown'} → ${error.context.action || 'Unknown'}
        </div>
      </div>
    `).join('');
  }

  /**
   * Update the performance section
   */
  private updatePerformanceSection(): void {
    const performanceContainer = this.debugPanel?.querySelector('.debug-performance');
    if (!performanceContainer) return;

    const metrics = debugInterface.getPerformanceMetrics().slice(0, 3);
    
    if (metrics.length === 0) {
      performanceContainer.innerHTML = '<div class="debug-item">No performance data</div>';
      return;
    }

    performanceContainer.innerHTML = metrics.map(metric => `
      <div class="debug-item">
        <span class="debug-label">${metric.name}:</span>
        <span class="debug-value">${metric.duration ? `${metric.duration.toFixed(2)}ms` : 'In progress'}</span>
      </div>
    `).join('');
  }

  /**
   * Get error message from error object
   */
  private getErrorMessage(error: any): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    if (error && typeof error === 'object' && error.message) {
      return error.message;
    }
    return String(error);
  }

  /**
   * Truncate text to specified length
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength - 3) + '...';
  }

  /**
   * Clear debug data
   */
  private clearDebugData(): void {
    debugInterface.clearErrorHistory();
    debugInterface.clearPerformanceHistory();
    applicationState.clearNotifications();
    
    applicationState.addNotification({
      type: 'info',
      title: 'Debug Data Cleared',
      message: 'All debug data has been cleared.',
      autoHide: true,
      duration: 2000
    });
  }

  /**
   * Export debug data
   */
  private exportDebugData(): void {
    try {
      const debugData = debugInterface.exportDebugData();
      const blob = new Blob([debugData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `debug-data-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      URL.revokeObjectURL(url);
      
      applicationState.addNotification({
        type: 'success',
        title: 'Debug Data Exported',
        message: 'Debug data has been downloaded as a JSON file.',
        autoHide: true,
        duration: 3000
      });
    } catch (error) {
      applicationState.addNotification({
        type: 'error',
        title: 'Export Failed',
        message: 'Failed to export debug data. Check the console for details.',
        autoHide: true,
        duration: 5000
      });
      console.error('Failed to export debug data:', error);
    }
  }

  /**
   * Destroy the debug UI
   */
  public destroy(): void {
    this.hideDebugPanel();
    
    if (this.debugToggle && this.debugToggle.parentNode) {
      this.debugToggle.parentNode.removeChild(this.debugToggle);
    }
  }
}

// Add additional CSS for debug UI
const debugStyle = document.createElement('style');
debugStyle.textContent = `
  .debug-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  }

  .debug-controls {
    display: flex;
    gap: 0.5rem;
  }

  .debug-btn {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: white;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.7rem;
    transition: background-color 0.2s;
  }

  .debug-btn:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .debug-section {
    margin-bottom: 1rem;
  }

  .debug-section h5 {
    color: #17a2b8;
    margin: 0 0 0.5rem 0;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .debug-content {
    max-height: 200px;
    overflow-y: auto;
  }
`;
document.head.appendChild(debugStyle);