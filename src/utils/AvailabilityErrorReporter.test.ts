/**
 * Tests for AvailabilityErrorReporter
 * Feature: availability-validation-bug-fix, Task 8: Enhanced error reporting
 * Validates: Requirements 2.1, 2.4
 */

import { AvailabilityErrorReporter } from './AvailabilityErrorReporter';
import { PlayerModel } from '../models/Player';
import { WeekModel } from '../models/Week';
import { ScheduleModel } from '../models/Schedule';
import { FoursomeModel } from '../models/Foursome';

describe('AvailabilityErrorReporter', () => {
  let reporter: AvailabilityErrorReporter;

  beforeEach(() => {
    reporter = new AvailabilityErrorReporter();
  });

  afterEach(() => {
    reporter.clearFilteringHistory();
  });

  describe('Detailed Error Report Generation', () => {
    test('should generate comprehensive error report for availability conflicts', () => {
      const seasonId = 'test-season';
      
      // Create players
      const players = [
        new PlayerModel({
          firstName: 'Available',
          lastName: 'Player',
          handedness: 'left',
          timePreference: 'AM',
          seasonId
        }),
        new PlayerModel({
          firstName: 'Unavailable',
          lastName: 'Player',
          handedness: 'right',
          timePreference: 'PM',
          seasonId
        }),
        new PlayerModel({
          firstName: 'NoData',
          lastName: 'Player',
          handedness: 'left',
          timePreference: 'Either',
          seasonId
        })
      ];

      // Create week with mixed availability
      const week = new WeekModel({
        seasonId,
        weekNumber: 1,
        date: new Date(),
        playerAvailability: {
          [players[0].id]: true,   // Available
          [players[1].id]: false,  // Unavailable
          // players[2] has no data
        }
      });

      // Create schedule with conflicts
      const schedule = new ScheduleModel({ weekId: week.id });
      const foursome = new FoursomeModel({
        players: players, // All players including unavailable ones
        timeSlot: 'morning',
        position: 0
      });
      schedule.addFoursome(foursome);

      // Generate report
      const report = reporter.generateDetailedErrorReport(schedule, week, players);

      // Verify report structure
      expect(report.conflicts).toHaveLength(2); // Unavailable and NoData players
      expect(report.suggestions.length).toBeGreaterThan(0);
      expect(report.summary.totalConflicts).toBe(2);
      expect(report.summary.errorCount).toBe(1); // Unavailable player
      expect(report.summary.warningCount).toBe(1); // NoData player
      expect(report.metadata.weekId).toBe(week.id);
      expect(report.metadata.weekNumber).toBe(1);
      expect(report.metadata.seasonId).toBe(seasonId);

      // Verify conflict details
      const unavailableConflict = report.conflicts.find(c => c.conflictType === 'unavailable');
      const noDataConflict = report.conflicts.find(c => c.conflictType === 'no_data');

      expect(unavailableConflict).toBeDefined();
      expect(unavailableConflict?.playerName).toBe('Unavailable Player');
      expect(unavailableConflict?.severity).toBe('error');

      expect(noDataConflict).toBeDefined();
      expect(noDataConflict?.playerName).toBe('NoData Player');
      expect(noDataConflict?.severity).toBe('warning');

      // Verify suggestions
      const removePlayerSuggestion = report.suggestions.find(s => s.type === 'remove_player');
      const updateAvailabilitySuggestion = report.suggestions.find(s => s.type === 'update_availability');

      expect(removePlayerSuggestion).toBeDefined();
      expect(removePlayerSuggestion?.priority).toBe('high');
      expect(removePlayerSuggestion?.playerIds).toContain(players[1].id);

      expect(updateAvailabilitySuggestion).toBeDefined();
      expect(updateAvailabilitySuggestion?.priority).toBe('high');
      expect(updateAvailabilitySuggestion?.playerIds).toContain(players[2].id);
    });

    test('should generate empty report for valid schedule', () => {
      const seasonId = 'test-season-valid';
      
      // Create available players
      const players = [
        new PlayerModel({
          firstName: 'Available1',
          lastName: 'Player',
          handedness: 'left',
          timePreference: 'AM',
          seasonId
        }),
        new PlayerModel({
          firstName: 'Available2',
          lastName: 'Player',
          handedness: 'right',
          timePreference: 'PM',
          seasonId
        })
      ];

      // Create week with all players available
      const week = new WeekModel({
        seasonId,
        weekNumber: 1,
        date: new Date(),
        playerAvailability: {
          [players[0].id]: true,
          [players[1].id]: true
        }
      });

      // Create valid schedule
      const schedule = new ScheduleModel({ weekId: week.id });
      const foursome = new FoursomeModel({
        players: players,
        timeSlot: 'morning',
        position: 0
      });
      schedule.addFoursome(foursome);

      // Generate report
      const report = reporter.generateDetailedErrorReport(schedule, week, players);

      // Verify empty report
      expect(report.conflicts).toHaveLength(0);
      expect(report.suggestions).toHaveLength(0);
      expect(report.summary.totalConflicts).toBe(0);
      expect(report.summary.errorCount).toBe(0);
      expect(report.summary.warningCount).toBe(0);
    });
  });

  describe('Filtering Decision Logging', () => {
    test('should log filtering decisions correctly', () => {
      const playerId = 'player-123';
      const playerName = 'Test Player';

      // Log inclusion decision
      reporter.logFilteringDecision(
        playerId,
        playerName,
        true,
        'included',
        'Player explicitly marked as available'
      );

      // Log exclusion decision
      reporter.logFilteringDecision(
        'player-456',
        'Unavailable Player',
        false,
        'excluded',
        'Player explicitly marked as unavailable'
      );

      // Get history
      const history = reporter.getFilteringDecisionHistory();

      expect(history).toHaveLength(2);
      
      // Most recent first
      expect(history[0].playerId).toBe('player-456');
      expect(history[0].decision).toBe('excluded');
      expect(history[0].availabilityStatus).toBe(false);

      expect(history[1].playerId).toBe(playerId);
      expect(history[1].decision).toBe('included');
      expect(history[1].availabilityStatus).toBe(true);
    });

    test('should limit filtering decision history', () => {
      // Log more decisions than the limit
      for (let i = 0; i < 1100; i++) {
        reporter.logFilteringDecision(
          `player-${i}`,
          `Player ${i}`,
          true,
          'included',
          'Test decision'
        );
      }

      const history = reporter.getFilteringDecisionHistory();
      expect(history.length).toBeLessThanOrEqual(1000); // Should be limited to maxDecisionHistory
    });

    test('should filter decisions by time range', () => {
      const startTime = new Date();
      
      // Log decision before range
      reporter.logFilteringDecision('player-1', 'Player 1', true, 'included', 'Before range');
      
      // Wait a bit
      const rangeStart = new Date(Date.now() + 10);
      
      // Log decision in range
      setTimeout(() => {
        reporter.logFilteringDecision('player-2', 'Player 2', true, 'included', 'In range');
      }, 20);
      
      const rangeEnd = new Date(Date.now() + 50);
      
      // Log decision after range
      setTimeout(() => {
        reporter.logFilteringDecision('player-3', 'Player 3', true, 'included', 'After range');
      }, 60);

      // Get decisions in range
      setTimeout(() => {
        const rangeDecisions = reporter.getFilteringDecisionsForTimeRange(rangeStart, rangeEnd);
        expect(rangeDecisions).toHaveLength(1);
        expect(rangeDecisions[0].playerId).toBe('player-2');
      }, 100);
    });
  });

  describe('User-Friendly Message Generation', () => {
    test('should generate user-friendly messages for conflicts', () => {
      const seasonId = 'test-season';
      
      const players = [
        new PlayerModel({
          firstName: 'Unavailable',
          lastName: 'Player',
          handedness: 'left',
          timePreference: 'AM',
          seasonId
        })
      ];

      const week = new WeekModel({
        seasonId,
        weekNumber: 1,
        date: new Date(),
        playerAvailability: {
          [players[0].id]: false
        }
      });

      const schedule = new ScheduleModel({ weekId: week.id });
      const foursome = new FoursomeModel({
        players: players,
        timeSlot: 'morning',
        position: 0
      });
      schedule.addFoursome(foursome);

      const report = reporter.generateDetailedErrorReport(schedule, week, players);
      const userMessages = reporter.generateUserFriendlyMessages(report);

      expect(userMessages.title).toBe('Schedule Validation Failed');
      expect(userMessages.message).toContain('1 critical availability conflict');
      expect(userMessages.details.length).toBeGreaterThan(0);
      expect(userMessages.actions.length).toBeGreaterThan(0);
      
      const primaryAction = userMessages.actions.find(a => a.priority === 'primary');
      expect(primaryAction).toBeDefined();
    });

    test('should generate success message for valid schedule', () => {
      const seasonId = 'test-season';
      
      const players = [
        new PlayerModel({
          firstName: 'Available',
          lastName: 'Player',
          handedness: 'left',
          timePreference: 'AM',
          seasonId
        })
      ];

      const week = new WeekModel({
        seasonId,
        weekNumber: 1,
        date: new Date(),
        playerAvailability: {
          [players[0].id]: true
        }
      });

      const schedule = new ScheduleModel({ weekId: week.id });
      const foursome = new FoursomeModel({
        players: players,
        timeSlot: 'morning',
        position: 0
      });
      schedule.addFoursome(foursome);

      const report = reporter.generateDetailedErrorReport(schedule, week, players);
      const userMessages = reporter.generateUserFriendlyMessages(report);

      expect(userMessages.title).toBe('Schedule Validation Passed');
      expect(userMessages.message).toContain('All players in the schedule are available');
      expect(userMessages.details).toHaveLength(0);
      expect(userMessages.actions).toHaveLength(0);
    });
  });

  describe('Report Export', () => {
    test('should export report as JSON', () => {
      const seasonId = 'test-season';
      
      const players = [
        new PlayerModel({
          firstName: 'Test',
          lastName: 'Player',
          handedness: 'left',
          timePreference: 'AM',
          seasonId
        })
      ];

      const week = new WeekModel({
        seasonId,
        weekNumber: 1,
        date: new Date(),
        playerAvailability: {
          [players[0].id]: false
        }
      });

      const schedule = new ScheduleModel({ weekId: week.id });
      const foursome = new FoursomeModel({
        players: players,
        timeSlot: 'morning',
        position: 0
      });
      schedule.addFoursome(foursome);

      const report = reporter.generateDetailedErrorReport(schedule, week, players);
      const jsonExport = reporter.exportReport(report, 'json');

      expect(() => JSON.parse(jsonExport)).not.toThrow();
      const parsedReport = JSON.parse(jsonExport);
      expect(parsedReport.conflicts).toHaveLength(1);
      expect(parsedReport.metadata.weekId).toBe(week.id);
    });

    test('should export report as CSV', () => {
      const seasonId = 'test-season';
      
      const players = [
        new PlayerModel({
          firstName: 'Test',
          lastName: 'Player',
          handedness: 'left',
          timePreference: 'AM',
          seasonId
        })
      ];

      const week = new WeekModel({
        seasonId,
        weekNumber: 1,
        date: new Date(),
        playerAvailability: {
          [players[0].id]: false
        }
      });

      const schedule = new ScheduleModel({ weekId: week.id });
      const foursome = new FoursomeModel({
        players: players,
        timeSlot: 'morning',
        position: 0
      });
      schedule.addFoursome(foursome);

      const report = reporter.generateDetailedErrorReport(schedule, week, players);
      const csvExport = reporter.exportReport(report, 'csv');

      expect(csvExport).toContain('Player Name,Player ID,Time Slot');
      expect(csvExport).toContain('Test Player');
      expect(csvExport).toContain('morning');
    });

    test('should export report as summary', () => {
      const seasonId = 'test-season';
      
      const players = [
        new PlayerModel({
          firstName: 'Test',
          lastName: 'Player',
          handedness: 'left',
          timePreference: 'AM',
          seasonId
        })
      ];

      const week = new WeekModel({
        seasonId,
        weekNumber: 1,
        date: new Date(),
        playerAvailability: {
          [players[0].id]: false
        }
      });

      const schedule = new ScheduleModel({ weekId: week.id });
      const foursome = new FoursomeModel({
        players: players,
        timeSlot: 'morning',
        position: 0
      });
      schedule.addFoursome(foursome);

      const report = reporter.generateDetailedErrorReport(schedule, week, players);
      const summaryExport = reporter.exportReport(report, 'summary');

      expect(summaryExport).toContain('Availability Validation Report');
      expect(summaryExport).toContain('Week: 1');
      expect(summaryExport).toContain('Total Conflicts: 1');
      expect(summaryExport).toContain('Recommended Actions:');
    });
  });
});