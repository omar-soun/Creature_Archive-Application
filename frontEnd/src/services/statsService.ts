import { LocalJournalEntry } from '../types/models';

export interface OverviewStats {
    totalObservations: number;
    uniqueSpecies: number;
    avgConfidence: number;
    fieldDays: number;
}

export interface ChartData {
    name: string;
    count: number;
    percentage: number;
    color: string;
}

export interface TrendData {
    month: string;
    count: number;
}

export interface TopSpecies {
    name: string;
    count: number;
    percentage: number;
}

// Color palette for charts
const COLORS = [
    '#1B4D3E', // Primary Dark
    '#059669', // Green
    '#34D399', // Light Green
    '#6EE7B7', // Teal
    '#A7F3D0', // Pale
    '#A7C4B8', // Orange
    '#F59E0B', // Amber
];

export class StatsService {
    /**
     * Calculate stats from local journal entries
     */
    calculateStats(entries: LocalJournalEntry[]) {
        try {
            return {
                overview: this.calculateOverview(entries),
                distribution: this.calculateDistribution(entries),
                trend: this.calculateTrend(entries),
                topSpecies: this.calculateTopSpecies(entries)
            };
        } catch (error) {
            console.error('Failed to calculate stats:', error);
            // Return empty default stats on error
            return {
                overview: { totalObservations: 0, uniqueSpecies: 0, avgConfidence: 0, fieldDays: 0 },
                distribution: [],
                trend: [],
                topSpecies: []
            };
        }
    }

    private calculateOverview(entries: LocalJournalEntry[]): OverviewStats {
        if (entries.length === 0) {
            return { totalObservations: 0, uniqueSpecies: 0, avgConfidence: 0, fieldDays: 0 };
        }

        const uniqueSpecies = new Set(entries.map(e => e.speciesName?.toLowerCase().trim())).size;
        const totalConfidence = entries.reduce((sum, e) => sum + (e.confidenceScore || 0), 0);

        // Calculate average confidence (0-1 scale -> percentage)
        // Check if confidence is 0-1 or 0-100. Assuming 0.0-1.0 based on types
        const avgConfidence = Math.round((totalConfidence / entries.length) * 100);

        // Calculate field days (unique dates)
        const dates = new Set(entries.map(e => {
            const date = new Date(e.capturedAt);
            return date.toDateString();
        }));

        return {
            totalObservations: entries.length,
            uniqueSpecies,
            avgConfidence,
            fieldDays: dates.size
        };
    }

    private calculateDistribution(entries: LocalJournalEntry[]): ChartData[] {
        if (entries.length === 0) return [];

        const total = entries.length;
        const counts: Record<string, number> = {};

        entries.forEach(e => {
            const cls = e.animalClass || 'Other';
            counts[cls] = (counts[cls] || 0) + 1;
        });

        return Object.keys(counts).map((cls, index) => ({
            name: cls,
            count: counts[cls],
            percentage: Math.round((counts[cls] / total) * 100),
            color: COLORS[index % COLORS.length]
        })).sort((a, b) => b.count - a.count);
    }

    private calculateTrend(entries: LocalJournalEntry[]): TrendData[] {
        // Last 6 months
        const months: Record<string, number> = {};
        const today = new Date();

        // Initialize last 6 months with 0
        for (let i = 5; i >= 0; i--) {
            const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
            const key = d.toLocaleString('default', { month: 'short' });
            months[key] = 0;
        }

        // Fill counts
        entries.forEach(e => {
            if (!e.capturedAt) return;
            const date = new Date(e.capturedAt);

            // Check if within last 6 months approx
            const diffTime = Math.abs(today.getTime() - date.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays < 185) { // Roughly 6 months
                const key = date.toLocaleString('default', { month: 'short' });
                if (months[key] !== undefined) {
                    months[key]++;
                }
            }
        });

        return Object.keys(months).map(m => ({ month: m, count: months[m] }));
    }

    private calculateTopSpecies(entries: LocalJournalEntry[]): TopSpecies[] {
        if (entries.length === 0) return [];

        const counts: Record<string, number> = {};
        entries.forEach(e => {
            const name = e.speciesName || 'Unknown';
            counts[name] = (counts[name] || 0) + 1;
        });

        const total = entries.length;

        return Object.entries(counts)
            .map(([name, count]) => ({
                name,
                count,
                percentage: Math.round((count / total) * 100)
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
    }
}

export default new StatsService();
