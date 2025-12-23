import { PairingHistoryRepository } from '../repositories/PairingHistoryRepository';
import { Player } from '../models/Player';
import { Foursome } from '../models/Foursome';
import { Schedule } from '../models/Schedule';

export interface PairingOptimizationResult {
  pairingCounts: Map<string, number>;
  minPairings: number;
  maxPairings: number;
  averagePairings: number;
}

export class PairingHistoryTracker {
  constructor(private pairingHistoryRepository: PairingHistoryRepository) {}

  /**
   * Track pairings from a completed schedule
   */
  async trackSchedulePairings(seasonId: string, schedule: Schedule): Promise<void> {
    const allFoursomes = [...schedule.timeSlots.morning, ...schedule.timeSlots.afternoon];
    
    for (const foursome of allFoursomes) {
      await this.trackFoursomePairings(seasonId, foursome);
    }
  }

  /**
   * Track all pairings within a foursome
   */
  async trackFoursomePairings(seasonId: string, foursome: Foursome): Promise<void> {
    const players = foursome.players;
    
    // Track all unique pairs within the foursome
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        await this.pairingHistoryRepository.addPairing(
          seasonId,
          players[i].id,
          players[j].id
        );
      }
    }
  }

  /**
   * Get pairing count between two players
   */
  async getPairingCount(seasonId: string, playerId1: string, playerId2: string): Promise<number> {
    return await this.pairingHistoryRepository.getPairingCount(seasonId, playerId1, playerId2);
  }

  /**
   * Get all pairing counts for a player
   */
  async getAllPairingsForPlayer(seasonId: string, playerId: string): Promise<Array<{ partnerId: string; count: number }>> {
    return await this.pairingHistoryRepository.getAllPairingsForPlayer(seasonId, playerId);
  }

  /**
   * Calculate pairing optimization metrics for a set of players
   */
  async calculatePairingMetrics(seasonId: string, players: Player[]): Promise<PairingOptimizationResult> {
    const pairingCounts = new Map<string, number>();
    
    // Get all pairing counts between players
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const count = await this.getPairingCount(seasonId, players[i].id, players[j].id);
        const key = this.createPairingKey(players[i].id, players[j].id);
        pairingCounts.set(key, count);
      }
    }

    const counts = Array.from(pairingCounts.values());
    const minPairings = counts.length > 0 ? Math.min(...counts) : 0;
    const maxPairings = counts.length > 0 ? Math.max(...counts) : 0;
    const averagePairings = counts.length > 0 ? counts.reduce((sum, count) => sum + count, 0) / counts.length : 0;

    return {
      pairingCounts,
      minPairings,
      maxPairings,
      averagePairings
    };
  }

  /**
   * Score a potential foursome based on pairing history (lower is better)
   */
  async scoreFoursome(seasonId: string, players: Player[]): Promise<number> {
    let totalScore = 0;
    
    // Calculate score based on existing pairings
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const count = await this.getPairingCount(seasonId, players[i].id, players[j].id);
        totalScore += count;
      }
    }
    
    return totalScore;
  }

  /**
   * Find the best foursome combination from available players
   */
  async findOptimalFoursome(seasonId: string, availablePlayers: Player[]): Promise<Player[]> {
    if (availablePlayers.length <= 4) {
      return availablePlayers;
    }

    let bestFoursome: Player[] = [];
    let bestScore = Infinity;

    // Try all combinations of 4 players
    const combinations = this.generateCombinations(availablePlayers, 4);
    
    for (const combination of combinations) {
      const score = await this.scoreFoursome(seasonId, combination);
      if (score < bestScore) {
        bestScore = score;
        bestFoursome = combination;
      }
    }

    return bestFoursome;
  }

  /**
   * Generate all combinations of k elements from an array
   */
  generateCombinations<T>(array: T[], k: number): T[][] {
    if (k === 0) return [[]];
    if (k > array.length) return [];
    
    const result: T[][] = [];
    
    for (let i = 0; i <= array.length - k; i++) {
      const head = array[i];
      const tailCombinations = this.generateCombinations(array.slice(i + 1), k - 1);
      
      for (const tail of tailCombinations) {
        result.push([head, ...tail]);
      }
    }
    
    return result;
  }

  /**
   * Create a consistent pairing key for two player IDs
   */
  private createPairingKey(playerId1: string, playerId2: string): string {
    return playerId1 < playerId2 ? `${playerId1}-${playerId2}` : `${playerId2}-${playerId1}`;
  }

  /**
   * Reset pairing history for a season
   */
  async resetPairingHistory(seasonId: string): Promise<void> {
    await this.pairingHistoryRepository.resetPairings(seasonId);
  }
}