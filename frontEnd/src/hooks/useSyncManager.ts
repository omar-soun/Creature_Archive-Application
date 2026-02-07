/**
 * useSyncManager Hook (Disabled)
 *
 * Backend sync is disabled. This hook is retained as a no-op stub
 * so existing imports don't break. No network requests are made.
 */

import { SyncState } from '../types/models';

interface UseSyncManagerReturn {
  syncState: SyncState;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncTime: number | null;
}

const noopState: SyncState = {
  isSyncing: false,
  lastSyncTime: null,
  lastSyncResult: null,
  pendingCount: 0,
};

export function useSyncManager(): UseSyncManagerReturn {
  return {
    syncState: noopState,
    isSyncing: false,
    pendingCount: 0,
    lastSyncTime: null,
  };
}
