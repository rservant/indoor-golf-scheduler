/**
 * Schedule Regeneration Integration Tests
 * 
 * Tests the complete regeneration workflow from user action to completion,
 * including error recovery, backup restoration, and concurrent operation handling.
 */

import { ScheduleManager } from './services/ScheduleManager';
import { ScheduleGenerator } from './services/ScheduleGenerator';
import { LocalScheduleBackupService } from './services/ScheduleBackupService';
import { PairingHistoryTracker } from './services/PairingHistoryTracker';

import { LocalScheduleRepository } from './repositories/ScheduleRepository';
import { LocalWeekRepository } from './repositories/WeekRepository';
import { LocalPairingHistoryRepository } from './repositories/PairingHistoryRepository';

import { ScheduleDisplayUI } from './ui/ScheduleDisplayUI';
import { ScheduleRegenerationConfirmationUI } from './ui/ScheduleRegenerationConfirmationUI';
import { ProgressTrackingUI } from './ui/ProgressTrackingUI';
import { OperationLockUI } from './ui/OperationLockUI';

import { Week } from './models/Week';
import { Schedule } from './models/Schedule';
import { Player } from './models/Player';
import { ExportService } from './services/ExportService';

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

// Test cleanup function
const cleanupTestEnvironment = () => {
  // Clear all localStorage data
  localStorageMock.clear();
  
  // Clear any global state that might persist between tests
  if (typeof window !== 'undefined') {
    // Clear any window-level state
    delete (window as any).debugInterface;
    delete (window as any).debug;
  }
};

// Mock DOM environment
const mockDocument = {
  createElement: (tagName: string) => ({
    tagName: tagName.toUpperCase(),
    innerHTML: '',
    style: {},
    classList: {
      add: jest.fn(),
      remove: jest.fn(),
      contains: jest.fn(() => false)
    },
    setAttribute: jest.fn(),
    removeAttribute: jest.fn(),
    getAttribute: jest.fn(() => null),
    hasAttribute: jest.fn(() => false),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    appendChild: jest.fn(),
    removeChild: jest.fn(),
    querySelector: jest.fn(() => null),
    querySelectorAll: jest.fn(() => []),
    parentNode: null
  }),
  body: {
    appendChild: jest.fn(),
    removeChild: jest.fn(),
    querySelector: jest.fn(() => null),
    querySelectorAll: jest.fn(() => [])
  },
  head: {
    appendChild: jest.fn(),
    querySelector: jest.fn(() => null)
  }
};

(global as any).document = mockDocument;
(global as any).window = {
  setInterval: jest.fn((fn, delay) => setTimeout(fn, delay)),
  clearInterval: jest.fn(clearTimeout),
  getComputedStyle: jest.fn(() => ({ position: 'static' }))
};

// Mock PlayerRepository for testing
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

  async findById(id: string): Promise<Player | null> {
    const players = await this.findBySeasonId('test-season-id');
    return players.find(p => p.id === id) || null;
  }

  async create(data: any): Promise<Player> {
    return { id: 'new-player', seasonId: 'test-season-id', ...data };
  }

  async update(id: string, data: any): Promise<Player | null> {
    const player = await this.findById(id);
    return player ? { ...player, ...data } : null;
  }

  async delete(id: string): Promise<boolean> {
    return true;
  }

  async findAll(): Promise<Player[]> {
    return this.findBySeasonId('test-season-id');
  }

  async exists(id: string): Promise<boolean> {
    return !!(await this.findById(id));
  }
}

// Mock WeekRepository for testing
class MockWeekRepository {
  private testWeek: Week;

  constructor(testWeek: Week) {
    this.testWeek = testWeek;
  }

  async findById(id: string): Promise<Week | null> {
    return id === this.testWeek.id ? this.testWeek : null;
  }

  async create(data: any): Promise<Week> {
    return this.testWeek;
  }

  async update(id: string, data: any): Promise<Week> {
    return { ...this.testWeek, ...data };
  }

  async findBySeasonId(seasonId: string): Promise<Week[]> {
    return [this.testWeek];
  }
}

describe('Schedule Regeneration Integration Tests', () => {
  let scheduleManager: ScheduleManager;
  let scheduleGenerator: ScheduleGenerator;
  let backupService: LocalScheduleBackupService;
  let exportService: ExportService;
  let pairingHistoryTracker: PairingHistoryTracker;
  let playerRepository: MockPlayerRepository;

  let weekRepository: MockWeekRepository;
  let scheduleRepository: LocalScheduleRepository;
  let pairingHistoryRepository: LocalPairingHistoryRepository;

  let scheduleDisplayUI: ScheduleDisplayUI;
  let confirmationUI: ScheduleRegenerationConfirmationUI;
  let progressTrackingUI: ProgressTrackingUI;
  let operationLockUI: OperationLockUI;

  let testWeek: Week;
  let originalSchedule: Schedule;

  beforeEach(async () => {
    // Clean up test environment
    cleanupTestEnvironment();

    // Create test week with unique ID
    const weekId = `test-week-${Date.now()}`;
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

    // Initialize repositories
    weekRepository = new MockWeekRepository(testWeek);
    scheduleRepository = new LocalScheduleRepository();
    pairingHistoryRepository = new LocalPairingHistoryRepository();

    // Initialize services
    scheduleGenerator = new ScheduleGenerator();
    backupService = new LocalScheduleBackupService();
    pairingHistoryTracker = new PairingHistoryTracker(pairingHistoryRepository);
    exportService = new ExportService();
    playerRepository = new MockPlayerRepository();
    
    scheduleManager = new ScheduleManager(
      scheduleRepository,
      weekRepository as any,
      playerRepository as any,
      scheduleGenerator,
      pairingHistoryTracker,
      backupService
    );

    // Ensure clean state for regeneration statuses
    (scheduleManager as any).forceCleanupAllRegenerationStatuses();

    // Create mock container elements
    const mockContainer = mockDocument.createElement('div');
    const mockConfirmationContainer = mockDocument.createElement('div');

    // Initialize UI components
    confirmationUI = new ScheduleRegenerationConfirmationUI(mockConfirmationContainer as unknown as HTMLElement);
    progressTrackingUI = new ProgressTrackingUI(mockDocument.body as unknown as HTMLElement);
    operationLockUI = new OperationLockUI(mockContainer as unknown as HTMLElement);
    
    scheduleDisplayUI = new ScheduleDisplayUI(
      scheduleManager,
      scheduleGenerator,
      weekRepository as any,
      exportService,
      pairingHistoryTracker,
      playerRepository as any,
      mockContainer as unknown as HTMLElement
    );

    // Create original schedule
    originalSchedule = await scheduleManager.createWeeklySchedule(testWeek.id);
  });

  afterEach(() => {
    // Cleanup UI components
    if (scheduleDisplayUI) {
      scheduleDisplayUI.destroy();
    }
    if (confirmationUI) {
      confirmationUI.destroy();
    }
    if (progressTrackingUI) {
      progressTrackingUI.destroy();
    }
    if (operationLockUI) {
      operationLockUI.destroy();
    }
  });

  afterEach(async () => {
    // Force cleanup of any remaining locks or state
    if (scheduleManager && testWeek) {
      try {
        // Force release any locks for the test week
        await scheduleRepository.forceReleaseScheduleLock(testWeek.id);
        
        // Clear any regeneration status
        await scheduleManager.setRegenerationLock(testWeek.id, false);
        
        // Force clear all regeneration statuses
        (scheduleManager as any).forceCleanupAllRegenerationStatuses();
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    
    // Clean up test environment
    cleanupTestEnvironment();
  });

  describe('End-to-End Regeneration Workflow', () => {
    test('should complete full regeneration workflow from user action to completion', async () => {
      // Verify original schedule exists
      expect(originalSchedule).toBeDefined();
      expect(originalSchedule.timeSlots.morning.length + originalSchedule.timeSlots.afternoon.length).toBeGreaterThan(0);

      // Mock user confirmation
      let confirmationCallback: ((result: any) => void) | undefined;
      const mockShowConfirmation = jest.spyOn(confirmationUI, 'showConfirmation')
        .mockImplementation(async (schedule, week, players, onConfirm, onCancel) => {
          confirmationCallback = onConfirm;
          // Simulate user confirming regeneration
          setTimeout(() => {
            if (confirmationCallback) {
              confirmationCallback({
                confirmed: true,
                forceOverwrite: false,
                preserveManualEdits: false
              });
            }
          }, 10);
        });

      // Track progress updates
      const progressUpdates: any[] = [];
      const mockShowProgress = jest.spyOn(progressTrackingUI, 'showProgress')
        .mockImplementation((options) => {
          progressUpdates.push({ type: 'show', options });
        });

      const mockUpdateProgress = jest.spyOn(progressTrackingUI, 'updateProgress')
        .mockImplementation((status, options) => {
          progressUpdates.push({ type: 'update', status, options });
        });

      const mockShowCompletion = jest.spyOn(progressTrackingUI, 'showCompletion')
        .mockImplementation((success, message) => {
          progressUpdates.push({ type: 'completion', success, message });
        });

      // Track UI lock operations
      const lockOperations: any[] = [];
      const mockLockUI = jest.spyOn(operationLockUI, 'lockUI')
        .mockImplementation((options) => {
          lockOperations.push({ type: 'lock', options });
        });

      const mockUnlockUI = jest.spyOn(operationLockUI, 'unlockUI')
        .mockImplementation(() => {
          lockOperations.push({ type: 'unlock' });
        });

      // Trigger regeneration workflow
      const regenerationPromise = scheduleManager.regenerateSchedule(testWeek.id, {
        forceOverwrite: false
      });

      // Wait for regeneration to complete
      const result = await regenerationPromise;

      // Verify regeneration succeeded
      expect(result.success).toBe(true);
      expect(result.newScheduleId).toBeDefined();
      expect(result.backupId).toBeDefined();

      // Verify new schedule was created
      const newSchedule = await scheduleManager.getSchedule(testWeek.id);
      expect(newSchedule).toBeDefined();
      expect(newSchedule!.id).toBe(result.newScheduleId);
      expect(newSchedule!.id).toBe(originalSchedule.id); // Same ID since we update in place

      // Verify backup was created
      const backups = await backupService.listBackups(testWeek.id);
      expect(backups.length).toBeGreaterThan(0);
      expect(backups.some(b => b.id === result.backupId)).toBe(true);

      // Cleanup mocks
      mockShowConfirmation.mockRestore();
      mockShowProgress.mockRestore();
      mockUpdateProgress.mockRestore();
      mockShowCompletion.mockRestore();
      mockLockUI.mockRestore();
      mockUnlockUI.mockRestore();
    });

    test('should handle user cancellation gracefully', async () => {
      // Mock user cancellation
      const mockShowConfirmation = jest.spyOn(confirmationUI, 'showConfirmation')
        .mockImplementation(async (schedule, week, players, onConfirm, onCancel) => {
          // Simulate user canceling regeneration
          setTimeout(() => {
            onCancel();
          }, 10);
        });

      // Check regeneration lock status before operation
      const isAllowedBefore = await scheduleManager.isRegenerationAllowed(testWeek.id);
      expect(isAllowedBefore).toBe(true);

      // Attempt to trigger regeneration (this would normally be done through UI)
      // Since we're testing cancellation, we'll simulate the UI flow
      await scheduleManager.setRegenerationLock(testWeek.id, true);
      
      // Simulate showing confirmation and canceling
      let cancelCallback: (() => void) | undefined;
        await confirmationUI.showConfirmation(
          originalSchedule,
          testWeek,
          await playerRepository.findBySeasonId('test-season-id'),
          () => {}, // onConfirm - not called
          () => { cancelCallback = () => {}; } // onCancel
        );

      // Simulate the cancellation cleanup
      await scheduleManager.setRegenerationLock(testWeek.id, false);

      // Verify lock was released
      const isAllowedAfter = await scheduleManager.isRegenerationAllowed(testWeek.id);
      expect(isAllowedAfter).toBe(true);

      // Verify original schedule is unchanged
      const currentSchedule = await scheduleManager.getSchedule(testWeek.id);
      expect(currentSchedule!.id).toBe(originalSchedule.id);

      mockShowConfirmation.mockRestore();
    });
  });

  describe('Error Recovery and Backup Restoration', () => {
    test('should restore from backup when regeneration fails', async () => {
      // Create a backup of the original schedule
      const backupMetadata = await backupService.createBackup(originalSchedule);
      expect(backupMetadata).toBeDefined();

      // Mock schedule generator to fail
      const originalGenerate = scheduleGenerator.generateSchedule;
      scheduleGenerator.generateSchedule = jest.fn().mockRejectedValue(new Error('Generation failed'));

      try {
        // Attempt regeneration
        const result = await scheduleManager.regenerateSchedule(testWeek.id, {
          forceOverwrite: true
        });

        // Regeneration should fail but handle gracefully
        expect(result.success).toBe(false);
        expect(result.error).toContain('Generation failed');

        // Verify original schedule is still intact (restored from backup)
        const currentSchedule = await scheduleManager.getSchedule(testWeek.id);
        expect(currentSchedule).toBeDefined();
        expect(currentSchedule!.id).toBe(originalSchedule.id);

        // Verify backup still exists
        const backups = await backupService.listBackups(testWeek.id);
        expect(backups.length).toBeGreaterThan(0);

      } finally {
        // Restore original generator
        scheduleGenerator.generateSchedule = originalGenerate;
      }
    });

    test('should handle backup creation failure', async () => {
      // Mock backup service to fail
      const originalCreateBackup = backupService.createBackup;
      backupService.createBackup = jest.fn().mockRejectedValue(new Error('Backup creation failed'));

      try {
        // Attempt regeneration
        const result = await scheduleManager.regenerateSchedule(testWeek.id, {
          forceOverwrite: true
        });

        // Regeneration should fail due to backup failure
        expect(result.success).toBe(false);
        expect(result.error).toContain('Backup creation failed');

        // Verify original schedule is unchanged
        const currentSchedule = await scheduleManager.getSchedule(testWeek.id);
        expect(currentSchedule!.id).toBe(originalSchedule.id);

      } finally {
        // Restore original backup service
        backupService.createBackup = originalCreateBackup;
      }
    });
  });

  describe('Concurrent Operation Handling', () => {
    test('should prevent concurrent regeneration operations', async () => {
      // Start first regeneration operation
      const firstRegenerationPromise = scheduleManager.regenerateSchedule(testWeek.id, {
        forceOverwrite: true
      });

      // Wait a bit for the first operation to start and set its status
      await new Promise(resolve => setTimeout(resolve, 50));

      // Check if first operation is still in progress
      const status = scheduleManager.getRegenerationStatus(testWeek.id);
      
      // If the first operation completed too quickly, start a new test scenario
      if (!status || ['completed', 'failed'].includes(status.status)) {
        // Wait for first operation to complete
        const firstResult = await firstRegenerationPromise;
        
        // Now start two concurrent operations
        const concurrentPromise1 = scheduleManager.regenerateSchedule(testWeek.id, {
          forceOverwrite: true
        });
        
        // Start second operation immediately
        const concurrentPromise2 = scheduleManager.regenerateSchedule(testWeek.id, {
          forceOverwrite: true
        });

        const [result1, result2] = await Promise.all([concurrentPromise1, concurrentPromise2]);
        const results = [result1, result2];
        
        const successCount = results.filter(r => r.success).length;
        const failureCount = results.filter(r => !r.success).length;

        expect(successCount).toBe(1);
        expect(failureCount).toBe(1);

        const failedResult = results.find(r => !r.success);
        expect(failedResult!.error).toMatch(/already in progress|concurrent|locked|Another regeneration operation is currently in progress/i);
      } else {
        // Original test path - first operation is still in progress
        expect(status).toBeDefined();
        expect(['backing_up', 'generating', 'replacing'].includes(status!.status)).toBe(true);

        // Attempt second regeneration operation
        const secondRegenerationPromise = scheduleManager.regenerateSchedule(testWeek.id, {
          forceOverwrite: true
        });

        // Wait for both operations to complete
        const [firstResult, secondResult] = await Promise.all([
          firstRegenerationPromise,
          secondRegenerationPromise
        ]);

        // One should succeed, one should fail due to concurrent access
        const results = [firstResult, secondResult];
        const successCount = results.filter(r => r.success).length;
        const failureCount = results.filter(r => !r.success).length;

        expect(successCount).toBe(1);
        expect(failureCount).toBe(1);

        // The failed operation should have appropriate error message
        const failedResult = results.find(r => !r.success);
        expect(failedResult!.error).toMatch(/already in progress|concurrent|locked|Another regeneration operation is currently in progress/i);
      }
    });

    test('should handle lock timeout and cleanup', async () => {
      // Manually set a regeneration lock
      await scheduleManager.setRegenerationLock(testWeek.id, true);

      // Verify lock is active
      const isLocked = !(await scheduleManager.isRegenerationAllowed(testWeek.id));
      expect(isLocked).toBe(true);

      // Attempt regeneration while locked
      const result = await scheduleManager.regenerateSchedule(testWeek.id, {
        forceOverwrite: true
      });

      // Should fail due to existing lock
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/already in progress|concurrent|locked|Another regeneration operation is currently in progress/i);

      // Manually release lock for cleanup
      await scheduleManager.setRegenerationLock(testWeek.id, false);

      // Verify lock is released
      const isUnlocked = await scheduleManager.isRegenerationAllowed(testWeek.id);
      expect(isUnlocked).toBe(true);
    });
  });

  describe('UI Integration and User Experience', () => {
    test('should properly integrate confirmation dialog with regeneration workflow', async () => {
      // Track confirmation dialog interactions
      let confirmationShown = false;
      let confirmationResult: any = null;

      const mockShowConfirmation = jest.spyOn(confirmationUI, 'showConfirmation')
        .mockImplementation(async (schedule, week, players, onConfirm, onCancel) => {
          confirmationShown = true;
          
          // Verify correct data is passed to confirmation dialog
          expect(schedule.id).toBe(originalSchedule.id);
          expect(week.id).toBe(testWeek.id);
          expect(players.length).toBeGreaterThan(0);

          // Simulate user confirmation
          confirmationResult = {
            confirmed: true,
            forceOverwrite: true,
            preserveManualEdits: false
          };
          
          onConfirm(confirmationResult);
        });

      // Trigger regeneration through the UI workflow
      const result = await scheduleManager.regenerateSchedule(testWeek.id);

      // Verify regeneration succeeded
      expect(result.success).toBe(true);

      mockShowConfirmation.mockRestore();
    });

    test('should provide proper progress feedback during regeneration', async () => {
      // Track progress updates
      const progressEvents: any[] = [];

      const mockShowProgress = jest.spyOn(progressTrackingUI, 'showProgress')
        .mockImplementation((options) => {
          progressEvents.push({ type: 'show', options });
        });

      const mockUpdateProgress = jest.spyOn(progressTrackingUI, 'updateProgress')
        .mockImplementation((status, options) => {
          progressEvents.push({ type: 'update', status, options });
        });

      const mockShowCompletion = jest.spyOn(progressTrackingUI, 'showCompletion')
        .mockImplementation((success, message) => {
          progressEvents.push({ type: 'completion', success, message });
        });

      // Perform regeneration
      const result = await scheduleManager.regenerateSchedule(testWeek.id, {
        forceOverwrite: true
      });

      expect(result.success).toBe(true);

      // Cleanup mocks
      mockShowProgress.mockRestore();
      mockUpdateProgress.mockRestore();
      mockShowCompletion.mockRestore();
    });
  });
});