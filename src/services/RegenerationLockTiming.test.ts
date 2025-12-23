/**
 * Regeneration Lock Timing Fix Tests
 * 
 * Tests to verify that the regeneration lock timing bug is fixed.
 * The bug was that locks were set before user confirmation, causing
 * stuck locks if the confirmation dialog failed.
 */

import { ScheduleManager } from './ScheduleManager';
import { ScheduleGenerator } from './ScheduleGenerator';
import { LocalScheduleBackupService } from './ScheduleBackupService';
import { PairingHistoryTracker } from './PairingHistoryTracker';
import { LocalScheduleRepository } from '../repositories/ScheduleRepository';
import { LocalWeekRepository } from '../repositories/WeekRepository';
import { LocalPairingHistoryRepository } from '../repositories/PairingHistoryRepository';
import { Week } from '../models/Week';
import { Schedule } from '../models/Schedule';
import { Player } from '../models/Player';

// Mock localStorage for testing
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value.toString(); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();
(global as any).localStorage = localStorageMock;

// Mock PlayerRepository
class MockPlayerRepository {
  async findBySeasonId(seasonId: string): Promise<Player[]> {
    const now = new Date();
    return [
      { id: '1', firstName: 'Player1', lastName: 'Test', handedness: 'right', timePreference: 'AM', seasonId, createdAt: now },
      { id: '2', firstName: 'Player2', lastName: 'Test', handedness: 'left', timePreference: 'PM', seasonId, createdAt: now },
      { id: '3', firstName: 'Player3', lastName: 'Test', handedness: 'right', timePreference: 'Either', seasonId, createdAt: now },
      { id: '4', firstName: 'Player4', lastName: 'Test', handedness: 'left', timePreference: 'AM', seasonId, createdAt: now }
    ];
  }
}

// Mock WeekRepository
class MockWeekRepository {
  private testWeek: Week;
  
  constructor(testWeek: Week) {
    this.testWeek = testWeek;
  }
  
  async findById(id: string): Promise<Week | null> {
    return id === this.testWeek.id ? this.testWeek : null;
  }

  async update(id: string, data: any): Promise<Week> {
    return { ...this.testWeek, ...data };
  }

  async create(data: any): Promise<Week> {
    return this.testWeek;
  }

  async findBySeasonId(seasonId: string): Promise<Week[]> {
    return [this.testWeek];
  }
}

describe('Regeneration Lock Timing Fix', () => {
  let scheduleManager: ScheduleManager;
  let scheduleGenerator: ScheduleGenerator;
  let backupService: LocalScheduleBackupService;
  let pairingHistoryTracker: PairingHistoryTracker;
  let playerRepository: MockPlayerRepository;
  let weekRepository: MockWeekRepository;
  let scheduleRepository: LocalScheduleRepository;
  let pairingHistoryRepository: LocalPairingHistoryRepository;
  let testWeek: Week;
  let originalSchedule: Schedule;

  beforeEach(async () => {
    // Clear localStorage
    localStorageMock.clear();

    // Create test week with unique ID for each test
    const weekId = `test-week-${Date.now()}-${Math.random()}`;
    testWeek = {
      id: weekId,
      seasonId: 'test-season-id',
      weekNumber: 1,
      date: new Date('2024-01-08'),
      playerAvailability: {
        '1': true,
        '2': true,
        '3': true,
        '4': true
      }
    };

    // Initialize repositories and services
    weekRepository = new MockWeekRepository(testWeek);
    scheduleRepository = new LocalScheduleRepository();
    pairingHistoryRepository = new LocalPairingHistoryRepository();
    scheduleGenerator = new ScheduleGenerator();
    backupService = new LocalScheduleBackupService();
    pairingHistoryTracker = new PairingHistoryTracker(pairingHistoryRepository);
    playerRepository = new MockPlayerRepository();
    
    scheduleManager = new ScheduleManager(
      scheduleRepository,
      weekRepository as any,
      playerRepository as any,
      scheduleGenerator,
      pairingHistoryTracker,
      backupService
    );

    // Ensure clean state
    (scheduleManager as any).forceCleanupAllRegenerationStatuses();

    // Create original schedule
    originalSchedule = await scheduleManager.createWeeklySchedule(testWeek.id);
  });

  afterEach(async () => {
    // Force cleanup
    if (scheduleManager && testWeek) {
      try {
        await scheduleRepository.forceReleaseScheduleLock(testWeek.id);
        await scheduleManager.setRegenerationLock(testWeek.id, false);
        (scheduleManager as any).forceCleanupAllRegenerationStatuses();
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    localStorageMock.clear();
  });

  test('should not set lock before user confirmation', async () => {
    // Verify no lock is set initially
    const isAllowedBefore = await scheduleManager.isRegenerationAllowed(testWeek.id);
    expect(isAllowedBefore).toBe(true);

    // Check that no regeneration status exists
    const statusBefore = scheduleManager.getRegenerationStatus(testWeek.id);
    expect(statusBefore).toBeNull();

    // The UI should check if regeneration is allowed without setting a lock
    // This simulates the new behavior where we check but don't lock
    const isStillAllowed = await scheduleManager.isRegenerationAllowed(testWeek.id);
    expect(isStillAllowed).toBe(true);

    // Verify still no lock is set
    const statusAfterCheck = scheduleManager.getRegenerationStatus(testWeek.id);
    expect(statusAfterCheck).toBeNull();
  });

  test('should set lock only after user confirms regeneration', async () => {
    // Verify no lock initially
    const isAllowedBefore = await scheduleManager.isRegenerationAllowed(testWeek.id);
    expect(isAllowedBefore).toBe(true);

    // Simulate user confirming regeneration (this is where lock should be set)
    await scheduleManager.setRegenerationLock(testWeek.id, true);

    // Now lock should be set
    const isAllowedAfterLock = await scheduleManager.isRegenerationAllowed(testWeek.id);
    expect(isAllowedAfterLock).toBe(false);

    // Verify regeneration status is set
    const statusAfterLock = scheduleManager.getRegenerationStatus(testWeek.id);
    expect(statusAfterLock).not.toBeNull();
    expect(statusAfterLock!.status).toBe('confirming');

    // Clean up
    await scheduleManager.setRegenerationLock(testWeek.id, false);
  });

  test('should properly clear lock on cancellation', async () => {
    // Set lock (simulating user confirmation)
    await scheduleManager.setRegenerationLock(testWeek.id, true);
    
    // Verify lock is set
    const isLockedAfterSet = await scheduleManager.isRegenerationAllowed(testWeek.id);
    expect(isLockedAfterSet).toBe(false);

    // Clear lock (simulating cancellation or completion)
    await scheduleManager.setRegenerationLock(testWeek.id, false);

    // Verify lock is cleared
    const isAllowedAfterClear = await scheduleManager.isRegenerationAllowed(testWeek.id);
    expect(isAllowedAfterClear).toBe(true);

    // Verify status is cleared
    const statusAfterClear = scheduleManager.getRegenerationStatus(testWeek.id);
    expect(statusAfterClear).toBeNull();
  });

  test('should handle errors in lock clearing gracefully', async () => {
    // Set lock
    await scheduleManager.setRegenerationLock(testWeek.id, true);
    
    // Verify lock is set
    const isLocked = await scheduleManager.isRegenerationAllowed(testWeek.id);
    expect(isLocked).toBe(false);

    // Force clear using emergency method
    await scheduleManager.forceReleaseRegenerationLock(testWeek.id);

    // Verify lock is cleared
    const isAllowedAfterForceRelease = await scheduleManager.isRegenerationAllowed(testWeek.id);
    expect(isAllowedAfterForceRelease).toBe(true);
  });

  test('should prevent concurrent regeneration attempts', async () => {
    // Start first regeneration (set lock)
    await scheduleManager.setRegenerationLock(testWeek.id, true);

    // Attempt second regeneration
    const result = await scheduleManager.regenerateSchedule(testWeek.id, {
      forceOverwrite: true
    });

    // Should fail due to existing lock
    expect(result.success).toBe(false);
    expect(result.error).toContain('Another regeneration operation is currently in progress');

    // Clean up
    await scheduleManager.setRegenerationLock(testWeek.id, false);
  });

  test('should allow regeneration after proper lock cleanup', async () => {
    // Set and then clear lock
    await scheduleManager.setRegenerationLock(testWeek.id, true);
    await scheduleManager.setRegenerationLock(testWeek.id, false);

    // Verify regeneration is allowed
    const isAllowed = await scheduleManager.isRegenerationAllowed(testWeek.id);
    expect(isAllowed).toBe(true);

    // Attempt regeneration - should succeed
    const result = await scheduleManager.regenerateSchedule(testWeek.id, {
      forceOverwrite: true
    });

    // Should succeed (or fail for other reasons, but not due to lock)
    if (!result.success) {
      // If it fails, it should not be due to concurrent operation
      expect(result.error).not.toContain('Another regeneration operation is currently in progress');
    }
  });
});