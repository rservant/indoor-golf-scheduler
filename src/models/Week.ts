export interface Week {
  id: string;
  seasonId: string;
  weekNumber: number;
  date: Date;
  playerAvailability: Record<string, boolean>; // playerId -> available
  scheduleId?: string;
}