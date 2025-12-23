export interface PairingHistory {
  seasonId: string;
  pairings: Record<string, number>; // "playerId1-playerId2" -> count
  lastUpdated: Date;
}

export class PairingHistoryModel implements PairingHistory {
  seasonId: string;
  pairings: Record<string, number>;
  lastUpdated: Date;

  constructor(data: { seasonId: string; pairings?: Record<string, number>; lastUpdated?: Date }) {
    this.seasonId = data.seasonId;
    this.pairings = data.pairings || {};
    this.lastUpdated = data.lastUpdated || new Date();

    this.validate();
  }

  validate(): void {
    if (!this.seasonId || this.seasonId.trim().length === 0) {
      throw new Error('Season ID is required');
    }

    if (typeof this.pairings !== 'object' || this.pairings === null) {
      throw new Error('Pairings must be an object');
    }

    if (!(this.lastUpdated instanceof Date) || isNaN(this.lastUpdated.getTime())) {
      throw new Error('Valid last updated date is required');
    }

    // Validate pairing keys and values
    for (const [pairingKey, count] of Object.entries(this.pairings)) {
      if (!pairingKey.includes('-')) {
        throw new Error(`Invalid pairing key format: ${pairingKey}. Expected format: "playerId1-playerId2"`);
      }

      const [playerId1, playerId2] = pairingKey.split('-');
      if (!playerId1 || !playerId2 || playerId1.trim().length === 0 || playerId2.trim().length === 0) {
        throw new Error(`Invalid player IDs in pairing key: ${pairingKey}`);
      }

      if (!Number.isInteger(count) || count < 0) {
        throw new Error(`Pairing count must be a non-negative integer, got: ${count} for ${pairingKey}`);
      }
    }
  }

  private createPairingKey(playerId1: string, playerId2: string): string {
    // Always put the lexicographically smaller ID first to ensure consistency
    return playerId1 < playerId2 ? `${playerId1}-${playerId2}` : `${playerId2}-${playerId1}`;
  }

  addPairing(playerId1: string, playerId2: string): void {
    if (!playerId1 || playerId1.trim().length === 0) {
      throw new Error('First player ID is required');
    }
    if (!playerId2 || playerId2.trim().length === 0) {
      throw new Error('Second player ID is required');
    }
    if (playerId1 === playerId2) {
      throw new Error('Cannot pair a player with themselves');
    }

    const key = this.createPairingKey(playerId1, playerId2);
    this.pairings[key] = (this.pairings[key] || 0) + 1;
    this.lastUpdated = new Date();
  }

  getPairingCount(playerId1: string, playerId2: string): number {
    if (playerId1 === playerId2) {
      return 0; // A player cannot be paired with themselves
    }

    const key = this.createPairingKey(playerId1, playerId2);
    return this.pairings[key] || 0;
  }

  getAllPairingsForPlayer(playerId: string): Array<{ partnerId: string; count: number }> {
    const result: Array<{ partnerId: string; count: number }> = [];

    for (const [pairingKey, count] of Object.entries(this.pairings)) {
      const [id1, id2] = pairingKey.split('-');
      if (id1 === playerId) {
        result.push({ partnerId: id2, count });
      } else if (id2 === playerId) {
        result.push({ partnerId: id1, count });
      }
    }

    return result.sort((a, b) => b.count - a.count); // Sort by count descending
  }

  getMinimumPairingCount(): number {
    if (Object.keys(this.pairings).length === 0) {
      return 0;
    }
    return Math.min(...Object.values(this.pairings));
  }

  getMaximumPairingCount(): number {
    if (Object.keys(this.pairings).length === 0) {
      return 0;
    }
    return Math.max(...Object.values(this.pairings));
  }

  reset(): void {
    this.pairings = {};
    this.lastUpdated = new Date();
  }

  toJSON(): PairingHistory {
    return {
      seasonId: this.seasonId,
      pairings: { ...this.pairings },
      lastUpdated: this.lastUpdated
    };
  }
}