/**
 * Prediction Service
 *
 * @deprecated This service is no longer used. Species detection now runs
 * entirely on-device using the local TFLite model via useSpeciesDetection hook.
 * No images are sent to the backend for prediction.
 *
 * Kept for reference only — do not import.
 */

import auth from '@react-native-firebase/auth';
import { PredictionResponse } from '../types/models';

// API Configuration
const API_BASE_URL = __DEV__
  ? 'http://10.0.2.2:8000'  // Android emulator localhost
  : 'https://your-production-api.com'; // Replace with your production URL

// For iOS simulator, use: 'http://localhost:8000'
// For physical device, use your computer's local IP: 'http://192.168.x.x:8000'

export interface PredictionError {
  message: string;
  code: string;
}

export class PredictionService {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || API_BASE_URL;
  }

  /**
   * Get Firebase ID token for API authentication
   */
  private async getAuthToken(): Promise<string> {
    const currentUser = auth().currentUser;
    if (!currentUser) {
      throw new Error('User not authenticated');
    }
    return currentUser.getIdToken();
  }

  /**
   * Predict species from image URI
   *
   * @param imageUri - Local file URI of the image (file://, content://, etc.)
   * @returns PredictionResponse with species details
   */
  async predictFromUri(imageUri: string): Promise<PredictionResponse> {
    try {
      // Get auth token
      const token = await this.getAuthToken();

      // Create form data with image file
      const formData = new FormData();

      // Extract filename from URI
      const filename = imageUri.split('/').pop() || 'image.jpg';

      // Determine MIME type
      const extension = filename.split('.').pop()?.toLowerCase();
      let mimeType = 'image/jpeg';
      if (extension === 'png') mimeType = 'image/png';
      if (extension === 'webp') mimeType = 'image/webp';

      // Append file to form data
      formData.append('file', {
        uri: imageUri,
        name: filename,
        type: mimeType,
      } as any);

      // Make API request
      const response = await fetch(`${this.baseUrl}/predict`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
        body: formData,
      });

      // Handle response
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Server error: ${response.status}`);
      }

      const data = await response.json();

      return {
        species_name: data.species_name,
        scientific_name: data.scientific_name,
        confidence_score: data.confidence_score,
        species_id: data.species_id,
        prediction_time: data.prediction_time,
      };
    } catch (error: any) {
      console.error('Prediction failed:', error);
      throw new Error(this.getErrorMessage(error));
    }
  }

  /**
   * Predict species from base64 encoded image
   *
   * @param base64 - Base64 encoded image string
   * @param filename - Optional filename with extension
   * @returns PredictionResponse with species details
   */
  async predictFromBase64(base64: string, filename: string = 'image.jpg'): Promise<PredictionResponse> {
    try {
      // Get auth token
      const token = await this.getAuthToken();

      // Convert base64 to blob
      const response = await fetch(`data:image/jpeg;base64,${base64}`);
      const blob = await response.blob();

      // Create form data
      const formData = new FormData();
      formData.append('file', blob, filename);

      // Make API request
      const apiResponse = await fetch(`${this.baseUrl}/predict`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!apiResponse.ok) {
        const errorData = await apiResponse.json().catch(() => ({}));
        throw new Error(errorData.detail || `Server error: ${apiResponse.status}`);
      }

      return await apiResponse.json();
    } catch (error: any) {
      console.error('Prediction from base64 failed:', error);
      throw new Error(this.getErrorMessage(error));
    }
  }

  /**
   * Health check for the prediction API
   */
  async healthCheck(): Promise<{ status: string; model_loaded: boolean }> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      if (!response.ok) {
        throw new Error('API health check failed');
      }
      return await response.json();
    } catch (error: any) {
      throw new Error('Unable to reach prediction service');
    }
  }

  /**
   * Get user-friendly error message
   */
  private getErrorMessage(error: any): string {
    const message = error.message || '';

    if (message.includes('Network request failed') || message.includes('fetch')) {
      return 'Unable to connect to server. Please check your internet connection.';
    }
    if (message.includes('401') || message.includes('Unauthorized')) {
      return 'Authentication failed. Please sign in again.';
    }
    if (message.includes('400')) {
      return 'Invalid image format. Please use JPG, PNG, or WebP.';
    }
    if (message.includes('413') || message.includes('too large')) {
      return 'Image is too large. Please use an image under 10MB.';
    }
    if (message.includes('500') || message.includes('Server')) {
      return 'Server error. Please try again later.';
    }

    return message || 'Species identification failed. Please try again.';
  }

  /**
   * Update the base URL (useful for testing or switching environments)
   */
  setBaseUrl(url: string): void {
    this.baseUrl = url;
  }
}

// Export singleton instance
export const predictionService = new PredictionService();
export default predictionService;
