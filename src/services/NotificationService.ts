import { Schedule } from '../models/Schedule';
import { Player } from '../models/Player';
import { TimeSlotConfig, DEFAULT_TIME_SLOTS } from '../models/Season';
import { escapeHtml } from '../utils/escapeHtml';

export class NotificationService {
    /**
     * Generate a formatted text summary of a schedule for email/SMS sharing
     */
    generateScheduleNotification(
        schedule: Schedule,
        weekLabel: string,
        timeSlotConfigs: TimeSlotConfig[] = DEFAULT_TIME_SLOTS
    ): string {
        const lines: string[] = [];
        lines.push(`⛳ Golf Schedule — ${weekLabel}`);
        lines.push('');

        const slots: Array<{ name: string; foursomes: typeof schedule.timeSlots.morning }> = [
            { name: 'morning', foursomes: schedule.timeSlots.morning },
            { name: 'afternoon', foursomes: schedule.timeSlots.afternoon }
        ];

        for (const slot of slots) {
            if (slot.foursomes.length === 0) continue;

            const config = timeSlotConfigs.find(c => c.name === slot.name);
            const label = config?.label || slot.name;

            lines.push(`📋 ${label}`);
            for (let i = 0; i < slot.foursomes.length; i++) {
                const f = slot.foursomes[i];
                const names = f.players.map(p => `${p.firstName} ${p.lastName}`).join(', ');
                lines.push(`  Group ${i + 1}: ${names}`);
            }
            lines.push('');
        }

        const totalPlayers = schedule.timeSlots.morning.reduce((s, f) => s + f.players.length, 0)
            + schedule.timeSlots.afternoon.reduce((s, f) => s + f.players.length, 0);
        lines.push(`Total players: ${totalPlayers}`);

        return lines.join('\n');
    }

    /**
     * Generate an HTML version of the schedule for rich-text email
     */
    generateScheduleHTML(
        schedule: Schedule,
        weekLabel: string,
        timeSlotConfigs: TimeSlotConfig[] = DEFAULT_TIME_SLOTS
    ): string {
        let html = `<h2>⛳ Golf Schedule — ${escapeHtml(weekLabel)}</h2>`;

        const slots = [
            { name: 'morning', foursomes: schedule.timeSlots.morning },
            { name: 'afternoon', foursomes: schedule.timeSlots.afternoon }
        ];

        for (const slot of slots) {
            if (slot.foursomes.length === 0) continue;
            const config = timeSlotConfigs.find(c => c.name === slot.name);
            const label = config?.label || slot.name;

            html += `<h3>📋 ${escapeHtml(label)}</h3><ul>`;
            for (let i = 0; i < slot.foursomes.length; i++) {
                const f = slot.foursomes[i];
                const names = f.players.map(p => `${escapeHtml(p.firstName)} ${escapeHtml(p.lastName)}`).join(', ');
                html += `<li><strong>Group ${i + 1}:</strong> ${names}</li>`;
            }
            html += '</ul>';
        }

        return html;
    }

    /**
     * Generate a mailto: link for one-click emailing the schedule
     */
    generateMailtoLink(email: string, subject: string, body: string): string {
        const encodedSubject = encodeURIComponent(subject);
        const encodedBody = encodeURIComponent(body);
        return `mailto:${encodeURIComponent(email)}?subject=${encodedSubject}&body=${encodedBody}`;
    }

    /**
     * Generate mailto links for all players with email addresses
     */
    generateBulkMailtoLinks(
        players: Player[],
        schedule: Schedule,
        weekLabel: string,
        timeSlotConfigs: TimeSlotConfig[] = DEFAULT_TIME_SLOTS
    ): Array<{ playerName: string; email: string; mailtoLink: string }> {
        const body = this.generateScheduleNotification(schedule, weekLabel, timeSlotConfigs);
        const subject = `Golf Schedule — ${weekLabel}`;

        return players
            .filter(p => p.email)
            .map(p => ({
                playerName: `${p.firstName} ${p.lastName}`,
                email: p.email!,
                mailtoLink: this.generateMailtoLink(p.email!, subject, body)
            }));
    }
}
