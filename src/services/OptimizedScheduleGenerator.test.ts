/**
 * Unit tests for OptimizedScheduleGenerator
 */

import { OptimizedScheduleGenerator, GenerationProgress } from './OptimizedScheduleGenerator';
import { Player } from '../models/Player';
import { WeekModel } from '../models/Week';

describe('OptimizedScheduleGenerator', () => {
  let generator: OptimizedScheduleGenerator;
  let mockProgressCallback: jest.Mock<void, [GenerationProgress]>;

  beforeEach(() => {
    mockProgressCallback = jest.fn();
    generator = new OptimizedScheduleGenerator({
      enableProgressReporting: true,
      enableCaching: true,
      enableParallelProcessing: true,
      progressCallback: mockProgressCallback
    });
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const defaultGenerator = new OptimizedScheduleGenerator();
      expect(defaultGenerator).toBeInstanceOf(OptimizedScheduleGenerator);
    });

    it('should merge provided options with defaults', () => {
      const customGenerator = new OptimizedScheduleGenerator({
        enableParallelProcessing: false,
        chunkSize: 50
      });
      expect(customGenerator).toBeInstanceOf(OptimizedScheduleGenerator);
    });
  });

  describe('generateScheduleForWeek', () => {
    const createTestPlayers = (count: number): Player[] => {
      return Array.from({ length: count }, (_, i) => ({
        id: `player-${i + 1}`,
        firstName: `Player`,
        lastName: `${i + 1}`,
        email: `player${i + 1}@test.com`,
        timePreference: i % 3 === 0 ? 'AM' : i % 3 === 1 ? 'PM' : 'Either',
        seasonId: 'test-season'
      }));
    };

    const createTestWeek = (playerCount: number) => {
      const week = new WeekModel({
        id: 'test-week',
        weekNumber: 1,
        seasonId: 'test-season',
        date: new Date('2024-01-01'), // Add required date field
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-07')
      });

      // Set all players as available
      for (let i = 1; i <= playerCount; i++) {
        week.setPlayerAvailability(`player-${i}`, true);
      }

      return week;
    };

    it('should generate schedule with progress reporting', async () => {
      const players = createTestPlayers(8);
      const week = createTestWeek(8);

      const schedule = await generator.generateScheduleForWeek(week, players);

      expect(schedule).toBeDefined();
      expect(schedule.weekId).toBe('test-week');
      expect(mockProgressCallback).toHaveBeenCalled();
      
      // Check that progress was reported
      const progressCalls = mockProgressCallback.mock.calls;
      expect(progressCalls.length).toBeGreaterThan(0);
      
      // Check final progress call
      const finalCall = progressCalls[progressCalls.length - 1][0];
      expect(finalCall.phase).toBe('complete');
      expect(finalCall.percentage).toBe(100);
    });

    it('should use parallel processing for large player sets', async () => {
      const players = createTestPlayers(25); // Above chunk size threshold
      const week = createTestWeek(25);

      const schedule = await generator.generateScheduleForWeek(week, players);

      expect(schedule).toBeDefined();
      expect(mockProgressCallback).toHaveBeenCalled();
      
      // Check that parallel processing message was reported
      const progressCalls = mockProgressCallback.mock.calls;
      const parallelMessage = progressCalls.find(call => 
        call[0].message.includes('parallel processing')
      );
      expect(parallelMessage).toBeDefined();
    });

    it('should handle small player sets without parallel processing', async () => {
      const players = createTestPlayers(8); // Below chunk size threshold
      const week = createTestWeek(8);

      const schedule = await generator.generateScheduleForWeek(week, players);

      expect(schedule).toBeDefined();
      expect(schedule.weekId).toBe('test-week');
    });

    it('should handle empty player list', async () => {
      const players: Player[] = [];
      const week = createTestWeek(0);

      const schedule = await generator.generateScheduleForWeek(week, players);

      expect(schedule).toBeDefined();
      expect(schedule.weekId).toBe('test-week');
      expect(schedule.timeSlots.morning).toHaveLength(0);
      expect(schedule.timeSlots.afternoon).toHaveLength(0);
    });
  });

  describe('estimateGenerationTime', () => {
    it('should estimate 2 seconds for 50 players', () => {
      const estimate = generator.estimateGenerationTime(50);
      expect(estimate).toBe(2000);
    });

    it('should estimate 5 seconds for 100 players', () => {
      const estimate = generator.estimateGenerationTime(100);
      expect(estimate).toBe(5000);
    });

    it('should estimate 10 seconds for 200 players', () => {
      const estimate = generator.estimateGenerationTime(200);
      expect(estimate).toBe(10000);
    });

    it('should estimate 2 seconds for player counts <= 50', () => {
      expect(generator.estimateGenerationTime(25)).toBe(2000);
      expect(generator.estimateGenerationTime(50)).toBe(2000);
    });

    it('should estimate 5 seconds for player counts 51-100', () => {
      expect(generator.estimateGenerationTime(75)).toBe(5000);
      expect(generator.estimateGenerationTime(100)).toBe(5000);
    });

    it('should estimate 10 seconds for player counts > 100', () => {
      expect(generator.estimateGenerationTime(150)).toBe(10000);
      expect(generator.estimateGenerationTime(300)).toBe(10000);
    });
  });

  describe('cache management', () => {
    it('should clear cache', () => {
      generator.clearCache();
      const stats = generator.getCacheStats();
      expect(stats.size).toBe(0);
    });

    it('should return cache statistics', () => {
      const stats = generator.getCacheStats();
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('hitRate');
      expect(typeof stats.size).toBe('number');
      expect(typeof stats.hitRate).toBe('number');
    });
  });

  describe('error handling', () => {
    it('should handle generation errors gracefully', async () => {
      const createTestPlayers = (count: number): Player[] => {
        return Array.from({ length: count }, (_, i) => ({
          id: `player-${i + 1}`,
          firstName: `Player`,
          lastName: `${i + 1}`,
          email: `player${i + 1}@test.com`,
          timePreference: i % 3 === 0 ? 'AM' : i % 3 === 1 ? 'PM' : 'Either',
          seasonId: 'test-season'
        }));
      };

      const players = createTestPlayers(4);
      
      // Create a week with invalid data that will cause validation to fail
      const invalidWeek = {
        id: '', // Invalid empty ID - this should cause an error
        weekNumber: 1,
        seasonId: 'test-season',
        date: new Date('2024-01-01'),
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-07'),
        playerAvailability: {}
      } as any;

      await expect(generator.generateScheduleForWeek(invalidWeek, players))
        .rejects.toThrow();

      // Should still report completion even on error
      const progressCalls = mockProgressCallback.mock.calls;
      if (progressCalls.length > 0) {
        const finalCall = progressCalls[progressCalls.length - 1][0];
        expect(finalCall.phase).toBe('complete');
        expect(finalCall.message).toContain('failed');
      }
    });
  });
});