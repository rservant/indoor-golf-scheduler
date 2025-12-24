import { Player } from '../models/Player';
import { Schedule, ScheduleModel } from '../models/Schedule';
import { Foursome, FoursomeModel, TimeSlot } from '../models/Foursome';
import { Week, WeekModel } from '../models/Week';
import { PairingHistoryTracker } from './PairingHistoryTracker';
import { AvailabilityErrorReporter } from '../utils/AvailabilityErrorReporter';
import { ScheduleGenerationLogger, DebugInfo } from '../utils/ScheduleGenerationLogger';

export interface ScheduleGeneratorOptions {
  prioritizeCompleteGroups?: boolean;
  balanceTimeSlots?: boolean;
  optimizePairings?: boolean;
}

export class ScheduleGenerator {
  private options: ScheduleGeneratorOptions;
  private pairingHistoryTracker: PairingHistoryTracker | undefined;
  private availabilityErrorReporter: AvailabilityErrorReporter;
  private logger: ScheduleGenerationLogger;
  private lastDebugInfo: DebugInfo | null = null;

  constructor(options: ScheduleGeneratorOptions = {}, pairingHistoryTracker?: PairingHistoryTracker) {
    this.options = {
      prioritizeCompleteGroups: true,
      balanceTimeSlots: true,
      optimizePairings: true,
      ...options
    };
    this.pairingHistoryTracker = pairingHistoryTracker;
    this.availabilityErrorReporter = new AvailabilityErrorReporter();
    this.logger = new ScheduleGenerationLogger();
  }

  /**
   * Generate a schedule for available players with detailed logging
   * Enhanced with better error handling and reporting in generateSchedule
   */
  private async generateScheduleWithLogging(weekId: string, availablePlayers: Player[], seasonId?: string): Promise<Schedule> {
    this.logger.logStep('Starting schedule generation with available players', {
      weekId,
      availablePlayerCount: availablePlayers.length,
      seasonId
    }, true);

    // Enhanced validation and error handling
    if (!weekId || weekId.trim().length === 0) {
      const error = 'Week ID is required and cannot be empty';
      this.logger.logStep('Schedule generation failed - invalid week ID', { error, weekId }, false, error);
      throw new Error(error);
    }

    if (!Array.isArray(availablePlayers)) {
      const error = 'Available players must be an array';
      this.logger.logStep('Schedule generation failed - invalid players input', { 
        error, 
        playersType: typeof availablePlayers,
        playersValue: availablePlayers 
      }, false, error);
      throw new Error(error);
    }

    // Validate all players are from the same season
    if (availablePlayers.length > 1) {
      const firstSeasonId = availablePlayers[0]?.seasonId;
      const allSameSeason = availablePlayers.every(p => p.seasonId === firstSeasonId);
      if (!allSameSeason) {
        const error = 'All players must be from the same season';
        const playerSeasons = availablePlayers.map(p => ({ id: p.id, seasonId: p.seasonId }));
        this.logger.logStep('Schedule generation failed - mixed seasons', { 
          error,
          playerSeasons,
          firstSeasonId
        }, false, error);
        throw new Error(error);
      }
    }

    // Use seasonId from players if not provided
    const effectiveSeasonId = seasonId || (availablePlayers.length > 0 ? availablePlayers[0].seasonId : undefined);

    let schedule: ScheduleModel;
    try {
      schedule = new ScheduleModel({ weekId });
      if (!schedule || !schedule.weekId) {
        const error = 'Failed to create schedule model';
        this.logger.logStep('Schedule generation failed - model creation error', { error, weekId }, false, error);
        throw new Error(error);
      }
    } catch (scheduleError) {
      const error = `Schedule model creation failed: ${scheduleError instanceof Error ? scheduleError.message : 'Unknown error'}`;
      this.logger.logStep('Schedule generation failed - model creation exception', { 
        error, 
        weekId,
        originalError: scheduleError 
      }, false, error);
      throw new Error(error);
    }

    if (availablePlayers.length === 0) {
      this.logger.logStep('No available players - returning empty schedule', { 
        weekId,
        guidance: 'Check player availability data and ensure players are marked as available'
      }, true);
      return schedule;
    }

    // Check for insufficient players and provide guidance
    if (availablePlayers.length < 4) {
      this.logger.logStep('Insufficient players for complete foursomes', {
        availableCount: availablePlayers.length,
        minimumRequired: 4,
        willCreatePartialGroups: true,
        guidance: 'Consider adding more players or updating availability data'
      }, true);
    }

    this.logger.logStep('Separating players by time preference', {
      totalPlayers: availablePlayers.length
    }, true);

    // Separate players by time preference with validation
    let amPlayers: Player[], pmPlayers: Player[], eitherPlayers: Player[];
    try {
      amPlayers = availablePlayers.filter(p => p.timePreference === 'AM');
      pmPlayers = availablePlayers.filter(p => p.timePreference === 'PM');
      eitherPlayers = availablePlayers.filter(p => p.timePreference === 'Either');

      // Validation: ensure all players are categorized
      const totalCategorized = amPlayers.length + pmPlayers.length + eitherPlayers.length;
      if (totalCategorized !== availablePlayers.length) {
        const error = `Player categorization failed: ${totalCategorized} categorized vs ${availablePlayers.length} total`;
        const uncategorizedPlayers = availablePlayers.filter(p => 
          p.timePreference !== 'AM' && p.timePreference !== 'PM' && p.timePreference !== 'Either'
        );
        this.logger.logStep('Schedule generation failed - player categorization error', { 
          error,
          totalPlayers: availablePlayers.length,
          totalCategorized,
          uncategorizedPlayers: uncategorizedPlayers.map(p => ({ 
            id: p.id, 
            name: `${p.firstName} ${p.lastName}`, 
            timePreference: p.timePreference 
          }))
        }, false, error);
        throw new Error(error);
      }
    } catch (filterError) {
      const error = `Player filtering failed: ${filterError instanceof Error ? filterError.message : 'Unknown error'}`;
      this.logger.logStep('Schedule generation failed - player filtering exception', { 
        error,
        originalError: filterError 
      }, false, error);
      throw new Error(error);
    }

    this.logger.logStep('Time preference separation completed', {
      amPlayers: amPlayers.length,
      pmPlayers: pmPlayers.length,
      eitherPlayers: eitherPlayers.length
    }, true);

    // Assign players to time slots with validation
    let morningPlayers: Player[], afternoonPlayers: Player[];
    try {
      const assignment = this.assignPlayersToTimeSlots(amPlayers, pmPlayers, eitherPlayers);
      morningPlayers = assignment.morningPlayers;
      afternoonPlayers = assignment.afternoonPlayers;

      // Validation: ensure all players are assigned
      const totalAssigned = morningPlayers.length + afternoonPlayers.length;
      if (totalAssigned !== availablePlayers.length) {
        const error = `Time slot assignment failed: ${totalAssigned} assigned vs ${availablePlayers.length} total`;
        this.logger.logStep('Schedule generation failed - time slot assignment error', { 
          error,
          totalPlayers: availablePlayers.length,
          totalAssigned,
          morningCount: morningPlayers.length,
          afternoonCount: afternoonPlayers.length
        }, false, error);
        throw new Error(error);
      }
    } catch (assignmentError) {
      const error = `Time slot assignment failed: ${assignmentError instanceof Error ? assignmentError.message : 'Unknown error'}`;
      this.logger.logStep('Schedule generation failed - time slot assignment exception', { 
        error,
        originalError: assignmentError 
      }, false, error);
      throw new Error(error);
    }

    this.logger.logStep('Time slot assignment completed', {
      morningPlayers: morningPlayers.length,
      afternoonPlayers: afternoonPlayers.length
    }, true);

    // Create foursomes for each time slot with enhanced error handling
    let morningFoursomes: Foursome[], afternoonFoursomes: Foursome[];
    
    try {
      this.logger.logStep('Creating foursomes for morning time slot', {
        playerCount: morningPlayers.length
      }, true);
      morningFoursomes = await this.createFoursomesWithLogging(morningPlayers, 'morning', effectiveSeasonId);
      
      // Validation: verify morning foursomes
      if (!Array.isArray(morningFoursomes)) {
        const error = 'Morning foursome creation returned invalid result';
        this.logger.logStep('Schedule generation failed - invalid morning foursomes', { 
          error,
          result: morningFoursomes 
        }, false, error);
        throw new Error(error);
      }
    } catch (morningError) {
      const error = `Morning foursome creation failed: ${morningError instanceof Error ? morningError.message : 'Unknown error'}`;
      this.logger.logStep('Schedule generation failed - morning foursome creation exception', { 
        error,
        morningPlayerCount: morningPlayers.length,
        originalError: morningError 
      }, false, error);
      throw new Error(error);
    }
    
    try {
      this.logger.logStep('Creating foursomes for afternoon time slot', {
        playerCount: afternoonPlayers.length
      }, true);
      afternoonFoursomes = await this.createFoursomesWithLogging(afternoonPlayers, 'afternoon', effectiveSeasonId);

      // Validation: verify afternoon foursomes
      if (!Array.isArray(afternoonFoursomes)) {
        const error = 'Afternoon foursome creation returned invalid result';
        this.logger.logStep('Schedule generation failed - invalid afternoon foursomes', { 
          error,
          result: afternoonFoursomes 
        }, false, error);
        throw new Error(error);
      }
    } catch (afternoonError) {
      const error = `Afternoon foursome creation failed: ${afternoonError instanceof Error ? afternoonError.message : 'Unknown error'}`;
      this.logger.logStep('Schedule generation failed - afternoon foursome creation exception', { 
        error,
        afternoonPlayerCount: afternoonPlayers.length,
        originalError: afternoonError 
      }, false, error);
      throw new Error(error);
    }

    this.logger.logStep('Foursome creation completed', {
      morningFoursomes: morningFoursomes.length,
      afternoonFoursomes: afternoonFoursomes.length,
      totalFoursomes: morningFoursomes.length + afternoonFoursomes.length
    }, true);

    // Add foursomes to schedule with validation
    try {
      let addedFoursomes = 0;
      
      for (const foursome of morningFoursomes) {
        if (!foursome || !foursome.id) {
          const error = `Invalid morning foursome at index ${addedFoursomes}`;
          this.logger.logStep('Schedule generation failed - invalid morning foursome', { 
            error,
            foursomeIndex: addedFoursomes,
            foursome: foursome ? { id: foursome.id } : null
          }, false, error);
          throw new Error(error);
        }
        schedule.addFoursome(foursome);
        addedFoursomes++;
      }
      
      for (const foursome of afternoonFoursomes) {
        if (!foursome || !foursome.id) {
          const error = `Invalid afternoon foursome at index ${addedFoursomes - morningFoursomes.length}`;
          this.logger.logStep('Schedule generation failed - invalid afternoon foursome', { 
            error,
            foursomeIndex: addedFoursomes - morningFoursomes.length,
            foursome: foursome ? { id: foursome.id } : null
          }, false, error);
          throw new Error(error);
        }
        schedule.addFoursome(foursome);
        addedFoursomes++;
      }

      // Final validation: verify schedule integrity
      const expectedFoursomes = morningFoursomes.length + afternoonFoursomes.length;
      const actualMorningCount = schedule.timeSlots.morning.length;
      const actualAfternoonCount = schedule.timeSlots.afternoon.length;
      const actualTotalCount = actualMorningCount + actualAfternoonCount;

      if (actualTotalCount !== expectedFoursomes) {
        const error = `Schedule assembly failed: expected ${expectedFoursomes} foursomes, got ${actualTotalCount}`;
        this.logger.logStep('Schedule generation failed - assembly validation error', { 
          error,
          expectedTotal: expectedFoursomes,
          actualTotal: actualTotalCount,
          expectedMorning: morningFoursomes.length,
          actualMorning: actualMorningCount,
          expectedAfternoon: afternoonFoursomes.length,
          actualAfternoon: actualAfternoonCount
        }, false, error);
        throw new Error(error);
      }

      if (actualMorningCount !== morningFoursomes.length) {
        const error = `Morning schedule mismatch: expected ${morningFoursomes.length}, got ${actualMorningCount}`;
        this.logger.logStep('Schedule generation failed - morning assembly error', { 
          error,
          expected: morningFoursomes.length,
          actual: actualMorningCount
        }, false, error);
        throw new Error(error);
      }

      if (actualAfternoonCount !== afternoonFoursomes.length) {
        const error = `Afternoon schedule mismatch: expected ${afternoonFoursomes.length}, got ${actualAfternoonCount}`;
        this.logger.logStep('Schedule generation failed - afternoon assembly error', { 
          error,
          expected: afternoonFoursomes.length,
          actual: actualAfternoonCount
        }, false, error);
        throw new Error(error);
      }

    } catch (assemblyError) {
      const error = `Schedule assembly failed: ${assemblyError instanceof Error ? assemblyError.message : 'Unknown error'}`;
      this.logger.logStep('Schedule generation failed - assembly exception', { 
        error,
        morningFoursomeCount: morningFoursomes.length,
        afternoonFoursomeCount: afternoonFoursomes.length,
        originalError: assemblyError 
      }, false, error);
      throw new Error(error);
    }

    this.logger.logStep('Schedule assembly completed', {
      finalSchedule: {
        weekId: schedule.weekId,
        morningFoursomes: schedule.timeSlots.morning.length,
        afternoonFoursomes: schedule.timeSlots.afternoon.length,
        totalPlayers: schedule.getTotalPlayerCount()
      }
    }, true);

    return schedule;
  }

  /**
   * Generate a schedule for a specific week, filtering by player availability
   */
  async generateScheduleForWeek(week: Week | WeekModel, allPlayers: Player[]): Promise<Schedule> {
    this.logger.clear();
    this.logger.logStep('Starting schedule generation for week', { 
      weekId: week.id, 
      weekNumber: week.weekNumber,
      seasonId: week.seasonId,
      totalPlayers: allPlayers.length 
    }, true);

    try {
      // Enhanced filtering with detailed logging
      const availablePlayers = this.filterAvailablePlayersWithLogging(allPlayers, week);
      this.logger.logStep('Player filtering completed', { 
        totalPlayers: allPlayers.length,
        availablePlayers: availablePlayers.length,
        excludedPlayers: allPlayers.length - availablePlayers.length
      }, true);

      // Enhanced generation with step-by-step logging
      const schedule = await this.generateScheduleWithLogging(week.id, availablePlayers, week.seasonId);
      
      const foursomeCount = this.getFoursomeCount(schedule);
      this.logger.logStep('Schedule generation completed', { 
        foursomeCount,
        morningFoursomes: schedule.timeSlots.morning.length,
        afternoonFoursomes: schedule.timeSlots.afternoon.length,
        totalScheduledPlayers: schedule.getTotalPlayerCount()
      }, true);

      this.logger.markComplete();
      
      // Store debug info for later retrieval
      this.lastDebugInfo = this.logger.getDebugInfo(week.id, week.seasonId, schedule);
      
      return schedule;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.logStep('Schedule generation failed', { error: errorMessage }, false, errorMessage);
      this.logger.markComplete();
      
      // Store debug info even for failed generations
      this.lastDebugInfo = this.logger.getDebugInfo(week.id, week.seasonId, null);
      
      throw error;
    }
  }

  /**
   * Filter players based on their availability for a specific week with detailed logging
   * Enhanced with explicit availability data validation and graceful handling of missing data
   */
  private filterAvailablePlayersWithLogging(allPlayers: Player[], week: Week | WeekModel): Player[] {
    this.logger.logStep('Starting player availability filtering', {
      totalPlayers: allPlayers.length,
      weekId: week.id,
      weekNumber: week.weekNumber
    }, true);

    // Validate availability data structure first
    const availabilityValidation = this.validateAvailabilityData(week, allPlayers);
    this.logger.logStep('Availability data validation completed', availabilityValidation, true);

    const availablePlayers: Player[] = [];
    const playersWithMissingData: Player[] = [];
    const unavailablePlayers: Player[] = [];
    
    for (const player of allPlayers) {
      const playerName = `${player.firstName} ${player.lastName}`;
      let isAvailable: boolean;
      let availabilityStatus: boolean | null | undefined;
      let hasAvailabilityData: boolean;
      
      if (week instanceof WeekModel) {
        hasAvailabilityData = week.hasAvailabilityData(player.id);
        availabilityStatus = week.getPlayerAvailabilityStatus(player.id);
        isAvailable = week.isPlayerAvailable(player.id);
      } else {
        // Handle plain Week interface - strict boolean checking
        hasAvailabilityData = player.id in (week.playerAvailability || {});
        availabilityStatus = week.playerAvailability?.[player.id];
        isAvailable = availabilityStatus === true;
      }
      
      if (isAvailable) {
        availablePlayers.push(player);
        this.logger.logFilteringDecision(
          player.id,
          playerName,
          availabilityStatus,
          'included',
          `Player explicitly marked as available (status: ${availabilityStatus})`
        );
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
          unavailablePlayers.push(player);
        } else if (!hasAvailabilityData || availabilityStatus === null || availabilityStatus === undefined) {
          reason = `Player has no availability data (status: ${availabilityStatus})`;
          playersWithMissingData.push(player);
        } else {
          reason = `Player availability status is not explicitly true (status: ${availabilityStatus})`;
          unavailablePlayers.push(player);
        }
        
        this.logger.logFilteringDecision(
          player.id,
          playerName,
          availabilityStatus,
          'excluded',
          reason
        );
        this.availabilityErrorReporter.logFilteringDecision(
          player.id,
          playerName,
          availabilityStatus,
          'excluded',
          reason
        );
      }
    }
    
    // Enhanced summary with detailed categorization
    const summary = {
      totalPlayers: allPlayers.length,
      availablePlayers: availablePlayers.length,
      unavailablePlayers: unavailablePlayers.length,
      playersWithMissingData: playersWithMissingData.length,
      excludedPlayers: allPlayers.length - availablePlayers.length,
      weekId: week.id,
      weekNumber: week.weekNumber,
      availabilityDataCoverage: availabilityValidation.coveragePercentage
    };
    
    this.logger.logStep('Availability filtering summary', summary, true);
    
    // Log detailed breakdown for debugging
    if (playersWithMissingData.length > 0) {
      this.logger.logStep('Players with missing availability data', {
        count: playersWithMissingData.length,
        players: playersWithMissingData.map(p => ({ id: p.id, name: `${p.firstName} ${p.lastName}` }))
      }, true);
    }
    
    if (unavailablePlayers.length > 0) {
      this.logger.logStep('Explicitly unavailable players', {
        count: unavailablePlayers.length,
        players: unavailablePlayers.map(p => ({ id: p.id, name: `${p.firstName} ${p.lastName}` }))
      }, true);
    }
    
    console.log(`[ScheduleGenerator] Availability filtering completed:`, summary);
    
    // Graceful handling: provide guidance when insufficient players are available
    if (availablePlayers.length < 4) {
      this.handleInsufficientPlayers(availablePlayers, playersWithMissingData, unavailablePlayers, week);
    }
    
    return availablePlayers;
  }

  /**
   * Validate availability data structure and completeness
   */
  private validateAvailabilityData(week: Week | WeekModel, allPlayers: Player[]): {
    isValid: boolean;
    totalPlayers: number;
    playersWithData: number;
    playersWithoutData: number;
    coveragePercentage: number;
    issues: string[];
  } {
    const issues: string[] = [];
    let playersWithData = 0;
    let playersWithoutData = 0;

    // Check if availability data structure exists
    if (week instanceof WeekModel) {
      if (!week.playerAvailability || typeof week.playerAvailability !== 'object') {
        issues.push('Week availability data structure is invalid or missing');
      }
    } else {
      if (!week.playerAvailability || typeof week.playerAvailability !== 'object') {
        issues.push('Week availability data structure is invalid or missing');
      }
    }

    // Check data completeness for each player
    for (const player of allPlayers) {
      let hasData: boolean;
      
      if (week instanceof WeekModel) {
        hasData = week.hasAvailabilityData(player.id);
      } else {
        hasData = player.id in (week.playerAvailability || {});
      }
      
      if (hasData) {
        playersWithData++;
      } else {
        playersWithoutData++;
      }
    }

    const coveragePercentage = allPlayers.length > 0 
      ? Math.round((playersWithData / allPlayers.length) * 100) 
      : 0;

    // Add coverage warnings
    if (coveragePercentage < 50) {
      issues.push(`Low availability data coverage: ${coveragePercentage}% of players have availability data`);
    } else if (coveragePercentage < 100) {
      issues.push(`Incomplete availability data: ${playersWithoutData} players missing availability data`);
    }

    return {
      isValid: issues.length === 0,
      totalPlayers: allPlayers.length,
      playersWithData,
      playersWithoutData,
      coveragePercentage,
      issues
    };
  }

  /**
   * Handle insufficient players scenario with detailed guidance
   */
  private handleInsufficientPlayers(
    availablePlayers: Player[],
    playersWithMissingData: Player[],
    unavailablePlayers: Player[],
    week: Week | WeekModel
  ): void {
    const totalPlayers = availablePlayers.length + playersWithMissingData.length + unavailablePlayers.length;
    
    const guidance = {
      scenario: 'insufficient_players',
      availableCount: availablePlayers.length,
      missingDataCount: playersWithMissingData.length,
      unavailableCount: unavailablePlayers.length,
      totalCount: totalPlayers,
      minimumRequired: 4,
      weekId: week.id,
      weekNumber: week.weekNumber,
      recommendations: [] as string[]
    };

    // Generate specific recommendations based on the situation
    if (playersWithMissingData.length > 0) {
      guidance.recommendations.push(
        `Set availability data for ${playersWithMissingData.length} players with missing data`
      );
    }

    if (unavailablePlayers.length > 0 && availablePlayers.length + playersWithMissingData.length >= 4) {
      guidance.recommendations.push(
        `Consider contacting ${unavailablePlayers.length} unavailable players to confirm their status`
      );
    }

    if (totalPlayers < 4) {
      guidance.recommendations.push(
        `Add more players to the season (current: ${totalPlayers}, minimum needed: 4)`
      );
    }

    if (availablePlayers.length > 0 && availablePlayers.length < 4) {
      guidance.recommendations.push(
        `Consider creating partial groups or combining with other weeks`
      );
    }

    this.logger.logStep('Insufficient players guidance', guidance, true);
    console.warn(`[ScheduleGenerator] Insufficient players for schedule generation:`, guidance);
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
   * Create foursomes from a list of players for a specific time slot with detailed logging
   * Enhanced with validation at each step and safeguards against silent failures
   */
  private async createFoursomesWithLogging(players: Player[], timeSlot: TimeSlot, seasonId?: string): Promise<Foursome[]> {
    this.logger.logStep(`Creating foursomes for ${timeSlot} time slot`, {
      playerCount: players.length,
      timeSlot,
      seasonId,
      optimizePairings: this.options.optimizePairings,
      hasPairingTracker: !!this.pairingHistoryTracker
    }, true);

    // Validation 1: Input validation
    if (!players || !Array.isArray(players)) {
      const error = 'Invalid players input: must be an array';
      this.logger.logStep('Foursome creation failed - invalid input', { error, timeSlot }, false, error);
      throw new Error(error);
    }

    if (!timeSlot || (timeSlot !== 'morning' && timeSlot !== 'afternoon')) {
      const error = `Invalid time slot: ${timeSlot}. Must be 'morning' or 'afternoon'`;
      this.logger.logStep('Foursome creation failed - invalid time slot', { error, timeSlot }, false, error);
      throw new Error(error);
    }

    // Validation 2: Player data integrity
    for (let i = 0; i < players.length; i++) {
      const player = players[i];
      if (!player || !player.id || !player.firstName || !player.lastName) {
        const error = `Invalid player data at index ${i}: missing required fields`;
        this.logger.logStep('Foursome creation failed - invalid player data', { 
          error, 
          playerIndex: i, 
          player: player ? { id: player.id, firstName: player.firstName, lastName: player.lastName } : null 
        }, false, error);
        throw new Error(error);
      }

      // Check for duplicate player IDs
      for (let j = i + 1; j < players.length; j++) {
        if (players[j] && players[j].id === player.id) {
          const error = `Duplicate player ID found: ${player.id} at indices ${i} and ${j}`;
          this.logger.logStep('Foursome creation failed - duplicate players', { error, playerId: player.id }, false, error);
          throw new Error(error);
        }
      }
    }

    if (players.length === 0) {
      this.logger.logStep(`No players for ${timeSlot} - returning empty foursomes`, { timeSlot }, true);
      return [];
    }

    const foursomes: Foursome[] = [];
    let position = 0;
    let remainingPlayers = [...players];

    // Validation 3: Track initial state for verification
    const initialPlayerCount = players.length;
    const initialPlayerIds = new Set(players.map(p => p.id));

    // If pairing optimization is enabled and we have a tracker
    if (this.options.optimizePairings && this.pairingHistoryTracker && seasonId) {
      this.logger.logStep('Using optimized pairing algorithm', {
        seasonId,
        remainingPlayers: remainingPlayers.length
      }, true);

      // Create optimized foursomes
      while (remainingPlayers.length >= 4) {
        this.logger.logStep('Finding optimal foursome', {
          remainingPlayers: remainingPlayers.length,
          position
        }, true);

        // Validation 4: Ensure pairing tracker returns valid results
        const optimalFoursome = await this.pairingHistoryTracker.findOptimalFoursome(seasonId, remainingPlayers);
        
        if (!optimalFoursome || !Array.isArray(optimalFoursome) || optimalFoursome.length === 0) {
          const error = 'Pairing tracker returned invalid foursome';
          this.logger.logStep('Foursome creation failed - invalid pairing result', { 
            error, 
            optimalFoursome, 
            remainingPlayersCount: remainingPlayers.length 
          }, false, error);
          throw new Error(error);
        }

        if (optimalFoursome.length > 4) {
          const error = `Pairing tracker returned too many players: ${optimalFoursome.length}`;
          this.logger.logStep('Foursome creation failed - oversized foursome', { 
            error, 
            foursomeSize: optimalFoursome.length 
          }, false, error);
          throw new Error(error);
        }

        // Validation 5: Ensure all players in foursome are from remaining players
        for (const player of optimalFoursome) {
          if (!remainingPlayers.some(rp => rp.id === player.id)) {
            const error = `Player ${player.id} in optimal foursome is not in remaining players`;
            this.logger.logStep('Foursome creation failed - invalid player selection', { 
              error, 
              playerId: player.id,
              playerName: `${player.firstName} ${player.lastName}`
            }, false, error);
            throw new Error(error);
          }
        }
        
        const foursome = new FoursomeModel({
          players: optimalFoursome,
          timeSlot,
          position: position++
        });

        // Validation 6: Verify foursome creation succeeded
        if (!foursome || !foursome.id || !foursome.players || foursome.players.length !== optimalFoursome.length) {
          const error = 'Failed to create valid foursome model';
          this.logger.logStep('Foursome creation failed - model creation error', { 
            error, 
            foursome: foursome ? { id: foursome.id, playerCount: foursome.players?.length } : null 
          }, false, error);
          throw new Error(error);
        }

        foursomes.push(foursome);

        this.logger.logStep('Optimal foursome created', {
          foursomeId: foursome.id,
          playerCount: optimalFoursome.length,
          playerNames: optimalFoursome.map(p => `${p.firstName} ${p.lastName}`),
          position: foursome.position
        }, true);

        // Validation 7: Ensure player removal works correctly
        const beforeRemovalCount = remainingPlayers.length;
        remainingPlayers = remainingPlayers.filter(p => !optimalFoursome.some(op => op.id === p.id));
        const afterRemovalCount = remainingPlayers.length;
        const expectedRemovalCount = beforeRemovalCount - optimalFoursome.length;

        if (afterRemovalCount !== expectedRemovalCount) {
          const error = `Player removal failed: expected ${expectedRemovalCount} remaining, got ${afterRemovalCount}`;
          this.logger.logStep('Foursome creation failed - player removal error', { 
            error, 
            beforeCount: beforeRemovalCount,
            afterCount: afterRemovalCount,
            expectedCount: expectedRemovalCount
          }, false, error);
          throw new Error(error);
        }
      }

      // Handle remaining players (less than 4)
      if (remainingPlayers.length > 0) {
        this.logger.logStep('Creating partial foursome with remaining players', {
          remainingPlayers: remainingPlayers.length,
          playerNames: remainingPlayers.map(p => `${p.firstName} ${p.lastName}`)
        }, true);

        const foursome = new FoursomeModel({
          players: remainingPlayers,
          timeSlot,
          position: position++
        });

        // Validation 8: Verify partial foursome creation
        if (!foursome || !foursome.id || !foursome.players || foursome.players.length !== remainingPlayers.length) {
          const error = 'Failed to create valid partial foursome model';
          this.logger.logStep('Foursome creation failed - partial foursome error', { 
            error, 
            expectedPlayerCount: remainingPlayers.length,
            actualPlayerCount: foursome?.players?.length 
          }, false, error);
          throw new Error(error);
        }

        foursomes.push(foursome);
      }
    } else {
      this.logger.logStep('Using standard foursome creation algorithm', {
        totalPlayers: players.length,
        completeGroups: Math.floor(players.length / 4),
        remainingPlayers: players.length % 4
      }, true);

      // Validation 9: Verify algorithm parameters
      const expectedCompleteGroups = Math.floor(players.length / 4);
      const expectedRemainingPlayers = players.length % 4;

      if (expectedCompleteGroups < 0 || expectedRemainingPlayers < 0 || expectedRemainingPlayers >= 4) {
        const error = `Invalid algorithm parameters: complete groups=${expectedCompleteGroups}, remaining=${expectedRemainingPlayers}`;
        this.logger.logStep('Foursome creation failed - algorithm parameter error', { 
          error, 
          totalPlayers: players.length,
          completeGroups: expectedCompleteGroups,
          remainingPlayers: expectedRemainingPlayers
        }, false, error);
        throw new Error(error);
      }

      // Original algorithm - create complete foursomes first (groups of 4)
      for (let i = 0; i < Math.floor(players.length / 4); i++) {
        const startIndex = i * 4;
        const endIndex = (i + 1) * 4;

        // Validation 10: Verify slice indices
        if (startIndex < 0 || endIndex > players.length || startIndex >= endIndex) {
          const error = `Invalid slice indices: start=${startIndex}, end=${endIndex}, total=${players.length}`;
          this.logger.logStep('Foursome creation failed - slice index error', { 
            error, 
            iteration: i,
            startIndex,
            endIndex,
            totalPlayers: players.length
          }, false, error);
          throw new Error(error);
        }

        const foursomeePlayers = players.slice(startIndex, endIndex);

        // Validation 11: Verify slice result
        if (!foursomeePlayers || foursomeePlayers.length !== 4) {
          const error = `Invalid foursome slice: expected 4 players, got ${foursomeePlayers?.length}`;
          this.logger.logStep('Foursome creation failed - slice result error', { 
            error, 
            iteration: i,
            sliceLength: foursomeePlayers?.length,
            startIndex,
            endIndex
          }, false, error);
          throw new Error(error);
        }

        const foursome = new FoursomeModel({
          players: foursomeePlayers,
          timeSlot,
          position: position++
        });

        // Validation 12: Verify foursome model creation
        if (!foursome || !foursome.id || !foursome.players || foursome.players.length !== 4) {
          const error = 'Failed to create valid complete foursome model';
          this.logger.logStep('Foursome creation failed - complete foursome model error', { 
            error, 
            iteration: i,
            foursome: foursome ? { id: foursome.id, playerCount: foursome.players?.length } : null 
          }, false, error);
          throw new Error(error);
        }

        foursomes.push(foursome);

        this.logger.logStep('Standard foursome created', {
          foursomeId: foursome.id,
          playerCount: foursomeePlayers.length,
          playerNames: foursomeePlayers.map(p => `${p.firstName} ${p.lastName}`),
          position: foursome.position
        }, true);
      }

      // Handle remaining players (less than 4)
      const remainingPlayersCount = players.length % 4;
      if (remainingPlayersCount > 0) {
        const startIndex = Math.floor(players.length / 4) * 4;

        // Validation 13: Verify remaining players slice
        if (startIndex < 0 || startIndex >= players.length) {
          const error = `Invalid remaining players start index: ${startIndex}`;
          this.logger.logStep('Foursome creation failed - remaining players index error', { 
            error, 
            startIndex,
            totalPlayers: players.length,
            remainingCount: remainingPlayersCount
          }, false, error);
          throw new Error(error);
        }

        const remainingPlayersSlice = players.slice(startIndex);

        // Validation 14: Verify remaining players slice result
        if (!remainingPlayersSlice || remainingPlayersSlice.length !== remainingPlayersCount) {
          const error = `Invalid remaining players slice: expected ${remainingPlayersCount}, got ${remainingPlayersSlice?.length}`;
          this.logger.logStep('Foursome creation failed - remaining players slice error', { 
            error, 
            expectedCount: remainingPlayersCount,
            actualCount: remainingPlayersSlice?.length,
            startIndex
          }, false, error);
          throw new Error(error);
        }

        const foursome = new FoursomeModel({
          players: remainingPlayersSlice,
          timeSlot,
          position: position++
        });

        // Validation 15: Verify remaining foursome model creation
        if (!foursome || !foursome.id || !foursome.players || foursome.players.length !== remainingPlayersCount) {
          const error = 'Failed to create valid remaining foursome model';
          this.logger.logStep('Foursome creation failed - remaining foursome model error', { 
            error, 
            expectedPlayerCount: remainingPlayersCount,
            actualPlayerCount: foursome?.players?.length 
          }, false, error);
          throw new Error(error);
        }

        foursomes.push(foursome);

        this.logger.logStep('Partial foursome created with remaining players', {
          foursomeId: foursome.id,
          playerCount: remainingPlayersSlice.length,
          playerNames: remainingPlayersSlice.map(p => `${p.firstName} ${p.lastName}`),
          position: foursome.position
        }, true);
      }
    }

    // Final Validation 16: Verify overall results
    const totalAssignedPlayers = foursomes.reduce((sum, f) => sum + f.players.length, 0);
    if (totalAssignedPlayers !== initialPlayerCount) {
      const error = `Player count mismatch: expected ${initialPlayerCount}, assigned ${totalAssignedPlayers}`;
      this.logger.logStep('Foursome creation failed - player count mismatch', { 
        error, 
        initialCount: initialPlayerCount,
        assignedCount: totalAssignedPlayers,
        foursomeCount: foursomes.length
      }, false, error);
      throw new Error(error);
    }

    // Validation 17: Verify no duplicate players across foursomes
    const assignedPlayerIds = new Set<string>();
    for (const foursome of foursomes) {
      for (const player of foursome.players) {
        if (assignedPlayerIds.has(player.id)) {
          const error = `Duplicate player assignment: ${player.id} appears in multiple foursomes`;
          this.logger.logStep('Foursome creation failed - duplicate player assignment', { 
            error, 
            playerId: player.id,
            playerName: `${player.firstName} ${player.lastName}`
          }, false, error);
          throw new Error(error);
        }
        assignedPlayerIds.add(player.id);
      }
    }

    // Validation 18: Verify all original players are assigned
    for (const originalId of initialPlayerIds) {
      if (!assignedPlayerIds.has(originalId)) {
        const error = `Player ${originalId} was not assigned to any foursome`;
        this.logger.logStep('Foursome creation failed - missing player assignment', { 
          error, 
          playerId: originalId
        }, false, error);
        throw new Error(error);
      }
    }

    // Validation 19: Verify foursomes array integrity
    if (!foursomes || !Array.isArray(foursomes)) {
      const error = 'Invalid foursomes result: not an array';
      this.logger.logStep('Foursome creation failed - invalid result type', { error }, false, error);
      throw new Error(error);
    }

    for (let i = 0; i < foursomes.length; i++) {
      const foursome = foursomes[i];
      if (!foursome || !foursome.id || !foursome.players || !Array.isArray(foursome.players)) {
        const error = `Invalid foursome at index ${i}: missing required properties`;
        this.logger.logStep('Foursome creation failed - invalid foursome structure', { 
          error, 
          foursomeIndex: i,
          foursome: foursome ? { id: foursome.id, hasPlayers: !!foursome.players } : null
        }, false, error);
        throw new Error(error);
      }

      if (foursome.timeSlot !== timeSlot) {
        const error = `Foursome ${i} has wrong time slot: expected ${timeSlot}, got ${foursome.timeSlot}`;
        this.logger.logStep('Foursome creation failed - wrong time slot', { 
          error, 
          foursomeIndex: i,
          expectedTimeSlot: timeSlot,
          actualTimeSlot: foursome.timeSlot
        }, false, error);
        throw new Error(error);
      }
    }

    this.logger.logStep(`Foursome creation completed for ${timeSlot}`, {
      timeSlot,
      totalFoursomes: foursomes.length,
      totalPlayersAssigned: foursomes.reduce((sum, f) => sum + f.players.length, 0)
    }, true);

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
   * Get debug information from the last generation attempt
   */
  getDebugInfo(): DebugInfo | null {
    return this.lastDebugInfo;
  }

  /**
   * Get the number of foursomes in a schedule
   */
  private getFoursomeCount(schedule: Schedule): number {
    return schedule.timeSlots.morning.length + schedule.timeSlots.afternoon.length;
  }

  /**
   * Generate a schedule for available players (backward compatibility)
   */
  async generateSchedule(weekId: string, availablePlayers: Player[], seasonId?: string): Promise<Schedule> {
    return this.generateScheduleWithLogging(weekId, availablePlayers, seasonId);
  }

  /**
   * Filter players based on their availability for a specific week (backward compatibility)
   */
  filterAvailablePlayers(allPlayers: Player[], week: Week | WeekModel): Player[] {
    return this.filterAvailablePlayersWithLogging(allPlayers, week);
  }

  /**
   * Create foursomes from a list of players for a specific time slot (backward compatibility)
   */
  private async createFoursomes(players: Player[], timeSlot: TimeSlot, seasonId?: string): Promise<Foursome[]> {
    return this.createFoursomesWithLogging(players, timeSlot, seasonId);
  }
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