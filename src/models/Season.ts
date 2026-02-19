export interface TimeSlotConfig {
  name: string;   // internal key: 'morning', 'afternoon', or custom
  label: string;   // display label: '10:30 AM', '1:00 PM', etc.
  time: string;    // 24h time: '10:30', '13:00', etc.
}

export const DEFAULT_TIME_SLOTS: TimeSlotConfig[] = [
  { name: 'morning', label: '10:30 AM', time: '10:30' },
  { name: 'afternoon', label: '1:00 PM', time: '13:00' }
];

export interface Season {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  createdAt: Date;
  playerIds: string[];
  weekIds: string[];
  timeSlotConfigs?: TimeSlotConfig[];
}

export interface CreateSeasonData {
  name: string;
  startDate: Date;
  endDate: Date;
  timeSlotConfigs?: TimeSlotConfig[];
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
  timeSlotConfigs: TimeSlotConfig[];

  constructor(data: CreateSeasonData & { id?: string; isActive?: boolean; createdAt?: Date; playerIds?: string[]; weekIds?: string[]; timeSlotConfigs?: TimeSlotConfig[] }) {
    this.id = data.id || this.generateId();
    this.name = data.name;
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.isActive = data.isActive ?? false;
    this.createdAt = data.createdAt || new Date();
    this.playerIds = data.playerIds || [];
    this.weekIds = data.weekIds || [];
    this.timeSlotConfigs = data.timeSlotConfigs || [...DEFAULT_TIME_SLOTS];

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

    if (!Array.isArray(this.timeSlotConfigs) || this.timeSlotConfigs.length === 0) {
      throw new Error('At least one time slot configuration is required');
    }

    // Validate each time slot config
    const slotNames = new Set<string>();
    for (const slot of this.timeSlotConfigs) {
      if (!slot.name || slot.name.trim().length === 0) {
        throw new Error('Time slot name is required');
      }
      if (!slot.label || slot.label.trim().length === 0) {
        throw new Error('Time slot label is required');
      }
      if (!slot.time || slot.time.trim().length === 0) {
        throw new Error('Time slot time is required');
      }
      if (slotNames.has(slot.name)) {
        throw new Error(`Duplicate time slot name: ${slot.name}`);
      }
      slotNames.add(slot.name);
    }
  }

  /**
   * Get the label for a time slot by its internal name
   */
  getTimeSlotLabel(slotName: string): string {
    const config = this.timeSlotConfigs.find(s => s.name === slotName);
    return config ? config.label : slotName;
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
      weekIds: [...this.weekIds],
      timeSlotConfigs: this.timeSlotConfigs.map(s => ({ ...s }))
    };
  }
}