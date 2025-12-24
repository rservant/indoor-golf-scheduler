import { Schedule, ScheduleModel } from '../models/Schedule';
import { FoursomeModel } from '../models/Foursome';
import { Player } from '../models/Player';
import { Week } from '../models/Week';
import { ScheduleRepository } from '../repositories/ScheduleRepository';
import { WeekRepository } from '../repositories/WeekRepository';
import { PlayerRepository } from '../repositories/PlayerRepository';
import { ScheduleGenerator } from './ScheduleGenerator';
import { PairingHistoryTracker } from './PairingHistoryTracker';
import { ScheduleBackupService, BackupMetadata } from './ScheduleBackupService';
import { errorHandler, ErrorContext } from '../utils/ErrorHandler';
import { applicationState } from '../state/ApplicationState';
import { AvailabilityErrorReporter, AvailabilityErrorReport } from '../utils/AvailabilityErrorReporter';

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

export class ScheduleManager {
  private regenerationStatuses: Map<string, RegenerationStatus> = new Map();
  private readonly defaultRetryConfig: RetryConfig = {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 8000,
    backoffMultiplier: 2
  };
  private cleanupTimer: NodeJS.Timeout | null = null;
  private availabilityErrorReporter: AvailabilityErrorReporter;

  constructor(
    private scheduleRepository: ScheduleRepository,
    private weekRepository: WeekRepository,
    private playerRepository: PlayerRepository,
    private scheduleGenerator: ScheduleGenerator,
    private pairingHistoryTracker: PairingHistoryTracker,
    private backupService: ScheduleBackupService
  ) {
    // Initialize enhanced error reporting
    this.availabilityErrorReporter = new AvailabilityErrorReporter();
    
    // Start periodic cleanup of expired operations
    this.startPeriodicCleanup();
  }

  /**
   * Start periodic cleanup of expired operations and locks
   */
  private startPeriodicCleanup(): void {
    // Clean up every 2 minutes
    const CLEANUP_INTERVAL_MS = 2 * 60 * 1000;
    
    this.cleanupTimer = setInterval(async () => {
      try {
        await this.cleanupExpiredOperations();
      } catch (error) {
        console.error('Periodic cleanup failed:', error);
      }
    }, CLEANUP_INTERVAL_MS);
  }

  /**
   * Stop periodic cleanup (for testing or shutdown)
   */
  stopPeriodicCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Create a new weekly schedule
   */
  async createWeeklySchedule(weekId: string): Promise<Schedule> {
    // Check if schedule already exists for this week
    const existingSchedule = await this.scheduleRepository.findByWeekId(weekId);
    if (existingSchedule) {
      throw new Error(`Schedule already exists for week ${weekId}`);
    }

    // Get week information
    const week = await this.weekRepository.findById(weekId);
    if (!week) {
      throw new Error(`Week ${weekId} not found`);
    }

    // Get all players for the season
    const allPlayers = await this.playerRepository.findBySeasonId(week.seasonId);
    
    // Generate schedule using the schedule generator
    const schedule = await this.scheduleGenerator.generateScheduleForWeek(week, allPlayers);
    
    // Save the schedule
    const savedSchedule = await this.scheduleRepository.create({ weekId });
    
    // Update the saved schedule with generated data
    const updatedSchedule = await this.scheduleRepository.update(savedSchedule.id, {
      timeSlots: schedule.timeSlots,
      lastModified: new Date()
    });

    if (!updatedSchedule) {
      throw new Error('Failed to update schedule with generated data');
    }

    // Update week to reference this schedule
    await this.weekRepository.update(weekId, { scheduleId: updatedSchedule.id });

    return updatedSchedule;
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
    const existingSchedule = await this.scheduleRepository.findByWeekId(weekId);
    if (!existingSchedule) {
      throw new Error(`Schedule not found for week ${weekId}`);
    }

    // Validate the updated schedule
    const week = await this.weekRepository.findById(weekId);
    if (!week) {
      throw new Error(`Week ${weekId} not found`);
    }

    const allPlayers = await this.playerRepository.findBySeasonId(week.seasonId);
    const availablePlayers = this.scheduleGenerator.filterAvailablePlayers(allPlayers, week);
    
    const validation = this.scheduleGenerator.validateSchedule(schedule, availablePlayers);
    if (!validation.isValid) {
      throw new Error(`Schedule validation failed: ${validation.errors.join(', ')}`);
    }

    const updatedSchedule = await this.scheduleRepository.update(existingSchedule.id, {
      timeSlots: schedule.timeSlots,
      lastModified: new Date()
    });

    if (!updatedSchedule) {
      throw new Error('Failed to update schedule');
    }

    return updatedSchedule;
  }

  /**
   * Apply a manual edit operation to a schedule
   */
  async applyManualEdit(weekId: string, operation: ScheduleEditOperation): Promise<Schedule> {
    const schedule = await this.getSchedule(weekId);
    if (!schedule) {
      throw new Error(`Schedule not found for week ${weekId}`);
    }

    // Create a mutable copy of the schedule
    const scheduleModel = new ScheduleModel({
      ...schedule,
      timeSlots: {
        morning: schedule.timeSlots.morning.map(f => new FoursomeModel(f)),
        afternoon: schedule.timeSlots.afternoon.map(f => new FoursomeModel(f))
      }
    });

    // Apply the operation
    await this.executeEditOperation(scheduleModel, operation);

    // Validate the modified schedule
    const validation = await this.validateManualEdit(weekId, scheduleModel);
    if (!validation.isValid) {
      throw new Error(`Manual edit validation failed: ${validation.errors.join(', ')}`);
    }

    // Update the schedule
    return await this.updateSchedule(weekId, scheduleModel);
  }

  /**
   * Execute a specific edit operation on a schedule
   */
  private async executeEditOperation(schedule: ScheduleModel, operation: ScheduleEditOperation): Promise<void> {
    const allFoursomes = [
      ...schedule.timeSlots.morning.map(f => f instanceof FoursomeModel ? f : new FoursomeModel(f)),
      ...schedule.timeSlots.afternoon.map(f => f instanceof FoursomeModel ? f : new FoursomeModel(f))
    ];

    switch (operation.type) {
      case 'move_player':
        await this.movePlayer(allFoursomes, operation.playerId, operation.fromFoursomeId!, operation.toFoursomeId!);
        break;
      
      case 'swap_players':
        await this.swapPlayers(allFoursomes, operation.playerId, operation.secondPlayerId!);
        break;
      
      case 'add_player':
        await this.addPlayerToFoursome(allFoursomes, operation.playerId, operation.toFoursomeId!);
        break;
      
      case 'remove_player':
        await this.removePlayerFromFoursome(allFoursomes, operation.playerId, operation.fromFoursomeId!);
        break;
      
      default:
        throw new Error(`Unknown operation type: ${(operation as any).type}`);
    }

    // Update the schedule with modified foursomes
    schedule.timeSlots.morning = allFoursomes.filter(f => f.timeSlot === 'morning');
    schedule.timeSlots.afternoon = allFoursomes.filter(f => f.timeSlot === 'afternoon');
  }

  /**
   * Move a player from one foursome to another
   */
  private async movePlayer(foursomes: FoursomeModel[], playerId: string, fromFoursomeId: string, toFoursomeId: string): Promise<void> {
    const fromFoursome = foursomes.find(f => f.id === fromFoursomeId);
    const toFoursome = foursomes.find(f => f.id === toFoursomeId);

    if (!fromFoursome) {
      throw new Error(`Source foursome ${fromFoursomeId} not found`);
    }
    if (!toFoursome) {
      throw new Error(`Target foursome ${toFoursomeId} not found`);
    }

    const player = fromFoursome.players.find(p => p.id === playerId);
    if (!player) {
      throw new Error(`Player ${playerId} not found in source foursome`);
    }

    if (toFoursome.isFull()) {
      throw new Error('Target foursome is already full (4 players)');
    }

    // Remove from source and add to target
    fromFoursome.removePlayer(playerId);
    toFoursome.addPlayer(player);
  }

  /**
   * Swap two players between foursomes
   */
  private async swapPlayers(foursomes: FoursomeModel[], playerId1: string, playerId2: string): Promise<void> {
    let foursome1: FoursomeModel | undefined;
    let foursome2: FoursomeModel | undefined;
    let player1: Player | undefined;
    let player2: Player | undefined;

    // Find the foursomes and players
    for (const foursome of foursomes) {
      const p1 = foursome.players.find(p => p.id === playerId1);
      const p2 = foursome.players.find(p => p.id === playerId2);
      
      if (p1) {
        foursome1 = foursome;
        player1 = p1;
      }
      if (p2) {
        foursome2 = foursome;
        player2 = p2;
      }
    }

    if (!foursome1 || !player1) {
      throw new Error(`Player ${playerId1} not found in any foursome`);
    }
    if (!foursome2 || !player2) {
      throw new Error(`Player ${playerId2} not found in any foursome`);
    }

    // Remove both players
    foursome1.removePlayer(playerId1);
    foursome2.removePlayer(playerId2);

    // Add them to opposite foursomes
    foursome1.addPlayer(player2);
    foursome2.addPlayer(player1);
  }

  /**
   * Add a player to a specific foursome
   */
  private async addPlayerToFoursome(foursomes: FoursomeModel[], _playerId: string, foursomeId: string): Promise<void> {
    const foursome = foursomes.find(f => f.id === foursomeId);
    if (!foursome) {
      throw new Error(`Foursome ${foursomeId} not found`);
    }

    if (foursome.isFull()) {
      throw new Error('Foursome is already full (4 players)');
    }

    // This would require getting the player from the repository
    // For now, we'll throw an error as this operation needs more context
    throw new Error('Add player operation requires player data from repository');
  }

  /**
   * Remove a player from a specific foursome
   */
  private async removePlayerFromFoursome(foursomes: FoursomeModel[], playerId: string, foursomeId: string): Promise<void> {
    const foursome = foursomes.find(f => f.id === foursomeId);
    if (!foursome) {
      throw new Error(`Foursome ${foursomeId} not found`);
    }

    const removed = foursome.removePlayer(playerId);
    if (!removed) {
      throw new Error(`Player ${playerId} not found in foursome ${foursomeId}`);
    }
  }

  /**
   * Validate a manual edit to ensure all constraints are met
   */
  async validateManualEdit(weekId: string, schedule: Schedule): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Get week and player information
    const week = await this.weekRepository.findById(weekId);
    if (!week) {
      errors.push(`Week ${weekId} not found`);
      return { isValid: false, errors, warnings };
    }

    const allPlayers = await this.playerRepository.findBySeasonId(week.seasonId);
    const availablePlayers = this.scheduleGenerator.filterAvailablePlayers(allPlayers, week);

    // Use the schedule generator's validation
    const validation = this.scheduleGenerator.validateSchedule(schedule, availablePlayers);
    errors.push(...validation.errors);

    // Additional manual edit specific validations
    const allFoursomes = [...schedule.timeSlots.morning, ...schedule.timeSlots.afternoon];
    
    // Check for empty foursomes
    const emptyFoursomes = allFoursomes.filter(f => f.players.length === 0);
    if (emptyFoursomes.length > 0) {
      warnings.push(`${emptyFoursomes.length} empty foursome(s) found`);
    }

    // Check for overfull foursomes (should be caught by model validation, but double-check)
    const overfullFoursomes = allFoursomes.filter(f => f.players.length > 4);
    if (overfullFoursomes.length > 0) {
      errors.push(`${overfullFoursomes.length} foursome(s) have more than 4 players`);
    }

    // Check time slot consistency
    schedule.timeSlots.morning.forEach((foursome, index) => {
      if (foursome.timeSlot !== 'morning') {
        errors.push(`Morning foursome at position ${index} has incorrect timeSlot: ${foursome.timeSlot}`);
      }
    });

    schedule.timeSlots.afternoon.forEach((foursome, index) => {
      if (foursome.timeSlot !== 'afternoon') {
        errors.push(`Afternoon foursome at position ${index} has incorrect timeSlot: ${foursome.timeSlot}`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Detect conflicts and provide resolution suggestions
   */
  async detectConflicts(weekId: string, schedule: Schedule): Promise<ConflictResolution> {
    const validation = await this.validateManualEdit(weekId, schedule);
    const conflicts = validation.errors;
    const suggestions: string[] = [];

    // Analyze conflicts and provide suggestions
    for (const conflict of conflicts) {
      if (conflict.includes('has PM preference but is scheduled in morning')) {
        suggestions.push('Move PM-preference players to afternoon time slots');
      } else if (conflict.includes('has AM preference but is scheduled in afternoon')) {
        suggestions.push('Move AM-preference players to morning time slots');
      } else if (conflict.includes('appears') && conflict.includes('times in schedule')) {
        suggestions.push('Remove duplicate player assignments');
      } else if (conflict.includes('not in available players')) {
        suggestions.push('Remove unavailable players from schedule');
      } else if (conflict.includes('more than 4 players')) {
        suggestions.push('Move excess players to other foursomes or create new foursomes');
      }
    }

    return { conflicts, suggestions };
  }

  /**
   * Finalize a schedule and update pairing history
   * Blocks finalization if availability violations are detected
   */
  async finalizeSchedule(weekId: string): Promise<Schedule> {
    const schedule = await this.getSchedule(weekId);
    if (!schedule) {
      throw new Error(`Schedule not found for week ${weekId}`);
    }

    // Get week information to get season ID
    const week = await this.weekRepository.findById(weekId);
    if (!week) {
      throw new Error(`Week ${weekId} not found`);
    }

    // Get all players for availability validation
    const allPlayers = await this.playerRepository.findBySeasonId(week.seasonId);
    const availablePlayers = this.scheduleGenerator.filterAvailablePlayers(allPlayers, week);

    // Validate the schedule before finalizing with enhanced availability checks
    const validation = await this.validateScheduleConstraints(schedule, availablePlayers, week);
    if (!validation.isValid) {
      // Generate detailed conflict report for availability violations
      const conflictReport = this.generateAvailabilityConflictReport(schedule, week);
      
      let errorMessage = `Cannot finalize schedule due to validation errors: ${validation.errors.join(', ')}`;
      
      if (conflictReport.conflicts.length > 0) {
        errorMessage += `\n\nAvailability Conflicts Detected:\n`;
        conflictReport.conflicts.forEach(conflict => {
          errorMessage += `- ${conflict.playerName} (${conflict.timeSlot} slot, position ${conflict.foursomePosition}): `;
          if (conflict.availabilityStatus === false) {
            errorMessage += 'marked as unavailable\n';
          } else {
            errorMessage += 'no availability data\n';
          }
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

    // Update pairing history
    await this.pairingHistoryTracker.trackSchedulePairings(week.seasonId, schedule);

    // Mark schedule as finalized (update lastModified to indicate finalization)
    const finalizedSchedule = await this.scheduleRepository.update(schedule.id, {
      lastModified: new Date()
    });

    if (!finalizedSchedule) {
      throw new Error('Failed to finalize schedule');
    }

    return finalizedSchedule;
  }

  /**
   * Delete a schedule
   */
  async deleteSchedule(weekId: string): Promise<boolean> {
    const schedule = await this.getSchedule(weekId);
    if (!schedule) {
      return false;
    }

    // Remove schedule reference from week by omitting scheduleId
    const week = await this.weekRepository.findById(weekId);
    if (week) {
      const { scheduleId, ...weekWithoutScheduleId } = week;
      await this.weekRepository.update(weekId, weekWithoutScheduleId);
    }

    // Delete the schedule
    return await this.scheduleRepository.delete(schedule.id);
  }

  /**
   * Generate weeks for a season
   */
  async generateWeeksForSeason(seasonId: string, numberOfWeeks: number): Promise<import('../models/Week').Week[]> {
    if (!seasonId || seasonId.trim().length === 0) {
      throw new Error('Season ID is required');
    }
    
    if (numberOfWeeks <= 0) {
      throw new Error('Number of weeks must be greater than 0');
    }

    const weeks: import('../models/Week').Week[] = [];
    const startDate = new Date(); // Start from current date

    for (let i = 0; i < numberOfWeeks; i++) {
      const weekDate = new Date(startDate);
      weekDate.setDate(startDate.getDate() + (i * 7)); // Each week is 7 days apart

      const weekData = {
        seasonId,
        weekNumber: i + 1,
        date: weekDate
      };

      const week = await this.weekRepository.create(weekData);
      weeks.push(week);
    }

    return weeks;
  }

  /**
   * Generate a schedule for a specific week
   * Alias for createWeeklySchedule for API compatibility
   */
  async generateSchedule(weekId: string): Promise<Schedule> {
    return await this.createWeeklySchedule(weekId);
  }

  /**
   * Regenerate an existing schedule with user confirmation workflow
   */
  async regenerateSchedule(weekId: string, options?: RegenerationOptions): Promise<RegenerationResult> {
    const startTime = Date.now();
    
    try {
      // Check if regeneration is already in progress for this week
      const currentStatus = this.getRegenerationStatus(weekId);
      if (currentStatus && ['confirming', 'backing_up', 'generating', 'replacing'].includes(currentStatus.status)) {
        const operationDuration = Date.now() - startTime;
        return {
          success: false,
          error: 'Another regeneration operation is currently in progress',
          changesDetected: {
            playersAdded: [],
            playersRemoved: [],
            pairingChanges: 0,
            timeSlotChanges: 0
          },
          operationDuration
        };
      }

      // NOTE: We no longer set the initial status here - the UI should set the lock
      // before calling this method. This prevents premature lock setting.

      // Execute regeneration with comprehensive error handling and retry
      const result = await this.executeRegenerationWithRetry(weekId, options);
      
      const operationDuration = Date.now() - startTime;
      return { ...result, operationDuration };

    } catch (error) {
      // Set error status
      this.setRegenerationStatus(weekId, {
        weekId,
        status: 'failed',
        progress: 0,
        currentStep: 'Failed',
        startedAt: this.regenerationStatuses.get(weekId)?.startedAt || new Date(),
        completedAt: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Attempt comprehensive error recovery
      await this.handleRegenerationFailure(weekId, error);

      // Perform cleanup even on failure
      await this.clearRegenerationStatusAndCleanup(weekId);

      const operationDuration = Date.now() - startTime;

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        changesDetected: {
          playersAdded: [],
          playersRemoved: [],
          pairingChanges: 0,
          timeSlotChanges: 0
        },
        operationDuration
      };
    }
  }

  /**
   * Execute regeneration with retry mechanisms and exponential backoff
   */
  private async executeRegenerationWithRetry(
    weekId: string, 
    options?: RegenerationOptions
  ): Promise<Omit<RegenerationResult, 'operationDuration'>> {
    const retryConfig = { ...this.defaultRetryConfig, ...options?.retryConfig };
    let lastError: RegenerationError | null = null;
    let backupId: string | null = null;

    // Set initial status to prevent concurrent operations
    // This ensures that even direct calls to regenerateSchedule (bypassing UI) are protected
    this.setRegenerationStatus(weekId, {
      weekId,
      status: 'backing_up',
      progress: 0,
      currentStep: 'Starting regeneration',
      startedAt: new Date()
    });

    for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
      try {
        // Step 1: Create backup with error handling
        this.updateRegenerationProgress(weekId, 10, 'Creating backup');
        backupId = await this.createBackupWithErrorHandling(weekId);

        // Step 2: Generate new schedule with validation
        this.updateRegenerationProgress(weekId, 40, 'Generating new schedule');
        const newSchedule = await this.generateScheduleWithValidation(weekId);

        // Step 3: Replace schedule atomically
        this.updateRegenerationProgress(weekId, 80, 'Replacing existing schedule');
        await this.replaceScheduleAtomicWithRetry(weekId, newSchedule, backupId);

        // Step 4: Analyze changes and complete
        this.updateRegenerationProgress(weekId, 95, 'Finalizing');
        const existingSchedule = await this.scheduleRepository.findByWeekId(weekId);
        const changesDetected = existingSchedule 
          ? this.analyzeScheduleChanges(existingSchedule, newSchedule)
          : this.getDefaultChanges();

        // Complete regeneration
        this.setRegenerationStatus(weekId, {
          weekId,
          status: 'completed',
          progress: 100,
          currentStep: 'Completed',
          startedAt: this.regenerationStatuses.get(weekId)?.startedAt || new Date(),
          completedAt: new Date()
        });

        // Clean up old backups on success
        await this.cleanupOldBackupsAfterSuccess(weekId, backupId);

        // Perform comprehensive cleanup and UI refresh
        await this.clearRegenerationStatusAndCleanup(weekId);

        // Generate success notification for successful regeneration
        applicationState.addNotification({
          type: 'success',
          title: 'Schedule Regenerated',
          message: `Successfully regenerated schedule for week ${weekId}. ${changesDetected.pairingChanges} pairing changes detected.`,
          autoHide: true,
          duration: 5000
        });

        return {
          success: true,
          newScheduleId: existingSchedule?.id ?? '', // Use the existing schedule ID since we update in place
          backupId,
          changesDetected
        };

      } catch (error) {
        lastError = this.normalizeRegenerationError(error, weekId, backupId);
        
        // Log attempt failure
        console.warn(`Regeneration attempt ${attempt}/${retryConfig.maxAttempts} failed:`, lastError);

        // If not retryable or last attempt, break
        if (!this.isRetryableError(lastError) || attempt === retryConfig.maxAttempts) {
          break;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          retryConfig.baseDelayMs * Math.pow(retryConfig.backoffMultiplier, attempt - 1),
          retryConfig.maxDelayMs
        );

        // Update status to show retry
        this.updateRegenerationProgress(weekId, 0, `Retrying in ${Math.round(delay/1000)}s (attempt ${attempt + 1})`);
        
        // Wait before retry
        await this.delay(delay);
      }
    }

    // All attempts failed - throw the last error for handling
    throw lastError!;
  }

  /**
   * Create backup with comprehensive error handling
   */
  private async createBackupWithErrorHandling(weekId: string): Promise<string> {
    try {
      const schedule = await this.scheduleRepository.findByWeekId(weekId);
      if (!schedule) {
        throw this.createRegenerationError(
          RegenerationErrorCode.BACKUP_CREATION_FAILED,
          `No existing schedule found for week ${weekId}`,
          weekId,
          null,
          'backup'
        );
      }

      const backupMetadata = await this.backupService.createBackup(schedule);
      
      // Validate backup was created successfully
      const isValid = await this.backupService.validateBackup(backupMetadata.id);
      if (!isValid) {
        throw this.createRegenerationError(
          RegenerationErrorCode.BACKUP_CREATION_FAILED,
          'Backup validation failed after creation',
          weekId,
          backupMetadata.id,
          'backup'
        );
      }

      return backupMetadata.id;

    } catch (error) {
      // Categorize and re-throw backup errors
      if (error instanceof Error && 'code' in error) {
        throw error; // Already a RegenerationError
      }

      // Handle storage-related errors
      if (error instanceof Error) {
        if (error.message.includes('quota') || error.message.includes('storage')) {
          throw this.createRegenerationError(
            RegenerationErrorCode.STORAGE_ERROR,
            'Insufficient storage space for backup creation',
            weekId,
            null,
            'backup',
            false // Not retryable
          );
        }
      }

      throw this.createRegenerationError(
        RegenerationErrorCode.BACKUP_CREATION_FAILED,
        `Backup creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        weekId,
        null,
        'backup'
      );
    }
  }

  /**
   * Generate schedule with validation and error handling
   */
  private async generateScheduleWithValidation(weekId: string): Promise<Schedule> {
    try {
      // Step 1: Pre-regeneration validation
      const preValidationResult = await this.validatePreRegenerationConstraints(weekId);
      if (!preValidationResult.isValid) {
        throw this.createRegenerationError(
          RegenerationErrorCode.VALIDATION_FAILED,
          `Pre-regeneration validation failed: ${preValidationResult.errors.join(', ')}`,
          weekId,
          null,
          'validation',
          false // Not retryable without fixing constraints
        );
      }

      // Get week information
      const week = await this.weekRepository.findById(weekId);
      if (!week) {
        throw this.createRegenerationError(
          RegenerationErrorCode.SCHEDULE_GENERATION_FAILED,
          `Week ${weekId} not found`,
          weekId,
          null,
          'generation',
          false // Not retryable
        );
      }

      // Get all players for the season with current availability
      const allPlayers = await this.playerRepository.findBySeasonId(week.seasonId);
      const availablePlayers = this.scheduleGenerator.filterAvailablePlayers(allPlayers, week);

      // Check if we have sufficient players
      if (availablePlayers.length < 4) {
        throw this.createRegenerationError(
          RegenerationErrorCode.INSUFFICIENT_PLAYERS,
          `Insufficient available players (${availablePlayers.length}) for schedule generation`,
          weekId,
          null,
          'generation',
          false // Not retryable without player changes
        );
      }

      // Generate new schedule using current data
      const newSchedule = await this.scheduleGenerator.generateScheduleForWeek(week, allPlayers);
      
      // Step 2: Validate the generated schedule against all constraints
      const validation = await this.validateScheduleConstraints(newSchedule, availablePlayers, week);
      if (!validation.isValid) {
        throw this.createRegenerationError(
          RegenerationErrorCode.CONSTRAINT_VIOLATION,
          `Generated schedule validation failed: ${validation.errors.join(', ')}`,
          weekId,
          null,
          'generation'
        );
      }

      // Step 3: Validate business rules before replacement
      const businessRuleValidation = await this.validateBusinessRules(newSchedule, week);
      if (!businessRuleValidation.isValid) {
        throw this.createRegenerationError(
          RegenerationErrorCode.CONSTRAINT_VIOLATION,
          `Business rule validation failed: ${businessRuleValidation.errors.join(', ')}`,
          weekId,
          null,
          'validation',
          false // Business rule violations are not retryable
        );
      }

      return newSchedule;

    } catch (error) {
      // Re-throw RegenerationErrors as-is
      if (error instanceof Error && 'code' in error) {
        throw error;
      }

      // Handle timeout errors
      if (error instanceof Error && error.message.includes('timeout')) {
        throw this.createRegenerationError(
          RegenerationErrorCode.OPERATION_TIMEOUT,
          'Schedule generation timed out',
          weekId,
          null,
          'generation'
        );
      }

      throw this.createRegenerationError(
        RegenerationErrorCode.SCHEDULE_GENERATION_FAILED,
        `Schedule generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        weekId,
        null,
        'generation'
      );
    }
  }

  /**
   * Replace existing schedule atomically with retry logic
   */
  private async replaceScheduleAtomicWithRetry(
    weekId: string, 
    newSchedule: Schedule, 
    backupId: string
  ): Promise<void> {
    try {
      const existingSchedule = await this.scheduleRepository.findByWeekId(weekId);
      if (!existingSchedule) {
        throw this.createRegenerationError(
          RegenerationErrorCode.ATOMIC_REPLACEMENT_FAILED,
          `No existing schedule found for week ${weekId}`,
          weekId,
          backupId,
          'replacement',
          false
        );
      }

      // Check for concurrent operations
      const currentStatus = this.getRegenerationStatus(weekId);
      if (currentStatus && currentStatus.status === 'replacing') {
        throw this.createRegenerationError(
          RegenerationErrorCode.CONCURRENT_OPERATION,
          'Another replacement operation is in progress',
          weekId,
          backupId,
          'replacement'
        );
      }

      // Perform atomic update
      const updatedSchedule = await this.scheduleRepository.update(existingSchedule.id, {
        timeSlots: newSchedule.timeSlots,
        lastModified: new Date()
      });

      if (!updatedSchedule) {
        throw this.createRegenerationError(
          RegenerationErrorCode.ATOMIC_REPLACEMENT_FAILED,
          'Failed to update schedule with new data',
          weekId,
          backupId,
          'replacement'
        );
      }

      // Verify the replacement was successful
      const verificationSchedule = await this.scheduleRepository.findByWeekId(weekId);
      if (!verificationSchedule || verificationSchedule.lastModified.getTime() !== updatedSchedule.lastModified.getTime()) {
        throw this.createRegenerationError(
          RegenerationErrorCode.ATOMIC_REPLACEMENT_FAILED,
          'Schedule replacement verification failed',
          weekId,
          backupId,
          'replacement'
        );
      }

    } catch (error) {
      // If atomic replacement fails, attempt to restore from backup
      if (backupId) {
        try {
          await this.restoreFromBackup(weekId, backupId);
          console.log(`Successfully restored schedule from backup ${backupId} after replacement failure`);
        } catch (restoreError) {
          console.error('Failed to restore backup after atomic replacement failure:', restoreError);
          // Create compound error
          throw this.createRegenerationError(
            RegenerationErrorCode.BACKUP_RESTORATION_FAILED,
            `Atomic replacement failed and backup restoration also failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            weekId,
            backupId,
            'replacement',
            false
          );
        }
      }
      
      // Re-throw the original error if it's already a RegenerationError
      if (error instanceof Error && 'code' in error) {
        throw error;
      }

      throw this.createRegenerationError(
        RegenerationErrorCode.ATOMIC_REPLACEMENT_FAILED,
        `Atomic replacement failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        weekId,
        backupId,
        'replacement'
      );
    }
  }

  /**
   * Handle comprehensive regeneration failure with automatic restoration
   */
  private async handleRegenerationFailure(weekId: string, error: any): Promise<void> {
    const regenerationError = this.normalizeRegenerationError(error, weekId);
    
    // Log detailed error information
    const errorContext: ErrorContext = {
      component: 'ScheduleManager',
      action: 'regenerateSchedule',
      additionalData: {
        weekId,
        errorCode: regenerationError.code,
        errorCategory: regenerationError.category,
        retryable: regenerationError.retryable,
        backupId: regenerationError.backupId
      }
    };

    console.error('Regeneration failed with comprehensive error:', regenerationError);
    errorHandler.handleError(regenerationError, errorContext);

    // Attempt automatic restoration from backup
    await this.attemptAutomaticRestoration(weekId, regenerationError);

    // Provide user feedback with recovery options
    await this.provideUserFeedbackForFailure(weekId, regenerationError);
  }

  /**
   * Attempt automatic restoration from the most recent backup
   */
  private async attemptAutomaticRestoration(weekId: string, error: RegenerationError): Promise<void> {
    try {
      // If we have a specific backup ID from the error, try that first
      if (error.backupId) {
        try {
          await this.restoreFromBackup(weekId, error.backupId);
          console.log(`Successfully restored schedule from backup ${error.backupId}`);
          
          applicationState.addNotification({
            type: 'info',
            title: 'Schedule Restored',
            message: 'The original schedule has been restored after the regeneration failure.',
            autoHide: true,
            duration: 5000
          });
          return;
        } catch (restoreError) {
          console.warn(`Failed to restore from specific backup ${error.backupId}:`, restoreError);
        }
      }

      // Try to restore from the most recent backup
      const backups = await this.backupService.listBackups(weekId);
      if (backups.length > 0) {
        const mostRecentBackup = backups[0]; // listBackups returns most recent first
        try {
          await this.restoreFromBackup(weekId, mostRecentBackup.id);
          console.log(`Successfully restored schedule from most recent backup ${mostRecentBackup.id}`);
          
          applicationState.addNotification({
            type: 'info',
            title: 'Schedule Restored',
            message: 'The original schedule has been restored from the most recent backup.',
            autoHide: true,
            duration: 5000
          });
        } catch (restoreError) {
          console.error('Failed to restore from most recent backup:', restoreError);
          throw restoreError;
        }
      } else {
        console.warn('No backups available for automatic restoration');
      }
    } catch (error) {
      console.error('Automatic restoration failed:', error);
      
      applicationState.addNotification({
        type: 'error',
        title: 'Restoration Failed',
        message: 'Could not restore the original schedule. Please refresh the page or contact support.',
        autoHide: false
      });
    }
  }

  /**
   * Provide user feedback with recovery options based on error type
   */
  private async provideUserFeedbackForFailure(weekId: string, error: RegenerationError): Promise<void> {
    const userMessage = this.getUserFriendlyErrorMessage(error);
    const recoveryActions = this.getRecoveryActions(weekId, error);

    applicationState.addNotification({
      type: 'error',
      title: 'Schedule Regeneration Failed',
      message: userMessage,
      autoHide: false,
      actions: recoveryActions
    });
  }

  /**
   * Get user-friendly error message based on error code and category
   */
  private getUserFriendlyErrorMessage(error: RegenerationError): string {
    const messages: Record<RegenerationErrorCode, string> = {
      [RegenerationErrorCode.BACKUP_CREATION_FAILED]: 'Could not create a backup of the current schedule. The regeneration was aborted to prevent data loss.',
      [RegenerationErrorCode.BACKUP_RESTORATION_FAILED]: 'Failed to restore the original schedule after an error occurred.',
      [RegenerationErrorCode.SCHEDULE_GENERATION_FAILED]: 'Could not generate a new schedule. Please check player availability and try again.',
      [RegenerationErrorCode.ATOMIC_REPLACEMENT_FAILED]: 'Failed to replace the existing schedule with the new one.',
      [RegenerationErrorCode.VALIDATION_FAILED]: 'The generated schedule did not meet the required constraints.',
      [RegenerationErrorCode.INSUFFICIENT_PLAYERS]: 'Not enough available players to generate a complete schedule.',
      [RegenerationErrorCode.CONSTRAINT_VIOLATION]: 'The generated schedule violates scheduling constraints.',
      [RegenerationErrorCode.CONCURRENT_OPERATION]: 'Another regeneration operation is already in progress.',
      [RegenerationErrorCode.STORAGE_ERROR]: 'Storage space is insufficient or corrupted.',
      [RegenerationErrorCode.OPERATION_TIMEOUT]: 'The regeneration operation took too long to complete.',
      [RegenerationErrorCode.SYSTEM_ERROR]: 'An unexpected system error occurred.'
    };

    return messages[error.code] || 'An unexpected error occurred during schedule regeneration.';
  }

  /**
   * Get recovery actions based on error type
   */
  private getRecoveryActions(weekId: string, error: RegenerationError): Array<{label: string, action: () => Promise<void>, style: 'primary' | 'secondary' | 'danger'}> {
    const actions: Array<{label: string, action: () => Promise<void>, style: 'primary' | 'secondary' | 'danger'}> = [];

    // Add retry option for retryable errors
    if (error.retryable) {
      actions.push({
        label: 'Retry Regeneration',
        action: async () => {
          await this.regenerateSchedule(weekId);
        },
        style: 'primary'
      });
    }

    // Add specific recovery actions based on error category
    switch (error.category) {
      case 'backup':
        if (error.code === RegenerationErrorCode.STORAGE_ERROR) {
          actions.push({
            label: 'Clear Storage',
            action: async () => {
              if (confirm('This will clear application data to free up space. Continue?')) {
                localStorage.clear();
                window.location.reload();
              }
            },
            style: 'danger'
          });
        }
        break;

      case 'generation':
        if (error.code === RegenerationErrorCode.INSUFFICIENT_PLAYERS) {
          actions.push({
            label: 'Manage Availability',
            action: async () => {
              applicationState.navigateTo('availability');
            },
            style: 'secondary'
          });
        }
        break;

      case 'replacement':
        actions.push({
          label: 'Manual Restore',
          action: async () => {
            const backups = await this.backupService.listBackups(weekId);
            if (backups.length > 0) {
              await this.restoreFromBackup(weekId, backups[0].id);
              applicationState.addNotification({
                type: 'success',
                title: 'Schedule Restored',
                message: 'The schedule has been manually restored from backup.',
                autoHide: true,
                duration: 3000
              });
            }
          },
          style: 'secondary'
        });
        break;
    }

    // Always add refresh option
    actions.push({
      label: 'Refresh Page',
      action: async () => {
        window.location.reload();
      },
      style: 'secondary'
    });

    return actions;
  }

  /**
   * Clean up old backups after successful regeneration
   */
  private async cleanupOldBackupsAfterSuccess(weekId: string, currentBackupId: string): Promise<void> {
    try {
      await this.backupService.cleanupOldBackups(weekId);
    } catch (error) {
      // Don't fail the operation for cleanup errors
      console.warn('Failed to cleanup old backups:', error);
    }
  }

  /**
   * Normalize any error to RegenerationError
   */
  private normalizeRegenerationError(
    error: any, 
    weekId: string, 
    backupId?: string | null
  ): RegenerationError {
    if (error instanceof Error && 'code' in error) {
      return error as RegenerationError;
    }

    // Determine error code and category based on error message
    let code = RegenerationErrorCode.SYSTEM_ERROR;
    let category: RegenerationError['category'] = 'system';
    let retryable = true;

    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('backup')) {
      category = 'backup';
      if (message.includes('creation') || message.includes('create')) {
        code = RegenerationErrorCode.BACKUP_CREATION_FAILED;
      } else if (message.includes('restoration') || message.includes('restore')) {
        code = RegenerationErrorCode.BACKUP_RESTORATION_FAILED;
      }
    } else if (message.includes('generation') || message.includes('generate')) {
      category = 'generation';
      code = RegenerationErrorCode.SCHEDULE_GENERATION_FAILED;
    } else if (message.includes('replacement') || message.includes('replace') || message.includes('atomic')) {
      category = 'replacement';
      code = RegenerationErrorCode.ATOMIC_REPLACEMENT_FAILED;
    } else if (message.includes('validation') || message.includes('constraint')) {
      category = 'validation';
      code = RegenerationErrorCode.VALIDATION_FAILED;
    } else if (message.includes('insufficient') || message.includes('not enough')) {
      category = 'generation';
      code = RegenerationErrorCode.INSUFFICIENT_PLAYERS;
      retryable = false;
    } else if (message.includes('concurrent') || message.includes('progress')) {
      category = 'system';
      code = RegenerationErrorCode.CONCURRENT_OPERATION;
    } else if (message.includes('storage') || message.includes('quota')) {
      category = 'backup';
      code = RegenerationErrorCode.STORAGE_ERROR;
      retryable = false;
    } else if (message.includes('timeout')) {
      category = 'system';
      code = RegenerationErrorCode.OPERATION_TIMEOUT;
    }

    return this.createRegenerationError(code, message, weekId, backupId, category, retryable);
  }

  /**
   * Create a standardized RegenerationError
   */
  private createRegenerationError(
    code: RegenerationErrorCode,
    message: string,
    weekId: string,
    backupId: string | null | undefined,
    category: RegenerationError['category'],
    retryable: boolean = true
  ): RegenerationError {
    const error = new Error(message) as RegenerationError;
    error.code = code;
    error.weekId = weekId;
    error.backupId = backupId ?? '';
    error.retryable = retryable;
    error.category = category;
    error.name = 'RegenerationError';
    
    return error;
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: RegenerationError): boolean {
    return error.retryable && ![
      RegenerationErrorCode.INSUFFICIENT_PLAYERS,
      RegenerationErrorCode.STORAGE_ERROR,
      RegenerationErrorCode.BACKUP_RESTORATION_FAILED
    ].includes(error.code);
  }

  /**
   * Get default changes object for when comparison isn't possible
   */
  private getDefaultChanges(): RegenerationResult['changesDetected'] {
    return {
      playersAdded: [],
      playersRemoved: [],
      pairingChanges: 0,
      timeSlotChanges: 0
    };
  }

  /**
   * Utility method for delays with exponential backoff
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create a backup of the current schedule
   */
  async createScheduleBackup(weekId: string): Promise<BackupMetadata> {
    const schedule = await this.scheduleRepository.findByWeekId(weekId);
    if (!schedule) {
      throw new Error(`Schedule not found for week ${weekId}`);
    }

    return await this.backupService.createBackup(schedule);
  }

  /**
   * Restore a schedule from backup
   */
  async restoreFromBackup(weekId: string, backupId: string): Promise<void> {
    try {
      const restoredSchedule = await this.backupService.restoreBackup(backupId);
      
      // Update the existing schedule with restored data
      const existingSchedule = await this.scheduleRepository.findByWeekId(weekId);
      if (!existingSchedule) {
        throw new Error(`No existing schedule found for week ${weekId} to restore to`);
      }

      await this.scheduleRepository.update(existingSchedule.id, {
        timeSlots: restoredSchedule.timeSlots,
        lastModified: new Date()
      });

    } catch (error) {
      throw new Error(`Failed to restore backup: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get regeneration status for a week
   */
  getRegenerationStatus(weekId: string): RegenerationStatus | null {
    return this.regenerationStatuses.get(weekId) || null;
  }

  /**
   * Set regeneration lock to prevent concurrent modifications
   */
  async setRegenerationLock(weekId: string, locked: boolean): Promise<void> {
    if (locked) {
      this.setRegenerationStatus(weekId, {
        weekId,
        status: 'confirming',
        progress: 0,
        currentStep: 'Awaiting confirmation',
        startedAt: new Date()
      });
    } else {
      // Clear regeneration status and perform cleanup
      await this.clearRegenerationStatusAndCleanup(weekId);
    }
  }

  /**
   * Clear regeneration status and perform comprehensive cleanup
   */
  private async clearRegenerationStatusAndCleanup(weekId: string): Promise<void> {
    try {
      // Clear the regeneration status completely
      this.regenerationStatuses.delete(weekId);
      
      // Also clear any status that might be lingering in memory
      // Force garbage collection of the status entry
      if (this.regenerationStatuses.has(weekId)) {
        this.regenerationStatuses.set(weekId, {
          weekId,
          status: 'idle',
          progress: 0,
          currentStep: 'Idle',
          startedAt: new Date(),
          completedAt: new Date()
        });
        this.regenerationStatuses.delete(weekId);
      }
      
      // Release any locks that might be held
      await this.releaseScheduleLocksForWeek(weekId);
      
      // Trigger UI refresh to reflect the updated state
      this.notifyUIRefresh(weekId);
      
    } catch (error) {
      console.warn(`Failed to complete cleanup for week ${weekId}:`, error);
      // Don't throw - cleanup failures shouldn't break the main operation
    }
  }

  /**
   * Release all schedule locks for a specific week
   */
  private async releaseScheduleLocksForWeek(weekId: string): Promise<void> {
    try {
      // Force release any locks for this week
      await this.scheduleRepository.forceReleaseScheduleLock(weekId);
    } catch (error) {
      console.warn(`Failed to release locks for week ${weekId}:`, error);
      // Don't throw - lock cleanup failures shouldn't break the main operation
    }
  }

  /**
   * Notify UI to refresh after regeneration operations
   */
  private notifyUIRefresh(weekId: string): void {
    try {
      // Trigger global data refresh to update all UI components
      applicationState.triggerDataRefresh();
      
      // Add a subtle notification that the schedule has been updated
      applicationState.addNotification({
        type: 'info',
        title: 'Schedule Updated',
        message: `Schedule for week ${weekId} has been updated. UI refreshed.`,
        autoHide: true,
        duration: 2000
      });
      
    } catch (error) {
      console.warn(`Failed to notify UI refresh for week ${weekId}:`, error);
      // Don't throw - UI notification failures shouldn't break the main operation
    }
  }

  /**
   * Cleanup expired regeneration statuses and locks (maintenance operation)
   */
  async cleanupExpiredOperations(): Promise<void> {
    const now = Date.now();
    const OPERATION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
    
    try {
      // Clean up expired regeneration statuses
      for (const [weekId, status] of this.regenerationStatuses.entries()) {
        if (status.startedAt) {
          const operationAge = now - status.startedAt.getTime();
          
          // If operation is older than timeout and not completed/failed, mark as failed
          if (operationAge > OPERATION_TIMEOUT_MS && 
              status.status !== 'completed' && 
              status.status !== 'failed') {
            
            console.warn(`Cleaning up expired regeneration operation for week ${weekId}`);
            
            // Mark as failed due to timeout
            this.setRegenerationStatus(weekId, {
              ...status,
              status: 'failed',
              error: 'Operation timed out and was automatically cleaned up',
              completedAt: new Date()
            });
            
            // Perform cleanup
            await this.clearRegenerationStatusAndCleanup(weekId);
          }
        }
      }
      
    } catch (error) {
      console.error('Failed to cleanup expired operations:', error);
    }
  }

  /**
   * Check if regeneration is allowed for a week
   */
  async isRegenerationAllowed(weekId: string): Promise<boolean> {
    const status = this.getRegenerationStatus(weekId);
    // Allow regeneration if no status exists or if the operation is completed/failed
    return !status || status.status === 'idle' || status.status === 'completed' || status.status === 'failed';
  }

  /**
   * Force clear all regeneration statuses (for testing purposes)
   */
  forceCleanupAllRegenerationStatuses(): void {
    this.regenerationStatuses.clear();
  }

  /**
   * Emergency method to force clear a stuck regeneration lock
   * This should only be used when a regeneration operation is genuinely stuck
   */
  async forceReleaseRegenerationLock(weekId: string): Promise<void> {
    console.warn(`Force releasing regeneration lock for week ${weekId}`);
    
    try {
      // Clear the regeneration status
      this.regenerationStatuses.delete(weekId);
      
      // Clear any repository locks
      await this.releaseScheduleLocksForWeek(weekId);
      
      // Trigger UI refresh
      this.notifyUIRefresh(weekId);
      
      console.log(`Successfully force released regeneration lock for week ${weekId}`);
    } catch (error) {
      console.error(`Failed to force release regeneration lock for week ${weekId}:`, error);
      throw error;
    }
  }

  /**
   * Generate a new schedule for regeneration (uses current player availability)
   */
  private async generateNewScheduleForRegeneration(weekId: string): Promise<Schedule> {
    // Get week information
    const week = await this.weekRepository.findById(weekId);
    if (!week) {
      throw new Error(`Week ${weekId} not found`);
    }

    // Get all players for the season with current availability
    const allPlayers = await this.playerRepository.findBySeasonId(week.seasonId);
    
    // Generate new schedule using current data
    const newSchedule = await this.scheduleGenerator.generateScheduleForWeek(week, allPlayers);
    
    return newSchedule;
  }

  /**
   * Replace existing schedule atomically
   */
  private async replaceScheduleAtomic(weekId: string, newSchedule: Schedule, backupId: string): Promise<void> {
    try {
      const existingSchedule = await this.scheduleRepository.findByWeekId(weekId);
      if (!existingSchedule) {
        throw new Error(`No existing schedule found for week ${weekId}`);
      }

      // Update the existing schedule with new data
      const updatedSchedule = await this.scheduleRepository.update(existingSchedule.id, {
        timeSlots: newSchedule.timeSlots,
        lastModified: new Date()
      });

      if (!updatedSchedule) {
        throw new Error('Failed to update schedule with new data');
      }

    } catch (error) {
      // If atomic replacement fails, restore from backup
      try {
        await this.restoreFromBackup(weekId, backupId);
      } catch (restoreError) {
        console.error('Failed to restore backup after atomic replacement failure:', restoreError);
      }
      throw error;
    }
  }

  /**
   * Analyze changes between old and new schedules
   */
  private analyzeScheduleChanges(oldSchedule: Schedule, newSchedule: Schedule): RegenerationResult['changesDetected'] {
    const oldPlayerIds = new Set(oldSchedule.getAllPlayers());
    const newPlayerIds = new Set(newSchedule.getAllPlayers());

    const playersAdded = Array.from(newPlayerIds).filter(id => !oldPlayerIds.has(id));
    const playersRemoved = Array.from(oldPlayerIds).filter(id => !newPlayerIds.has(id));

    // Count pairing changes (simplified - could be more sophisticated)
    const oldPairings = this.getSchedulePairings(oldSchedule);
    const newPairings = this.getSchedulePairings(newSchedule);
    const pairingChanges = Math.abs(oldPairings.size - newPairings.size);

    // Count time slot changes
    const oldMorningCount = oldSchedule.timeSlots.morning.reduce((sum, f) => sum + f.players.length, 0);
    const newMorningCount = newSchedule.timeSlots.morning.reduce((sum, f) => sum + f.players.length, 0);
    const timeSlotChanges = Math.abs(oldMorningCount - newMorningCount);

    return {
      playersAdded,
      playersRemoved,
      pairingChanges,
      timeSlotChanges
    };
  }

  /**
   * Get all pairings from a schedule
   */
  private getSchedulePairings(schedule: Schedule): Set<string> {
    const pairings = new Set<string>();
    const allFoursomes = [...schedule.timeSlots.morning, ...schedule.timeSlots.afternoon];

    allFoursomes.forEach(foursome => {
      const players = foursome.players;
      for (let i = 0; i < players.length; i++) {
        for (let j = i + 1; j < players.length; j++) {
          const key = players[i].id < players[j].id 
            ? `${players[i].id}-${players[j].id}` 
            : `${players[j].id}-${players[i].id}`;
          pairings.add(key);
        }
      }
    });

    return pairings;
  }

  /**
   * Set regeneration status
   */
  private setRegenerationStatus(weekId: string, status: RegenerationStatus): void {
    this.regenerationStatuses.set(weekId, status);
  }

  /**
   * Update regeneration progress
   */
  private updateRegenerationProgress(weekId: string, progress: number, currentStep: string): void {
    const existingStatus = this.regenerationStatuses.get(weekId);
    if (existingStatus) {
      this.setRegenerationStatus(weekId, {
        ...existingStatus,
        progress,
        currentStep
      });
    }
  }

  /**
   * Validate pre-regeneration constraints to ensure regeneration can proceed
   */
  async validatePreRegenerationConstraints(weekId: string): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check if week exists
      const week = await this.weekRepository.findById(weekId);
      if (!week) {
        errors.push(`Week ${weekId} not found`);
        return { isValid: false, errors, warnings };
      }

      // Check if season exists and has players
      const allPlayers = await this.playerRepository.findBySeasonId(week.seasonId);
      if (allPlayers.length === 0) {
        errors.push(`No players found for season ${week.seasonId}`);
        return { isValid: false, errors, warnings };
      }

      // Check player availability
      const availablePlayers = this.scheduleGenerator.filterAvailablePlayers(allPlayers, week);
      
      // Minimum player requirement
      if (availablePlayers.length < 4) {
        errors.push(`Insufficient available players: ${availablePlayers.length} available, minimum 4 required`);
        
        // Provide specific suggestions
        const unavailablePlayers = allPlayers.filter(p => !availablePlayers.includes(p));
        if (unavailablePlayers.length > 0) {
          warnings.push(`Consider making these players available: ${unavailablePlayers.map(p => `${p.firstName} ${p.lastName}`).join(', ')}`);
        }
      }

      // Check time preference distribution
      const amPlayers = availablePlayers.filter(p => p.timePreference === 'AM');
      const pmPlayers = availablePlayers.filter(p => p.timePreference === 'PM');
      const eitherPlayers = availablePlayers.filter(p => p.timePreference === 'Either');

      // Warn about extreme time preference imbalances
      const totalFlexible = eitherPlayers.length;
      const amDeficit = Math.max(0, 4 - amPlayers.length - totalFlexible);
      const pmDeficit = Math.max(0, 4 - pmPlayers.length - totalFlexible);

      if (amDeficit > 0) {
        warnings.push(`Morning time slot may be understaffed (${amDeficit} players short)`);
      }
      if (pmDeficit > 0) {
        warnings.push(`Afternoon time slot may be understaffed (${pmDeficit} players short)`);
      }

      // Check for concurrent operations (but allow the current operation to proceed)
      // We only block if there's a status that indicates user interaction is needed
      const currentStatus = this.getRegenerationStatus(weekId);
      if (currentStatus && currentStatus.status === 'confirming') {
        errors.push('Another regeneration operation is currently in progress');
      }

      // Check storage availability for backup creation
      try {
        const storageEstimate = this.estimateStorageRequirement(weekId);
        const availableStorage = this.getAvailableStorage();
        
        if (storageEstimate > availableStorage) {
          errors.push(`Insufficient storage space: ${storageEstimate}KB required, ${availableStorage}KB available`);
        }
      } catch (storageError) {
        warnings.push('Could not verify storage availability');
      }

    } catch (error) {
      errors.push(`Pre-validation check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate schedule constraints comprehensively with enhanced availability validation
   */
  async validateScheduleConstraints(schedule: Schedule, availablePlayers: Player[], week: Week): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Get all players for the season to have complete player information
    const allPlayers = await this.playerRepository.findBySeasonId(week.seasonId);
    
    // Use existing schedule generator validation as base, but pass week for enhanced validation
    const baseValidation = this.scheduleGenerator.validateSchedule(schedule, availablePlayers, week);
    errors.push(...baseValidation.errors);

    // Enhanced availability validation with detailed conflict detection
    const availabilityValidation = await this.validateDetailedAvailabilityConstraints(schedule, week, allPlayers);
    errors.push(...availabilityValidation.errors);
    warnings.push(...availabilityValidation.warnings);

    // Additional constraint validations
    const allFoursomes = [...schedule.timeSlots.morning, ...schedule.timeSlots.afternoon];

    // Validate foursome constraints
    for (const foursome of allFoursomes) {
      // Check foursome size constraints
      if (foursome.players.length === 0) {
        errors.push(`Empty foursome found at position ${foursome.position} in ${foursome.timeSlot}`);
      } else if (foursome.players.length > 4) {
        errors.push(`Foursome at position ${foursome.position} in ${foursome.timeSlot} has ${foursome.players.length} players (maximum 4)`);
      }

      // Check time preference violations (stricter than base validation)
      if (foursome.timeSlot === 'morning') {
        const pmOnlyPlayers = foursome.players.filter(p => p.timePreference === 'PM');
        if (pmOnlyPlayers.length > 0) {
          errors.push(`Morning foursome contains PM-only players: ${pmOnlyPlayers.map(p => `${p.firstName} ${p.lastName}`).join(', ')}`);
        }
      } else if (foursome.timeSlot === 'afternoon') {
        const amOnlyPlayers = foursome.players.filter(p => p.timePreference === 'AM');
        if (amOnlyPlayers.length > 0) {
          errors.push(`Afternoon foursome contains AM-only players: ${amOnlyPlayers.map(p => `${p.firstName} ${p.lastName}`).join(', ')}`);
        }
      }

      // Check for handedness balance (warning only)
      const leftCount = foursome.players.filter(p => p.handedness === 'left').length;
      const rightCount = foursome.players.filter(p => p.handedness === 'right').length;
      if (foursome.players.length >= 3 && (leftCount === 0 || rightCount === 0)) {
        warnings.push(`Foursome at position ${foursome.position} in ${foursome.timeSlot} has unbalanced handedness (${leftCount} left, ${rightCount} right)`);
      }
    }

    // Validate schedule-level constraints
    const totalPlayers = schedule.getTotalPlayerCount();
    const availableCount = availablePlayers.length;
    
    if (totalPlayers > availableCount) {
      errors.push(`Schedule contains ${totalPlayers} players but only ${availableCount} are available`);
    }

    // Check for reasonable distribution between time slots
    const morningPlayerCount = schedule.timeSlots.morning.reduce((sum, f) => sum + f.players.length, 0);
    const afternoonPlayerCount = schedule.timeSlots.afternoon.reduce((sum, f) => sum + f.players.length, 0);
    
    const imbalance = Math.abs(morningPlayerCount - afternoonPlayerCount);
    if (imbalance > 4 && totalPlayers >= 8) {
      warnings.push(`Significant time slot imbalance: ${morningPlayerCount} morning, ${afternoonPlayerCount} afternoon players`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate detailed availability constraints with conflict detection and resolution suggestions
   */
  private async validateDetailedAvailabilityConstraints(schedule: Schedule, week: Week, allPlayers: Player[]): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Get all players from the schedule
    const allFoursomes = [...schedule.timeSlots.morning, ...schedule.timeSlots.afternoon];
    const scheduledPlayerIds = allFoursomes.flatMap(f => f.players.map(p => p.id));

    // Create a map of player ID to player object for easy lookup
    const playerMap = new Map(allPlayers.map(p => [p.id, p]));

    // Check each scheduled player's availability status
    for (const playerId of scheduledPlayerIds) {
      const player = playerMap.get(playerId);
      const playerName = player ? `${player.firstName} ${player.lastName}` : playerId;
      
      const availabilityStatus = this.getPlayerAvailabilityStatus(playerId, week);
      
      if (availabilityStatus === false) {
        // Player is explicitly marked as unavailable
        errors.push(`Player ${playerName} (${playerId}) is scheduled but marked as unavailable for week ${week.weekNumber}`);
      } else if (availabilityStatus === null || availabilityStatus === undefined) {
        // Player has no availability data
        errors.push(`Player ${playerName} (${playerId}) is scheduled but has no availability data for week ${week.weekNumber}`);
      }
      // availabilityStatus === true is valid, no error needed
    }

    // Check for potential availability conflicts in time slots
    const morningUnavailablePlayerIds = schedule.timeSlots.morning
      .flatMap(f => f.players.map(p => p.id))
      .filter(id => this.getPlayerAvailabilityStatus(id, week) !== true);
    
    const afternoonUnavailablePlayerIds = schedule.timeSlots.afternoon
      .flatMap(f => f.players.map(p => p.id))
      .filter(id => this.getPlayerAvailabilityStatus(id, week) !== true);

    if (morningUnavailablePlayerIds.length > 0) {
      const playerNames = morningUnavailablePlayerIds.map(id => {
        const player = playerMap.get(id);
        return player ? `${player.firstName} ${player.lastName}` : id;
      });
      warnings.push(`Morning time slot contains ${morningUnavailablePlayerIds.length} unavailable player(s): ${playerNames.join(', ')}`);
    }

    if (afternoonUnavailablePlayerIds.length > 0) {
      const playerNames = afternoonUnavailablePlayerIds.map(id => {
        const player = playerMap.get(id);
        return player ? `${player.firstName} ${player.lastName}` : id;
      });
      warnings.push(`Afternoon time slot contains ${afternoonUnavailablePlayerIds.length} unavailable player(s): ${playerNames.join(', ')}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Get player availability status for a specific week
   */
  private getPlayerAvailabilityStatus(playerId: string, week: Week): boolean | null {
    if ('playerAvailability' in week && week.playerAvailability) {
      return week.playerAvailability[playerId] ?? null;
    }
    return null;
  }

  /**
   * Generate detailed availability conflict report with resolution suggestions
   */
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
    const conflicts: Array<{
      playerId: string;
      playerName: string;
      availabilityStatus: boolean | null;
      timeSlot: 'morning' | 'afternoon';
      foursomePosition: number;
    }> = [];

    const suggestions: string[] = [];

    // Check all foursomes for availability conflicts
    const allFoursomes = [...schedule.timeSlots.morning, ...schedule.timeSlots.afternoon];
    
    for (const foursome of allFoursomes) {
      for (const player of foursome.players) {
        const availabilityStatus = this.getPlayerAvailabilityStatus(player.id, week);
        
        if (availabilityStatus !== true) {
          conflicts.push({
            playerId: player.id,
            playerName: `${player.firstName} ${player.lastName}`,
            availabilityStatus,
            timeSlot: foursome.timeSlot,
            foursomePosition: foursome.position
          });
        }
      }
    }

    // Generate resolution suggestions based on conflicts
    if (conflicts.length > 0) {
      const unavailablePlayers = conflicts.filter(c => c.availabilityStatus === false);
      const noDataPlayers = conflicts.filter(c => c.availabilityStatus === null || c.availabilityStatus === undefined);

      if (unavailablePlayers.length > 0) {
        suggestions.push(`Remove ${unavailablePlayers.length} unavailable player(s) from the schedule: ${unavailablePlayers.map(c => c.playerName).join(', ')}`);
        suggestions.push('Update player availability status if these players are now available');
      }

      if (noDataPlayers.length > 0) {
        suggestions.push(`Set availability data for ${noDataPlayers.length} player(s): ${noDataPlayers.map(c => c.playerName).join(', ')}`);
        suggestions.push('Verify these players should be included in the schedule');
      }

      // Time slot specific suggestions
      const morningConflicts = conflicts.filter(c => c.timeSlot === 'morning');
      const afternoonConflicts = conflicts.filter(c => c.timeSlot === 'afternoon');

      if (morningConflicts.length > 0 && afternoonConflicts.length === 0) {
        suggestions.push('Consider moving available players to morning time slot to fill gaps');
      } else if (afternoonConflicts.length > 0 && morningConflicts.length === 0) {
        suggestions.push('Consider moving available players to afternoon time slot to fill gaps');
      }

      // General suggestions
      suggestions.push('Regenerate the schedule after updating player availability');
      suggestions.push('Contact unavailable players to confirm their status');
    }

    return { conflicts, suggestions };
  }

  /**
   * Generate comprehensive availability error report with enhanced details
   */
  async generateDetailedAvailabilityReport(schedule: Schedule, week: Week): Promise<AvailabilityErrorReport> {
    const allPlayers = await this.playerRepository.findBySeasonId(week.seasonId);
    return this.availabilityErrorReporter.generateDetailedErrorReport(schedule, week, allPlayers);
  }

  /**
   * Get availability filtering decision history
   */
  getAvailabilityFilteringHistory(limit?: number): Array<{
    playerId: string;
    playerName: string;
    availabilityStatus: boolean | null | undefined;
    decision: 'included' | 'excluded';
    reason: string;
    timestamp: Date;
  }> {
    return this.availabilityErrorReporter.getFilteringDecisionHistory(limit);
  }

  /**
   * Clear availability filtering history
   */
  clearAvailabilityFilteringHistory(): void {
    this.availabilityErrorReporter.clearFilteringHistory();
  }

  /**
   * Validate business rules for schedule generation
   */
  async validateBusinessRules(schedule: Schedule, week: Week): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Business Rule 1: Minimum viable foursomes
      const allFoursomes = [...schedule.timeSlots.morning, ...schedule.timeSlots.afternoon];
      const viableFoursomes = allFoursomes.filter(f => f.players.length >= 2);
      
      if (viableFoursomes.length === 0) {
        errors.push('Schedule must contain at least one foursome with 2 or more players');
      }

      // Business Rule 2: No player should be scheduled in both time slots
      const morningPlayers = new Set(schedule.timeSlots.morning.flatMap(f => f.players.map(p => p.id)));
      const afternoonPlayers = new Set(schedule.timeSlots.afternoon.flatMap(f => f.players.map(p => p.id)));
      
      const duplicatePlayers = [...morningPlayers].filter(id => afternoonPlayers.has(id));
      if (duplicatePlayers.length > 0) {
        errors.push(`Players scheduled in both time slots: ${duplicatePlayers.join(', ')}`);
      }

      // Business Rule 3: Foursome position consistency
      const morningPositions = schedule.timeSlots.morning.map(f => f.position).sort((a, b) => a - b);
      const afternoonPositions = schedule.timeSlots.afternoon.map(f => f.position).sort((a, b) => a - b);
      
      // Check for gaps in positions
      for (let i = 0; i < morningPositions.length - 1; i++) {
        if (morningPositions[i + 1] - morningPositions[i] > 1) {
          warnings.push(`Gap in morning foursome positions between ${morningPositions[i]} and ${morningPositions[i + 1]}`);
        }
      }
      
      for (let i = 0; i < afternoonPositions.length - 1; i++) {
        if (afternoonPositions[i + 1] - afternoonPositions[i] > 1) {
          warnings.push(`Gap in afternoon foursome positions between ${afternoonPositions[i]} and ${afternoonPositions[i + 1]}`);
        }
      }

      // Business Rule 4: Season consistency
      const allPlayers = schedule.getAllPlayers();
      if (allPlayers.length > 0) {
        const playerObjects = [...schedule.timeSlots.morning, ...schedule.timeSlots.afternoon]
          .flatMap(f => f.players);
        
        const seasons = new Set(playerObjects.map(p => p.seasonId));
        if (seasons.size > 1) {
          errors.push(`Schedule contains players from multiple seasons: ${Array.from(seasons).join(', ')}`);
        }
        
        // Verify season matches week
        if (seasons.size === 1 && !seasons.has(week.seasonId)) {
          errors.push(`Schedule contains players from season ${Array.from(seasons)[0]} but week belongs to season ${week.seasonId}`);
        }
      }

      // Business Rule 5: Reasonable schedule size
      const totalPlayers = schedule.getTotalPlayerCount();
      if (totalPlayers > 32) {
        warnings.push(`Large schedule with ${totalPlayers} players may be difficult to manage`);
      }

      // Business Rule 6: Time slot utilization
      if (schedule.timeSlots.morning.length === 0 && schedule.timeSlots.afternoon.length === 0) {
        errors.push('Schedule must have at least one time slot with foursomes');
      }

    } catch (error) {
      errors.push(`Business rule validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Generate validation error report with suggested actions including availability conflicts
   */
  generateValidationErrorReport(
    preValidation: ValidationResult,
    scheduleValidation?: ValidationResult,
    businessRuleValidation?: ValidationResult
  ): { errors: string[]; warnings: string[]; suggestions: string[] } {
    const allErrors: string[] = [];
    const allWarnings: string[] = [];
    const suggestions: string[] = [];

    // Collect all errors and warnings
    allErrors.push(...preValidation.errors);
    allWarnings.push(...preValidation.warnings);

    if (scheduleValidation) {
      allErrors.push(...scheduleValidation.errors);
      allWarnings.push(...scheduleValidation.warnings);
    }

    if (businessRuleValidation) {
      allErrors.push(...businessRuleValidation.errors);
      allWarnings.push(...businessRuleValidation.warnings);
    }

    // Generate suggestions based on error patterns
    for (const error of allErrors) {
      if (error.includes('Insufficient available players')) {
        suggestions.push('Update player availability for this week to include more players');
      } else if (error.includes('PM-only players') && error.toLowerCase().includes('morning')) {
        suggestions.push('Move PM-preference players to afternoon time slots');
      } else if (error.includes('AM-only players') && error.toLowerCase().includes('afternoon')) {
        suggestions.push('Move AM-preference players to morning time slots');
      } else if (error.includes('both time slots')) {
        suggestions.push('Remove duplicate player assignments between morning and afternoon');
      } else if (error.includes('not available') || error.includes('marked as unavailable')) {
        suggestions.push('Update player availability or remove unavailable players from schedule');
        suggestions.push('Verify player availability status is correct for this week');
      } else if (error.includes('no availability data')) {
        suggestions.push('Set availability data for players missing availability information');
        suggestions.push('Confirm which players should be included in the schedule');
      } else if (error.includes('storage space')) {
        suggestions.push('Clear application data or free up browser storage space');
      } else if (error.includes('operation is currently in progress')) {
        suggestions.push('Wait for the current operation to complete or refresh the page');
      } else if (error.includes('multiple seasons')) {
        suggestions.push('Ensure all players belong to the same season as the week');
      }
    }

    // Add availability-specific suggestions for warnings
    for (const warning of allWarnings) {
      if (warning.includes('unavailable player(s)')) {
        suggestions.push('Review and update availability for players in the schedule');
        suggestions.push('Consider regenerating the schedule with current availability data');
      } else if (warning.includes('unbalanced handedness')) {
        suggestions.push('Consider manual adjustments to balance left and right-handed players');
      }
    }

    // Remove duplicate suggestions
    const uniqueSuggestions = Array.from(new Set(suggestions));

    return {
      errors: allErrors,
      warnings: allWarnings,
      suggestions: uniqueSuggestions
    };
  }

  /**
   * Estimate storage requirement for backup creation
   */
  private estimateStorageRequirement(weekId: string): number {
    // Rough estimate: 1KB per player in schedule, plus metadata
    // This is a conservative estimate for localStorage usage
    return 10; // 10KB base estimate
  }

  /**
   * Get available storage space in KB
   */
  private getAvailableStorage(): number {
    try {
      // Test localStorage availability
      const testKey = 'storage_test';
      const testData = 'x'.repeat(1024); // 1KB test
      
      localStorage.setItem(testKey, testData);
      localStorage.removeItem(testKey);
      
      // Return a conservative estimate
      return 1024; // 1MB available (conservative)
    } catch (error) {
      return 0; // No storage available
    }
  }
}