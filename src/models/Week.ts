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

  setPlayerAvailability(playerId: string, available: boolean): void {
    if (!playerId || playerId.trim().length === 0) {
      throw new Error('Player ID is required');
    }
    if (typeof available !== 'boolean') {
      throw new Error('Availability must be a boolean value');
    }
    this.playerAvailability[playerId] = available;
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

  isPlayerAvailable(playerId: string): boolean {
    return this.playerAvailability[playerId] === true;
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