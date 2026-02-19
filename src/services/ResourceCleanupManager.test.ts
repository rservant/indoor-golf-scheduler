import { ResourceCleanupManager } from './ResourceCleanupManager';

describe('ResourceCleanupManager', () => {
    let manager: ResourceCleanupManager;

    beforeEach(() => {
        manager = new ResourceCleanupManager({
            enableAutomaticCleanup: false, // prevent timers in tests
        });
    });

    afterEach(() => {
        manager.stop();
    });

    describe('registerCleanupTask / unregisterCleanupTask', () => {
        it('registers a task and includes it in the task list', () => {
            manager.registerCleanupTask({
                id: 'task-1',
                name: 'Test cleanup',
                priority: 'low',
                cleanup: jest.fn(),
                estimatedMemoryFreed: 1024,
            });
            const tasks = manager.getCleanupTasks();
            expect(tasks).toHaveLength(1);
            expect(tasks[0].name).toBe('Test cleanup');
        });

        it('unregisters a task', () => {
            manager.registerCleanupTask({
                id: 'task-1',
                name: 'Test cleanup',
                priority: 'low',
                cleanup: jest.fn(),
                estimatedMemoryFreed: 0,
            });
            const removed = manager.unregisterCleanupTask('task-1');
            expect(removed).toBe(true);
            expect(manager.getCleanupTasks()).toHaveLength(0);
        });

        it('returns false when unregistering nonexistent task', () => {
            expect(manager.unregisterCleanupTask('nope')).toBe(false);
        });
    });

    describe('executeCleanup', () => {
        it('executes registered cleanup tasks', async () => {
            const cleanupFn = jest.fn();
            manager.registerCleanupTask({
                id: 'task-1',
                name: 'Test cleanup',
                priority: 'high',
                cleanup: cleanupFn,
                estimatedMemoryFreed: 1024,
            });
            await manager.executeCleanup();
            expect(cleanupFn).toHaveBeenCalled();
        });

        it('executes tasks filtered by priority', async () => {
            const lowFn = jest.fn();
            const highFn = jest.fn();
            manager.registerCleanupTask({
                id: 'low',
                name: 'Low priority',
                priority: 'low',
                cleanup: lowFn,
                estimatedMemoryFreed: 0,
            });
            manager.registerCleanupTask({
                id: 'high',
                name: 'High priority',
                priority: 'high',
                cleanup: highFn,
                estimatedMemoryFreed: 0,
            });
            await manager.executeCleanup('high');
            expect(highFn).toHaveBeenCalled();
        });
    });

    describe('forceCleanup', () => {
        it('executes all tasks regardless of priority', async () => {
            const fn1 = jest.fn();
            const fn2 = jest.fn();
            manager.registerCleanupTask({
                id: 't1',
                name: 'Task 1',
                priority: 'low',
                cleanup: fn1,
                estimatedMemoryFreed: 0,
            });
            manager.registerCleanupTask({
                id: 't2',
                name: 'Task 2',
                priority: 'critical',
                cleanup: fn2,
                estimatedMemoryFreed: 0,
            });
            await manager.forceCleanup();
            expect(fn1).toHaveBeenCalled();
            expect(fn2).toHaveBeenCalled();
        });
    });

    describe('getStats', () => {
        it('returns valid stats structure', () => {
            const stats = manager.getStats();
            expect(stats.totalCleanupTasks).toBeGreaterThanOrEqual(0);
            expect(stats.totalExecutions).toBeGreaterThanOrEqual(0);
            expect(stats.totalMemoryFreed).toBeGreaterThanOrEqual(0);
            expect(typeof stats.lastCleanupTime).toBe('number');
            expect(typeof stats.averageCleanupTime).toBe('number');
            expect(stats.failedCleanups).toBeGreaterThanOrEqual(0);
        });
    });

    describe('start / stop', () => {
        it('starts and stops without errors', () => {
            expect(() => manager.start()).not.toThrow();
            expect(() => manager.stop()).not.toThrow();
        });
    });

    describe('updateConfig', () => {
        it('updates configuration without errors', () => {
            expect(() => manager.updateConfig({ cleanupInterval: 5000 })).not.toThrow();
        });
    });
});
