export interface Week {
  id: string;
  seasonId: string;
  weekNumber: number;
  date: Date;
  playerAvailability: Record<string, boolean>; // playerId -> available
  scheduleId?: string;
}

export class WeekModel implements Week {
  id: string;
  seasonId: string;
  weekNumber: number;
  date: Date;
  playerAvailability: Record<string, boolean>;
  scheduleId?: string;

  constructor(data: { seasonId: string; weekNumber: number; date: Date; id?: string; playerAvailability?: Record<string, boolean>; scheduleId?: string }) {
    this.id = data.id || this.generateId();
    this.seasonId = data.seasonId;
    this.weekNumber = data.weekNumber;
    this.date = data.date;
    this.playerAvailability = data.playerAvailability || {};
    if (data.scheduleId) {
      this.scheduleId = data.scheduleId;
    }

    this.validate();
  }

  private generateId(): string {
    return `week_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  validate(): void {
    if (!this.seasonId || this.seasonId.trim().length === 0) {
      throw new Error('Season ID is required');
    }

    if (!Number.isInteger(this.weekNumber) || this.weekNumber < 1) {
      throw new Error('Week number must be a positive integer');
    }

    if (!(this.date instanceof Date) || isNaN(this.date.getTime())) {
      throw new Error('Valid date is required');
    }

    if (!this.id || this.id.trim().length === 0) {
      throw new Error('Week ID is required');
    }

    if (typeof this.playerAvailability !== 'object' || this.playerAvailability === null) {
      throw new Error('Player availability must be an object');
    }

    // Validate that all availability values are boolean
    for (const [playerId, available] of Object.entries(this.playerAvailability)) {
      if (typeof available !== 'boolean') {
        throw new Error(`Player availability for ${playerId} must be a boolean value`);
      }
    }
  }

  /**
   * Set player availability with enhanced validation and defensive programming
   */
  setPlayerAvailability(playerId: string, available: boolean): void {
    if (!playerId || playerId.trim().length === 0) {
      throw new Error('Player ID is required and cannot be empty');
    }
    if (typeof available !== 'boolean') {
      throw new Error(`Availability must be a boolean value, received: ${typeof available}`);
    }
    
    // Defensive programming: ensure we're working with a clean player ID
    const cleanPlayerId = playerId.trim();
    this.playerAvailability[cleanPlayerId] = available;
  }

  /**
   * Remove availability data for a player (defensive removal)
   */
  removePlayerAvailability(playerId: string): void {
    if (!playerId || playerId.trim().length === 0) {
      throw new Error('Player ID is required for availability removal');
    }
    
    const cleanPlayerId = playerId.trim();
    delete this.playerAvailability[cleanPlayerId];
  }

  /**
   * Bulk set availability with validation
   */
  setMultiplePlayerAvailability(availabilityData: Record<string, boolean>): void {
    if (typeof availabilityData !== 'object' || availabilityData === null) {
      throw new Error('Availability data must be an object');
    }
    
    // Validate all entries before applying any changes
    for (const [playerId, available] of Object.entries(availabilityData)) {
      if (!playerId || playerId.trim().length === 0) {
        throw new Error('All player IDs must be non-empty strings');
      }
      if (typeof available !== 'boolean') {
        throw new Error(`All availability values must be boolean, found ${typeof available} for player ${playerId}`);
      }
    }
    
    // Apply changes only after validation passes
    for (const [playerId, available] of Object.entries(availabilityData)) {
      this.playerAvailability[playerId.trim()] = available;
    }
  }

  getAvailablePlayers(): string[] {
    return Object.entries(this.playerAvailability)
      .filter(([_, available]) => available)
      .map(([playerId, _]) => playerId);
  }

  getUnavailablePlayers(): string[] {
    return Object.entries(this.playerAvailability)
      .filter(([_, available]) => !available)
      .map(([playerId, _]) => playerId);
  }

  /**
   * Check if a player is available for this week with strict validation
   * Only returns true if player has explicit availability === true
   */
  isPlayerAvailable(playerId: string): boolean {
    if (!playerId || playerId.trim().length === 0) {
      throw new Error('Player ID is required for availability check');
    }
    
    // Strict validation: only explicit true values are considered available
    return this.playerAvailability[playerId] === true;
  }

  /**
   * Check if explicit availability data exists for a player
   * Returns true if player has any availability data (true or false)
   * Returns false if no availability data exists for the player
   */
  hasAvailabilityData(playerId: string): boolean {
    if (!playerId || playerId.trim().length === 0) {
      throw new Error('Player ID is required for availability data check');
    }
    
    return playerId in this.playerAvailability;
  }

  /**
   * Get availability status with defensive programming
   * Returns explicit availability or undefined if no data exists
   */
  getPlayerAvailabilityStatus(playerId: string): boolean | undefined {
    if (!playerId || playerId.trim().length === 0) {
      throw new Error('Player ID is required for availability status check');
    }
    
    return this.playerAvailability[playerId];
  }

  /**
   * Check if all required players have explicit availability data
   */
  hasCompleteAvailabilityData(requiredPlayerIds: string[]): boolean {
    if (!Array.isArray(requiredPlayerIds)) {
      throw new Error('Required player IDs must be an array');
    }
    
    return requiredPlayerIds.every(playerId => this.hasAvailabilityData(playerId));
  }

  /**
   * Get players with missing availability data
   */
  getPlayersWithMissingAvailability(requiredPlayerIds: string[]): string[] {
    if (!Array.isArray(requiredPlayerIds)) {
      throw new Error('Required player IDs must be an array');
    }
    
    return requiredPlayerIds.filter(playerId => !this.hasAvailabilityData(playerId));
  }

  setSchedule(scheduleId: string): void {
    if (!scheduleId || scheduleId.trim().length === 0) {
      throw new Error('Schedule ID is required');
    }
    this.scheduleId = scheduleId;
  }

  toJSON(): Week {
    const result: Week = {
      id: this.id,
      seasonId: this.seasonId,
      weekNumber: this.weekNumber,
      date: this.date,
      playerAvailability: { ...this.playerAvailability }
    };
    
    if (this.scheduleId) {
      result.scheduleId = this.scheduleId;
    }
    
    return result;
  }
}