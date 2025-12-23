import { ImportExportService, BulkPlayerOperation } from './ImportExportService';
import { InMemoryPlayerManager } from './PlayerManager';
import { InMemorySeasonManager } from './SeasonManager';
import { ScheduleModel } from '../models/Schedule';
import { FoursomeModel } from '../models/Foursome';
import { PlayerModel } from '../models/Player';
import * as XLSX from 'xlsx';

describe('ImportExportService', () => {
  let importExportService: ImportExportService;
  let playerManager: InMemoryPlayerManager;
  let seasonManager: InMemorySeasonManager;

  beforeEach(async () => {
    seasonManager = new InMemorySeasonManager();
    playerManager = new InMemoryPlayerManager();
    importExportService = new ImportExportService(playerManager, seasonManager);

    // Create and activate a test season
    const season = await seasonManager.createSeason('Test Season', new Date('2024-01-01'), new Date('2024-12-31'));
    await seasonManager.setActiveSeason(season.id);
    playerManager.setActiveSeasonId(season.id);
  });

  describe('Player Import', () => {
    it('should import players from CSV format', async () => {
      const csvData = `First Name,Last Name,Handedness,Time Preference
John,Doe,right,AM
Jane,Smith,left,PM
Bob,Johnson,right,Either`;

      const result = await importExportService.importPlayers(csvData, 'csv');

      expect(result.success).toBe(true);
      expect(result.importedCount).toBe(3);
      expect(result.skippedCount).toBe(0);
      expect(result.errors).toHaveLength(0);

      // Verify players were added
      const activeSeason = await seasonManager.getActiveSeason();
      const players = await playerManager.getAllPlayers(activeSeason!.id);
      expect(players).toHaveLength(3);
      
      const johnDoe = players.find(p => p.firstName === 'John' && p.lastName === 'Doe');
      expect(johnDoe).toBeDefined();
      expect(johnDoe!.handedness).toBe('right');
      expect(johnDoe!.timePreference).toBe('AM');
    });

    it('should import players from Excel format', async () => {
      // Create Excel workbook
      const workbook = XLSX.utils.book_new();
      const worksheetData = [
        ['First Name', 'Last Name', 'Handedness', 'Time Preference'],
        ['Alice', 'Brown', 'left', 'AM'],
        ['Charlie', 'Davis', 'right', 'PM']
      ];
      const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Players');
      const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      const result = await importExportService.importPlayers(excelBuffer, 'excel');

      expect(result.success).toBe(true);
      expect(result.importedCount).toBe(2);
      expect(result.skippedCount).toBe(0);
      expect(result.errors).toHaveLength(0);

      // Verify players were added
      const activeSeason = await seasonManager.getActiveSeason();
      const players = await playerManager.getAllPlayers(activeSeason!.id);
      expect(players).toHaveLength(2);
    });

    it('should handle duplicate players gracefully', async () => {
      // Add a player first
      await playerManager.addPlayer({
        firstName: 'John',
        lastName: 'Doe',
        handedness: 'right',
        timePreference: 'AM'
      });

      const csvData = `First Name,Last Name,Handedness,Time Preference
John,Doe,right,AM
Jane,Smith,left,PM`;

      const result = await importExportService.importPlayers(csvData, 'csv');

      expect(result.success).toBe(true);
      expect(result.importedCount).toBe(1); // Only Jane should be imported
      expect(result.skippedCount).toBe(1); // John should be skipped
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].message).toContain('already exists');
    });

    it('should validate player data and report errors', async () => {
      const csvData = `First Name,Last Name,Handedness,Time Preference
,Doe,right,AM
Jane,,left,PM
Bob,Johnson,invalid,Either
Alice,Smith,right,invalid`;

      const result = await importExportService.importPlayers(csvData, 'csv');

      expect(result.success).toBe(false);
      expect(result.importedCount).toBe(0);
      expect(result.skippedCount).toBe(4);
      expect(result.errors).toHaveLength(4);
      
      // Check specific error messages
      expect(result.errors[0].message).toContain('First name is required');
      expect(result.errors[1].message).toContain('Last name is required');
      expect(result.errors[2].message).toContain('Handedness must be');
      expect(result.errors[3].message).toContain('Time preference must be');
    });

    it('should normalize handedness and time preference values', async () => {
      const csvData = `First Name,Last Name,Handedness,Time Preference
John,Doe,L,morning
Jane,Smith,R,afternoon
Bob,Johnson,left,both`;

      const result = await importExportService.importPlayers(csvData, 'csv');

      expect(result.success).toBe(true);
      expect(result.importedCount).toBe(3);

      const activeSeason = await seasonManager.getActiveSeason();
      const players = await playerManager.getAllPlayers(activeSeason!.id);
      
      const john = players.find(p => p.firstName === 'John');
      expect(john!.handedness).toBe('left');
      expect(john!.timePreference).toBe('AM');

      const jane = players.find(p => p.firstName === 'Jane');
      expect(jane!.handedness).toBe('right');
      expect(jane!.timePreference).toBe('PM');

      const bob = players.find(p => p.firstName === 'Bob');
      expect(bob!.timePreference).toBe('Either');
    });

    it('should handle missing active season', async () => {
      // Create service without active season
      const emptySeasonManager = new InMemorySeasonManager();
      const emptyPlayerManager = new InMemoryPlayerManager();
      const service = new ImportExportService(emptyPlayerManager, emptySeasonManager);

      const csvData = `First Name,Last Name,Handedness,Time Preference
John,Doe,right,AM`;

      const result = await service.importPlayers(csvData, 'csv');

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('No active season found');
    });
  });

  describe('Bulk Player Operations', () => {
    it('should perform bulk add operations', async () => {
      const operations: BulkPlayerOperation[] = [
        {
          operation: 'add',
          playerData: { firstName: 'John', lastName: 'Doe', handedness: 'right', timePreference: 'AM' }
        },
        {
          operation: 'add',
          playerData: { firstName: 'Jane', lastName: 'Smith', handedness: 'left', timePreference: 'PM' }
        }
      ];

      const result = await importExportService.performBulkPlayerOperations(operations);

      expect(result.success).toBe(true);
      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(0);
      expect(result.errors).toHaveLength(0);

      const activeSeason = await seasonManager.getActiveSeason();
      const players = await playerManager.getAllPlayers(activeSeason!.id);
      expect(players).toHaveLength(2);
    });

    it('should perform bulk update operations', async () => {
      // Add a player first
      const player = await playerManager.addPlayer({
        firstName: 'John',
        lastName: 'Doe',
        handedness: 'right',
        timePreference: 'AM'
      });

      const operations: BulkPlayerOperation[] = [
        {
          operation: 'update',
          playerId: player.id,
          playerData: { firstName: 'John', lastName: 'Doe', handedness: 'right', timePreference: 'PM' }
        }
      ];

      const result = await importExportService.performBulkPlayerOperations(operations);

      expect(result.success).toBe(true);
      expect(result.successCount).toBe(1);

      const updatedPlayer = await playerManager.getPlayer(player.id);
      expect(updatedPlayer!.timePreference).toBe('PM');
    });

    it('should perform bulk remove operations', async () => {
      // Add a player first
      const player = await playerManager.addPlayer({
        firstName: 'John',
        lastName: 'Doe',
        handedness: 'right',
        timePreference: 'AM'
      });

      const operations: BulkPlayerOperation[] = [
        {
          operation: 'remove',
          playerId: player.id
        }
      ];

      const result = await importExportService.performBulkPlayerOperations(operations);

      expect(result.success).toBe(true);
      expect(result.successCount).toBe(1);

      const removedPlayer = await playerManager.getPlayer(player.id);
      expect(removedPlayer).toBeNull();
    });

    it('should handle mixed success and failure in bulk operations', async () => {
      const operations: BulkPlayerOperation[] = [
        {
          operation: 'add',
          playerData: { firstName: 'John', lastName: 'Doe', handedness: 'right', timePreference: 'AM' }
        },
        {
          operation: 'update',
          playerId: 'nonexistent-id',
          playerData: { firstName: 'Jane', lastName: 'Smith', handedness: 'left', timePreference: 'PM' }
        },
        {
          operation: 'remove',
          playerId: 'another-nonexistent-id'
        }
      ];

      const result = await importExportService.performBulkPlayerOperations(operations);

      expect(result.success).toBe(false);
      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(2);
      expect(result.errors).toHaveLength(2);
    });
  });

  describe('Enhanced Export', () => {
    it('should export schedule with enhanced validation', async () => {
      // Create a test schedule
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

      const result = await importExportService.exportScheduleEnhanced(schedule, 'csv');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.filename).toContain('test-week');
    });
  });

  describe('Import Template Generation', () => {
    it('should generate CSV import template', () => {
      const result = importExportService.generateImportTemplate('csv');

      expect(result.success).toBe(true);
      expect(result.filename).toBe('player_import_template.csv');
      expect(result.mimeType).toBe('text/csv');
      expect(result.data).toContain('First Name,Last Name,Handedness,Time Preference');
    });

    it('should generate Excel import template', () => {
      const result = importExportService.generateImportTemplate('excel');

      expect(result.success).toBe(true);
      expect(result.filename).toBe('player_import_template.xlsx');
      expect(result.mimeType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(result.data).toBeInstanceOf(Buffer);
    });
  });

  describe('Import File Validation', () => {
    it('should validate valid CSV file', () => {
      const csvData = `First Name,Last Name,Handedness,Time Preference
John,Doe,right,AM`;

      const result = importExportService.validateImportFile(csvData, 'csv');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect invalid CSV file', () => {
      const csvData = `Invalid,Headers
John,Doe`;

      const result = importExportService.validateImportFile(csvData, 'csv');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should detect empty file', () => {
      const csvData = `First Name,Last Name,Handedness,Time Preference`;

      const result = importExportService.validateImportFile(csvData, 'csv');

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('no data rows');
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed CSV data', async () => {
      const malformedCsv = `First Name,Last Name,Handedness
John,Doe,right,AM,extra,columns
Jane"Smith,left`;

      const result = await importExportService.importPlayers(malformedCsv, 'csv');

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle invalid Excel file', async () => {
      const invalidBuffer = Buffer.from('not an excel file');

      const result = await importExportService.importPlayers(invalidBuffer, 'excel');

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Excel file must contain at least a header row and one data row');
    });
  });
});