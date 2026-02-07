/**
 * Sync Manager Service (Internet-Agnostic, Backend-Driven)
 *
 * Handles synchronization between local file storage and cloud via backend API.
 * The frontend does NOT check network status or decide when to sync.
 * All sync calls are unconditional — failures are silently caught.
 *
 * Image uploads go through the backend (NOT directly to Firebase Storage).
 * After sync, cloud-only images are downloaded to local persistent storage.
 *
 * Sync Flow:
 * 1. Collect all local entries
 * 2. Upload pending images via backend (non-blocking on failure)
 * 3. Send to backend /entries/two-way-sync
 * 4. Backend decides: sync now or defer
 * 5. Update local storage with merged result (or keep local data if deferred)
 * 6. Download cloud images to local persistent storage
 */

import { getAuth } from '@react-native-firebase/auth';

import { localStorageService } from './localStorageService';
import { fileStorageService } from './fileStorageService';
import { apiService } from './apiService';
import {
  LocalJournalEntry,
  SyncResult,
  SyncState,
} from '../types/models';

// Initialize instances
const auth = getAuth();

type SyncStateCallback = (state: SyncState) => void;

class SyncManager {
  private isSyncing = false;
  private activeSyncPromise: Promise<SyncResult> | null = null;
  private lastSyncResult: SyncResult | null = null;
  private listeners: Set<SyncStateCallback> = new Set();

  /**
   * Get current user ID
   */
  private getCurrentUserId(): string | null {
    const user = auth.currentUser;
    return user?.uid || null;
  }

  /**
   * Get current sync state
   */
  async getState(): Promise<SyncState> {
    const userId = this.getCurrentUserId();
    const pendingCount = userId
      ? await localStorageService.getPendingCount(userId)
      : 0;
    const lastSyncTime = await localStorageService.getLastSyncTime();

    return {
      isSyncing: this.isSyncing,
      lastSyncTime,
      lastSyncResult: this.lastSyncResult,
      pendingCount,
    };
  }

  /**
   * Notify listeners of state change
   */
  private async notifyListeners(): Promise<void> {
    const state = await this.getState();
    this.listeners.forEach(callback => {
      try {
        callback(state);
      } catch (error) {
        console.error('Sync state listener error:', error);
      }
    });
  }

  /**
   * Subscribe to sync state changes
   */
  addListener(callback: SyncStateCallback): () => void {
    this.listeners.add(callback);

    // Immediately notify with current state
    this.getState().then(callback);

    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Upload pending images via backend API (non-blocking per entry).
   * The backend uploads to Firebase Storage and returns the download URL.
   */
  private async uploadPendingImagesViaBackend(
    entries: LocalJournalEntry[],
    _userId: string
  ): Promise<LocalJournalEntry[]> {
    const result: LocalJournalEntry[] = [];

    for (const entry of entries) {
      if (entry.isDeleted) {
        result.push(entry);
        continue;
      }

      // Upload if: has a local image path (file://) and no cloud URL yet
      const hasLocalImage = entry.localImageUri &&
        !entry.localImageUri.startsWith('http') &&
        entry.localImageUri.length > 0;
      const needsUpload = hasLocalImage && !entry.imageUrl;

      if (needsUpload) {
        console.log(`[SYNC] Uploading image for entry ${entry.localId}...`);
        try {
          const uploadResult = await apiService.uploadEntryImage(
            entry.localId,
            entry.localImageUri
          );
          console.log(`[SYNC] Image uploaded successfully: ${uploadResult.imageUrl}`);
          result.push({
            ...entry,
            imageUrl: uploadResult.imageUrl,
            storagePath: uploadResult.storagePath,
          });
        } catch (uploadError: any) {
          console.warn(`[SYNC] Image upload failed for ${entry.localId}:`, uploadError?.message || uploadError);
          // Image upload failed — keep local URI, will retry next sync
          result.push(entry);
        }
      } else {
        result.push(entry);
      }
    }

    return result;
  }

  /**
   * Download cloud images for entries that have a cloud URL but no local file.
   * Non-blocking: failures are logged and the entry keeps the cloud URL.
   */
  private async downloadCloudImages(
    entries: LocalJournalEntry[]
  ): Promise<LocalJournalEntry[]> {
    const result: LocalJournalEntry[] = [];

    for (const entry of entries) {
      // Skip entries that are deleted or already have a valid local image
      if (entry.isDeleted) {
        result.push(entry);
        continue;
      }

      // If entry has a cloud URL but no local file, download it
      if (
        entry.imageUrl &&
        entry.imageUrl.startsWith('http') &&
        (!entry.localImageUri || entry.localImageUri.startsWith('http') || entry.localImageUri === '')
      ) {
        try {
          const hasLocal = await fileStorageService.hasLocalImage(entry.localId);
          if (hasLocal) {
            // Image already downloaded, just update the path
            result.push({
              ...entry,
              localImageUri: fileStorageService.getJournalImagePath(entry.localId),
            });
          } else {
            // Download the image from the cloud URL
            const localPath = await fileStorageService.downloadAndSaveImage(
              entry.imageUrl,
              entry.localId
            );
            result.push({
              ...entry,
              localImageUri: localPath,
            });
          }
        } catch (err) {
          console.warn(
            `Failed to download image for ${entry.localId}:`,
            err
          );
          // Keep the entry with cloud URL — UI will show placeholder if needed
          result.push(entry);
        }
      } else {
        result.push(entry);
      }
    }

    return result;
  }

  /**
   * Internal sync logic — called by sync() and guarded by activeSyncPromise.
   */
  private async performSyncInternal(userId: string): Promise<SyncResult> {
    try {
      const localEntries = await localStorageService.getAllEntriesForSync(userId);

      // Step 1: Upload pending images via backend (non-blocking per-entry)
      let entriesWithImages = localEntries;
      try {
        entriesWithImages = await this.uploadPendingImagesViaBackend(
          localEntries,
          userId
        );
      } catch (imageError) {
        console.warn(
          'Image upload batch failed, continuing with local URIs:',
          imageError
        );
      }

      // Step 2: Two-way sync with backend
      const lastSyncTime = await localStorageService.getLastSyncTime();

      const { entries: mergedEntries, result } = await apiService.twoWaySync(
        entriesWithImages,
        lastSyncTime || undefined
      );

      // Step 3: Download cloud images to local persistent storage
      let entriesWithLocalImages = mergedEntries;
      try {
        entriesWithLocalImages = await this.downloadCloudImages(mergedEntries);
      } catch (downloadError) {
        console.warn(
          'Image download batch failed, entries will use cloud URLs:',
          downloadError
        );
      }

      // Step 4: Save merged entries to local file storage
      await localStorageService.replaceAllEntries(userId, entriesWithLocalImages);
      await localStorageService.setLastSyncTime(result.timestamp);

      this.lastSyncResult = result;
      return result;

    } catch (error: any) {
      // Silent failure — network unreachable, backend down, etc.
      console.warn('Sync failed (will retry later):', error.message);
      const result: SyncResult = {
        success: false, uploaded: 0, downloaded: 0, conflicts: 0,
        errors: [`Sync failed: ${error.message}`], timestamp: Date.now(),
      };
      this.lastSyncResult = result;
      return result;

    } finally {
      this.isSyncing = false;
      await this.notifyListeners();
    }
  }

  /**
   * Perform full two-way sync via backend API.
   * Called unconditionally — never checks network status.
   * Coalesces concurrent calls: if sync is already running, callers share the same promise.
   */
  async sync(): Promise<SyncResult> {
    const userId = this.getCurrentUserId();
    if (!userId) {
      return {
        success: false, uploaded: 0, downloaded: 0, conflicts: 0,
        errors: ['User not authenticated'], timestamp: Date.now(),
      };
    }

    // Coalesce concurrent calls: if sync is already running, return the same promise
    if (this.isSyncing && this.activeSyncPromise) {
      return this.activeSyncPromise;
    }

    this.isSyncing = true;
    await this.notifyListeners();

    this.activeSyncPromise = this.performSyncInternal(userId);

    try {
      return await this.activeSyncPromise;
    } finally {
      this.activeSyncPromise = null;
    }
  }

  /**
   * Quick sync — triggers full sync only if there are pending entries
   */
  async quickSync(): Promise<SyncResult> {
    const userId = this.getCurrentUserId();
    if (!userId) {
      return {
        success: false, uploaded: 0, downloaded: 0, conflicts: 0,
        errors: ['Cannot sync'], timestamp: Date.now(),
      };
    }

    const pendingEntries = await localStorageService.getPendingEntries(userId);
    if (pendingEntries.length === 0) {
      return {
        success: true, uploaded: 0, downloaded: 0, conflicts: 0,
        errors: [], timestamp: Date.now(),
      };
    }

    return this.sync();
  }

  /**
   * Force download all entries from cloud via backend.
   * Also downloads images for all entries.
   */
  async forceDownload(): Promise<SyncResult> {
    const userId = this.getCurrentUserId();
    if (!userId) {
      return {
        success: false, uploaded: 0, downloaded: 0, conflicts: 0,
        errors: ['User not authenticated'], timestamp: Date.now(),
      };
    }

    try {
      const cloudEntries = await apiService.getEntries(1000, 0);

      // Download images for cloud entries
      let entriesWithLocalImages = cloudEntries;
      try {
        entriesWithLocalImages = await this.downloadCloudImages(cloudEntries);
      } catch (err) {
        console.warn('Image download during force download failed:', err);
      }

      await localStorageService.replaceAllEntries(userId, entriesWithLocalImages);
      const timestamp = Date.now();
      await localStorageService.setLastSyncTime(timestamp);
      return {
        success: true, uploaded: 0, downloaded: entriesWithLocalImages.length,
        conflicts: 0, errors: [], timestamp,
      };
    } catch (error: any) {
      console.warn('Force download failed:', error.message);
      return {
        success: false, uploaded: 0, downloaded: 0, conflicts: 0,
        errors: [`Force download failed: ${error.message}`], timestamp: Date.now(),
      };
    }
  }
}

export const syncManager = new SyncManager();
