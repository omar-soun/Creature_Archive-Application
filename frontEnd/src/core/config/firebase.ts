/**
 * Firebase Configuration
 *
 * Firebase is auto-initialized from configuration files:
 * - Android: google-services.json in android/app/
 * - iOS: GoogleService-Info.plist in ios/
 *
 * These files must be obtained from Firebase Console after creating your project.
 */

import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';

/**
 * Firebase Authentication
 *
 * Handles user signup, signin, and password management
 * Passwords are never stored in Firestore - Firebase Auth handles them securely
 */
export { auth };

/**
 * Cloud Firestore
 *
 * Database for users and journal_entries collections
 * Security rules enforce owner-only access
 */
export { firestore };

/**
 * Cloud Storage
 *
 * Image storage for journal entry photos
 * Images stored at: users/{userId}/images/{imageId}
 */
export { storage };

/**
 * Firestore collection names
 */
export const COLLECTIONS = {
  USERS: 'users',
  JOURNAL_ENTRIES: 'journal_entries',
} as const;

/**
 * Local storage keys for offline support
 */
export const LOCAL_STORAGE_KEYS = {
  PENDING_ENTRIES: 'pending_entries',
  CACHED_ENTRIES: 'cached_entries',
  LAST_SYNC: 'last_sync',
} as const;
