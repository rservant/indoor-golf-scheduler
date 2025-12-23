import { Week, WeekModel } from '../models/Week';
import { LocalStorageRepository } from './BaseRepository';

export interface WeekCreateData {
  seasonId: string;
  weekNumber: number;
  date: Date;
}

export interface WeekRepository {
  create(data: WeekCreateData): Promise<Week>;
  findById(id: string): Promise<Week | null>;
  findAll(): Promise<Week[]>;
  update(id: string, data: Partial<Week>): Promise<Week | null>;
  delete(id: string): Promise<boolean>;
  exists(id: string): Promise<boolean>;
  
  // Season-scoped methods
  findBySeasonId(seasonId: string): Promise<Week[]>;
  findBySeasonAndWeekNumber(seasonId: string, weekNumber: number): Promise<Week | null>;
  deleteBySeasonId(seasonId: string): Promise<number>;
  
  // Player availability methods
  setPlayerAvailability(weekId: string, playerId: string, available: boolean): Promise<Week | null>;
  getAvailablePlayers(weekId: string): Promise<string[]>;
  getUnavailablePlayers(weekId: string): Promise<string[]>;
}

export class LocalWeekRepository extends LocalStorageRepository<Week, WeekCreateData> implements WeekRepository {
  protected storageKey = 'golf_scheduler_weeks';

  protected createEntity(data: WeekCreateData): Week {
    const weekModel = new WeekModel(data);
    return weekModel.toJSON();
  }

  async findBySeasonId(seasonId: string): Promise<Week[]> {
    const allWeeks = await this.findAll();
    return allWeeks.filter(week => week.seasonId === seasonId)
      .sort((a, b) => a.weekNumber - b.weekNumber);
  }

  async findBySeasonAndWeekNumber(seasonId: string, weekNumber: number): Promise<Week | null> {
    const seasonWeeks = await this.findBySeasonId(seasonId);
    return seasonWeeks.find(week => week.weekNumber === weekNumber) || null;
  }

  async deleteBySeasonId(seasonId: string): Promise<number> {
    const allWeeks = this.getStorageData();
    const weeksToKeep = allWeeks.filter(week => week.seasonId !== seasonId);
    const deletedCount = allWeeks.length - weeksToKeep.length;
    
    this.setStorageData(weeksToKeep);
    return deletedCount;
  }

  async setPlayerAvailability(weekId: string, playerId: string, available: boolean): Promise<Week | null> {
    const week = await this.findById(weekId);
    if (!week) {
      return null;
    }

    const updatedAvailability = { ...week.playerAvailability };
    updatedAvailability[playerId] = available;

    return await this.update(weekId, { playerAvailability: updatedAvailability });
  }

  async getAvailablePlayers(weekId: string): Promise<string[]> {
    const week = await this.findById(weekId);
    if (!week) {
      return [];
    }

    const weekModel = new WeekModel(week);
    return weekModel.getAvailablePlayers();
  }

  async getUnavailablePlayers(weekId: string): Promise<string[]> {
    const week = await this.findById(weekId);
    if (!week) {
      return [];
    }

    const weekModel = new WeekModel(week);
    return weekModel.getUnavailablePlayers();
  }

  // Override create to ensure unique week numbers within a season
  async create(data: WeekCreateData): Promise<Week> {
    // Check for duplicate week number within the same season
    const existingWeek = await this.findBySeasonAndWeekNumber(data.seasonId, data.weekNumber);
    if (existingWeek) {
      throw new Error(`Week ${data.weekNumber} already exists in season ${data.seasonId}`);
    }

    return super.create(data);
  }

  // Override the base method to handle date deserialization
  protected getStorageData(): Week[] {
    try {
      const data = localStorage.getItem(this.storageKey);
      if (!data) return [];
      
      const parsed = JSON.parse(data);
      // Convert date strings back to Date objects
      return parsed.map((week: any) => ({
        ...week,
        date: new Date(week.date)
      }));
    } catch (error) {
      console.error(`Error reading from localStorage for key ${this.storageKey}:`, error);
      return [];
    }
  }
}