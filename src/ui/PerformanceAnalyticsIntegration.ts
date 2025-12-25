/**
 * Performance Analytics Integration
 * 
 * Integrates the Performance Analytics Dashboard into the main application
 * and provides easy access controls.
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */

import { PerformanceAnalyticsDashboard } from './PerformanceAnalyticsDashboard';
import { performanceAnalyticsService } from '../services/PerformanceAnalyticsService';

export interface AnalyticsIntegrationConfig {
  enableKeyboardShortcut: boolean;
  keyboardShortcut: string;
  showToggleButton: boolean;
  buttonPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  autoStart: boolean;
}

/**
 * Performance Analytics Integration
 * 
 * Provides easy integration of the Performance Analytics Dashboard
 * into any application with keyboard shortcuts and toggle buttons.
 */
export class PerformanceAnalyticsIntegration {
  private dashboard: PerformanceAnalyticsDashboard;
  private config: AnalyticsIntegrationConfig;
  private toggleButton: HTMLElement | null = null;
  private keyboardHandler: ((event: KeyboardEvent) => void) | null = null;

  constructor(container: HTMLElement = document.body, config: Partial<AnalyticsIntegrationConfig> = {}) {
    this.config = {
      enableKeyboardShortcut: true,
      keyboardShortcut: 'Ctrl+Shift+P', // Ctrl+Shift+P for Performance
      showToggleButton: true,
      buttonPosition: 'bottom-right',
      autoStart: false,
      ...config
    };

    this.dashboard = new PerformanceAnalyticsDashboard(container);
    this.initialize();
  }

  /**
   * Show the analytics dashboard
   */
  show(): void {
    this.dashboard.show();
    this.updateToggleButton(true);
  }

  /**
   * Hide the analytics dashboard
   */
  hide(): void {
    this.dashboard.hide();
    this.updateToggleButton(false);
  }

  /**
   * Toggle dashboard visibility
   */
  toggle(): void {
    this.dashboard.toggle();
    // The dashboard will call our update method
  }

  /**
   * Get analytics service for advanced usage
   */
  getAnalyticsService() {
    return performanceAnalyticsService;
  }

  /**
   * Get dashboard instance for advanced usage
   */
  getDashboard() {
    return this.dashboard;
  }

  /**
   * Destroy the integration
   */
  destroy(): void {
    this.dashboard.destroy();
    this.removeToggleButton();
    this.removeKeyboardShortcut();
  }

  /**
   * Initialize the integration
   */
  private initialize(): void {
    if (this.config.showToggleButton) {
      this.createToggleButton();
    }

    if (this.config.enableKeyboardShortcut) {
      this.setupKeyboardShortcut();
    }

    if (this.config.autoStart) {
      this.show();
    }
  }

  /**
   * Create toggle button
   */
  private createToggleButton(): void {
    this.toggleButton = document.createElement('button');
    this.toggleButton.className = 'performance-analytics-toggle';
    this.toggleButton.innerHTML = '📊';
    this.toggleButton.title = 'Toggle Performance Analytics Dashboard';
    
    // Position the button
    this.positionToggleButton();
    
    // Add click handler
    this.toggleButton.addEventListener('click', () => {
      this.toggle();
    });

    // Add styles
    this.addToggleButtonStyles();

    document.body.appendChild(this.toggleButton);
  }

  /**
   * Position toggle button based on config
   */
  private positionToggleButton(): void {
    if (!this.toggleButton) return;

    const positions = {
      'top-left': { top: '20px', left: '20px' },
      'top-right': { top: '20px', right: '20px' },
      'bottom-left': { bottom: '20px', left: '20px' },
      'bottom-right': { bottom: '20px', right: '20px' }
    };

    const position = positions[this.config.buttonPosition];
    Object.assign(this.toggleButton.style, position);
  }

  /**
   * Update toggle button state
   */
  private updateToggleButton(isVisible: boolean): void {
    if (!this.toggleButton) return;

    this.toggleButton.style.opacity = isVisible ? '0.7' : '1';
    this.toggleButton.title = isVisible 
      ? 'Hide Performance Analytics Dashboard' 
      : 'Show Performance Analytics Dashboard';
  }

  /**
   * Remove toggle button
   */
  private removeToggleButton(): void {
    if (this.toggleButton) {
      this.toggleButton.remove();
      this.toggleButton = null;
    }
  }

  /**
   * Setup keyboard shortcut
   */
  private setupKeyboardShortcut(): void {
    this.keyboardHandler = (event: KeyboardEvent) => {
      if (this.matchesShortcut(event, this.config.keyboardShortcut)) {
        event.preventDefault();
        this.toggle();
      }
    };

    document.addEventListener('keydown', this.keyboardHandler);
  }

  /**
   * Remove keyboard shortcut
   */
  private removeKeyboardShortcut(): void {
    if (this.keyboardHandler) {
      document.removeEventListener('keydown', this.keyboardHandler);
      this.keyboardHandler = null;
    }
  }

  /**
   * Check if keyboard event matches shortcut
   */
  private matchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
    const parts = shortcut.toLowerCase().split('+');
    const key = parts[parts.length - 1];
    const modifiers = parts.slice(0, -1);

    // Check key
    if (event.key.toLowerCase() !== key) {
      return false;
    }

    // Check modifiers
    const requiredCtrl = modifiers.includes('ctrl');
    const requiredShift = modifiers.includes('shift');
    const requiredAlt = modifiers.includes('alt');
    const requiredMeta = modifiers.includes('meta') || modifiers.includes('cmd');

    return (
      event.ctrlKey === requiredCtrl &&
      event.shiftKey === requiredShift &&
      event.altKey === requiredAlt &&
      event.metaKey === requiredMeta
    );
  }

  /**
   * Add toggle button styles
   */
  private addToggleButtonStyles(): void {
    const styleId = 'performance-analytics-toggle-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .performance-analytics-toggle {
        position: fixed;
        width: 50px;
        height: 50px;
        border: none;
        border-radius: 25px;
        background: #007bff;
        color: white;
        font-size: 20px;
        cursor: pointer;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
        z-index: 9999;
        transition: all 0.3s ease;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .performance-analytics-toggle:hover {
        background: #0056b3;
        transform: scale(1.1);
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
      }

      .performance-analytics-toggle:active {
        transform: scale(0.95);
      }

      .performance-analytics-toggle:focus {
        outline: 2px solid #80bdff;
        outline-offset: 2px;
      }
    `;

    document.head.appendChild(style);
  }
}

/**
 * Quick setup function for easy integration
 */
export function setupPerformanceAnalytics(config: Partial<AnalyticsIntegrationConfig> = {}): PerformanceAnalyticsIntegration {
  return new PerformanceAnalyticsIntegration(document.body, config);
}

/**
 * Global instance for easy access
 */
let globalAnalyticsIntegration: PerformanceAnalyticsIntegration | null = null;

/**
 * Get or create global analytics integration
 */
export function getGlobalAnalyticsIntegration(config: Partial<AnalyticsIntegrationConfig> = {}): PerformanceAnalyticsIntegration {
  if (!globalAnalyticsIntegration) {
    globalAnalyticsIntegration = setupPerformanceAnalytics(config);
  }
  return globalAnalyticsIntegration;
}

/**
 * Destroy global analytics integration
 */
export function destroyGlobalAnalyticsIntegration(): void {
  if (globalAnalyticsIntegration) {
    globalAnalyticsIntegration.destroy();
    globalAnalyticsIntegration = null;
  }
}