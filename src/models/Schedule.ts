import { Foursome } from './Foursome';

export interface Schedule {
  id: string;
  weekId: string;
  timeSlots: {
    morning: Foursome[];
    afternoon: Foursome[];
  };
  createdAt: Date;
  lastModified: Date;
  getAllPlayers(): string[];
  getTotalPlayerCount(): number;
}

export class ScheduleModel implements Schedule {
  id: string;
  weekId: string;
  timeSlots: {
    morning: Foursome[];
    afternoon: Foursome[];
  };
  createdAt: Date;
  lastModified: Date;

  constructor(data: { weekId: string; id?: string; timeSlots?: { morning: Foursome[]; afternoon: Foursome[] }; createdAt?: Date; lastModified?: Date }) {
    this.id = data.id || this.generateId();
    this.weekId = data.weekId;
    this.timeSlots = data.timeSlots || { morning: [], afternoon: [] };
    this.createdAt = data.createdAt || new Date();
    this.lastModified = data.lastModified || new Date();

    this.validate();
  }

  private generateId(): string {
    return `schedule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  validate(): void {
    if (!this.weekId || this.weekId.trim().length === 0) {
      throw new Error('Week ID is required');
    }

    if (!this.id || this.id.trim().length === 0) {
      throw new Error('Schedule ID is required');
    }

    if (!this.timeSlots || typeof this.timeSlots !== 'object') {
      throw new Error('Time slots must be an object');
    }

    if (!Array.isArray(this.timeSlots.morning)) {
      throw new Error('Morning time slot must be an array');
    }

    if (!Array.isArray(this.timeSlots.afternoon)) {
      throw new Error('Afternoon time slot must be an array');
    }

    if (!(this.createdAt instanceof Date) || isNaN(this.createdAt.getTime())) {
      throw new Error('Valid created date is required');
    }

    if (!(this.lastModified instanceof Date) || isNaN(this.lastModified.getTime())) {
      throw new Error('Valid last modified date is required');
    }

    // Validate that all foursomes in morning slot have correct timeSlot
    this.timeSlots.morning.forEach((foursome, index) => {
      if (foursome.timeSlot !== 'morning') {
        throw new Error(`Foursome at morning position ${index} has incorrect timeSlot: ${foursome.timeSlot}`);
      }
    });

    // Validate that all foursomes in afternoon slot have correct timeSlot
    this.timeSlots.afternoon.forEach((foursome, index) => {
      if (foursome.timeSlot !== 'afternoon') {
        throw new Error(`Foursome at afternoon position ${index} has incorrect timeSlot: ${foursome.timeSlot}`);
      }
    });
  }

  addFoursome(foursome: Foursome): void {
    if (foursome.timeSlot === 'morning') {
      this.timeSlots.morning.push(foursome);
    } else if (foursome.timeSlot === 'afternoon') {
      this.timeSlots.afternoon.push(foursome);
    } else {
      throw new Error(`Invalid time slot: ${foursome.timeSlot}`);
    }
    this.updateLastModified();
  }

  removeFoursome(foursomeId: string): boolean {
    let removed = false;
    
    // Try to remove from morning
    const morningIndex = this.timeSlots.morning.findIndex(f => f.id === foursomeId);
    if (morningIndex > -1) {
      this.timeSlots.morning.splice(morningIndex, 1);
      removed = true;
    }

    // Try to remove from afternoon
    const afternoonIndex = this.timeSlots.afternoon.findIndex(f => f.id === foursomeId);
    if (afternoonIndex > -1) {
      this.timeSlots.afternoon.splice(afternoonIndex, 1);
      removed = true;
    }

    if (removed) {
      this.updateLastModified();
    }

    return removed;
  }

  getAllPlayers(): string[] {
    const playerIds = new Set<string>();
    
    [...this.timeSlots.morning, ...this.timeSlots.afternoon].forEach(foursome => {
      foursome.players.forEach(player => {
        playerIds.add(player.id);
      });
    });

    return Array.from(playerIds);
  }

  getTotalPlayerCount(): number {
    return this.getAllPlayers().length;
  }

  private updateLastModified(): void {
    this.lastModified = new Date();
  }

  toJSON(): Omit<Schedule, 'getAllPlayers' | 'getTotalPlayerCount'> {
    return {
      id: this.id,
      weekId: this.weekId,
      timeSlots: {
        morning: [...this.timeSlots.morning],
        afternoon: [...this.timeSlots.afternoon]
      },
      createdAt: this.createdAt,
      lastModified: this.lastModified
    };
  }
}