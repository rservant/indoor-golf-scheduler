import { TimeSlotConfig, DEFAULT_TIME_SLOTS } from '../models/Season';

export interface SeasonTemplate {
    id: string;
    name: string;
    description: string;
    weekCount: number;
    timeSlotConfigs: TimeSlotConfig[];
    createdAt: Date;
}

export class SeasonTemplateService {
    private storageKey = 'golf_scheduler_templates';

    private getStorageData(): SeasonTemplate[] {
        try {
            const data = localStorage.getItem(this.storageKey);
            if (!data) return [];
            return JSON.parse(data).map((t: any) => ({
                ...t,
                createdAt: new Date(t.createdAt)
            }));
        } catch {
            return [];
        }
    }

    private setStorageData(templates: SeasonTemplate[]): void {
        localStorage.setItem(this.storageKey, JSON.stringify(templates));
    }

    /**
     * Create a reusable template from a season's configuration
     */
    async createTemplate(
        name: string,
        description: string,
        weekCount: number,
        timeSlotConfigs: TimeSlotConfig[] = DEFAULT_TIME_SLOTS
    ): Promise<SeasonTemplate> {
        const templates = this.getStorageData();

        const template: SeasonTemplate = {
            id: `template-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name,
            description,
            weekCount,
            timeSlotConfigs,
            createdAt: new Date()
        };

        templates.push(template);
        this.setStorageData(templates);
        return template;
    }

    /**
     * List all available templates
     */
    async listTemplates(): Promise<SeasonTemplate[]> {
        return this.getStorageData().sort((a, b) =>
            b.createdAt.getTime() - a.createdAt.getTime()
        );
    }

    /**
     * Get a specific template by ID
     */
    async getTemplate(templateId: string): Promise<SeasonTemplate | null> {
        const templates = this.getStorageData();
        return templates.find(t => t.id === templateId) ?? null;
    }

    /**
     * Delete a template
     */
    async deleteTemplate(templateId: string): Promise<boolean> {
        const templates = this.getStorageData();
        const idx = templates.findIndex(t => t.id === templateId);
        if (idx === -1) return false;
        templates.splice(idx, 1);
        this.setStorageData(templates);
        return true;
    }

    /**
     * Get the configuration for applying a template to create a new season
     * Returns the data needed by SeasonManager.createSeason()
     */
    async getTemplateConfig(templateId: string): Promise<{
        weekCount: number;
        timeSlotConfigs: TimeSlotConfig[];
    } | null> {
        const template = await this.getTemplate(templateId);
        if (!template) return null;
        return {
            weekCount: template.weekCount,
            timeSlotConfigs: template.timeSlotConfigs
        };
    }
}
