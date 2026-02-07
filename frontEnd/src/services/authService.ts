/**
 * Authentication Service
 *
 * Handles user authentication and profile management using Firebase Auth and Firestore
 * Priority 1 implementation - matches DATABASE_SCHEMA_FINAL.md schema
 * Updated to use Modular API (Firebase v9+ style)
 */

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateEmail,
  updatePassword,
  FirebaseAuthTypes
} from '@react-native-firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromCache,
  onSnapshot,
} from '@react-native-firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, SignUpData } from '../types/models';
import { COLLECTIONS } from '../config/firebase';
import { apiService } from './apiService';
import { fileStorageService } from './fileStorageService';

const PROFILE_CACHE_KEY = '@creature_archive_cached_profile';

// Initialize instances
const auth = getAuth();
const db = getFirestore();

export class AuthService {
  /**
   * Register new user with email/password
   */
  async signUp(signUpData: SignUpData): Promise<User> {
    const { email, password, firstName, lastName, institution, currentRole } = signUpData;

    // 1. Create Firebase Auth account
    let userCredential;
    try {
      userCredential = await createUserWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      console.error('Firebase Auth sign up failed:', error);
      throw new Error(this.getAuthErrorMessage(error));
    }

    const userId = userCredential.user.uid;

    // 2. Try to create user profile via Backend API
    try {
      const userProfile = await apiService.signup({
        email,
        firstName,
        lastName,
        institution,
        currentRole,
      });
      console.log(`User created successfully via API: ${userId}`);

      // Cache profile locally for offline access
      const cached = { uid: userId, email, firstName, lastName, institution, currentRole };
      await AsyncStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(cached)).catch(() => {});

      return userProfile as any as User;
    } catch (backendError: any) {
      // Backend unreachable — save profile locally, don't delete the auth user
      console.warn('Backend profile creation failed, caching locally:', backendError.message);

      const cachedProfile = { uid: userId, email, firstName, lastName, institution, currentRole };
      await AsyncStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(cachedProfile)).catch(() => {});

      return {
        uid: userId,
        email,
        firstName,
        lastName,
        institution,
        currentRole,
        createdAt: new Date().toISOString(),
      } as any as User;
    }
  }

  /**
   * Retry sending a cached profile to the backend.
   * Called on app startup when a user is already authenticated — handles the case
   * where signup succeeded in Firebase Auth but the backend was unreachable.
   */
  async retryCachedProfileCreation(): Promise<void> {
    try {
      const cached = await AsyncStorage.getItem(PROFILE_CACHE_KEY);
      if (!cached) return;

      const profile = JSON.parse(cached);

      // Check if the backend already has this profile
      try {
        await apiService.getCurrentUser();
        // Profile exists on backend — clear the cache
        await AsyncStorage.removeItem(PROFILE_CACHE_KEY);
        console.log('Cached profile already exists on backend, cache cleared.');
        return;
      } catch {
        // Profile not on backend yet — proceed to create it
      }

      await apiService.signup({
        email: profile.email,
        firstName: profile.firstName,
        lastName: profile.lastName,
        institution: profile.institution || '',
        currentRole: profile.currentRole || '',
      });

      // Success — clear the cache
      await AsyncStorage.removeItem(PROFILE_CACHE_KEY);
      console.log('Cached profile successfully sent to backend.');
    } catch (error: any) {
      // Still can't reach backend — will retry on next app launch
      console.warn('Profile retry failed (will try again later):', error.message);
    }
  }

  /**
   * Sign in existing user
   */
  async signIn(
    email: string,
    password: string
  ): Promise<FirebaseAuthTypes.UserCredential> {
    try {
      // MODULAR: Functional call
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      console.log(`User signed in: ${userCredential.user.uid}`);
      return userCredential;
    } catch (error: any) {
      console.error('Sign in failed:', error);
      throw new Error(this.getAuthErrorMessage(error));
    }
  }

  /**
   * Sign out current user
   */
  async signOut(): Promise<void> {
    try {
      const currentUser = auth.currentUser;
      // MODULAR: Functional call
      await signOut(auth);
      console.log(`User signed out: ${currentUser?.uid}`);
    } catch (error: any) {
      console.error('Sign out failed:', error);
      throw new Error('Failed to sign out. Please try again.');
    }
  }

  /**
   * Get current authenticated user
   */
  getCurrentUser(): FirebaseAuthTypes.User | null {
    // MODULAR: Property access on auth instance
    return auth.currentUser;
  }

  /**
   * Get current user's profile from Firestore
   */
  async getCurrentUserProfile(): Promise<User | null> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        return null;
      }

      // MODULAR: Create doc ref and getDoc
      const userRef = doc(db, COLLECTIONS.USERS, currentUser.uid);

      let docSnap;
      try {
        docSnap = await getDoc(userRef);
      } catch (err: any) {
        // Fallback to cache if offline/unavailable
        if (err.code === 'firestore/unavailable' || err.message?.includes('unavailable')) {
          console.log('Firestore offline (expected), falling back to cache');
          try {
            docSnap = await getDocFromCache(userRef);
          } catch (cacheErr) {
            console.warn('Cache also unavailable');
            return null;
          }
        } else {
          throw err;
        }
      }

      if (!docSnap.exists) {
        console.warn(`User profile not found for: ${currentUser.uid}`);
        return null;
      }

      return docSnap.data() as User;
    } catch (error: any) {
      console.warn('Failed to get user profile (likely offline):', error.message);
      // Return null instead of throwing to prevent app crash/noise
      return null;
    }
  }

  /**
   * Get user profile by user ID
   */
  async getUserProfile(userId: string): Promise<User | null> {
    try {
      const userRef = doc(db, COLLECTIONS.USERS, userId);
      const docSnap = await getDoc(userRef);

      if (!docSnap.exists) {
        return null;
      }

      return docSnap.data() as User;
    } catch (error: any) {
      console.error('Failed to get user profile:', error);
      throw new Error('Failed to load user profile.');
    }
  }

  /**
   * Subscribe to user profile changes
   */
  subscribeToUserProfile(userId: string, onUpdate: (user: User | null) => void): () => void {
    const userRef = doc(db, COLLECTIONS.USERS, userId);
    return onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) {
        onUpdate(docSnap.data() as User);
      } else {
        onUpdate(null);
      }
    }, (error) => {
      console.error('Profile subscription error:', error);
      // Optional: onUpdate(null) or handle error
    });
  }

  /**
   * Update user profile via backend API
   */
  async updateProfile(userId: string, updates: Partial<User>): Promise<void> {
    try {
      await apiService.updateProfile(updates);
      console.log(`User profile updated via backend: ${userId}`);
    } catch (error: any) {
      console.error('Failed to update profile:', error);
      throw new Error('Failed to update profile. Please try again.');
    }
  }

  /**
   * Upload profile image and update user profile.
   * Image is saved locally first, then uploaded via the backend
   * (frontend does NOT access Firebase Storage directly).
   */
  async updateProfileImage(userId: string, imageUri: string): Promise<string> {
    try {
      if (!imageUri) {
        throw new Error('No image URI provided');
      }

      // 1. Copy image to persistent local storage
      const localPath = await fileStorageService.saveProfileImage(imageUri);

      // 2. Upload to Firebase Storage via backend
      try {
        const { imageUrl } = await apiService.uploadProfileImage(localPath);

        // 3. Update profile with cloud URL via backend
        await this.updateProfile(userId, { profileImage: imageUrl });
      } catch (uploadErr) {
        // Upload failed (offline, etc.) — local image is still saved
        console.warn('Profile image upload to cloud failed, saved locally:', uploadErr);
      }

      console.log('Profile image updated successfully');
      return localPath;
    } catch (error: any) {
      console.error('Failed to update profile image:', error);
      throw new Error('Failed to update profile image.');
    }
  }

  /**
   * Listen to authentication state changes
   * THIS WAS THE SOURCE OF YOUR ERROR
   */
  onAuthStateChanged(
    callback: (user: FirebaseAuthTypes.User | null) => void
  ): () => void {
    // MODULAR: Pass auth instance as first arg
    return onAuthStateChanged(auth, callback);
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(email: string): Promise<void> {
    try {
      // MODULAR: Functional call
      await sendPasswordResetEmail(auth, email);
      console.log(`Password reset email sent to: ${email}`);
    } catch (error: any) {
      console.error('Failed to send password reset email:', error);
      throw new Error(this.getAuthErrorMessage(error));
    }
  }

  /**
   * Update user email
   */
  async updateEmail(newEmail: string): Promise<void> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('No user signed in');
      }

      // MODULAR: Pass USER instance as first arg
      await updateEmail(currentUser, newEmail);

      await this.updateProfile(currentUser.uid, { email: newEmail });

      console.log(`Email updated to: ${newEmail}`);
    } catch (error: any) {
      console.error('Failed to update email:', error);
      throw new Error(this.getAuthErrorMessage(error));
    }
  }

  /**
   * Update user password
   */
  async updatePassword(newPassword: string): Promise<void> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('No user signed in');
      }

      // MODULAR: Pass USER instance as first arg
      await updatePassword(currentUser, newPassword);
      console.log('Password updated successfully');
    } catch (error: any) {
      console.error('Failed to update password:', error);
      throw new Error(this.getAuthErrorMessage(error));
    }
  }

  /**
   * Delete user account via backend API
   * Backend handles: Firestore profile deletion, journal entries cleanup, and Firebase Auth record removal.
   */
  async deleteAccount(): Promise<void> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('No user signed in');
      }

      const userId = currentUser.uid;

      // Backend deletes Firestore profile, journal entries, and Firebase Auth record
      await apiService.deleteAccount();

      // Sign out locally after backend completes deletion
      await signOut(auth);

      console.log(`Account deleted via backend: ${userId}`);
    } catch (error: any) {
      console.error('Failed to delete account:', error);
      throw new Error('Failed to delete account. Please try again.');
    }
  }

  isAuthenticated(): boolean {
    return auth.currentUser !== null;
  }

  private getAuthErrorMessage(error: any): string {
    const code = error.code;
    // ... (Error handling remains same)
    switch (code) {
      case 'auth/email-already-in-use':
        return 'This email is already registered. Please sign in instead.';
      case 'auth/invalid-email':
        return 'Invalid email address.';
      case 'auth/weak-password':
        return 'Password is too weak. Please use at least 6 characters.';
      case 'auth/user-not-found':
        return 'No account found with this email.';
      case 'auth/wrong-password':
        return 'Incorrect password.';
      case 'auth/too-many-requests':
        return 'Too many failed attempts. Please try again later.';
      case 'auth/network-request-failed':
        return 'Network error. Please check your connection.';
      case 'auth/requires-recent-login':
        return 'Please sign in again to complete this action.';
      default:
        return error.message || 'Authentication failed. Please try again.';
    }
  }
}

export default new AuthService();