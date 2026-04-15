/**
 * API Service
 *
 * Handles all communication with the FastAPI backend.
 * All cloud synchronization goes through this service.
 */

import { getAuth, getIdToken } from '@react-native-firebase/auth';
import { LocalJournalEntry, SyncResult } from '../../core/types';
import { API_BASE_URL } from '../../core/config/api';

// Initialize auth instance
const auth = getAuth();

/**
 * Sync entry data format sent to backend
 */
export interface SyncEntryData {
  localId: string;
  firestoreId?: string;
  userId: string;
  speciesName: string;
  scientificName: string;
  confidenceScore: number;
  localImageUri: string;
  imageUrl?: string;
  latitude: number;
  longitude: number;
  locationName?: string;
  capturedAt: number;
  createdAt: number;
  lastUpdated: number;
  syncStatus: string;
  notes: string;
  tags: string[];
  behaviorObserved: string;
  quantity: number;
  habitatType: string;
  animalClass: string;
  detectionSource: string;
  isDeleted?: boolean;
  deletedAt?: number;
}

/**
 * Two-way sync request body
 */
export interface TwoWaySyncRequest {
  localEntries: SyncEntryData[];
  lastSyncTime?: number;
}

/**
 * Synced entry response from backend
 */
export interface SyncedEntryResponse {
  localId: string;
  firestoreId: string;
  userId: string;
  speciesName: string;
  scientificName: string;
  confidenceScore: number;
  localImageUri: string;
  imageUrl: string;
  latitude: number;
  longitude: number;
  locationName?: string;
  capturedAt: number;
  createdAt: number;
  lastUpdated: number;
  syncStatus: string;
  notes: string;
  tags: string[];
  behaviorObserved: string;
  quantity: number;
  habitatType: string;
  animalClass: string;
  detectionSource: string;
}

/**
 * Two-way sync response from backend
 */
export interface TwoWaySyncResponse {
  success: boolean;
  mergedEntries: SyncedEntryResponse[];
  uploaded: number;
  downloaded: number;
  deleted: number;
  conflicts: number;
  errors: string[];
  syncTimestamp: number;
  syncDeferred?: boolean; // True when backend could not reach cloud
}

/**
 * Get the current user's Firebase ID token
 */
async function getAuthToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User not authenticated');
  }
  return getIdToken(user);
}

/**
 * Make an authenticated API request
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getAuthToken();

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });
  } catch (error: any) {
    throw new Error(
      'Connection error: Unable to reach the server. ' +
      'Please check your network connection and ensure the backend is running.'
    );
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Convert LocalJournalEntry to SyncEntryData format
 */
function localEntryToSyncData(entry: LocalJournalEntry): SyncEntryData {
  return {
    localId: entry.localId,
    firestoreId: entry.firestoreId,
    userId: entry.userId,
    speciesName: entry.speciesName,
    scientificName: entry.scientificName,
    confidenceScore: entry.confidenceScore,
    localImageUri: entry.localImageUri,
    imageUrl: entry.imageUrl,
    latitude: entry.latitude,
    longitude: entry.longitude,
    locationName: entry.locationName,
    capturedAt: entry.capturedAt,
    createdAt: entry.createdAt,
    lastUpdated: entry.lastUpdated,
    syncStatus: entry.syncStatus,
    notes: entry.notes,
    tags: entry.tags,
    behaviorObserved: entry.behaviorObserved,
    quantity: entry.quantity,
    habitatType: entry.habitatType,
    animalClass: entry.animalClass,
    detectionSource: entry.detectionSource,
    isDeleted: entry.isDeleted,
    deletedAt: entry.deletedAt,
  };
}

/**
 * Convert SyncedEntryResponse to LocalJournalEntry format
 */
function syncResponseToLocalEntry(
  response: SyncedEntryResponse
): LocalJournalEntry {
  // localImageUri: Use the backend's localImageUri only if it looks like a local path.
  // For cloud-only entries, leave empty — the sync manager will download the image
  // and set the local path after saving.
  const localImageUri =
    response.localImageUri && !response.localImageUri.startsWith('http')
      ? response.localImageUri
      : '';

  return {
    localId: response.localId,
    firestoreId: response.firestoreId,
    userId: response.userId,
    speciesName: response.speciesName,
    scientificName: response.scientificName,
    confidenceScore: response.confidenceScore,
    localImageUri,
    imageUrl: response.imageUrl,
    latitude: response.latitude,
    longitude: response.longitude,
    locationName: response.locationName,
    capturedAt: response.capturedAt,
    createdAt: response.createdAt,
    lastUpdated: response.lastUpdated,
    syncStatus: 'synced',
    notes: response.notes,
    tags: response.tags,
    behaviorObserved: response.behaviorObserved,
    quantity: response.quantity,
    habitatType: response.habitatType,
    animalClass: response.animalClass as LocalJournalEntry['animalClass'],
    detectionSource: (response.detectionSource || 'offline') as LocalJournalEntry['detectionSource'],
  };
}

/**
 * API Service class
 */
class ApiService {
  /**
   * Perform two-way sync with backend
   *
   * This is the main sync method. It:
   * 1. Sends all local entries to the backend
   * 2. Backend performs conflict resolution with cloud data
   * 3. Returns merged result to update local storage
   */
  async twoWaySync(
    localEntries: LocalJournalEntry[],
    lastSyncTime?: number
  ): Promise<{
    entries: LocalJournalEntry[];
    result: SyncResult;
  }> {
    const syncData: SyncEntryData[] = localEntries.map(localEntryToSyncData);

    const request: TwoWaySyncRequest = {
      localEntries: syncData,
      lastSyncTime,
    };

    const response = await apiRequest<TwoWaySyncResponse>(
      '/entries/two-way-sync',
      {
        method: 'POST',
        body: JSON.stringify(request),
      }
    );

    // If sync was deferred (cloud unreachable), don't replace local data
    if (response.syncDeferred) {
      const result: SyncResult = {
        success: false,
        uploaded: 0,
        downloaded: 0,
        conflicts: 0,
        errors: ['Cloud sync deferred - will retry later'],
        timestamp: response.syncTimestamp,
      };
      return {
        entries: localEntries, // Return original local entries unchanged
        result,
      };
    }

    const mergedEntries = response.mergedEntries.map(syncResponseToLocalEntry);

    const result: SyncResult = {
      success: response.success,
      uploaded: response.uploaded,
      downloaded: response.downloaded,
      conflicts: response.conflicts,
      errors: response.errors,
      timestamp: response.syncTimestamp,
    };

    return {
      entries: mergedEntries,
      result,
    };
  }

  /**
   * Create user profile on backend
   */
  async signup(data: {
    email: string;
    firstName: string;
    lastName: string;
    institution: string;
    currentRole: string;
  }): Promise<any> {
    return apiRequest('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Update user profile via backend
   */
  async updateProfile(data: {
    firstName?: string;
    lastName?: string;
    institution?: string;
    currentRole?: string;
    email?: string;
    profileImage?: string;
  }): Promise<any> {
    return apiRequest('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  /**
   * Delete user account via backend (Firestore profile + Auth record)
   */
  async deleteAccount(): Promise<void> {
    await apiRequest('/auth/me', {
      method: 'DELETE',
    });
  }

  /**
   * Get current user profile from backend
   */
  async getCurrentUser(): Promise<{
    uid: string;
    email: string;
    firstName: string;
    lastName: string;
    institution: string;
    currentRole: string;
    entryCount: number;
    createdAt: string;
    lastSync: string | null;
    profileImage?: string;
  }> {
    return apiRequest('/auth/me');
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    status: string;
    model_loaded: boolean;
    species_count: number;
    timestamp: string;
  }> {
    const response = await fetch(`${API_BASE_URL}/health`);
    return response.json();
  }

  /**
   * Get all journal entries from backend (cloud data)
   */
  async getEntries(
    limit = 50,
    offset = 0
  ): Promise<LocalJournalEntry[]> {
    const response = await apiRequest<any[]>(
      `/entries?limit=${limit}&offset=${offset}`
    );

    return response.map(entry => ({
      localId: entry.id, // Use firestoreId as localId for cloud-only entries
      firestoreId: entry.id,
      userId: entry.userId,
      speciesName: entry.speciesName,
      scientificName: entry.scientificName,
      confidenceScore: entry.confidenceScore,
      localImageUri: '', // Empty — sync manager will download image and set local path
      imageUrl: entry.imageUrl,
      latitude: entry.location?.latitude || 0,
      longitude: entry.location?.longitude || 0,
      locationName: entry.locationName,
      capturedAt: new Date(entry.capturedAt).getTime(),
      createdAt: new Date(entry.capturedAt).getTime(),
      lastUpdated: new Date(entry.syncedAt).getTime(),
      syncStatus: 'synced' as const,
      notes: entry.notes || '',
      tags: entry.tags || [],
      behaviorObserved: entry.behaviorObserved || '',
      quantity: entry.quantity || 1,
      habitatType: entry.habitatType || '',
      animalClass: (entry.animalClass || 'Other') as LocalJournalEntry['animalClass'],
      detectionSource: (entry.detectionSource || 'offline') as LocalJournalEntry['detectionSource'],
    }));
  }

  /**
   * Upload a journal entry image to Firebase Storage via the backend.
   * Returns the Firebase Storage download URL and storage path.
   */
  async uploadEntryImage(
    localId: string,
    filePath: string
  ): Promise<{ imageUrl: string; storagePath: string; localId: string }> {
    console.log(`[API] uploadEntryImage called: localId=${localId}, filePath=${filePath}`);
    const token = await getAuthToken();

    const uri = filePath.startsWith('file://') ? filePath : `file://${filePath}`;
    console.log(`[API] Normalized URI: ${uri}`);

    const formData = new FormData();
    formData.append('localId', localId);
    formData.append('image', {
      uri,
      type: 'image/jpeg',
      name: `${localId}.jpg`,
    } as any);

    let response: Response;
    try {
      console.log(`[API] Sending POST to ${API_BASE_URL}/entries/upload-image`);
      response = await fetch(`${API_BASE_URL}/entries/upload-image`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          // Do NOT set Content-Type — fetch sets it with multipart boundary
        },
        body: formData,
      });
      console.log(`[API] Response status: ${response.status}`);
    } catch (error: any) {
      console.error(`[API] Fetch error:`, error);
      throw new Error(`Image upload connection error: ${error.message}`);
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(`[API] Upload failed:`, errorData);
      throw new Error(errorData.detail || `Image upload failed: ${response.status}`);
    }

    const result = await response.json();
    console.log(`[API] Upload success:`, result);
    return result;
  }

  /**
   * Upload a profile image to Firebase Storage via the backend.
   * Returns the Firebase Storage download URL and storage path.
   */
  async uploadProfileImage(
    filePath: string
  ): Promise<{ imageUrl: string; storagePath: string }> {
    const token = await getAuthToken();

    const uri = filePath.startsWith('file://') ? filePath : `file://${filePath}`;

    const formData = new FormData();
    formData.append('image', {
      uri,
      type: 'image/jpeg',
      name: 'profile.jpg',
    } as any);

    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}/auth/upload-profile-image`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });
    } catch (error: any) {
      throw new Error(`Profile image upload connection error: ${error.message}`);
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Profile image upload failed: ${response.status}`);
    }

    return response.json();
  }


  // ── Forgot Password (Unauthenticated) ─────────────────────────────

  /**
   * Step 1: Initiate forgot password flow by providing email.
   * Returns a session token and 2 challenge field labels.
   */
  async forgotPasswordInitiate(email: string): Promise<{
    session_token: string;
    challenge_fields: string[];
  }> {
    const response = await fetch(`${API_BASE_URL}/auth/forgot-password/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || 'Failed to initiate password reset.');
    }

    return response.json();
  }

  /**
   * Step 2: Verify answers to the 2 challenge questions.
   * Returns a reset token on success.
   */
  async forgotPasswordVerify(
    sessionToken: string,
    answers: Record<string, string>
  ): Promise<{ reset_token: string }> {
    const response = await fetch(`${API_BASE_URL}/auth/forgot-password/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_token: sessionToken, answers }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || 'Verification failed.');
    }

    return response.json();
  }

  /**
   * Step 3: Reset password using the reset token.
   */
  async forgotPasswordReset(
    resetToken: string,
    newPassword: string
  ): Promise<{ detail: string }> {
    const response = await fetch(`${API_BASE_URL}/auth/forgot-password/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset_token: resetToken, new_password: newPassword }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || 'Failed to reset password.');
    }

    return response.json();
  }
}

export const apiService = new ApiService();
