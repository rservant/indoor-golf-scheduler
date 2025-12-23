import { Player, PlayerModel, PlayerInfo } from '../models/Player';
import { LocalStorageRepository } from './BaseRepository';

export interface PlayerCreateData extends PlayerInfo {
  seasonId: string;
}

export interface PlayerRepository {
  create(data: PlayerCreateData): Promise<Player>;
  findById(id: string): Promise<Player | null>;
  findAll(): Promise<Player[]>;
  update(id: string, data: Partial<Player>): Promise<Player | null>;
  delete(id: string): Promise<boolean>;
  exists(id: string): Promise<boolean>;
  
  // Season-scoped methods
  findBySeasonId(seasonId: string): Promise<Player[]>;
  findBySeasonAndName(seasonId: string, firstName: string, lastName: string): Promise<Player | null>;
  deleteBySeasonId(seasonId: string): Promise<number>;
  countBySeasonId(seasonId: string): Promise<number>;
  
  // Player-specific methods
  findByTimePreference(seasonId: string, timePreference: 'AM' | 'PM' | 'Either'): Promise<Player[]>;
  findByHandedness(seasonId: string, handedness: 'left' | 'right'): Promise<Player[]>;
}

export class LocalPlayerRepository extends LocalStorageRepository<Player, PlayerCreateData> implements PlayerRepository {
  protected storageKey = 'golf_scheduler_players';

  protected createEntity(data: PlayerCreateData): Player {
    const playerModel = new PlayerModel(data);
    return playerModel.toJSON();
  }

  async findBySeasonId(seasonId: string): Promise<Player[]> {
    const allPlayers = await this.findAll();
    return allPlayers.filter(player => player.seasonId === seasonId);
  }

  async findBySeasonAndName(seasonId: string, firstName: string, lastName: string): Promise<Player | null> {
    const seasonPlayers = await this.findBySeasonId(seasonId);
    return seasonPlayers.find(player => 
      player.firstName === firstName && player.lastName === lastName
    ) || null;
  }

  async deleteBySeasonId(seasonId: string): Promise<number> {
    const allPlayers = this.getStorageData();
    const playersToKeep = allPlayers.filter(player => player.seasonId !== seasonId);
    const deletedCount = allPlayers.length - playersToKeep.length;
    
    this.setStorageData(playersToKeep);
    return deletedCount;
  }

  async countBySeasonId(seasonId: string): Promise<number> {
    const seasonPlayers = await this.findBySeasonId(seasonId);
    return seasonPlayers.length;
  }

  async findByTimePreference(seasonId: string, timePreference: 'AM' | 'PM' | 'Either'): Promise<Player[]> {
    const seasonPlayers = await this.findBySeasonId(seasonId);
    return seasonPlayers.filter(player => player.timePreference === timePreference);
  }

  async findByHandedness(seasonId: string, handedness: 'left' | 'right'): Promise<Player[]> {
    const seasonPlayers = await this.findBySeasonId(seasonId);
    return seasonPlayers.filter(player => player.handedness === handedness);
  }

  // Override create to ensure unique names within a season
  async create(data: PlayerCreateData): Promise<Player> {
    // Check for duplicate name within the same season
    const existingPlayer = await this.findBySeasonAndName(data.seasonId, data.firstName, data.lastName);
    if (existingPlayer) {
      throw new Error(`Player "${data.firstName} ${data.lastName}" already exists in this season`);
    }

    return super.create(data);
  }

  // Override update to handle name uniqueness within season
  async update(id: string, updates: Partial<Player>): Promise<Player | null> {
    const existingPlayer = await this.findById(id);
    if (!existingPlayer) {
      return null;
    }

    // Check for duplicate name if name is being updated
    if ((updates.firstName && updates.firstName !== existingPlayer.firstName) ||
        (updates.lastName && updates.lastName !== existingPlayer.lastName)) {
      
      const newFirstName = updates.firstName || existingPlayer.firstName;
      const newLastName = updates.lastName || existingPlayer.lastName;
      
      const duplicatePlayer = await this.findBySeasonAndName(
        existingPlayer.seasonId, 
        newFirstName, 
        newLastName
      );
      
      if (duplicatePlayer && duplicatePlayer.id !== id) {
        throw new Error(`Player "${newFirstName} ${newLastName}" already exists in this season`);
      }
    }

    return super.update(id, updates);
  }
}