export interface PairingHistory {
  seasonId: string;
  pairings: Record<string, number>; // "playerId1-playerId2" -> count
  lastUpdated: Date;
}