/**
 * TypeScript type definitions for Creature Archive
 *
 * These types match the Firestore database schema defined in DATABASE_SCHEMA_FINAL.md
 * Extended with offline-first sync support
 */

import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

/**
 * Sync status for offline-first journal entries
 */
export type SyncStatus = 'synced' | 'pending' | 'failed';

/**
 * How the species was identified
 * - offline: on-device TFLite model
 * - online: remote AnimalDetect API
 * - manual: user typed it in manually
 */
export type DetectionSource = 'offline' | 'online' | 'manual';

/**
 * Animal class options for filtering and categorization
 */
export type AnimalClass = 'Mammal' | 'Bird' | 'Reptile' | 'Amphibian' | 'Fish' | 'Insect' | 'Other';

export const ANIMAL_CLASSES: AnimalClass[] = [
  'Mammal',
  'Bird',
  'Reptile',
  'Amphibian',
  'Fish',
  'Insect',
  'Other',
];

/**
 * Local journal entry for offline-first storage
 * This is the primary data model used throughout the app
 */
export interface LocalJournalEntry {
  localId: string; // UUID generated locally
  firestoreId?: string; // Firestore document ID (set after first sync)
  userId: string;
  speciesName: string;
  scientificName: string;
  confidenceScore: number; // 0.0 - 1.0
  localImageUri: string; // Local file path (persistent, always used by UI)
  imageUrl?: string; // Firebase Storage URL (set after upload, used only during sync)
  storagePath?: string; // Firebase Storage path reference (e.g., users/{uid}/journals/{id}/species.jpg)
  latitude: number;
  longitude: number;
  locationName?: string;
  capturedAt: number; // Unix timestamp in ms
  createdAt: number; // Unix timestamp in ms
  lastUpdated: number; // Unix timestamp in ms for conflict resolution
  syncStatus: SyncStatus;
  syncError?: string; // Error message if sync failed
  notes: string;
  tags: string[];
  behaviorObserved: string;
  quantity: number;
  habitatType: string;
  animalClass: AnimalClass;
  detectionSource: DetectionSource;
  isDeleted?: boolean; // Soft delete for sync
  deletedAt?: number; // When deleted locally
}

/**
 * User profile stored in Firestore users collection
 *
 * Collection: users
 * Document ID: {userId} from Firebase Auth
 */
export interface User {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  institution: string;
  currentRole: string;
  createdAt: FirebaseFirestoreTypes.Timestamp;
  lastSync: FirebaseFirestoreTypes.Timestamp;
  entryCount: number;
  profileImage?: string;
}

/**
 * Journal entry stored in Firestore journal_entries collection
 *
 * Collection: journal_entries
 * Document ID: auto-generated
 */
export interface JournalEntry {
  id?: string;
  userId: string;
  speciesName: string;
  scientificName: string;
  confidenceScore: number; // 0.0 - 1.0
  imageUrl: string;
  location: FirebaseFirestoreTypes.GeoPoint;
  locationName?: string; // Human-readable location name
  capturedAt: FirebaseFirestoreTypes.Timestamp;
  syncedAt: FirebaseFirestoreTypes.Timestamp;
  notes: string;
  tags: string[];
  behaviorObserved: string;
  quantity: number;
  habitatType: string;
  animalClass: 'Mammal' | 'Bird' | 'Reptile' | 'Amphibian' | 'Fish' | 'Insect' | 'Other';
}

/**
 * Pending entry stored locally in AsyncStorage
 *
 * Used for offline support - entries waiting to sync to Firestore
 */
export interface PendingEntry extends Omit<JournalEntry, 'syncedAt' | 'imageUrl'> {
  localImageUri: string;
  isSyncing: boolean;
}

/**
 * ML prediction response from FastAPI backend
 *
 * Response from POST /predict endpoint
 */
export interface PredictionResponse {
  species_name: string;
  scientific_name: string;
  confidence_score: number; // 0.0 - 1.0
  species_id: number;
  prediction_time: string;
}

/**
 * User signup data
 *
 * Used when creating a new account
 */
export interface SignUpData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  institution: string;
  currentRole: string;
}

/**
 * Geolocation coordinates
 *
 * For capturing photo location
 */
export interface Coordinates {
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number;
}

/**
 * Health check response from backend
 *
 * Response from GET /health endpoint
 */
export interface HealthCheckResponse {
  status: string;
  model_loaded: boolean;
  species_count: number;
  timestamp: string;
}

/**
 * Data required to create a new local journal entry
 */
export interface CreateLocalJournalData {
  userId: string;
  speciesName: string;
  scientificName: string;
  confidenceScore: number;
  localImageUri: string;
  latitude: number;
  longitude: number;
  locationName?: string;
  capturedAt: number;
  notes: string;
  tags: string[];
  behaviorObserved: string;
  quantity: number;
  habitatType: string;
  animalClass: AnimalClass;
  detectionSource: DetectionSource;
}

/**
 * Data for updating an existing local journal entry
 */
export interface UpdateLocalJournalData {
  speciesName?: string;
  scientificName?: string;
  confidenceScore?: number;
  notes?: string;
  tags?: string[];
  behaviorObserved?: string;
  quantity?: number;
  habitatType?: string;
  animalClass?: AnimalClass;
  locationName?: string;
}

/**
 * Sync operation result
 */
export interface SyncResult {
  success: boolean;
  uploaded: number;
  downloaded: number;
  conflicts: number;
  errors: string[];
  timestamp: number;
}

/**
 * Sync manager state
 */
export interface SyncState {
  isSyncing: boolean;
  lastSyncTime: number | null;
  lastSyncResult: SyncResult | null;
  pendingCount: number;
}

/**
 * Generate a UUID v4
 */
export function generateLocalId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Create a new LocalJournalEntry from creation data
 */
export function createLocalJournalEntry(data: CreateLocalJournalData): LocalJournalEntry {
  const now = Date.now();
  return {
    localId: generateLocalId(),
    userId: data.userId,
    speciesName: data.speciesName,
    scientificName: data.scientificName,
    confidenceScore: data.confidenceScore,
    localImageUri: data.localImageUri,
    latitude: data.latitude,
    longitude: data.longitude,
    locationName: data.locationName,
    capturedAt: data.capturedAt,
    createdAt: now,
    lastUpdated: now,
    syncStatus: 'pending',
    notes: data.notes,
    tags: data.tags,
    behaviorObserved: data.behaviorObserved,
    quantity: data.quantity,
    habitatType: data.habitatType,
    animalClass: data.animalClass,
    detectionSource: data.detectionSource,
  };
}
