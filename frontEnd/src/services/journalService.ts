/**
 * Journal Service
 *
 * @deprecated This service is deprecated in favor of the offline-first architecture.
 * Use the following instead:
 * - localStorageService: For local CRUD operations
 * - syncManager: For backend-driven cloud sync
 * - useJournalEntries hook: For React components
 *
 * Updated to use Modular API (Firebase v9+ style) for backwards compatibility.
 */

import { 
  getFirestore, 
  collection, 
  doc, 
  addDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  Timestamp, 
  GeoPoint, 
  increment,
  serverTimestamp
} from '@react-native-firebase/firestore';
import { 
  getStorage, 
  ref, 
  getDownloadURL, 
  deleteObject 
} from '@react-native-firebase/storage';
import { getAuth } from '@react-native-firebase/auth';
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { JournalEntry } from '../types/models';
import { COLLECTIONS } from '../config/firebase';

// Initialize instances
const auth = getAuth();
const db = getFirestore();
const storage = getStorage();

/**
 * Extended JournalEntry for local use with animalClass field
 */
export interface JournalEntryLocal extends Omit<JournalEntry, 'location' | 'animalClass'> {
    animalClass: string;
    locationName?: string;
    coordinates?: string;
    latitude?: number;
    longitude?: number;
}

/**
 * Data required to create a new journal entry
 */
export interface CreateJournalData {
    speciesName: string;
    scientificName: string;
    confidenceScore: number;
    localImageUri: string;
    notes: string;
    tags: string[];
    behaviorObserved: string;
    quantity: number;
    habitatType: string;
    animalClass: string;
    latitude?: number;
    longitude?: number;
    locationName?: string;
    capturedAt?: Date;
}

/**
 * Data for updating an existing journal entry
 */
export interface UpdateJournalData {
    speciesName?: string;
    scientificName?: string;
    notes?: string;
    tags?: string[];
    behaviorObserved?: string;
    quantity?: number;
    habitatType?: string;
    animalClass?: string;
}

/**
 * Firestore journal document (raw from Firestore)
 */
interface FirestoreJournalDoc {
    userId: string;
    speciesName: string;
    scientificName: string;
    confidenceScore: number;
    imageUrl: string;
    location: FirebaseFirestoreTypes.GeoPoint | null;
    locationName?: string;
    capturedAt: FirebaseFirestoreTypes.Timestamp;
    syncedAt: FirebaseFirestoreTypes.Timestamp;
    notes: string;
    tags: string[];
    behaviorObserved: string;
    quantity: number;
    habitatType: string;
    animalClass: string;
}

class JournalService {
    private unsubscribeListener: (() => void) | null = null;

    /**
     * Get current authenticated user ID
     */
    private getCurrentUserId(): string {
        const user = auth.currentUser;
        if (!user) {
            throw new Error('User not authenticated');
        }
        return user.uid;
    }

    /**
     * Upload image to Firebase Storage
     * Uses hybrid approach: Modular Ref + Native putFile
     */
    async uploadImage(localUri: string): Promise<string> {
        const userId = this.getCurrentUserId();
        const imageId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const storagePath = `users/${userId}/images/${imageId}.jpg`;

        // MODULAR: Get reference
        const storageRef = ref(storage, storagePath);

        // Handle file:// prefix
        const filePath = localUri.startsWith('file://')
            ? localUri
            : `file://${localUri}`;

        // HYBRID: Cast to any to use native putFile (more robust for RN than uploadBytes)
        await (storageRef as any).putFile(filePath);
        
        const downloadUrl = await getDownloadURL(storageRef);

        return downloadUrl;
    }

    /**
     * Create a new journal entry
     */
    async createEntry(data: CreateJournalData): Promise<string> {
        const userId = this.getCurrentUserId();

        // Upload image first
        let imageUrl = '';
        if (data.localImageUri) {
            imageUrl = await this.uploadImage(data.localImageUri);
        }

        // Create GeoPoint if coordinates provided
        let location: FirebaseFirestoreTypes.GeoPoint | null = null;
        if (data.latitude !== undefined && data.longitude !== undefined) {
            location = new GeoPoint(data.latitude, data.longitude);
        }

        const now = Timestamp.now();
        const capturedAt = data.capturedAt
            ? Timestamp.fromDate(data.capturedAt)
            : now;

        const entryData: FirestoreJournalDoc = {
            userId,
            speciesName: data.speciesName,
            scientificName: data.scientificName,
            confidenceScore: data.confidenceScore,
            imageUrl,
            location,
            locationName: data.locationName || '',
            capturedAt,
            syncedAt: now,
            notes: data.notes || '',
            tags: data.tags || [],
            behaviorObserved: data.behaviorObserved || '',
            quantity: data.quantity || 1,
            habitatType: data.habitatType || '',
            animalClass: data.animalClass || 'Other',
        };

        // MODULAR: addDoc
        const docRef = await addDoc(collection(db, COLLECTIONS.JOURNAL_ENTRIES), entryData);

        // Increment user's entry count
        // MODULAR: updateDoc
        const userRef = doc(db, COLLECTIONS.USERS, userId);
        await updateDoc(userRef, {
            entryCount: increment(1),
            lastSync: now,
        });

        console.log('Journal entry created:', docRef.id);
        return docRef.id;
    }

    /**
     * Get all journal entries for current user (one-time fetch)
     */
    async getEntries(): Promise<JournalEntryLocal[]> {
        const userId = this.getCurrentUserId();

        // MODULAR: Query and getDocs
        const q = query(
            collection(db, COLLECTIONS.JOURNAL_ENTRIES),
            where('userId', '==', userId),
            orderBy('capturedAt', 'desc')
        );

        const snapshot = await getDocs(q);

        return snapshot.docs.map(doc => this.convertDocToEntry(doc));
    }

    /**
     * Get a single journal entry by ID
     */
    async getEntry(entryId: string): Promise<JournalEntryLocal | null> {
        const docRef = doc(db, COLLECTIONS.JOURNAL_ENTRIES, entryId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists) {
            return null;
        }

        return this.convertDocToEntry(docSnap);
    }

    /**
     * Update an existing journal entry
     */
    async updateEntry(entryId: string, data: UpdateJournalData): Promise<void> {
        const userId = this.getCurrentUserId();

        // Verify ownership
        const docRef = doc(db, COLLECTIONS.JOURNAL_ENTRIES, entryId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists) {
            throw new Error('Entry not found');
        }

        const entryData = docSnap.data() as FirestoreJournalDoc;
        if (entryData.userId !== userId) {
            throw new Error('Unauthorized: Cannot update another user\'s entry');
        }

        await updateDoc(docRef, {
            ...data,
            syncedAt: serverTimestamp(),
        });

        console.log('Journal entry updated:', entryId);
    }

    /**
     * Delete a journal entry
     */
    async deleteEntry(entryId: string): Promise<void> {
        const userId = this.getCurrentUserId();

        // Verify ownership
        const docRef = doc(db, COLLECTIONS.JOURNAL_ENTRIES, entryId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists) {
            throw new Error('Entry not found');
        }

        const entryData = docSnap.data() as FirestoreJournalDoc;
        if (entryData.userId !== userId) {
            throw new Error('Unauthorized: Cannot delete another user\'s entry');
        }

        // Delete image from storage if exists
        if (entryData.imageUrl) {
            try {
                // MODULAR: Create ref from URL and delete
                const imageRef = ref(storage, entryData.imageUrl);
                await deleteObject(imageRef);
            } catch (error) {
                console.warn('Failed to delete image from storage:', error);
            }
        }

        // Delete the document
        await deleteDoc(docRef);

        // Decrement user's entry count
        const userRef = doc(db, COLLECTIONS.USERS, userId);
        await updateDoc(userRef, {
            entryCount: increment(-1),
            lastSync: serverTimestamp(),
        });

        console.log('Journal entry deleted:', entryId);
    }

    /**
     * Subscribe to real-time updates for current user's entries
     */
    subscribeToEntries(
        callback: (entries: JournalEntryLocal[]) => void,
        onError?: (error: Error) => void
    ): () => void {
        const userId = this.getCurrentUserId();

        // MODULAR: onSnapshot with query
        const q = query(
            collection(db, COLLECTIONS.JOURNAL_ENTRIES),
            where('userId', '==', userId),
            orderBy('capturedAt', 'desc')
        );

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                const entries = snapshot.docs.map(doc => this.convertDocToEntry(doc));
                callback(entries);
            },
            (error) => {
                console.error('Journal subscription error:', error);
                if (onError) {
                    onError(error);
                }
            }
        );

        this.unsubscribeListener = unsubscribe;
        return unsubscribe;
    }

    /**
     * Unsubscribe from real-time updates
     */
    unsubscribe(): void {
        if (this.unsubscribeListener) {
            this.unsubscribeListener();
            this.unsubscribeListener = null;
        }
    }

    /**
     * Convert Firestore document to local entry format
     */
    private convertDocToEntry(
        docSnap: FirebaseFirestoreTypes.DocumentSnapshot<FirebaseFirestoreTypes.DocumentData>
    ): JournalEntryLocal {
        const data = docSnap.data() as FirestoreJournalDoc;

        // Extract coordinates from GeoPoint
        let latitude: number | undefined;
        let longitude: number | undefined;
        let coordinates: string | undefined;

        if (data.location) {
            latitude = data.location.latitude;
            longitude = data.location.longitude;
            coordinates = `${latitude.toFixed(4)}° N, ${longitude.toFixed(4)}° W`;
        }

        // Convert timestamps to Date
        const capturedAt = data.capturedAt?.toDate() || new Date();
        const syncedAt = data.syncedAt?.toDate() || new Date();

        return {
            id: docSnap.id,
            userId: data.userId,
            speciesName: data.speciesName,
            scientificName: data.scientificName,
            confidenceScore: data.confidenceScore,
            imageUrl: data.imageUrl,
            locationName: data.locationName,
            coordinates,
            latitude,
            longitude,
            capturedAt: Timestamp.fromDate(capturedAt), // Ensure consistent return type
            syncedAt: Timestamp.fromDate(syncedAt),
            notes: data.notes || '',
            tags: data.tags || [],
            behaviorObserved: data.behaviorObserved || '',
            quantity: data.quantity || 1,
            habitatType: data.habitatType || '',
            animalClass: data.animalClass || 'Other',
        };
    }
}

// Export singleton instance
export const journalService = new JournalService();
export default journalService;