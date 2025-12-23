import * as fc from 'fast-check';
import { PlayerModel, PlayerInfo, Handedness, TimePreference } from './Player';

describe('Player Model Property Tests', () => {
  /**
   * Feature: indoor-golf-scheduler, Property 3: Player data integrity
   * Validates: Requirements 2.1, 2.2, 2.3
   */
  test('Property 3: Player data integrity - adding and retrieving player preserves all data and updates maintain integrity', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0), // firstName
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0), // lastName
        fc.constantFrom('left', 'right'), // handedness
        fc.constantFrom('AM', 'PM', 'Either'), // timePreference
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0), // seasonId
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0), // updated firstName
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0), // updated lastName
        fc.constantFrom('left', 'right'), // updated handedness
        fc.constantFrom('AM', 'PM', 'Either'), // updated timePreference
        (firstName, lastName, handedness, timePreference, seasonId, 
         updatedFirstName, updatedLastName, updatedHandedness, updatedTimePreference) => {
          
          const playerInfo: PlayerInfo = {
            firstName,
            lastName,
            handedness: handedness as Handedness,
            timePreference: timePreference as TimePreference
          };

          // Test 1: Creating a player preserves all data
          const player = new PlayerModel({ ...playerInfo, seasonId });
          
          expect(player.firstName).toBe(firstName);
          expect(player.lastName).toBe(lastName);
          expect(player.handedness).toBe(handedness);
          expect(player.timePreference).toBe(timePreference);
          expect(player.seasonId).toBe(seasonId);
          expect(player.id).toBeDefined();
          expect(player.id.length).toBeGreaterThan(0);
          expect(player.createdAt).toBeInstanceOf(Date);
          expect(player.getFullName()).toBe(`${firstName} ${lastName}`);

          // Test 2: toJSON preserves all data
          const jsonData = player.toJSON();
          expect(jsonData.firstName).toBe(firstName);
          expect(jsonData.lastName).toBe(lastName);
          expect(jsonData.handedness).toBe(handedness);
          expect(jsonData.timePreference).toBe(timePreference);
          expect(jsonData.seasonId).toBe(seasonId);
          expect(jsonData.id).toBe(player.id);
          expect(jsonData.createdAt).toEqual(player.createdAt);

          // Test 3: Updating player info maintains data integrity
          const updates: Partial<PlayerInfo> = {
            firstName: updatedFirstName,
            lastName: updatedLastName,
            handedness: updatedHandedness as Handedness,
            timePreference: updatedTimePreference as TimePreference
          };

          player.updateInfo(updates);

          expect(player.firstName).toBe(updatedFirstName);
          expect(player.lastName).toBe(updatedLastName);
          expect(player.handedness).toBe(updatedHandedness);
          expect(player.timePreference).toBe(updatedTimePreference);
          expect(player.seasonId).toBe(seasonId); // seasonId should remain unchanged
          expect(player.id).toBeDefined(); // id should remain unchanged
          expect(player.createdAt).toBeInstanceOf(Date); // createdAt should remain unchanged
          expect(player.getFullName()).toBe(`${updatedFirstName} ${updatedLastName}`);

          // Test 4: Partial updates work correctly
          const partialPlayer = new PlayerModel({ ...playerInfo, seasonId });
          partialPlayer.updateInfo({ firstName: updatedFirstName });
          
          expect(partialPlayer.firstName).toBe(updatedFirstName);
          expect(partialPlayer.lastName).toBe(lastName); // unchanged
          expect(partialPlayer.handedness).toBe(handedness); // unchanged
          expect(partialPlayer.timePreference).toBe(timePreference); // unchanged
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Player validation rejects invalid data', () => {
    const validPlayerInfo: PlayerInfo = {
      firstName: 'John',
      lastName: 'Doe',
      handedness: 'right',
      timePreference: 'AM'
    };
    const validSeasonId = 'season123';

    // Test empty firstName
    expect(() => {
      new PlayerModel({ ...validPlayerInfo, firstName: '', seasonId: validSeasonId });
    }).toThrow('First name is required and cannot be empty');

    // Test empty lastName
    expect(() => {
      new PlayerModel({ ...validPlayerInfo, lastName: '', seasonId: validSeasonId });
    }).toThrow('Last name is required and cannot be empty');

    // Test invalid handedness
    expect(() => {
      new PlayerModel({ ...validPlayerInfo, handedness: 'invalid' as Handedness, seasonId: validSeasonId });
    }).toThrow('Handedness must be either "left" or "right"');

    // Test invalid timePreference
    expect(() => {
      new PlayerModel({ ...validPlayerInfo, timePreference: 'invalid' as TimePreference, seasonId: validSeasonId });
    }).toThrow('Time preference must be "AM", "PM", or "Either"');

    // Test empty seasonId
    expect(() => {
      new PlayerModel({ ...validPlayerInfo, seasonId: '' });
    }).toThrow('Season ID is required');
  });

  test('Player updateInfo validation works correctly', () => {
    const player = new PlayerModel({
      firstName: 'John',
      lastName: 'Doe',
      handedness: 'right',
      timePreference: 'AM',
      seasonId: 'season123'
    });

    // Test invalid updates are rejected
    expect(() => {
      player.updateInfo({ firstName: '' });
    }).toThrow('First name is required and cannot be empty');

    expect(() => {
      player.updateInfo({ lastName: '' });
    }).toThrow('Last name is required and cannot be empty');

    expect(() => {
      player.updateInfo({ handedness: 'invalid' as Handedness });
    }).toThrow('Handedness must be either "left" or "right"');

    expect(() => {
      player.updateInfo({ timePreference: 'invalid' as TimePreference });
    }).toThrow('Time preference must be "AM", "PM", or "Either"');
  });
});