import { Schedule } from '../models/Schedule';
import { Player } from '../models/Player';
import * as XLSX from 'xlsx';
import * as Papa from 'papaparse';

export type ExportFormat = 'csv' | 'excel' | 'pdf';

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
        case 'excel':
          return this.exportToExcel(exportData, options, schedule.weekId);
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
      row.foursomeNumber.toString(),
      row.playerName,
      row.handedness,
      row.timePreference,
      row.position.toString()
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
   * Export to Excel format
   */
  private exportToExcel(data: ScheduleExportData[], _options: ExportOptions, weekId: string): ExportResult {
    const workbook = XLSX.utils.book_new();
    
    // Create worksheet data
    const worksheetData = [
      ['Week ID', 'Time Slot', 'Foursome', 'Player Name', 'Handedness', 'Time Preference', 'Position'],
      ...data.map(row => [
        row.weekId,
        row.timeSlot,
        row.foursomeNumber,
        row.playerName,
        row.handedness,
        row.timePreference,
        row.position
      ])
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    
    // Set column widths
    worksheet['!cols'] = [
      { wch: 15 }, // Week ID
      { wch: 12 }, // Time Slot
      { wch: 10 }, // Foursome
      { wch: 20 }, // Player Name
      { wch: 12 }, // Handedness
      { wch: 15 }, // Time Preference
      { wch: 10 }  // Position
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Schedule');

    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    return {
      success: true,
      data: excelBuffer,
      filename: `schedule_${weekId}.xlsx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
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
}