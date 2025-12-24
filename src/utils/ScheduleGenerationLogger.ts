export interface GenerationStep {
  step: string;
  timestamp: Date;
  data: any;
  success: boolean;
  error?: string | undefined;
}

export interface FilteringDecision {
  playerId: string;
  playerName: string;
  availabilityStatus: boolean | null | undefined;
  decision: 'included' | 'excluded';
  reason: string;
  timestamp: Date;
}

export interface DebugInfo {
  weekId: string;
  seasonId: string;
  totalPlayers: number;
  availablePlayers: any[];
  unavailablePlayers: any[];
  filteringDecisions: FilteringDecision[];
  generationSteps: GenerationStep[];
  finalSchedule: any | null;
  errors: string[];
  warnings: string[];
  startTime: Date;
  endTime?: Date | undefined;
  duration?: number | undefined;
}

export class ScheduleGenerationLogger {
  private steps: GenerationStep[] = [];
  private filteringDecisions: FilteringDecision[] = [];
  private errors: string[] = [];
  private warnings: string[] = [];
  private startTime: Date = new Date();
  private endTime?: Date;

  /**
   * Log a step in the schedule generation process
   */
  logStep(step: string, data: any, success: boolean, error?: string): void {
    const logEntry: GenerationStep = {
      step,
      timestamp: new Date(),
      data: this.sanitizeData(data),
      success,
      error
    };
    
    this.steps.push(logEntry);
    
    // Also log to console for immediate debugging
    const logLevel = success ? 'info' : 'error';
    const message = `[ScheduleGeneration] ${step}: ${success ? 'SUCCESS' : 'FAILED'}`;
    
    if (success) {
      console.log(message, data);
    } else {
      console.error(message, { data, error });
      if (error) {
        this.errors.push(`${step}: ${error}`);
      }
    }
  }

  /**
   * Log a player filtering decision
   */
  logFilteringDecision(
    playerId: string, 
    playerName: string, 
    availabilityStatus: boolean | null | undefined, 
    decision: 'included' | 'excluded', 
    reason: string
  ): void {
    const filteringDecision: FilteringDecision = {
      playerId,
      playerName,
      availabilityStatus,
      decision,
      reason,
      timestamp: new Date()
    };
    
    this.filteringDecisions.push(filteringDecision);
    
    // Log to console for immediate debugging
    console.log(`[ScheduleGeneration] Player ${decision}: ${playerName} (${playerId}) - ${reason}`, {
      availabilityStatus,
      decision
    });
  }

  /**
   * Log a warning message
   */
  logWarning(message: string): void {
    this.warnings.push(message);
    console.warn(`[ScheduleGeneration] WARNING: ${message}`);
  }

  /**
   * Log an error message
   */
  logError(message: string): void {
    this.errors.push(message);
    console.error(`[ScheduleGeneration] ERROR: ${message}`);
  }

  /**
   * Mark the end of the generation process
   */
  markComplete(): void {
    this.endTime = new Date();
  }

  /**
   * Get comprehensive debug information
   */
  getDebugInfo(weekId: string, seasonId: string, finalSchedule: any | null): DebugInfo {
    const availablePlayers = this.filteringDecisions
      .filter(d => d.decision === 'included')
      .map(d => ({ id: d.playerId, name: d.playerName, availabilityStatus: d.availabilityStatus }));
    
    const unavailablePlayers = this.filteringDecisions
      .filter(d => d.decision === 'excluded')
      .map(d => ({ id: d.playerId, name: d.playerName, availabilityStatus: d.availabilityStatus, reason: d.reason }));

    return {
      weekId,
      seasonId,
      totalPlayers: this.filteringDecisions.length,
      availablePlayers,
      unavailablePlayers,
      filteringDecisions: this.filteringDecisions,
      generationSteps: this.steps,
      finalSchedule: this.sanitizeData(finalSchedule),
      errors: this.errors,
      warnings: this.warnings,
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.endTime ? this.endTime.getTime() - this.startTime.getTime() : undefined
    };
  }

  /**
   * Clear all logged data
   */
  clear(): void {
    this.steps = [];
    this.filteringDecisions = [];
    this.errors = [];
    this.warnings = [];
    this.startTime = new Date();
    delete this.endTime;
  }

  /**
   * Get a summary of the current state
   */
  getSummary(): {
    stepCount: number;
    filteringDecisionCount: number;
    errorCount: number;
    warningCount: number;
    duration?: number | undefined;
  } {
    return {
      stepCount: this.steps.length,
      filteringDecisionCount: this.filteringDecisions.length,
      errorCount: this.errors.length,
      warningCount: this.warnings.length,
      duration: this.endTime ? this.endTime.getTime() - this.startTime.getTime() : undefined
    };
  }

  /**
   * Sanitize data for logging (remove circular references, limit size)
   */
  private sanitizeData(data: any): any {
    if (data === null || data === undefined) {
      return data;
    }

    try {
      // Convert to JSON and back to remove circular references and functions
      const jsonString = JSON.stringify(data, (key, value) => {
        // Skip functions and undefined values
        if (typeof value === 'function' || value === undefined) {
          return '[Function]';
        }
        
        // Limit array sizes for logging
        if (Array.isArray(value) && value.length > 10) {
          return [...value.slice(0, 10), `... ${value.length - 10} more items`];
        }
        
        return value;
      });
      
      // Limit string size
      if (jsonString.length > 1000) {
        return JSON.parse(jsonString.substring(0, 1000) + '...');
      }
      
      return JSON.parse(jsonString);
    } catch (error) {
      // If serialization fails, return a safe representation
      return {
        type: typeof data,
        constructor: data.constructor?.name || 'Unknown',
        toString: data.toString?.() || '[Object]'
      };
    }
  }
}