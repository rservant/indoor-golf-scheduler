export interface Season {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  createdAt: Date;
  playerIds: string[];
  weekIds: string[];
}

export interface CreateSeasonData {
  name: string;
  startDate: Date;
  endDate: Date;
}

export class SeasonModel implements Season {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  createdAt: Date;
  playerIds: string[];
  weekIds: string[];

  constructor(data: CreateSeasonData & { id?: string; isActive?: boolean; createdAt?: Date; playerIds?: string[]; weekIds?: string[] }) {
    this.id = data.id || this.generateId();
    this.name = data.name;
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.isActive = data.isActive ?? false;
    this.createdAt = data.createdAt || new Date();
    this.playerIds = data.playerIds || [];
    this.weekIds = data.weekIds || [];

    this.validate();
  }

  private generateId(): string {
    return `season_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  validate(): void {
    if (!this.name || this.name.trim().length === 0) {
      throw new Error('Season name is required and cannot be empty');
    }

    if (!(this.startDate instanceof Date) || isNaN(this.startDate.getTime())) {
      throw new Error('Valid start date is required');
    }

    if (!(this.endDate instanceof Date) || isNaN(this.endDate.getTime())) {
      throw new Error('Valid end date is required');
    }

    if (this.startDate >= this.endDate) {
      throw new Error('Start date must be before end date');
    }

    if (!this.id || this.id.trim().length === 0) {
      throw new Error('Season ID is required');
    }

    if (!Array.isArray(this.playerIds)) {
      throw new Error('Player IDs must be an array');
    }

    if (!Array.isArray(this.weekIds)) {
      throw new Error('Week IDs must be an array');
    }
  }

  addPlayer(playerId: string): void {
    if (!playerId || playerId.trim().length === 0) {
      throw new Error('Player ID is required');
    }
    if (!this.playerIds.includes(playerId)) {
      this.playerIds.push(playerId);
    }
  }

  removePlayer(playerId: string): void {
    const index = this.playerIds.indexOf(playerId);
    if (index > -1) {
      this.playerIds.splice(index, 1);
    }
  }

  addWeek(weekId: string): void {
    if (!weekId || weekId.trim().length === 0) {
      throw new Error('Week ID is required');
    }
    if (!this.weekIds.includes(weekId)) {
      this.weekIds.push(weekId);
    }
  }

  toJSON(): Season {
    return {
      id: this.id,
      name: this.name,
      startDate: this.startDate,
      endDate: this.endDate,
      isActive: this.isActive,
      createdAt: this.createdAt,
      playerIds: [...this.playerIds],
      weekIds: [...this.weekIds]
    };
  }
}