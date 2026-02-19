import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Image,
    ActivityIndicator,
} from 'react-native';
import FontAwesome6 from 'react-native-vector-icons/FontAwesome6';
import { SyncStatusBadge } from '../../../shared/components/OfflineIndicator';
import { LocalJournalEntry } from '../../../core/types';
import { CLASS_FILTERS } from '../constants';

interface JournalCardProps {
    entry: LocalJournalEntry;
    isDeleting: boolean;
    onPress: () => void;
    onLongPress: () => void;
    theme: any;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

// Format display date
const formatDisplayDate = (entry: LocalJournalEntry): string => {
    const date = new Date(entry.capturedAt);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const formatDisplayTime = (entry: LocalJournalEntry): string => {
    const date = new Date(entry.capturedAt);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

// Confidence colors
const getConfidenceColor = (confidence: number) => {
    const percent = confidence <= 1 ? confidence * 100 : confidence;
    if (percent >= 90) return '#059669';
    if (percent >= 80) return '#D97706';
    return '#DC2626';
};

const getConfidenceBackground = (confidence: number) => {
    const percent = confidence <= 1 ? confidence * 100 : confidence;
    if (percent >= 90) return '#ECFDF5';
    if (percent >= 80) return '#FFFBEB';
    return '#FEF2F2';
};

const getConfidencePercent = (confidence: number) => {
    return confidence <= 1 ? Math.round(confidence * 100) : Math.round(confidence);
};

// ============================================
// COMPONENT
// ============================================

const JournalCard: React.FC<JournalCardProps> = ({ entry, isDeleting, onPress, onLongPress, theme }) => {
    return (
        <TouchableOpacity
            style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }, isDeleting && styles.cardDeleting]}
            activeOpacity={0.7}
            onPress={onPress}
            onLongPress={onLongPress}
            disabled={isDeleting}
        >
            {/* Thumbnail */}
            <View style={styles.cardThumbnail}>
                <Image
                    source={entry.localImageUri ? { uri: entry.localImageUri.startsWith('file://') ? entry.localImageUri : `file://${entry.localImageUri}` } : require('../../../assets/1.png')}
                    style={[styles.thumbnailImage, { backgroundColor: theme.border }]}
                    resizeMode="cover"
                />
                {/* Class Badge */}
                <View style={[styles.classBadge, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <FontAwesome6 name={CLASS_FILTERS.find(f => f.value === entry.animalClass)?.icon || 'leaf'} size={14} color={theme.textSecondary} />
                </View>
            </View>

            {/* Content */}
            <View style={styles.cardContent}>
                <Text style={[styles.speciesName, { color: theme.text }]} numberOfLines={1}>
                    {entry.speciesName}
                </Text>
                <Text style={[styles.scientificName, { color: theme.textSecondary }]} numberOfLines={1}>
                    {entry.scientificName}
                </Text>

                <View style={styles.metadataRow}>
                    <FontAwesome6 name="clock" size={12} color={theme.textSecondary} iconStyle="regular" style={styles.metaIcon} />
                    <Text style={[styles.metaText, { color: theme.textSecondary }]}>
                        {formatDisplayDate(entry)}, {formatDisplayTime(entry)}
                    </Text>
                </View>

                {/* Tags */}
                {entry.tags && entry.tags.length > 0 && (
                    <View style={styles.tagsRow}>
                        {entry.tags.slice(0, 3).map((tag, idx) => (
                            <View key={idx} style={[styles.tag, { backgroundColor: theme.border }]}>
                                <Text style={[styles.tagText, { color: theme.textSecondary }]}>{tag}</Text>
                            </View>
                        ))}
                    </View>
                )}
            </View>

            {/* Confidence Badge */}
            <View
                style={[
                    styles.confidenceBadge,
                    { backgroundColor: getConfidenceBackground(entry.confidenceScore) },
                ]}
            >
                <Text
                    style={[
                        styles.confidenceText,
                        { color: getConfidenceColor(entry.confidenceScore) },
                    ]}
                >
                    {getConfidencePercent(entry.confidenceScore)}%
                </Text>
            </View>

            {/* Sync Status Badge */}
            {entry.syncStatus !== 'synced' && (
                <View style={styles.syncBadgeContainer}>
                    <SyncStatusBadge syncStatus={entry.syncStatus} size="small" />
                </View>
            )}

            {/* Delete indicator */}
            {isDeleting && (
                <View style={styles.deletingOverlay}>
                    <ActivityIndicator color="#DC2626" size="small" />
                </View>
            )}
        </TouchableOpacity>
    );
};

// ============================================
// STYLES
// ============================================
const styles = StyleSheet.create({
    card: {
        flexDirection: 'row',
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 14,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: '#F3F4F6',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    cardDeleting: {
        opacity: 0.5,
    },
    cardThumbnail: {
        marginRight: 14,
        position: 'relative',
    },
    thumbnailImage: {
        width: 85,
        height: 85,
        borderRadius: 12,
        backgroundColor: '#F3F4F6',
    },
    classBadge: {
        position: 'absolute',
        bottom: -4,
        right: -4,
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: '#F3F4F6',
    },
    cardContent: {
        flex: 1,
        justifyContent: 'center',
        paddingRight: 45,
    },
    speciesName: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111827',
        marginBottom: 2,
    },
    scientificName: {
        fontSize: 13,
        color: '#6B7280',
        fontStyle: 'italic',
        marginBottom: 8,
    },
    metadataRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
    metaIcon: {
        fontSize: 11,
        marginRight: 6,
        width: 16,
    },
    metaText: {
        fontSize: 12,
        color: '#4B5563',
        flex: 1,
    },
    tagsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginTop: 6,
        gap: 6,
    },
    tag: {
        backgroundColor: '#F3F4F6',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
    },
    tagText: {
        fontSize: 10,
        color: '#6B7280',
        fontWeight: '500',
    },
    confidenceBadge: {
        position: 'absolute',
        top: 14,
        right: 14,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 8,
    },
    confidenceText: {
        fontSize: 13,
        fontWeight: '700',
    },
    syncBadgeContainer: {
        position: 'absolute',
        bottom: 14,
        right: 14,
    },
    deletingOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(255,255,255,0.7)',
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
});

export default JournalCard;
