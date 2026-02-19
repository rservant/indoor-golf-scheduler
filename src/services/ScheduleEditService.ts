import { Schedule, ScheduleModel } from '../models/Schedule';
import { FoursomeModel } from '../models/Foursome';
import { Player } from '../models/Player';
import { Week } from '../models/Week';
import { ScheduleRepository } from '../repositories/ScheduleRepository';
import { WeekRepository } from '../repositories/WeekRepository';
import { PlayerRepository } from '../repositories/PlayerRepository';
import { ScheduleGenerator } from './ScheduleGenerator';
import { ScheduleEditOperation, ValidationResult, ConflictResolution } from './ScheduleManager';

/**
 * Handles manual schedule editing operations: move, swap, add, remove players.
 * Extracted from ScheduleManager to isolate edit-specific logic.
 */
export class ScheduleEditService {
    constructor(
        private scheduleRepository: ScheduleRepository,
        private weekRepository: WeekRepository,
        private playerRepository: PlayerRepository,
        private scheduleGenerator: ScheduleGenerator
    ) { }

    /**
     * Apply a manual edit operation to a schedule
     */
    async applyManualEdit(weekId: string, operation: ScheduleEditOperation): Promise<Schedule> {
        const schedule = await this.scheduleRepository.findByWeekId(weekId);
        if (!schedule) {
            throw new Error(`Schedule not found for week ${weekId}`);
        }

        const scheduleModel = new ScheduleModel({
            ...schedule,
            timeSlots: {
                morning: schedule.timeSlots.morning.map(f => new FoursomeModel(f)),
                afternoon: schedule.timeSlots.afternoon.map(f => new FoursomeModel(f))
            }
        });

        await this.executeEditOperation(scheduleModel, operation);

        const validation = await this.validateManualEdit(weekId, scheduleModel);
        if (!validation.isValid) {
            throw new Error(`Manual edit validation failed: ${validation.errors.join(', ')}`);
        }

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

        schedule.timeSlots.morning = allFoursomes.filter(f => f.timeSlot === 'morning');
        schedule.timeSlots.afternoon = allFoursomes.filter(f => f.timeSlot === 'afternoon');
    }

    /**
     * Move a player from one foursome to another
     */
    private async movePlayer(foursomes: FoursomeModel[], playerId: string, fromFoursomeId: string, toFoursomeId: string): Promise<void> {
        const fromFoursome = foursomes.find(f => f.id === fromFoursomeId);
        const toFoursome = foursomes.find(f => f.id === toFoursomeId);

        if (!fromFoursome) throw new Error(`Source foursome ${fromFoursomeId} not found`);
        if (!toFoursome) throw new Error(`Target foursome ${toFoursomeId} not found`);

        const player = fromFoursome.players.find(p => p.id === playerId);
        if (!player) throw new Error(`Player ${playerId} not found in source foursome`);

        if (toFoursome.isFull()) {
            throw new Error('Target foursome is already full (4 players)');
        }

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

        for (const foursome of foursomes) {
            const p1 = foursome.players.find(p => p.id === playerId1);
            const p2 = foursome.players.find(p => p.id === playerId2);

            if (p1) { foursome1 = foursome; player1 = p1; }
            if (p2) { foursome2 = foursome; player2 = p2; }
        }

        if (!foursome1 || !player1) throw new Error(`Player ${playerId1} not found in any foursome`);
        if (!foursome2 || !player2) throw new Error(`Player ${playerId2} not found in any foursome`);

        foursome1.removePlayer(playerId1);
        foursome2.removePlayer(playerId2);
        foursome1.addPlayer(player2);
        foursome2.addPlayer(player1);
    }

    /**
     * Add a player to a specific foursome
     */
    private async addPlayerToFoursome(foursomes: FoursomeModel[], _playerId: string, foursomeId: string): Promise<void> {
        const foursome = foursomes.find(f => f.id === foursomeId);
        if (!foursome) throw new Error(`Foursome ${foursomeId} not found`);
        if (foursome.isFull()) throw new Error('Foursome is already full (4 players)');

        throw new Error('Add player operation requires player data from repository');
    }

    /**
     * Remove a player from a specific foursome
     */
    private async removePlayerFromFoursome(foursomes: FoursomeModel[], playerId: string, foursomeId: string): Promise<void> {
        const foursome = foursomes.find(f => f.id === foursomeId);
        if (!foursome) throw new Error(`Foursome ${foursomeId} not found`);

        const removed = foursome.removePlayer(playerId);
        if (!removed) throw new Error(`Player ${playerId} not found in foursome ${foursomeId}`);
    }

    /**
     * Validate a manual edit to ensure all constraints are met
     */
    async validateManualEdit(weekId: string, schedule: Schedule): Promise<ValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        const week = await this.weekRepository.findById(weekId);
        if (!week) {
            errors.push(`Week ${weekId} not found`);
            return { isValid: false, errors, warnings };
        }

        const allPlayers = await this.playerRepository.findBySeasonId(week.seasonId);
        const availablePlayers = this.scheduleGenerator.filterAvailablePlayers(allPlayers, week);

        const validation = this.scheduleGenerator.validateSchedule(schedule, availablePlayers);
        errors.push(...validation.errors);

        const allFoursomes = [...schedule.timeSlots.morning, ...schedule.timeSlots.afternoon];

        const emptyFoursomes = allFoursomes.filter(f => f.players.length === 0);
        if (emptyFoursomes.length > 0) {
            warnings.push(`${emptyFoursomes.length} empty foursome(s) found`);
        }

        const overfullFoursomes = allFoursomes.filter(f => f.players.length > 4);
        if (overfullFoursomes.length > 0) {
            errors.push(`${overfullFoursomes.length} foursome(s) have more than 4 players`);
        }

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

        return { isValid: errors.length === 0, errors, warnings };
    }

    /**
     * Detect conflicts and provide resolution suggestions
     */
    async detectConflicts(weekId: string, schedule: Schedule): Promise<ConflictResolution> {
        const validation = await this.validateManualEdit(weekId, schedule);
        const conflicts = validation.errors;
        const suggestions: string[] = [];

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
     * Update an existing schedule
     */
    async updateSchedule(weekId: string, schedule: Schedule): Promise<Schedule> {
        const existingSchedule = await this.scheduleRepository.findByWeekId(weekId);
        if (!existingSchedule) {
            throw new Error(`Schedule not found for week ${weekId}`);
        }

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
}
