/**
 * Species Service
 *
 * Loads and provides access to species data from the bundled JSON file.
 * Maps model output indices to species information.
 */

import speciesData from '../model/species_data.json';

export interface SpeciesInfo {
    id: number;
    commonName: string;
    scientificName: string;
    description: string;
}

interface RawSpeciesData {
    id: number;
    common_name: string;
    scientific_name: string;
    description: string;
}

class SpeciesService {
    private species: Map<number, SpeciesInfo> = new Map();
    private isLoaded: boolean = false;

    constructor() {
        this.loadSpeciesData();
    }

    /**
     * Load species data from JSON
     */
    private loadSpeciesData(): void {
        try {
            const data = speciesData as RawSpeciesData[];

            data.forEach((item) => {
                this.species.set(item.id, {
                    id: item.id,
                    commonName: item.common_name,
                    scientificName: item.scientific_name,
                    description: item.description,
                });
            });

            this.isLoaded = true;
            console.log(`Loaded ${this.species.size} species`);
        } catch (error) {
            console.error('Failed to load species data:', error);
        }
    }

    /**
     * Get species info by ID (model output index)
     */
    getSpeciesById(id: number): SpeciesInfo | null {
        return this.species.get(id) || null;
    }

    /**
     * Get species from model prediction output
     * @param predictions Array of confidence scores from model
     * @returns Top prediction with species info
     */
    getTopPrediction(predictions: number[]): {
        species: SpeciesInfo;
        confidence: number;
        index: number;
    } | null {
        if (!predictions || predictions.length === 0) {
            return null;
        }

        // Find the index with highest confidence
        let maxIndex = 0;
        let maxConfidence = predictions[0];

        for (let i = 1; i < predictions.length; i++) {
            if (predictions[i] > maxConfidence) {
                maxConfidence = predictions[i];
                maxIndex = i;
            }
        }

        const species = this.getSpeciesById(maxIndex);
        if (!species) {
            return null;
        }

        return {
            species,
            confidence: maxConfidence,
            index: maxIndex,
        };
    }

    /**
     * Get top N predictions from model output
     */
    getTopNPredictions(predictions: number[], n: number = 5): Array<{
        species: SpeciesInfo;
        confidence: number;
        index: number;
    }> {
        if (!predictions || predictions.length === 0) {
            return [];
        }

        // Create array of {index, confidence} pairs
        const indexed = predictions.map((confidence, index) => ({
            index,
            confidence,
        }));

        // Sort by confidence descending
        indexed.sort((a, b) => b.confidence - a.confidence);

        // Get top N with species info
        const results: Array<{
            species: SpeciesInfo;
            confidence: number;
            index: number;
        }> = [];

        for (let i = 0; i < Math.min(n, indexed.length); i++) {
            const species = this.getSpeciesById(indexed[i].index);
            if (species) {
                results.push({
                    species,
                    confidence: indexed[i].confidence,
                    index: indexed[i].index,
                });
            }
        }

        return results;
    }

    /**
     * Get total number of species
     */
    getSpeciesCount(): number {
        return this.species.size;
    }

    /**
     * Check if data is loaded
     */
    isReady(): boolean {
        return this.isLoaded;
    }

    /**
     * Search species by name
     */
    searchByName(query: string): SpeciesInfo[] {
        const lowercaseQuery = query.toLowerCase();
        const results: SpeciesInfo[] = [];

        this.species.forEach((species) => {
            if (
                species.commonName.toLowerCase().includes(lowercaseQuery) ||
                species.scientificName.toLowerCase().includes(lowercaseQuery)
            ) {
                results.push(species);
            }
        });

        return results;
    }
}

// Export singleton instance
export const speciesService = new SpeciesService();
export default speciesService;
