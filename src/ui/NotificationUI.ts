/**
 * Notification UI Component
 * 
 * Displays notifications from the application state in a user-friendly way.
 */

import { applicationState, Notification } from '../state/ApplicationState';

export class NotificationUI {
  private container: HTMLElement;
  private notificationsContainer: HTMLElement;
  private activeNotifications: Map<string, HTMLElement> = new Map();

  constructor(container: HTMLElement) {
    this.container = container;
    this.notificationsContainer = this.createNotificationsContainer();
    this.setupNotificationListener();
  }

  /**
   * Create the notifications container
   */
  private createNotificationsContainer(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'notifications-container';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-label', 'Notifications');
    
    // Append to body so it's always visible
    document.body.appendChild(container);
    
    return container;
  }

  /**
   * Set up listener for notification changes
   */
  private setupNotificationListener(): void {
    applicationState.subscribe('notifications', (notifications) => {
      this.updateNotifications(notifications);
    });
  }

  /**
   * Update the displayed notifications
   */
  private updateNotifications(notifications: Notification[]): void {
    // Remove notifications that are no longer in the state
    for (const [id, element] of this.activeNotifications) {
      if (!notifications.find(n => n.id === id)) {
        this.removeNotificationElement(id, element);
      }
    }

    // Add new notifications
    for (const notification of notifications) {
      if (!this.activeNotifications.has(notification.id)) {
        this.addNotificationElement(notification);
      }
    }
  }

  /**
   * Add a notification element
   */
  private addNotificationElement(notification: Notification): void {
    const element = this.createNotificationElement(notification);
    this.activeNotifications.set(notification.id, element);
    this.notificationsContainer.appendChild(element);

    // Auto-hide if specified
    if (notification.autoHide !== false) {
      const duration = notification.duration || 5000;
      setTimeout(() => {
        applicationState.removeNotification(notification.id);
      }, duration);
    }
  }

  /**
   * Remove a notification element
   */
  private removeNotificationElement(id: string, element: HTMLElement): void {
    // Animate out
    element.style.animation = 'slideOutRight 0.3s ease-in';
    
    setTimeout(() => {
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
      this.activeNotifications.delete(id);
    }, 300);
  }

  /**
   * Create a notification element
   */
  private createNotificationElement(notification: Notification): HTMLElement {
    const element = document.createElement('div');
    element.className = `notification ${notification.type}`;
    element.setAttribute('role', 'alert');
    element.setAttribute('aria-labelledby', `notification-title-${notification.id}`);
    element.setAttribute('aria-describedby', `notification-message-${notification.id}`);

    const icon = this.getNotificationIcon(notification.type);
    
    element.innerHTML = `
      <div class="notification-header">
        <div class="notification-title" id="notification-title-${notification.id}">
          ${icon} ${notification.title}
        </div>
        <button class="notification-close" aria-label="Close notification" data-notification-id="${notification.id}">
          ×
        </button>
      </div>
      <div class="notification-message" id="notification-message-${notification.id}">
        ${notification.message}
      </div>
    `;

    // Add close button listener
    const closeButton = element.querySelector('.notification-close') as HTMLButtonElement;
    if (closeButton) {
      closeButton.addEventListener('click', () => {
        applicationState.removeNotification(notification.id);
      });
    }

    // Add click-to-dismiss for non-error notifications
    if (notification.type !== 'error') {
      element.style.cursor = 'pointer';
      element.addEventListener('click', (e) => {
        // Don't dismiss if clicking the close button
        if ((e.target as HTMLElement).classList.contains('notification-close')) {
          return;
        }
        applicationState.removeNotification(notification.id);
      });
    }

    return element;
  }

  /**
   * Get icon for notification type
   */
  private getNotificationIcon(type: Notification['type']): string {
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };
    return icons[type] || 'ℹ️';
  }

  /**
   * Clear all notifications
   */
  public clearAll(): void {
    applicationState.clearNotifications();
  }

  /**
   * Show a test notification (for debugging)
   */
  public showTestNotification(type: Notification['type'] = 'info'): void {
    applicationState.addNotification({
      type,
      title: 'Test Notification',
      message: `This is a test ${type} notification to verify the notification system is working.`,
      autoHide: true,
      duration: 3000
    });
  }

  /**
   * Destroy the notification UI
   */
  public destroy(): void {
    if (this.notificationsContainer.parentNode) {
      this.notificationsContainer.parentNode.removeChild(this.notificationsContainer);
    }
    this.activeNotifications.clear();
  }
}

// Add CSS animation for slide out
const style = document.createElement('style');
style.textContent = `
  @keyframes slideOutRight {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(100%);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);