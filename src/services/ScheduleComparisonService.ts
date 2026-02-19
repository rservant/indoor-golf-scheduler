import { Schedule } from '../models/Schedule';
import { Foursome } from '../models/Foursome';

export interface ScheduleDiff {
    playersAdded: string[];
    playersRemoved: string[];
    playersMoved: Array<{
        playerId: string;
        playerName: string;
        fromSlot: string;
        fromGroup: number;
        toSlot: string;
        toGroup: number;
    }>;
    foursomeDiffs: Array<{
        slot: string;
        groupIndex: number;
        added: string[];
        removed: string[];
    }>;
    totalChanges: number;
}

export class ScheduleComparisonService {
    /**
     * Compare two schedules and return a structured diff
     */
    compareSchedules(oldSchedule: Schedule, newSchedule: Schedule): ScheduleDiff {
        const oldPlayers = this.extractPlayerMap(oldSchedule);
        const newPlayers = this.extractPlayerMap(newSchedule);

        // Find added and removed players
        const playersAdded: string[] = [];
        const playersRemoved: string[] = [];
        const playersMoved: ScheduleDiff['playersMoved'] = [];

        for (const [id, info] of newPlayers) {
            if (!oldPlayers.has(id)) {
                playersAdded.push(info.name);
            }
        }

        for (const [id, info] of oldPlayers) {
            if (!newPlayers.has(id)) {
                playersRemoved.push(info.name);
            }
        }

        // Find moved players (same player, different slot or group)
        for (const [id, newInfo] of newPlayers) {
            const oldInfo = oldPlayers.get(id);
            if (oldInfo && (oldInfo.slot !== newInfo.slot || oldInfo.groupIndex !== newInfo.groupIndex)) {
                playersMoved.push({
                    playerId: id,
                    playerName: newInfo.name,
                    fromSlot: oldInfo.slot,
                    fromGroup: oldInfo.groupIndex,
                    toSlot: newInfo.slot,
                    toGroup: newInfo.groupIndex
                });
            }
        }

        // Compute foursome-level diffs
        const foursomeDiffs: ScheduleDiff['foursomeDiffs'] = [];
        const slots = ['morning', 'afternoon'] as const;

        for (const slot of slots) {
            const oldFoursomes = oldSchedule.timeSlots[slot];
            const newFoursomes = newSchedule.timeSlots[slot];
            const maxLen = Math.max(oldFoursomes.length, newFoursomes.length);

            for (let i = 0; i < maxLen; i++) {
                const oldIds = new Set(oldFoursomes[i]?.players?.map(p => p.id) ?? []);
                const newIds = new Set(newFoursomes[i]?.players?.map(p => p.id) ?? []);

                const added = [...newIds].filter(id => !oldIds.has(id));
                const removed = [...oldIds].filter(id => !newIds.has(id));

                if (added.length > 0 || removed.length > 0) {
                    foursomeDiffs.push({
                        slot,
                        groupIndex: i,
                        added: added.map(id => {
                            const p = newFoursomes[i].players.find(pl => pl.id === id);
                            return p ? `${p.firstName} ${p.lastName}` : id;
                        }),
                        removed: removed.map(id => {
                            const p = oldFoursomes[i]?.players?.find(pl => pl.id === id);
                            return p ? `${p.firstName} ${p.lastName}` : id;
                        })
                    });
                }
            }
        }

        const totalChanges = playersAdded.length + playersRemoved.length + playersMoved.length + foursomeDiffs.length;

        return {
            playersAdded,
            playersRemoved,
            playersMoved,
            foursomeDiffs,
            totalChanges
        };
    }

    /**
     * Generate a human-readable summary of differences
     */
    generateDiffSummary(diff: ScheduleDiff): string {
        const lines: string[] = [];

        if (diff.totalChanges === 0) {
            return 'No changes between schedules.';
        }

        if (diff.playersAdded.length > 0) {
            lines.push(`Added: ${diff.playersAdded.join(', ')}`);
        }
        if (diff.playersRemoved.length > 0) {
            lines.push(`Removed: ${diff.playersRemoved.join(', ')}`);
        }
        if (diff.playersMoved.length > 0) {
            for (const m of diff.playersMoved) {
                lines.push(`Moved: ${m.playerName} from ${m.fromSlot} Group ${m.fromGroup + 1} → ${m.toSlot} Group ${m.toGroup + 1}`);
            }
        }
        if (diff.foursomeDiffs.length > 0) {
            lines.push(`${diff.foursomeDiffs.length} group(s) changed`);
        }

        return lines.join('\n');
    }

    /**
     * Create a map of all players with their slot/group location
     */
    private extractPlayerMap(schedule: Schedule): Map<string, { name: string; slot: string; groupIndex: number }> {
        const map = new Map<string, { name: string; slot: string; groupIndex: number }>();
        const slots: Array<{ name: string; foursomes: Foursome[] }> = [
            { name: 'morning', foursomes: schedule.timeSlots.morning },
            { name: 'afternoon', foursomes: schedule.timeSlots.afternoon }
        ];

        for (const slot of slots) {
            for (let i = 0; i < slot.foursomes.length; i++) {
                for (const player of slot.foursomes[i].players) {
                    map.set(player.id, {
                        name: `${player.firstName} ${player.lastName}`,
                        slot: slot.name,
                        groupIndex: i
                    });
                }
            }
        }

        return map;
    }
}
