import { Schedule } from '../models/Schedule';
import { Player } from '../models/Player';
import { Week } from '../models/Week';
import { ScheduleRepository } from '../repositories/ScheduleRepository';
import { WeekRepository } from '../repositories/WeekRepository';
import { PlayerRepository } from '../repositories/PlayerRepository';
import { ScheduleGenerator } from './ScheduleGenerator';
import { AvailabilityErrorReporter, AvailabilityErrorReport } from '../utils/AvailabilityErrorReporter';
import { ValidationResult, ValidationErrorReport } from './ScheduleManager';

/**
 * Handles all schedule validation: preconditions, constraints, business rules,
 * availability conflict detection, and data consistency checks.
 * Extracted from ScheduleManager to isolate validation concerns.
 */
export class ScheduleValidationService {
    private availabilityErrorReporter: AvailabilityErrorReporter;

    constructor(
        private scheduleRepository: ScheduleRepository,
        private weekRepository: WeekRepository,
        private playerRepository: PlayerRepository,
        private scheduleGenerator: ScheduleGenerator
    ) {
        this.availabilityErrorReporter = new AvailabilityErrorReporter();
    }

    /**
     * Validate data consistency between week and players
     */
    async validateDataConsistency(week: Week, allPlayers: Player[]): Promise<ValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        try {
            if (!week.id || week.id.trim().length === 0) {
                errors.push('Week ID is missing or empty');
            }

            if (!week.seasonId || week.seasonId.trim().length === 0) {
                errors.push('Week season ID is missing or empty');
            }

            if (!week.weekNumber || week.weekNumber < 1 || week.weekNumber > 52) {
                errors.push(`Week number ${week.weekNumber} is invalid (must be 1-52)`);
            }

            const playerSeasonIds = new Set(allPlayers.map(p => p.seasonId));
            if (playerSeasonIds.size > 1) {
                errors.push(`Players belong to multiple seasons: ${Array.from(playerSeasonIds).join(', ')}`);
            }

            if (playerSeasonIds.size === 1 && !playerSeasonIds.has(week.seasonId)) {
                errors.push(`Week belongs to season ${week.seasonId} but players belong to season ${Array.from(playerSeasonIds)[0]}`);
            }

            for (const player of allPlayers) {
                if (!player.id || player.id.trim().length === 0) {
                    errors.push(`Player has missing or empty ID`);
                }

                if (!player.firstName || player.firstName.trim().length === 0) {
                    warnings.push(`Player ${player.id} has missing or empty first name`);
                }

                if (!player.lastName || player.lastName.trim().length === 0) {
                    warnings.push(`Player ${player.id} has missing or empty last name`);
                }

                if (!['AM', 'PM', 'Either'].includes(player.timePreference)) {
                    errors.push(`Player ${player.id} has invalid time preference: ${player.timePreference}`);
                }

                if (!['left', 'right'].includes(player.handedness)) {
                    errors.push(`Player ${player.id} has invalid handedness: ${player.handedness}`);
                }
            }

            if (week.playerAvailability) {
                const availabilityPlayerIds = Object.keys(week.playerAvailability);
                const actualPlayerIds = new Set(allPlayers.map(p => p.id));

                const orphanedAvailability = availabilityPlayerIds.filter(id => !actualPlayerIds.has(id));
                if (orphanedAvailability.length > 0) {
                    warnings.push(`Availability data exists for non-existent players: ${orphanedAvailability.join(', ')}`);
                }

                for (const [playerId, availability] of Object.entries(week.playerAvailability)) {
                    if (availability !== true && availability !== false && availability !== null && availability !== undefined) {
                        errors.push(`Player ${playerId} has invalid availability value: ${availability}`);
                    }
                }
            }

            console.log(`[ScheduleValidation] Data consistency validation completed - Errors: ${errors.length}, Warnings: ${warnings.length}`);

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            errors.push(`Data consistency validation failed: ${errorMessage}`);
        }

        return { isValid: errors.length === 0, errors, warnings };
    }

    /**
     * Validate preconditions for schedule generation
     */
    async validateScheduleGenerationPreconditions(weekId: string): Promise<{
        isValid: boolean;
        checks: Array<{ name: string; passed: boolean; message: string; details?: any }>;
    }> {
        const checks: Array<{ name: string; passed: boolean; message: string; details?: any }> = [];

        try {
            const week = await this.weekRepository.findById(weekId);
            checks.push({
                name: 'Week Exists',
                passed: !!week,
                message: week ? `Week ${weekId} found` : `Week ${weekId} not found`
            });

            if (!week) return { isValid: false, checks };

            const allPlayers = await this.playerRepository.findBySeasonId(week.seasonId);
            checks.push({
                name: 'Season Has Players',
                passed: allPlayers.length > 0,
                message: `Found ${allPlayers.length} players in season ${week.seasonId}`,
                details: { playerCount: allPlayers.length }
            });

            const availabilityDataExists = week.playerAvailability && Object.keys(week.playerAvailability).length > 0;
            checks.push({
                name: 'Availability Data Exists',
                passed: !!availabilityDataExists,
                message: availabilityDataExists
                    ? `Availability data exists for ${Object.keys(week.playerAvailability || {}).length} players`
                    : 'No availability data found',
                details: {
                    playersWithData: Object.keys(week.playerAvailability || {}).length,
                    availablePlayers: Object.values(week.playerAvailability || {}).filter(v => v === true).length,
                    unavailablePlayers: Object.values(week.playerAvailability || {}).filter(v => v === false).length
                }
            });

            const availablePlayers = this.scheduleGenerator.filterAvailablePlayers(allPlayers, week);
            const sufficientPlayers = availablePlayers.length >= 4;
            checks.push({
                name: 'Sufficient Available Players',
                passed: sufficientPlayers,
                message: sufficientPlayers
                    ? `${availablePlayers.length} available players (sufficient for foursomes)`
                    : `Only ${availablePlayers.length} available players (need at least 4)`,
                details: { availableCount: availablePlayers.length, totalCount: allPlayers.length, minimumRequired: 4 }
            });

            const existingSchedule = await this.scheduleRepository.findByWeekId(weekId);
            checks.push({
                name: 'No Schedule Conflicts',
                passed: !existingSchedule,
                message: existingSchedule
                    ? `Schedule already exists for week ${weekId}`
                    : `No existing schedule found for week ${weekId}`,
                details: { hasExistingSchedule: !!existingSchedule }
            });

            return { isValid: checks.every(check => check.passed), checks };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            checks.push({ name: 'Precondition Validation', passed: false, message: `Validation failed: ${errorMessage}` });
            return { isValid: false, checks };
        }
    }

    /**
     * Validate pre-regeneration constraints
     */
    async validatePreRegenerationConstraints(weekId: string, getRegenerationStatus: (weekId: string) => any): Promise<ValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        try {
            const week = await this.weekRepository.findById(weekId);
            if (!week) {
                errors.push(`Week ${weekId} not found`);
                return { isValid: false, errors, warnings };
            }

            const allPlayers = await this.playerRepository.findBySeasonId(week.seasonId);
            if (allPlayers.length === 0) {
                errors.push(`No players found for season ${week.seasonId}`);
                return { isValid: false, errors, warnings };
            }

            const availablePlayers = this.scheduleGenerator.filterAvailablePlayers(allPlayers, week);

            if (availablePlayers.length < 4) {
                errors.push(`Insufficient available players: ${availablePlayers.length} available, minimum 4 required`);

                const unavailablePlayers = allPlayers.filter(p => !availablePlayers.includes(p));
                if (unavailablePlayers.length > 0) {
                    warnings.push(`Consider making these players available: ${unavailablePlayers.map(p => `${p.firstName} ${p.lastName}`).join(', ')}`);
                }
            }

            const amPlayers = availablePlayers.filter(p => p.timePreference === 'AM');
            const pmPlayers = availablePlayers.filter(p => p.timePreference === 'PM');
            const eitherPlayers = availablePlayers.filter(p => p.timePreference === 'Either');
            const totalFlexible = eitherPlayers.length;
            const amDeficit = Math.max(0, 4 - amPlayers.length - totalFlexible);
            const pmDeficit = Math.max(0, 4 - pmPlayers.length - totalFlexible);

            if (amDeficit > 0) warnings.push(`Morning time slot may be understaffed (${amDeficit} players short)`);
            if (pmDeficit > 0) warnings.push(`Afternoon time slot may be understaffed (${pmDeficit} players short)`);

            const currentStatus = getRegenerationStatus(weekId);
            if (currentStatus && currentStatus.status === 'confirming') {
                errors.push('Another regeneration operation is currently in progress');
            }

            try {
                const storageEstimate = this.estimateStorageRequirement(weekId);
                const availableStorage = this.getAvailableStorage();
                if (storageEstimate > availableStorage) {
                    errors.push(`Insufficient storage space: ${storageEstimate}KB required, ${availableStorage}KB available`);
                }
            } catch (_) {
                warnings.push('Could not verify storage availability');
            }

        } catch (error) {
            errors.push(`Pre-validation check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        return { isValid: errors.length === 0, errors, warnings };
    }

    /**
     * Validate schedule constraints comprehensively
     */
    async validateScheduleConstraints(schedule: Schedule, availablePlayers: Player[], week: Week): Promise<ValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        const allPlayers = await this.playerRepository.findBySeasonId(week.seasonId);

        const baseValidation = this.scheduleGenerator.validateSchedule(schedule, availablePlayers, week);
        errors.push(...baseValidation.errors);

        const availabilityValidation = await this.validateDetailedAvailabilityConstraints(schedule, week, allPlayers);
        errors.push(...availabilityValidation.errors);
        warnings.push(...availabilityValidation.warnings);

        const allFoursomes = [...schedule.timeSlots.morning, ...schedule.timeSlots.afternoon];

        for (const foursome of allFoursomes) {
            if (foursome.players.length === 0) {
                errors.push(`Empty foursome found at position ${foursome.position} in ${foursome.timeSlot}`);
            } else if (foursome.players.length > 4) {
                errors.push(`Foursome at position ${foursome.position} in ${foursome.timeSlot} has ${foursome.players.length} players (maximum 4)`);
            }

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

            const leftCount = foursome.players.filter(p => p.handedness === 'left').length;
            const rightCount = foursome.players.filter(p => p.handedness === 'right').length;
            if (foursome.players.length >= 3 && (leftCount === 0 || rightCount === 0)) {
                warnings.push(`Foursome at position ${foursome.position} in ${foursome.timeSlot} has unbalanced handedness (${leftCount} left, ${rightCount} right)`);
            }
        }

        const totalPlayers = schedule.getTotalPlayerCount();
        const availableCount = availablePlayers.length;

        if (totalPlayers > availableCount) {
            errors.push(`Schedule contains ${totalPlayers} players but only ${availableCount} are available`);
        }

        const morningPlayerCount = schedule.timeSlots.morning.reduce((sum, f) => sum + f.players.length, 0);
        const afternoonPlayerCount = schedule.timeSlots.afternoon.reduce((sum, f) => sum + f.players.length, 0);

        const imbalance = Math.abs(morningPlayerCount - afternoonPlayerCount);
        if (imbalance > 4 && totalPlayers >= 8) {
            warnings.push(`Significant time slot imbalance: ${morningPlayerCount} morning, ${afternoonPlayerCount} afternoon players`);
        }

        return { isValid: errors.length === 0, errors, warnings };
    }

    /**
     * Validate detailed availability constraints
     */
    private async validateDetailedAvailabilityConstraints(schedule: Schedule, week: Week, allPlayers: Player[]): Promise<ValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        const allFoursomes = [...schedule.timeSlots.morning, ...schedule.timeSlots.afternoon];
        const scheduledPlayerIds = allFoursomes.flatMap(f => f.players.map(p => p.id));
        const playerMap = new Map(allPlayers.map(p => [p.id, p]));

        for (const playerId of scheduledPlayerIds) {
            const player = playerMap.get(playerId);
            const playerName = player ? `${player.firstName} ${player.lastName}` : playerId;

            const availabilityStatus = this.getPlayerAvailabilityStatus(playerId, week);

            if (availabilityStatus === false) {
                errors.push(`Player ${playerName} (${playerId}) is scheduled but marked as unavailable for week ${week.weekNumber}`);
            } else if (availabilityStatus === null || availabilityStatus === undefined) {
                errors.push(`Player ${playerName} (${playerId}) is scheduled but has no availability data for week ${week.weekNumber}`);
            }
        }

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

        return { isValid: errors.length === 0, errors, warnings };
    }

    /**
     * Get player availability status for a specific week
     */
    getPlayerAvailabilityStatus(playerId: string, week: Week): boolean | null {
        if ('playerAvailability' in week && week.playerAvailability) {
            return week.playerAvailability[playerId] ?? null;
        }
        return null;
    }

    /**
     * Validate business rules for schedule generation
     */
    async validateBusinessRules(schedule: Schedule, week: Week): Promise<ValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        try {
            const allFoursomes = [...schedule.timeSlots.morning, ...schedule.timeSlots.afternoon];
            const viableFoursomes = allFoursomes.filter(f => f.players.length >= 2);

            if (viableFoursomes.length === 0) {
                errors.push('Schedule must contain at least one foursome with 2 or more players');
            }

            const morningPlayers = new Set(schedule.timeSlots.morning.flatMap(f => f.players.map(p => p.id)));
            const afternoonPlayers = new Set(schedule.timeSlots.afternoon.flatMap(f => f.players.map(p => p.id)));

            const duplicatePlayers = [...morningPlayers].filter(id => afternoonPlayers.has(id));
            if (duplicatePlayers.length > 0) {
                errors.push(`Players scheduled in both time slots: ${duplicatePlayers.join(', ')}`);
            }

            const morningPositions = schedule.timeSlots.morning.map(f => f.position).sort((a, b) => a - b);
            const afternoonPositions = schedule.timeSlots.afternoon.map(f => f.position).sort((a, b) => a - b);

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

            const allPlayerIds = schedule.getAllPlayers();
            if (allPlayerIds.length > 0) {
                const playerObjects = [...schedule.timeSlots.morning, ...schedule.timeSlots.afternoon]
                    .flatMap(f => f.players);

                const seasons = new Set(playerObjects.map(p => p.seasonId));
                if (seasons.size > 1) {
                    errors.push(`Schedule contains players from multiple seasons: ${Array.from(seasons).join(', ')}`);
                }

                if (seasons.size === 1 && !seasons.has(week.seasonId)) {
                    errors.push(`Schedule contains players from season ${Array.from(seasons)[0]} but week belongs to season ${week.seasonId}`);
                }
            }

            const totalPlayers = schedule.getTotalPlayerCount();
            if (totalPlayers > 32) {
                warnings.push(`Large schedule with ${totalPlayers} players may be difficult to manage`);
            }

            if (schedule.timeSlots.morning.length === 0 && schedule.timeSlots.afternoon.length === 0) {
                errors.push('Schedule must have at least one time slot with foursomes');
            }

        } catch (error) {
            errors.push(`Business rule validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        return { isValid: errors.length === 0, errors, warnings };
    }

    /**
     * Generate availability conflict report
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

            const morningConflicts = conflicts.filter(c => c.timeSlot === 'morning');
            const afternoonConflicts = conflicts.filter(c => c.timeSlot === 'afternoon');

            if (morningConflicts.length > 0 && afternoonConflicts.length === 0) {
                suggestions.push('Consider moving available players to morning time slot to fill gaps');
            } else if (afternoonConflicts.length > 0 && morningConflicts.length === 0) {
                suggestions.push('Consider moving available players to afternoon time slot to fill gaps');
            }

            suggestions.push('Regenerate the schedule after updating player availability');
            suggestions.push('Contact unavailable players to confirm their status');
        }

        return { conflicts, suggestions };
    }

    /**
     * Generate validation error report with suggested actions
     */
    generateValidationErrorReport(
        preValidation: ValidationResult,
        scheduleValidation?: ValidationResult,
        businessRuleValidation?: ValidationResult
    ): { errors: string[]; warnings: string[]; suggestions: string[] } {
        const allErrors: string[] = [];
        const allWarnings: string[] = [];
        const suggestions: string[] = [];

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

        for (const warning of allWarnings) {
            if (warning.includes('unavailable player(s)')) {
                suggestions.push('Review and update availability for players in the schedule');
                suggestions.push('Consider regenerating the schedule with current availability data');
            } else if (warning.includes('unbalanced handedness')) {
                suggestions.push('Consider manual adjustments to balance left and right-handed players');
            }
        }

        return {
            errors: allErrors,
            warnings: allWarnings,
            suggestions: Array.from(new Set(suggestions))
        };
    }

    /**
     * Generate detailed availability error report
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
     * Estimate storage requirement for backup creation
     */
    estimateStorageRequirement(_weekId: string): number {
        return 10;
    }

    /**
     * Get available storage space in KB
     */
    getAvailableStorage(): number {
        try {
            const testKey = 'storage_test';
            const testData = 'x'.repeat(1024);
            localStorage.setItem(testKey, testData);
            localStorage.removeItem(testKey);
            return 1024;
        } catch (_) {
            return 0;
        }
    }
}
