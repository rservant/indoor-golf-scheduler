import { ExportService, ExportFormat, ExportOptions, ExportResult } from './ExportService';
import { PlayerInfo, Handedness, TimePreference } from '../models/Player';
import { PlayerManager } from './PlayerManager';
import { SeasonManager } from './SeasonManager';
import { Schedule } from '../models/Schedule';
import * as XLSX from 'xlsx';
import * as Papa from 'papaparse';

export interface ImportResult {
  success: boolean;
  importedCount: number;
  skippedCount: number;
  errors: ImportError[];
  warnings: ImportWarning[];
}

export interface ImportError {
  row: number;
  field?: string;
  message: string;
  data?: any;
}

export interface ImportWarning {
  row: number;
  message: string;
  data?: any;
}

export interface PlayerImportData {
  firstName: string;
  lastName: string;
  handedness: string;
  timePreference: string;
}

export interface BulkPlayerOperation {
  operation: 'add' | 'update' | 'remove';
  playerId?: string;
  playerData?: PlayerInfo;
}

export interface BulkOperationResult {
  success: boolean;
  successCount: number;
  failureCount: number;
  errors: BulkOperationError[];
}

export interface BulkOperationError {
  operation: BulkPlayerOperation;
  error: string;
}

export type ImportFormat = 'csv' | 'excel';

export class ImportExportService extends ExportService {
  constructor(
    private playerManager: PlayerManager,
    private seasonManager: SeasonManager
  ) {
    super();
  }

  /**
   * Import player data from CSV or Excel file
   */
  async importPlayers(fileData: string | Buffer, format: ImportFormat): Promise<ImportResult> {
    try {
      const playerData = await this.parseImportFile(fileData, format);
      return await this.processPlayerImport(playerData);
    } catch (error) {
      return {
        success: false,
        importedCount: 0,
        skippedCount: 0,
        errors: [{
          row: 0,
          message: error instanceof Error ? error.message : 'Unknown import error'
        }],
        warnings: []
      };
    }
  }

  /**
   * Parse import file based on format
   */
  private async parseImportFile(fileData: string | Buffer, format: ImportFormat): Promise<PlayerImportData[]> {
    switch (format) {
      case 'csv':
        return this.parseCSVFile(fileData as string);
      case 'excel':
        return this.parseExcelFile(fileData as Buffer);
      default:
        throw new Error(`Unsupported import format: ${format}`);
    }
  }

  /**
   * Parse CSV file for player data
   */
  private parseCSVFile(csvData: string): PlayerImportData[] {
    const parseResult = Papa.parse(csvData, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim().toLowerCase()
    });

    if (parseResult.errors.length > 0) {
      throw new Error(`CSV parsing error: ${parseResult.errors[0].message}`);
    }

    return parseResult.data.map((row: any) => ({
      firstName: row['first name'] || row['firstname'] || row['first_name'] || '',
      lastName: row['last name'] || row['lastname'] || row['last_name'] || '',
      handedness: row['handedness'] || row['hand'] || '',
      timePreference: row['time preference'] || row['timepreference'] || row['time_preference'] || row['preference'] || ''
    }));
  }

  /**
   * Parse Excel file for player data
   */
  private parseExcelFile(excelData: Buffer): PlayerImportData[] {
    const workbook = XLSX.read(excelData, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    
    if (!sheetName) {
      throw new Error('Excel file contains no worksheets');
    }

    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    if (jsonData.length < 2) {
      throw new Error('Excel file must contain at least a header row and one data row');
    }

    // Get headers and normalize them
    const headers = (jsonData[0] as string[]).map(h => h.toString().trim().toLowerCase());
    const dataRows = jsonData.slice(1) as any[][];

    // Find column indices
    const firstNameIndex = this.findColumnIndex(headers, ['first name', 'firstname', 'first_name']);
    const lastNameIndex = this.findColumnIndex(headers, ['last name', 'lastname', 'last_name']);
    const handednessIndex = this.findColumnIndex(headers, ['handedness', 'hand']);
    const timePreferenceIndex = this.findColumnIndex(headers, ['time preference', 'timepreference', 'time_preference', 'preference']);

    if (firstNameIndex === -1 || lastNameIndex === -1 || handednessIndex === -1 || timePreferenceIndex === -1) {
      throw new Error('Excel file must contain columns for: First Name, Last Name, Handedness, and Time Preference');
    }

    return dataRows.map((row: any[]) => ({
      firstName: row[firstNameIndex]?.toString().trim() || '',
      lastName: row[lastNameIndex]?.toString().trim() || '',
      handedness: row[handednessIndex]?.toString().trim() || '',
      timePreference: row[timePreferenceIndex]?.toString().trim() || ''
    }));
  }

  /**
   * Find column index by possible header names
   */
  private findColumnIndex(headers: string[], possibleNames: string[]): number {
    for (const name of possibleNames) {
      const index = headers.indexOf(name);
      if (index !== -1) {
        return index;
      }
    }
    return -1;
  }

  /**
   * Process imported player data and add to current season
   */
  private async processPlayerImport(playerData: PlayerImportData[]): Promise<ImportResult> {
    const result: ImportResult = {
      success: true,
      importedCount: 0,
      skippedCount: 0,
      errors: [],
      warnings: []
    };

    // Verify active season exists
    const activeSeason = await this.seasonManager.getActiveSeason();
    if (!activeSeason) {
      result.success = false;
      result.errors.push({
        row: 0,
        message: 'No active season found. Please create and activate a season before importing players.'
      });
      return result;
    }

    for (let i = 0; i < playerData.length; i++) {
      const rowNumber = i + 2; // Account for header row and 0-based index
      const playerRow = playerData[i];

      try {
        // Validate and normalize player data
        const validatedPlayer = this.validateAndNormalizePlayerData(playerRow, rowNumber, result);
        
        if (!validatedPlayer) {
          result.skippedCount++;
          continue;
        }

        // Check for duplicate in current season
        const existingPlayers = await this.playerManager.getAllPlayers(activeSeason.id);
        const isDuplicate = existingPlayers.some(p => 
          p.firstName.toLowerCase() === validatedPlayer.firstName.toLowerCase() &&
          p.lastName.toLowerCase() === validatedPlayer.lastName.toLowerCase()
        );

        if (isDuplicate) {
          result.warnings.push({
            row: rowNumber,
            message: `Player "${validatedPlayer.firstName} ${validatedPlayer.lastName}" already exists in current season - skipped`,
            data: validatedPlayer
          });
          result.skippedCount++;
          continue;
        }

        // Add player to current season
        await this.playerManager.addPlayer(validatedPlayer);
        result.importedCount++;

      } catch (error) {
        result.errors.push({
          row: rowNumber,
          message: error instanceof Error ? error.message : 'Unknown error adding player',
          data: playerRow
        });
        result.skippedCount++;
      }
    }

    // Set overall success based on whether any players were imported
    result.success = result.importedCount > 0 || (result.errors.length === 0 && result.skippedCount === playerData.length);

    return result;
  }

  /**
   * Validate and normalize imported player data
   */
  private validateAndNormalizePlayerData(
    playerRow: PlayerImportData, 
    rowNumber: number, 
    result: ImportResult
  ): PlayerInfo | null {
    const errors: string[] = [];

    // Validate first name
    if (!playerRow.firstName || playerRow.firstName.trim().length === 0) {
      errors.push('First name is required');
    } else if (playerRow.firstName.trim().length > 50) {
      errors.push('First name cannot exceed 50 characters');
    }

    // Validate last name
    if (!playerRow.lastName || playerRow.lastName.trim().length === 0) {
      errors.push('Last name is required');
    } else if (playerRow.lastName.trim().length > 50) {
      errors.push('Last name cannot exceed 50 characters');
    }

    // Validate and normalize handedness
    let handedness: Handedness;
    const handednessLower = playerRow.handedness.toLowerCase().trim();
    if (handednessLower === 'left' || handednessLower === 'l') {
      handedness = 'left';
    } else if (handednessLower === 'right' || handednessLower === 'r') {
      handedness = 'right';
    } else {
      errors.push('Handedness must be "left", "right", "L", or "R"');
      handedness = 'right'; // Default fallback
    }

    // Validate and normalize time preference
    let timePreference: TimePreference;
    const preferenceLower = playerRow.timePreference.toLowerCase().trim();
    if (preferenceLower === 'am' || preferenceLower === 'morning') {
      timePreference = 'AM';
    } else if (preferenceLower === 'pm' || preferenceLower === 'afternoon') {
      timePreference = 'PM';
    } else if (preferenceLower === 'either' || preferenceLower === 'both' || preferenceLower === 'any') {
      timePreference = 'Either';
    } else {
      errors.push('Time preference must be "AM", "PM", "Either", "morning", "afternoon", "both", or "any"');
      timePreference = 'Either'; // Default fallback
    }

    // Record errors if any
    if (errors.length > 0) {
      result.errors.push({
        row: rowNumber,
        message: errors.join('; '),
        data: playerRow
      });
      return null;
    }

    return {
      firstName: playerRow.firstName.trim(),
      lastName: playerRow.lastName.trim(),
      handedness,
      timePreference
    };
  }

  /**
   * Perform bulk player operations
   */
  async performBulkPlayerOperations(operations: BulkPlayerOperation[]): Promise<BulkOperationResult> {
    const result: BulkOperationResult = {
      success: true,
      successCount: 0,
      failureCount: 0,
      errors: []
    };

    for (const operation of operations) {
      try {
        switch (operation.operation) {
          case 'add':
            if (!operation.playerData) {
              throw new Error('Player data is required for add operation');
            }
            await this.playerManager.addPlayer(operation.playerData);
            result.successCount++;
            break;

          case 'update':
            if (!operation.playerId || !operation.playerData) {
              throw new Error('Player ID and player data are required for update operation');
            }
            await this.playerManager.updatePlayer(operation.playerId, operation.playerData);
            result.successCount++;
            break;

          case 'remove':
            if (!operation.playerId) {
              throw new Error('Player ID is required for remove operation');
            }
            await this.playerManager.removePlayer(operation.playerId);
            result.successCount++;
            break;

          default:
            throw new Error(`Unknown operation: ${operation.operation}`);
        }
      } catch (error) {
        result.errors.push({
          operation,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        result.failureCount++;
      }
    }

    result.success = result.failureCount === 0;
    return result;
  }

  /**
   * Export schedule in multiple formats with enhanced options
   */
  async exportScheduleEnhanced(
    schedule: Schedule, 
    format: ExportFormat, 
    options: Omit<ExportOptions, 'format'> = {}
  ): Promise<ExportResult> {
    // Use the parent class method but with enhanced validation
    const result = await this.exportSchedule(schedule, { ...options, format });
    
    if (result.success && result.data) {
      // Additional validation for enhanced export
      const exportData = (this as any).prepareScheduleData(schedule);
      const isValid = this.validateExportData(schedule, exportData);
      
      if (!isValid) {
        return {
          success: false,
          filename: result.filename,
          mimeType: result.mimeType,
          error: 'Export data validation failed - exported data does not match schedule'
        };
      }
    }

    return result;
  }

  /**
   * Generate import template file
   */
  generateImportTemplate(format: ImportFormat): ExportResult {
    const templateData = [
      {
        'First Name': 'John',
        'Last Name': 'Doe',
        'Handedness': 'right',
        'Time Preference': 'AM'
      },
      {
        'First Name': 'Jane',
        'Last Name': 'Smith',
        'Handedness': 'left',
        'Time Preference': 'PM'
      },
      {
        'First Name': 'Bob',
        'Last Name': 'Johnson',
        'Handedness': 'right',
        'Time Preference': 'Either'
      }
    ];

    try {
      switch (format) {
        case 'csv':
          const csv = Papa.unparse(templateData);
          return {
            success: true,
            data: csv,
            filename: 'player_import_template.csv',
            mimeType: 'text/csv'
          };

        case 'excel':
          const workbook = XLSX.utils.book_new();
          const worksheet = XLSX.utils.json_to_sheet(templateData);
          
          // Set column widths
          worksheet['!cols'] = [
            { wch: 15 }, // First Name
            { wch: 15 }, // Last Name
            { wch: 12 }, // Handedness
            { wch: 15 }  // Time Preference
          ];

          XLSX.utils.book_append_sheet(workbook, worksheet, 'Players');
          const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

          return {
            success: true,
            data: excelBuffer,
            filename: 'player_import_template.xlsx',
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          };

        default:
          throw new Error(`Unsupported template format: ${format}`);
      }
    } catch (error) {
      return {
        success: false,
        filename: '',
        mimeType: '',
        error: error instanceof Error ? error.message : 'Unknown template generation error'
      };
    }
  }

  /**
   * Validate import file structure before processing
   */
  validateImportFile(fileData: string | Buffer, format: ImportFormat): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      const playerData = format === 'csv' 
        ? this.parseCSVFile(fileData as string)
        : this.parseExcelFile(fileData as Buffer);

      if (playerData.length === 0) {
        errors.push('Import file contains no data rows');
      }

      // Check for required columns by examining first row
      if (playerData.length > 0) {
        const firstRow = playerData[0];
        if (!firstRow.firstName && !firstRow.lastName && !firstRow.handedness && !firstRow.timePreference) {
          errors.push('Import file does not contain required columns (First Name, Last Name, Handedness, Time Preference)');
        }
      }

    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown file validation error');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Export all application data (seasons, players, schedules)
   */
  async exportData(): Promise<{
    seasons: any[];
    players: any[];
    schedules: any[];
    weeks: any[];
  }> {
    try {
      // Get all seasons
      const seasons = await this.seasonManager.getAllSeasons();
      
      // Get all players
      const allPlayers: any[] = [];
      for (const season of seasons) {
        const seasonPlayers = await this.playerManager.getAllPlayers(season.id);
        allPlayers.push(...seasonPlayers);
      }

      // For now, return empty arrays for schedules and weeks
      // These could be implemented later if needed
      return {
        seasons,
        players: allPlayers,
        schedules: [],
        weeks: []
      };
    } catch (error) {
      throw new Error(`Failed to export data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}