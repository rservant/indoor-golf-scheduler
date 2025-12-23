import { Schedule, ScheduleModel } from '../models/Schedule';
import { LocalStorageRepository } from './BaseRepository';

export interface ScheduleCreateData {
  weekId: string;
}

export interface ScheduleRepository {
  create(data: ScheduleCreateData): Promise<Schedule>;
  findById(id: string): Promise<Schedule | null>;
  findAll(): Promise<Schedule[]>;
  update(id: string, data: Partial<Schedule>): Promise<Schedule | null>;
  delete(id: string): Promise<boolean>;
  exists(id: string): Promise<boolean>;
  
  // Week-based methods
  findByWeekId(weekId: string): Promise<Schedule | null>;
  findBySeasonId(seasonId: string): Promise<Schedule[]>;
  deleteByWeekId(weekId: string): Promise<boolean>;
  deleteBySeasonId(seasonId: string): Promise<number>;
  
  // Schedule-specific methods
  findRecent(limit?: number): Promise<Schedule[]>;
  findByDateRange(startDate: Date, endDate: Date): Promise<Schedule[]>;
}

export class LocalScheduleRepository extends LocalStorageRepository<Schedule, ScheduleCreateData> implements ScheduleRepository {
  protected storageKey = 'golf_scheduler_schedules';

  protected createEntity(data: ScheduleCreateData): Schedule {
    const scheduleModel = new ScheduleModel(data);
    return scheduleModel.toJSON();
  }

  async findByWeekId(weekId: string): Promise<Schedule | null> {
    const allSchedules = await this.findAll();
    return allSchedules.find(schedule => schedule.weekId === weekId) || null;
  }

  async findBySeasonId(seasonId: string): Promise<Schedule[]> {
    // Note: This requires cross-referencing with weeks to get seasonId
    // For now, we'll implement a simple approach that assumes weekId contains season info
    // In a real implementation, this might require joining with Week data
    const allSchedules = await this.findAll();
    return allSchedules.filter(schedule => schedule.weekId.includes(seasonId));
  }

  async deleteByWeekId(weekId: string): Promise<boolean> {
    const allSchedules = this.getStorageData();
    const index = allSchedules.findIndex(schedule => schedule.weekId === weekId);
    
    if (index === -1) {
      return false;
    }

    allSchedules.splice(index, 1);
    this.setStorageData(allSchedules);
    return true;
  }

  async deleteBySeasonId(seasonId: string): Promise<number> {
    const allSchedules = this.getStorageData();
    const schedulesToKeep = allSchedules.filter(schedule => !schedule.weekId.includes(seasonId));
    const deletedCount = allSchedules.length - schedulesToKeep.length;
    
    this.setStorageData(schedulesToKeep);
    return deletedCount;
  }

  async findRecent(limit: number = 10): Promise<Schedule[]> {
    const allSchedules = await this.findAll();
    return allSchedules
      .sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime())
      .slice(0, limit);
  }

  async findByDateRange(startDate: Date, endDate: Date): Promise<Schedule[]> {
    const allSchedules = await this.findAll();
    return allSchedules.filter(schedule => {
      const scheduleDate = schedule.createdAt;
      return scheduleDate >= startDate && scheduleDate <= endDate;
    });
  }

  // Override create to ensure only one schedule per week
  async create(data: ScheduleCreateData): Promise<Schedule> {
    // Check if a schedule already exists for this week
    const existingSchedule = await this.findByWeekId(data.weekId);
    if (existingSchedule) {
      throw new Error(`Schedule already exists for week ${data.weekId}`);
    }

    return super.create(data);
  }

  // Override the base method to handle date deserialization
  protected getStorageData(): Schedule[] {
    try {
      const data = localStorage.getItem(this.storageKey);
      if (!data) return [];
      
      const parsed = JSON.parse(data);
      // Convert date strings back to Date objects
      return parsed.map((schedule: any) => ({
        ...schedule,
        createdAt: new Date(schedule.createdAt),
        lastModified: new Date(schedule.lastModified)
      }));
    } catch (error) {
      console.error(`Error reading from localStorage for key ${this.storageKey}:`, error);
      return [];
    }
  }
}