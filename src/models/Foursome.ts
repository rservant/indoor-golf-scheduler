import { Player } from './Player';

export type TimeSlot = 'morning' | 'afternoon';

export interface Foursome {
  id: string;
  players: Player[];
  timeSlot: TimeSlot;
  position: number; // ordering within time slot
}