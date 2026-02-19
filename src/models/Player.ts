export type Handedness = 'left' | 'right';
export type TimePreference = 'AM' | 'PM' | 'Either';

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  handedness: Handedness;
  timePreference: TimePreference;
  seasonId: string;
  createdAt: Date;
  skillLevel?: number;
  email?: string;
  phone?: string;
}

export interface PlayerInfo {
  firstName: string;
  lastName: string;
  handedness: Handedness;
  timePreference: TimePreference;
  skillLevel?: number;
  email?: string;
  phone?: string;
}

export class PlayerModel implements Player {
  id: string;
  firstName: string;
  lastName: string;
  handedness: Handedness;
  timePreference: TimePreference;
  seasonId: string;
  createdAt: Date;
  skillLevel: number;
  email?: string;
  phone?: string;

  constructor(data: PlayerInfo & { seasonId: string; id?: string; createdAt?: Date; skillLevel?: number; email?: string; phone?: string }) {
    this.id = data.id || this.generateId();
    this.firstName = data.firstName;
    this.lastName = data.lastName;
    this.handedness = data.handedness;
    this.timePreference = data.timePreference;
    this.seasonId = data.seasonId;
    this.createdAt = data.createdAt || new Date();
    this.skillLevel = data.skillLevel ?? 5;
    if (data.email) this.email = data.email;
    if (data.phone) this.phone = data.phone;

    this.validate();
  }

  private generateId(): string {
    return `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  validate(): void {
    if (!this.firstName || this.firstName.trim().length === 0) {
      throw new Error('First name is required and cannot be empty');
    }

    if (!this.lastName || this.lastName.trim().length === 0) {
      throw new Error('Last name is required and cannot be empty');
    }

    if (!this.handedness || !['left', 'right'].includes(this.handedness)) {
      throw new Error('Handedness must be either "left" or "right"');
    }

    if (!this.timePreference || !['AM', 'PM', 'Either'].includes(this.timePreference)) {
      throw new Error('Time preference must be "AM", "PM", or "Either"');
    }

    if (!this.seasonId || this.seasonId.trim().length === 0) {
      throw new Error('Season ID is required');
    }

    if (!this.id || this.id.trim().length === 0) {
      throw new Error('Player ID is required');
    }

    if (typeof this.skillLevel !== 'number' || this.skillLevel < 1 || this.skillLevel > 10) {
      throw new Error('Skill level must be a number between 1 and 10');
    }

    if (this.email !== undefined && this.email !== null && this.email !== '') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(this.email)) {
        throw new Error('Email must be a valid email address');
      }
    }
  }

  getFullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }

  updateInfo(updates: Partial<PlayerInfo>): void {
    // Create a temporary copy to validate
    const tempData = {
      firstName: updates.firstName !== undefined ? updates.firstName : this.firstName,
      lastName: updates.lastName !== undefined ? updates.lastName : this.lastName,
      handedness: updates.handedness !== undefined ? updates.handedness : this.handedness,
      timePreference: updates.timePreference !== undefined ? updates.timePreference : this.timePreference
    };

    // Validate the temporary data
    if (!tempData.firstName || tempData.firstName.trim().length === 0) {
      throw new Error('First name is required and cannot be empty');
    }

    if (!tempData.lastName || tempData.lastName.trim().length === 0) {
      throw new Error('Last name is required and cannot be empty');
    }

    if (!tempData.handedness || !['left', 'right'].includes(tempData.handedness)) {
      throw new Error('Handedness must be either "left" or "right"');
    }

    if (!tempData.timePreference || !['AM', 'PM', 'Either'].includes(tempData.timePreference)) {
      throw new Error('Time preference must be "AM", "PM", or "Either"');
    }

    if (updates.skillLevel !== undefined) {
      if (typeof updates.skillLevel !== 'number' || updates.skillLevel < 1 || updates.skillLevel > 10) {
        throw new Error('Skill level must be a number between 1 and 10');
      }
    }

    if (updates.email !== undefined && updates.email !== null && updates.email !== '') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(updates.email)) {
        throw new Error('Email must be a valid email address');
      }
    }

    // If validation passes, apply the updates
    if (updates.firstName !== undefined) {
      this.firstName = updates.firstName;
    }
    if (updates.lastName !== undefined) {
      this.lastName = updates.lastName;
    }
    if (updates.handedness !== undefined) {
      this.handedness = updates.handedness;
    }
    if (updates.timePreference !== undefined) {
      this.timePreference = updates.timePreference;
    }
    if (updates.skillLevel !== undefined) {
      this.skillLevel = updates.skillLevel;
    }
    if (updates.email !== undefined) {
      this.email = updates.email;
    }
    if (updates.phone !== undefined) {
      this.phone = updates.phone;
    }
  }

  toJSON(): Player {
    const result: Player = {
      id: this.id,
      firstName: this.firstName,
      lastName: this.lastName,
      handedness: this.handedness,
      timePreference: this.timePreference,
      seasonId: this.seasonId,
      createdAt: this.createdAt,
      skillLevel: this.skillLevel
    };
    if (this.email) result.email = this.email;
    if (this.phone) result.phone = this.phone;
    return result;
  }
}