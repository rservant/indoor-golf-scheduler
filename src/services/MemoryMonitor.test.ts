import { MemoryMonitor } from './MemoryMonitor';

describe('MemoryMonitor', () => {
    let monitor: MemoryMonitor;

    beforeEach(() => {
        monitor = new MemoryMonitor();
    });

    afterEach(() => {
        monitor.stopMonitoring();
        monitor.clearHistory();
    });

    describe('takeSnapshot', () => {
        it('returns a snapshot with valid structure', () => {
            const snapshot = monitor.takeSnapshot();
            expect(snapshot.timestamp).toBeGreaterThan(0);
            expect(snapshot.memoryInfo).toBeDefined();
            expect(snapshot.memoryInfo.usedJSHeapSize).toBeGreaterThanOrEqual(0);
            expect(snapshot.memoryInfo.totalJSHeapSize).toBeGreaterThanOrEqual(0);
            expect(snapshot.memoryInfo.jsHeapSizeLimit).toBeGreaterThanOrEqual(0);
            expect(snapshot.activeObjects).toBeGreaterThanOrEqual(0);
        });

        it('records snapshots in history', () => {
            monitor.takeSnapshot();
            monitor.takeSnapshot();
            const history = monitor.getMemoryHistory();
            expect(history).toHaveLength(2);
        });
    });

    describe('getMemoryHistory', () => {
        it('returns empty array when no snapshots taken', () => {
            expect(monitor.getMemoryHistory()).toEqual([]);
        });

        it('returns snapshots in chronological order', () => {
            monitor.takeSnapshot();
            monitor.takeSnapshot();
            monitor.takeSnapshot();
            const history = monitor.getMemoryHistory();
            for (let i = 1; i < history.length; i++) {
                expect(history[i].timestamp).toBeGreaterThanOrEqual(history[i - 1].timestamp);
            }
        });

        it('filters by time range when provided', () => {
            const snap1 = monitor.takeSnapshot();
            const snap2 = monitor.takeSnapshot();
            const snap3 = monitor.takeSnapshot();
            const filtered = monitor.getMemoryHistory({ start: snap2.timestamp, end: snap3.timestamp });
            expect(filtered.length).toBeGreaterThanOrEqual(1);
            expect(filtered.length).toBeLessThanOrEqual(3);
        });
    });

    describe('startMonitoring / stopMonitoring', () => {
        it('starts and stops without errors', () => {
            expect(() => monitor.startMonitoring(100)).not.toThrow();
            expect(() => monitor.stopMonitoring()).not.toThrow();
        });

        it('collects snapshots while monitoring', async () => {
            monitor.startMonitoring(50);
            await new Promise(resolve => setTimeout(resolve, 200));
            monitor.stopMonitoring();
            expect(monitor.getMemoryHistory().length).toBeGreaterThan(0);
        });
    });

    describe('detectMemoryLeaks', () => {
        it('returns valid leak detection result', () => {
            monitor.takeSnapshot();
            monitor.takeSnapshot();
            const result = monitor.detectMemoryLeaks();
            expect(typeof result.detected).toBe('boolean');
            expect(typeof result.growthRate).toBe('number');
            expect(result.duration).toBeGreaterThanOrEqual(0);
            expect(Array.isArray(result.snapshots)).toBe(true);
        });
    });

    describe('getMemoryStats', () => {
        it('returns valid stats after snapshots', () => {
            monitor.takeSnapshot();
            monitor.takeSnapshot();
            const stats = monitor.getMemoryStats();
            expect(stats.current.usedJSHeapSize).toBeGreaterThanOrEqual(0);
            expect(stats.peak.usedJSHeapSize).toBeGreaterThanOrEqual(0);
            expect(stats.average.usedJSHeapSize).toBeGreaterThanOrEqual(0);
            expect(typeof stats.growthRate).toBe('number');
            expect(stats.leakDetection).toBeDefined();
        });
    });

    describe('callbacks', () => {
        it('registers memory pressure callback without error', () => {
            expect(() => monitor.onMemoryPressure(() => { })).not.toThrow();
        });

        it('registers cleanup callback without error', () => {
            expect(() => monitor.onCleanupNeeded(() => { })).not.toThrow();
        });

        it('triggerCleanup invokes cleanup callbacks', () => {
            const callback = jest.fn();
            monitor.onCleanupNeeded(callback);
            monitor.triggerCleanup();
            expect(callback).toHaveBeenCalled();
        });
    });

    describe('clearHistory', () => {
        it('removes all snapshots', () => {
            monitor.takeSnapshot();
            monitor.takeSnapshot();
            monitor.clearHistory();
            expect(monitor.getMemoryHistory()).toEqual([]);
        });
    });

    describe('setThresholds', () => {
        it('updates thresholds without error', () => {
            expect(() => monitor.setThresholds({ warning: 50 * 1024 * 1024 })).not.toThrow();
        });
    });
});
