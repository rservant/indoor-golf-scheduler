import { Foursome } from './Foursome';

export interface Schedule {
  id: string;
  weekId: string;
  timeSlots: {
    morning: Foursome[];
    afternoon: Foursome[];
  };
  createdAt: Date;
  lastModified: Date;
}