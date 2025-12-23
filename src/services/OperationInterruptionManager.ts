import { WeekRepository } from '../repositories/WeekRepository';
import { PlayerManager } from './PlayerManager';

export interface OperationState {
  id: string;
  type: 'individual' | 'bulk_available' | 'bulk_unavailable';
  weekId: string;
  playerIds: string[];
  originalState: Map<string, boolean>;
  targetState: Map<string, boolean>;
  timestamp: Date;
  status: 'pending' | 'completed' | 'failed' | 'interrupted';
}

export interface InterruptionDetectionResult {
  hasInterruption: boolean;
  interruptedOperations: OperationState[];
  recoveryNeeded: boolean;
}

export class OperationInterruptionManager {
  private static readonly STORAGE_KEY = 'golf_scheduler_operation_state';
  private static readonly OPERATION_TIMEOUT_MS = 30000; // 30 seconds
  
  private weekRepository: WeekRepository;
  private playerManager: PlayerManager;
  private activeOperations: Map<string, OperationState> = new Map();
  private beforeUnloadHandler: () => void;
  private pageHideHandler: () => void;

  constructor(weekRepository: WeekRepository, playerManager: PlayerManager) {
    this.weekRepository = weekRepository;
    this.playerManager = playerManager;
    
    // Set up interruption detection handlers
    this.beforeUnloadHandler = () => this.handlePageUnload();
    this.pageHideHandler = () => this.handlePageHide();
    
    window.addEventListener('beforeunload', this.beforeUnloadHandler);
    window.addEventListener('pagehide', this.pageHideHandler);
    
    // Initialize by checking for interrupted operations on startup
    this.initializeInterruptionDetection();
  }

  /**
   * Start tracking an operation
   */
  async startOperation(
    type: 'individual' | 'bulk_available' | 'bulk_unavailable',
    weekId: string,
    playerIds: string[],
    originalState: Map<string, boolean>,
    targetState: Map<string, boolean>
  ): Promise<string> {
    const operationId = this.generateOperationId();
    
    const operation: OperationState = {
      id: operationId,
      type,
      weekId,
      playerIds,
      originalState,
      targetState,
      timestamp: new Date(),
      status: 'pending'
    };

    // Store in memory and persistence
    this.activeOperations.set(operationId, operation);
    await this.persistOperationState(operation);
    
    console.log(`Started tracking operation ${operationId}: ${type} for week ${weekId}`);
    return operationId;
  }

  /**
   * Mark operation as completed
   */
  async completeOperation(operationId: string): Promise<void> {
    const operation = this.activeOperations.get(operationId);
    if (!operation) {
      console.warn(`Operation ${operationId} not found for completion`);
      return;
    }

    operation.status = 'completed';
    this.activeOperations.delete(operationId);
    await this.removePersistedOperation(operationId);
    
    console.log(`Completed operation ${operationId}`);
  }

  /**
   * Mark operation as failed
   */
  async failOperation(operationId: string, error?: Error): Promise<void> {
    const operation = this.activeOperations.get(operationId);
    if (!operation) {
      console.warn(`Operation ${operationId} not found for failure`);
      return;
    }

    operation.status = 'failed';
    this.activeOperations.delete(operationId);
    await this.removePersistedOperation(operationId);
    
    console.log(`Failed operation ${operationId}:`, error?.message);
  }

  /**
   * Detect interrupted operations on page load/initialization
   */
  async detectInterruptions(): Promise<InterruptionDetectionResult> {
    const persistedOperations = await this.getPersistedOperations();
    const now = new Date();
    const interruptedOperations: OperationState[] = [];

    for (const operation of persistedOperations) {
      const operationAge = now.getTime() - new Date(operation.timestamp).getTime();
      
      // Consider operations interrupted if they're older than timeout and still pending
      if (operation.status === 'pending' && operationAge > OperationInterruptionManager.OPERATION_TIMEOUT_MS) {
        operation.status = 'interrupted';
        interruptedOperations.push(operation);
        console.log(`Detected interrupted operation ${operation.id}: ${operation.type} for week ${operation.weekId}`);
      }
    }

    return {
      hasInterruption: interruptedOperations.length > 0,
      interruptedOperations,
      recoveryNeeded: interruptedOperations.length > 0
    };
  }

  /**
   * Recover from interrupted operations by reloading accurate state
   */
  async recoverFromInterruptions(interruptedOperations: OperationState[]): Promise<void> {
    console.log(`Recovering from ${interruptedOperations.length} interrupted operations`);

    for (const operation of interruptedOperations) {
      try {
        await this.recoverSingleOperation(operation);
        await this.removePersistedOperation(operation.id);
      } catch (error) {
        console.error(`Failed to recover operation ${operation.id}:`, error);
      }
    }
  }

  /**
   * Get current operation state for a week
   */
  getOperationState(weekId: string): OperationState | null {
    for (const operation of this.activeOperations.values()) {
      if (operation.weekId === weekId && operation.status === 'pending') {
        return operation;
      }
    }
    return null;
  }

  /**
   * Check if any operations are currently pending for a week
   */
  hasActiveOperations(weekId: string): boolean {
    return this.getOperationState(weekId) !== null;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    window.removeEventListener('beforeunload', this.beforeUnloadHandler);
    window.removeEventListener('pagehide', this.pageHideHandler);
  }

  // Private methods

  private async initializeInterruptionDetection(): Promise<void> {
    try {
      const detectionResult = await this.detectInterruptions();
      if (detectionResult.recoveryNeeded) {
        await this.recoverFromInterruptions(detectionResult.interruptedOperations);
      }
    } catch (error) {
      console.error('Failed to initialize interruption detection:', error);
    }
  }

  private async recoverSingleOperation(operation: OperationState): Promise<void> {
    console.log(`Recovering operation ${operation.id}: ${operation.type} for week ${operation.weekId}`);

    try {
      // Reload current state from persistence to determine what actually happened
      const currentState = new Map<string, boolean>();
      
      for (const playerId of operation.playerIds) {
        try {
          const currentAvailability = await this.playerManager.getPlayerAvailability(playerId, operation.weekId);
          currentState.set(playerId, currentAvailability);
        } catch (error) {
          console.warn(`Failed to get current availability for player ${playerId}:`, error);
          // Use original state as fallback
          currentState.set(playerId, operation.originalState.get(playerId) || false);
        }
      }

      // Determine if the operation completed successfully by comparing with target state
      let operationSucceeded = true;
      for (const [playerId, targetAvailability] of operation.targetState) {
        const currentAvailability = currentState.get(playerId);
        if (currentAvailability !== targetAvailability) {
          operationSucceeded = false;
          break;
        }
      }

      if (operationSucceeded) {
        console.log(`Operation ${operation.id} appears to have completed successfully before interruption`);
      } else {
        console.log(`Operation ${operation.id} was incomplete, current state differs from target state`);
        
        // Check if we should revert to original state or leave as-is
        // For safety, we'll leave the current state as-is and let the user decide
        console.log(`Leaving current state as-is for operation ${operation.id} - user can manually adjust if needed`);
      }

      // Verify data integrity for the affected week
      const integrityCheck = await this.weekRepository.verifyDataIntegrity(operation.weekId);
      if (!integrityCheck) {
        console.warn(`Data integrity check failed for week ${operation.weekId} after recovery`);
      }

    } catch (error) {
      console.error(`Error during recovery of operation ${operation.id}:`, error);
      throw error;
    }
  }

  private handlePageUnload(): void {
    // Mark all pending operations as potentially interrupted
    for (const operation of this.activeOperations.values()) {
      if (operation.status === 'pending') {
        console.log(`Marking operation ${operation.id} as potentially interrupted due to page unload`);
        // The operation will be detected as interrupted on next page load
      }
    }
  }

  private handlePageHide(): void {
    // Similar to beforeunload, but for mobile browsers
    this.handlePageUnload();
  }

  private async persistOperationState(operation: OperationState): Promise<void> {
    try {
      const existingOperations = await this.getPersistedOperations();
      const updatedOperations = existingOperations.filter(op => op.id !== operation.id);
      updatedOperations.push({
        ...operation,
        // Convert Maps to objects for JSON serialization
        originalState: Object.fromEntries(operation.originalState),
        targetState: Object.fromEntries(operation.targetState)
      } as any);
      
      localStorage.setItem(OperationInterruptionManager.STORAGE_KEY, JSON.stringify(updatedOperations));
    } catch (error) {
      console.error('Failed to persist operation state:', error);
    }
  }

  private async removePersistedOperation(operationId: string): Promise<void> {
    try {
      const existingOperations = await this.getPersistedOperations();
      const filteredOperations = existingOperations.filter(op => op.id !== operationId);
      
      if (filteredOperations.length === 0) {
        localStorage.removeItem(OperationInterruptionManager.STORAGE_KEY);
      } else {
        localStorage.setItem(OperationInterruptionManager.STORAGE_KEY, JSON.stringify(filteredOperations));
      }
    } catch (error) {
      console.error('Failed to remove persisted operation:', error);
    }
  }

  private async getPersistedOperations(): Promise<OperationState[]> {
    try {
      const data = localStorage.getItem(OperationInterruptionManager.STORAGE_KEY);
      if (!data) return [];
      
      const operations = JSON.parse(data);
      return operations.map((op: any) => ({
        ...op,
        timestamp: new Date(op.timestamp),
        // Convert objects back to Maps
        originalState: new Map(Object.entries(op.originalState)),
        targetState: new Map(Object.entries(op.targetState))
      }));
    } catch (error) {
      console.error('Failed to get persisted operations:', error);
      return [];
    }
  }

  private generateOperationId(): string {
    return `op_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}