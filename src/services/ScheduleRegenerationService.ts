import { Schedule } from '../models/Schedule';
import { Player } from '../models/Player';
import { Week } from '../models/Week';
import { ScheduleRepository } from '../repositories/ScheduleRepository';
import { WeekRepository } from '../repositories/WeekRepository';
import { PlayerRepository } from '../repositories/PlayerRepository';
import { ScheduleGenerator } from './ScheduleGenerator';
import { ScheduleBackupService, BackupMetadata } from './ScheduleBackupService';
import { ScheduleValidationService } from './ScheduleValidationService';
import { errorHandler, ErrorContext } from '../utils/ErrorHandler';
import { applicationState } from '../state/ApplicationState';
import {
    RegenerationOptions,
    RegenerationResult,
    RegenerationStatus,
    RetryConfig,
    RegenerationError,
    RegenerationErrorCode
} from './ScheduleManager';

/**
 * Handles the schedule regeneration workflow: backup, generate, replace, restore.
 * Extracted from ScheduleManager to isolate the complex regeneration lifecycle.
 */
export class ScheduleRegenerationService {
    private readonly defaultRetryConfig: RetryConfig = {
        maxAttempts: 3,
        baseDelayMs: 1000,
        maxDelayMs: 8000,
        backoffMultiplier: 2
    };

    constructor(
        private scheduleRepository: ScheduleRepository,
        private weekRepository: WeekRepository,
        private playerRepository: PlayerRepository,
        private scheduleGenerator: ScheduleGenerator,
        private backupService: ScheduleBackupService,
        private validationService: ScheduleValidationService,
        private regenerationStatuses: Map<string, RegenerationStatus>
    ) { }

    /**
     * Regenerate an existing schedule with user confirmation workflow
     */
    async regenerateSchedule(weekId: string, options?: RegenerationOptions): Promise<RegenerationResult> {
        const startTime = Date.now();

        try {
            const currentStatus = this.getRegenerationStatus(weekId);
            if (currentStatus && ['confirming', 'backing_up', 'generating', 'replacing'].includes(currentStatus.status)) {
                return {
                    success: false,
                    error: 'Another regeneration operation is currently in progress',
                    changesDetected: { playersAdded: [], playersRemoved: [], pairingChanges: 0, timeSlotChanges: 0 },
                    operationDuration: Date.now() - startTime
                };
            }

            const result = await this.executeRegenerationWithRetry(weekId, options);
            return { ...result, operationDuration: Date.now() - startTime };

        } catch (error) {
            this.setRegenerationStatus(weekId, {
                weekId,
                status: 'failed',
                progress: 0,
                currentStep: 'Failed',
                startedAt: this.regenerationStatuses.get(weekId)?.startedAt || new Date(),
                completedAt: new Date(),
                error: error instanceof Error ? error.message : 'Unknown error'
            });

            await this.handleRegenerationFailure(weekId, error);
            await this.clearRegenerationStatusAndCleanup(weekId);

            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                changesDetected: { playersAdded: [], playersRemoved: [], pairingChanges: 0, timeSlotChanges: 0 },
                operationDuration: Date.now() - startTime
            };
        }
    }

    /**
     * Execute regeneration with retry mechanisms
     */
    private async executeRegenerationWithRetry(
        weekId: string,
        options?: RegenerationOptions
    ): Promise<Omit<RegenerationResult, 'operationDuration'>> {
        const retryConfig = { ...this.defaultRetryConfig, ...options?.retryConfig };
        let lastError: RegenerationError | null = null;
        let backupId: string | null = null;

        this.setRegenerationStatus(weekId, {
            weekId,
            status: 'backing_up',
            progress: 0,
            currentStep: 'Starting regeneration',
            startedAt: new Date()
        });

        for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
            try {
                this.updateRegenerationProgress(weekId, 10, 'Creating backup');
                backupId = await this.createBackupWithErrorHandling(weekId);

                this.updateRegenerationProgress(weekId, 40, 'Generating new schedule');
                const newSchedule = await this.generateScheduleWithValidation(weekId);

                this.updateRegenerationProgress(weekId, 80, 'Replacing existing schedule');
                await this.replaceScheduleAtomicWithRetry(weekId, newSchedule, backupId);

                this.updateRegenerationProgress(weekId, 95, 'Finalizing');
                const existingSchedule = await this.scheduleRepository.findByWeekId(weekId);
                const changesDetected = existingSchedule
                    ? this.analyzeScheduleChanges(existingSchedule, newSchedule)
                    : this.getDefaultChanges();

                this.setRegenerationStatus(weekId, {
                    weekId,
                    status: 'completed',
                    progress: 100,
                    currentStep: 'Completed',
                    startedAt: this.regenerationStatuses.get(weekId)?.startedAt || new Date(),
                    completedAt: new Date()
                });

                await this.cleanupOldBackupsAfterSuccess(weekId, backupId);
                await this.clearRegenerationStatusAndCleanup(weekId);

                applicationState.addNotification({
                    type: 'success',
                    title: 'Schedule Regenerated',
                    message: `Successfully regenerated schedule for week ${weekId}. ${changesDetected.pairingChanges} pairing changes detected.`,
                    autoHide: true,
                    duration: 5000
                });

                return {
                    success: true,
                    newScheduleId: existingSchedule?.id ?? '',
                    backupId,
                    changesDetected
                };

            } catch (error) {
                lastError = this.normalizeRegenerationError(error, weekId, backupId);

                console.warn(`Regeneration attempt ${attempt}/${retryConfig.maxAttempts} failed:`, lastError);

                if (!this.isRetryableError(lastError) || attempt === retryConfig.maxAttempts) break;

                const delay = Math.min(
                    retryConfig.baseDelayMs * Math.pow(retryConfig.backoffMultiplier, attempt - 1),
                    retryConfig.maxDelayMs
                );

                this.updateRegenerationProgress(weekId, 0, `Retrying in ${Math.round(delay / 1000)}s (attempt ${attempt + 1})`);
                await this.delay(delay);
            }
        }

        throw lastError!;
    }

    /**
     * Create backup with error handling
     */
    private async createBackupWithErrorHandling(weekId: string): Promise<string> {
        try {
            const schedule = await this.scheduleRepository.findByWeekId(weekId);
            if (!schedule) {
                throw this.createRegenerationError(RegenerationErrorCode.BACKUP_CREATION_FAILED, `No existing schedule found for week ${weekId}`, weekId, null, 'backup');
            }

            const backupMetadata = await this.backupService.createBackup(schedule);

            const isValid = await this.backupService.validateBackup(backupMetadata.id);
            if (!isValid) {
                throw this.createRegenerationError(RegenerationErrorCode.BACKUP_CREATION_FAILED, 'Backup validation failed after creation', weekId, backupMetadata.id, 'backup');
            }

            return backupMetadata.id;

        } catch (error) {
            if (error instanceof Error && 'code' in error) throw error;

            if (error instanceof Error) {
                if (error.message.includes('quota') || error.message.includes('storage')) {
                    throw this.createRegenerationError(RegenerationErrorCode.STORAGE_ERROR, 'Insufficient storage space for backup creation', weekId, null, 'backup', false);
                }
            }

            throw this.createRegenerationError(RegenerationErrorCode.BACKUP_CREATION_FAILED, `Backup creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`, weekId, null, 'backup');
        }
    }

    /**
     * Generate schedule with validation
     */
    private async generateScheduleWithValidation(weekId: string): Promise<Schedule> {
        try {
            const preValidationResult = await this.validationService.validatePreRegenerationConstraints(
                weekId,
                (wid) => this.getRegenerationStatus(wid)
            );
            if (!preValidationResult.isValid) {
                throw this.createRegenerationError(RegenerationErrorCode.VALIDATION_FAILED, `Pre-regeneration validation failed: ${preValidationResult.errors.join(', ')}`, weekId, null, 'validation', false);
            }

            const week = await this.weekRepository.findById(weekId);
            if (!week) {
                throw this.createRegenerationError(RegenerationErrorCode.SCHEDULE_GENERATION_FAILED, `Week ${weekId} not found`, weekId, null, 'generation', false);
            }

            const allPlayers = await this.playerRepository.findBySeasonId(week.seasonId);
            const availablePlayers = this.scheduleGenerator.filterAvailablePlayers(allPlayers, week);

            if (availablePlayers.length < 4) {
                throw this.createRegenerationError(RegenerationErrorCode.INSUFFICIENT_PLAYERS, `Insufficient available players (${availablePlayers.length}) for schedule generation`, weekId, null, 'generation', false);
            }

            const newSchedule = await this.scheduleGenerator.generateScheduleForWeek(week, allPlayers);

            const validation = await this.validationService.validateScheduleConstraints(newSchedule, availablePlayers, week);
            if (!validation.isValid) {
                throw this.createRegenerationError(RegenerationErrorCode.CONSTRAINT_VIOLATION, `Generated schedule validation failed: ${validation.errors.join(', ')}`, weekId, null, 'generation');
            }

            const businessRuleValidation = await this.validationService.validateBusinessRules(newSchedule, week);
            if (!businessRuleValidation.isValid) {
                throw this.createRegenerationError(RegenerationErrorCode.CONSTRAINT_VIOLATION, `Business rule validation failed: ${businessRuleValidation.errors.join(', ')}`, weekId, null, 'validation', false);
            }

            return newSchedule;

        } catch (error) {
            if (error instanceof Error && 'code' in error) throw error;

            if (error instanceof Error && error.message.includes('timeout')) {
                throw this.createRegenerationError(RegenerationErrorCode.OPERATION_TIMEOUT, 'Schedule generation timed out', weekId, null, 'generation');
            }

            throw this.createRegenerationError(RegenerationErrorCode.SCHEDULE_GENERATION_FAILED, `Schedule generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`, weekId, null, 'generation');
        }
    }

    /**
     * Replace schedule atomically with retry
     */
    private async replaceScheduleAtomicWithRetry(weekId: string, newSchedule: Schedule, backupId: string): Promise<void> {
        try {
            const existingSchedule = await this.scheduleRepository.findByWeekId(weekId);
            if (!existingSchedule) {
                throw this.createRegenerationError(RegenerationErrorCode.ATOMIC_REPLACEMENT_FAILED, `No existing schedule found for week ${weekId}`, weekId, backupId, 'replacement', false);
            }

            const currentStatus = this.getRegenerationStatus(weekId);
            if (currentStatus && currentStatus.status === 'replacing') {
                throw this.createRegenerationError(RegenerationErrorCode.CONCURRENT_OPERATION, 'Another replacement operation is in progress', weekId, backupId, 'replacement');
            }

            const updatedSchedule = await this.scheduleRepository.update(existingSchedule.id, {
                timeSlots: newSchedule.timeSlots,
                lastModified: new Date()
            });

            if (!updatedSchedule) {
                throw this.createRegenerationError(RegenerationErrorCode.ATOMIC_REPLACEMENT_FAILED, 'Failed to update schedule with new data', weekId, backupId, 'replacement');
            }

            const verificationSchedule = await this.scheduleRepository.findByWeekId(weekId);
            if (!verificationSchedule || verificationSchedule.lastModified.getTime() !== updatedSchedule.lastModified.getTime()) {
                throw this.createRegenerationError(RegenerationErrorCode.ATOMIC_REPLACEMENT_FAILED, 'Schedule replacement verification failed', weekId, backupId, 'replacement');
            }

        } catch (error) {
            if (backupId) {
                try {
                    await this.restoreFromBackup(weekId, backupId);
                    console.log(`Successfully restored schedule from backup ${backupId} after replacement failure`);
                } catch (restoreError) {
                    console.error('Failed to restore backup after atomic replacement failure:', restoreError);
                    throw this.createRegenerationError(RegenerationErrorCode.BACKUP_RESTORATION_FAILED, `Atomic replacement failed and backup restoration also failed: ${error instanceof Error ? error.message : 'Unknown error'}`, weekId, backupId, 'replacement', false);
                }
            }

            if (error instanceof Error && 'code' in error) throw error;

            throw this.createRegenerationError(RegenerationErrorCode.ATOMIC_REPLACEMENT_FAILED, `Atomic replacement failed: ${error instanceof Error ? error.message : 'Unknown error'}`, weekId, backupId, 'replacement');
        }
    }

    /**
     * Handle regeneration failure with automatic restoration
     */
    private async handleRegenerationFailure(weekId: string, error: any): Promise<void> {
        const regenerationError = this.normalizeRegenerationError(error, weekId);

        const errorContext: ErrorContext = {
            component: 'ScheduleRegenerationService',
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

        await this.attemptAutomaticRestoration(weekId, regenerationError);
        this.provideUserFeedbackForFailure(weekId, regenerationError);
    }

    /**
     * Attempt automatic restoration from backup
     */
    private async attemptAutomaticRestoration(weekId: string, error: RegenerationError): Promise<void> {
        try {
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

            const backups = await this.backupService.listBackups(weekId);
            if (backups.length > 0) {
                const mostRecentBackup = backups[0];
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
        } catch (_) {
            console.error('Automatic restoration failed:', _);
            applicationState.addNotification({
                type: 'error',
                title: 'Restoration Failed',
                message: 'Could not restore the original schedule. Please refresh the page or contact support.',
                autoHide: false
            });
        }
    }

    /**
     * Provide user feedback for failure
     */
    private provideUserFeedbackForFailure(weekId: string, error: RegenerationError): void {
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
     * Get user-friendly error message
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
    private getRecoveryActions(weekId: string, error: RegenerationError): Array<{ label: string, action: () => Promise<void>, style: 'primary' | 'secondary' | 'danger' }> {
        const actions: Array<{ label: string, action: () => Promise<void>, style: 'primary' | 'secondary' | 'danger' }> = [];

        if (error.retryable) {
            actions.push({
                label: 'Retry Regeneration',
                action: async () => { await this.regenerateSchedule(weekId); },
                style: 'primary'
            });
        }

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
                        action: async () => { applicationState.navigateTo('availability'); },
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

        actions.push({
            label: 'Refresh Page',
            action: async () => { window.location.reload(); },
            style: 'secondary'
        });

        return actions;
    }

    // === Backup and Restore ===

    /**
     * Create a backup of the current schedule
     */
    async createScheduleBackup(weekId: string): Promise<BackupMetadata> {
        const schedule = await this.scheduleRepository.findByWeekId(weekId);
        if (!schedule) throw new Error(`Schedule not found for week ${weekId}`);
        return await this.backupService.createBackup(schedule);
    }

    /**
     * Restore a schedule from backup
     */
    async restoreFromBackup(weekId: string, backupId: string): Promise<void> {
        try {
            const restoredSchedule = await this.backupService.restoreBackup(backupId);

            const existingSchedule = await this.scheduleRepository.findByWeekId(weekId);
            if (!existingSchedule) throw new Error(`No existing schedule found for week ${weekId} to restore to`);

            await this.scheduleRepository.update(existingSchedule.id, {
                timeSlots: restoredSchedule.timeSlots,
                lastModified: new Date()
            });

        } catch (error) {
            throw new Error(`Failed to restore backup: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    // === Status Management ===

    getRegenerationStatus(weekId: string): RegenerationStatus | null {
        return this.regenerationStatuses.get(weekId) || null;
    }

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
            await this.clearRegenerationStatusAndCleanup(weekId);
        }
    }

    async isRegenerationAllowed(weekId: string): Promise<boolean> {
        const status = this.getRegenerationStatus(weekId);
        return !status || status.status === 'idle' || status.status === 'completed' || status.status === 'failed';
    }

    forceCleanupAllRegenerationStatuses(): void {
        this.regenerationStatuses.clear();
    }

    async forceReleaseRegenerationLock(weekId: string): Promise<void> {
        console.warn(`Force releasing regeneration lock for week ${weekId}`);

        try {
            this.regenerationStatuses.delete(weekId);
            await this.releaseScheduleLocksForWeek(weekId);
            this.notifyUIRefresh(weekId);
            console.log(`Successfully force released regeneration lock for week ${weekId}`);
        } catch (error) {
            console.error(`Failed to force release regeneration lock for week ${weekId}:`, error);
            throw error;
        }
    }

    // === Private Helpers ===

    private setRegenerationStatus(weekId: string, status: RegenerationStatus): void {
        this.regenerationStatuses.set(weekId, status);
    }

    private updateRegenerationProgress(weekId: string, progress: number, currentStep: string): void {
        const existingStatus = this.regenerationStatuses.get(weekId);
        if (existingStatus) {
            this.setRegenerationStatus(weekId, { ...existingStatus, progress, currentStep });
        }
    }

    private async clearRegenerationStatusAndCleanup(weekId: string): Promise<void> {
        try {
            this.regenerationStatuses.delete(weekId);
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

            await this.releaseScheduleLocksForWeek(weekId);
            this.notifyUIRefresh(weekId);
        } catch (error) {
            console.warn(`Failed to complete cleanup for week ${weekId}:`, error);
        }
    }

    private async releaseScheduleLocksForWeek(weekId: string): Promise<void> {
        try {
            await this.scheduleRepository.forceReleaseScheduleLock(weekId);
        } catch (error) {
            console.warn(`Failed to release locks for week ${weekId}:`, error);
        }
    }

    private notifyUIRefresh(weekId: string): void {
        try {
            applicationState.triggerDataRefresh();
            applicationState.addNotification({
                type: 'info',
                title: 'Schedule Updated',
                message: `Schedule for week ${weekId} has been updated. UI refreshed.`,
                autoHide: true,
                duration: 2000
            });
        } catch (error) {
            console.warn(`Failed to notify UI refresh for week ${weekId}:`, error);
        }
    }

    private async cleanupOldBackupsAfterSuccess(_weekId: string, _currentBackupId: string): Promise<void> {
        try {
            await this.backupService.cleanupOldBackups(_weekId);
        } catch (error) {
            console.warn('Failed to cleanup old backups:', error);
        }
    }

    private analyzeScheduleChanges(oldSchedule: Schedule, newSchedule: Schedule): RegenerationResult['changesDetected'] {
        const oldPlayerIds = new Set(oldSchedule.getAllPlayers());
        const newPlayerIds = new Set(newSchedule.getAllPlayers());

        const playersAdded = Array.from(newPlayerIds).filter(id => !oldPlayerIds.has(id));
        const playersRemoved = Array.from(oldPlayerIds).filter(id => !newPlayerIds.has(id));

        const oldPairings = this.getSchedulePairings(oldSchedule);
        const newPairings = this.getSchedulePairings(newSchedule);
        const pairingChanges = Math.abs(oldPairings.size - newPairings.size);

        const oldMorningCount = oldSchedule.timeSlots.morning.reduce((sum, f) => sum + f.players.length, 0);
        const newMorningCount = newSchedule.timeSlots.morning.reduce((sum, f) => sum + f.players.length, 0);
        const timeSlotChanges = Math.abs(oldMorningCount - newMorningCount);

        return { playersAdded, playersRemoved, pairingChanges, timeSlotChanges };
    }

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

    private getDefaultChanges(): RegenerationResult['changesDetected'] {
        return { playersAdded: [], playersRemoved: [], pairingChanges: 0, timeSlotChanges: 0 };
    }

    private normalizeRegenerationError(error: any, weekId: string, backupId?: string | null): RegenerationError {
        if (error instanceof Error && 'code' in error) return error as RegenerationError;

        let code = RegenerationErrorCode.SYSTEM_ERROR;
        let category: RegenerationError['category'] = 'system';
        let retryable = true;

        const message = error instanceof Error ? error.message : String(error);

        if (message.includes('backup')) {
            category = 'backup';
            if (message.includes('creation') || message.includes('create')) code = RegenerationErrorCode.BACKUP_CREATION_FAILED;
            else if (message.includes('restoration') || message.includes('restore')) code = RegenerationErrorCode.BACKUP_RESTORATION_FAILED;
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

    private isRetryableError(error: RegenerationError): boolean {
        return error.retryable && ![
            RegenerationErrorCode.INSUFFICIENT_PLAYERS,
            RegenerationErrorCode.STORAGE_ERROR,
            RegenerationErrorCode.BACKUP_RESTORATION_FAILED
        ].includes(error.code);
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
