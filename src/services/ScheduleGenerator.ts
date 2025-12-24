import { Player } from '../models/Player';
import { Schedule, ScheduleModel } from '../models/Schedule';
import { Foursome, FoursomeModel, TimeSlot } from '../models/Foursome';
import { Week, WeekModel } from '../models/Week';
import { PairingHistoryTracker } from './PairingHistoryTracker';
import { AvailabilityErrorReporter } from '../utils/AvailabilityErrorReporter';

export interface ScheduleGeneratorOptions {
  prioritizeCompleteGroups?: boolean;
  balanceTimeSlots?: boolean;
  optimizePairings?: boolean;
}

export class ScheduleGenerator {
  private options: ScheduleGeneratorOptions;
  private pairingHistoryTracker: PairingHistoryTracker | undefined;
  private availabilityErrorReporter: AvailabilityErrorReporter;

  constructor(options: ScheduleGeneratorOptions = {}, pairingHistoryTracker?: PairingHistoryTracker) {
    this.options = {
      prioritizeCompleteGroups: true,
      balanceTimeSlots: true,
      optimizePairings: true,
      ...options
    };
    this.pairingHistoryTracker = pairingHistoryTracker;
    this.availabilityErrorReporter = new AvailabilityErrorReporter();
  }

  /**
   * Generate a schedule for available players
   */
  async generateSchedule(weekId: string, availablePlayers: Player[], seasonId?: string): Promise<Schedule> {
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

    // Use seasonId from players if not provided
    const effectiveSeasonId = seasonId || (availablePlayers.length > 0 ? availablePlayers[0].seasonId : undefined);

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
    const morningFoursomes = await this.createFoursomes(morningPlayers, 'morning', effectiveSeasonId);
    const afternoonFoursomes = await this.createFoursomes(afternoonPlayers, 'afternoon', effectiveSeasonId);

    // Add foursomes to schedule
    morningFoursomes.forEach(foursome => schedule.addFoursome(foursome));
    afternoonFoursomes.forEach(foursome => schedule.addFoursome(foursome));

    return schedule;
  }

  /**
   * Generate a schedule for a specific week, filtering by player availability
   */
  async generateScheduleForWeek(week: Week | WeekModel, allPlayers: Player[]): Promise<Schedule> {
    // Filter players by availability for this week
    const availablePlayers = this.filterAvailablePlayers(allPlayers, week);
    
    // Generate schedule with available players
    return this.generateSchedule(week.id, availablePlayers, week.seasonId);
  }

  /**
   * Filter players based on their availability for a specific week
   */
  filterAvailablePlayers(allPlayers: Player[], week: Week | WeekModel): Player[] {
    // FIXED: Always require explicit availability data - no default assumptions
    // Only players explicitly marked as available (true) should be included
    
    const availablePlayers: Player[] = [];
    
    for (const player of allPlayers) {
      const playerName = `${player.firstName} ${player.lastName}`;
      let isAvailable: boolean;
      let availabilityStatus: boolean | null | undefined;
      
      if (week instanceof WeekModel) {
        isAvailable = week.isPlayerAvailable(player.id);
        availabilityStatus = week.getPlayerAvailabilityStatus(player.id);
      } else {
        // Handle plain Week interface - strict boolean checking
        availabilityStatus = week.playerAvailability?.[player.id];
        isAvailable = availabilityStatus === true;
      }
      
      if (isAvailable) {
        availablePlayers.push(player);
        this.availabilityErrorReporter.logFilteringDecision(
          player.id,
          playerName,
          availabilityStatus,
          'included',
          `Player explicitly marked as available (status: ${availabilityStatus})`
        );
      } else {
        let reason: string;
        if (availabilityStatus === false) {
          reason = `Player explicitly marked as unavailable (status: ${availabilityStatus})`;
        } else if (availabilityStatus === null || availabilityStatus === undefined) {
          reason = `Player has no availability data (status: ${availabilityStatus})`;
        } else {
          reason = `Player availability status is not explicitly true (status: ${availabilityStatus})`;
        }
        
        this.availabilityErrorReporter.logFilteringDecision(
          player.id,
          playerName,
          availabilityStatus,
          'excluded',
          reason
        );
      }
    }
    
    // Log summary of filtering results
    console.log(`[ScheduleGenerator] Availability filtering completed:`, {
      totalPlayers: allPlayers.length,
      availablePlayers: availablePlayers.length,
      excludedPlayers: allPlayers.length - availablePlayers.length,
      weekId: week.id,
      weekNumber: week.weekNumber
    });
    
    return availablePlayers;
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
  private async createFoursomes(players: Player[], timeSlot: TimeSlot, seasonId?: string): Promise<Foursome[]> {
    if (players.length === 0) {
      return [];
    }

    const foursomes: Foursome[] = [];
    let position = 0;
    let remainingPlayers = [...players];

    // If pairing optimization is enabled and we have a tracker
    if (this.options.optimizePairings && this.pairingHistoryTracker && seasonId) {
      // Create optimized foursomes
      while (remainingPlayers.length >= 4) {
        const optimalFoursome = await this.pairingHistoryTracker.findOptimalFoursome(seasonId, remainingPlayers);
        
        const foursome = new FoursomeModel({
          players: optimalFoursome,
          timeSlot,
          position: position++
        });
        foursomes.push(foursome);

        // Remove selected players from remaining players
        remainingPlayers = remainingPlayers.filter(p => !optimalFoursome.some(op => op.id === p.id));
      }

      // Handle remaining players (less than 4)
      if (remainingPlayers.length > 0) {
        const foursome = new FoursomeModel({
          players: remainingPlayers,
          timeSlot,
          position: position++
        });
        foursomes.push(foursome);
      }
    } else {
      // Original algorithm - create complete foursomes first (groups of 4)
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
      const remainingPlayersCount = players.length % 4;
      if (remainingPlayersCount > 0) {
        const remainingPlayersSlice = players.slice(Math.floor(players.length / 4) * 4);
        const foursome = new FoursomeModel({
          players: remainingPlayersSlice,
          timeSlot,
          position: position++
        });
        foursomes.push(foursome);
      }
    }

    return foursomes;
  }

  /**
   * Finalize a schedule by updating pairing history
   */
  async finalizeSchedule(schedule: Schedule, seasonId: string): Promise<void> {
    if (this.pairingHistoryTracker) {
      await this.pairingHistoryTracker.trackSchedulePairings(seasonId, schedule);
    }
  }

  /**
   * Validate that a schedule meets all constraints including availability
   */
  validateSchedule(schedule: Schedule, availablePlayers: Player[], week?: Week | WeekModel): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check that all players in schedule are in available players
    const availablePlayerIds = new Set(availablePlayers.map(p => p.id));
    const scheduledPlayerIds = schedule.getAllPlayers();

    for (const playerId of scheduledPlayerIds) {
      if (!availablePlayerIds.has(playerId)) {
        errors.push(`Player ${playerId} is in schedule but not in available players`);
      }
    }

    // Enhanced availability validation when week is provided
    if (week) {
      const unavailableScheduledPlayers: string[] = [];
      const playersWithoutAvailabilityData: string[] = [];
      
      for (const playerId of scheduledPlayerIds) {
        if (week instanceof WeekModel) {
          // Use enhanced WeekModel methods for strict validation
          if (!week.hasAvailabilityData(playerId)) {
            playersWithoutAvailabilityData.push(playerId);
          } else if (!week.isPlayerAvailable(playerId)) {
            unavailableScheduledPlayers.push(playerId);
          }
        } else {
          // Handle plain Week interface
          if (!(playerId in week.playerAvailability)) {
            playersWithoutAvailabilityData.push(playerId);
          } else if (week.playerAvailability[playerId] !== true) {
            unavailableScheduledPlayers.push(playerId);
          }
        }
      }

      // Report availability violations with detailed information
      if (unavailableScheduledPlayers.length > 0) {
        const playerNames = unavailableScheduledPlayers.map(id => {
          const player = availablePlayers.find(p => p.id === id);
          return player ? `${player.firstName} ${player.lastName} (${id})` : id;
        });
        errors.push(`Unavailable players are scheduled: ${playerNames.join(', ')}`);
      }

      if (playersWithoutAvailabilityData.length > 0) {
        const playerNames = playersWithoutAvailabilityData.map(id => {
          const player = availablePlayers.find(p => p.id === id);
          return player ? `${player.firstName} ${player.lastName} (${id})` : id;
        });
        errors.push(`Players without availability data are scheduled: ${playerNames.join(', ')}`);
      }

      // Validate that all scheduled players have explicit availability === true
      for (const playerId of scheduledPlayerIds) {
        const availabilityStatus = week instanceof WeekModel 
          ? week.getPlayerAvailabilityStatus(playerId)
          : week.playerAvailability[playerId];
        
        if (availabilityStatus !== true) {
          const player = availablePlayers.find(p => p.id === playerId);
          const playerName = player ? `${player.firstName} ${player.lastName} (${playerId})` : playerId;
          errors.push(`Player ${playerName} is scheduled but availability is not explicitly true (current: ${availabilityStatus})`);
        }
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
        const player = availablePlayers.find(p => p.id === playerId);
        const playerName = player ? `${player.firstName} ${player.lastName} (${playerId})` : playerId;
        errors.push(`Player ${playerName} appears ${count} times in schedule`);
      }
    }

    // Check time preferences are respected
    schedule.timeSlots.morning.forEach(foursome => {
      foursome.players.forEach(player => {
        if (player.timePreference === 'PM') {
          errors.push(`Player ${player.firstName} ${player.lastName} (${player.id}) has PM preference but is scheduled in morning`);
        }
      });
    });

    schedule.timeSlots.afternoon.forEach(foursome => {
      foursome.players.forEach(player => {
        if (player.timePreference === 'AM') {
          errors.push(`Player ${player.firstName} ${player.lastName} (${player.id}) has AM preference but is scheduled in afternoon`);
        }
      });
    });

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate schedule availability specifically (focused validation)
   */
  validateScheduleAvailability(schedule: Schedule, week: Week | WeekModel, allPlayers: Player[]): { isValid: boolean; errors: string[]; conflicts: Array<{ playerId: string; playerName: string; availabilityStatus: boolean | undefined }> } {
    const errors: string[] = [];
    const conflicts: Array<{ playerId: string; playerName: string; availabilityStatus: boolean | undefined }> = [];
    
    const scheduledPlayerIds = schedule.getAllPlayers();
    
    for (const playerId of scheduledPlayerIds) {
      const player = allPlayers.find(p => p.id === playerId);
      const playerName = player ? `${player.firstName} ${player.lastName}` : 'Unknown Player';
      
      let availabilityStatus: boolean | undefined;
      let hasData: boolean;
      
      if (week instanceof WeekModel) {
        hasData = week.hasAvailabilityData(playerId);
        availabilityStatus = week.getPlayerAvailabilityStatus(playerId);
      } else {
        hasData = playerId in week.playerAvailability;
        availabilityStatus = week.playerAvailability[playerId];
      }
      
      if (!hasData) {
        errors.push(`Player ${playerName} (${playerId}) is scheduled but has no availability data`);
        conflicts.push({ playerId, playerName, availabilityStatus: undefined });
      } else if (availabilityStatus !== true) {
        errors.push(`Player ${playerName} (${playerId}) is scheduled but is marked as unavailable (status: ${availabilityStatus})`);
        conflicts.push({ playerId, playerName, availabilityStatus });
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      conflicts
    };
  }
}