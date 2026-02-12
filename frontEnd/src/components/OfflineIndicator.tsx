/**
 * Sync Status Components
 *
 * Provides visual indicators for per-entry sync status.
 * No network awareness — only reads the syncStatus field value.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import FontAwesome6 from 'react-native-vector-icons/FontAwesome6';

/**
 * SyncStatusBadge Component
 *
 * Small badge to show sync status on individual journal entries.
 */
interface SyncStatusBadgeProps {
  syncStatus: 'synced' | 'pending' | 'failed';
  size?: 'small' | 'medium';
}

export function SyncStatusBadge({
  syncStatus,
  size = 'small',
}: SyncStatusBadgeProps) {
  const getStatusConfig = () => {
    switch (syncStatus) {
      case 'synced':
        return { color: '#4CAF50', icon: 'check', label: 'Synced' };
      case 'pending':
        return { color: '#FF9800', icon: 'arrow-up', label: 'Pending' };
      case 'failed':
        return { color: '#F44336', icon: 'exclamation', label: 'Failed' };
      default:
        return { color: '#9E9E9E', icon: 'circle-question', label: 'Unknown' };
    }
  };

  const config = getStatusConfig();
  const badgeSize = size === 'small' ? 16 : 24;
  const fontSize = size === 'small' ? 10 : 14;

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: config.color,
          width: badgeSize,
          height: badgeSize,
          borderRadius: badgeSize / 2,
        },
      ]}
    >
      <FontAwesome6 name={config.icon} size={fontSize} color="#FFFFFF" />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
});
