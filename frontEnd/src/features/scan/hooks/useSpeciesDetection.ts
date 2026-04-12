/**
 * ============================================
 * useSpeciesDetection Hook
 * ============================================
 *
 * React hook for species detection workflow using LOCAL TFLite model.
 * All inference runs on-device — no images are sent to the backend.
 *
 * Pipeline:
 * 1. Load TFLite model from app bundle
 * 2. Preprocess image (resize 224x224, decode JPEG, normalize to [-1, 1] for MobileNetV2)
 * 3. Run local TFLite inference
 * 4. Map output to species using speciesService
 *
 * Dependencies (all React Native CLI compatible, no Expo):
 * - react-native-fast-tflite: TFLite model loading & inference
 * - react-native-image-resizer: Resize to 224x224
 * - react-native-fs: Read image file as base64
 * - jpeg-js + buffer: Decode JPEG to raw pixel data
 *
 * Works fully offline after initial app install.
 *
 * Usage:
 * const { detect, isDetecting, result, error, reset } = useSpeciesDetection();
 * const predictionResult = await detect(photoUri);
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { loadTensorflowModel, TensorflowModel } from 'react-native-fast-tflite';
import ImageResizer from 'react-native-image-resizer';
import RNFS from 'react-native-fs';
import { decode as jpegDecode } from 'jpeg-js';
import { Buffer } from 'buffer';
import { speciesService } from '../services/speciesService';
import { MOBILENET_CONFIG } from './useImagePreprocessor';

// ============================================
// TYPES
// ============================================

export interface DetectionResult {
    /** Common name of the species (e.g., "Red-tailed Hawk") */
    commonName: string;
    /** Scientific name (e.g., "Buteo jamaicensis") */
    scientificName: string;
    /** Confidence score as percentage (0-100) */
    confidenceScore: number;
    /** Raw confidence score (0.0-1.0) */
    confidenceRaw: number;
    /** Species ID from the model */
    speciesId: number;
    /** Species description */
    description: string;
    /** Time taken for prediction (ms) */
    predictionTime: number;
    /** Preprocessed image URI */
    processedImageUri: string;
}

export interface DetectionOptions {
    /** Skip preprocessing (if image is already processed) */
    skipPreprocessing?: boolean;
    /** Custom timeout in milliseconds (default: 30000) */
    timeout?: number;
}

export interface UseSpeciesDetectionReturn {
    /** Detect species from image URI */
    detect: (imageUri: string, options?: DetectionOptions) => Promise<DetectionResult>;
    /** Whether detection is in progress */
    isDetecting: boolean;
    /** Current detection stage */
    stage: DetectionStage;
    /** Last successful detection result */
    result: DetectionResult | null;
    /** Last error */
    error: Error | null;
    /** Whether models are ready */
    isModelReady: boolean;
    /** Reset state */
    reset: () => void;
}

export type DetectionStage = 'idle' | 'initializing' | 'preprocessing' | 'analyzing' | 'complete' | 'error';
export const LOW_CONFIDENCE_THRESHOLD = 60;

// ============================================
// MODEL SINGLETON (shared across hook instances)
// ============================================

let tfliteModelInstance: TensorflowModel | null = null;
let modelLoadingPromise: Promise<TensorflowModel> | null = null;

/**
 * Load the TFLite model (once, singleton)
 */
async function ensureModelLoaded(): Promise<TensorflowModel> {
    if (tfliteModelInstance) return tfliteModelInstance;
    if (modelLoadingPromise) return modelLoadingPromise;

    modelLoadingPromise = (async () => {
        console.log('[SpeciesDetection] Loading TFLite model...');
        const model = await loadTensorflowModel(
            require('../../../model/creature_archive_model.tflite')
        );
        tfliteModelInstance = model;
        console.log('[SpeciesDetection] TFLite model loaded successfully');
        return model;
    })();

    return modelLoadingPromise;
}

/**
 * Decode a JPEG image file into a normalized RGB Float32Array.
 *
 * Steps:
 * 1. Resize to 224x224 using react-native-image-resizer
 * 2. Read resized file as base64 via react-native-fs
 * 3. Decode JPEG to raw RGBA pixels via jpeg-js
 * 4. Convert RGBA → RGB and normalize [0, 255] → [-1.0, 1.0] for MobileNetV2
 *    Formula: (pixel / 127.5) - 1.0
 */
async function imageToFloat32Array(imageUri: string): Promise<Float32Array> {
    const TARGET_SIZE = MOBILENET_CONFIG.INPUT_SIZE; // 224
    console.log('[SpeciesDetection] imageToFloat32Array input:', imageUri);

    // Resize to exactly 224x224 using 'stretch' mode to guarantee exact dimensions
    const resized = await ImageResizer.createResizedImage(
        imageUri,
        TARGET_SIZE,
        TARGET_SIZE,
        'JPEG',
        100, // high quality for model accuracy
        0,
        undefined,
        false,
        { mode: 'stretch', onlyScaleDown: false }
    );

    console.log('[SpeciesDetection] Resized image URI:', resized.uri);

    // Read resized image as base64
    const base64Data = await RNFS.readFile(resized.uri, 'base64');
    const imageBuffer = Buffer.from(base64Data, 'base64');

    console.log('[SpeciesDetection] Image buffer size:', imageBuffer.length);

    // Decode JPEG to raw RGBA pixel data
    const { data: rgbaData, width, height } = jpegDecode(imageBuffer, { useTArray: true });

    console.log('[SpeciesDetection] Decoded image dimensions:', width, 'x', height);

    // Validate dimensions match expected size
    if (width !== TARGET_SIZE || height !== TARGET_SIZE) {
        console.warn(`[SpeciesDetection] Dimension mismatch: ${width}x${height}, expected ${TARGET_SIZE}x${TARGET_SIZE}`);
    }

    // Convert RGBA to RGB Float32Array, normalized to [-1.0, 1.0] for MobileNetV2
    // Formula: (pixel / 127.5) - 1.0
    // Always use TARGET_SIZE to ensure correct input tensor size
    const { SCALE, OFFSET } = MOBILENET_CONFIG.NORMALIZATION;
    const expectedPixelCount = TARGET_SIZE * TARGET_SIZE;
    const inputArray = new Float32Array(expectedPixelCount * 3);

    for (let i = 0; i < expectedPixelCount; i++) {
        // Safely handle if image has fewer pixels than expected
        const srcIdx = Math.min(i, (width * height) - 1);
        inputArray[i * 3] = (rgbaData[srcIdx * 4] / SCALE) - OFFSET;         // R
        inputArray[i * 3 + 1] = (rgbaData[srcIdx * 4 + 1] / SCALE) - OFFSET; // G
        inputArray[i * 3 + 2] = (rgbaData[srcIdx * 4 + 2] / SCALE) - OFFSET; // B
    }

    // Log first few pixel values to verify image data is different
    console.log('[SpeciesDetection] First 9 RGB values:',
        inputArray[0].toFixed(3), inputArray[1].toFixed(3), inputArray[2].toFixed(3),
        inputArray[3].toFixed(3), inputArray[4].toFixed(3), inputArray[5].toFixed(3),
        inputArray[6].toFixed(3), inputArray[7].toFixed(3), inputArray[8].toFixed(3)
    );

    return inputArray;
}

// ============================================
// HOOK IMPLEMENTATION
// ============================================

export function useSpeciesDetection(): UseSpeciesDetectionReturn {
    const [isDetecting, setIsDetecting] = useState(false);
    const [stage, setStage] = useState<DetectionStage>('idle');
    const [result, setResult] = useState<DetectionResult | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const [isModelReady, setIsModelReady] = useState(false);
    const abortRef = useRef(false);
    const initAttempted = useRef(false);

    /**
     * Load the TFLite model on mount
     */
    useEffect(() => {
        if (initAttempted.current) return;
        initAttempted.current = true;

        const initializeModel = async () => {
            try {
                setStage('initializing');
                await ensureModelLoaded();
                setIsModelReady(true);
                setStage('idle');
                console.log('[SpeciesDetection] Model ready for inference');
            } catch (err: any) {
                console.error('[SpeciesDetection] Model init failed:', err);
                setError(new Error('Failed to load species detection model.'));
                setStage('error');
            }
        };

        initializeModel();
    }, []);

    /**
     * Main detection function — RUNS ENTIRELY ON-DEVICE
     */
    const detect = useCallback(async (
        imageUri: string,
        _options: DetectionOptions = {}
    ): Promise<DetectionResult> => {
        setIsDetecting(true);
        setError(null);
        setResult(null);
        abortRef.current = false;

        const startTime = Date.now();

        try {
            // Step 1: Ensure model is loaded
            setStage('initializing');
            const model = await ensureModelLoaded();

            if (abortRef.current) throw new Error('Detection cancelled');

            // Step 2: Preprocess the image (resize, decode, normalize)
            setStage('preprocessing');
            console.log('[SpeciesDetection] Preprocessing image...');

            const inputArray = await imageToFloat32Array(imageUri);

            if (abortRef.current) throw new Error('Detection cancelled');

            // Step 3: Run TFLite inference
            setStage('analyzing');
            console.log('[SpeciesDetection] Running on-device inference...');

            const outputArrays = model.runSync([inputArray]);
            const predictions = outputArrays[0] as Float32Array;

            // Log raw prediction outputs for debugging
            const predictionArray = Array.from(predictions);
            const sortedIndices = predictionArray
                .map((val, idx) => ({ val, idx }))
                .sort((a, b) => b.val - a.val)
                .slice(0, 5);
            console.log('[SpeciesDetection] Top 5 predictions:',
                sortedIndices.map(p => `idx=${p.idx} conf=${(p.val * 100).toFixed(1)}%`).join(', ')
            );

            if (abortRef.current) throw new Error('Detection cancelled');

            // Step 4: Map predictions to species
            const topPrediction = speciesService.getTopPrediction(predictionArray);

            if (!topPrediction) {
                throw new Error('Could not identify species from image.');
            }

            const endTime = Date.now();

            // Step 5: Format result
            setStage('complete');
            const detectionResult: DetectionResult = {
                commonName: topPrediction.species.commonName,
                scientificName: topPrediction.species.scientificName,
                confidenceScore: Math.round(topPrediction.confidence * 100),
                confidenceRaw: topPrediction.confidence,
                speciesId: topPrediction.species.id,
                description: topPrediction.species.description,
                predictionTime: endTime - startTime,
                processedImageUri: imageUri,
            };

            console.log('[SpeciesDetection] Detection complete:', detectionResult.commonName,
                `(${detectionResult.confidenceScore}%) in ${detectionResult.predictionTime}ms`);

            setResult(detectionResult);
            return detectionResult;

        } catch (err: any) {
            setStage('error');
            console.error('[SpeciesDetection] Detection failed:', err);

            const message = err.message || 'Species detection failed.';
            const detectionError = new Error(message);
            setError(detectionError);
            throw detectionError;

        } finally {
            setIsDetecting(false);
        }
    }, []);

    /**
     * Reset all state
     */
    const reset = useCallback(() => {
        abortRef.current = true;
        setIsDetecting(false);
        setStage('idle');
        setResult(null);
        setError(null);
    }, []);

    return {
        detect,
        isDetecting,
        stage,
        result,
        error,
        isModelReady,
        reset,
    };
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get confidence level description
 */
export function getConfidenceLevel(score: number): {
    level: 'high' | 'moderate' | 'low';
    label: string;
    color: string;
} {
    if (score >= 90) {
        return { level: 'high', label: 'High confidence identification', color: '#059669' };
    }
    if (score >= 70) {
        return { level: 'moderate', label: 'Moderate confidence identification', color: '#D97706' };
    }
    return { level: 'low', label: 'Low confidence - verify manually', color: '#DC2626' };
}

/**
 * Get stage display text
 */
export function getStageText(stage: DetectionStage): string {
    switch (stage) {
        case 'initializing':
            return 'Loading model...';
        case 'preprocessing':
            return 'Processing image...';
        case 'analyzing':
            return 'Analyzing species...';
        case 'complete':
            return 'Complete!';
        case 'error':
            return 'Error occurred';
        default:
            return '';
    }
}

export default useSpeciesDetection;
