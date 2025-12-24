import { Schedule } from '../models/Schedule';
import { Player } from '../models/Player';
import * as Papa from 'papaparse';

export type ExportFormat = 'csv' | 'pdf';

export interface ExportOptions {
  format: ExportFormat;
  includeHandedness?: boolean;
  includeTimePreferences?: boolean;
  title?: string;
}

export interface ExportResult {
  success: boolean;
  data?: string | Buffer;
  filename: string;
  mimeType: string;
  error?: string;
}

export interface ScheduleExportData {
  weekId: string;
  timeSlot: string;
  foursomeNumber: number;
  playerName: string;
  handedness: string;
  timePreference: string;
  position: number;
}

export class ExportService {
  /**
   * Export a schedule in the specified format
   */
  async exportSchedule(schedule: Schedule, options: ExportOptions): Promise<ExportResult> {
    try {
      const exportData = this.prepareScheduleData(schedule);
      
      switch (options.format) {
        case 'csv':
          return this.exportToCSV(exportData, options, schedule.weekId);
        case 'pdf':
          return this.exportToPDF(exportData, options, schedule.weekId);
        default:
          throw new Error(`Unsupported export format: ${options.format}`);
      }
    } catch (error) {
      return {
        success: false,
        filename: '',
        mimeType: '',
        error: error instanceof Error ? error.message : 'Unknown export error'
      };
    }
  }

  /**
   * Prepare schedule data for export
   */
  private prepareScheduleData(schedule: Schedule): ScheduleExportData[] {
    const exportData: ScheduleExportData[] = [];

    // Process morning foursomes
    schedule.timeSlots.morning.forEach((foursome, foursomeIndex) => {
      foursome.players.forEach((player, playerIndex) => {
        exportData.push({
          weekId: schedule.weekId,
          timeSlot: '10:30 AM',
          foursomeNumber: foursomeIndex + 1,
          playerName: `${player.firstName} ${player.lastName}`,
          handedness: player.handedness,
          timePreference: player.timePreference,
          position: playerIndex + 1
        });
      });
    });

    // Process afternoon foursomes
    schedule.timeSlots.afternoon.forEach((foursome, foursomeIndex) => {
      foursome.players.forEach((player, playerIndex) => {
        exportData.push({
          weekId: schedule.weekId,
          timeSlot: '1:00 PM',
          foursomeNumber: foursomeIndex + 1,
          playerName: `${player.firstName} ${player.lastName}`,
          handedness: player.handedness,
          timePreference: player.timePreference,
          position: playerIndex + 1
        });
      });
    });

    return exportData;
  }

  /**
   * Export to CSV format
   */
  private exportToCSV(data: ScheduleExportData[], _options: ExportOptions, weekId: string): ExportResult {
    const headers = [
      'Week ID',
      'Time Slot',
      'Foursome',
      'Player Name',
      'Handedness',
      'Time Preference',
      'Position'
    ];

    const csvData = data.map(row => [
      row.weekId,
      row.timeSlot,
      (row.foursomeNumber || 0).toString(),
      row.playerName,
      row.handedness,
      row.timePreference,
      (row.position || 0).toString()
    ]);

    const csv = Papa.unparse({
      fields: headers,
      data: csvData
    });

    return {
      success: true,
      data: csv,
      filename: `schedule_${weekId}.csv`,
      mimeType: 'text/csv'
    };
  }

  /**
   * Export to PDF format (simplified text-based PDF)
   */
  private exportToPDF(data: ScheduleExportData[], options: ExportOptions, weekId: string): ExportResult {
    // For now, we'll create a simple text-based representation
    // In a real implementation, you'd use jsPDF or similar
    const title = options.title || `Golf Schedule - Week ${weekId}`;
    
    let pdfContent = `${title}\n`;
    pdfContent += '='.repeat(title.length) + '\n\n';

    // Group by time slot
    const morningPlayers = data.filter(d => d.timeSlot === '10:30 AM');
    const afternoonPlayers = data.filter(d => d.timeSlot === '1:00 PM');

    if (morningPlayers.length > 0) {
      pdfContent += '10:30 AM Time Slot\n';
      pdfContent += '-'.repeat(20) + '\n';
      
      const morningFoursomes = this.groupByFoursome(morningPlayers);
      morningFoursomes.forEach((foursome, index) => {
        pdfContent += `Foursome ${index + 1}:\n`;
        foursome.forEach(player => {
          pdfContent += `  - ${player.playerName} (${player.handedness}, ${player.timePreference})\n`;
        });
        pdfContent += '\n';
      });
    }

    if (afternoonPlayers.length > 0) {
      pdfContent += '1:00 PM Time Slot\n';
      pdfContent += '-'.repeat(20) + '\n';
      
      const afternoonFoursomes = this.groupByFoursome(afternoonPlayers);
      afternoonFoursomes.forEach((foursome, index) => {
        pdfContent += `Foursome ${index + 1}:\n`;
        foursome.forEach(player => {
          pdfContent += `  - ${player.playerName} (${player.handedness}, ${player.timePreference})\n`;
        });
        pdfContent += '\n';
      });
    }

    return {
      success: true,
      data: pdfContent,
      filename: `schedule_${weekId}.txt`,
      mimeType: 'text/plain'
    };
  }

  /**
   * Group export data by foursome number
   */
  private groupByFoursome(data: ScheduleExportData[]): ScheduleExportData[][] {
    const foursomes: { [key: number]: ScheduleExportData[] } = {};
    
    data.forEach(player => {
      if (!foursomes[player.foursomeNumber]) {
        foursomes[player.foursomeNumber] = [];
      }
      foursomes[player.foursomeNumber].push(player);
    });

    return Object.values(foursomes);
  }

  /**
   * Validate that exported data matches the original schedule
   */
  validateExportData(schedule: Schedule, exportData: ScheduleExportData[]): boolean {
    // Check that all players from the schedule are in the export data
    const exportPlayerNames = new Set(exportData.map(d => d.playerName));

    // Get all players from foursomes to compare names
    const allPlayersFromSchedule: Player[] = [];
    [...schedule.timeSlots.morning, ...schedule.timeSlots.afternoon].forEach(foursome => {
      allPlayersFromSchedule.push(...foursome.players);
    });

    const schedulePlayerNames = new Set(
      allPlayersFromSchedule.map(p => `${p.firstName} ${p.lastName}`)
    );

    // Check if all player names match
    if (schedulePlayerNames.size !== exportPlayerNames.size) {
      return false;
    }

    for (const name of schedulePlayerNames) {
      if (!exportPlayerNames.has(name)) {
        return false;
      }
    }

    // Check that week ID matches
    const uniqueWeekIds = new Set(exportData.map(d => d.weekId));
    if (uniqueWeekIds.size !== 1 || !uniqueWeekIds.has(schedule.weekId)) {
      return false;
    }

    return true;
  }

  /**
   * Export player data to CSV format
   */
  async exportPlayersToCSV(players: any[]): Promise<string> {
    const headers = ['First Name', 'Last Name', 'Handedness', 'Time Preference'];
    const csvData = players.map(player => [
      player.firstName,
      player.lastName,
      player.handedness,
      player.timePreference
    ]);

    return Papa.unparse({
      fields: headers,
      data: csvData
    });
  }

  /**
   * Export player data to PDF format
   */
  async exportPlayersToPDF(players: any[]): Promise<string> {
    // Simple text-based PDF representation
    let pdfContent = 'Player List\n\n';
    players.forEach(player => {
      pdfContent += `${player.firstName} ${player.lastName} - ${player.handedness} - ${player.timePreference}\n`;
    });
    return pdfContent;
  }
}