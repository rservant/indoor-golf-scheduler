import { Week, WeekModel } from '../models/Week';
import { LocalStorageRepository } from './BaseRepository';
import { availabilityErrorHandler } from '../utils/AvailabilityErrorHandler';

export interface WeekCreateData {
  seasonId: string;
  weekNumber: number;
  date: Date;
}

export interface PersistenceVerification {
  success: boolean;
  verifiedCount: number;
  totalCount: number;
  failedPlayerIds: string[];
  error?: string;
  timestamp: Date;
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
  
  // Enhanced verified persistence methods
  setPlayerAvailabilityVerified(weekId: string, playerId: string, available: boolean): Promise<boolean>;
  setBulkAvailabilityVerified(weekId: string, updates: Map<string, boolean>): Promise<PersistenceVerification>;
  verifyDataIntegrity(weekId: string): Promise<boolean>;
  getLastModifiedTimestamp(weekId: string): Promise<Date | null>;
  createBackup(weekId: string): Promise<string>;
  restoreFromBackup(weekId: string, backupId: string): Promise<boolean>;
}

export class LocalWeekRepository extends LocalStorageRepository<Week, WeekCreateData> implements WeekRepository {
  protected storageKey = 'golf_scheduler_weeks';
  private backupStorageKey = 'golf_scheduler_weeks_backup';
  private timestampStorageKey = 'golf_scheduler_weeks_timestamps';

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

  // Enhanced verified persistence methods with comprehensive error handling
  async setPlayerAvailabilityVerified(weekId: string, playerId: string, available: boolean): Promise<boolean> {
    try {
      // First, update the availability
      const updatedWeek = await this.setPlayerAvailability(weekId, playerId, available);
      if (!updatedWeek) {
        return false;
      }

      // Verify the change was persisted by reading it back
      const verificationWeek = await this.findById(weekId);
      if (!verificationWeek) {
        return false;
      }

      // Check if the availability was correctly set
      const actualAvailability = verificationWeek.playerAvailability[playerId];
      const isVerified = actualAvailability === available;

      if (isVerified) {
        // Update timestamp for this week
        this.updateTimestamp(weekId);
      }

      return isVerified;
    } catch (error) {
      console.error(`Failed to set verified availability for player ${playerId} in week ${weekId}:`, error);
      
      // Handle storage-specific errors
      await availabilityErrorHandler.handleStorageError(
        error instanceof Error ? error : new Error(String(error)),
        'setPlayerAvailabilityVerified'
      );
      
      return false;
    }
  }

  async setBulkAvailabilityVerified(weekId: string, updates: Map<string, boolean>): Promise<PersistenceVerification> {
    const result: PersistenceVerification = {
      success: false,
      verifiedCount: 0,
      totalCount: updates.size,
      failedPlayerIds: [],
      timestamp: new Date()
    };

    try {
      // Check if week exists first
      const week = await this.findById(weekId);
      if (!week) {
        result.error = `Week ${weekId} not found`;
        return result;
      }

      // Create backup before bulk operation
      const backupId = await this.createBackup(weekId);

      // Apply all updates
      const updatedAvailability = { ...week.playerAvailability };
      for (const [playerId, available] of updates) {
        updatedAvailability[playerId] = available;
      }

      // Perform the bulk update
      const updatedWeek = await this.update(weekId, { playerAvailability: updatedAvailability });
      if (!updatedWeek) {
        result.error = `Failed to update week ${weekId}`;
        return result;
      }

      // Verify each update by reading back from storage
      const verificationWeek = await this.findById(weekId);
      if (!verificationWeek) {
        result.error = `Failed to verify updates for week ${weekId}`;
        return result;
      }

      // Check each player's availability
      for (const [playerId, expectedAvailable] of updates) {
        const actualAvailable = verificationWeek.playerAvailability[playerId];
        if (actualAvailable === expectedAvailable) {
          result.verifiedCount++;
        } else {
          result.failedPlayerIds.push(playerId);
        }
      }

      result.success = result.verifiedCount === result.totalCount;
      
      if (result.success) {
        // Update timestamp for successful bulk operation
        this.updateTimestamp(weekId);
      } else {
        // If not all updates succeeded, restore from backup
        await this.restoreFromBackup(weekId, backupId);
        result.error = `Partial failure: ${result.failedPlayerIds.length} players failed verification`;
      }

      return result;
    } catch (error) {
      console.error(`Bulk availability update failed for week ${weekId}:`, error);
      
      // Handle storage-specific errors
      await availabilityErrorHandler.handleStorageError(
        error instanceof Error ? error : new Error(String(error)),
        'setBulkAvailabilityVerified'
      );
      
      result.error = `Bulk update failed: ${error}`;
      result.failedPlayerIds = Array.from(updates.keys());
      return result;
    }
  }

  async verifyDataIntegrity(weekId: string): Promise<boolean> {
    try {
      const week = await this.findById(weekId);
      if (!week) {
        return false;
      }

      // Validate the week model
      const weekModel = new WeekModel(week);
      weekModel.validate();

      // Verify that all availability values are boolean
      for (const [playerId, available] of Object.entries(week.playerAvailability)) {
        if (typeof available !== 'boolean') {
          console.error(`Invalid availability value for player ${playerId}: ${available}`);
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error(`Data integrity check failed for week ${weekId}:`, error);
      return false;
    }
  }

  async getLastModifiedTimestamp(weekId: string): Promise<Date | null> {
    try {
      const timestamps = this.getTimestamps();
      const timestamp = timestamps[weekId];
      return timestamp ? new Date(timestamp) : null;
    } catch (error) {
      console.error(`Failed to get timestamp for week ${weekId}:`, error);
      return null;
    }
  }

  async createBackup(weekId: string): Promise<string> {
    try {
      const week = await this.findById(weekId);
      if (!week) {
        throw new Error(`Week ${weekId} not found for backup`);
      }

      const backupId = `backup_${weekId}_${Date.now()}`;
      const backups = this.getBackups();
      backups[backupId] = week;
      this.setBackups(backups);

      return backupId;
    } catch (error) {
      console.error(`Failed to create backup for week ${weekId}:`, error);
      throw error;
    }
  }

  async restoreFromBackup(weekId: string, backupId: string): Promise<boolean> {
    try {
      const backups = this.getBackups();
      const backupWeek = backups[backupId];
      
      if (!backupWeek) {
        console.error(`Backup ${backupId} not found`);
        return false;
      }

      const restoredWeek = await this.update(weekId, backupWeek);
      if (!restoredWeek) {
        console.error(`Failed to restore week ${weekId} from backup ${backupId}`);
        return false;
      }

      // Clean up the backup after successful restore
      delete backups[backupId];
      this.setBackups(backups);

      return true;
    } catch (error) {
      console.error(`Failed to restore week ${weekId} from backup ${backupId}:`, error);
      return false;
    }
  }

  // Private helper methods for timestamps and backups
  private updateTimestamp(weekId: string): void {
    try {
      const timestamps = this.getTimestamps();
      timestamps[weekId] = new Date().toISOString();
      this.setTimestamps(timestamps);
    } catch (error) {
      console.error(`Failed to update timestamp for week ${weekId}:`, error);
    }
  }

  private getTimestamps(): Record<string, string> {
    try {
      const data = localStorage.getItem(this.timestampStorageKey);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error(`Error reading timestamps from localStorage:`, error);
      return {};
    }
  }

  private setTimestamps(timestamps: Record<string, string>): void {
    try {
      localStorage.setItem(this.timestampStorageKey, JSON.stringify(timestamps));
    } catch (error) {
      console.error(`Error writing timestamps to localStorage:`, error);
      
      // Handle storage-specific errors
      availabilityErrorHandler.handleStorageError(
        error instanceof Error ? error : new Error(String(error)),
        'setTimestamps'
      );
      
      throw error;
    }
  }

  private getBackups(): Record<string, Week> {
    try {
      const data = localStorage.getItem(this.backupStorageKey);
      if (!data) return {};
      
      const parsed = JSON.parse(data);
      // Convert date strings back to Date objects for backups
      const result: Record<string, Week> = {};
      for (const [backupId, week] of Object.entries(parsed)) {
        result[backupId] = {
          ...(week as Week),
          date: new Date((week as Week).date)
        };
      }
      return result;
    } catch (error) {
      console.error(`Error reading backups from localStorage:`, error);
      return {};
    }
  }

  private setBackups(backups: Record<string, Week>): void {
    try {
      localStorage.setItem(this.backupStorageKey, JSON.stringify(backups));
    } catch (error) {
      console.error(`Error writing backups to localStorage:`, error);
      
      // Handle storage-specific errors
      availabilityErrorHandler.handleStorageError(
        error instanceof Error ? error : new Error(String(error)),
        'setBackups'
      );
      
      throw error;
    }
  }

  // Override create to ensure unique week numbers within a season
  async create(data: WeekCreateData): Promise<Week> {
    // Check for duplicate week number within the same season
    const existingWeek = await this.findBySeasonAndWeekNumber(data.seasonId, data.weekNumber);
    if (existingWeek) {
      throw new Error(`Week ${data.weekNumber} already exists in season ${data.seasonId}`);
    }

    const week = await super.create(data);
    // Set initial timestamp
    this.updateTimestamp(week.id);
    return week;
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

  // Override the base method to add enhanced error handling
  protected setStorageData(data: Week[]): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (error) {
      console.error(`Error writing to localStorage for key ${this.storageKey}:`, error);
      
      // Handle storage-specific errors
      availabilityErrorHandler.handleStorageError(
        error instanceof Error ? error : new Error(String(error)),
        'setStorageData'
      );
      
      throw error;
    }
  }
}