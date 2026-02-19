import { Schedule } from '../models/Schedule';
import { TimeSlotConfig, DEFAULT_TIME_SLOTS } from '../models/Season';

export class CalendarExportService {
    /**
     * Export a week's schedule as iCalendar (.ics) content
     */
    exportToICal(
        weekSchedule: Schedule,
        weekDate: Date,
        seasonName: string,
        timeSlotConfigs: TimeSlotConfig[] = DEFAULT_TIME_SLOTS
    ): string {
        const lines: string[] = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Indoor Golf Scheduler//EN',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            `X-WR-CALNAME:${seasonName} - Golf Schedule`
        ];

        // Create an event for each time slot
        const allSlots: Array<{ name: string; foursomes: typeof weekSchedule.timeSlots.morning }> = [
            { name: 'morning', foursomes: weekSchedule.timeSlots.morning },
            { name: 'afternoon', foursomes: weekSchedule.timeSlots.afternoon }
        ];

        for (const slot of allSlots) {
            if (slot.foursomes.length === 0) continue;

            const config = timeSlotConfigs.find(c => c.name === slot.name);
            const timeStr = config?.time || (slot.name === 'morning' ? '10:30' : '13:00');
            const label = config?.label || (slot.name === 'morning' ? '10:30 AM' : '1:00 PM');

            const [hours, minutes] = timeStr.split(':').map(Number);
            const startDate = new Date(weekDate);
            startDate.setHours(hours, minutes, 0, 0);

            const endDate = new Date(startDate);
            endDate.setHours(startDate.getHours() + 2); // 2 hour sessions

            // Build player list for the description
            const playerList = slot.foursomes.map((f, i) => {
                const names = f.players.map(p => `${p.firstName} ${p.lastName}`).join(', ');
                return `Group ${i + 1}: ${names}`;
            }).join('\\n');

            const uid = `${weekSchedule.id}-${slot.name}@indoor-golf-scheduler`;

            lines.push('BEGIN:VEVENT');
            lines.push(`UID:${uid}`);
            lines.push(`DTSTART:${this.formatICalDate(startDate)}`);
            lines.push(`DTEND:${this.formatICalDate(endDate)}`);
            lines.push(`SUMMARY:Indoor Golf - ${label}`);
            lines.push(`DESCRIPTION:${playerList}`);
            lines.push(`DTSTAMP:${this.formatICalDate(new Date())}`);
            lines.push('END:VEVENT');
        }

        lines.push('END:VCALENDAR');
        return lines.join('\r\n');
    }

    /**
     * Trigger download of an iCal file
     */
    downloadICalFile(content: string, filename: string = 'golf-schedule.ics'): void {
        const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Format a Date as iCalendar date-time string (YYYYMMDDTHHmmss)
     */
    private formatICalDate(date: Date): string {
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
    }
}
