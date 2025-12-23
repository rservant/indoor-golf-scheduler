/**
 * Progress Tracking UI Component
 * 
 * Displays progress indicators and status updates for long-running operations
 * like schedule regeneration.
 */

import { RegenerationStatus } from '../services/ScheduleManager';
import { applicationState } from '../state/ApplicationState';

export interface ProgressTrackingOptions {
  title: string;
  showPercentage?: boolean;
  showCurrentStep?: boolean;
  showElapsedTime?: boolean;
  allowCancel?: boolean;
  onCancel?: () => void;
}

export class ProgressTrackingUI {
  private container: HTMLElement;
  private progressElement: HTMLElement | null = null;
  private isVisible: boolean = false;
  private startTime: Date | null = null;
  private updateInterval: number | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  /**
   * Show progress tracking for an operation
   */
  showProgress(options: ProgressTrackingOptions): void {
    this.startTime = new Date();
    this.isVisible = true;

    // Create progress element if it doesn't exist
    if (!this.progressElement) {
      this.progressElement = this.createProgressElement();
      this.container.appendChild(this.progressElement);
    }

    // Update the progress display
    this.updateProgressDisplay(0, 'Starting...', options);

    // Start updating elapsed time if enabled
    if (options.showElapsedTime) {
      this.startElapsedTimeUpdates();
    }

    // Show the progress element
    this.progressElement.style.display = 'block';
    this.progressElement.classList.add('progress-visible');
  }

  /**
   * Update progress with new status
   */
  updateProgress(status: RegenerationStatus, options: ProgressTrackingOptions): void {
    if (!this.progressElement || !this.isVisible) return;

    this.updateProgressDisplay(status.progress, status.currentStep, options);
  }

  /**
   * Hide progress tracking
   */
  hideProgress(): void {
    if (!this.progressElement) return;

    this.isVisible = false;
    this.progressElement.style.display = 'none';
    this.progressElement.classList.remove('progress-visible');

    // Stop elapsed time updates
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Show completion state briefly before hiding
   */
  showCompletion(success: boolean, message: string): void {
    if (!this.progressElement) return;

    const progressBar = this.progressElement.querySelector('.progress-bar') as HTMLElement;
    const statusText = this.progressElement.querySelector('.progress-status') as HTMLElement;
    const percentageText = this.progressElement.querySelector('.progress-percentage') as HTMLElement;

    if (progressBar) {
      progressBar.style.width = '100%';
      progressBar.className = `progress-bar ${success ? 'progress-success' : 'progress-error'}`;
    }

    if (statusText) {
      statusText.textContent = message;
    }

    if (percentageText) {
      percentageText.textContent = '100%';
    }

    // Hide after a brief delay
    setTimeout(() => {
      this.hideProgress();
    }, 2000);
  }

  /**
   * Create the progress element
   */
  private createProgressElement(): HTMLElement {
    const element = document.createElement('div');
    element.className = 'progress-tracking-overlay';
    element.innerHTML = `
      <div class="progress-tracking-modal">
        <div class="progress-header">
          <h3 class="progress-title"></h3>
          <button class="progress-cancel" style="display: none;">Cancel</button>
        </div>
        <div class="progress-content">
          <div class="progress-bar-container">
            <div class="progress-bar"></div>
          </div>
          <div class="progress-info">
            <div class="progress-status"></div>
            <div class="progress-details">
              <span class="progress-percentage"></span>
              <span class="progress-elapsed" style="display: none;"></span>
            </div>
          </div>
        </div>
      </div>
    `;

    // Add cancel button listener
    const cancelButton = element.querySelector('.progress-cancel') as HTMLButtonElement;
    if (cancelButton) {
      cancelButton.addEventListener('click', () => {
        this.handleCancel();
      });
    }

    return element;
  }

  /**
   * Update the progress display
   */
  private updateProgressDisplay(progress: number, currentStep: string, options: ProgressTrackingOptions): void {
    if (!this.progressElement) return;

    const titleElement = this.progressElement.querySelector('.progress-title') as HTMLElement;
    const progressBar = this.progressElement.querySelector('.progress-bar') as HTMLElement;
    const statusElement = this.progressElement.querySelector('.progress-status') as HTMLElement;
    const percentageElement = this.progressElement.querySelector('.progress-percentage') as HTMLElement;
    const cancelButton = this.progressElement.querySelector('.progress-cancel') as HTMLElement;

    // Update title
    if (titleElement) {
      titleElement.textContent = options.title;
    }

    // Update progress bar
    if (progressBar) {
      progressBar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
      
      // Add animation class for smooth transitions
      if (!progressBar.classList.contains('progress-animated')) {
        progressBar.classList.add('progress-animated');
      }
    }

    // Update status text
    if (statusElement && options.showCurrentStep !== false) {
      statusElement.textContent = currentStep;
    }

    // Update percentage
    if (percentageElement && options.showPercentage !== false) {
      percentageElement.textContent = `${Math.round(progress)}%`;
      percentageElement.style.display = 'inline';
    } else if (percentageElement) {
      percentageElement.style.display = 'none';
    }

    // Update cancel button
    if (cancelButton) {
      if (options.allowCancel) {
        cancelButton.style.display = 'inline-block';
      } else {
        cancelButton.style.display = 'none';
      }
    }
  }

  /**
   * Start updating elapsed time display
   */
  private startElapsedTimeUpdates(): void {
    const elapsedElement = this.progressElement?.querySelector('.progress-elapsed') as HTMLElement;
    if (!elapsedElement || !this.startTime) return;

    elapsedElement.style.display = 'inline';

    this.updateInterval = window.setInterval(() => {
      if (!this.startTime || !this.isVisible) return;

      const elapsed = Date.now() - this.startTime.getTime();
      const seconds = Math.floor(elapsed / 1000);
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;

      if (minutes > 0) {
        elapsedElement.textContent = `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
      } else {
        elapsedElement.textContent = `${seconds}s`;
      }
    }, 1000);
  }

  /**
   * Handle cancel button click
   */
  private handleCancel(): void {
    // This would be implemented by the calling component
    // For now, just hide the progress
    this.hideProgress();
  }

  /**
   * Check if progress is currently visible
   */
  isProgressVisible(): boolean {
    return this.isVisible;
  }

  /**
   * Destroy the progress tracking UI
   */
  destroy(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    if (this.progressElement && this.progressElement.parentNode) {
      this.progressElement.parentNode.removeChild(this.progressElement);
    }

    this.progressElement = null;
    this.isVisible = false;
  }
}

// Add CSS styles for progress tracking
const progressStyles = document.createElement('style');
progressStyles.textContent = `
  .progress-tracking-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  .progress-tracking-overlay.progress-visible {
    opacity: 1;
  }

  .progress-tracking-modal {
    background: white;
    border-radius: 8px;
    padding: 24px;
    min-width: 400px;
    max-width: 500px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  }

  .progress-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  .progress-title {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: #333;
  }

  .progress-cancel {
    background: #f5f5f5;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 6px 12px;
    cursor: pointer;
    font-size: 14px;
  }

  .progress-cancel:hover {
    background: #e9e9e9;
  }

  .progress-bar-container {
    width: 100%;
    height: 8px;
    background: #f0f0f0;
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 16px;
  }

  .progress-bar {
    height: 100%;
    background: #007bff;
    width: 0%;
    border-radius: 4px;
    transition: width 0.3s ease;
  }

  .progress-bar.progress-animated {
    transition: width 0.5s ease-out;
  }

  .progress-bar.progress-success {
    background: #28a745;
  }

  .progress-bar.progress-error {
    background: #dc3545;
  }

  .progress-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .progress-status {
    font-size: 14px;
    color: #666;
    flex: 1;
  }

  .progress-details {
    display: flex;
    gap: 12px;
    font-size: 14px;
    color: #888;
  }

  .progress-percentage {
    font-weight: 500;
  }

  .progress-elapsed {
    font-family: monospace;
  }
`;

if (!document.head.querySelector('#progress-tracking-styles')) {
  progressStyles.id = 'progress-tracking-styles';
  document.head.appendChild(progressStyles);
}