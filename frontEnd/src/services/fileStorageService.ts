/**
 * File Storage Service for Offline-First Journal System
 *
 * Stores all local data as files in the device file system (NOT cache).
 * Uses react-native-fs (RNFS) for persistent storage.
 *
 * Directory structure:
 *   {DocumentDirectoryPath}/creature_archive/
 *     journals/{localId}.json       - Individual journal entries
 *     images/journal/{localId}.jpg  - Species/observation images
 *     images/profile/profile.jpg    - User profile image
 *     sync/sync_meta.json           - Sync metadata
 */

import RNFS from 'react-native-fs';
import {
  LocalJournalEntry,
  CreateLocalJournalData,
  UpdateLocalJournalData,
  createLocalJournalEntry,
  SyncStatus,
} from '../types/models';

// ── Directory paths (persistent, NOT cache) ────────────────────────────
const BASE_DIR = `${RNFS.DocumentDirectoryPath}/creature_archive`;
const JOURNALS_DIR = `${BASE_DIR}/journals`;
const IMAGES_DIR = `${BASE_DIR}/images`;
const JOURNAL_IMAGES_DIR = `${IMAGES_DIR}/journal`;
const PROFILE_IMAGES_DIR = `${IMAGES_DIR}/profile`;
const SYNC_DIR = `${BASE_DIR}/sync`;

const SYNC_META_FILE = `${SYNC_DIR}/sync_meta.json`;
const PROFILE_IMAGE_FILE = `${PROFILE_IMAGES_DIR}/profile.jpg`;

class FileStorageService {
  private entriesCache: Map<string, LocalJournalEntry> | null = null;
  private cacheInitialized = false;
  private directoriesEnsured = false;

  // ── Directory Management ───────────────────────────────────────────

  /**
   * Create all required directories if they don't exist
   */
  async ensureDirectories(): Promise<void> {
    if (this.directoriesEnsured) return;

    const dirs = [
      BASE_DIR,
      JOURNALS_DIR,
      IMAGES_DIR,
      JOURNAL_IMAGES_DIR,
      PROFILE_IMAGES_DIR,
      SYNC_DIR,
    ];

    for (const dir of dirs) {
      const exists = await RNFS.exists(dir);
      if (!exists) {
        await RNFS.mkdir(dir);
      }
    }

    this.directoriesEnsured = true;
  }

  // ── Cache Management ───────────────────────────────────────────────

  /**
   * Initialize the in-memory cache by reading all journal JSON files
   */
  private async initializeCache(): Promise<void> {
    if (this.cacheInitialized) return;

    try {
      await this.ensureDirectories();

      const exists = await RNFS.exists(JOURNALS_DIR);
      if (!exists) {
        this.entriesCache = new Map();
        this.cacheInitialized = true;
        return;
      }

      const files = await RNFS.readDir(JOURNALS_DIR);
      const jsonFiles = files.filter(f => f.name.endsWith('.json') && f.isFile());

      this.entriesCache = new Map();

      for (const file of jsonFiles) {
        try {
          const content = await RNFS.readFile(file.path, 'utf8');
          const entry: LocalJournalEntry = JSON.parse(content);
          this.entriesCache.set(entry.localId, entry);
        } catch (err) {
          console.warn(`Failed to read journal file ${file.name}:`, err);
        }
      }

      this.cacheInitialized = true;
    } catch (error) {
      console.error('Failed to initialize file storage cache:', error);
      this.entriesCache = new Map();
      this.cacheInitialized = true;
    }
  }

  /**
   * Write a single entry to its JSON file
   */
  private async writeEntryFile(entry: LocalJournalEntry): Promise<void> {
    await this.ensureDirectories();
    const filePath = `${JOURNALS_DIR}/${entry.localId}.json`;
    await RNFS.writeFile(filePath, JSON.stringify(entry), 'utf8');
  }

  /**
   * Delete a single entry's JSON file
   */
  private async deleteEntryFile(localId: string): Promise<void> {
    const filePath = `${JOURNALS_DIR}/${localId}.json`;
    const exists = await RNFS.exists(filePath);
    if (exists) {
      await RNFS.unlink(filePath);
    }
  }

  // ── Image Management ───────────────────────────────────────────────

  /**
   * Copy an image from a temp/cache path to persistent storage.
   * Returns the persistent file path.
   */
  async copyImageToPersistentStorage(
    tempUri: string,
    localId: string
  ): Promise<string> {
    await this.ensureDirectories();

    const destPath = `${JOURNAL_IMAGES_DIR}/${localId}.jpg`;

    // Normalize: strip file:// prefix if present
    let sourcePath = tempUri;
    if (sourcePath.startsWith('file://')) {
      sourcePath = sourcePath.substring(7);
    }

    // Check if already in persistent dir
    if (sourcePath === destPath) {
      return destPath;
    }

    const sourceExists = await RNFS.exists(sourcePath);
    if (!sourceExists) {
      console.warn(`Source image not found: ${sourcePath}`);
      return tempUri; // Return original if source doesn't exist
    }

    // Check if destination already exists (avoid unnecessary copy)
    const destExists = await RNFS.exists(destPath);
    if (destExists) {
      await RNFS.unlink(destPath);
    }

    await RNFS.copyFile(sourcePath, destPath);
    return destPath;
  }

  /**
   * Download an image from a remote URL and save to persistent storage.
   * Returns the local file path.
   */
  async downloadAndSaveImage(
    remoteUrl: string,
    localId: string
  ): Promise<string> {
    await this.ensureDirectories();

    const destPath = `${JOURNAL_IMAGES_DIR}/${localId}.jpg`;

    // Check if already downloaded
    const exists = await RNFS.exists(destPath);
    if (exists) {
      return destPath;
    }

    const result = await RNFS.downloadFile({
      fromUrl: remoteUrl,
      toFile: destPath,
      background: false,
      discretionary: false,
    }).promise;

    if (result.statusCode !== 200) {
      // Clean up partial download
      const partialExists = await RNFS.exists(destPath);
      if (partialExists) {
        await RNFS.unlink(destPath);
      }
      throw new Error(`Image download failed: HTTP ${result.statusCode}`);
    }

    return destPath;
  }

  /**
   * Delete a journal entry's image file
   */
  async deleteJournalImage(localId: string): Promise<void> {
    const filePath = `${JOURNAL_IMAGES_DIR}/${localId}.jpg`;
    const exists = await RNFS.exists(filePath);
    if (exists) {
      await RNFS.unlink(filePath);
    }
  }

  /**
   * Check if a local image file exists for an entry
   */
  async hasLocalImage(localId: string): Promise<boolean> {
    const filePath = `${JOURNAL_IMAGES_DIR}/${localId}.jpg`;
    return RNFS.exists(filePath);
  }

  /**
   * Get the persistent local path for a journal image
   */
  getJournalImagePath(localId: string): string {
    return `${JOURNAL_IMAGES_DIR}/${localId}.jpg`;
  }

  // ── Profile Image Management ───────────────────────────────────────

  /**
   * Copy a profile image to persistent storage.
   * Returns the persistent file path.
   */
  async saveProfileImage(tempUri: string): Promise<string> {
    await this.ensureDirectories();

    let sourcePath = tempUri;
    if (sourcePath.startsWith('file://')) {
      sourcePath = sourcePath.substring(7);
    }

    const sourceExists = await RNFS.exists(sourcePath);
    if (!sourceExists) {
      throw new Error(`Profile image source not found: ${sourcePath}`);
    }

    // Remove existing profile image
    const destExists = await RNFS.exists(PROFILE_IMAGE_FILE);
    if (destExists) {
      await RNFS.unlink(PROFILE_IMAGE_FILE);
    }

    await RNFS.copyFile(sourcePath, PROFILE_IMAGE_FILE);
    return PROFILE_IMAGE_FILE;
  }

  /**
   * Get the local profile image path, or null if none exists
   */
  async getProfileImagePath(): Promise<string | null> {
    await this.ensureDirectories();
    const exists = await RNFS.exists(PROFILE_IMAGE_FILE);
    return exists ? PROFILE_IMAGE_FILE : null;
  }

  /**
   * Download a profile image from a remote URL to persistent local storage.
   * Returns the local file path on success, or null on failure.
   */
  async downloadProfileImage(remoteUrl: string): Promise<string | null> {
    try {
      await this.ensureDirectories();

      // Remove existing profile image
      const destExists = await RNFS.exists(PROFILE_IMAGE_FILE);
      if (destExists) {
        await RNFS.unlink(PROFILE_IMAGE_FILE);
      }

      const result = await RNFS.downloadFile({
        fromUrl: remoteUrl,
        toFile: PROFILE_IMAGE_FILE,
      }).promise;

      if (result.statusCode === 200) {
        return PROFILE_IMAGE_FILE;
      }

      console.warn('Profile image download failed with status:', result.statusCode);
      return null;
    } catch (error) {
      console.warn('Profile image download error:', error);
      return null;
    }
  }

  /**
   * Delete the local profile image
   */
  async deleteProfileImage(): Promise<void> {
    const exists = await RNFS.exists(PROFILE_IMAGE_FILE);
    if (exists) {
      await RNFS.unlink(PROFILE_IMAGE_FILE);
    }
  }

  // ── Journal CRUD (same API as LocalStorageService) ─────────────────

  /**
   * Get all journal entries for a user (excluding soft-deleted)
   */
  async getEntries(userId: string): Promise<LocalJournalEntry[]> {
    await this.initializeCache();

    return Array.from(this.entriesCache!.values())
      .filter(e => e.userId === userId && !e.isDeleted)
      .sort((a, b) => b.capturedAt - a.capturedAt);
  }

  /**
   * Get all entries including deleted ones (for sync purposes)
   */
  async getAllEntriesForSync(userId: string): Promise<LocalJournalEntry[]> {
    await this.initializeCache();

    return Array.from(this.entriesCache!.values())
      .filter(e => e.userId === userId);
  }

  /**
   * Get a single entry by localId
   */
  async getEntry(localId: string): Promise<LocalJournalEntry | null> {
    await this.initializeCache();
    return this.entriesCache!.get(localId) || null;
  }

  /**
   * Get entry by Firestore ID
   */
  async getEntryByFirestoreId(
    firestoreId: string
  ): Promise<LocalJournalEntry | null> {
    await this.initializeCache();

    for (const entry of this.entriesCache!.values()) {
      if (entry.firestoreId === firestoreId) {
        return entry;
      }
    }
    return null;
  }

  /**
   * Create a new journal entry locally.
   * Automatically copies the image from temp/cache to persistent storage.
   */
  async createEntry(
    data: CreateLocalJournalData
  ): Promise<LocalJournalEntry> {
    await this.initializeCache();

    const entry = createLocalJournalEntry(data);

    // Copy image from temp/cache to persistent storage
    if (
      data.localImageUri &&
      !data.localImageUri.startsWith('http') &&
      !data.localImageUri.startsWith(JOURNAL_IMAGES_DIR)
    ) {
      try {
        const persistentPath = await this.copyImageToPersistentStorage(
          data.localImageUri,
          entry.localId
        );
        entry.localImageUri = persistentPath;
      } catch (err) {
        console.warn('Failed to copy image to persistent storage:', err);
        // Keep the original URI as fallback
      }
    }

    this.entriesCache!.set(entry.localId, entry);
    await this.writeEntryFile(entry);

    return entry;
  }

  /**
   * Update an existing journal entry
   */
  async updateEntry(
    localId: string,
    updates: UpdateLocalJournalData
  ): Promise<LocalJournalEntry | null> {
    await this.initializeCache();

    const existing = this.entriesCache!.get(localId);
    if (!existing) return null;

    const updated: LocalJournalEntry = {
      ...existing,
      ...updates,
      lastUpdated: Date.now(),
      syncStatus: 'pending' as SyncStatus,
    };

    this.entriesCache!.set(localId, updated);
    await this.writeEntryFile(updated);

    return updated;
  }

  /**
   * Soft delete an entry (marks for sync, then actual delete)
   */
  async deleteEntry(localId: string): Promise<boolean> {
    await this.initializeCache();

    const existing = this.entriesCache!.get(localId);
    if (!existing) return false;

    const deleted: LocalJournalEntry = {
      ...existing,
      isDeleted: true,
      deletedAt: Date.now(),
      lastUpdated: Date.now(),
      syncStatus: 'pending',
    };

    this.entriesCache!.set(localId, deleted);
    await this.writeEntryFile(deleted);

    return true;
  }

  /**
   * Hard delete an entry (remove completely after successful cloud sync).
   * Also cleans up the associated image file.
   */
  async hardDeleteEntry(localId: string): Promise<boolean> {
    await this.initializeCache();

    const deleted = this.entriesCache!.delete(localId);
    if (deleted) {
      await this.deleteEntryFile(localId);
      await this.deleteJournalImage(localId);
    }
    return deleted;
  }

  /**
   * Get all pending entries that need to sync
   */
  async getPendingEntries(userId: string): Promise<LocalJournalEntry[]> {
    await this.initializeCache();

    return Array.from(this.entriesCache!.values())
      .filter(e => e.userId === userId && e.syncStatus === 'pending');
  }

  /**
   * Get count of pending entries
   */
  async getPendingCount(userId: string): Promise<number> {
    const pending = await this.getPendingEntries(userId);
    return pending.length;
  }

  /**
   * Update sync status of an entry
   */
  async updateSyncStatus(
    localId: string,
    status: SyncStatus,
    firestoreId?: string,
    imageUrl?: string,
    error?: string
  ): Promise<void> {
    await this.initializeCache();

    const existing = this.entriesCache!.get(localId);
    if (!existing) return;

    const updated: LocalJournalEntry = {
      ...existing,
      syncStatus: status,
      syncError: error,
    };

    if (firestoreId) {
      updated.firestoreId = firestoreId;
    }
    if (imageUrl) {
      updated.imageUrl = imageUrl;
    }

    this.entriesCache!.set(localId, updated);
    await this.writeEntryFile(updated);
  }

  /**
   * Save an entry from cloud (during sync download)
   */
  async saveCloudEntry(entry: LocalJournalEntry): Promise<void> {
    await this.initializeCache();

    // Check if we already have this entry by firestoreId
    let existingLocalId: string | null = null;
    for (const [localId, existing] of this.entriesCache!.entries()) {
      if (existing.firestoreId === entry.firestoreId) {
        existingLocalId = localId;
        break;
      }
    }

    if (existingLocalId) {
      const merged = { ...entry, localId: existingLocalId };
      this.entriesCache!.set(existingLocalId, merged);
      await this.writeEntryFile(merged);
    } else {
      this.entriesCache!.set(entry.localId, entry);
      await this.writeEntryFile(entry);
    }
  }

  /**
   * Bulk save entries from cloud
   */
  async bulkSaveCloudEntries(entries: LocalJournalEntry[]): Promise<void> {
    await this.initializeCache();

    for (const entry of entries) {
      await this.saveCloudEntry(entry);
    }
  }

  /**
   * Replace all entries for a user with the provided entries.
   * Used after two-way sync to apply the merged result from backend.
   */
  async replaceAllEntries(
    userId: string,
    entries: LocalJournalEntry[]
  ): Promise<void> {
    await this.initializeCache();

    // Collect localIds of old entries for this user (to delete their files)
    const oldLocalIds: string[] = [];
    for (const [localId, entry] of this.entriesCache!.entries()) {
      if (entry.userId === userId) {
        oldLocalIds.push(localId);
      }
    }

    // Remove old entries from cache
    for (const localId of oldLocalIds) {
      this.entriesCache!.delete(localId);
    }

    // Delete old JSON files (but NOT image files - they may be reused)
    for (const localId of oldLocalIds) {
      await this.deleteEntryFile(localId);
    }

    // Add all new entries
    for (const entry of entries) {
      this.entriesCache!.set(entry.localId, entry);
      await this.writeEntryFile(entry);
    }

    // Clean up orphaned image files (images whose entries no longer exist)
    const activeLocalIds = new Set(entries.map(e => e.localId));
    for (const oldId of oldLocalIds) {
      if (!activeLocalIds.has(oldId)) {
        // Entry was removed, clean up its image too
        await this.deleteJournalImage(oldId);
      }
    }
  }

  // ── Sync Metadata ──────────────────────────────────────────────────

  /**
   * Get last sync time
   */
  async getLastSyncTime(): Promise<number | null> {
    try {
      await this.ensureDirectories();
      const exists = await RNFS.exists(SYNC_META_FILE);
      if (!exists) return null;

      const content = await RNFS.readFile(SYNC_META_FILE, 'utf8');
      const meta = JSON.parse(content);
      return meta.lastSyncTime || null;
    } catch {
      return null;
    }
  }

  /**
   * Set last sync time
   */
  async setLastSyncTime(timestamp: number): Promise<void> {
    try {
      await this.ensureDirectories();

      let meta: any = {};
      const exists = await RNFS.exists(SYNC_META_FILE);
      if (exists) {
        try {
          const content = await RNFS.readFile(SYNC_META_FILE, 'utf8');
          meta = JSON.parse(content);
        } catch {
          meta = {};
        }
      }

      meta.lastSyncTime = timestamp;
      await RNFS.writeFile(SYNC_META_FILE, JSON.stringify(meta), 'utf8');
    } catch (error) {
      console.error('Failed to save last sync time:', error);
    }
  }

  // ── Data Management ────────────────────────────────────────────────

  /**
   * Clear all local data (for logout)
   */
  async clearAllData(): Promise<void> {
    try {
      const exists = await RNFS.exists(BASE_DIR);
      if (exists) {
        await RNFS.unlink(BASE_DIR);
      }
      this.entriesCache = new Map();
      this.cacheInitialized = false;
      this.directoriesEnsured = false;
    } catch (error) {
      console.error('Failed to clear local data:', error);
      throw error;
    }
  }

  /**
   * Force refresh cache from file system
   */
  async refreshCache(): Promise<void> {
    this.cacheInitialized = false;
    this.entriesCache = null;
    await this.initializeCache();
  }

  // ── Static Helpers ─────────────────────────────────────────────────

  /** Get the base directory path (useful for migration service) */
  getBaseDir(): string {
    return BASE_DIR;
  }

  getJournalsDir(): string {
    return JOURNALS_DIR;
  }

  getJournalImagesDir(): string {
    return JOURNAL_IMAGES_DIR;
  }

  getProfileImagesDir(): string {
    return PROFILE_IMAGES_DIR;
  }

  getSyncDir(): string {
    return SYNC_DIR;
  }
}

export const fileStorageService = new FileStorageService();
