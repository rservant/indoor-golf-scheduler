/**
 * Unit tests for ProgressReporter
 */

import { ProgressReporter, ProgressUpdate, ProgressCallback } from './ProgressReporter';

describe('ProgressReporter', () => {
  let reporter: ProgressReporter;

  beforeEach(() => {
    reporter = new ProgressReporter();
  });

  describe('callback management', () => {
    it('should add and remove callbacks', () => {
      const callback1: ProgressCallback = jest.fn();
      const callback2: ProgressCallback = jest.fn();

      reporter.addCallback(callback1);
      reporter.addCallback(callback2);

      reporter.report('test', 50, 'Test message');

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);

      reporter.removeCallback(callback1);
      reporter.report('test', 75, 'Another message');

      expect(callback1).toHaveBeenCalledTimes(1); // Still 1
      expect(callback2).toHaveBeenCalledTimes(2); // Now 2
    });

    it('should clear all callbacks', () => {
      const callback1: ProgressCallback = jest.fn();
      const callback2: ProgressCallback = jest.fn();

      reporter.addCallback(callback1);
      reporter.addCallback(callback2);
      reporter.clearCallbacks();

      reporter.report('test', 50, 'Test message');

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
    });
  });

  describe('progress reporting', () => {
    it('should report progress with correct structure', () => {
      const callback: ProgressCallback = jest.fn();
      reporter.addCallback(callback);

      const metadata = { key: 'value' };
      reporter.report('initialization', 25, 'Starting process', metadata);

      const call = (callback as jest.Mock).mock.calls[0][0];
      expect(call.phase).toBe('initialization');
      expect(call.percentage).toBe(25);
      expect(call.message).toBe('Starting process');
      expect(call.metadata).toEqual(metadata);
      expect(typeof call.timestamp).toBe('number');
    });

    it('should clamp percentage values', () => {
      const callback: ProgressCallback = jest.fn();
      reporter.addCallback(callback);

      // Test negative percentage
      reporter.report('test', -10, 'Negative test');
      let call = (callback as jest.Mock).mock.calls[0][0];
      expect(call.percentage).toBe(0);

      // Test percentage over 100
      reporter.report('test', 150, 'Over 100 test');
      call = (callback as jest.Mock).mock.calls[1][0];
      expect(call.percentage).toBe(100);

      // Test normal percentage
      reporter.report('test', 50, 'Normal test');
      call = (callback as jest.Mock).mock.calls[2][0];
      expect(call.percentage).toBe(50);
    });

    it('should handle metadata correctly', () => {
      const callback: ProgressCallback = jest.fn();
      reporter.addCallback(callback);

      // With metadata
      reporter.report('test', 50, 'With metadata', { count: 10 });
      let call = (callback as jest.Mock).mock.calls[0][0];
      expect(call.metadata).toEqual({ count: 10 });

      // Without metadata
      reporter.report('test', 75, 'Without metadata');
      call = (callback as jest.Mock).mock.calls[1][0];
      expect(call.metadata).toBeUndefined();
    });

    it('should store last update', () => {
      reporter.report('phase1', 30, 'First update');
      
      let lastUpdate = reporter.getLastUpdate();
      expect(lastUpdate?.phase).toBe('phase1');
      expect(lastUpdate?.percentage).toBe(30);
      expect(lastUpdate?.message).toBe('First update');
      expect(lastUpdate?.metadata).toBeUndefined();
      expect(typeof lastUpdate?.timestamp).toBe('number');

      reporter.report('phase2', 60, 'Second update', { step: 2 });
      
      lastUpdate = reporter.getLastUpdate();
      expect(lastUpdate?.phase).toBe('phase2');
      expect(lastUpdate?.percentage).toBe(60);
      expect(lastUpdate?.message).toBe('Second update');
      expect(lastUpdate?.metadata).toEqual({ step: 2 });
      expect(typeof lastUpdate?.timestamp).toBe('number');
    });

    it('should return null for last update initially', () => {
      expect(reporter.getLastUpdate()).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should handle callback errors gracefully', () => {
      const errorCallback: ProgressCallback = () => {
        throw new Error('Callback error');
      };
      const goodCallback: ProgressCallback = jest.fn();

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      reporter.addCallback(errorCallback);
      reporter.addCallback(goodCallback);

      reporter.report('test', 50, 'Test message');

      // Check that console.error was called with the right message
      expect(consoleSpy).toHaveBeenCalled();
      const errorCall = consoleSpy.mock.calls[0];
      expect(errorCall[0]).toBe('Progress callback error:');
      expect(errorCall[1]).toBeInstanceOf(Error);
      
      expect(goodCallback).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('static factory methods', () => {
    it('should create console logger callback', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const consoleLogger = ProgressReporter.createConsoleLogger();
      consoleLogger({
        phase: 'test',
        percentage: 50,
        message: 'Test message',
        timestamp: Date.now()
      });

      expect(consoleSpy).toHaveBeenCalledWith('[test] 50% - Test message');
      consoleSpy.mockRestore();
    });

    it('should create array logger', () => {
      const { callback, updates } = ProgressReporter.createArrayLogger();

      const update1: ProgressUpdate = {
        phase: 'phase1',
        percentage: 25,
        message: 'First update',
        timestamp: Date.now()
      };

      const update2: ProgressUpdate = {
        phase: 'phase2',
        percentage: 75,
        message: 'Second update',
        timestamp: Date.now()
      };

      callback(update1);
      callback(update2);

      expect(updates).toHaveLength(2);
      expect(updates[0]).toEqual(update1);
      expect(updates[1]).toEqual(update2);
    });
  });
});