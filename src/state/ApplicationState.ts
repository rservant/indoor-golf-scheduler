/**
 * Application State Management
 * 
 * Centralized state management for the Indoor Golf Scheduler application.
 * Provides reactive state updates and event-driven architecture.
 */

import { Season } from '../models/Season';
import { Player } from '../models/Player';
import { Week } from '../models/Week';
import { Schedule } from '../models/Schedule';

export interface ApplicationState {
  // Core application state
  isInitialized: boolean;
  isLoading: boolean;
  hasError: boolean;
  errorMessage?: string | undefined;

  // Current context
  activeSeason: Season | null;
  selectedWeek: Week | null;
  currentView: ApplicationView;

  // Data cache
  seasons: Season[];
  players: Player[];
  weeks: Week[];
  currentSchedule: Schedule | null;

  // UI state
  sidebarOpen: boolean;
  notifications: Notification[];
}

export type ApplicationView = 
  | 'seasons' 
  | 'players' 
  | 'availability' 
  | 'schedule' 
  | 'edit-schedule'
  | 'export';

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: Date;
  autoHide?: boolean | undefined;
  duration?: number | undefined; // in milliseconds
}

export type StateChangeListener<T = any> = (newValue: T, oldValue: T) => void;

export interface StateSubscription {
  unsubscribe: () => void;
}

/**
 * Centralized application state manager with reactive updates
 */
export class ApplicationStateManager {
  private state: ApplicationState;
  private listeners: Map<keyof ApplicationState, Set<StateChangeListener>> = new Map();
  private globalListeners: Set<StateChangeListener<ApplicationState>> = new Set();

  constructor() {
    this.state = this.getInitialState();
  }

  /**
   * Get the initial application state
   */
  private getInitialState(): ApplicationState {
    return {
      isInitialized: false,
      isLoading: false,
      hasError: false,
      activeSeason: null,
      selectedWeek: null,
      currentView: 'seasons',
      seasons: [],
      players: [],
      weeks: [],
      currentSchedule: null,
      sidebarOpen: false,
      notifications: []
    };
  }

  /**
   * Get the current state (read-only)
   */
  getState(): Readonly<ApplicationState> {
    return { ...this.state };
  }

  /**
   * Get a specific state property
   */
  get<K extends keyof ApplicationState>(key: K): ApplicationState[K] {
    return this.state[key];
  }

  /**
   * Update a specific state property
   */
  set<K extends keyof ApplicationState>(key: K, value: ApplicationState[K]): void {
    const oldValue = this.state[key];
    
    if (oldValue !== value) {
      this.state[key] = value;
      this.notifyListeners(key, value, oldValue);
      this.notifyGlobalListeners(this.state, { ...this.state, [key]: oldValue });
    }
  }

  /**
   * Update multiple state properties at once
   */
  update(updates: Partial<ApplicationState>): void {
    const oldState = { ...this.state };
    let hasChanges = false;

    for (const [key, value] of Object.entries(updates)) {
      const typedKey = key as keyof ApplicationState;
      if (this.state[typedKey] !== value) {
        (this.state as any)[typedKey] = value;
        hasChanges = true;
        this.notifyListeners(typedKey, value, oldState[typedKey]);
      }
    }

    if (hasChanges) {
      this.notifyGlobalListeners(this.state, oldState);
    }
  }

  /**
   * Reset state to initial values
   */
  reset(): void {
    const oldState = { ...this.state };
    this.state = this.getInitialState();
    this.notifyGlobalListeners(this.state, oldState);
  }

  /**
   * Subscribe to changes in a specific state property
   */
  subscribe<K extends keyof ApplicationState>(
    key: K,
    listener: StateChangeListener<ApplicationState[K]>
  ): StateSubscription {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    
    this.listeners.get(key)!.add(listener as StateChangeListener);

    return {
      unsubscribe: () => {
        this.listeners.get(key)?.delete(listener as StateChangeListener);
      }
    };
  }

  /**
   * Subscribe to all state changes
   */
  subscribeToAll(listener: StateChangeListener<ApplicationState>): StateSubscription {
    this.globalListeners.add(listener);

    return {
      unsubscribe: () => {
        this.globalListeners.delete(listener);
      }
    };
  }

  /**
   * Notify listeners of property changes
   */
  private notifyListeners<K extends keyof ApplicationState>(
    key: K,
    newValue: ApplicationState[K],
    oldValue: ApplicationState[K]
  ): void {
    const listeners = this.listeners.get(key);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(newValue, oldValue);
        } catch (error) {
          console.error(`Error in state listener for ${String(key)}:`, error);
        }
      });
    }
  }

  /**
   * Notify global listeners of state changes
   */
  private notifyGlobalListeners(newState: ApplicationState, oldState: ApplicationState): void {
    this.globalListeners.forEach(listener => {
      try {
        listener(newState, oldState);
      } catch (error) {
        console.error('Error in global state listener:', error);
      }
    });
  }

  // Convenience methods for common state operations

  /**
   * Set the active season and update related state
   */
  setActiveSeason(season: Season | null): void {
    this.update({
      activeSeason: season,
      selectedWeek: null,
      currentSchedule: null,
      players: season ? this.state.players.filter(p => p.seasonId === season.id) : [],
      weeks: season ? this.state.weeks.filter(w => w.seasonId === season.id) : []
    });
  }

  /**
   * Set the selected week and clear current schedule
   */
  setSelectedWeek(week: Week | null): void {
    this.update({
      selectedWeek: week,
      currentSchedule: null
    });
  }

  /**
   * Navigate to a different view
   */
  navigateTo(view: ApplicationView): void {
    this.set('currentView', view);
  }

  /**
   * Set loading state
   */
  setLoading(isLoading: boolean): void {
    this.set('isLoading', isLoading);
  }

  /**
   * Set error state
   */
  setError(hasError: boolean, errorMessage?: string): void {
    this.update({
      hasError,
      errorMessage: errorMessage || undefined,
      isLoading: false
    });
  }

  /**
   * Add a notification
   */
  addNotification(notification: Omit<Notification, 'id' | 'timestamp'>): void {
    const newNotification: Notification = {
      ...notification,
      id: `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date()
    };

    const notifications = [...this.state.notifications, newNotification];
    this.set('notifications', notifications);

    // Auto-hide notification if specified
    if (newNotification.autoHide !== false) {
      const duration = newNotification.duration || 5000;
      setTimeout(() => {
        this.removeNotification(newNotification.id);
      }, duration);
    }
  }

  /**
   * Remove a notification
   */
  removeNotification(notificationId: string): void {
    const notifications = this.state.notifications.filter(n => n.id !== notificationId);
    this.set('notifications', notifications);
  }

  /**
   * Clear all notifications
   */
  clearNotifications(): void {
    this.set('notifications', []);
  }

  /**
   * Update cached data
   */
  updateSeasons(seasons: Season[]): void {
    this.set('seasons', seasons);
  }

  updatePlayers(players: Player[]): void {
    this.set('players', players);
  }

  updateWeeks(weeks: Week[]): void {
    this.set('weeks', weeks);
  }

  updateCurrentSchedule(schedule: Schedule | null): void {
    this.set('currentSchedule', schedule);
  }

  /**
   * Get filtered data based on current context
   */
  getCurrentSeasonPlayers(): Player[] {
    const activeSeason = this.state.activeSeason;
    return activeSeason 
      ? this.state.players.filter(p => p.seasonId === activeSeason.id)
      : [];
  }

  getCurrentSeasonWeeks(): Week[] {
    const activeSeason = this.state.activeSeason;
    return activeSeason 
      ? this.state.weeks.filter(w => w.seasonId === activeSeason.id)
      : [];
  }

  /**
   * Check if the application is ready for user interaction
   */
  isReady(): boolean {
    return this.state.isInitialized && !this.state.isLoading && !this.state.hasError;
  }
}

/**
 * Global application state instance
 */
export const applicationState = new ApplicationStateManager();