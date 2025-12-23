import { Player, PlayerInfo } from '../models/Player';
import { PlayerRepository, PlayerCreateData } from '../repositories/PlayerRepository';
import { WeekRepository, PersistenceVerification } from '../repositories/WeekRepository';
import { ScheduleRepository } from '../repositories/ScheduleRepository';
import { SeasonRepository } from '../repositories/SeasonRepository';
import { availabilityErrorHandler, withAvailabilityErrorHandling } from '../utils/AvailabilityErrorHandler';
import { OperationInterruptionManager } from './OperationInterruptionManager';

export interface PlayerManager {
  addPlayer(player: PlayerInfo): Promise<Player>;
  updatePlayer(playerId: string, updates: Partial<PlayerInfo>): Promise<Player>;
  removePlayer(playerId: string): Promise<void>;
  getPlayer(playerId: string): Promise<Player | null>;
  getAllPlayers(seasonId: string): Promise<Player[]>;
  setPlayerAvailability(playerId: string, weekId: string, available: boolean): Promise<void>;
  getPlayerAvailability(playerId: string, weekId: string): Promise<boolean>;
  getAvailablePlayersForWeek(weekId: string): Promise<Player[]>;
  validatePlayerData(playerInfo: PlayerInfo): void;
  
  // Enhanced atomic availability operations
  setPlayerAvailabilityAtomic(playerId: string, weekId: string, available: boolean): Promise<void>;
  setBulkAvailabilityAtomic(weekId: string, playerIds: string[], available: boolean): Promise<void>;
  verifyAvailabilityPersisted(playerId: string, weekId: string, expected: boolean): Promise<boolean>;
  rollbackAvailabilityChanges(weekId: string, originalState: Map<string, boolean>): Promise<void>;
  
  // Interruption management
  getInterruptionManager(): OperationInterruptionManager;
}

export class PlayerManagerService implements PlayerManager {
  private operationQueue: Map<string, Promise<any>> = new Map(); // weekId -> Promise for operation queuing
  private interruptionManager: OperationInterruptionManager;

  constructor(
    private playerRepository: PlayerRepository,
    private weekRepository: WeekRepository,
    private scheduleRepository: ScheduleRepository,
    private seasonRepository: SeasonRepository
  ) {
    // Initialize interruption manager for operation tracking and recovery
    this.interruptionManager = new OperationInterruptionManager(weekRepository, this);
  }

  async addPlayer(playerInfo: PlayerInfo): Promise<Player> {
    // Validate input data
    this.validatePlayerData(playerInfo);

    // Get active season
    const activeSeason = await this.seasonRepository.getActiveSeason();
    if (!activeSeason) {
      throw new Error('No active season found. Please create and activate a season first.');
    }

    // Create player data with season context
    const playerData: PlayerCreateData = {
      ...playerInfo,
      seasonId: activeSeason.id
    };

    // Create the player (repository handles duplicate name checking)
    const player = await this.playerRepository.create(playerData);

    // Update season's player list
    const updatedPlayerIds = [...activeSeason.playerIds, player.id];
    await this.seasonRepository.update(activeSeason.id, { playerIds: updatedPlayerIds });

    return player;
  }

  async updatePlayer(playerId: string, updates: Partial<PlayerInfo>): Promise<Player> {
    if (!playerId || playerId.trim().length === 0) {
      throw new Error('Player ID is required');
    }

    // Validate updates
    if (Object.keys(updates).length === 0) {
      throw new Error('At least one field must be updated');
    }

    // Only validate fields that are being updated
    if (updates.firstName !== undefined) {
      if (!updates.firstName || updates.firstName.trim().length === 0) {
        throw new Error('First name is required and cannot be empty');
      }
    }

    if (updates.lastName !== undefined) {
      if (!updates.lastName || updates.lastName.trim().length === 0) {
        throw new Error('Last name is required and cannot be empty');
      }
    }

    if (updates.handedness !== undefined) {
      if (!updates.handedness || !['left', 'right'].includes(updates.handedness)) {
        throw new Error('Handedness must be either "left" or "right"');
      }
    }

    if (updates.timePreference !== undefined) {
      if (!updates.timePreference || !['AM', 'PM', 'Either'].includes(updates.timePreference)) {
        throw new Error('Time preference must be "AM", "PM", or "Either"');
      }
    }

    // Verify player exists
    const existingPlayer = await this.playerRepository.findById(playerId);
    if (!existingPlayer) {
      throw new Error(`Player with ID "${playerId}" not found`);
    }

    // Update the player (repository handles name uniqueness checking)
    const updatedPlayer = await this.playerRepository.update(playerId, updates);
    if (!updatedPlayer) {
      throw new Error(`Failed to update player with ID "${playerId}"`);
    }

    return updatedPlayer;
  }

  async removePlayer(playerId: string): Promise<void> {
    if (!playerId || playerId.trim().length === 0) {
      throw new Error('Player ID is required');
    }

    // Verify player exists
    const player = await this.playerRepository.findById(playerId);
    if (!player) {
      throw new Error(`Player with ID "${playerId}" not found`);
    }

    // Get the season to update player list
    const season = await this.seasonRepository.findById(player.seasonId);
    if (!season) {
      throw new Error(`Season with ID "${player.seasonId}" not found`);
    }

    // Handle graceful removal from schedules
    await this.removePlayerFromSchedules(playerId, player.seasonId);

    // Remove player from all week availability records
    await this.removePlayerFromWeekAvailability(playerId, player.seasonId);

    // Remove player from season's player list
    const updatedPlayerIds = season.playerIds.filter(id => id !== playerId);
    await this.seasonRepository.update(season.id, { playerIds: updatedPlayerIds });

    // Finally, delete the player
    const deleted = await this.playerRepository.delete(playerId);
    if (!deleted) {
      throw new Error(`Failed to delete player with ID "${playerId}"`);
    }
  }

  async getPlayer(playerId: string): Promise<Player | null> {
    if (!playerId || playerId.trim().length === 0) {
      throw new Error('Player ID is required');
    }
    return await this.playerRepository.findById(playerId);
  }

  async getAllPlayers(seasonId: string): Promise<Player[]> {
    if (!seasonId || seasonId.trim().length === 0) {
      throw new Error('Season ID is required');
    }
    return await this.playerRepository.findBySeasonId(seasonId);
  }

  async setPlayerAvailability(playerId: string, weekId: string, available: boolean): Promise<void> {
    if (!playerId || playerId.trim().length === 0) {
      throw new Error('Player ID is required');
    }

    if (!weekId || weekId.trim().length === 0) {
      throw new Error('Week ID is required');
    }

    if (typeof available !== 'boolean') {
      throw new Error('Availability must be a boolean value');
    }

    // Verify player exists
    const player = await this.playerRepository.findById(playerId);
    if (!player) {
      throw new Error(`Player with ID "${playerId}" not found`);
    }

    // Verify week exists
    const week = await this.weekRepository.findById(weekId);
    if (!week) {
      throw new Error(`Week with ID "${weekId}" not found`);
    }

    // Verify player belongs to the same season as the week
    if (player.seasonId !== week.seasonId) {
      throw new Error('Player and week must belong to the same season');
    }

    // Set availability
    const updatedWeek = await this.weekRepository.setPlayerAvailability(weekId, playerId, available);
    if (!updatedWeek) {
      throw new Error('Failed to update player availability');
    }
  }

  async getPlayerAvailability(playerId: string, weekId: string): Promise<boolean> {
    if (!playerId || playerId.trim().length === 0) {
      throw new Error('Player ID is required');
    }

    if (!weekId || weekId.trim().length === 0) {
      throw new Error('Week ID is required');
    }

    const week = await this.weekRepository.findById(weekId);
    if (!week) {
      throw new Error(`Week with ID "${weekId}" not found`);
    }

    // Return availability (defaults to false if not set)
    return week.playerAvailability[playerId] === true;
  }

  async getAvailablePlayersForWeek(weekId: string): Promise<Player[]> {
    if (!weekId || weekId.trim().length === 0) {
      throw new Error('Week ID is required');
    }

    const week = await this.weekRepository.findById(weekId);
    if (!week) {
      throw new Error(`Week with ID "${weekId}" not found`);
    }

    // Get available player IDs
    const availablePlayerIds = await this.weekRepository.getAvailablePlayers(weekId);

    // Fetch player details
    const players: Player[] = [];
    for (const playerId of availablePlayerIds) {
      const player = await this.playerRepository.findById(playerId);
      if (player) {
        players.push(player);
      }
    }

    return players;
  }

  validatePlayerData(playerInfo: PlayerInfo): void {
    if (!playerInfo.firstName || playerInfo.firstName.trim().length === 0) {
      throw new Error('First name is required and cannot be empty');
    }

    if (playerInfo.firstName.trim().length > 50) {
      throw new Error('First name cannot exceed 50 characters');
    }

    if (!playerInfo.lastName || playerInfo.lastName.trim().length === 0) {
      throw new Error('Last name is required and cannot be empty');
    }

    if (playerInfo.lastName.trim().length > 50) {
      throw new Error('Last name cannot exceed 50 characters');
    }

    if (!playerInfo.handedness || !['left', 'right'].includes(playerInfo.handedness)) {
      throw new Error('Handedness must be either "left" or "right"');
    }

    if (!playerInfo.timePreference || !['AM', 'PM', 'Either'].includes(playerInfo.timePreference)) {
      throw new Error('Time preference must be "AM", "PM", or "Either"');
    }
  }

  // Enhanced atomic availability operations with comprehensive error handling and interruption tracking
  async setPlayerAvailabilityAtomic(playerId: string, weekId: string, available: boolean): Promise<void> {
    if (!playerId || playerId.trim().length === 0) {
      throw new Error('Player ID is required');
    }

    if (!weekId || weekId.trim().length === 0) {
      throw new Error('Week ID is required');
    }

    if (typeof available !== 'boolean') {
      throw new Error('Availability must be a boolean value');
    }

    // Check for interrupted operations first
    const detectionResult = await this.interruptionManager.detectInterruptions();
    if (detectionResult.recoveryNeeded) {
      await this.interruptionManager.recoverFromInterruptions(detectionResult.interruptedOperations);
    }

    // Queue operation to prevent concurrent conflicts
    const operationKey = `${weekId}_${playerId}`;
    const existingOperation = this.operationQueue.get(operationKey);
    
    if (existingOperation) {
      // Wait for existing operation to complete
      await existingOperation;
    }

    // Get original state for tracking
    const originalAvailability = await this.getPlayerAvailability(playerId, weekId);
    const originalState = new Map<string, boolean>();
    originalState.set(playerId, originalAvailability);
    
    const targetState = new Map<string, boolean>();
    targetState.set(playerId, available);

    // Start operation tracking
    const operationId = await this.interruptionManager.startOperation(
      'individual',
      weekId,
      [playerId],
      originalState,
      targetState
    );

    // Create new operation promise with error handling
    const operationPromise = withAvailabilityErrorHandling(
      async () => {
        const result = await this.executeAtomicAvailabilityUpdate(playerId, weekId, available);
        await this.interruptionManager.completeOperation(operationId);
        return result;
      },
      {
        operationName: 'atomic-player-availability',
        playerId,
        weekId,
        retryConfig: {
          maxAttempts: 3,
          baseDelayMs: 500
        }
      }
    );

    this.operationQueue.set(operationKey, operationPromise);

    try {
      const result = await operationPromise;
      if (result === null) {
        await this.interruptionManager.failOperation(operationId);
        throw new Error(`Failed to set availability for player ${playerId} in week ${weekId}`);
      }
    } catch (error) {
      await this.interruptionManager.failOperation(operationId, error instanceof Error ? error : new Error(String(error)));
      await availabilityErrorHandler.handlePlayerAvailabilityError(
        error instanceof Error ? error : new Error(String(error)),
        playerId,
        weekId,
        'set'
      );
      throw error;
    } finally {
      // Clean up completed operation
      this.operationQueue.delete(operationKey);
    }
  }

  async setBulkAvailabilityAtomic(weekId: string, playerIds: string[], available: boolean): Promise<void> {
    if (!weekId || weekId.trim().length === 0) {
      throw new Error('Week ID is required');
    }

    if (!Array.isArray(playerIds) || playerIds.length === 0) {
      throw new Error('Player IDs array is required and cannot be empty');
    }

    if (typeof available !== 'boolean') {
      throw new Error('Availability must be a boolean value');
    }

    // Check for interrupted operations first
    const detectionResult = await this.interruptionManager.detectInterruptions();
    if (detectionResult.recoveryNeeded) {
      await this.interruptionManager.recoverFromInterruptions(detectionResult.interruptedOperations);
    }

    // Queue bulk operation to prevent concurrent conflicts
    const operationKey = `bulk_${weekId}`;
    const existingOperation = this.operationQueue.get(operationKey);
    
    if (existingOperation) {
      // Wait for existing operation to complete
      await existingOperation;
    }

    // Get original state for tracking
    const originalState = new Map<string, boolean>();
    for (const playerId of playerIds) {
      const currentAvailability = await this.getPlayerAvailability(playerId, weekId);
      originalState.set(playerId, currentAvailability);
    }
    
    const targetState = new Map<string, boolean>();
    for (const playerId of playerIds) {
      targetState.set(playerId, available);
    }

    // Start operation tracking
    const operationType = available ? 'bulk_available' : 'bulk_unavailable';
    const operationId = await this.interruptionManager.startOperation(
      operationType,
      weekId,
      playerIds,
      originalState,
      targetState
    );

    // Create new bulk operation promise with error handling
    const operationPromise = withAvailabilityErrorHandling(
      async () => {
        const result = await this.executeBulkAtomicAvailabilityUpdate(weekId, playerIds, available);
        await this.interruptionManager.completeOperation(operationId);
        return result;
      },
      {
        operationName: 'atomic-bulk-availability',
        weekId,
        retryConfig: {
          maxAttempts: 2,
          baseDelayMs: 1000
        }
      }
    );

    this.operationQueue.set(operationKey, operationPromise);

    try {
      const result = await operationPromise;
      if (result === null) {
        await this.interruptionManager.failOperation(operationId);
        throw new Error(`Failed to set bulk availability for week ${weekId}`);
      }
    } catch (error) {
      await this.interruptionManager.failOperation(operationId, error instanceof Error ? error : new Error(String(error)));
      const operation = available ? 'mark-all-available' : 'mark-all-unavailable';
      await availabilityErrorHandler.handleBulkAvailabilityError(
        error instanceof Error ? error : new Error(String(error)),
        weekId,
        playerIds,
        operation
      );
      throw error;
    } finally {
      // Clean up completed operation
      this.operationQueue.delete(operationKey);
    }
  }

  async verifyAvailabilityPersisted(playerId: string, weekId: string, expected: boolean): Promise<boolean> {
    if (!playerId || playerId.trim().length === 0) {
      throw new Error('Player ID is required');
    }

    if (!weekId || weekId.trim().length === 0) {
      throw new Error('Week ID is required');
    }

    try {
      const actual = await this.getPlayerAvailability(playerId, weekId);
      return actual === expected;
    } catch (error) {
      console.error(`Failed to verify availability for player ${playerId} in week ${weekId}:`, error);
      return false;
    }
  }

  async rollbackAvailabilityChanges(weekId: string, originalState: Map<string, boolean>): Promise<void> {
    if (!weekId || weekId.trim().length === 0) {
      throw new Error('Week ID is required');
    }

    if (!originalState || originalState.size === 0) {
      throw new Error('Original state is required for rollback');
    }

    try {
      // Use the verified bulk update method for rollback
      const rollbackResult = await this.weekRepository.setBulkAvailabilityVerified(weekId, originalState);
      
      if (!rollbackResult.success) {
        throw new Error(`Rollback failed: ${rollbackResult.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error(`Failed to rollback availability changes for week ${weekId}:`, error);
      throw error;
    }
  }

  /**
   * Get the interruption manager for external access
   */
  getInterruptionManager(): OperationInterruptionManager {
    return this.interruptionManager;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.interruptionManager.destroy();
  }

  // Private helper methods for atomic operations
  private async executeAtomicAvailabilityUpdate(playerId: string, weekId: string, available: boolean): Promise<void> {
    // Verify player exists
    const player = await this.playerRepository.findById(playerId);
    if (!player) {
      throw new Error(`Player with ID "${playerId}" not found`);
    }

    // Verify week exists
    const week = await this.weekRepository.findById(weekId);
    if (!week) {
      throw new Error(`Week with ID "${weekId}" not found`);
    }

    // Verify player belongs to the same season as the week
    if (player.seasonId !== week.seasonId) {
      throw new Error('Player and week must belong to the same season');
    }

    // Use verified persistence operation
    const success = await this.weekRepository.setPlayerAvailabilityVerified(weekId, playerId, available);
    
    if (!success) {
      throw new Error(`Failed to persist availability change for player ${playerId} in week ${weekId}`);
    }
  }

  private async executeBulkAtomicAvailabilityUpdate(weekId: string, playerIds: string[], available: boolean): Promise<void> {
    // Verify week exists
    const week = await this.weekRepository.findById(weekId);
    if (!week) {
      throw new Error(`Week with ID "${weekId}" not found`);
    }

    // Verify all players exist and belong to the same season
    const players = await Promise.all(
      playerIds.map(async (playerId) => {
        const player = await this.playerRepository.findById(playerId);
        if (!player) {
          throw new Error(`Player with ID "${playerId}" not found`);
        }
        if (player.seasonId !== week.seasonId) {
          throw new Error(`Player ${playerId} does not belong to the same season as week ${weekId}`);
        }
        return player;
      })
    );

    // Create backup of current state for potential rollback
    const originalState = new Map<string, boolean>();
    for (const playerId of playerIds) {
      const currentAvailability = await this.getPlayerAvailability(playerId, weekId);
      originalState.set(playerId, currentAvailability);
    }

    // Prepare bulk updates
    const bulkUpdates = new Map<string, boolean>();
    for (const playerId of playerIds) {
      bulkUpdates.set(playerId, available);
    }

    // Execute bulk update with verification
    const result = await this.weekRepository.setBulkAvailabilityVerified(weekId, bulkUpdates);
    
    if (!result.success) {
      // Attempt rollback if bulk operation failed
      try {
        await this.rollbackAvailabilityChanges(weekId, originalState);
      } catch (rollbackError) {
        console.error(`Rollback failed after bulk operation failure:`, rollbackError);
      }
      
      throw new Error(`Bulk availability update failed: ${result.error || 'Unknown error'}. ${result.failedPlayerIds.length > 0 ? `Failed players: ${result.failedPlayerIds.join(', ')}` : ''}`);
    }
  }

  private async removePlayerFromSchedules(playerId: string, seasonId: string): Promise<void> {
    // Get all weeks for the season
    const weeks = await this.weekRepository.findBySeasonId(seasonId);

    for (const week of weeks) {
      if (week.scheduleId) {
        const schedule = await this.scheduleRepository.findById(week.scheduleId);
        if (schedule) {
          // Check if player is in any foursome
          let scheduleModified = false;
          
          // Check morning foursomes
          for (let i = schedule.timeSlots.morning.length - 1; i >= 0; i--) {
            const foursome = schedule.timeSlots.morning[i];
            const playerIndex = foursome.players.findIndex(p => p.id === playerId);
            
            if (playerIndex > -1) {
              // Remove player from foursome
              foursome.players.splice(playerIndex, 1);
              scheduleModified = true;
              
              // If foursome becomes empty, remove it entirely
              if (foursome.players.length === 0) {
                schedule.timeSlots.morning.splice(i, 1);
              }
            }
          }

          // Check afternoon foursomes
          for (let i = schedule.timeSlots.afternoon.length - 1; i >= 0; i--) {
            const foursome = schedule.timeSlots.afternoon[i];
            const playerIndex = foursome.players.findIndex(p => p.id === playerId);
            
            if (playerIndex > -1) {
              // Remove player from foursome
              foursome.players.splice(playerIndex, 1);
              scheduleModified = true;
              
              // If foursome becomes empty, remove it entirely
              if (foursome.players.length === 0) {
                schedule.timeSlots.afternoon.splice(i, 1);
              }
            }
          }

          // Update schedule if modified
          if (scheduleModified) {
            await this.scheduleRepository.update(schedule.id, {
              timeSlots: schedule.timeSlots,
              lastModified: new Date()
            });
          }
        }
      }
    }
  }

  private async removePlayerFromWeekAvailability(playerId: string, seasonId: string): Promise<void> {
    // Get all weeks for the season
    const weeks = await this.weekRepository.findBySeasonId(seasonId);

    for (const week of weeks) {
      if (week.playerAvailability[playerId] !== undefined) {
        // Remove player from availability record
        const updatedAvailability = { ...week.playerAvailability };
        delete updatedAvailability[playerId];
        
        await this.weekRepository.update(week.id, {
          playerAvailability: updatedAvailability
        });
      }
    }
  }
}

// Keep the in-memory implementation for testing
export class InMemoryPlayerManager implements PlayerManager {
  private players: Map<string, Player> = new Map();
  private weekAvailability: Map<string, Map<string, boolean>> = new Map(); // weekId -> playerId -> available
  private activeSeasonId: string | null = null;
  private operationQueue: Map<string, Promise<any>> = new Map(); // Operation queuing for atomicity

  constructor(activeSeasonId?: string) {
    this.activeSeasonId = activeSeasonId || null;
  }

  setActiveSeasonId(seasonId: string): void {
    this.activeSeasonId = seasonId;
  }

  async addPlayer(playerInfo: PlayerInfo): Promise<Player> {
    this.validatePlayerData(playerInfo);

    if (!this.activeSeasonId) {
      throw new Error('No active season found. Please create and activate a season first.');
    }

    // Check for duplicate name within the same season
    const existingPlayer = Array.from(this.players.values()).find(p => 
      p.seasonId === this.activeSeasonId && 
      p.firstName === playerInfo.firstName && 
      p.lastName === playerInfo.lastName
    );

    if (existingPlayer) {
      throw new Error(`Player "${playerInfo.firstName} ${playerInfo.lastName}" already exists in this season`);
    }

    const id = this.generateId();
    const player: Player = {
      id,
      firstName: playerInfo.firstName,
      lastName: playerInfo.lastName,
      handedness: playerInfo.handedness,
      timePreference: playerInfo.timePreference,
      seasonId: this.activeSeasonId,
      createdAt: new Date()
    };

    this.players.set(id, player);
    return player;
  }

  async updatePlayer(playerId: string, updates: Partial<PlayerInfo>): Promise<Player> {
    if (!playerId || playerId.trim().length === 0) {
      throw new Error('Player ID is required');
    }

    const existingPlayer = this.players.get(playerId);
    if (!existingPlayer) {
      throw new Error(`Player with ID "${playerId}" not found`);
    }

    // Validate updates
    if (Object.keys(updates).length === 0) {
      throw new Error('At least one field must be updated');
    }

    // Validate individual fields if they're being updated
    if (updates.firstName !== undefined) {
      if (!updates.firstName || updates.firstName.trim().length === 0) {
        throw new Error('First name is required and cannot be empty');
      }
    }

    if (updates.lastName !== undefined) {
      if (!updates.lastName || updates.lastName.trim().length === 0) {
        throw new Error('Last name is required and cannot be empty');
      }
    }

    if (updates.handedness !== undefined) {
      if (!updates.handedness || !['left', 'right'].includes(updates.handedness)) {
        throw new Error('Handedness must be either "left" or "right"');
      }
    }

    if (updates.timePreference !== undefined) {
      if (!updates.timePreference || !['AM', 'PM', 'Either'].includes(updates.timePreference)) {
        throw new Error('Time preference must be "AM", "PM", or "Either"');
      }
    }

    // Check for duplicate name if name is being updated
    if ((updates.firstName && updates.firstName !== existingPlayer.firstName) ||
        (updates.lastName && updates.lastName !== existingPlayer.lastName)) {
      
      const newFirstName = updates.firstName || existingPlayer.firstName;
      const newLastName = updates.lastName || existingPlayer.lastName;
      
      const duplicatePlayer = Array.from(this.players.values()).find(p => 
        p.seasonId === existingPlayer.seasonId && 
        p.firstName === newFirstName && 
        p.lastName === newLastName &&
        p.id !== playerId
      );
      
      if (duplicatePlayer) {
        throw new Error(`Player "${newFirstName} ${newLastName}" already exists in this season`);
      }
    }

    const updatedPlayer = { ...existingPlayer, ...updates };
    this.players.set(playerId, updatedPlayer);
    return updatedPlayer;
  }

  async removePlayer(playerId: string): Promise<void> {
    if (!playerId || playerId.trim().length === 0) {
      throw new Error('Player ID is required');
    }

    const player = this.players.get(playerId);
    if (!player) {
      throw new Error(`Player with ID "${playerId}" not found`);
    }

    // Remove from availability records
    for (const weekAvailability of this.weekAvailability.values()) {
      weekAvailability.delete(playerId);
    }

    this.players.delete(playerId);
  }

  async getPlayer(playerId: string): Promise<Player | null> {
    if (!playerId || playerId.trim().length === 0) {
      throw new Error('Player ID is required');
    }
    return this.players.get(playerId) || null;
  }

  async getAllPlayers(seasonId: string): Promise<Player[]> {
    if (!seasonId || seasonId.trim().length === 0) {
      throw new Error('Season ID is required');
    }
    return Array.from(this.players.values()).filter(p => p.seasonId === seasonId);
  }

  async setPlayerAvailability(playerId: string, weekId: string, available: boolean): Promise<void> {
    if (!playerId || playerId.trim().length === 0) {
      throw new Error('Player ID is required');
    }

    if (!weekId || weekId.trim().length === 0) {
      throw new Error('Week ID is required');
    }

    if (typeof available !== 'boolean') {
      throw new Error('Availability must be a boolean value');
    }

    const player = this.players.get(playerId);
    if (!player) {
      throw new Error(`Player with ID "${playerId}" not found`);
    }

    if (!this.weekAvailability.has(weekId)) {
      this.weekAvailability.set(weekId, new Map());
    }

    this.weekAvailability.get(weekId)!.set(playerId, available);
  }

  async getPlayerAvailability(playerId: string, weekId: string): Promise<boolean> {
    if (!playerId || playerId.trim().length === 0) {
      throw new Error('Player ID is required');
    }

    if (!weekId || weekId.trim().length === 0) {
      throw new Error('Week ID is required');
    }

    const weekAvailability = this.weekAvailability.get(weekId);
    if (!weekAvailability) {
      return false;
    }

    return weekAvailability.get(playerId) === true;
  }

  async getAvailablePlayersForWeek(weekId: string): Promise<Player[]> {
    if (!weekId || weekId.trim().length === 0) {
      throw new Error('Week ID is required');
    }

    const weekAvailability = this.weekAvailability.get(weekId);
    if (!weekAvailability) {
      return [];
    }

    const availablePlayerIds = Array.from(weekAvailability.entries())
      .filter(([_, available]) => available)
      .map(([playerId, _]) => playerId);

    return availablePlayerIds
      .map(id => this.players.get(id))
      .filter((player): player is Player => player !== undefined);
  }

  validatePlayerData(playerInfo: PlayerInfo): void {
    if (!playerInfo.firstName || playerInfo.firstName.trim().length === 0) {
      throw new Error('First name is required and cannot be empty');
    }

    if (playerInfo.firstName.trim().length > 50) {
      throw new Error('First name cannot exceed 50 characters');
    }

    if (!playerInfo.lastName || playerInfo.lastName.trim().length === 0) {
      throw new Error('Last name is required and cannot be empty');
    }

    if (playerInfo.lastName.trim().length > 50) {
      throw new Error('Last name cannot exceed 50 characters');
    }

    if (!playerInfo.handedness || !['left', 'right'].includes(playerInfo.handedness)) {
      throw new Error('Handedness must be either "left" or "right"');
    }

    if (!playerInfo.timePreference || !['AM', 'PM', 'Either'].includes(playerInfo.timePreference)) {
      throw new Error('Time preference must be "AM", "PM", or "Either"');
    }
  }

  // Enhanced atomic availability operations for in-memory implementation
  async setPlayerAvailabilityAtomic(playerId: string, weekId: string, available: boolean): Promise<void> {
    if (!playerId || playerId.trim().length === 0) {
      throw new Error('Player ID is required');
    }

    if (!weekId || weekId.trim().length === 0) {
      throw new Error('Week ID is required');
    }

    if (typeof available !== 'boolean') {
      throw new Error('Availability must be a boolean value');
    }

    // Queue operation to prevent concurrent conflicts
    const operationKey = `${weekId}_${playerId}`;
    const existingOperation = this.operationQueue.get(operationKey);
    
    if (existingOperation) {
      // Wait for existing operation to complete
      await existingOperation;
    }

    // Create new operation promise
    const operationPromise = this.executeAtomicAvailabilityUpdate(playerId, weekId, available);
    this.operationQueue.set(operationKey, operationPromise);

    try {
      await operationPromise;
    } finally {
      // Clean up completed operation
      this.operationQueue.delete(operationKey);
    }
  }

  async setBulkAvailabilityAtomic(weekId: string, playerIds: string[], available: boolean): Promise<void> {
    if (!weekId || weekId.trim().length === 0) {
      throw new Error('Week ID is required');
    }

    if (!Array.isArray(playerIds) || playerIds.length === 0) {
      throw new Error('Player IDs array is required and cannot be empty');
    }

    if (typeof available !== 'boolean') {
      throw new Error('Availability must be a boolean value');
    }

    // Queue bulk operation to prevent concurrent conflicts
    const operationKey = `bulk_${weekId}`;
    const existingOperation = this.operationQueue.get(operationKey);
    
    if (existingOperation) {
      // Wait for existing operation to complete
      await existingOperation;
    }

    // Create new bulk operation promise
    const operationPromise = this.executeBulkAtomicAvailabilityUpdate(weekId, playerIds, available);
    this.operationQueue.set(operationKey, operationPromise);

    try {
      await operationPromise;
    } finally {
      // Clean up completed operation
      this.operationQueue.delete(operationKey);
    }
  }

  async verifyAvailabilityPersisted(playerId: string, weekId: string, expected: boolean): Promise<boolean> {
    if (!playerId || playerId.trim().length === 0) {
      throw new Error('Player ID is required');
    }

    if (!weekId || weekId.trim().length === 0) {
      throw new Error('Week ID is required');
    }

    try {
      const actual = await this.getPlayerAvailability(playerId, weekId);
      return actual === expected;
    } catch (error) {
      console.error(`Failed to verify availability for player ${playerId} in week ${weekId}:`, error);
      return false;
    }
  }

  async rollbackAvailabilityChanges(weekId: string, originalState: Map<string, boolean>): Promise<void> {
    if (!weekId || weekId.trim().length === 0) {
      throw new Error('Week ID is required');
    }

    if (!originalState || originalState.size === 0) {
      throw new Error('Original state is required for rollback');
    }

    try {
      // Restore original state
      if (!this.weekAvailability.has(weekId)) {
        this.weekAvailability.set(weekId, new Map());
      }

      const weekAvailability = this.weekAvailability.get(weekId)!;
      for (const [playerId, availability] of originalState) {
        weekAvailability.set(playerId, availability);
      }
    } catch (error) {
      console.error(`Failed to rollback availability changes for week ${weekId}:`, error);
      throw error;
    }
  }

  // Private helper methods for atomic operations
  private async executeAtomicAvailabilityUpdate(playerId: string, weekId: string, available: boolean): Promise<void> {
    const player = this.players.get(playerId);
    if (!player) {
      throw new Error(`Player with ID "${playerId}" not found`);
    }

    // Simulate verified persistence by setting and immediately verifying
    await this.setPlayerAvailability(playerId, weekId, available);
    
    const verified = await this.verifyAvailabilityPersisted(playerId, weekId, available);
    if (!verified) {
      throw new Error(`Failed to persist availability change for player ${playerId} in week ${weekId}`);
    }
  }

  private async executeBulkAtomicAvailabilityUpdate(weekId: string, playerIds: string[], available: boolean): Promise<void> {
    // Verify all players exist
    for (const playerId of playerIds) {
      const player = this.players.get(playerId);
      if (!player) {
        throw new Error(`Player with ID "${playerId}" not found`);
      }
    }

    // Create backup of current state for potential rollback
    const originalState = new Map<string, boolean>();
    for (const playerId of playerIds) {
      const currentAvailability = await this.getPlayerAvailability(playerId, weekId);
      originalState.set(playerId, currentAvailability);
    }

    try {
      // Apply all updates
      for (const playerId of playerIds) {
        await this.setPlayerAvailability(playerId, weekId, available);
      }

      // Verify all updates
      for (const playerId of playerIds) {
        const verified = await this.verifyAvailabilityPersisted(playerId, weekId, available);
        if (!verified) {
          // Rollback on verification failure
          await this.rollbackAvailabilityChanges(weekId, originalState);
          throw new Error(`Bulk availability update failed: verification failed for player ${playerId}`);
        }
      }
    } catch (error) {
      // Rollback on any failure
      await this.rollbackAvailabilityChanges(weekId, originalState);
      throw error;
    }
  }

  private generateId(): string {
    return `player_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Get the interruption manager (mock implementation for testing)
   */
  getInterruptionManager(): OperationInterruptionManager {
    // Return a mock interruption manager for testing
    return {
      detectInterruptions: async () => ({ hasInterruption: false, interruptedOperations: [] }),
      recoverFromInterruptions: async () => {},
      hasActiveOperations: () => false,
      getOperationState: () => null
    } as unknown as OperationInterruptionManager;
  }
}