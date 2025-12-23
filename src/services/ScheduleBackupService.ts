import { Schedule } from '../models/Schedule';

export interface BackupMetadata {
  id: string;
  weekId: string;
  originalScheduleId: string;
  createdAt: Date;
  size: number;
  checksum: string;
  description: string;
}

export interface ScheduleBackupService {
  // Backup operations
  createBackup(schedule: Schedule): Promise<BackupMetadata>;
  restoreBackup(backupId: string): Promise<Schedule>;
  
  // Backup management
  listBackups(weekId: string): Promise<BackupMetadata[]>;
  cleanupOldBackups(weekId: string): Promise<void>;
  
  // Validation
  validateBackup(backupId: string): Promise<boolean>;
}

export class LocalScheduleBackupService implements ScheduleBackupService {
  private readonly backupStorageKey = 'golf_scheduler_schedule_backups';
  private readonly metadataStorageKey = 'golf_scheduler_backup_metadata';
  private readonly maxBackupsPerWeek = 5; // Keep only 5 most recent backups per week
  private readonly backupRetentionDays = 30; // Keep backups for 30 days

  /**
   * Create a timestamped backup of a schedule
   */
  async createBackup(schedule: Schedule): Promise<BackupMetadata> {
    try {
      // Generate backup ID
      const backupId = this.generateBackupId(schedule.weekId);
      
      // Serialize schedule data
      const scheduleData = this.serializeSchedule(schedule);
      const checksum = this.calculateChecksum(scheduleData);
      
      // Create backup metadata
      const metadata: BackupMetadata = {
        id: backupId,
        weekId: schedule.weekId,
        originalScheduleId: schedule.id,
        createdAt: new Date(),
        size: scheduleData.length,
        checksum,
        description: `Backup of schedule ${schedule.id} for week ${schedule.weekId}`
      };

      // Store backup data
      await this.storeBackupData(backupId, scheduleData);
      
      // Store backup metadata
      await this.storeBackupMetadata(metadata);
      
      // Cleanup old backups for this week
      await this.cleanupOldBackups(schedule.weekId);
      
      return metadata;
    } catch (error) {
      throw new Error(`Failed to create backup: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Restore a schedule from backup
   */
  async restoreBackup(backupId: string): Promise<Schedule> {
    try {
      // Get backup metadata
      const metadata = await this.getBackupMetadata(backupId);
      if (!metadata) {
        throw new Error(`Backup ${backupId} not found`);
      }

      // Validate backup before restoration
      const isValid = await this.validateBackup(backupId);
      if (!isValid) {
        throw new Error(`Backup ${backupId} is corrupted or invalid`);
      }

      // Retrieve backup data
      const backupData = await this.getBackupData(backupId);
      if (!backupData) {
        throw new Error(`Backup data for ${backupId} not found`);
      }

      // Deserialize schedule
      const schedule = this.deserializeSchedule(backupData);
      
      return schedule;
    } catch (error) {
      throw new Error(`Failed to restore backup: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * List all backups for a specific week
   */
  async listBackups(weekId: string): Promise<BackupMetadata[]> {
    try {
      const allMetadata = await this.getAllBackupMetadata();
      return allMetadata
        .filter(metadata => metadata.weekId === weekId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()); // Most recent first
    } catch (error) {
      console.error('Error listing backups:', error);
      return [];
    }
  }

  /**
   * Clean up old backups for a specific week
   */
  async cleanupOldBackups(weekId: string): Promise<void> {
    try {
      const backups = await this.listBackups(weekId);
      const now = new Date();
      const cutoffDate = new Date(now.getTime() - (this.backupRetentionDays * 24 * 60 * 60 * 1000));

      // Identify backups to remove (keep most recent ones within limits and retention period)
      const backupsToKeep = backups
        .filter(backup => backup.createdAt > cutoffDate)
        .slice(0, this.maxBackupsPerWeek);
      
      const backupsToRemove = backups.filter(backup => 
        !backupsToKeep.some(keep => keep.id === backup.id)
      );

      // Remove old backups
      for (const backup of backupsToRemove) {
        await this.removeBackup(backup.id);
      }
    } catch (error) {
      console.error('Error cleaning up old backups:', error);
      // Don't throw error for cleanup failures - it's not critical
    }
  }

  /**
   * Validate backup integrity
   */
  async validateBackup(backupId: string): Promise<boolean> {
    try {
      // Get backup metadata
      const metadata = await this.getBackupMetadata(backupId);
      if (!metadata) {
        return false;
      }

      // Get backup data
      const backupData = await this.getBackupData(backupId);
      if (!backupData) {
        return false;
      }

      // Verify checksum
      const calculatedChecksum = this.calculateChecksum(backupData);
      if (calculatedChecksum !== metadata.checksum) {
        return false;
      }

      // Verify size
      if (backupData.length !== metadata.size) {
        return false;
      }

      // Try to deserialize to ensure data integrity
      try {
        this.deserializeSchedule(backupData);
        return true;
      } catch {
        return false;
      }
    } catch (error) {
      console.error('Error validating backup:', error);
      return false;
    }
  }

  /**
   * Generate a unique backup ID
   */
  private generateBackupId(weekId: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `backup_${weekId}_${timestamp}_${random}`;
  }

  /**
   * Serialize schedule to string
   */
  private serializeSchedule(schedule: Schedule): string {
    return JSON.stringify({
      id: schedule.id,
      weekId: schedule.weekId,
      timeSlots: schedule.timeSlots,
      createdAt: schedule.createdAt.toISOString(),
      lastModified: schedule.lastModified.toISOString()
    });
  }

  /**
   * Deserialize schedule from string
   */
  private deserializeSchedule(data: string): Schedule {
    const parsed = JSON.parse(data);
    return {
      ...parsed,
      createdAt: new Date(parsed.createdAt),
      lastModified: new Date(parsed.lastModified),
      getAllPlayers: function() {
        const playerIds = new Set<string>();
        [...this.timeSlots.morning, ...this.timeSlots.afternoon].forEach(foursome => {
          foursome.players.forEach((player: any) => {
            playerIds.add(player.id);
          });
        });
        return Array.from(playerIds);
      },
      getTotalPlayerCount: function() {
        return this.getAllPlayers().length;
      }
    };
  }

  /**
   * Calculate checksum for data integrity
   */
  private calculateChecksum(data: string): string {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Store backup data in localStorage
   */
  private async storeBackupData(backupId: string, data: string): Promise<void> {
    try {
      const backups = this.getBackupStorage();
      backups[backupId] = data;
      localStorage.setItem(this.backupStorageKey, JSON.stringify(backups));
    } catch (error) {
      throw new Error(`Failed to store backup data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get backup data from localStorage
   */
  private async getBackupData(backupId: string): Promise<string | null> {
    try {
      const backups = this.getBackupStorage();
      return backups[backupId] || null;
    } catch (error) {
      console.error('Error getting backup data:', error);
      return null;
    }
  }

  /**
   * Store backup metadata
   */
  private async storeBackupMetadata(metadata: BackupMetadata): Promise<void> {
    try {
      const allMetadata = await this.getAllBackupMetadata();
      allMetadata.push(metadata);
      localStorage.setItem(this.metadataStorageKey, JSON.stringify(allMetadata));
    } catch (error) {
      throw new Error(`Failed to store backup metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get backup metadata by ID
   */
  private async getBackupMetadata(backupId: string): Promise<BackupMetadata | null> {
    try {
      const allMetadata = await this.getAllBackupMetadata();
      return allMetadata.find(metadata => metadata.id === backupId) || null;
    } catch (error) {
      console.error('Error getting backup metadata:', error);
      return null;
    }
  }

  /**
   * Get all backup metadata
   */
  private async getAllBackupMetadata(): Promise<BackupMetadata[]> {
    try {
      const data = localStorage.getItem(this.metadataStorageKey);
      if (!data) return [];
      
      const parsed = JSON.parse(data);
      return parsed.map((metadata: any) => ({
        ...metadata,
        createdAt: new Date(metadata.createdAt)
      }));
    } catch (error) {
      console.error('Error getting all backup metadata:', error);
      return [];
    }
  }

  /**
   * Get backup storage object
   */
  private getBackupStorage(): Record<string, string> {
    try {
      const data = localStorage.getItem(this.backupStorageKey);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error('Error getting backup storage:', error);
      return {};
    }
  }

  /**
   * Remove a backup and its metadata
   */
  private async removeBackup(backupId: string): Promise<void> {
    try {
      // Remove backup data
      const backups = this.getBackupStorage();
      delete backups[backupId];
      localStorage.setItem(this.backupStorageKey, JSON.stringify(backups));

      // Remove backup metadata
      const allMetadata = await this.getAllBackupMetadata();
      const filteredMetadata = allMetadata.filter(metadata => metadata.id !== backupId);
      localStorage.setItem(this.metadataStorageKey, JSON.stringify(filteredMetadata));
    } catch (error) {
      console.error('Error removing backup:', error);
      // Don't throw error for removal failures
    }
  }
}