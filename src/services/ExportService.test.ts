import * as fc from 'fast-check';
import { ExportService, ExportFormat, ScheduleExportData } from './ExportService';
import { ScheduleModel } from '../models/Schedule';
import { FoursomeModel } from '../models/Foursome';
import { PlayerModel, Handedness, TimePreference } from '../models/Player';

describe('ExportService', () => {
  let exportService: ExportService;

  beforeEach(() => {
    exportService = new ExportService();
  });

  describe('Property-Based Tests', () => {
    /**
     * **Feature: indoor-golf-scheduler, Property 13: Export data accuracy**
     * **Validates: Requirements 8.1, 8.2, 8.4**
     */
    it('should export data that exactly matches the current schedule state', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate a valid schedule with foursomes
          fc.record({
            weekId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            morningFoursomes: fc.array(
              fc.record({
                players: fc.array(
                  fc.record({
                    firstName: fc.string({ minLength: 1, maxLength: 15 }).filter(s => s.trim().length > 0),
                    lastName: fc.string({ minLength: 1, maxLength: 15 }).filter(s => s.trim().length > 0),
                    handedness: fc.constantFrom('left', 'right') as fc.Arbitrary<Handedness>,
                    timePreference: fc.constantFrom('AM', 'PM', 'Either') as fc.Arbitrary<TimePreference>,
                    seasonId: fc.constant('test-season')
                  }),
                  { minLength: 1, maxLength: 4 }
                ),
                position: fc.nat({ max: 10 })
              }),
              { minLength: 0, maxLength: 5 }
            ),
            afternoonFoursomes: fc.array(
              fc.record({
                players: fc.array(
                  fc.record({
                    firstName: fc.string({ minLength: 1, maxLength: 15 }).filter(s => s.trim().length > 0),
                    lastName: fc.string({ minLength: 1, maxLength: 15 }).filter(s => s.trim().length > 0),
                    handedness: fc.constantFrom('left', 'right') as fc.Arbitrary<Handedness>,
                    timePreference: fc.constantFrom('AM', 'PM', 'Either') as fc.Arbitrary<TimePreference>,
                    seasonId: fc.constant('test-season')
                  }),
                  { minLength: 1, maxLength: 4 }
                ),
                position: fc.nat({ max: 10 })
              }),
              { minLength: 0, maxLength: 5 }
            )
          }),
          fc.constantFrom('csv', 'pdf') as fc.Arbitrary<ExportFormat>,
          async (scheduleData, format) => {
            // Skip if no players at all
            const totalPlayers = scheduleData.morningFoursomes.reduce((sum, f) => sum + f.players.length, 0) +
                               scheduleData.afternoonFoursomes.reduce((sum, f) => sum + f.players.length, 0);
            fc.pre(totalPlayers > 0);

            // Create schedule with unique player IDs
            const allPlayerData = [
              ...scheduleData.morningFoursomes.flatMap(f => f.players),
              ...scheduleData.afternoonFoursomes.flatMap(f => f.players)
            ];
            
            // Ensure unique player names to avoid conflicts
            const uniquePlayerData = allPlayerData.filter((player, index, arr) => {
              const fullName = `${player.firstName} ${player.lastName}`;
              return arr.findIndex(p => `${p.firstName} ${p.lastName}` === fullName) === index;
            });

            fc.pre(uniquePlayerData.length > 0);

            // Create players with unique IDs
            const players = uniquePlayerData.map((playerData, index) => 
              new PlayerModel({
                ...playerData,
                id: `player_${index}`
              })
            );

            // Create morning foursomes
            const morningFoursomes = scheduleData.morningFoursomes.map((foursomeData, index) => {
              const foursomePlayers = players.slice(0, Math.min(foursomeData.players.length, players.length));
              players.splice(0, foursomePlayers.length); // Remove used players
              
              if (foursomePlayers.length === 0) return null;
              
              return new FoursomeModel({
                players: foursomePlayers,
                timeSlot: 'morning',
                position: foursomeData.position,
                id: `foursome_morning_${index}`
              });
            }).filter(f => f !== null) as FoursomeModel[];

            // Create afternoon foursomes with remaining players
            const afternoonFoursomes = scheduleData.afternoonFoursomes.map((foursomeData, index) => {
              const foursomePlayers = players.slice(0, Math.min(foursomeData.players.length, players.length));
              players.splice(0, foursomePlayers.length); // Remove used players
              
              if (foursomePlayers.length === 0) return null;
              
              return new FoursomeModel({
                players: foursomePlayers,
                timeSlot: 'afternoon',
                position: foursomeData.position,
                id: `foursome_afternoon_${index}`
              });
            }).filter(f => f !== null) as FoursomeModel[];

            // Skip if no valid foursomes were created
            fc.pre(morningFoursomes.length > 0 || afternoonFoursomes.length > 0);

            const schedule = new ScheduleModel({
              weekId: scheduleData.weekId,
              timeSlots: {
                morning: morningFoursomes,
                afternoon: afternoonFoursomes
              }
            });

            // Export the schedule
            const exportResult = await exportService.exportSchedule(schedule, { format });

            // Verify export was successful
            expect(exportResult.success).toBe(true);
            expect(exportResult.data).toBeDefined();
            expect(exportResult.filename).toContain(schedule.weekId);
            expect(exportResult.mimeType).toBeDefined();

            // Verify export data accuracy using the validation method
            const exportData = (exportService as any).prepareScheduleData(schedule);
            const isValid = exportService.validateExportData(schedule, exportData);
            expect(isValid).toBe(true);

            // Verify all required information is included
            expect(exportData.length).toBeGreaterThan(0);
            
            // Check that all export data has required fields
            exportData.forEach((row: ScheduleExportData) => {
              expect(row.weekId).toBe(schedule.weekId);
              expect(row.timeSlot).toMatch(/^(10:30 AM|1:00 PM)$/);
              expect(row.foursomeNumber).toBeGreaterThan(0);
              expect(row.playerName).toMatch(/^.+ .+$/); // First and last name
              expect(row.handedness).toMatch(/^(left|right)$/);
              expect(row.timePreference).toMatch(/^(AM|PM|Either)$/);
              expect(row.position).toBeGreaterThan(0);
            });

            // Verify that the number of exported players matches the schedule
            const schedulePlayerCount = schedule.getTotalPlayerCount();
            expect(exportData.length).toBe(schedulePlayerCount);

            // Verify that all players from the schedule appear in export
            const schedulePlayerNames = new Set<string>();
            [...schedule.timeSlots.morning, ...schedule.timeSlots.afternoon].forEach(foursome => {
              foursome.players.forEach(player => {
                schedulePlayerNames.add(`${player.firstName} ${player.lastName}`);
              });
            });

            const exportPlayerNames = new Set(exportData.map((d: ScheduleExportData) => d.playerName));
            expect(exportPlayerNames).toEqual(schedulePlayerNames);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Unit Tests', () => {
    it('should create export service instance', () => {
      expect(exportService).toBeInstanceOf(ExportService);
    });

    it('should handle empty schedule gracefully', async () => {
      const emptySchedule = new ScheduleModel({
        weekId: 'test-week',
        timeSlots: { morning: [], afternoon: [] }
      });

      const result = await exportService.exportSchedule(emptySchedule, { format: 'csv' });
      
      expect(result.success).toBe(true);
      expect(result.filename).toContain('test-week');
    });

    it('should validate export data correctly', () => {
      const player = new PlayerModel({
        firstName: 'John',
        lastName: 'Doe',
        handedness: 'right',
        timePreference: 'AM',
        seasonId: 'test-season'
      });

      const foursome = new FoursomeModel({
        players: [player],
        timeSlot: 'morning',
        position: 1
      });

      const schedule = new ScheduleModel({
        weekId: 'test-week',
        timeSlots: { morning: [foursome], afternoon: [] }
      });

      const exportData = (exportService as any).prepareScheduleData(schedule);
      const isValid = exportService.validateExportData(schedule, exportData);

      expect(isValid).toBe(true);
    });

    it('should detect invalid export data', () => {
      const player = new PlayerModel({
        firstName: 'John',
        lastName: 'Doe',
        handedness: 'right',
        timePreference: 'AM',
        seasonId: 'test-season'
      });

      const foursome = new FoursomeModel({
        players: [player],
        timeSlot: 'morning',
        position: 1
      });

      const schedule = new ScheduleModel({
        weekId: 'test-week',
        timeSlots: { morning: [foursome], afternoon: [] }
      });

      // Create invalid export data (wrong week ID)
      const invalidExportData = [{
        weekId: 'wrong-week',
        timeSlot: '10:30 AM',
        foursomeNumber: 1,
        playerName: 'John Doe',
        handedness: 'right',
        timePreference: 'AM',
        position: 1
      }];

      const isValid = exportService.validateExportData(schedule, invalidExportData);
      expect(isValid).toBe(false);
    });

    it('should not have exportToExcel method', () => {
      // Verify that the exportToExcel method has been removed
      expect((exportService as any).exportToExcel).toBeUndefined();
    });

    it('should not have exportPlayersToExcel method', () => {
      // Verify that the exportPlayersToExcel method has been removed
      expect((exportService as any).exportPlayersToExcel).toBeUndefined();
    });

    it('should reject excel format in exportSchedule', async () => {
      const player = new PlayerModel({
        firstName: 'John',
        lastName: 'Doe',
        handedness: 'right',
        timePreference: 'AM',
        seasonId: 'test-season'
      });

      const foursome = new FoursomeModel({
        players: [player],
        timeSlot: 'morning',
        position: 1
      });

      const schedule = new ScheduleModel({
        weekId: 'test-week',
        timeSlots: { morning: [foursome], afternoon: [] }
      });

      // Attempt to export with excel format should fail
      const result = await exportService.exportSchedule(schedule, { format: 'excel' as any });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported export format');
    });
  });
});