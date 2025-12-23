/**
 * Operation Lock UI Component
 * 
 * Prevents user interactions during critical operations and displays
 * appropriate messaging to inform users why certain actions are disabled.
 */

export interface OperationLockOptions {
  message: string;
  operationType: string;
  showProgress?: boolean;
  allowedActions?: string[]; // CSS selectors for elements that should remain enabled
}

export class OperationLockUI {
  private container: HTMLElement;
  private lockOverlay: HTMLElement | null = null;
  private isLocked: boolean = false;
  private originalDisabledStates: Map<Element, boolean> = new Map();

  constructor(container: HTMLElement) {
    this.container = container;
  }

  /**
   * Lock the UI to prevent interactions
   */
  lockUI(options: OperationLockOptions): void {
    if (this.isLocked) return;

    this.isLocked = true;

    // Create and show lock overlay
    this.createLockOverlay(options);

    // Disable interactive elements
    this.disableInteractiveElements(options.allowedActions || []);

    // Add lock class to container
    this.container.classList.add('operation-locked');
  }

  /**
   * Unlock the UI to restore interactions
   */
  unlockUI(): void {
    if (!this.isLocked) return;

    this.isLocked = false;

    // Remove lock overlay
    if (this.lockOverlay) {
      this.lockOverlay.remove();
      this.lockOverlay = null;
    }

    // Re-enable interactive elements
    this.restoreInteractiveElements();

    // Remove lock class from container
    this.container.classList.remove('operation-locked');
  }

  /**
   * Update the lock message
   */
  updateLockMessage(message: string): void {
    if (!this.lockOverlay) return;

    const messageElement = this.lockOverlay.querySelector('.lock-message');
    if (messageElement) {
      messageElement.textContent = message;
    }
  }

  /**
   * Check if UI is currently locked
   */
  isUILocked(): boolean {
    return this.isLocked;
  }

  /**
   * Create the lock overlay
   */
  private createLockOverlay(options: OperationLockOptions): void {
    this.lockOverlay = document.createElement('div');
    this.lockOverlay.className = 'operation-lock-overlay';
    
    this.lockOverlay.innerHTML = `
      <div class="lock-content">
        <div class="lock-icon">
          <div class="lock-spinner"></div>
        </div>
        <div class="lock-message">${options.message}</div>
        <div class="lock-operation-type">${options.operationType} in progress...</div>
      </div>
    `;

    // Position overlay relative to container
    if (this.container === document.body) {
      // Full screen overlay
      this.lockOverlay.style.position = 'fixed';
    } else {
      // Container-specific overlay
      this.lockOverlay.style.position = 'absolute';
      
      // Ensure container has relative positioning
      const containerPosition = window.getComputedStyle(this.container).position;
      if (containerPosition === 'static') {
        this.container.style.position = 'relative';
      }
    }

    this.container.appendChild(this.lockOverlay);
  }

  /**
   * Disable interactive elements
   */
  private disableInteractiveElements(allowedSelectors: string[]): void {
    const interactiveSelectors = [
      'button',
      'input',
      'select',
      'textarea',
      'a[href]',
      '[tabindex]',
      '[contenteditable="true"]'
    ];

    interactiveSelectors.forEach(selector => {
      const elements = this.container.querySelectorAll(selector);
      elements.forEach(element => {
        // Skip if this element is in the allowed list
        const isAllowed = allowedSelectors.some(allowedSelector => 
          element.matches(allowedSelector)
        );
        
        if (isAllowed) return;

        // Store original disabled state
        const isDisabled = (element as HTMLInputElement).disabled || 
                          element.hasAttribute('disabled') ||
                          element.getAttribute('aria-disabled') === 'true';
        
        this.originalDisabledStates.set(element, isDisabled);

        // Disable the element
        if ('disabled' in element) {
          (element as HTMLInputElement).disabled = true;
        } else {
          element.setAttribute('aria-disabled', 'true');
          element.setAttribute('tabindex', '-1');
        }

        // Add visual disabled class
        element.classList.add('operation-disabled');
      });
    });
  }

  /**
   * Restore interactive elements to their original state
   */
  private restoreInteractiveElements(): void {
    this.originalDisabledStates.forEach((wasDisabled, element) => {
      // Only re-enable if it wasn't originally disabled
      if (!wasDisabled) {
        if ('disabled' in element) {
          (element as HTMLInputElement).disabled = false;
        } else {
          element.removeAttribute('aria-disabled');
          element.removeAttribute('tabindex');
        }
      }

      // Remove visual disabled class
      element.classList.remove('operation-disabled');
    });

    this.originalDisabledStates.clear();
  }

  /**
   * Destroy the operation lock UI
   */
  destroy(): void {
    this.unlockUI();
  }
}

// Add CSS styles for operation lock
const lockStyles = document.createElement('style');
lockStyles.textContent = `
  .operation-lock-overlay {
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(255, 255, 255, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 999;
    backdrop-filter: blur(2px);
  }

  .lock-content {
    text-align: center;
    padding: 32px;
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    border: 1px solid #e0e0e0;
  }

  .lock-icon {
    margin-bottom: 16px;
  }

  .lock-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid #f3f3f3;
    border-top: 3px solid #007bff;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .lock-message {
    font-size: 16px;
    font-weight: 500;
    color: #333;
    margin-bottom: 8px;
  }

  .lock-operation-type {
    font-size: 14px;
    color: #666;
  }

  .operation-locked {
    pointer-events: none;
  }

  .operation-locked .operation-lock-overlay {
    pointer-events: all;
  }

  .operation-disabled {
    opacity: 0.5;
    cursor: not-allowed !important;
  }

  /* Prevent text selection during lock */
  .operation-locked * {
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
  }
`;

if (!document.head.querySelector('#operation-lock-styles')) {
  lockStyles.id = 'operation-lock-styles';
  document.head.appendChild(lockStyles);
}