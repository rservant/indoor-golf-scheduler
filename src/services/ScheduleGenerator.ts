import { Player } from '../models/Player';
import { Schedule, ScheduleModel } from '../models/Schedule';
import { Foursome, FoursomeModel, TimeSlot } from '../models/Foursome';

export interface ScheduleGeneratorOptions {
  prioritizeCompleteGroups?: boolean;
  balanceTimeSlots?: boolean;
}

export class ScheduleGenerator {
  private options: ScheduleGeneratorOptions;

  constructor(options: ScheduleGeneratorOptions = {}) {
    this.options = {
      prioritizeCompleteGroups: true,
      balanceTimeSlots: true,
      ...options
    };
  }

  /**
   * Generate a schedule for available players
   */
  generateSchedule(weekId: string, availablePlayers: Player[]): Schedule {
    if (!weekId || weekId.trim().length === 0) {
      throw new Error('Week ID is required');
    }

    if (!Array.isArray(availablePlayers)) {
      throw new Error('Available players must be an array');
    }

    // Validate all players are from the same season
    if (availablePlayers.length > 1) {
      const firstSeasonId = availablePlayers[0]?.seasonId;
      const allSameSeason = availablePlayers.every(p => p.seasonId === firstSeasonId);
      if (!allSameSeason) {
        throw new Error('All players must be from the same season');
      }
    }

    const schedule = new ScheduleModel({ weekId });

    if (availablePlayers.length === 0) {
      return schedule;
    }

    // Separate players by time preference
    const amPlayers = availablePlayers.filter(p => p.timePreference === 'AM');
    const pmPlayers = availablePlayers.filter(p => p.timePreference === 'PM');
    const eitherPlayers = availablePlayers.filter(p => p.timePreference === 'Either');

    // Assign players to time slots
    const { morningPlayers, afternoonPlayers } = this.assignPlayersToTimeSlots(
      amPlayers,
      pmPlayers,
      eitherPlayers
    );

    // Create foursomes for each time slot
    const morningFoursomes = this.createFoursomes(morningPlayers, 'morning');
    const afternoonFoursomes = this.createFoursomes(afternoonPlayers, 'afternoon');

    // Add foursomes to schedule
    morningFoursomes.forEach(foursome => schedule.addFoursome(foursome));
    afternoonFoursomes.forEach(foursome => schedule.addFoursome(foursome));

    return schedule;
  }

  /**
   * Assign players to time slots based on preferences and balancing
   */
  private assignPlayersToTimeSlots(
    amPlayers: Player[],
    pmPlayers: Player[],
    eitherPlayers: Player[]
  ): { morningPlayers: Player[]; afternoonPlayers: Player[] } {
    let morningPlayers = [...amPlayers];
    let afternoonPlayers = [...pmPlayers];

    if (this.options.balanceTimeSlots && eitherPlayers.length > 0) {
      // Calculate current imbalance
      const morningCount = morningPlayers.length;
      const afternoonCount = afternoonPlayers.length;
      const totalEither = eitherPlayers.length;

      if (morningCount < afternoonCount) {
        // Morning has fewer players, add more Either players to morning
        const deficit = afternoonCount - morningCount;
        const toMorning = Math.min(Math.ceil((deficit + totalEither) / 2), totalEither);
        morningPlayers.push(...eitherPlayers.slice(0, toMorning));
        afternoonPlayers.push(...eitherPlayers.slice(toMorning));
      } else if (afternoonCount < morningCount) {
        // Afternoon has fewer players, add more Either players to afternoon
        const deficit = morningCount - afternoonCount;
        const toAfternoon = Math.min(Math.ceil((deficit + totalEither) / 2), totalEither);
        afternoonPlayers.push(...eitherPlayers.slice(0, toAfternoon));
        morningPlayers.push(...eitherPlayers.slice(toAfternoon));
      } else {
        // Equal, distribute evenly
        const halfEither = Math.floor(totalEither / 2);
        morningPlayers.push(...eitherPlayers.slice(0, halfEither));
        afternoonPlayers.push(...eitherPlayers.slice(halfEither));
      }
    } else {
      // No balancing, just distribute evenly
      const halfEither = Math.floor(eitherPlayers.length / 2);
      morningPlayers.push(...eitherPlayers.slice(0, halfEither));
      afternoonPlayers.push(...eitherPlayers.slice(halfEither));
    }

    return { morningPlayers, afternoonPlayers };
  }

  /**
   * Create foursomes from a list of players for a specific time slot
   */
  private createFoursomes(players: Player[], timeSlot: TimeSlot): Foursome[] {
    if (players.length === 0) {
      return [];
    }

    const foursomes: Foursome[] = [];
    let position = 0;

    // Create complete foursomes first (groups of 4)
    for (let i = 0; i < Math.floor(players.length / 4); i++) {
      const foursomeePlayers = players.slice(i * 4, (i + 1) * 4);
      const foursome = new FoursomeModel({
        players: foursomeePlayers,
        timeSlot,
        position: position++
      });
      foursomes.push(foursome);
    }

    // Handle remaining players (less than 4)
    const remainingPlayers = players.slice(Math.floor(players.length / 4) * 4);
    if (remainingPlayers.length > 0) {
      const foursome = new FoursomeModel({
        players: remainingPlayers,
        timeSlot,
        position: position++
      });
      foursomes.push(foursome);
    }

    return foursomes;
  }

  /**
   * Validate that a schedule meets all constraints
   */
  validateSchedule(schedule: Schedule, availablePlayers: Player[]): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check that all players in schedule are in available players
    const availablePlayerIds = new Set(availablePlayers.map(p => p.id));
    const scheduledPlayerIds = schedule.getAllPlayers();

    for (const playerId of scheduledPlayerIds) {
      if (!availablePlayerIds.has(playerId)) {
        errors.push(`Player ${playerId} is in schedule but not in available players`);
      }
    }

    // Check that each player appears exactly once
    const playerCounts = new Map<string, number>();
    [...schedule.timeSlots.morning, ...schedule.timeSlots.afternoon].forEach(foursome => {
      foursome.players.forEach(player => {
        const count = playerCounts.get(player.id) || 0;
        playerCounts.set(player.id, count + 1);
      });
    });

    for (const [playerId, count] of playerCounts.entries()) {
      if (count > 1) {
        errors.push(`Player ${playerId} appears ${count} times in schedule`);
      }
    }

    // Check time preferences are respected
    schedule.timeSlots.morning.forEach(foursome => {
      foursome.players.forEach(player => {
        if (player.timePreference === 'PM') {
          errors.push(`Player ${player.id} has PM preference but is scheduled in morning`);
        }
      });
    });

    schedule.timeSlots.afternoon.forEach(foursome => {
      foursome.players.forEach(player => {
        if (player.timePreference === 'AM') {
          errors.push(`Player ${player.id} has AM preference but is scheduled in afternoon`);
        }
      });
    });

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}