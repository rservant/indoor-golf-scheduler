import { Player } from './Player';

export type TimeSlot = 'morning' | 'afternoon';

export interface Foursome {
  id: string;
  players: Player[];
  timeSlot: TimeSlot;
  position: number; // ordering within time slot
}

export class FoursomeModel implements Foursome {
  id: string;
  players: Player[];
  timeSlot: TimeSlot;
  position: number;

  constructor(data: { players: Player[]; timeSlot: TimeSlot; position: number; id?: string }) {
    this.id = data.id || this.generateId();
    this.players = data.players || [];
    this.timeSlot = data.timeSlot;
    this.position = data.position;

    this.validate();
  }

  private generateId(): string {
    return `foursome_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  validate(): void {
    if (!this.id || this.id.trim().length === 0) {
      throw new Error('Foursome ID is required');
    }

    if (!Array.isArray(this.players)) {
      throw new Error('Players must be an array');
    }

    if (this.players.length > 4) {
      throw new Error('Foursome cannot have more than 4 players');
    }

    if (this.players.length === 0) {
      throw new Error('Foursome must have at least 1 player');
    }

    if (!['morning', 'afternoon'].includes(this.timeSlot)) {
      throw new Error('Time slot must be either "morning" or "afternoon"');
    }

    if (!Number.isInteger(this.position) || this.position < 0) {
      throw new Error('Position must be a non-negative integer');
    }

    // Check for duplicate players
    const playerIds = this.players.map(p => p.id);
    const uniquePlayerIds = new Set(playerIds);
    if (playerIds.length !== uniquePlayerIds.size) {
      throw new Error('Foursome cannot contain duplicate players');
    }

    // Validate that all players have the same seasonId
    if (this.players.length > 1) {
      const firstSeasonId = this.players[0].seasonId;
      const allSameSeason = this.players.every(p => p.seasonId === firstSeasonId);
      if (!allSameSeason) {
        throw new Error('All players in a foursome must be from the same season');
      }
    }
  }

  addPlayer(player: Player): void {
    if (this.players.length >= 4) {
      throw new Error('Cannot add player: foursome is already full (4 players)');
    }

    if (this.players.some(p => p.id === player.id)) {
      throw new Error('Player is already in this foursome');
    }

    // Check season consistency
    if (this.players.length > 0 && this.players[0].seasonId !== player.seasonId) {
      throw new Error('Player must be from the same season as other players in the foursome');
    }

    this.players.push(player);
  }

  removePlayer(playerId: string): boolean {
    const index = this.players.findIndex(p => p.id === playerId);
    if (index > -1) {
      this.players.splice(index, 1);
      return true;
    }
    return false;
  }

  isFull(): boolean {
    return this.players.length === 4;
  }

  isEmpty(): boolean {
    return this.players.length === 0;
  }

  getPlayerCount(): number {
    return this.players.length;
  }

  hasPlayer(playerId: string): boolean {
    return this.players.some(p => p.id === playerId);
  }

  getHandednessDistribution(): { left: number; right: number } {
    return this.players.reduce(
      (acc, player) => {
        acc[player.handedness]++;
        return acc;
      },
      { left: 0, right: 0 }
    );
  }

  toJSON(): Foursome {
    return {
      id: this.id,
      players: [...this.players],
      timeSlot: this.timeSlot,
      position: this.position
    };
  }
}