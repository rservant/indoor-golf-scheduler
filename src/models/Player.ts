export type Handedness = 'left' | 'right';
export type TimePreference = 'AM' | 'PM' | 'Either';

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  handedness: Handedness;
  timePreference: TimePreference;
  seasonId: string;
  createdAt: Date;
}

export interface PlayerInfo {
  firstName: string;
  lastName: string;
  handedness: Handedness;
  timePreference: TimePreference;
}