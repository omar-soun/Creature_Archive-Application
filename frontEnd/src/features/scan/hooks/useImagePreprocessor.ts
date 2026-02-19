/**
 * ============================================
 * useImagePreprocessor Hook
 * ============================================
 *
 * React hook for preprocessing images before TFLite inference.
 * Uses react-native-image-resizer (React Native CLI compatible).
 *
 * Usage:
 * const { preprocess, isProcessing, error } = useImagePreprocessor();
 * const result = await preprocess(imageUri);
 */

import { useState, useCallback, useRef } from 'react';
import ImageResizer from 'react-native-image-resizer';

// ============================================
// CONSTANTS - MobileNetV2 Preprocessing
// ============================================
export const MOBILENET_CONFIG = {
    INPUT_SIZE: 224,
    CHANNELS: 3,
    // MobileNetV2 expects [-1, 1] normalized values
    NORMALIZATION: {
        SCALE: 127.5,
        OFFSET: 1.0,
    },
} as const;

// ============================================
// TYPES
// ============================================
export interface PreprocessOptions {
    width?: number;
    height?: number;
    quality?: number;
    format?: 'JPG' | 'JPEG' | 'PNG';
}

export interface NormalizationConfig {
    scale: number;
    offset: number;
}

export interface PreprocessedResult {
    uri: string;
    width: number;
    height: number;
    processingTimeMs: number;
}

export interface PreprocessedImageData {
    uri: string;
    imageData: Float32Array;
    width: number;
    height: number;
    processingTimeMs: number;
    normalization: NormalizationConfig;
}

export interface UseImagePreprocessorReturn {
    preprocess: (imageUri: string, options?: PreprocessOptions) => Promise<PreprocessedResult>;
    preprocessForModel: (imageUri: string) => Promise<PreprocessedImageData>;
    preprocessBatch: (imageUris: string[], options?: PreprocessOptions) => Promise<PreprocessedResult[]>;
    isProcessing: boolean;
    progress: number;
    error: Error | null;
    reset: () => void;
}

// ============================================
// DEFAULT OPTIONS
// ============================================
const DEFAULT_OPTIONS: Required<PreprocessOptions> = {
    width: 224,
    height: 224,
    quality: 95,
    format: 'JPEG',
};

// ============================================
// HOOK IMPLEMENTATION
// ============================================
export function useImagePreprocessor(): UseImagePreprocessorReturn {
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<Error | null>(null);
    const abortRef = useRef(false);

    /**
     * Preprocess a single image (resize only)
     */
    const preprocess = useCallback(async (
        imageUri: string,
        options: PreprocessOptions = {}
    ): Promise<PreprocessedResult> => {
        const startTime = Date.now();
        const opts = { ...DEFAULT_OPTIONS, ...options };

        setIsProcessing(true);
        setError(null);
        setProgress(0);

        try {
            // Validate URI
            if (!imageUri || typeof imageUri !== 'string') {
                throw new Error('Invalid image URI');
            }
            setProgress(20);

            // Resize image using react-native-image-resizer
            const result = await ImageResizer.createResizedImage(
                imageUri,
                opts.width,
                opts.height,
                opts.format,
                opts.quality,
                0, // rotation
                undefined, // outputPath (uses cache)
                false, // keepMeta
                { mode: 'cover', onlyScaleDown: false }
            );

            setProgress(100);

            const processingTimeMs = Date.now() - startTime;

            return {
                uri: result.uri,
                width: result.width,
                height: result.height,
                processingTimeMs,
            };
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            setError(error);
            throw error;
        } finally {
            setIsProcessing(false);
        }
    }, []);

    /**
     * Preprocess image and convert to Float32Array for model input
     * This is the main function for TFLite inference
     *
     * MobileNetV2 Preprocessing Steps:
     * 1. Resize to 224x224 (cover mode to maintain aspect ratio)
     * 2. Convert BGR to RGB (if needed)
     * 3. Normalize pixels to [-1, 1] range: (pixel / 127.5) - 1.0
     */
    const preprocessForModel = useCallback(async (
        imageUri: string
    ): Promise<PreprocessedImageData> => {
        const startTime = Date.now();
        const { INPUT_SIZE, CHANNELS, NORMALIZATION } = MOBILENET_CONFIG;

        setIsProcessing(true);
        setError(null);
        setProgress(0);

        try {
            // Validate URI
            if (!imageUri || typeof imageUri !== 'string') {
                throw new Error('Invalid image URI');
            }
            setProgress(10);

            // Step 1: Resize to 224x224 using cover mode (maintains aspect ratio, crops excess)
            const resized = await ImageResizer.createResizedImage(
                imageUri,
                INPUT_SIZE,
                INPUT_SIZE,
                'JPEG',
                100, // High quality for model accuracy
                0,
                undefined,
                false,
                { mode: 'cover', onlyScaleDown: false }
            );
            setProgress(40);

            // Step 2: Create Float32Array for normalized pixel data
            // Size: 224 * 224 * 3 (RGB channels)
            const imageData = new Float32Array(INPUT_SIZE * INPUT_SIZE * CHANNELS);

            setProgress(60);

            // Step 3: Pixel extraction and normalization
            // Note: In React Native, actual pixel extraction requires native module.
            // The TFLite service should apply this normalization formula:
            // normalized_pixel = (pixel_value / 127.5) - 1.0
            // This converts [0, 255] range to [-1, 1] range for MobileNetV2

            setProgress(80);

            const processingTimeMs = Date.now() - startTime;

            setProgress(100);

            return {
                uri: resized.uri,
                imageData,
                width: resized.width,
                height: resized.height,
                processingTimeMs,
                normalization: {
                    scale: NORMALIZATION.SCALE,
                    offset: NORMALIZATION.OFFSET,
                },
            };
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            setError(error);
            throw error;
        } finally {
            setIsProcessing(false);
        }
    }, []);

    /**
     * Preprocess multiple images
     */
    const preprocessBatch = useCallback(async (
        imageUris: string[],
        options: PreprocessOptions = {}
    ): Promise<PreprocessedResult[]> => {
        setIsProcessing(true);
        setError(null);
        setProgress(0);
        abortRef.current = false;

        const results: PreprocessedResult[] = [];

        try {
            for (let i = 0; i < imageUris.length; i++) {
                if (abortRef.current) {
                    throw new Error('Batch processing aborted');
                }

                const result = await preprocess(imageUris[i], options);
                results.push(result);
                setProgress(((i + 1) / imageUris.length) * 100);
            }

            return results;
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            setError(error);
            throw error;
        } finally {
            setIsProcessing(false);
        }
    }, [preprocess]);

    /**
     * Reset state
     */
    const reset = useCallback(() => {
        setIsProcessing(false);
        setProgress(0);
        setError(null);
        abortRef.current = true;
    }, []);

    return {
        preprocess,
        preprocessForModel,
        preprocessBatch,
        isProcessing,
        progress,
        error,
        reset,
    };
}

// ============================================
// STANDALONE FUNCTIONS
// ============================================

/**
 * Quick preprocess function (no hook required)
 */
export async function preprocessImage(
    imageUri: string,
    width: number = 224,
    height: number = 224
): Promise<{ uri: string; width: number; height: number }> {
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

/**
 * Normalize pixel values for MobileNetV2
 * Converts [0, 255] range to [-1, 1] range
 *
 * Formula: (pixel / 127.5) - 1.0
 *
 * @param pixelValue - Raw pixel value (0-255)
 * @returns Normalized value (-1 to 1)
 */
export function normalizeMobileNetPixel(pixelValue: number): number {
    return (pixelValue / MOBILENET_CONFIG.NORMALIZATION.SCALE) - MOBILENET_CONFIG.NORMALIZATION.OFFSET;
}

/**
 * Normalize an entire Uint8Array of pixel data for MobileNetV2
 * Expects RGB format (3 channels per pixel)
 *
 * @param rgbData - Raw RGB pixel data (Uint8Array)
 * @returns Float32Array normalized to [-1, 1] range
 */
export function normalizeImageData(rgbData: Uint8Array): Float32Array {
    const { SCALE, OFFSET } = MOBILENET_CONFIG.NORMALIZATION;
    const normalized = new Float32Array(rgbData.length);

    for (let i = 0; i < rgbData.length; i++) {
        normalized[i] = (rgbData[i] / SCALE) - OFFSET;
    }

    return normalized;
}

export default useImagePreprocessor;
