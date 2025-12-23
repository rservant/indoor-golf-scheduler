import { Season, SeasonModel, CreateSeasonData } from '../models/Season';
import { LocalStorageRepository } from './BaseRepository';

export interface SeasonRepository {
  create(data: CreateSeasonData): Promise<Season>;
  findById(id: string): Promise<Season | null>;
  findAll(): Promise<Season[]>;
  update(id: string, data: Partial<Season>): Promise<Season | null>;
  delete(id: string): Promise<boolean>;
  exists(id: string): Promise<boolean>;
  
  // Season-specific methods
  getActiveSeason(): Promise<Season | null>;
  setActiveSeason(seasonId: string): Promise<Season | null>;
  deactivateAllSeasons(): Promise<void>;
  findByName(name: string): Promise<Season | null>;
}

export class LocalSeasonRepository extends LocalStorageRepository<Season, CreateSeasonData> implements SeasonRepository {
  protected storageKey = 'golf_scheduler_seasons';

  protected createEntity(data: CreateSeasonData): Season {
    const seasonModel = new SeasonModel(data);
    return seasonModel.toJSON();
  }

  // Override getStorageData to properly deserialize dates
  protected getStorageData(): Season[] {
    try {
      const data = localStorage.getItem(this.storageKey);
      if (!data) return [];
      
      const parsed = JSON.parse(data);
      // Convert date strings back to Date objects
      return parsed.map((season: any) => ({
        ...season,
        startDate: new Date(season.startDate),
        endDate: new Date(season.endDate),
        createdAt: new Date(season.createdAt)
      }));
    } catch (error) {
      console.error(`Error reading from localStorage for key ${this.storageKey}:`, error);
      return [];
    }
  }

  async getActiveSeason(): Promise<Season | null> {
    const allSeasons = await this.findAll();
    return allSeasons.find(season => season.isActive) || null;
  }

  async setActiveSeason(seasonId: string): Promise<Season | null> {
    // First deactivate all seasons
    await this.deactivateAllSeasons();
    
    // Then activate the specified season
    const updatedSeason = await this.update(seasonId, { isActive: true });
    return updatedSeason;
  }

  async deactivateAllSeasons(): Promise<void> {
    const allSeasons = await this.findAll();
    const deactivatedSeasons = allSeasons.map(season => ({ ...season, isActive: false }));
    this.setStorageData(deactivatedSeasons);
  }

  async findByName(name: string): Promise<Season | null> {
    const allSeasons = await this.findAll();
    return allSeasons.find(season => season.name === name) || null;
  }

  // Override create to ensure only one active season at a time
  async create(data: CreateSeasonData): Promise<Season> {
    const entity = this.createEntity(data);
    const allData = this.getStorageData();
    
    // Check for duplicate ID
    if (allData.some(item => item.id === entity.id)) {
      throw new Error(`Season with ID ${entity.id} already exists`);
    }

    // Check for duplicate name
    if (allData.some(item => item.name === entity.name)) {
      throw new Error(`Season with name "${entity.name}" already exists`);
    }
    
    allData.push(entity);
    this.setStorageData(allData);
    return entity;
  }

  // Override update to handle season name uniqueness
  async update(id: string, updates: Partial<Season>): Promise<Season | null> {
    const allData = this.getStorageData();
    const index = allData.findIndex(item => item.id === id);
    
    if (index === -1) {
      return null;
    }

    // Check for duplicate name if name is being updated
    if (updates.name && updates.name !== allData[index].name) {
      const existingWithName = allData.find(item => item.id !== id && item.name === updates.name);
      if (existingWithName) {
        throw new Error(`Season with name "${updates.name}" already exists`);
      }
    }

    // If setting this season as active, deactivate others first
    if (updates.isActive === true) {
      allData.forEach((season, i) => {
        if (i !== index) {
          season.isActive = false;
        }
      });
    }

    // Merge updates with existing data
    const updatedEntity = { ...allData[index], ...updates };
    allData[index] = updatedEntity;
    this.setStorageData(allData);
    
    return updatedEntity;
  }
}