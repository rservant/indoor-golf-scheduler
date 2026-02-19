export interface WaitlistEntry {
    playerId: string;
    weekId: string;
    position: number;
    addedAt: Date;
}

export class WaitlistService {
    private storageKey = 'golf_scheduler_waitlist';

    private getStorageData(): WaitlistEntry[] {
        try {
            const data = localStorage.getItem(this.storageKey);
            if (!data) return [];
            return JSON.parse(data).map((e: any) => ({
                ...e,
                addedAt: new Date(e.addedAt)
            }));
        } catch {
            return [];
        }
    }

    private setStorageData(entries: WaitlistEntry[]): void {
        localStorage.setItem(this.storageKey, JSON.stringify(entries));
    }

    /**
     * Add a player to a week's waitlist
     */
    async addToWaitlist(playerId: string, weekId: string): Promise<WaitlistEntry> {
        const entries = this.getStorageData();
        const existing = entries.find(e => e.playerId === playerId && e.weekId === weekId);
        if (existing) {
            throw new Error('Player is already on the waitlist for this week');
        }

        const weekEntries = entries.filter(e => e.weekId === weekId);
        const newEntry: WaitlistEntry = {
            playerId,
            weekId,
            position: weekEntries.length + 1,
            addedAt: new Date()
        };

        entries.push(newEntry);
        this.setStorageData(entries);
        return newEntry;
    }

    /**
     * Remove a player from a week's waitlist
     */
    async removeFromWaitlist(playerId: string, weekId: string): Promise<boolean> {
        const entries = this.getStorageData();
        const idx = entries.findIndex(e => e.playerId === playerId && e.weekId === weekId);
        if (idx === -1) return false;

        entries.splice(idx, 1);

        // Re-number positions
        const weekEntries = entries
            .filter(e => e.weekId === weekId)
            .sort((a, b) => a.position - b.position);
        weekEntries.forEach((e, i) => { e.position = i + 1; });

        this.setStorageData(entries);
        return true;
    }

    /**
     * Promote the first player from the waitlist (auto-called when a slot opens)
     */
    async promoteFromWaitlist(weekId: string): Promise<WaitlistEntry | null> {
        const entries = this.getStorageData();
        const weekEntries = entries
            .filter(e => e.weekId === weekId)
            .sort((a, b) => a.position - b.position);

        if (weekEntries.length === 0) return null;

        const promoted = weekEntries[0];
        await this.removeFromWaitlist(promoted.playerId, weekId);
        return promoted;
    }

    /**
     * Get the waitlist for a specific week, sorted by position
     */
    async getWaitlist(weekId: string): Promise<WaitlistEntry[]> {
        const entries = this.getStorageData();
        return entries
            .filter(e => e.weekId === weekId)
            .sort((a, b) => a.position - b.position);
    }

    /**
     * Get waitlist position for a specific player in a week
     */
    async getPlayerPosition(playerId: string, weekId: string): Promise<number | null> {
        const entries = this.getStorageData();
        const entry = entries.find(e => e.playerId === playerId && e.weekId === weekId);
        return entry ? entry.position : null;
    }

    /**
     * Get total waitlist count for a week
     */
    async getWaitlistCount(weekId: string): Promise<number> {
        const entries = this.getStorageData();
        return entries.filter(e => e.weekId === weekId).length;
    }
}
