import { Schedule } from '../models/Schedule';
import { Player } from '../models/Player';
import { Week } from '../models/Week';
import { ScheduleRepository } from '../repositories/ScheduleRepository';
import { WeekRepository } from '../repositories/WeekRepository';
import { PlayerRepository } from '../repositories/PlayerRepository';
import { ScheduleGenerator } from './ScheduleGenerator';
import { PairingHistoryTracker } from './PairingHistoryTracker';
import { ScheduleBackupService, BackupMetadata } from './ScheduleBackupService';
import { applicationState } from '../state/ApplicationState';
import { AvailabilityErrorReport } from '../utils/AvailabilityErrorReporter';
import { RequestProcessingService } from './RequestProcessingService';
import { ScheduleEditService } from './ScheduleEditService';
import { ScheduleValidationService } from './ScheduleValidationService';
import { ScheduleRegenerationService } from './ScheduleRegenerationService';

// ─── Exported Types ────────────────────────────────────────────────────────────
// All types remain here so existing imports continue to work.

export interface ScheduleEditOperation {
  type: 'move_player' | 'swap_players' | 'add_player' | 'remove_player';
  playerId: string;
  fromFoursomeId?: string;
  toFoursomeId?: string;
  secondPlayerId?: string; // For swap operations
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ValidationErrorReport {
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

export interface ConflictResolution {
  conflicts: string[];
  suggestions: string[];
}

export interface RegenerationOptions {
  preserveManualEdits?: boolean;
  forceOverwrite?: boolean;
  backupRetentionDays?: number;
  notifyOnCompletion?: boolean;
  retryConfig?: Partial<RetryConfig>;
}

export interface RegenerationResult {
  success: boolean;
  newScheduleId?: string;
  backupId?: string;
  error?: string;
  changesDetected: {
    playersAdded: string[];
    playersRemoved: string[];
    pairingChanges: number;
    timeSlotChanges: number;
  };
  operationDuration: number;
}

export interface RegenerationStatus {
  weekId: string;
  status: 'idle' | 'confirming' | 'backing_up' | 'generating' | 'replacing' | 'completed' | 'failed';
  progress: number; // 0-100
  currentStep: string;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export interface RegenerationError extends Error {
  code: RegenerationErrorCode;
  weekId?: string;
  backupId?: string;
  retryable: boolean;
  category: 'backup' | 'generation' | 'replacement' | 'validation' | 'system';
}

export enum RegenerationErrorCode {
  BACKUP_CREATION_FAILED = 'BACKUP_CREATION_FAILED',
  BACKUP_RESTORATION_FAILED = 'BACKUP_RESTORATION_FAILED',
  SCHEDULE_GENERATION_FAILED = 'SCHEDULE_GENERATION_FAILED',
  ATOMIC_REPLACEMENT_FAILED = 'ATOMIC_REPLACEMENT_FAILED',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  INSUFFICIENT_PLAYERS = 'INSUFFICIENT_PLAYERS',
  CONSTRAINT_VIOLATION = 'CONSTRAINT_VIOLATION',
  CONCURRENT_OPERATION = 'CONCURRENT_OPERATION',
  STORAGE_ERROR = 'STORAGE_ERROR',
  OPERATION_TIMEOUT = 'OPERATION_TIMEOUT',
  SYSTEM_ERROR = 'SYSTEM_ERROR'
}

export interface RequestProcessingOptions {
  timeout?: number;
  retryAttempts?: number;
  retryDelayMs?: number;
  validatePreconditions?: boolean;
  enableCircuitBreaker?: boolean;
}

export interface RequestProcessingResult<T> {
  success: boolean;
  result?: T;
  error?: string;
  attempts: number;
  duration: number;
  validationResults?: ValidationResult;
  metadata: {
    requestType: string;
    weekId: string;
    timestamp: Date;
    circuitBreakerTripped?: boolean;
  };
}

export interface CircuitBreakerState {
  failures: number;
  lastFailureTime: Date | null;
  state: 'closed' | 'open' | 'half-open';
  nextAttemptTime: Date | null;
}

// ─── Façade Class ──────────────────────────────────────────────────────────────
// ScheduleManager is now a thin façade that delegates to focused services.
// The public API is unchanged so all existing call-sites and tests still work.

export class ScheduleManager {
  private regenerationStatuses: Map<string, RegenerationStatus> = new Map();
  private requestProcessingService: RequestProcessingService;
  private editService: ScheduleEditService;
  private validationService: ScheduleValidationService;
  private regenerationService: ScheduleRegenerationService;

  // Keep direct references for simple operations that don't warrant delegation
  private scheduleRepository: ScheduleRepository;
  private weekRepository: WeekRepository;
  private playerRepository: PlayerRepository;
  private scheduleGenerator: ScheduleGenerator;
  private pairingHistoryTracker: PairingHistoryTracker;
  private backupService: ScheduleBackupService;

  // Undo/redo stacks per week
  private undoStacks: Map<string, string[]> = new Map(); // weekId -> backup IDs
  private redoStacks: Map<string, string[]> = new Map(); // weekId -> backup IDs

  constructor(
    scheduleRepository: ScheduleRepository,
    weekRepository: WeekRepository,
    playerRepository: PlayerRepository,
    scheduleGenerator: ScheduleGenerator,
    pairingHistoryTracker: PairingHistoryTracker,
    backupService: ScheduleBackupService
  ) {
    this.scheduleRepository = scheduleRepository;
    this.weekRepository = weekRepository;
    this.playerRepository = playerRepository;
    this.scheduleGenerator = scheduleGenerator;
    this.pairingHistoryTracker = pairingHistoryTracker;
    this.backupService = backupService;

    // Initialize delegate services
    this.requestProcessingService = new RequestProcessingService(this.regenerationStatuses);
    this.editService = new ScheduleEditService(scheduleRepository, weekRepository, playerRepository, scheduleGenerator);
    this.validationService = new ScheduleValidationService(scheduleRepository, weekRepository, playerRepository, scheduleGenerator);
    this.regenerationService = new ScheduleRegenerationService(
      scheduleRepository, weekRepository, playerRepository, scheduleGenerator,
      backupService, this.validationService, this.regenerationStatuses
    );

    // Start periodic cleanup
    this.requestProcessingService.startPeriodicCleanup();
  }

  // ─── Schedule CRUD ─────────────────────────────────────────────────────────

  /**
   * Create a new weekly schedule with enhanced data synchronization
   */
  async createWeeklySchedule(weekId: string, options?: RequestProcessingOptions): Promise<Schedule> {
    return this.requestProcessingService.processRequest(
      'createWeeklySchedule',
      weekId,
      async () => this.createWeeklyScheduleInternal(weekId),
      options,
      (wid) => this.validationService.validateScheduleGenerationPreconditions(wid)
    );
  }

  /**
   * Get schedule for a specific week
   */
  async getSchedule(weekId: string): Promise<Schedule | null> {
    return await this.scheduleRepository.findByWeekId(weekId);
  }

  /**
   * Get all schedules for a season
   */
  async getScheduleHistory(seasonId: string): Promise<Schedule[]> {
    return await this.scheduleRepository.findBySeasonId(seasonId);
  }

  /**
   * Update an existing schedule
   */
  async updateSchedule(weekId: string, schedule: Schedule): Promise<Schedule> {
    return await this.editService.updateSchedule(weekId, schedule);
  }

  /**
   * Generate a schedule for a specific week (alias for createWeeklySchedule)
   */
  async generateSchedule(weekId: string, options?: RequestProcessingOptions): Promise<Schedule> {
    return this.requestProcessingService.processRequest(
      'generateSchedule',
      weekId,
      async () => this.createWeeklyScheduleInternal(weekId),
      options,
      (wid) => this.validationService.validateScheduleGenerationPreconditions(wid)
    );
  }

  /**
   * Delete a schedule
   */
  async deleteSchedule(weekId: string): Promise<boolean> {
    const schedule = await this.getSchedule(weekId);
    if (!schedule) return false;

    const week = await this.weekRepository.findById(weekId);
    if (week) {
      const { scheduleId, ...weekWithoutScheduleId } = week;
      await this.weekRepository.update(weekId, weekWithoutScheduleId);
    }

    return await this.scheduleRepository.delete(schedule.id);
  }

  /**
   * Generate weeks for a season
   */
  async generateWeeksForSeason(seasonId: string, numberOfWeeks: number): Promise<Week[]> {
    if (!seasonId || seasonId.trim().length === 0) throw new Error('Season ID is required');
    if (numberOfWeeks <= 0) throw new Error('Number of weeks must be greater than 0');

    const weeks: Week[] = [];
    const startDate = new Date();

    for (let i = 0; i < numberOfWeeks; i++) {
      const weekDate = new Date(startDate);
      weekDate.setDate(startDate.getDate() + (i * 7));

      const week = await this.weekRepository.create({
        seasonId,
        weekNumber: i + 1,
        date: weekDate
      });
      weeks.push(week);
    }

    return weeks;
  }

  /**
   * Generate schedules for multiple weeks at once, maximizing partner variety
   * across the full set by finalizing pairing history after each week.
   */
  async generateMultiWeekSchedules(
    weekIds: string[],
    options?: RequestProcessingOptions
  ): Promise<Schedule[]> {
    if (!weekIds.length) throw new Error('At least one week ID is required');

    const schedules: Schedule[] = [];

    for (const weekId of weekIds) {
      const schedule = await this.generateSchedule(weekId, options);
      schedules.push(schedule);
    }

    return schedules;
  }

  /**
   * Create a backup before an edit and push to undo stack
   */
  async pushUndoState(weekId: string): Promise<void> {
    const schedule = await this.getSchedule(weekId);
    if (!schedule) return;

    const backup = await this.backupService.createBackup(schedule);
    const stack = this.undoStacks.get(weekId) ?? [];
    stack.push(backup.id);
    this.undoStacks.set(weekId, stack);

    // Clear redo stack on new edit
    this.redoStacks.set(weekId, []);
  }

  /**
   * Undo the last schedule change for a week
   */
  async undo(weekId: string): Promise<Schedule | null> {
    const undoStack = this.undoStacks.get(weekId);
    if (!undoStack || undoStack.length === 0) return null;

    // Save current state for redo
    const currentSchedule = await this.getSchedule(weekId);
    if (currentSchedule) {
      const redoBackup = await this.backupService.createBackup(currentSchedule);
      const redoStack = this.redoStacks.get(weekId) ?? [];
      redoStack.push(redoBackup.id);
      this.redoStacks.set(weekId, redoStack);
    }

    // Restore from undo backup
    const backupId = undoStack.pop()!;
    this.undoStacks.set(weekId, undoStack);

    const restored = await this.backupService.restoreBackup(backupId);
    await this.scheduleRepository.update(restored.id, restored);
    return restored;
  }

  /**
   * Redo a previously undone change for a week
   */
  async redo(weekId: string): Promise<Schedule | null> {
    const redoStack = this.redoStacks.get(weekId);
    if (!redoStack || redoStack.length === 0) return null;

    // Save current state for undo
    const currentSchedule = await this.getSchedule(weekId);
    if (currentSchedule) {
      const undoBackup = await this.backupService.createBackup(currentSchedule);
      const undoStack = this.undoStacks.get(weekId) ?? [];
      undoStack.push(undoBackup.id);
      this.undoStacks.set(weekId, undoStack);
    }

    // Restore from redo backup
    const backupId = redoStack.pop()!;
    this.redoStacks.set(weekId, redoStack);

    const restored = await this.backupService.restoreBackup(backupId);
    await this.scheduleRepository.update(restored.id, restored);
    return restored;
  }

  /**
   * Check if undo is available for a week
   */
  canUndo(weekId: string): boolean {
    const stack = this.undoStacks.get(weekId);
    return !!stack && stack.length > 0;
  }

  /**
   * Check if redo is available for a week
   */
  canRedo(weekId: string): boolean {
    const stack = this.redoStacks.get(weekId);
    return !!stack && stack.length > 0;
  }

  // ─── Internal Schedule Creation ────────────────────────────────────────────

  private async createWeeklyScheduleInternal(weekId: string): Promise<Schedule> {
    const existingSchedule = await this.scheduleRepository.findByWeekId(weekId);
    if (existingSchedule) throw new Error(`Schedule already exists for week ${weekId}`);

    console.log(`[ScheduleManager] Starting data refresh for week ${weekId}`);
    const refreshedData = await this.refreshDataForScheduleGeneration(weekId);

    console.log(`[ScheduleManager] Validating data consistency for week ${weekId}`);
    const consistencyValidation = await this.validationService.validateDataConsistency(refreshedData.week, refreshedData.allPlayers);
    if (!consistencyValidation.isValid) {
      throw new Error(`Data consistency validation failed: ${consistencyValidation.errors.join(', ')}`);
    }

    console.log(`[ScheduleManager] Generating player data summary for week ${weekId}`);
    const playerDataSummary = await this.generatePlayerDataSummary(refreshedData.week, refreshedData.allPlayers);
    console.log(`[ScheduleManager] Player data summary:`, playerDataSummary);

    const schedule = await this.scheduleGenerator.generateScheduleForWeek(refreshedData.week, refreshedData.allPlayers);

    const savedSchedule = await this.scheduleRepository.create({ weekId });

    const updatedSchedule = await this.scheduleRepository.update(savedSchedule.id, {
      timeSlots: schedule.timeSlots,
      lastModified: new Date()
    });

    if (!updatedSchedule) throw new Error('Failed to update schedule with generated data');

    await this.weekRepository.update(weekId, { scheduleId: updatedSchedule.id });

    console.log(`[ScheduleManager] Schedule created successfully for week ${weekId} with ${schedule.getTotalPlayerCount()} players`);
    return updatedSchedule;
  }

  private async refreshDataForScheduleGeneration(weekId: string): Promise<{ week: Week; allPlayers: Player[] }> {
    const week = await this.weekRepository.findById(weekId);
    if (!week) throw new Error(`Week ${weekId} not found`);

    const allPlayers = await this.playerRepository.findBySeasonId(week.seasonId);

    console.log(`[ScheduleManager] Data refreshed - Week: ${weekId}, Season: ${week.seasonId}, Players: ${allPlayers.length}`);

    return { week, allPlayers };
  }

  private async generatePlayerDataSummary(week: Week, allPlayers: Player[]): Promise<any> {
    const playerAvailability = week.playerAvailability || {};

    const playersWithAvailabilityData = Object.keys(playerAvailability).length;
    const playersWithoutAvailabilityData = allPlayers.length - playersWithAvailabilityData;

    let availablePlayerCount = 0;
    let unavailablePlayerCount = 0;
    let nullAvailabilityCount = 0;

    for (const [, status] of Object.entries(playerAvailability)) {
      if (status === true) availablePlayerCount++;
      else if (status === false) unavailablePlayerCount++;
      else nullAvailabilityCount++;
    }

    const timePreferenceDistribution = {
      AM: allPlayers.filter(p => p.timePreference === 'AM').length,
      PM: allPlayers.filter(p => p.timePreference === 'PM').length,
      Either: allPlayers.filter(p => p.timePreference === 'Either').length
    };

    const handednessDistribution = {
      left: allPlayers.filter(p => p.handedness === 'left').length,
      right: allPlayers.filter(p => p.handedness === 'right').length
    };

    const availabilityByTimePreference = {
      AM: { available: 0, unavailable: 0, noData: 0 },
      PM: { available: 0, unavailable: 0, noData: 0 },
      Either: { available: 0, unavailable: 0, noData: 0 }
    };

    for (const player of allPlayers) {
      const status = playerAvailability[player.id];
      const pref = player.timePreference as 'AM' | 'PM' | 'Either';

      if (status === true) availabilityByTimePreference[pref].available++;
      else if (status === false) availabilityByTimePreference[pref].unavailable++;
      else availabilityByTimePreference[pref].noData++;
    }

    const playerDetails = allPlayers.map(player => {
      const availabilityStatus = playerAvailability[player.id];
      const hasAvailabilityData = player.id in playerAvailability;

      let availabilityReason: string;
      if (availabilityStatus === true) availabilityReason = 'Explicitly marked as available';
      else if (availabilityStatus === false) availabilityReason = 'Explicitly marked as unavailable';
      else if (availabilityStatus === null) availabilityReason = 'Availability data is null';
      else if (availabilityStatus === undefined && hasAvailabilityData) availabilityReason = 'Availability data is undefined';
      else availabilityReason = 'No availability data provided';

      return {
        id: player.id,
        name: `${player.firstName} ${player.lastName}`,
        seasonId: player.seasonId,
        timePreference: player.timePreference,
        handedness: player.handedness,
        hasAvailabilityData,
        availabilityStatus,
        availabilityReason
      };
    });

    const summary = {
      seasonId: week.seasonId,
      weekId: week.id,
      weekNumber: week.weekNumber,
      totalPlayers: allPlayers.length,
      playersWithAvailabilityData,
      playersWithoutAvailabilityData,
      availablePlayerCount,
      unavailablePlayerCount,
      nullAvailabilityCount,
      timePreferenceDistribution,
      handednessDistribution,
      availabilityByTimePreference,
      playerDetails
    };

    console.log(`[ScheduleManager] Player data summary generated:`, {
      totalPlayers: summary.totalPlayers,
      availablePlayerCount: summary.availablePlayerCount,
      unavailablePlayerCount: summary.unavailablePlayerCount,
      playersWithoutData: summary.playersWithoutAvailabilityData
    });

    return summary;
  }

  // ─── Manual Editing (delegated to ScheduleEditService) ─────────────────────

  async applyManualEdit(weekId: string, operation: ScheduleEditOperation): Promise<Schedule> {
    return await this.editService.applyManualEdit(weekId, operation);
  }

  async validateManualEdit(weekId: string, schedule: Schedule): Promise<ValidationResult> {
    return await this.editService.validateManualEdit(weekId, schedule);
  }

  async detectConflicts(weekId: string, schedule: Schedule): Promise<ConflictResolution> {
    return await this.editService.detectConflicts(weekId, schedule);
  }

  // ─── Finalization ──────────────────────────────────────────────────────────

  async finalizeSchedule(weekId: string): Promise<Schedule> {
    const schedule = await this.getSchedule(weekId);
    if (!schedule) throw new Error(`Schedule not found for week ${weekId}`);

    const week = await this.weekRepository.findById(weekId);
    if (!week) throw new Error(`Week ${weekId} not found`);

    const allPlayers = await this.playerRepository.findBySeasonId(week.seasonId);
    const availablePlayers = this.scheduleGenerator.filterAvailablePlayers(allPlayers, week);

    const validation = await this.validationService.validateScheduleConstraints(schedule, availablePlayers, week);
    if (!validation.isValid) {
      const conflictReport = this.validationService.generateAvailabilityConflictReport(schedule, week);

      let errorMessage = `Cannot finalize schedule due to validation errors: ${validation.errors.join(', ')}`;

      if (conflictReport.conflicts.length > 0) {
        errorMessage += `\n\nAvailability Conflicts Detected:\n`;
        conflictReport.conflicts.forEach(conflict => {
          errorMessage += `- ${conflict.playerName} (${conflict.timeSlot} slot, position ${conflict.foursomePosition}): `;
          if (conflict.availabilityStatus === false) errorMessage += 'marked as unavailable\n';
          else errorMessage += 'no availability data\n';
        });

        if (conflictReport.suggestions.length > 0) {
          errorMessage += `\nSuggested Actions:\n`;
          conflictReport.suggestions.forEach(suggestion => {
            errorMessage += `- ${suggestion}\n`;
          });
        }
      }

      throw new Error(errorMessage);
    }

    await this.pairingHistoryTracker.trackSchedulePairings(week.seasonId, schedule);

    const finalizedSchedule = await this.scheduleRepository.update(schedule.id, {
      lastModified: new Date()
    });

    if (!finalizedSchedule) throw new Error('Failed to finalize schedule');

    return finalizedSchedule;
  }

  // ─── Regeneration (delegated to ScheduleRegenerationService) ───────────────

  async regenerateSchedule(weekId: string, options?: RegenerationOptions): Promise<RegenerationResult> {
    return await this.regenerationService.regenerateSchedule(weekId, options);
  }

  async createScheduleBackup(weekId: string): Promise<BackupMetadata> {
    return await this.regenerationService.createScheduleBackup(weekId);
  }

  async restoreFromBackup(weekId: string, backupId: string): Promise<void> {
    return await this.regenerationService.restoreFromBackup(weekId, backupId);
  }

  getRegenerationStatus(weekId: string): RegenerationStatus | null {
    return this.regenerationService.getRegenerationStatus(weekId);
  }

  async setRegenerationLock(weekId: string, locked: boolean): Promise<void> {
    return await this.regenerationService.setRegenerationLock(weekId, locked);
  }

  async isRegenerationAllowed(weekId: string): Promise<boolean> {
    return await this.regenerationService.isRegenerationAllowed(weekId);
  }

  forceCleanupAllRegenerationStatuses(): void {
    this.regenerationService.forceCleanupAllRegenerationStatuses();
  }

  async forceReleaseRegenerationLock(weekId: string): Promise<void> {
    return await this.regenerationService.forceReleaseRegenerationLock(weekId);
  }

  // ─── Validation (delegated to ScheduleValidationService) ───────────────────

  async validatePreRegenerationConstraints(weekId: string): Promise<ValidationResult> {
    return await this.validationService.validatePreRegenerationConstraints(
      weekId,
      (wid) => this.regenerationService.getRegenerationStatus(wid)
    );
  }

  async validateScheduleConstraints(schedule: Schedule, availablePlayers: Player[], week: Week): Promise<ValidationResult> {
    return await this.validationService.validateScheduleConstraints(schedule, availablePlayers, week);
  }

  async validateBusinessRules(schedule: Schedule, week: Week): Promise<ValidationResult> {
    return await this.validationService.validateBusinessRules(schedule, week);
  }

  generateAvailabilityConflictReport(schedule: Schedule, week: Week): {
    conflicts: Array<{
      playerId: string;
      playerName: string;
      availabilityStatus: boolean | null;
      timeSlot: 'morning' | 'afternoon';
      foursomePosition: number;
    }>;
    suggestions: string[];
  } {
    return this.validationService.generateAvailabilityConflictReport(schedule, week);
  }

  generateValidationErrorReport(
    preValidation: ValidationResult,
    scheduleValidation?: ValidationResult,
    businessRuleValidation?: ValidationResult
  ): { errors: string[]; warnings: string[]; suggestions: string[] } {
    return this.validationService.generateValidationErrorReport(preValidation, scheduleValidation, businessRuleValidation);
  }

  async generateDetailedAvailabilityReport(schedule: Schedule, week: Week): Promise<AvailabilityErrorReport> {
    return await this.validationService.generateDetailedAvailabilityReport(schedule, week);
  }

  getAvailabilityFilteringHistory(limit?: number): Array<{
    playerId: string;
    playerName: string;
    availabilityStatus: boolean | null | undefined;
    decision: 'included' | 'excluded';
    reason: string;
    timestamp: Date;
  }> {
    return this.validationService.getAvailabilityFilteringHistory(limit);
  }

  clearAvailabilityFilteringHistory(): void {
    this.validationService.clearAvailabilityFilteringHistory();
  }

  // ─── Request Processing (delegated to RequestProcessingService) ────────────

  getCircuitBreakerStatus(requestType?: string, weekId?: string): Map<string, CircuitBreakerState> | CircuitBreakerState | null {
    return this.requestProcessingService.getCircuitBreakerStatus(requestType, weekId);
  }

  resetCircuitBreaker(key?: string): void {
    this.requestProcessingService.resetCircuitBreaker(key);
  }

  stopPeriodicCleanup(): void {
    this.requestProcessingService.stopPeriodicCleanup();
  }

  // ─── Debug Methods ─────────────────────────────────────────────────────────

  async debugScheduleGeneration(weekId: string): Promise<{
    weekInfo: any;
    playerData: any[];
    availabilityData: any;
    generationAttempt: any;
    validationResults: ValidationResult;
    errorReport: AvailabilityErrorReport;
    preconditionCheck: any;
  }> {
    try {
      const week = await this.weekRepository.findById(weekId);
      if (!week) throw new Error(`Week ${weekId} not found`);

      const allPlayers = await this.playerRepository.findBySeasonId(week.seasonId);
      const playerData = await this.getPlayerDataForWeek(weekId);
      const preconditionCheck = await this.validationService.validateScheduleGenerationPreconditions(weekId);

      let generationAttempt: any = {};
      let validationResults: ValidationResult = { isValid: false, errors: [], warnings: [] };

      try {
        const schedule = await this.scheduleGenerator.generateScheduleForWeek(week, allPlayers);
        const debugInfo = this.scheduleGenerator.getDebugInfo();
        const availablePlayers = this.scheduleGenerator.filterAvailablePlayers(allPlayers, week);
        const validation = this.scheduleGenerator.validateSchedule(schedule, availablePlayers, week);

        generationAttempt = {
          success: true,
          schedule: {
            weekId: schedule.weekId,
            morningFoursomes: schedule.timeSlots.morning.length,
            afternoonFoursomes: schedule.timeSlots.afternoon.length,
            totalPlayers: schedule.getTotalPlayerCount()
          },
          debugInfo
        };

        validationResults = { isValid: validation.isValid, errors: validation.errors, warnings: [] };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        generationAttempt = { success: false, error: errorMessage, debugInfo: this.scheduleGenerator.getDebugInfo() };
        validationResults = { isValid: false, errors: [errorMessage], warnings: [] };
      }

      const errorReport: AvailabilityErrorReport = {
        conflicts: [],
        suggestions: [],
        summary: {
          totalConflicts: 0,
          errorCount: 0,
          warningCount: 0,
          affectedTimeSlots: [],
          affectedPlayers: []
        },
        metadata: {
          weekId,
          weekNumber: week.weekNumber,
          seasonId: week.seasonId,
          reportGeneratedAt: new Date(),
          reportId: `debug-${Date.now()}`
        }
      };

      return {
        weekInfo: {
          id: week.id,
          seasonId: week.seasonId,
          weekNumber: week.weekNumber,
          date: week.date,
          playerAvailabilityCount: Object.keys(week.playerAvailability || {}).length,
          availablePlayerCount: Object.values(week.playerAvailability || {}).filter(v => v === true).length
        },
        playerData,
        availabilityData: {
          totalPlayers: allPlayers.length,
          playersWithAvailabilityData: Object.keys(week.playerAvailability || {}).length,
          availablePlayers: Object.values(week.playerAvailability || {}).filter(v => v === true).length,
          unavailablePlayers: Object.values(week.playerAvailability || {}).filter(v => v === false).length,
          playersWithoutData: allPlayers.length - Object.keys(week.playerAvailability || {}).length
        },
        generationAttempt,
        validationResults,
        errorReport,
        preconditionCheck
      };
    } catch (error) {
      throw new Error(`Debug schedule generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async validateScheduleGenerationPreconditions(weekId: string): Promise<{
    isValid: boolean;
    checks: Array<{ name: string; passed: boolean; message: string; details?: any }>;
  }> {
    return await this.validationService.validateScheduleGenerationPreconditions(weekId);
  }

  async getPlayerDataForWeek(weekId: string): Promise<Array<{
    id: string;
    name: string;
    timePreference: string;
    handedness: string;
    seasonId: string;
    availabilityStatus: boolean | null | undefined;
    availabilityReason: string;
  }>> {
    try {
      const week = await this.weekRepository.findById(weekId);
      if (!week) throw new Error(`Week ${weekId} not found`);

      const allPlayers = await this.playerRepository.findBySeasonId(week.seasonId);

      return allPlayers.map(player => {
        const availabilityStatus = week.playerAvailability?.[player.id];
        let availabilityReason: string;

        if (availabilityStatus === true) availabilityReason = 'Explicitly marked as available';
        else if (availabilityStatus === false) availabilityReason = 'Explicitly marked as unavailable';
        else if (availabilityStatus === null) availabilityReason = 'Availability data is null';
        else if (availabilityStatus === undefined) availabilityReason = 'No availability data provided';
        else availabilityReason = `Unknown availability status: ${availabilityStatus}`;

        return {
          id: player.id,
          name: `${player.firstName} ${player.lastName}`,
          timePreference: player.timePreference,
          handedness: player.handedness,
          seasonId: player.seasonId,
          availabilityStatus,
          availabilityReason
        };
      });
    } catch (error) {
      throw new Error(`Failed to get player data for week: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}