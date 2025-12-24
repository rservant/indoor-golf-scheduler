import { Schedule, ScheduleModel } from '../models/Schedule';
import { LocalStorageRepository } from './BaseRepository';

export interface ScheduleCreateData {
  weekId: string;
}

export interface ScheduleStatus {
  weekId: string;
  exists: boolean;
  locked: boolean;
  lastModified: Date;
  hasManualEdits: boolean;
  regenerationCount: number;
}

export interface ScheduleLock {
  weekId: string;
  lockedAt: Date;
  lockId: string;
  timeout: number; // milliseconds
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

  // Atomic operations
  replaceScheduleAtomic(weekId: string, newSchedule: Schedule, backupId: string): Promise<void>;
  
  // Locking mechanism
  acquireScheduleLock(weekId: string, timeout?: number): Promise<string | null>;
  releaseScheduleLock(weekId: string, lockId: string): Promise<boolean>;
  isScheduleLocked(weekId: string): Promise<boolean>;
  forceReleaseScheduleLock(weekId: string): Promise<boolean>;
  
  // Status management
  setScheduleStatus(weekId: string, status: Partial<ScheduleStatus>): Promise<void>;
  getScheduleStatus(weekId: string): Promise<ScheduleStatus>;
}

export class LocalScheduleRepository extends LocalStorageRepository<Schedule, ScheduleCreateData> implements ScheduleRepository {
  protected storageKey = 'golf_scheduler_schedules';
  private locksStorageKey = 'golf_scheduler_schedule_locks';
  private statusStorageKey = 'golf_scheduler_schedule_status';
  private readonly DEFAULT_LOCK_TIMEOUT = 30000; // 30 seconds

  protected createEntity(data: ScheduleCreateData): Schedule {
    const scheduleModel = new ScheduleModel(data);
    return scheduleModel;
  }

  // Lock management methods
  private getScheduleLocks(): ScheduleLock[] {
    try {
      const data = localStorage.getItem(this.locksStorageKey);
      if (!data) return [];
      
      const parsed = JSON.parse(data);
      return parsed.map((lock: any) => ({
        ...lock,
        lockedAt: new Date(lock.lockedAt)
      }));
    } catch (error) {
      console.error(`Error reading locks from localStorage:`, error);
      return [];
    }
  }

  private setScheduleLocks(locks: ScheduleLock[]): void {
    try {
      localStorage.setItem(this.locksStorageKey, JSON.stringify(locks));
    } catch (error) {
      console.error(`Error writing locks to localStorage:`, error);
      throw new Error(`Failed to save locks to storage: ${error}`);
    }
  }

  private getScheduleStatuses(): ScheduleStatus[] {
    try {
      const data = localStorage.getItem(this.statusStorageKey);
      if (!data) return [];
      
      const parsed = JSON.parse(data);
      return parsed.map((status: any) => ({
        ...status,
        lastModified: new Date(status.lastModified)
      }));
    } catch (error) {
      console.error(`Error reading status from localStorage:`, error);
      return [];
    }
  }

  private setScheduleStatuses(statuses: ScheduleStatus[]): void {
    try {
      localStorage.setItem(this.statusStorageKey, JSON.stringify(statuses));
    } catch (error) {
      console.error(`Error writing status to localStorage:`, error);
      throw new Error(`Failed to save status to storage: ${error}`);
    }
  }

  private generateLockId(): string {
    return `lock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private cleanupExpiredLocks(): void {
    const locks = this.getScheduleLocks();
    const now = Date.now();
    const validLocks = locks.filter(lock => {
      const lockAge = now - lock.lockedAt.getTime();
      return lockAge < lock.timeout;
    });
    
    if (validLocks.length !== locks.length) {
      this.setScheduleLocks(validLocks);
    }
  }

  async acquireScheduleLock(weekId: string, timeout: number = this.DEFAULT_LOCK_TIMEOUT): Promise<string | null> {
    this.cleanupExpiredLocks();
    
    const locks = this.getScheduleLocks();
    const existingLock = locks.find(lock => lock.weekId === weekId);
    
    if (existingLock) {
      // Check if lock is still valid
      const lockAge = Date.now() - existingLock.lockedAt.getTime();
      if (lockAge < existingLock.timeout) {
        return null; // Lock is still active
      }
      // Remove expired lock
      const index = locks.indexOf(existingLock);
      locks.splice(index, 1);
    }
    
    const lockId = this.generateLockId();
    const newLock: ScheduleLock = {
      weekId,
      lockedAt: new Date(),
      lockId,
      timeout
    };
    
    locks.push(newLock);
    this.setScheduleLocks(locks);
    
    return lockId;
  }

  async releaseScheduleLock(weekId: string, lockId: string): Promise<boolean> {
    const locks = this.getScheduleLocks();
    const lockIndex = locks.findIndex(lock => lock.weekId === weekId && lock.lockId === lockId);
    
    if (lockIndex === -1) {
      return false;
    }
    
    locks.splice(lockIndex, 1);
    this.setScheduleLocks(locks);
    return true;
  }

  async isScheduleLocked(weekId: string): Promise<boolean> {
    this.cleanupExpiredLocks();
    const locks = this.getScheduleLocks();
    return locks.some(lock => lock.weekId === weekId);
  }

  async forceReleaseScheduleLock(weekId: string): Promise<boolean> {
    const locks = this.getScheduleLocks();
    const locksToRemove = locks.filter(lock => lock.weekId === weekId);
    
    if (locksToRemove.length === 0) {
      return false;
    }
    
    const remainingLocks = locks.filter(lock => lock.weekId !== weekId);
    this.setScheduleLocks(remainingLocks);
    
    return true;
  }

  async setScheduleStatus(weekId: string, statusUpdate: Partial<ScheduleStatus>): Promise<void> {
    const statuses = this.getScheduleStatuses();
    const existingIndex = statuses.findIndex(status => status.weekId === weekId);
    
    if (existingIndex >= 0) {
      // Update existing status
      statuses[existingIndex] = { ...statuses[existingIndex], ...statusUpdate };
    } else {
      // Create new status with defaults
      const newStatus: ScheduleStatus = {
        weekId,
        exists: false,
        locked: false,
        lastModified: new Date(),
        hasManualEdits: false,
        regenerationCount: 0,
        ...statusUpdate
      };
      statuses.push(newStatus);
    }
    
    this.setScheduleStatuses(statuses);
  }

  async getScheduleStatus(weekId: string): Promise<ScheduleStatus> {
    const statuses = this.getScheduleStatuses();
    const existingStatus = statuses.find(status => status.weekId === weekId);
    
    if (existingStatus) {
      return existingStatus;
    }
    
    // Create default status if none exists
    const schedule = await this.findByWeekId(weekId);
    const defaultStatus: ScheduleStatus = {
      weekId,
      exists: schedule !== null,
      locked: await this.isScheduleLocked(weekId),
      lastModified: schedule?.lastModified || new Date(),
      hasManualEdits: false,
      regenerationCount: 0
    };
    
    await this.setScheduleStatus(weekId, defaultStatus);
    return defaultStatus;
  }

  async replaceScheduleAtomic(weekId: string, newSchedule: Schedule, backupId: string): Promise<void> {
    // Verify the schedule is locked before proceeding
    const isLocked = await this.isScheduleLocked(weekId);
    if (!isLocked) {
      throw new Error(`Cannot replace schedule for week ${weekId}: schedule is not locked`);
    }
    
    try {
      // Get all schedules
      const allSchedules = this.getStorageData();
      
      // Find existing schedule index
      const existingIndex = allSchedules.findIndex(schedule => schedule.weekId === weekId);
      
      // Create new schedule model with updated timestamp (ensure it's different)
      const updatedSchedule = new ScheduleModel({
        ...newSchedule,
        lastModified: new Date(Date.now() + 1) // Ensure timestamp is at least 1ms later
      });
      
      if (existingIndex >= 0) {
        // Replace existing schedule
        allSchedules[existingIndex] = updatedSchedule;
      } else {
        // Add new schedule
        allSchedules.push(updatedSchedule);
      }
      
      // Atomically update storage
      this.setStorageData(allSchedules);
      
      // Update schedule status
      const currentStatus = await this.getScheduleStatus(weekId);
      await this.setScheduleStatus(weekId, {
        exists: true,
        lastModified: updatedSchedule.lastModified,
        regenerationCount: currentStatus.regenerationCount + 1
      });
      
    } catch (error) {
      throw new Error(`Atomic schedule replacement failed for week ${weekId}: ${error}`);
    }
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

  // Override create to ensure only one schedule per week and update status
  async create(data: ScheduleCreateData): Promise<Schedule> {
    // Check if a schedule already exists for this week
    const existingSchedule = await this.findByWeekId(data.weekId);
    if (existingSchedule) {
      throw new Error(`Schedule already exists for week ${data.weekId}`);
    }

    const newSchedule = await super.create(data);
    
    // Update schedule status
    await this.setScheduleStatus(data.weekId, {
      exists: true,
      lastModified: newSchedule.lastModified,
      hasManualEdits: false,
      regenerationCount: 0
    });
    
    return newSchedule;
  }

  // Override update to track manual edits and return ScheduleModel instance
  async update(id: string, updates: Partial<Schedule>): Promise<Schedule | null> {
    const updatedSchedule = await super.update(id, updates);
    
    if (updatedSchedule) {
      // Mark as manually edited
      await this.setScheduleStatus(updatedSchedule.weekId, {
        hasManualEdits: true,
        lastModified: updatedSchedule.lastModified
      });
      
      // Convert to ScheduleModel instance to ensure methods are available
      return new ScheduleModel({
        ...updatedSchedule,
        createdAt: new Date(updatedSchedule.createdAt),
        lastModified: new Date(updatedSchedule.lastModified)
      });
    }
    
    return null;
  }

  // Override delete to update status
  async delete(id: string): Promise<boolean> {
    const schedule = await this.findById(id);
    if (!schedule) {
      return false;
    }

    const result = await super.delete(id);
    
    if (result) {
      // Update status
      await this.setScheduleStatus(schedule.weekId, {
        exists: false,
        lastModified: new Date()
      });
    }
    
    return result;
  }

  // Override the base method to handle date deserialization
  protected getStorageData(): Schedule[] {
    try {
      const data = localStorage.getItem(this.storageKey);
      if (!data) return [];
      
      const parsed = JSON.parse(data);
      // Convert date strings back to Date objects and create ScheduleModel instances
      return parsed.map((schedule: any) => new ScheduleModel({
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