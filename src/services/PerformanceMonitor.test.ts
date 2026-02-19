import { PerformanceMonitor } from './PerformanceMonitor';

describe('PerformanceMonitor', () => {
    let monitor: PerformanceMonitor;

    beforeEach(() => {
        monitor = new PerformanceMonitor();
    });

    afterEach(() => {
        monitor.clearMetrics();
    });

    describe('startOperation / endOperation', () => {
        it('tracks an operation and returns metrics', () => {
            const tracker = monitor.startOperation('test-op');
            expect(tracker.id).toBeDefined();
            expect(tracker.operationName).toBe('test-op');
            expect(tracker.startTime).toBeGreaterThan(0);

            const metrics = monitor.endOperation(tracker);
            expect(metrics.operationName).toBe('test-op');
            expect(metrics.duration).toBeGreaterThanOrEqual(0);
            expect(metrics.endTime).toBeGreaterThanOrEqual(metrics.startTime);
            expect(metrics.memoryUsage).toBeDefined();
            expect(metrics.resourceUsage).toBeDefined();
        });

        it('includes metadata when provided', () => {
            const tracker = monitor.startOperation('test-op', { key: 'value' });
            const metrics = monitor.endOperation(tracker);
            expect(metrics.metadata).toEqual({ key: 'value' });
        });

        it('removes tracker from active operations after endOperation', () => {
            const tracker = monitor.startOperation('test-op');
            expect(monitor.getPerformanceStats().activeOperations).toBe(1);
            monitor.endOperation(tracker);
            expect(monitor.getPerformanceStats().activeOperations).toBe(0);
        });
    });

    describe('getMetrics', () => {
        it('returns empty array when no operations tracked', () => {
            expect(monitor.getMetrics()).toEqual([]);
        });

        it('returns all metrics when no time range specified', () => {
            const t1 = monitor.startOperation('op1');
            monitor.endOperation(t1);
            const t2 = monitor.startOperation('op2');
            monitor.endOperation(t2);
            expect(monitor.getMetrics()).toHaveLength(2);
        });
    });

    describe('getAggregatedMetrics', () => {
        it('returns zeroed metrics for unknown operation', () => {
            const agg = monitor.getAggregatedMetrics('nonexistent');
            expect(agg.totalExecutions).toBe(0);
            expect(agg.averageDuration).toBe(0);
        });

        it('calculates correct aggregated stats', () => {
            for (let i = 0; i < 5; i++) {
                const t = monitor.startOperation('op');
                monitor.endOperation(t);
            }
            const agg = monitor.getAggregatedMetrics('op');
            expect(agg.totalExecutions).toBe(5);
            expect(agg.averageDuration).toBeGreaterThanOrEqual(0);
            expect(agg.minDuration).toBeLessThanOrEqual(agg.maxDuration);
            expect(agg.p95Duration).toBeGreaterThanOrEqual(0);
            expect(agg.p99Duration).toBeGreaterThanOrEqual(0);
        });
    });

    describe('thresholds', () => {
        it('fires callback when threshold exceeded', () => {
            const callback = jest.fn();
            monitor.onThresholdExceeded(callback);
            // Set an impossibly low threshold
            monitor.setThresholds('slow-op', { warning: 0, critical: 0, timeout: 1000 });

            const tracker = monitor.startOperation('slow-op');
            monitor.endOperation(tracker);
            expect(callback).toHaveBeenCalled();
        });

        it('does not fire callback when under threshold', () => {
            const callback = jest.fn();
            monitor.onThresholdExceeded(callback);
            monitor.setThresholds('fast-op', { warning: 99999, critical: 99999, timeout: 99999 });

            const tracker = monitor.startOperation('fast-op');
            monitor.endOperation(tracker);
            expect(callback).not.toHaveBeenCalled();
        });
    });

    describe('clearMetrics', () => {
        it('removes all stored metrics and active trackers', () => {
            monitor.startOperation('op1');
            const t = monitor.startOperation('op2');
            monitor.endOperation(t);
            monitor.clearMetrics();

            expect(monitor.getMetrics()).toEqual([]);
            expect(monitor.getPerformanceStats().activeOperations).toBe(0);
        });
    });

    describe('getPerformanceStats', () => {
        it('returns correct counts', () => {
            const stats = monitor.getPerformanceStats();
            expect(stats.totalOperations).toBe(0);
            expect(stats.activeOperations).toBe(0);
            expect(stats.averageOperationTime).toBe(0);
            expect(stats.memoryUsage).toBeDefined();
        });
    });
});
