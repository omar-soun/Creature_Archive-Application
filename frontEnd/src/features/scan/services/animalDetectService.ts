/**
 * AnimalDetect Service
 *
 * Calls the backend /species/detect endpoint which proxies the request
 * to the AnimalDetect API. The API key is stored server-side and is
 * NEVER exposed to the frontend.
 *
 * Only called when:
 *  1. The user rejected the on-device ML prediction, AND
 *  2. The device has an active internet connection.
 */

import { getAuth, getIdToken } from '@react-native-firebase/auth';
import { API_BASE_URL } from '../../../core/config/api';

export interface AnimalDetectResult {
    /** Common name returned by the AnimalDetect API */
    commonName: string;
    /** Scientific name returned by the AnimalDetect API */
    scientificName: string;
    /** Confidence score 0-100 */
    confidence: number;
    /** Any extra fields returned by the API — stored in entry Notes */
    extraData?: Record<string, unknown>;
}

class AnimalDetectService {
    private readonly timeoutMs = 30_000;

    /**
     * Send the image to the backend /species/detect proxy endpoint.
     * Returns null if the API returns no match.
     */
    async detectFromImage(imageUri: string): Promise<AnimalDetectResult | null> {
        const auth = getAuth();
        const user = auth.currentUser;
        if (!user) throw new Error('Not authenticated');

        const token = await getIdToken(user);

        const formData = new FormData();
        formData.append('image', {
            uri: imageUri.startsWith('file://') ? imageUri : `file://${imageUri}`,
            type: 'image/jpeg',
            name: 'detection.jpg',
        } as any);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

        try {
            const response = await fetch(`${API_BASE_URL}/species/detect`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    // Do NOT set Content-Type — fetch sets multipart boundary automatically
                },
                body: formData,
                signal: controller.signal,
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.detail || `Detection failed: ${response.status}`);
            }

            const result: AnimalDetectResult = await response.json();

            if (!result.commonName || result.commonName === 'Unknown') {
                return null;
            }

            return result;
        } catch (error: any) {
            if (error?.name === 'AbortError') {
                throw new Error('Animal detection request timed out. Please try again.');
            }
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    }
}

export const animalDetectService = new AnimalDetectService();
