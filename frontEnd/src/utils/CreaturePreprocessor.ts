/**
 * ============================================
 * CREATURE PREPROCESSOR - React Native CLI
 * ============================================
 *
 * Image preprocessing for MobileNetV2 CNN inference.
 * Works with React Native CLI using react-native-image-resizer.
 *
 * DEPENDENCIES:
 * - react-native-image-resizer (already installed)
 * - react-native-fs (already installed)
 */

import ImageResizer from 'react-native-image-resizer';
import { Image } from 'react-native';

// ============================================
// TYPES
// ============================================
export interface PreprocessConfig {
    targetWidth: number;
    targetHeight: number;
    quality: number;
    outputFormat: 'JPEG' | 'PNG';
}

export interface PreprocessResult {
    uri: string;
    width: number;
    height: number;
    processingTimeMs: number;
}

// ============================================
// DEFAULT CONFIG
// ============================================
const DEFAULT_CONFIG: PreprocessConfig = {
    targetWidth: 224,
    targetHeight: 224,
    quality: 95,
    outputFormat: 'JPEG',
};

// ============================================
// CREATURE PREPROCESSOR CLASS
// ============================================
class CreaturePreprocessor {
    private config: PreprocessConfig;

    constructor(config: Partial<PreprocessConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * ========================================
     * MAIN PREPROCESSING PIPELINE
     * ========================================
     *
     * Pipeline steps (mirrors Python implementation):
     * 1. Load image
     * 2. Resize to 224x224 (cover mode)
     * 3. Compress with high quality
     *
     * @param imageUri - File URI (file://, content://, etc.)
     * @returns Processed image result
     */
    async preprocess(imageUri: string): Promise<PreprocessResult> {
        const startTime = Date.now();

        try {
            // Validate input
            if (!imageUri) {
                throw new Error('Image URI is required');
            }

            // Get original image dimensions (optional, for logging)
            const originalSize = await this.getImageSize(imageUri);
            console.log(`Original size: ${originalSize.width}x${originalSize.height}`);

            // Apply preprocessing using react-native-image-resizer
            const result = await ImageResizer.createResizedImage(
                imageUri,
                this.config.targetWidth,
                this.config.targetHeight,
                this.config.outputFormat,
                this.config.quality,
                0, // rotation
                undefined, // outputPath (uses cache)
                false, // keepMeta
                { mode: 'cover', onlyScaleDown: false }
            );

            const processingTimeMs = Date.now() - startTime;

            console.log(`Preprocessing complete in ${processingTimeMs}ms`);
            console.log(`Output size: ${result.width}x${result.height}`);

            return {
                uri: result.uri,
                width: result.width,
                height: result.height,
                processingTimeMs,
            };
        } catch (error) {
            console.error('Preprocessing error:', error);
            throw error;
        }
    }

    /**
     * ========================================
     * GET IMAGE SIZE
     * ========================================
     */
    private getImageSize(uri: string): Promise<{ width: number; height: number }> {
        return new Promise((resolve, reject) => {
            Image.getSize(
                uri,
                (width, height) => resolve({ width, height }),
                (error) => reject(error)
            );
        });
    }

    /**
     * ========================================
     * UPDATE CONFIG
     * ========================================
     */
    setConfig(config: Partial<PreprocessConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * ========================================
     * GET CONFIG
     * ========================================
     */
    getConfig(): PreprocessConfig {
        return { ...this.config };
    }
}

export default CreaturePreprocessor;


// ============================================
// SIMPLE HELPER FUNCTIONS
// ============================================

/**
 * Quick preprocess function (no class needed)
 */
export async function preprocessImage(
    imageUri: string,
    width: number = 224,
    height: number = 224
): Promise<PreprocessResult> {
    const startTime = Date.now();

    const result = await ImageResizer.createResizedImage(
        imageUri,
        width,
        height,
        'JPEG',
        95,
        0,
        undefined,
        false,
        { mode: 'cover', onlyScaleDown: false }
    );

    return {
        uri: result.uri,
        width: result.width,
        height: result.height,
        processingTimeMs: Date.now() - startTime,
    };
}

/**
 * Validate image URI
 */
export function isValidImageUri(uri: string): boolean {
    if (!uri || typeof uri !== 'string') return false;

    const validPrefixes = [
        'file://',
        'content://',
        'ph://',           // iOS Photos
        'assets-library://', // iOS legacy
        'http://',
        'https://',
    ];

    return validPrefixes.some(prefix => uri.toLowerCase().startsWith(prefix));
}


// ============================================
// USAGE EXAMPLES
// ============================================
/*

// ========================================
// EXAMPLE 1: Basic Usage
// ========================================

import CreaturePreprocessor, { preprocessImage } from './CreaturePreprocessor';

// Quick function
const result = await preprocessImage(photoUri);
console.log('Processed URI:', result.uri);

// Or using class
const preprocessor = new CreaturePreprocessor({
    targetWidth: 224,
    targetHeight: 224,
});
const result = await preprocessor.preprocess(photoUri);


// ========================================
// EXAMPLE 2: Integration with ScanScreen
// ========================================

import { preprocessImage } from '../utils/CreaturePreprocessor';

const handlePhotoTaken = async (uri: string) => {
    try {
        const processed = await preprocessImage(uri, 224, 224);
        console.log('Processed:', processed.uri);
        // Use processed.uri with your model...
    } catch (error) {
        console.error('Failed to process image:', error);
    }
};

*/
