/**
 * useJournalEntries Hook (Local-Only)
 *
 * React hook for journal entries using local storage only.
 * No backend sync, no network requests.
 *
 * Architecture:
 * - Local storage (AsyncStorage) is the sole data source
 * - All CRUD operations happen locally
 * - No sync triggers, no backend communication
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getAuth, onAuthStateChanged } from '@react-native-firebase/auth';
import { localStorageService } from '../services/localStorageService';
import {
  LocalJournalEntry,
  CreateLocalJournalData,
  UpdateLocalJournalData,
  AnimalClass,
} from '../types/models';

// Initialize auth instance
const auth = getAuth();

export interface UseJournalEntriesReturn {
  entries: LocalJournalEntry[];
  isLoading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  createEntry: (data: CreateEntryData) => Promise<string>;
  updateEntry: (localId: string, data: UpdateLocalJournalData) => Promise<void>;
  deleteEntry: (localId: string) => Promise<void>;
  refresh: () => Promise<void>;
  clearError: () => void;
}

export interface CreateEntryData {
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

export function useJournalEntries(): UseJournalEntriesReturn {
  const [entries, setEntries] = useState<LocalJournalEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const isMountedRef = useRef(true);

  /**
   * Load entries from local storage
   */
  const loadLocalEntries = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) {
      setEntries([]);
      return;
    }

    try {
      const localEntries = await localStorageService.getEntries(user.uid);
      if (isMountedRef.current) {
        setEntries(localEntries);
      }
    } catch (err) {
      console.error('Failed to load local entries:', err);
      if (isMountedRef.current) {
        setError('Failed to load journals from local storage.');
      }
    }
  }, []);

  /**
   * Initialize: Load from local storage
   */
  const initialize = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) {
      setIsAuthenticated(false);
      setIsLoading(false);
      setEntries([]);
      return;
    }

    setIsAuthenticated(true);
    setIsLoading(true);
    setError(null);

    await loadLocalEntries();

    if (isMountedRef.current) {
      setIsLoading(false);
    }
  }, [loadLocalEntries]);

  /**
   * Listen for auth state changes
   */
  useEffect(() => {
    isMountedRef.current = true;

    const authUnsubscribe = onAuthStateChanged(auth, user => {
      if (user) {
        initialize();
      } else {
        setIsAuthenticated(false);
        setEntries([]);
        setIsLoading(false);
      }
    });

    return () => {
      isMountedRef.current = false;
      authUnsubscribe();
    };
  }, [initialize]);

  /**
   * Create a new journal entry (local storage only)
   */
  const createEntry = useCallback(
    async (data: CreateEntryData): Promise<string> => {
      const user = auth.currentUser;
      if (!user) {
        throw new Error('User not authenticated');
      }

      setError(null);

      try {
        const createData: CreateLocalJournalData = {
          userId: user.uid,
          speciesName: data.speciesName,
          scientificName: data.scientificName,
          confidenceScore: data.confidenceScore,
          localImageUri: data.localImageUri,
          latitude: data.latitude || 0,
          longitude: data.longitude || 0,
          locationName: data.locationName,
          capturedAt: data.capturedAt?.getTime() || Date.now(),
          notes: data.notes,
          tags: data.tags,
          behaviorObserved: data.behaviorObserved,
          quantity: data.quantity,
          habitatType: data.habitatType,
          animalClass: data.animalClass as AnimalClass,
        };

        const entry = await localStorageService.createEntry(createData);

        if (isMountedRef.current) {
          setEntries(prev => [entry, ...prev]);
        }

        return entry.localId;
      } catch (err: any) {
        const errorMessage = err.message || 'Failed to create journal entry.';
        setError(errorMessage);
        throw new Error(errorMessage);
      }
    },
    []
  );

  /**
   * Update an existing journal entry (local storage only)
   */
  const updateEntry = useCallback(
    async (localId: string, data: UpdateLocalJournalData): Promise<void> => {
      setError(null);

      try {
        const updated = await localStorageService.updateEntry(localId, data);

        if (updated && isMountedRef.current) {
          setEntries(prev =>
            prev.map(e => (e.localId === localId ? updated : e))
          );
        }
      } catch (err: any) {
        const errorMessage = err.message || 'Failed to update journal entry.';
        setError(errorMessage);
        throw new Error(errorMessage);
      }
    },
    []
  );

  /**
   * Delete a journal entry (local storage only)
   */
  const deleteEntry = useCallback(async (localId: string): Promise<void> => {
    setError(null);

    try {
      await localStorageService.deleteEntry(localId);

      if (isMountedRef.current) {
        setEntries(prev => prev.filter(e => e.localId !== localId));
      }
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to delete journal entry.';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, []);

  /**
   * Manually refresh entries from local storage
   */
  const refresh = useCallback(async (): Promise<void> => {
    await loadLocalEntries();
  }, [loadLocalEntries]);

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    entries,
    isLoading,
    error,
    isAuthenticated,
    createEntry,
    updateEntry,
    deleteEntry,
    refresh,
    clearError,
  };
}

export default useJournalEntries;
