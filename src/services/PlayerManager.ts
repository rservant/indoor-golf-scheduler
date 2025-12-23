import { Player, PlayerInfo } from '../models/Player';
import { PlayerRepository, PlayerCreateData } from '../repositories/PlayerRepository';
import { WeekRepository } from '../repositories/WeekRepository';
import { ScheduleRepository } from '../repositories/ScheduleRepository';
import { SeasonRepository } from '../repositories/SeasonRepository';

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
}

export class PlayerManagerService implements PlayerManager {
  constructor(
    private playerRepository: PlayerRepository,
    private weekRepository: WeekRepository,
    private scheduleRepository: ScheduleRepository,
    private seasonRepository: SeasonRepository
  ) {}

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

  private generateId(): string {
    return `player_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}