export interface Season {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  createdAt: Date;
  playerIds: string[];
  weekIds: string[];
}

export interface CreateSeasonData {
  name: string;
  startDate: Date;
  endDate: Date;
}