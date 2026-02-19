import { Player } from '../models/Player';
import { Schedule } from '../models/Schedule';
import { Foursome } from '../models/Foursome';
import { PairingHistoryTracker } from './PairingHistoryTracker';
import { ScheduleRepository } from '../repositories/ScheduleRepository';
import { WeekRepository } from '../repositories/WeekRepository';
import { PlayerRepository } from '../repositories/PlayerRepository';

export interface PlayerStats {
    playerId: string;
    playerName: string;
    gamesPlayed: number;
    uniquePartners: number;
    mostFrequentPartner: { name: string; count: number } | null;
    amGames: number;
    pmGames: number;
    averageFoursomeSkill: number;
}

export interface SeasonLeaderboardEntry {
    playerId: string;
    playerName: string;
    gamesPlayed: number;
    uniquePartners: number;
}

export class PlayerStatsService {
    constructor(
        private scheduleRepository: ScheduleRepository,
        private weekRepository: WeekRepository,
        private playerRepository: PlayerRepository,
        private pairingHistoryTracker: PairingHistoryTracker
    ) { }

    /**
     * Get comprehensive stats for a player within a season
     */
    async getPlayerStats(playerId: string, seasonId: string): Promise<PlayerStats> {
        const player = await this.playerRepository.findById(playerId);
        if (!player) {
            throw new Error(`Player with ID "${playerId}" not found`);
        }

        const weeks = await this.weekRepository.findBySeasonId(seasonId);
        let gamesPlayed = 0;
        let amGames = 0;
        let pmGames = 0;
        const partners = new Map<string, { name: string; count: number }>();
        const foursomeSkills: number[] = [];

        for (const week of weeks) {
            if (!week.scheduleId) continue;
            const schedule = await this.scheduleRepository.findById(week.scheduleId);
            if (!schedule) continue;

            const allFoursomes: Array<{ foursome: Foursome; slot: string }> = [
                ...schedule.timeSlots.morning.map(f => ({ foursome: f, slot: 'morning' })),
                ...schedule.timeSlots.afternoon.map(f => ({ foursome: f, slot: 'afternoon' }))
            ];

            for (const { foursome, slot } of allFoursomes) {
                const isInFoursome = foursome.players.some(p => p.id === playerId);
                if (!isInFoursome) continue;

                gamesPlayed++;
                if (slot === 'morning') amGames++;
                else pmGames++;

                // Track partners
                for (const p of foursome.players) {
                    if (p.id === playerId) continue;
                    const existing = partners.get(p.id);
                    if (existing) {
                        existing.count++;
                    } else {
                        partners.set(p.id, { name: `${p.firstName} ${p.lastName}`, count: 1 });
                    }
                }

                // Track average skill in foursomes
                const avgSkill = foursome.players.reduce((sum, p) => sum + (p.skillLevel ?? 5), 0) / foursome.players.length;
                foursomeSkills.push(avgSkill);
            }
        }

        // Find most frequent partner
        let mostFrequentPartner: { name: string; count: number } | null = null;
        for (const partner of partners.values()) {
            if (!mostFrequentPartner || partner.count > mostFrequentPartner.count) {
                mostFrequentPartner = partner;
            }
        }

        return {
            playerId,
            playerName: `${player.firstName} ${player.lastName}`,
            gamesPlayed,
            uniquePartners: partners.size,
            mostFrequentPartner,
            amGames,
            pmGames,
            averageFoursomeSkill: foursomeSkills.length > 0
                ? Math.round((foursomeSkills.reduce((s, v) => s + v, 0) / foursomeSkills.length) * 10) / 10
                : 5
        };
    }

    /**
     * Get season leaderboard sorted by games played
     */
    async getSeasonLeaderboard(seasonId: string): Promise<SeasonLeaderboardEntry[]> {
        const players = await this.playerRepository.findBySeasonId(seasonId);
        const entries: SeasonLeaderboardEntry[] = [];

        for (const player of players) {
            const stats = await this.getPlayerStats(player.id, seasonId);
            entries.push({
                playerId: player.id,
                playerName: stats.playerName,
                gamesPlayed: stats.gamesPlayed,
                uniquePartners: stats.uniquePartners
            });
        }

        return entries.sort((a, b) => b.gamesPlayed - a.gamesPlayed);
    }
}
