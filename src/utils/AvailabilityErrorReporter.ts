/**
 * Enhanced error reporting for availability validation conflicts
 * Feature: availability-validation-bug-fix, Task 8: Enhanced error reporting
 * Validates: Requirements 2.1, 2.4
 */

import { Player } from '../models/Player';
import { Schedule } from '../models/Schedule';
import { Week } from '../models/Week';

export interface AvailabilityConflict {
  playerId: string;
  playerName: string;
  availabilityStatus: boolean | null | undefined;
  timeSlot: 'morning' | 'afternoon';
  foursomePosition: number;
  conflictType: 'unavailable' | 'no_data' | 'explicit_false';
  severity: 'error' | 'warning';
}

export interface ConflictResolutionSuggestion {
  type: 'remove_player' | 'update_availability' | 'regenerate_schedule' | 'contact_player' | 'manual_review';
  priority: 'high' | 'medium' | 'low';
  description: string;
  actionText: string;
  playerIds?: string[];
  automated?: boolean;
}

export interface AvailabilityErrorReport {
  conflicts: AvailabilityConflict[];
  suggestions: ConflictResolutionSuggestion[];
  summary: {
    totalConflicts: number;
    errorCount: number;
    warningCount: number;
    affectedTimeSlots: string[];
    affectedPlayers: string[];
  };
  metadata: {
    weekId: string;
    weekNumber: number;
    seasonId: string;
    reportGeneratedAt: Date;
    reportId: string;
  };
}

export interface AvailabilityFilteringDecision {
  playerId: string;
  playerName: string;
  availabilityStatus: boolean | null | undefined;
  decision: 'included' | 'excluded';
  reason: string;
  timestamp: Date;
}

export class AvailabilityErrorReporter {
  private filteringDecisions: AvailabilityFilteringDecision[] = [];
  private readonly maxDecisionHistory = 1000; // Keep last 1000 decisions

  /**
   * Generate comprehensive availability error report
   */
  generateDetailedErrorReport(
    schedule: Schedule,
    week: Week,
    allPlayers: Player[]
  ): AvailabilityErrorReport {
    const reportId = this.generateReportId();
    const conflicts = this.analyzeAvailabilityConflicts(schedule, week, allPlayers);
    const suggestions = this.generateResolutionSuggestions(conflicts, schedule, week);
    const summary = this.generateSummary(conflicts);

    return {
      conflicts,
      suggestions,
      summary,
      metadata: {
        weekId: week.id,
        weekNumber: week.weekNumber,
        seasonId: week.seasonId,
        reportGeneratedAt: new Date(),
        reportId
      }
    };
  }

  /**
   * Analyze schedule for availability conflicts
   */
  private analyzeAvailabilityConflicts(
    schedule: Schedule,
    week: Week,
    allPlayers: Player[]
  ): AvailabilityConflict[] {
    const conflicts: AvailabilityConflict[] = [];
    const playerMap = new Map(allPlayers.map(p => [p.id, p]));

    // Check all foursomes for conflicts
    const allFoursomes = [...schedule.timeSlots.morning, ...schedule.timeSlots.afternoon];
    
    for (const foursome of allFoursomes) {
      for (const player of foursome.players) {
        const playerData = playerMap.get(player.id);
        const availabilityStatus = this.getPlayerAvailabilityStatus(player.id, week);
        
        if (availabilityStatus !== true) {
          const conflict: AvailabilityConflict = {
            playerId: player.id,
            playerName: playerData ? `${playerData.firstName} ${playerData.lastName}` : player.id,
            availabilityStatus,
            timeSlot: foursome.timeSlot,
            foursomePosition: foursome.position,
            conflictType: this.determineConflictType(availabilityStatus),
            severity: availabilityStatus === false ? 'error' : 'warning'
          };
          
          conflicts.push(conflict);
        }
      }
    }

    return conflicts;
  }

  /**
   * Generate resolution suggestions based on conflicts
   */
  private generateResolutionSuggestions(
    conflicts: AvailabilityConflict[],
    schedule: Schedule,
    week: Week
  ): ConflictResolutionSuggestion[] {
    const suggestions: ConflictResolutionSuggestion[] = [];

    if (conflicts.length === 0) {
      return suggestions;
    }

    // Group conflicts by type
    const unavailableConflicts = conflicts.filter(c => c.conflictType === 'unavailable');
    const noDataConflicts = conflicts.filter(c => c.conflictType === 'no_data');

    // Suggestion 1: Remove unavailable players
    if (unavailableConflicts.length > 0) {
      suggestions.push({
        type: 'remove_player',
        priority: 'high',
        description: `Remove ${unavailableConflicts.length} unavailable player(s) from the schedule`,
        actionText: `Remove ${unavailableConflicts.map(c => c.playerName).join(', ')}`,
        playerIds: unavailableConflicts.map(c => c.playerId),
        automated: true
      });
    }

    // Suggestion 2: Update availability data
    if (noDataConflicts.length > 0) {
      suggestions.push({
        type: 'update_availability',
        priority: 'high',
        description: `Set availability data for ${noDataConflicts.length} player(s) missing availability information`,
        actionText: `Update availability for ${noDataConflicts.map(c => c.playerName).join(', ')}`,
        playerIds: noDataConflicts.map(c => c.playerId),
        automated: false
      });
    }

    // Suggestion 3: Contact players to confirm status
    if (unavailableConflicts.length > 0) {
      suggestions.push({
        type: 'contact_player',
        priority: 'medium',
        description: 'Contact unavailable players to confirm their status for this week',
        actionText: 'Send availability confirmation requests',
        playerIds: unavailableConflicts.map(c => c.playerId),
        automated: false
      });
    }

    // Suggestion 4: Regenerate schedule
    if (conflicts.length > 0) {
      suggestions.push({
        type: 'regenerate_schedule',
        priority: 'medium',
        description: 'Regenerate the schedule after updating player availability',
        actionText: 'Regenerate Schedule',
        automated: true
      });
    }

    // Suggestion 5: Manual review for complex cases
    if (conflicts.length > schedule.getTotalPlayerCount() * 0.3) { // More than 30% conflicts
      suggestions.push({
        type: 'manual_review',
        priority: 'high',
        description: 'High number of conflicts detected - manual review recommended',
        actionText: 'Review Schedule Manually',
        automated: false
      });
    }

    return suggestions.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  /**
   * Generate summary of conflicts
   */
  private generateSummary(conflicts: AvailabilityConflict[]): AvailabilityErrorReport['summary'] {
    const errorCount = conflicts.filter(c => c.severity === 'error').length;
    const warningCount = conflicts.filter(c => c.severity === 'warning').length;
    
    const affectedTimeSlots = [...new Set(conflicts.map(c => c.timeSlot))];
    const affectedPlayers = [...new Set(conflicts.map(c => c.playerName))];

    return {
      totalConflicts: conflicts.length,
      errorCount,
      warningCount,
      affectedTimeSlots,
      affectedPlayers
    };
  }

  /**
   * Log availability filtering decision
   */
  logFilteringDecision(
    playerId: string,
    playerName: string,
    availabilityStatus: boolean | null | undefined,
    decision: 'included' | 'excluded',
    reason: string
  ): void {
    const filteringDecision: AvailabilityFilteringDecision = {
      playerId,
      playerName,
      availabilityStatus,
      decision,
      reason,
      timestamp: new Date()
    };

    this.filteringDecisions.push(filteringDecision);

    // Keep only recent decisions to prevent memory issues
    if (this.filteringDecisions.length > this.maxDecisionHistory) {
      this.filteringDecisions = this.filteringDecisions.slice(-this.maxDecisionHistory);
    }

    // Log to console for debugging
    console.log(`[AvailabilityFilter] ${decision.toUpperCase()}: ${playerName} (${playerId}) - ${reason}`, {
      availabilityStatus,
      timestamp: filteringDecision.timestamp.toISOString()
    });
  }

  /**
   * Get filtering decision history
   */
  getFilteringDecisionHistory(limit?: number): AvailabilityFilteringDecision[] {
    const decisions = [...this.filteringDecisions].reverse(); // Most recent first
    return limit ? decisions.slice(0, limit) : decisions;
  }

  /**
   * Get filtering decisions for specific week
   */
  getFilteringDecisionsForTimeRange(startTime: Date, endTime: Date): AvailabilityFilteringDecision[] {
    return this.filteringDecisions.filter(
      decision => decision.timestamp >= startTime && decision.timestamp <= endTime
    );
  }

  /**
   * Clear filtering decision history
   */
  clearFilteringHistory(): void {
    this.filteringDecisions = [];
  }

  /**
   * Generate user-friendly error messages
   */
  generateUserFriendlyMessages(report: AvailabilityErrorReport): {
    title: string;
    message: string;
    details: string[];
    actions: Array<{ label: string; action: string; priority: 'primary' | 'secondary' }>;
  } {
    const { conflicts, suggestions, summary } = report;

    let title: string;
    let message: string;

    if (summary.totalConflicts === 0) {
      title = 'Schedule Validation Passed';
      message = 'All players in the schedule are available for their assigned time slots.';
    } else if (summary.errorCount > 0) {
      title = 'Schedule Validation Failed';
      message = `Found ${summary.errorCount} critical availability conflict(s) that must be resolved before the schedule can be finalized.`;
    } else {
      title = 'Schedule Validation Warning';
      message = `Found ${summary.warningCount} availability warning(s) that should be reviewed.`;
    }

    const details: string[] = [];
    
    if (summary.totalConflicts > 0) {
      details.push(`Affected players: ${summary.affectedPlayers.join(', ')}`);
      details.push(`Affected time slots: ${summary.affectedTimeSlots.join(', ')}`);
      
      // Add specific conflict details
      const unavailableConflicts = conflicts.filter(c => c.conflictType === 'unavailable');
      const noDataConflicts = conflicts.filter(c => c.conflictType === 'no_data');
      
      if (unavailableConflicts.length > 0) {
        details.push(`Players marked as unavailable: ${unavailableConflicts.map(c => c.playerName).join(', ')}`);
      }
      
      if (noDataConflicts.length > 0) {
        details.push(`Players missing availability data: ${noDataConflicts.map(c => c.playerName).join(', ')}`);
      }
    }

    const actions = suggestions.slice(0, 3).map(suggestion => ({
      label: suggestion.actionText,
      action: suggestion.type,
      priority: suggestion.priority === 'high' ? 'primary' as const : 'secondary' as const
    }));

    return { title, message, details, actions };
  }

  /**
   * Export report for external systems
   */
  exportReport(report: AvailabilityErrorReport, format: 'json' | 'csv' | 'summary'): string {
    switch (format) {
      case 'json':
        return JSON.stringify(report, null, 2);
      
      case 'csv':
        return this.exportToCsv(report);
      
      case 'summary':
        return this.exportToSummary(report);
      
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Helper methods
   */
  private getPlayerAvailabilityStatus(playerId: string, week: Week): boolean | null {
    if ('playerAvailability' in week && week.playerAvailability) {
      return week.playerAvailability[playerId] ?? null;
    }
    return null;
  }

  private determineConflictType(availabilityStatus: boolean | null | undefined): AvailabilityConflict['conflictType'] {
    if (availabilityStatus === false) {
      return 'unavailable';
    } else if (availabilityStatus === null || availabilityStatus === undefined) {
      return 'no_data';
    } else {
      return 'explicit_false';
    }
  }

  private generateReportId(): string {
    return `avail-report-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private exportToCsv(report: AvailabilityErrorReport): string {
    const headers = ['Player Name', 'Player ID', 'Time Slot', 'Position', 'Availability Status', 'Conflict Type', 'Severity'];
    const rows = report.conflicts.map(conflict => [
      conflict.playerName,
      conflict.playerId,
      conflict.timeSlot,
      conflict.foursomePosition.toString(),
      String(conflict.availabilityStatus),
      conflict.conflictType,
      conflict.severity
    ]);

    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  private exportToSummary(report: AvailabilityErrorReport): string {
    const { summary, metadata, suggestions } = report;
    
    let summaryText = `Availability Validation Report\n`;
    summaryText += `Generated: ${metadata.reportGeneratedAt.toISOString()}\n`;
    summaryText += `Week: ${metadata.weekNumber} (Season: ${metadata.seasonId})\n\n`;
    
    summaryText += `Summary:\n`;
    summaryText += `- Total Conflicts: ${summary.totalConflicts}\n`;
    summaryText += `- Errors: ${summary.errorCount}\n`;
    summaryText += `- Warnings: ${summary.warningCount}\n`;
    summaryText += `- Affected Players: ${summary.affectedPlayers.length}\n`;
    summaryText += `- Affected Time Slots: ${summary.affectedTimeSlots.join(', ')}\n\n`;
    
    if (suggestions.length > 0) {
      summaryText += `Recommended Actions:\n`;
      suggestions.forEach((suggestion, index) => {
        summaryText += `${index + 1}. ${suggestion.description}\n`;
      });
    }

    return summaryText;
  }
}