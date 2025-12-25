/**
 * Progress Reporter for Schedule Generation
 * 
 * Provides progress reporting capabilities for long-running operations
 */

export interface ProgressUpdate {
  phase: string;
  percentage: number;
  message: string;
  metadata?: Record<string, any>;
  timestamp: number;
}

export type ProgressCallback = (update: ProgressUpdate) => void;

export class ProgressReporter {
  private callbacks: ProgressCallback[] = [];
  private lastUpdate: ProgressUpdate | null = null;

  /**
   * Add a progress callback
   */
  addCallback(callback: ProgressCallback): void {
    this.callbacks.push(callback);
  }

  /**
   * Remove a progress callback
   */
  removeCallback(callback: ProgressCallback): void {
    const index = this.callbacks.indexOf(callback);
    if (index > -1) {
      this.callbacks.splice(index, 1);
    }
  }

  /**
   * Report progress update
   */
  report(phase: string, percentage: number, message: string, metadata?: Record<string, any>): void {
    const update: ProgressUpdate = {
      phase,
      percentage: Math.max(0, Math.min(100, percentage)),
      message,
      metadata: metadata || undefined,
      timestamp: Date.now()
    };

    this.lastUpdate = update;

    // Notify all callbacks
    this.callbacks.forEach(callback => {
      try {
        callback(update);
      } catch (error) {
        console.error('Progress callback error:', error);
      }
    });
  }

  /**
   * Get the last progress update
   */
  getLastUpdate(): ProgressUpdate | null {
    return this.lastUpdate;
  }

  /**
   * Clear all callbacks
   */
  clearCallbacks(): void {
    this.callbacks = [];
  }

  /**
   * Create a console logger callback
   */
  static createConsoleLogger(): ProgressCallback {
    return (update: ProgressUpdate) => {
      console.log(`[${update.phase}] ${update.percentage}% - ${update.message}`);
    };
  }

  /**
   * Create a simple callback that stores updates in an array
   */
  static createArrayLogger(): { callback: ProgressCallback; updates: ProgressUpdate[] } {
    const updates: ProgressUpdate[] = [];
    const callback: ProgressCallback = (update: ProgressUpdate) => {
      updates.push(update);
    };
    return { callback, updates };
  }
}