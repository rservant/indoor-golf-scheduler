import { Season } from '../models/Season';

export interface SeasonManager {
  createSeason(name: string, startDate: Date, endDate: Date): Season;
  getActiveSeason(): Season | null;
  setActiveSeason(seasonId: string): void;
  getAllSeasons(): Season[];
  deleteSeason(seasonId: string): void;
  getSeason(seasonId: string): Season | null;
}

export class InMemorySeasonManager implements SeasonManager {
  private seasons: Map<string, Season> = new Map();
  private activeSeasonId: string | null = null;

  createSeason(name: string, startDate: Date, endDate: Date): Season {
    const id = this.generateId();
    const season: Season = {
      id,
      name,
      startDate,
      endDate,
      isActive: false,
      createdAt: new Date(),
      playerIds: [],
      weekIds: []
    };
    
    this.seasons.set(id, season);
    return season;
  }

  getSeason(seasonId: string): Season | null {
    return this.seasons.get(seasonId) || null;
  }

  getActiveSeason(): Season | null {
    if (!this.activeSeasonId) return null;
    return this.seasons.get(this.activeSeasonId) || null;
  }

  setActiveSeason(seasonId: string): void {
    if (this.seasons.has(seasonId)) {
      // Deactivate current active season
      if (this.activeSeasonId) {
        const currentActive = this.seasons.get(this.activeSeasonId);
        if (currentActive) {
          this.seasons.set(this.activeSeasonId, { ...currentActive, isActive: false });
        }
      }
      
      // Activate new season
      const newActive = this.seasons.get(seasonId);
      if (newActive) {
        this.seasons.set(seasonId, { ...newActive, isActive: true });
        this.activeSeasonId = seasonId;
      }
    }
  }

  getAllSeasons(): Season[] {
    return Array.from(this.seasons.values());
  }

  deleteSeason(seasonId: string): void {
    if (this.activeSeasonId === seasonId) {
      this.activeSeasonId = null;
    }
    this.seasons.delete(seasonId);
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }
}