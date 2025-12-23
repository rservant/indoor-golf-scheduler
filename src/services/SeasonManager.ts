import { Season, CreateSeasonData } from '../models/Season';
import { SeasonRepository } from '../repositories/SeasonRepository';

export interface SeasonManager {
  createSeason(name: string, startDate: Date, endDate: Date): Promise<Season>;
  getActiveSeason(): Promise<Season | null>;
  setActiveSeason(seasonId: string): Promise<Season>;
  getAllSeasons(): Promise<Season[]>;
  deleteSeason(seasonId: string): Promise<void>;
  getSeason(seasonId: string): Promise<Season | null>;
  updateSeason(seasonId: string, updates: Partial<Season>): Promise<Season>;
  archiveSeason(seasonId: string): Promise<Season>;
  validateSeasonData(name: string, startDate: Date, endDate: Date): void;
}

export class SeasonManagerService implements SeasonManager {
  constructor(private seasonRepository: SeasonRepository) {}

  async createSeason(name: string, startDate: Date, endDate: Date): Promise<Season> {
    // Validate input data
    this.validateSeasonData(name, startDate, endDate);
    
    // Check for name conflicts
    const existingSeason = await this.seasonRepository.findByName(name);
    if (existingSeason) {
      throw new Error(`Season with name "${name}" already exists`);
    }

    // Check for date range conflicts with existing seasons
    await this.validateDateRangeConflicts(startDate, endDate);

    const seasonData: CreateSeasonData = {
      name: name.trim(),
      startDate,
      endDate
    };

    return await this.seasonRepository.create(seasonData);
  }

  async getSeason(seasonId: string): Promise<Season | null> {
    if (!seasonId || seasonId.trim().length === 0) {
      throw new Error('Season ID is required');
    }
    return await this.seasonRepository.findById(seasonId);
  }

  async getActiveSeason(): Promise<Season | null> {
    return await this.seasonRepository.getActiveSeason();
  }

  async setActiveSeason(seasonId: string): Promise<Season> {
    if (!seasonId || seasonId.trim().length === 0) {
      throw new Error('Season ID is required');
    }

    // Verify season exists
    const season = await this.seasonRepository.findById(seasonId);
    if (!season) {
      throw new Error(`Season with ID "${seasonId}" not found`);
    }

    // Set as active (repository handles deactivating others)
    const activatedSeason = await this.seasonRepository.setActiveSeason(seasonId);
    if (!activatedSeason) {
      throw new Error(`Failed to activate season with ID "${seasonId}"`);
    }

    return activatedSeason;
  }

  async getAllSeasons(): Promise<Season[]> {
    return await this.seasonRepository.findAll();
  }

  async updateSeason(seasonId: string, updates: Partial<Season>): Promise<Season> {
    if (!seasonId || seasonId.trim().length === 0) {
      throw new Error('Season ID is required');
    }

    // Verify season exists
    const existingSeason = await this.seasonRepository.findById(seasonId);
    if (!existingSeason) {
      throw new Error(`Season with ID "${seasonId}" not found`);
    }

    // Validate updates if they include critical fields
    if (updates.name !== undefined || updates.startDate !== undefined || updates.endDate !== undefined) {
      const name = updates.name ?? existingSeason.name;
      const startDate = updates.startDate ?? existingSeason.startDate;
      const endDate = updates.endDate ?? existingSeason.endDate;
      
      this.validateSeasonData(name, startDate, endDate);

      // Check for name conflicts (excluding current season)
      if (updates.name && updates.name !== existingSeason.name) {
        const conflictingSeason = await this.seasonRepository.findByName(updates.name);
        if (conflictingSeason && conflictingSeason.id !== seasonId) {
          throw new Error(`Season with name "${updates.name}" already exists`);
        }
      }

      // Check for date range conflicts (excluding current season)
      if (updates.startDate || updates.endDate) {
        await this.validateDateRangeConflicts(startDate, endDate, seasonId);
      }
    }

    const updatedSeason = await this.seasonRepository.update(seasonId, updates);
    if (!updatedSeason) {
      throw new Error(`Failed to update season with ID "${seasonId}"`);
    }

    return updatedSeason;
  }

  async deleteSeason(seasonId: string): Promise<void> {
    if (!seasonId || seasonId.trim().length === 0) {
      throw new Error('Season ID is required');
    }

    // Verify season exists
    const season = await this.seasonRepository.findById(seasonId);
    if (!season) {
      throw new Error(`Season with ID "${seasonId}" not found`);
    }

    // Check if season has associated data (players, weeks)
    if (season.playerIds.length > 0 || season.weekIds.length > 0) {
      throw new Error('Cannot delete season with associated players or weeks. Archive the season instead.');
    }

    const deleted = await this.seasonRepository.delete(seasonId);
    if (!deleted) {
      throw new Error(`Failed to delete season with ID "${seasonId}"`);
    }
  }

  async archiveSeason(seasonId: string): Promise<Season> {
    if (!seasonId || seasonId.trim().length === 0) {
      throw new Error('Season ID is required');
    }

    // Verify season exists
    const season = await this.seasonRepository.findById(seasonId);
    if (!season) {
      throw new Error(`Season with ID "${seasonId}" not found`);
    }

    // Archive by deactivating and marking as archived (using a convention)
    const archivedSeason = await this.seasonRepository.update(seasonId, { 
      isActive: false 
    });

    if (!archivedSeason) {
      throw new Error(`Failed to archive season with ID "${seasonId}"`);
    }

    return archivedSeason;
  }

  validateSeasonData(name: string, startDate: Date, endDate: Date): void {
    if (!name || name.trim().length === 0) {
      throw new Error('Season name is required and cannot be empty');
    }

    if (name.trim().length > 100) {
      throw new Error('Season name cannot exceed 100 characters');
    }

    if (!(startDate instanceof Date) || isNaN(startDate.getTime())) {
      throw new Error('Valid start date is required');
    }

    if (!(endDate instanceof Date) || isNaN(endDate.getTime())) {
      throw new Error('Valid end date is required');
    }

    if (startDate >= endDate) {
      throw new Error('Start date must be before end date');
    }

    // Ensure dates are not in the distant past
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    
    if (endDate < oneYearAgo) {
      throw new Error('End date cannot be more than one year in the past');
    }
  }

  private async validateDateRangeConflicts(startDate: Date, endDate: Date, excludeSeasonId?: string): Promise<void> {
    const allSeasons = await this.seasonRepository.findAll();
    
    for (const season of allSeasons) {
      // Skip the season being updated
      if (excludeSeasonId && season.id === excludeSeasonId) {
        continue;
      }

      // Check for overlapping date ranges
      const hasOverlap = (
        (startDate >= season.startDate && startDate < season.endDate) ||
        (endDate > season.startDate && endDate <= season.endDate) ||
        (startDate <= season.startDate && endDate >= season.endDate)
      );

      if (hasOverlap) {
        throw new Error(`Date range conflicts with existing season "${season.name}" (${season.startDate.toDateString()} - ${season.endDate.toDateString()})`);
      }
    }
  }
}

// Keep the in-memory implementation for testing
export class InMemorySeasonManager implements SeasonManager {
  private seasons: Map<string, Season> = new Map();
  private activeSeasonId: string | null = null;

  async createSeason(name: string, startDate: Date, endDate: Date): Promise<Season> {
    this.validateSeasonData(name, startDate, endDate);
    
    // Check for name conflicts
    const existingSeason = Array.from(this.seasons.values()).find(s => s.name === name);
    if (existingSeason) {
      throw new Error(`Season with name "${name}" already exists`);
    }

    const id = this.generateId();
    const season: Season = {
      id,
      name: name.trim(),
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

  async getSeason(seasonId: string): Promise<Season | null> {
    if (!seasonId || seasonId.trim().length === 0) {
      throw new Error('Season ID is required');
    }
    return this.seasons.get(seasonId) || null;
  }

  async getActiveSeason(): Promise<Season | null> {
    if (!this.activeSeasonId) return null;
    return this.seasons.get(this.activeSeasonId) || null;
  }

  async setActiveSeason(seasonId: string): Promise<Season> {
    if (!seasonId || seasonId.trim().length === 0) {
      throw new Error('Season ID is required');
    }

    if (!this.seasons.has(seasonId)) {
      throw new Error(`Season with ID "${seasonId}" not found`);
    }

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
      const activatedSeason = { ...newActive, isActive: true };
      this.seasons.set(seasonId, activatedSeason);
      this.activeSeasonId = seasonId;
      return activatedSeason;
    }

    throw new Error(`Failed to activate season with ID "${seasonId}"`);
  }

  async getAllSeasons(): Promise<Season[]> {
    return Array.from(this.seasons.values());
  }

  async updateSeason(seasonId: string, updates: Partial<Season>): Promise<Season> {
    if (!seasonId || seasonId.trim().length === 0) {
      throw new Error('Season ID is required');
    }

    const existingSeason = this.seasons.get(seasonId);
    if (!existingSeason) {
      throw new Error(`Season with ID "${seasonId}" not found`);
    }

    // Validate updates if they include critical fields
    if (updates.name !== undefined || updates.startDate !== undefined || updates.endDate !== undefined) {
      const name = updates.name ?? existingSeason.name;
      const startDate = updates.startDate ?? existingSeason.startDate;
      const endDate = updates.endDate ?? existingSeason.endDate;
      
      this.validateSeasonData(name, startDate, endDate);

      // Check for name conflicts (excluding current season)
      if (updates.name && updates.name !== existingSeason.name) {
        const conflictingSeason = Array.from(this.seasons.values()).find(s => s.name === updates.name && s.id !== seasonId);
        if (conflictingSeason) {
          throw new Error(`Season with name "${updates.name}" already exists`);
        }
      }
    }

    const updatedSeason = { ...existingSeason, ...updates };
    this.seasons.set(seasonId, updatedSeason);
    return updatedSeason;
  }

  async deleteSeason(seasonId: string): Promise<void> {
    if (!seasonId || seasonId.trim().length === 0) {
      throw new Error('Season ID is required');
    }

    const season = this.seasons.get(seasonId);
    if (!season) {
      throw new Error(`Season with ID "${seasonId}" not found`);
    }

    // Check if season has associated data
    if (season.playerIds.length > 0 || season.weekIds.length > 0) {
      throw new Error('Cannot delete season with associated players or weeks. Archive the season instead.');
    }

    if (this.activeSeasonId === seasonId) {
      this.activeSeasonId = null;
    }
    this.seasons.delete(seasonId);
  }

  async archiveSeason(seasonId: string): Promise<Season> {
    if (!seasonId || seasonId.trim().length === 0) {
      throw new Error('Season ID is required');
    }

    const season = this.seasons.get(seasonId);
    if (!season) {
      throw new Error(`Season with ID "${seasonId}" not found`);
    }

    const archivedSeason = { ...season, isActive: false };
    this.seasons.set(seasonId, archivedSeason);
    
    if (this.activeSeasonId === seasonId) {
      this.activeSeasonId = null;
    }

    return archivedSeason;
  }

  validateSeasonData(name: string, startDate: Date, endDate: Date): void {
    if (!name || name.trim().length === 0) {
      throw new Error('Season name is required and cannot be empty');
    }

    if (name.trim().length > 100) {
      throw new Error('Season name cannot exceed 100 characters');
    }

    if (!(startDate instanceof Date) || isNaN(startDate.getTime())) {
      throw new Error('Valid start date is required');
    }

    if (!(endDate instanceof Date) || isNaN(endDate.getTime())) {
      throw new Error('Valid end date is required');
    }

    if (startDate >= endDate) {
      throw new Error('Start date must be before end date');
    }

    // Ensure dates are not in the distant past
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    
    if (endDate < oneYearAgo) {
      throw new Error('End date cannot be more than one year in the past');
    }
  }

  private generateId(): string {
    return `season_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}