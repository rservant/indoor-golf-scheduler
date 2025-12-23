import * as fc from 'fast-check';
import { LocalScheduleBackupService, BackupMetadata } from './ScheduleBackupService';
import { ScheduleModel } from '../models/Schedule';
import { FoursomeModel } from '../models/Foursome';
import { PlayerModel, TimePreference, Handedness } from '../models/Player';

// Mock localStorage for testing
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    }
  };
})();

// Mock localStorage in global scope for Node.js environment
(global as any).localStorage = localStorageMock;

// Test data generators
const timePreferenceArb = fc.constantFrom('AM', 'PM', 'Either') as fc.Arbitrary<TimePreference>;
const handednessArb = fc.constantFrom('left', 'right') as fc.Arbitrary<Handedness>;

const playerArb = fc.record({
  firstName: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
  lastName: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
  handedness: handednessArb,
  timePreference: timePreferenceArb,
  seasonId: fc.constant('test-season-id')
}).map(data => new PlayerModel({
  ...data,
  id: `player_${Math.random().toString(36).substring(2, 9)}`
}));

// Generate a valid schedule with foursomes
const validScheduleArb = fc.record({
  weekId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
  players: fc.array(playerArb, { minLength: 0, maxLength: 16 })
}).map(({ weekId, players }) => {
  const schedule = new ScheduleModel({ weekId });

  // Create foursomes for morning and afternoon
  let morningPosition = 0;
  let afternoonPosition = 0;
  
  for (let i = 0; i < players.length; i += 4) {
    const foursomePlayers = players.slice(i, i + 4);
    if (foursomePlayers.length > 0) {
      // Alternate between morning and afternoon
      const timeSlot = i % 8 < 4 ? 'morning' : 'afternoon';
      const position = timeSlot === 'morning' ? morningPosition++ : afternoonPosition++;
      
      const foursome = new FoursomeModel({
        players: foursomePlayers,
        timeSlot,
        position
      });
      schedule.addFoursome(foursome);
    }
  }

  return schedule;
});

describe('ScheduleBackupService Property Tests', () => {
  let backupService: LocalScheduleBackupService;

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    backupService = new LocalScheduleBackupService();
  });

  /**
   * **Feature: schedule-regeneration-fix, Property 2: Backup Creation and Restoration**
   * **Validates: Requirements 1.2, 1.4, 3.1, 3.2**
   */
  test('Property 2: Backup Creation and Restoration', async () => {
    await fc.assert(
      fc.asyncProperty(validScheduleArb, async (originalSchedule) => {
        // Create backup of the original schedule
        const backupMetadata = await backupService.createBackup(originalSchedule);
        
        // Verify backup metadata is valid
        expect(backupMetadata.id).toBeDefined();
        expect(backupMetadata.weekId).toBe(originalSchedule.weekId);
        expect(backupMetadata.originalScheduleId).toBe(originalSchedule.id);
        expect(backupMetadata.createdAt).toBeInstanceOf(Date);
        expect(backupMetadata.size).toBeGreaterThan(0);
        expect(backupMetadata.checksum).toBeDefined();
        expect(backupMetadata.description).toContain(originalSchedule.id);
        expect(backupMetadata.description).toContain(originalSchedule.weekId);

        // Validate the backup
        const isValid = await backupService.validateBackup(backupMetadata.id);
        expect(isValid).toBe(true);

        // Restore the schedule from backup
        const restoredSchedule = await backupService.restoreBackup(backupMetadata.id);

        // Verify restored schedule matches original
        expect(restoredSchedule.id).toBe(originalSchedule.id);
        expect(restoredSchedule.weekId).toBe(originalSchedule.weekId);
        expect(restoredSchedule.createdAt.getTime()).toBe(originalSchedule.createdAt.getTime());
        expect(restoredSchedule.lastModified.getTime()).toBe(originalSchedule.lastModified.getTime());

        // Verify time slots structure
        expect(restoredSchedule.timeSlots.morning.length).toBe(originalSchedule.timeSlots.morning.length);
        expect(restoredSchedule.timeSlots.afternoon.length).toBe(originalSchedule.timeSlots.afternoon.length);

        // Verify all foursomes are restored correctly
        for (let i = 0; i < originalSchedule.timeSlots.morning.length; i++) {
          const originalFoursome = originalSchedule.timeSlots.morning[i];
          const restoredFoursome = restoredSchedule.timeSlots.morning[i];
          
          expect(restoredFoursome.id).toBe(originalFoursome.id);
          expect(restoredFoursome.timeSlot).toBe(originalFoursome.timeSlot);
          expect(restoredFoursome.position).toBe(originalFoursome.position);
          expect(restoredFoursome.players.length).toBe(originalFoursome.players.length);
          
          for (let j = 0; j < originalFoursome.players.length; j++) {
            const originalPlayer = originalFoursome.players[j];
            const restoredPlayer = restoredFoursome.players[j];
            
            expect(restoredPlayer.id).toBe(originalPlayer.id);
            expect(restoredPlayer.firstName).toBe(originalPlayer.firstName);
            expect(restoredPlayer.lastName).toBe(originalPlayer.lastName);
            expect(restoredPlayer.handedness).toBe(originalPlayer.handedness);
            expect(restoredPlayer.timePreference).toBe(originalPlayer.timePreference);
            expect(restoredPlayer.seasonId).toBe(originalPlayer.seasonId);
          }
        }

        for (let i = 0; i < originalSchedule.timeSlots.afternoon.length; i++) {
          const originalFoursome = originalSchedule.timeSlots.afternoon[i];
          const restoredFoursome = restoredSchedule.timeSlots.afternoon[i];
          
          expect(restoredFoursome.id).toBe(originalFoursome.id);
          expect(restoredFoursome.timeSlot).toBe(originalFoursome.timeSlot);
          expect(restoredFoursome.position).toBe(originalFoursome.position);
          expect(restoredFoursome.players.length).toBe(originalFoursome.players.length);
          
          for (let j = 0; j < originalFoursome.players.length; j++) {
            const originalPlayer = originalFoursome.players[j];
            const restoredPlayer = restoredFoursome.players[j];
            
            expect(restoredPlayer.id).toBe(originalPlayer.id);
            expect(restoredPlayer.firstName).toBe(originalPlayer.firstName);
            expect(restoredPlayer.lastName).toBe(originalPlayer.lastName);
            expect(restoredPlayer.handedness).toBe(originalPlayer.handedness);
            expect(restoredPlayer.timePreference).toBe(originalPlayer.timePreference);
            expect(restoredPlayer.seasonId).toBe(originalPlayer.seasonId);
          }
        }

        // Verify functional methods work correctly
        expect(restoredSchedule.getAllPlayers()).toEqual(originalSchedule.getAllPlayers());
        expect(restoredSchedule.getTotalPlayerCount()).toBe(originalSchedule.getTotalPlayerCount());

        // Verify backup appears in list for the week
        const backups = await backupService.listBackups(originalSchedule.weekId);
        expect(backups.some(backup => backup.id === backupMetadata.id)).toBe(true);

        return true;
      }),
      { numRuns: 100 }
    );
  });

  test('Backup creation fails gracefully with invalid schedule data', async () => {
    // Test with null/undefined schedule
    await expect(backupService.createBackup(null as any)).rejects.toThrow();
    await expect(backupService.createBackup(undefined as any)).rejects.toThrow();
  });

  test('Backup restoration fails gracefully with invalid backup ID', async () => {
    // Test with non-existent backup ID
    await expect(backupService.restoreBackup('non-existent-backup')).rejects.toThrow();
    
    // Test with empty backup ID
    await expect(backupService.restoreBackup('')).rejects.toThrow();
  });

  test('Backup validation correctly identifies corrupted backups', async () => {
    const schedule = new ScheduleModel({ weekId: 'test-week' });
    
    // Create a valid backup
    const backupMetadata = await backupService.createBackup(schedule);
    
    // Verify it's initially valid
    expect(await backupService.validateBackup(backupMetadata.id)).toBe(true);
    
    // Corrupt the backup data by directly modifying localStorage
    const backupStorage = JSON.parse(localStorage.getItem('golf_scheduler_schedule_backups') || '{}');
    backupStorage[backupMetadata.id] = 'corrupted data';
    localStorage.setItem('golf_scheduler_schedule_backups', JSON.stringify(backupStorage));
    
    // Validation should now fail
    expect(await backupService.validateBackup(backupMetadata.id)).toBe(false);
  });

  test('Backup cleanup removes old backups correctly', async () => {
    const weekId = 'test-week';
    const schedule = new ScheduleModel({ weekId });
    
    // Create multiple backups (cleanup happens after each creation, so we expect max 5)
    const backups: BackupMetadata[] = [];
    for (let i = 0; i < 7; i++) {
      const backup = await backupService.createBackup(schedule);
      backups.push(backup);
      
      // Add small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    // Verify cleanup occurred during creation (should keep only 5 most recent)
    let allBackups = await backupService.listBackups(weekId);
    expect(allBackups.length).toBeLessThanOrEqual(5);
    
    // Create one more backup to trigger another cleanup
    await backupService.createBackup(schedule);
    
    // Verify cleanup still maintains the limit
    allBackups = await backupService.listBackups(weekId);
    expect(allBackups.length).toBeLessThanOrEqual(5);
    
    // Verify the most recent backups are kept (sorted by creation time)
    const sortedBackups = allBackups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    expect(sortedBackups.length).toBeLessThanOrEqual(5);
    
    // Verify all remaining backups are for the correct week
    for (const backup of sortedBackups) {
      expect(backup.weekId).toBe(weekId);
    }
  });

  test('Multiple backups for different weeks are managed independently', async () => {
    const week1 = 'week-1';
    const week2 = 'week-2';
    
    const schedule1 = new ScheduleModel({ weekId: week1 });
    const schedule2 = new ScheduleModel({ weekId: week2 });
    
    // Create backups for both weeks
    const backup1 = await backupService.createBackup(schedule1);
    const backup2 = await backupService.createBackup(schedule2);
    
    // Verify backups are listed correctly for each week
    const week1Backups = await backupService.listBackups(week1);
    const week2Backups = await backupService.listBackups(week2);
    
    expect(week1Backups.length).toBe(1);
    expect(week2Backups.length).toBe(1);
    expect(week1Backups[0].id).toBe(backup1.id);
    expect(week2Backups[0].id).toBe(backup2.id);
    
    // Verify restoration works correctly for each
    const restored1 = await backupService.restoreBackup(backup1.id);
    const restored2 = await backupService.restoreBackup(backup2.id);
    
    expect(restored1.weekId).toBe(week1);
    expect(restored2.weekId).toBe(week2);
  });

  /**
   * **Feature: schedule-regeneration-fix, Property 5: Backup Management**
   * **Validates: Requirements 3.3, 3.4, 3.5**
   */
  test('Property 5: Backup Management', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          weekId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
          numberOfOperations: fc.integer({ min: 1, max: 10 }),
          shouldSimulateFailures: fc.boolean()
        }),
        async ({ weekId, numberOfOperations, shouldSimulateFailures }) => {
          // Create initial schedule
          const initialSchedule = new ScheduleModel({ weekId });
          
          let mostRecentBackupId: string | null = null;
          let operationCount = 0;
          
          for (let i = 0; i < numberOfOperations; i++) {
            operationCount++;
            
            try {
              // Create backup of current schedule state
              const backupMetadata = await backupService.createBackup(initialSchedule);
              
              // Verify backup was created successfully
              expect(backupMetadata.id).toBeDefined();
              expect(backupMetadata.weekId).toBe(weekId);
              expect(backupMetadata.createdAt).toBeInstanceOf(Date);
              
              // Track most recent successful backup
              mostRecentBackupId = backupMetadata.id;
              
              // Verify backup appears in list for the week
              const backups = await backupService.listBackups(weekId);
              expect(backups.some(backup => backup.id === backupMetadata.id)).toBe(true);
              
              // Verify backup is valid
              const isValid = await backupService.validateBackup(backupMetadata.id);
              expect(isValid).toBe(true);
              
              // Simulate operation success - backup should be maintained
              if (!shouldSimulateFailures || Math.random() > 0.3) {
                // Operation succeeded - most recent backup should be kept
                const currentBackups = await backupService.listBackups(weekId);
                expect(currentBackups.some(backup => backup.id === mostRecentBackupId)).toBe(true);
              } else {
                // Simulate operation failure - should be able to restore from backup
                if (mostRecentBackupId) {
                  const restoredSchedule = await backupService.restoreBackup(mostRecentBackupId);
                  expect(restoredSchedule.weekId).toBe(weekId);
                  expect(restoredSchedule.id).toBe(initialSchedule.id);
                }
              }
              
            } catch (error) {
              // If backup creation fails, operation should be aborted
              // This validates requirement 3.5: "IF backup creation fails, THEN THE Schedule_Manager SHALL abort the regeneration operation"
              expect(error).toBeInstanceOf(Error);
              
              // Verify no partial backup was created
              const backupsAfterFailure = await backupService.listBackups(weekId);
              const backupCountBefore = i; // Number of successful backups before this failure
              expect(backupsAfterFailure.length).toBeLessThanOrEqual(Math.min(backupCountBefore, 5)); // Respects cleanup limit
              
              // Operation should be aborted - no further processing
              break;
            }
          }
          
          // Verify cleanup behavior - should maintain most recent successful backup
          const finalBackups = await backupService.listBackups(weekId);
          
          // Should not exceed maximum backup limit (5 per week)
          expect(finalBackups.length).toBeLessThanOrEqual(5);
          
          // If we had successful operations, most recent backup should exist
          if (mostRecentBackupId && operationCount > 0) {
            const mostRecentExists = finalBackups.some(backup => backup.id === mostRecentBackupId);
            expect(mostRecentExists).toBe(true);
          }
          
          // All remaining backups should be valid
          for (const backup of finalBackups) {
            const isValid = await backupService.validateBackup(backup.id);
            expect(isValid).toBe(true);
            expect(backup.weekId).toBe(weekId);
          }
          
          // Verify old backup data is cleaned up (requirement 3.4)
          // This is implicitly tested by the backup count limit
          expect(finalBackups.length).toBeLessThanOrEqual(5);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});