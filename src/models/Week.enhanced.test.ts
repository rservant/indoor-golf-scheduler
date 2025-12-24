import { WeekModel } from './Week';

describe('WeekModel Enhanced Availability Validation', () => {
  let week: WeekModel;

  beforeEach(() => {
    week = new WeekModel({
      seasonId: 'test-season',
      weekNumber: 1,
      date: new Date(),
      playerAvailability: {
        'player1': true,
        'player2': false,
        'player3': true
      }
    });
  });

  describe('Enhanced isPlayerAvailable method', () => {
    test('should return true only for explicitly available players', () => {
      expect(week.isPlayerAvailable('player1')).toBe(true);
      expect(week.isPlayerAvailable('player3')).toBe(true);
    });

    test('should return false for explicitly unavailable players', () => {
      expect(week.isPlayerAvailable('player2')).toBe(false);
    });

    test('should return false for players with no availability data', () => {
      expect(week.isPlayerAvailable('nonexistent-player')).toBe(false);
    });

    test('should throw error for empty player ID', () => {
      expect(() => week.isPlayerAvailable('')).toThrow('Player ID is required for availability check');
      expect(() => week.isPlayerAvailable('   ')).toThrow('Player ID is required for availability check');
    });
  });

  describe('hasAvailabilityData method', () => {
    test('should return true for players with explicit availability data', () => {
      expect(week.hasAvailabilityData('player1')).toBe(true);
      expect(week.hasAvailabilityData('player2')).toBe(true);
      expect(week.hasAvailabilityData('player3')).toBe(true);
    });

    test('should return false for players without availability data', () => {
      expect(week.hasAvailabilityData('nonexistent-player')).toBe(false);
    });

    test('should throw error for empty player ID', () => {
      expect(() => week.hasAvailabilityData('')).toThrow('Player ID is required for availability data check');
    });
  });

  describe('getPlayerAvailabilityStatus method', () => {
    test('should return explicit availability status', () => {
      expect(week.getPlayerAvailabilityStatus('player1')).toBe(true);
      expect(week.getPlayerAvailabilityStatus('player2')).toBe(false);
      expect(week.getPlayerAvailabilityStatus('player3')).toBe(true);
    });

    test('should return undefined for players without data', () => {
      expect(week.getPlayerAvailabilityStatus('nonexistent-player')).toBeUndefined();
    });

    test('should throw error for empty player ID', () => {
      expect(() => week.getPlayerAvailabilityStatus('')).toThrow('Player ID is required for availability status check');
    });
  });

  describe('hasCompleteAvailabilityData method', () => {
    test('should return true when all required players have availability data', () => {
      expect(week.hasCompleteAvailabilityData(['player1', 'player2'])).toBe(true);
      expect(week.hasCompleteAvailabilityData(['player1', 'player2', 'player3'])).toBe(true);
    });

    test('should return false when some players are missing availability data', () => {
      expect(week.hasCompleteAvailabilityData(['player1', 'nonexistent-player'])).toBe(false);
    });

    test('should return true for empty array', () => {
      expect(week.hasCompleteAvailabilityData([])).toBe(true);
    });

    test('should throw error for non-array input', () => {
      expect(() => week.hasCompleteAvailabilityData('not-an-array' as any)).toThrow('Required player IDs must be an array');
    });
  });

  describe('getPlayersWithMissingAvailability method', () => {
    test('should return empty array when all players have availability data', () => {
      expect(week.getPlayersWithMissingAvailability(['player1', 'player2'])).toEqual([]);
    });

    test('should return missing players', () => {
      expect(week.getPlayersWithMissingAvailability(['player1', 'missing1', 'missing2']))
        .toEqual(['missing1', 'missing2']);
    });

    test('should return empty array for empty input', () => {
      expect(week.getPlayersWithMissingAvailability([])).toEqual([]);
    });

    test('should throw error for non-array input', () => {
      expect(() => week.getPlayersWithMissingAvailability('not-an-array' as any)).toThrow('Required player IDs must be an array');
    });
  });

  describe('Enhanced setPlayerAvailability method', () => {
    test('should set availability with proper validation', () => {
      week.setPlayerAvailability('new-player', true);
      expect(week.isPlayerAvailable('new-player')).toBe(true);
      
      week.setPlayerAvailability('new-player', false);
      expect(week.isPlayerAvailable('new-player')).toBe(false);
    });

    test('should trim player IDs', () => {
      week.setPlayerAvailability('  spaced-player  ', true);
      expect(week.isPlayerAvailable('spaced-player')).toBe(true);
    });

    test('should throw error for empty player ID', () => {
      expect(() => week.setPlayerAvailability('', true)).toThrow('Player ID is required and cannot be empty');
      expect(() => week.setPlayerAvailability('   ', true)).toThrow('Player ID is required and cannot be empty');
    });

    test('should throw error for non-boolean availability', () => {
      expect(() => week.setPlayerAvailability('player', 'true' as any)).toThrow('Availability must be a boolean value, received: string');
      expect(() => week.setPlayerAvailability('player', 1 as any)).toThrow('Availability must be a boolean value, received: number');
    });
  });

  describe('removePlayerAvailability method', () => {
    test('should remove player availability data', () => {
      expect(week.hasAvailabilityData('player1')).toBe(true);
      week.removePlayerAvailability('player1');
      expect(week.hasAvailabilityData('player1')).toBe(false);
    });

    test('should handle non-existent players gracefully', () => {
      expect(() => week.removePlayerAvailability('nonexistent')).not.toThrow();
    });

    test('should throw error for empty player ID', () => {
      expect(() => week.removePlayerAvailability('')).toThrow('Player ID is required for availability removal');
    });
  });

  describe('setMultiplePlayerAvailability method', () => {
    test('should set multiple players availability', () => {
      week.setMultiplePlayerAvailability({
        'batch1': true,
        'batch2': false,
        'batch3': true
      });

      expect(week.isPlayerAvailable('batch1')).toBe(true);
      expect(week.isPlayerAvailable('batch2')).toBe(false);
      expect(week.isPlayerAvailable('batch3')).toBe(true);
    });

    test('should validate all entries before applying changes', () => {
      const invalidData = {
        'valid-player': true,
        'invalid-player': 'not-boolean' as any
      };

      expect(() => week.setMultiplePlayerAvailability(invalidData))
        .toThrow('All availability values must be boolean, found string for player invalid-player');

      // Ensure no changes were applied
      expect(week.hasAvailabilityData('valid-player')).toBe(false);
    });

    test('should throw error for empty player IDs', () => {
      expect(() => week.setMultiplePlayerAvailability({ '': true }))
        .toThrow('All player IDs must be non-empty strings');
    });

    test('should throw error for non-object input', () => {
      expect(() => week.setMultiplePlayerAvailability(null as any))
        .toThrow('Availability data must be an object');
      expect(() => week.setMultiplePlayerAvailability('not-object' as any))
        .toThrow('Availability data must be an object');
    });
  });

  describe('Defensive programming edge cases', () => {
    test('should handle whitespace-only player IDs consistently', () => {
      expect(() => week.isPlayerAvailable('   ')).toThrow();
      expect(() => week.hasAvailabilityData('   ')).toThrow();
      expect(() => week.setPlayerAvailability('   ', true)).toThrow();
    });

    test('should maintain data integrity during batch operations', () => {
      const originalData = { ...week.playerAvailability };
      
      try {
        week.setMultiplePlayerAvailability({
          'valid': true,
          'invalid': 'not-boolean' as any
        });
      } catch (error) {
        // Verify original data is unchanged
        expect(week.playerAvailability).toEqual(originalData);
      }
    });
  });
});