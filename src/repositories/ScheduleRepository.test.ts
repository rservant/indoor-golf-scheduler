import * as fc from 'fast-check';
import { LocalScheduleRepository, ScheduleStatus } from './ScheduleRepository';
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

const weekIdArb = fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0);

describe('ScheduleRepository Atomic Operations Property Tests', () => {
  let repository: LocalScheduleRepository;

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    repository = new LocalScheduleRepository();
  });

  /**
   * **Feature: schedule-regeneration-fix, Property 3: Atomic Schedule Replacement**
   * **Validates: Requirements 1.3, 1.5, 4.4**
   */
  test('Property 3: Atomic Schedule Replacement', async () => {
    await fc.assert(
      fc.asyncProperty(
        validScheduleArb,
        validScheduleArb,
        fc.string({ minLength: 1, maxLength: 20 }),
        async (originalSchedule, newSchedule, backupId) => {
          // Use a unique weekId for this test run to avoid conflicts
          const weekId = `test-week-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
          
          // Create new schedule instances with the unique weekId
          const originalWithUniqueWeek = new ScheduleModel({
            ...originalSchedule,
            weekId: weekId
          });
          
          const updatedNewSchedule = new ScheduleModel({
            ...newSchedule,
            weekId: weekId
          });

          // Create the original schedule
          await repository.create({ weekId });
          
          // Verify schedule exists
          const existingSchedule = await repository.findByWeekId(weekId);
          expect(existingSchedule).not.toBeNull();
          const originalLastModified = existingSchedule!.lastModified;

          // Acquire lock for atomic operation
          const lockId = await repository.acquireScheduleLock(weekId);
          expect(lockId).not.toBeNull();

          // Verify schedule is locked
          const isLocked = await repository.isScheduleLocked(weekId);
          expect(isLocked).toBe(true);

          // Get status before replacement
          const statusBefore = await repository.getScheduleStatus(weekId);
          const originalRegenerationCount = statusBefore.regenerationCount;

          // Add a small delay to ensure timestamp difference
          await new Promise(resolve => setTimeout(resolve, 1));

          // Perform atomic replacement
          await repository.replaceScheduleAtomic(weekId, updatedNewSchedule, backupId);

          // Verify the schedule was replaced atomically
          const replacedSchedule = await repository.findByWeekId(weekId);
          expect(replacedSchedule).not.toBeNull();
          
          // Verify the schedule content matches the new schedule
          expect(replacedSchedule!.weekId).toBe(weekId);
          expect(replacedSchedule!.timeSlots.morning.length).toBe(updatedNewSchedule.timeSlots.morning.length);
          expect(replacedSchedule!.timeSlots.afternoon.length).toBe(updatedNewSchedule.timeSlots.afternoon.length);
          
          // Verify last modified timestamp was updated (Requirement 1.5)
          expect(replacedSchedule!.lastModified.getTime()).toBeGreaterThan(originalLastModified.getTime());

          // Verify schedule status was updated correctly
          const statusAfter = await repository.getScheduleStatus(weekId);
          expect(statusAfter.exists).toBe(true);
          expect(statusAfter.lastModified.getTime()).toBe(replacedSchedule!.lastModified.getTime());
          expect(statusAfter.regenerationCount).toBe(originalRegenerationCount + 1);

          // Verify foursomes are correctly structured
          for (let i = 0; i < updatedNewSchedule.timeSlots.morning.length; i++) {
            const originalFoursome = updatedNewSchedule.timeSlots.morning[i];
            const replacedFoursome = replacedSchedule!.timeSlots.morning[i];
            
            expect(replacedFoursome.timeSlot).toBe('morning');
            expect(replacedFoursome.players.length).toBe(originalFoursome.players.length);
          }

          for (let i = 0; i < updatedNewSchedule.timeSlots.afternoon.length; i++) {
            const originalFoursome = updatedNewSchedule.timeSlots.afternoon[i];
            const replacedFoursome = replacedSchedule!.timeSlots.afternoon[i];
            
            expect(replacedFoursome.timeSlot).toBe('afternoon');
            expect(replacedFoursome.players.length).toBe(originalFoursome.players.length);
          }

          // Clean up: release the lock
          await repository.releaseScheduleLock(weekId, lockId!);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Atomic replacement fails when schedule is not locked', async () => {
    await fc.assert(
      fc.asyncProperty(
        validScheduleArb,
        validScheduleArb,
        fc.string({ minLength: 1, maxLength: 20 }),
        async (originalSchedule, newSchedule, backupId) => {
          // Use a unique weekId for this test run to avoid conflicts
          const weekId = `test-week-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
          
          const updatedNewSchedule = new ScheduleModel({
            ...newSchedule,
            weekId: weekId
          });

          // Create the original schedule
          await repository.create({ weekId });

          // Verify schedule is not locked
          const isLocked = await repository.isScheduleLocked(weekId);
          expect(isLocked).toBe(false);

          // Attempt atomic replacement without lock should fail
          await expect(
            repository.replaceScheduleAtomic(weekId, updatedNewSchedule, backupId)
          ).rejects.toThrow('Cannot replace schedule for week');

          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  test('Schedule locking prevents concurrent modifications', async () => {
    await fc.assert(
      fc.asyncProperty(
        weekIdArb,
        fc.integer({ min: 1000, max: 60000 }),
        async (baseWeekId, timeout) => {
          // Use a unique weekId for this test run to avoid conflicts
          const weekId = `${baseWeekId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
          
          // Acquire first lock
          const lockId1 = await repository.acquireScheduleLock(weekId, timeout);
          expect(lockId1).not.toBeNull();

          // Verify schedule is locked
          expect(await repository.isScheduleLocked(weekId)).toBe(true);

          // Attempt to acquire second lock should fail
          const lockId2 = await repository.acquireScheduleLock(weekId, timeout);
          expect(lockId2).toBeNull();

          // Release first lock
          const released = await repository.releaseScheduleLock(weekId, lockId1!);
          expect(released).toBe(true);

          // Verify schedule is no longer locked
          expect(await repository.isScheduleLocked(weekId)).toBe(false);

          // Now should be able to acquire new lock
          const lockId3 = await repository.acquireScheduleLock(weekId, timeout);
          expect(lockId3).not.toBeNull();

          // Clean up
          await repository.releaseScheduleLock(weekId, lockId3!);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Schedule status tracking works correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        weekIdArb,
        async (baseWeekId) => {
          // Use a unique weekId for this test run to avoid conflicts
          const weekId = `${baseWeekId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
          
          // Initially, status should indicate schedule doesn't exist
          const initialStatus = await repository.getScheduleStatus(weekId);
          expect(initialStatus.weekId).toBe(weekId);
          expect(initialStatus.exists).toBe(false);
          expect(initialStatus.locked).toBe(false);
          expect(initialStatus.hasManualEdits).toBe(false);
          expect(initialStatus.regenerationCount).toBe(0);

          // Create a schedule
          await repository.create({ weekId });

          // Status should now indicate schedule exists
          const afterCreateStatus = await repository.getScheduleStatus(weekId);
          expect(afterCreateStatus.exists).toBe(true);
          expect(afterCreateStatus.regenerationCount).toBe(0);
          expect(afterCreateStatus.hasManualEdits).toBe(false);

          // Update the schedule (simulating manual edit)
          const schedule = await repository.findByWeekId(weekId);
          if (schedule) {
            await repository.update(schedule.id, { lastModified: new Date() });

            // Status should indicate manual edits
            const afterUpdateStatus = await repository.getScheduleStatus(weekId);
            expect(afterUpdateStatus.hasManualEdits).toBe(true);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Lock timeout mechanism works correctly', async () => {
    const weekId = `test-week-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const shortTimeout = 100; // 100ms

    // Acquire lock with short timeout
    const lockId = await repository.acquireScheduleLock(weekId, shortTimeout);
    expect(lockId).not.toBeNull();
    expect(await repository.isScheduleLocked(weekId)).toBe(true);

    // Wait for timeout to expire
    await new Promise(resolve => setTimeout(resolve, shortTimeout + 50));

    // Lock should have expired, new lock should be acquirable
    const newLockId = await repository.acquireScheduleLock(weekId, shortTimeout);
    expect(newLockId).not.toBeNull();
    expect(newLockId).not.toBe(lockId);

    // Clean up
    await repository.releaseScheduleLock(weekId, newLockId!);
  });

  test('Releasing non-existent lock returns false', async () => {
    const weekId = `test-week-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const fakeLockId = 'fake-lock-id';

    // Attempt to release non-existent lock
    const result = await repository.releaseScheduleLock(weekId, fakeLockId);
    expect(result).toBe(false);
  });

  test('Schedule status can be partially updated', async () => {
    const weekId = `test-week-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Set initial status
    await repository.setScheduleStatus(weekId, {
      exists: true,
      hasManualEdits: false,
      regenerationCount: 5
    });

    // Partially update status
    await repository.setScheduleStatus(weekId, {
      hasManualEdits: true
    });

    // Verify partial update worked
    const status = await repository.getScheduleStatus(weekId);
    expect(status.exists).toBe(true);
    expect(status.hasManualEdits).toBe(true);
    expect(status.regenerationCount).toBe(5);
  });
});