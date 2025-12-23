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
}

export interface PlayerInfo {
  firstName: string;
  lastName: string;
  handedness: Handedness;
  timePreference: TimePreference;
}

export class PlayerModel implements Player {
  id: string;
  firstName: string;
  lastName: string;
  handedness: Handedness;
  timePreference: TimePreference;
  seasonId: string;
  createdAt: Date;

  constructor(data: PlayerInfo & { seasonId: string; id?: string; createdAt?: Date }) {
    this.id = data.id || this.generateId();
    this.firstName = data.firstName;
    this.lastName = data.lastName;
    this.handedness = data.handedness;
    this.timePreference = data.timePreference;
    this.seasonId = data.seasonId;
    this.createdAt = data.createdAt || new Date();

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
  }

  toJSON(): Player {
    return {
      id: this.id,
      firstName: this.firstName,
      lastName: this.lastName,
      handedness: this.handedness,
      timePreference: this.timePreference,
      seasonId: this.seasonId,
      createdAt: this.createdAt
    };
  }
}