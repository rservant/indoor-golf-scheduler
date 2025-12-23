import { PairingHistory, PairingHistoryModel } from '../models/PairingHistory';

export interface PairingHistoryCreateData {
  seasonId: string;
}

export interface PairingHistoryRepository {
  create(data: PairingHistoryCreateData): Promise<PairingHistory>;
  findById(id: string): Promise<PairingHistory | null>;
  findAll(): Promise<PairingHistory[]>;
  update(id: string, data: Partial<PairingHistory>): Promise<PairingHistory | null>;
  delete(id: string): Promise<boolean>;
  exists(id: string): Promise<boolean>;
  
  // Season-specific methods
  findBySeasonId(seasonId: string): Promise<PairingHistory | null>;
  deleteBySeasonId(seasonId: string): Promise<boolean>;
  
  // Pairing tracking methods
  addPairing(seasonId: string, playerId1: string, playerId2: string): Promise<PairingHistory>;
  getPairingCount(seasonId: string, playerId1: string, playerId2: string): Promise<number>;
  getAllPairingsForPlayer(seasonId: string, playerId: string): Promise<Array<{ partnerId: string; count: number }>>;
  resetPairings(seasonId: string): Promise<PairingHistory | null>;
}

export class LocalPairingHistoryRepository implements PairingHistoryRepository {
  private storageKey = 'golf_scheduler_pairing_history';

  private getStorageData(): PairingHistory[] {
    try {
      const data = localStorage.getItem(this.storageKey);
      if (!data) return [];
      
      const parsed = JSON.parse(data);
      // Convert date strings back to Date objects
      return parsed.map((history: any) => ({
        ...history,
        lastUpdated: new Date(history.lastUpdated)
      }));
    } catch (error) {
      console.error(`Error reading from localStorage for key ${this.storageKey}:`, error);
      return [];
    }
  }

  private setStorageData(data: PairingHistory[]): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (error) {
      console.error(`Error writing to localStorage for key ${this.storageKey}:`, error);
      throw new Error(`Failed to save data to storage: ${error}`);
    }
  }

  private createEntity(data: PairingHistoryCreateData): PairingHistory {
    const pairingHistoryModel = new PairingHistoryModel(data);
    return pairingHistoryModel.toJSON();
  }

  async findBySeasonId(seasonId: string): Promise<PairingHistory | null> {
    const allHistories = await this.findAll();
    return allHistories.find(history => history.seasonId === seasonId) || null;
  }

  async deleteBySeasonId(seasonId: string): Promise<boolean> {
    const allHistories = this.getStorageData();
    const index = allHistories.findIndex(history => history.seasonId === seasonId);
    
    if (index === -1) {
      return false;
    }

    allHistories.splice(index, 1);
    this.setStorageData(allHistories);
    return true;
  }

  async addPairing(seasonId: string, playerId1: string, playerId2: string): Promise<PairingHistory> {
    let history = await this.findBySeasonId(seasonId);
    
    if (!history) {
      // Create new pairing history for this season
      history = await this.create({ seasonId });
    }

    // Use the model to add the pairing (which handles the logic)
    const historyModel = new PairingHistoryModel(history);
    historyModel.addPairing(playerId1, playerId2);
    
    // Update the stored data
    const updatedHistory = await this.update(history.seasonId, historyModel.toJSON());
    return updatedHistory!;
  }

  async getPairingCount(seasonId: string, playerId1: string, playerId2: string): Promise<number> {
    const history = await this.findBySeasonId(seasonId);
    if (!history) {
      return 0;
    }

    const historyModel = new PairingHistoryModel(history);
    return historyModel.getPairingCount(playerId1, playerId2);
  }

  async getAllPairingsForPlayer(seasonId: string, playerId: string): Promise<Array<{ partnerId: string; count: number }>> {
    const history = await this.findBySeasonId(seasonId);
    if (!history) {
      return [];
    }

    const historyModel = new PairingHistoryModel(history);
    return historyModel.getAllPairingsForPlayer(playerId);
  }

  async resetPairings(seasonId: string): Promise<PairingHistory | null> {
    const history = await this.findBySeasonId(seasonId);
    if (!history) {
      return null;
    }

    const historyModel = new PairingHistoryModel(history);
    historyModel.reset();
    
    return await this.update(history.seasonId, historyModel.toJSON());
  }

  async create(data: PairingHistoryCreateData): Promise<PairingHistory> {
    // Check if pairing history already exists for this season
    const existing = await this.findBySeasonId(data.seasonId);
    if (existing) {
      throw new Error(`Pairing history already exists for season ${data.seasonId}`);
    }

    const entity = this.createEntity(data);
    const allData = this.getStorageData();
    
    allData.push(entity);
    this.setStorageData(allData);
    return entity;
  }

  async findById(seasonId: string): Promise<PairingHistory | null> {
    return this.findBySeasonId(seasonId);
  }

  async findAll(): Promise<PairingHistory[]> {
    return this.getStorageData();
  }

  async update(seasonId: string, updates: Partial<PairingHistory>): Promise<PairingHistory | null> {
    const allData = this.getStorageData();
    const index = allData.findIndex(item => item.seasonId === seasonId);
    
    if (index === -1) {
      return null;
    }

    // Merge updates with existing data
    const updatedEntity = { ...allData[index], ...updates, lastUpdated: new Date() };
    allData[index] = updatedEntity;
    this.setStorageData(allData);
    
    return updatedEntity;
  }

  async delete(seasonId: string): Promise<boolean> {
    return this.deleteBySeasonId(seasonId);
  }

  async exists(seasonId: string): Promise<boolean> {
    const history = await this.findBySeasonId(seasonId);
    return history !== null;
  }
}