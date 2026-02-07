/**
 * Migration Service
 *
 * One-time migration from AsyncStorage (cache-based) to file-system storage.
 * Runs automatically on app startup. Skips if already migrated.
 *
 * Migration steps:
 * 1. Check if migration already completed
 * 2. Read journal entries from AsyncStorage
 * 3. Write each entry as individual JSON file
 * 4. Copy local image files to persistent directory
 * 5. Migrate sync metadata
 * 6. Migrate profile image path
 * 7. Write migration status file
 *
 * Safety: Old AsyncStorage data is NOT deleted (safety net for rollback).
 */

import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LocalJournalEntry } from '../types/models';
import { fileStorageService } from './fileStorageService';

const MIGRATION_STATUS_FILE = `${RNFS.DocumentDirectoryPath}/creature_archive/migration_status.json`;

// Old AsyncStorage keys (from localStorageService)
const OLD_STORAGE_KEYS = {
  JOURNAL_ENTRIES: '@creature_archive_journal_entries',
  LAST_SYNC_TIME: '@creature_archive_last_sync_time',
  SYNC_STATE: '@creature_archive_sync_state',
  PROFILE_IMAGE: '@creature_archive_profile_image',
};

interface MigrationStatus {
  completed: boolean;
  migratedAt: number;
  entriesMigrated: number;
  imagesCopied: number;
  errors: string[];
}

class MigrationService {
  /**
   * Run migration if not already completed.
   * Safe to call on every app startup.
   */
  async migrateIfNeeded(): Promise<void> {
    try {
      // Check if already migrated
      const alreadyMigrated = await this.isMigrationComplete();
      if (alreadyMigrated) {
        return;
      }

      console.log('[Migration] Starting AsyncStorage → file system migration...');
      await this.performMigration();
      console.log('[Migration] Migration completed successfully.');
    } catch (error) {
      console.error('[Migration] Migration failed:', error);
      // Don't throw - the app should still work with an empty file store.
      // Entries will be re-synced from cloud on next sync.
    }
  }

  /**
   * Check if migration has already been completed
   */
  private async isMigrationComplete(): Promise<boolean> {
    try {
      const exists = await RNFS.exists(MIGRATION_STATUS_FILE);
      if (!exists) return false;

      const content = await RNFS.readFile(MIGRATION_STATUS_FILE, 'utf8');
      const status: MigrationStatus = JSON.parse(content);
      return status.completed === true;
    } catch {
      return false;
    }
  }

  /**
   * Perform the full migration
   */
  private async performMigration(): Promise<void> {
    await fileStorageService.ensureDirectories();

    const status: MigrationStatus = {
      completed: false,
      migratedAt: Date.now(),
      entriesMigrated: 0,
      imagesCopied: 0,
      errors: [],
    };

    // 1. Migrate journal entries
    try {
      const entriesJson = await AsyncStorage.getItem(
        OLD_STORAGE_KEYS.JOURNAL_ENTRIES
      );

      if (entriesJson) {
        const entries: LocalJournalEntry[] = JSON.parse(entriesJson);
        console.log(`[Migration] Found ${entries.length} entries to migrate.`);

        for (const entry of entries) {
          try {
            // Copy image file to persistent storage if it's a local file
            if (
              entry.localImageUri &&
              !entry.localImageUri.startsWith('http')
            ) {
              try {
                const persistentPath =
                  await fileStorageService.copyImageToPersistentStorage(
                    entry.localImageUri,
                    entry.localId
                  );
                entry.localImageUri = persistentPath;
                status.imagesCopied++;
              } catch (imgErr: any) {
                console.warn(
                  `[Migration] Failed to copy image for ${entry.localId}:`,
                  imgErr.message
                );
                status.errors.push(
                  `Image copy failed for ${entry.localId}: ${imgErr.message}`
                );
                // Keep original URI - image may still be accessible
              }
            }

            // Write entry as individual JSON file
            const filePath = `${fileStorageService.getJournalsDir()}/${entry.localId}.json`;
            await RNFS.writeFile(filePath, JSON.stringify(entry), 'utf8');
            status.entriesMigrated++;
          } catch (entryErr: any) {
            console.warn(
              `[Migration] Failed to migrate entry ${entry.localId}:`,
              entryErr.message
            );
            status.errors.push(
              `Entry migration failed for ${entry.localId}: ${entryErr.message}`
            );
          }
        }
      }
    } catch (err: any) {
      console.warn('[Migration] Failed to read entries from AsyncStorage:', err.message);
      status.errors.push(`AsyncStorage read failed: ${err.message}`);
    }

    // 2. Migrate sync metadata
    try {
      const lastSyncTime = await AsyncStorage.getItem(
        OLD_STORAGE_KEYS.LAST_SYNC_TIME
      );
      if (lastSyncTime) {
        const timestamp = parseInt(lastSyncTime, 10);
        if (!isNaN(timestamp)) {
          await fileStorageService.setLastSyncTime(timestamp);
        }
      }
    } catch (err: any) {
      console.warn('[Migration] Failed to migrate sync time:', err.message);
      status.errors.push(`Sync time migration failed: ${err.message}`);
    }

    // 3. Migrate profile image
    try {
      const profileImageUri = await AsyncStorage.getItem(
        OLD_STORAGE_KEYS.PROFILE_IMAGE
      );
      if (profileImageUri && !profileImageUri.startsWith('http')) {
        try {
          await fileStorageService.saveProfileImage(profileImageUri);
        } catch (imgErr: any) {
          console.warn(
            '[Migration] Failed to copy profile image:',
            imgErr.message
          );
          status.errors.push(
            `Profile image migration failed: ${imgErr.message}`
          );
        }
      }
    } catch (err: any) {
      console.warn('[Migration] Failed to migrate profile image:', err.message);
    }

    // 4. Write migration status (mark as complete even with some errors)
    status.completed = true;
    status.migratedAt = Date.now();

    await RNFS.writeFile(
      MIGRATION_STATUS_FILE,
      JSON.stringify(status, null, 2),
      'utf8'
    );

    console.log(
      `[Migration] Finished: ${status.entriesMigrated} entries, ${status.imagesCopied} images, ${status.errors.length} errors.`
    );
  }
}

export const migrationService = new MigrationService();
