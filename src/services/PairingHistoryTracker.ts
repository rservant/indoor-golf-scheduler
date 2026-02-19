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
  constructor(private pairingHistoryRepository: PairingHistoryRepository) { }

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
   * Batch-load a pairing matrix for all player pairs in one call.
   * Returns Map<"id1-id2", count> for efficient lookups.
   */
  async loadPairingMatrix(seasonId: string, playerIds: string[]): Promise<Map<string, number>> {
    const matrix = new Map<string, number>();

    // Load all pairings for each player in a single pass per player
    for (const playerId of playerIds) {
      const pairings = await this.pairingHistoryRepository.getAllPairingsForPlayer(seasonId, playerId);
      for (const { partnerId, count } of pairings) {
        const key = this.createPairingKey(playerId, partnerId);
        if (!matrix.has(key)) {
          matrix.set(key, count);
        }
      }
    }

    return matrix;
  }

  /**
   * Get pairing count from a pre-loaded matrix (fast, in-memory lookup)
   */
  getPairingCountFromMatrix(matrix: Map<string, number>, playerId1: string, playerId2: string): number {
    return matrix.get(this.createPairingKey(playerId1, playerId2)) || 0;
  }

  /**
   * Calculate pairing optimization metrics for a set of players
   */
  async calculatePairingMetrics(seasonId: string, players: Player[]): Promise<PairingOptimizationResult> {
    const playerIds = players.map(p => p.id);
    const matrix = await this.loadPairingMatrix(seasonId, playerIds);
    const pairingCounts = new Map<string, number>();

    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const key = this.createPairingKey(players[i].id, players[j].id);
        pairingCounts.set(key, this.getPairingCountFromMatrix(matrix, players[i].id, players[j].id));
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
   * Uses a pre-loaded matrix if provided, otherwise loads pair counts individually.
   */
  async scoreFoursome(seasonId: string, players: Player[], matrix?: Map<string, number>): Promise<number> {
    let totalScore = 0;

    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const count = matrix
          ? this.getPairingCountFromMatrix(matrix, players[i].id, players[j].id)
          : await this.getPairingCount(seasonId, players[i].id, players[j].id);
        totalScore += count;
      }
    }

    return totalScore;
  }

  /**
   * Find the best foursome using a greedy algorithm:
   * 1. Pick the player with the fewest total pairings (least paired overall)
   * 2. Build around them by greedily adding players with the lowest pairwise count to existing group
   * This runs in O(n²) instead of the exhaustive O(n⁴) C(n,4) approach.
   */
  async findOptimalFoursome(seasonId: string, availablePlayers: Player[]): Promise<Player[]> {
    if (availablePlayers.length <= 4) {
      return availablePlayers;
    }

    const playerIds = availablePlayers.map(p => p.id);
    const matrix = await this.loadPairingMatrix(seasonId, playerIds);

    // Calculate total pairing weight for each player
    const playerWeights = availablePlayers.map(player => {
      let totalWeight = 0;
      for (const other of availablePlayers) {
        if (other.id !== player.id) {
          totalWeight += this.getPairingCountFromMatrix(matrix, player.id, other.id);
        }
      }
      return { player, totalWeight };
    });

    // Sort by weight ascending — start with the least-paired player
    playerWeights.sort((a, b) => a.totalWeight - b.totalWeight);

    const foursome: Player[] = [playerWeights[0].player];
    const usedIds = new Set<string>([foursome[0].id]);

    // Greedily add 3 more players with lowest pairwise cost to the growing group
    while (foursome.length < 4) {
      let bestCandidate: Player | null = null;
      let bestCost = Infinity;

      for (const { player: candidate } of playerWeights) {
        if (usedIds.has(candidate.id)) continue;

        // Cost = sum of pairing counts between candidate and all current foursome members
        let cost = 0;
        for (const member of foursome) {
          cost += this.getPairingCountFromMatrix(matrix, candidate.id, member.id);
        }

        if (cost < bestCost) {
          bestCost = cost;
          bestCandidate = candidate;
        }
      }

      if (bestCandidate) {
        foursome.push(bestCandidate);
        usedIds.add(bestCandidate.id);
      } else {
        break; // Safety: shouldn't happen with valid input
      }
    }

    return foursome;
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

  /**
   * Get pairing history for a specific player across all seasons
   */
  async getPairingHistory(playerId: string): Promise<Array<{ partnerId: string; count: number }>> {
    const allHistories = await this.pairingHistoryRepository.findAll();
    const aggregated = new Map<string, number>();

    for (const history of allHistories) {
      const pairings = await this.pairingHistoryRepository.getAllPairingsForPlayer(history.seasonId, playerId);
      for (const { partnerId, count } of pairings) {
        aggregated.set(partnerId, (aggregated.get(partnerId) || 0) + count);
      }
    }

    return Array.from(aggregated.entries())
      .map(([partnerId, count]) => ({ partnerId, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Get pairing history for a specific player within a single season
   */
  async getPairingHistoryForSeason(seasonId: string, playerId: string): Promise<Array<{ partnerId: string; count: number }>> {
    return await this.pairingHistoryRepository.getAllPairingsForPlayer(seasonId, playerId);
  }

  /**
   * Record a pairing between multiple players for a given season
   */
  async recordPairing(playerIds: string[], _weekId: string, seasonId?: string): Promise<void> {
    if (!seasonId) {
      console.warn('recordPairing called without seasonId — pairings not recorded');
      return;
    }

    for (let i = 0; i < playerIds.length; i++) {
      for (let j = i + 1; j < playerIds.length; j++) {
        await this.pairingHistoryRepository.addPairing(seasonId, playerIds[i], playerIds[j]);
      }
    }
  }
}