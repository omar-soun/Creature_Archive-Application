import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    StatusBar,
    ScrollView,
    TouchableOpacity,
    TextInput,
    Platform,
    Image,
    Modal,
    Pressable,
    ActivityIndicator,
    Alert,
    RefreshControl,
} from 'react-native';
import BottomTabBar from '../components/BottomTabBar';
import useJournalEntries from '../hooks/useJournalEntries';
import { syncManager } from '../services/syncManager';
import { SyncStatusBadge } from '../components/OfflineIndicator';
import { LocalJournalEntry } from '../types/models';
import { useTheme } from '../context/ThemeContext';

/**
 * ============================================
 * ARCHIVE SCREEN (Offline-First)
 * ============================================
 *
 * Loads journals only from local storage (AsyncStorage).
 * Works fully offline — no backend or cloud reads during load.
 * Sync to cloud can be triggered manually via the sync button.
 *
 * Features:
 * 1. Offline-first local storage data source
 * 2. Animal class filter tabs (All, Mammal, Bird, etc.)
 * 3. Date filter (Year/Month/Date)
 * 4. Search by speciesName, scientificName, tags
 * 5. Long-press to delete with confirmation
 * 6. Sync to Cloud button (backend-mediated two-way sync)
 * 7. Loading skeleton and empty states
 */

interface ArchiveScreenProps {
    onNavigate: (route: any, params?: any) => void;
}

// Animal class options for filter tabs
const CLASS_FILTERS = [
    { label: 'All', value: 'All', icon: '🌍' },
    { label: 'Mammal', value: 'Mammal', icon: '🐾' },
    { label: 'Bird', value: 'Bird', icon: '🐦' },
    { label: 'Reptile', value: 'Reptile', icon: '🦎' },
    { label: 'Amphibian', value: 'Amphibian', icon: '🐸' },
    { label: 'Fish', value: 'Fish', icon: '🐟' },
    { label: 'Insect', value: 'Insect', icon: '🦋' },
];

// Months for date picker
const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

const ArchiveScreen: React.FC<ArchiveScreenProps> = ({ onNavigate }) => {
    // ============================================
    // THEME
    // ============================================
    const { isDarkMode, theme } = useTheme();

    // ============================================
    // HOOKS - Offline-first local storage data
    // ============================================
    const {
        entries,
        isLoading,
        error,
        deleteEntry,
        refresh,
        clearError,
    } = useJournalEntries();

    // ============================================
    // STATE
    // ============================================
    const [searchQuery, setSearchQuery] = useState('');
    const [activeClassFilter, setActiveClassFilter] = useState('All');
    const [isDateModalOpen, setIsDateModalOpen] = useState(false);
    const [selectedYear, setSelectedYear] = useState<number | null>(null);
    const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
    const [selectedDay, setSelectedDay] = useState<number | null>(null);
    const [activeDateFilter, setActiveDateFilter] = useState<string | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // ============================================
    // FILTERING LOGIC
    // ============================================
    const filteredEntries = entries.filter((entry) => {
        // Class filter
        if (activeClassFilter !== 'All' && entry.animalClass !== activeClassFilter) {
            return false;
        }

        // Date filter
        if (selectedYear !== null) {
            const entryDate = new Date(entry.capturedAt);
            const entryYear = entryDate.getFullYear();
            const entryMonth = entryDate.getMonth();
            const entryDay = entryDate.getDate();

            if (entryYear !== selectedYear) return false;
            if (selectedMonth !== null && entryMonth !== selectedMonth) return false;
            if (selectedDay !== null && entryDay !== selectedDay) return false;
        }

        // Search filter
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            const matchesName = entry.speciesName?.toLowerCase().includes(query);
            const matchesScientific = entry.scientificName?.toLowerCase().includes(query);
            const matchesTags = entry.tags?.some((tag: string) => tag.toLowerCase().includes(query));

            if (!matchesName && !matchesScientific && !matchesTags) {
                return false;
            }
        }

        return true;
    });

    // ============================================
    // HANDLERS
    // ============================================

    // Pull to refresh - reload from local storage
    const handleRefresh = useCallback(async () => {
        setIsRefreshing(true);
        await refresh();
        setIsRefreshing(false);
    }, [refresh]);

    // Sync to cloud via backend
    const handleSyncToCloud = useCallback(async () => {
        if (isSyncing) return;
        setIsSyncing(true);
        try {
            const result = await syncManager.sync();
            if (result.success) {
                await refresh();
                Alert.alert(
                    'Sync Complete',
                    `Uploaded: ${result.uploaded}, Downloaded: ${result.downloaded}` +
                    (result.conflicts > 0 ? `, Conflicts resolved: ${result.conflicts}` : '')
                );
            } else {
                const errorMsg = result.errors.length > 0
                    ? result.errors[0]
                    : 'Sync could not complete. Will retry later.';
                Alert.alert('Sync Deferred', errorMsg);
            }
        } catch (error) {
            Alert.alert('Sync Failed', 'Unable to sync data. Please check your connection.');
        } finally {
            setIsSyncing(false);
        }
    }, [isSyncing, refresh]);

    // Clear all filters
    const clearDateFilter = () => {
        setSelectedYear(null);
        setSelectedMonth(null);
        setSelectedDay(null);
        setActiveDateFilter(null);
    };

    // Apply date filter
    const applyDateFilter = () => {
        if (selectedYear) {
            let label = `${selectedYear}`;
            if (selectedMonth !== null) {
                label = `${MONTHS[selectedMonth]} ${selectedYear}`;
                if (selectedDay !== null) {
                    label = `${MONTHS[selectedMonth]} ${selectedDay}, ${selectedYear}`;
                }
            }
            setActiveDateFilter(label);
        }
        setIsDateModalOpen(false);
    };

    // Delete entry with confirmation
    const handleDeleteEntry = useCallback((entry: LocalJournalEntry) => {
        Alert.alert(
            'Delete Journal Entry',
            `Are you sure you want to delete "${entry.speciesName}"? This action cannot be undone.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        if (!entry.localId) return;
                        setDeletingId(entry.localId);
                        try {
                            await deleteEntry(entry.localId);
                        } catch (err) {
                            Alert.alert('Error', 'Failed to delete entry. Please try again.');
                        } finally {
                            setDeletingId(null);
                        }
                    },
                },
            ]
        );
    }, [deleteEntry]);

    // Navigate to entry detail
    const handleEntryPress = useCallback((entry: LocalJournalEntry) => {
        // Convert to format expected by JournalDetailScreen
        const entryDate = new Date(entry.capturedAt);
        const coordinates = entry.latitude && entry.longitude
            ? `${entry.latitude.toFixed(4)}° N, ${entry.longitude.toFixed(4)}° W`
            : '';
        const formattedEntry = {
            id: entry.localId,
            localId: entry.localId,
            firestoreId: entry.firestoreId,
            speciesName: entry.speciesName,
            scientificName: entry.scientificName,
            animalClass: entry.animalClass,
            date: entryDate.toISOString().split('T')[0],
            time: entryDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
            location: entry.locationName || 'Unknown Location',
            coordinates: coordinates,
            confidence: Math.round((entry.confidenceScore || 0) * 100),
            tags: entry.tags || [],
            image: entry.localImageUri ? { uri: entry.localImageUri.startsWith('file://') ? entry.localImageUri : `file://${entry.localImageUri}` } : require('../assets/1.png'),
            notes: entry.notes,
            habitatType: entry.habitatType,
            behavior: entry.behaviorObserved,
            quantity: entry.quantity,
            syncStatus: entry.syncStatus,
        };
        onNavigate('JournalDetail', { entry: formattedEntry });
    }, [onNavigate]);

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

    // Generate years for picker (last 10 years)
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 10 }, (_, i) => currentYear - i);

    // Generate days for selected month
    const getDaysInMonth = (year: number, month: number) => {
        return new Date(year, month + 1, 0).getDate();
    };

    const days = selectedYear && selectedMonth !== null
        ? Array.from({ length: getDaysInMonth(selectedYear, selectedMonth) }, (_, i) => i + 1)
        : [];

    // ============================================
    // RENDER COMPONENTS
    // ============================================

    // Loading skeleton
    const renderSkeleton = () => (
        <View style={styles.listContainer}>
            {[1, 2, 3, 4].map((i) => (
                <View key={i} style={[styles.skeletonCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <View style={[styles.skeletonThumbnail, { backgroundColor: theme.border }]} />
                    <View style={styles.skeletonContent}>
                        <View style={[styles.skeletonTitle, { backgroundColor: theme.border }]} />
                        <View style={[styles.skeletonSubtitle, { backgroundColor: theme.border }]} />
                        <View style={[styles.skeletonMeta, { backgroundColor: theme.border }]} />
                    </View>
                </View>
            ))}
        </View>
    );

    // Empty state
    const renderEmptyState = () => (
        <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>
                {activeClassFilter !== 'All' || activeDateFilter || searchQuery ? '🔍' : '📔'}
            </Text>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
                {activeClassFilter !== 'All' || activeDateFilter || searchQuery
                    ? 'No observations found'
                    : 'No journals yet'}
            </Text>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                {activeClassFilter !== 'All' || activeDateFilter || searchQuery
                    ? 'Try adjusting your filters'
                    : 'Start saving your wildlife discoveries!'}
            </Text>
            {(activeClassFilter !== 'All' || activeDateFilter || searchQuery) ? (
                <TouchableOpacity
                    style={[styles.clearFiltersBtn, { backgroundColor: theme.border }]}
                    onPress={() => {
                        setActiveClassFilter('All');
                        clearDateFilter();
                        setSearchQuery('');
                    }}
                >
                    <Text style={styles.clearFiltersText}>Clear All Filters</Text>
                </TouchableOpacity>
            ) : (
                <TouchableOpacity
                    style={styles.startJournalBtn}
                    onPress={() => onNavigate('ScanSpecies')}
                >
                    <Text style={styles.startJournalText}>Start Your First Journal</Text>
                </TouchableOpacity>
            )}
        </View>
    );

    // Error state
    const renderError = () => (
        <View style={styles.errorState}>
            <Text style={styles.errorIcon}>⚠️</Text>
            <Text style={[styles.errorTitle, { color: theme.text }]}>Something went wrong</Text>
            <Text style={[styles.errorText, { color: theme.textSecondary }]}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => { clearError(); refresh(); }}>
                <Text style={styles.retryText}>Try Again</Text>
            </TouchableOpacity>
        </View>
    );

    // Journal card with swipe actions
    const renderJournalCard = (entry: LocalJournalEntry) => {
        const isDeleting = deletingId === entry.localId;

        return (
            <TouchableOpacity
                key={entry.localId}
                style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }, isDeleting && styles.cardDeleting]}
                activeOpacity={0.7}
                onPress={() => handleEntryPress(entry)}
                onLongPress={() => handleDeleteEntry(entry)}
                disabled={isDeleting}
            >
                {/* Thumbnail */}
                <View style={styles.cardThumbnail}>
                    <Image
                        source={entry.localImageUri ? { uri: entry.localImageUri.startsWith('file://') ? entry.localImageUri : `file://${entry.localImageUri}` } : require('../assets/1.png')}
                        style={[styles.thumbnailImage, { backgroundColor: theme.border }]}
                        resizeMode="cover"
                    />
                    {/* Class Badge */}
                    <View style={[styles.classBadge, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <Text style={styles.classBadgeText}>
                            {CLASS_FILTERS.find(f => f.value === entry.animalClass)?.icon || '🌿'}
                        </Text>
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
                        <Text style={styles.metaIcon}>🕒</Text>
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
    // MAIN RENDER
    // ============================================
    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />


            {/* Header */}
            <View style={[styles.header, { backgroundColor: theme.background }]}>
                <View>
                    <Text style={[styles.headerTitle, { color: theme.text }]}>My Archive</Text>
                    <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>Your Wildlife Journal</Text>
                </View>
                <View style={styles.headerRight}>
                    <Text style={[styles.headerCount, { color: theme.textSecondary }]}>
                        {isLoading ? '...' : `${filteredEntries.length}`} journals
                    </Text>
                </View>
                
            </View>

            {/* Search Bar */}
                <View style={[styles.searchSection, { backgroundColor: theme.background }]}>
                    <View style={[styles.searchContainer, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <Text style={styles.searchIcon}>🔍</Text>
                        <TextInput
                            style={[styles.searchInput, { color: theme.text }]}
                            placeholder="Search species, scientific name, tags..."
                            placeholderTextColor={theme.textSecondary}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                        {searchQuery.length > 0 && (
                            <TouchableOpacity onPress={() => setSearchQuery('')}>
                                <Text style={[styles.clearIcon, { color: theme.textSecondary }]}>✕</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

            {/* Journal Entry List */}
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={isRefreshing || isSyncing}
                        onRefresh={handleSyncToCloud}
                        tintColor="#059669"
                        colors={['#059669']}
                    />
                }
            >
                

                {/* Class Filter Tabs */}
                <View style={[styles.filterTabsContainer, { backgroundColor: theme.background }]}>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.filterTabsScroll}
                    >
                        {/* Date Filter Button */}
                        <View style={styles.dateFilterSection}>
                            <TouchableOpacity
                                style={[
                                    styles.dateFilterBtn,
                                    { backgroundColor: theme.card, borderColor: theme.border },
                                    activeDateFilter && styles.dateFilterBtnActive,
                                    activeDateFilter && { backgroundColor: theme.accentLight },
                                ]}
                                onPress={() => setIsDateModalOpen(true)}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.dateFilterIcon}>📅</Text>
                                <Text style={[
                                    styles.dateFilterText,
                                    { color: theme.text },
                                    activeDateFilter && styles.dateFilterTextActive,
                                ]}>
                                    {activeDateFilter || 'Filter by Date'}
                                </Text>
                                {activeDateFilter && (
                                    <TouchableOpacity
                                        onPress={(e) => {
                                            e.stopPropagation();
                                            clearDateFilter();
                                        }}
                                        style={styles.clearDateBtn}
                                    >
                                        <Text style={styles.clearDateIcon}>✕</Text>
                                    </TouchableOpacity>
                                )}
                            </TouchableOpacity>
                        </View>

                        {CLASS_FILTERS.map((filter) => (
                            <TouchableOpacity
                                key={filter.value}
                                style={[
                                    styles.filterTab,
                                    { backgroundColor: theme.border },
                                    activeClassFilter === filter.value && styles.filterTabActive,
                                ]}
                                onPress={() => setActiveClassFilter(filter.value)}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.filterTabIcon}>{filter.icon}</Text>
                                <Text
                                    style={[
                                        styles.filterTabText,
                                        { color: theme.text },
                                        activeClassFilter === filter.value && styles.filterTabTextActive,
                                    ]}
                                >
                                    {filter.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>

                {/* Content */}
                {error ? (
                    renderError()
                ) : isLoading ? (
                    renderSkeleton()
                ) : filteredEntries.length > 0 ? (
                    <View style={styles.listContainer}>
                        {/* Long press hint */}
                        <Text style={[styles.hintText, { color: theme.textSecondary }]}>Long press to delete</Text>
                        {filteredEntries.map(renderJournalCard)}
                    </View>
                ) : (
                    renderEmptyState()
                )}

                <View style={{ height: 140 }} />
            </ScrollView>

            {/* FAB */}
            <TouchableOpacity
                style={styles.fab}
                activeOpacity={0.85}
                onPress={() => onNavigate('ScanSpecies')}
            >
                <Text style={styles.fabIcon}>+</Text>
            </TouchableOpacity>

            {/* Date Filter Modal */}
            <Modal
                visible={isDateModalOpen}
                transparent
                animationType="fade"
                onRequestClose={() => setIsDateModalOpen(false)}
            >
                <Pressable
                    style={styles.modalOverlay}
                    onPress={() => setIsDateModalOpen(false)}
                >
                    <View style={[styles.dateModal, { backgroundColor: theme.card }]}>
                        <Text style={[styles.dateModalTitle, { color: theme.text }]}>Filter by Date</Text>
                        <Text style={[styles.dateModalSubtitle, { color: theme.textSecondary }]}>
                            Select year, optionally month and day
                        </Text>

                        {/* Year Picker */}
                        <Text style={[styles.pickerLabel, { color: theme.text }]}>Year</Text>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            style={styles.pickerScroll}
                        >
                            {years.map((year) => (
                                <TouchableOpacity
                                    key={year}
                                    style={[
                                        styles.pickerItem,
                                        { backgroundColor: theme.border },
                                        selectedYear === year && styles.pickerItemActive,
                                    ]}
                                    onPress={() => {
                                        setSelectedYear(selectedYear === year ? null : year);
                                        if (selectedYear !== year) {
                                            setSelectedMonth(null);
                                            setSelectedDay(null);
                                        }
                                    }}
                                >
                                    <Text
                                        style={[
                                            styles.pickerItemText,
                                            { color: theme.text },
                                            selectedYear === year && styles.pickerItemTextActive,
                                        ]}
                                    >
                                        {year}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        {/* Month Picker */}
                        {selectedYear && (
                            <>
                                <Text style={[styles.pickerLabel, { color: theme.text }]}>Month (Optional)</Text>
                                <ScrollView
                                    horizontal
                                    showsHorizontalScrollIndicator={false}
                                    style={styles.pickerScroll}
                                >
                                    {MONTHS.map((month, idx) => (
                                        <TouchableOpacity
                                            key={month}
                                            style={[
                                                styles.pickerItem,
                                                { backgroundColor: theme.border },
                                                selectedMonth === idx && styles.pickerItemActive,
                                            ]}
                                            onPress={() => {
                                                setSelectedMonth(selectedMonth === idx ? null : idx);
                                                if (selectedMonth !== idx) setSelectedDay(null);
                                            }}
                                        >
                                            <Text
                                                style={[
                                                    styles.pickerItemText,
                                                    { color: theme.text },
                                                    selectedMonth === idx && styles.pickerItemTextActive,
                                                ]}
                                            >
                                                {month.slice(0, 3)}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </>
                        )}

                        {/* Day Picker */}
                        {selectedYear && selectedMonth !== null && (
                            <>
                                <Text style={styles.pickerLabel}>Day (Optional)</Text>
                                <ScrollView
                                    horizontal
                                    showsHorizontalScrollIndicator={false}
                                    style={styles.pickerScroll}
                                >
                                    {days.map((day) => (
                                        <TouchableOpacity
                                            key={day}
                                            style={[
                                                styles.pickerItemSmall,
                                                selectedDay === day && styles.pickerItemActive,
                                            ]}
                                            onPress={() => setSelectedDay(selectedDay === day ? null : day)}
                                        >
                                            <Text
                                                style={[
                                                    styles.pickerItemText,
                                                    selectedDay === day && styles.pickerItemTextActive,
                                                ]}
                                            >
                                                {day}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </>
                        )}

                        {/* Actions */}
                        <View style={styles.dateModalActions}>
                            <TouchableOpacity
                                style={styles.dateModalCancelBtn}
                                onPress={() => setIsDateModalOpen(false)}
                            >
                                <Text style={styles.dateModalCancelText}>Cancel</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[
                                    styles.dateModalApplyBtn,
                                    !selectedYear && styles.dateModalApplyBtnDisabled,
                                ]}
                                onPress={applyDateFilter}
                                disabled={!selectedYear}
                            >
                                <Text style={styles.dateModalApplyText}>Apply Filter</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Clear Button */}
                        {activeDateFilter && (
                            <TouchableOpacity
                                style={styles.dateModalClearBtn}
                                onPress={() => {
                                    clearDateFilter();
                                    setIsDateModalOpen(false);
                                }}
                            >
                                <Text style={styles.dateModalClearText}>Clear Date Filter</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </Pressable>
            </Modal>

            <BottomTabBar currentRoute="Archive" onNavigate={onNavigate} />
        </View>
    );
};

// ============================================
// STYLES
// ============================================
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
        paddingBottom: 16,
        backgroundColor: '#FFFFFF',
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: '700',
        color: '#111827',
        letterSpacing: -0.5,
    },
    headerSubtitle: {
        fontSize: 15,
        color: '#6B7280',
        fontWeight: '500',
        marginTop: 4,
    },
    headerCount: {
        fontSize: 14,
        color: '#6B7280',
        fontWeight: '500',
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },

    // Search Section
    searchSection: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 5,
        backgroundColor: '#FFFFFF',
    },
    searchContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    searchIcon: {
        fontSize: 16,
        marginRight: 10,
    },
    searchInput: {
        flex: 1,
        fontSize: 15,
        color: '#111827',
        padding: 0,
    },
    clearIcon: {
        fontSize: 14,
        color: '#9CA3AF',
        padding: 4,
    },

    // Class Filter Tabs
    filterTabsContainer: {
        backgroundColor: '#FFFFFF',
    },
    filterTabsScroll: {
        paddingHorizontal: 16,
        paddingVertical: 5,
        gap: 10,
    },
    filterTab: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 24,
        backgroundColor: '#F3F4F6',
        marginRight: 10,
    },
    filterTabActive: {
        backgroundColor: '#059669',
    },
    filterTabIcon: {
        fontSize: 16,
        marginRight: 6,
    },
    filterTabText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#374151',
    },
    filterTabTextActive: {
        color: '#FFFFFF',
    },

    // Date Filter Section
    dateFilterSection: {
        flexDirection: 'row',
    },
    dateFilterBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: '#E5E7EB',
        backgroundColor: '#FFFFFF',
    },
    dateFilterBtnActive: {
        borderColor: '#059669',
        backgroundColor: '#ECFDF5',
    },
    dateFilterIcon: {
        fontSize: 14,
        marginRight: 8,
    },
    dateFilterText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#374151',
    },
    dateFilterTextActive: {
        color: '#059669',
    },
    clearDateBtn: {
        marginLeft: 8,
        padding: 4,
    },
    clearDateIcon: {
        fontSize: 12,
        color: '#059669',
    },

    // Scroll Content
    scrollContent: {
        paddingBottom: 20,
    },

    // Hint text
    hintText: {
        fontSize: 12,
        color: '#9CA3AF',
        textAlign: 'center',
        marginBottom: 12,
    },

    // List & Cards
    listContainer: {
        paddingHorizontal: 16,
        paddingTop: 8,
    },
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
    classBadgeText: {
        fontSize: 12,
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

    // Confidence Badge
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

    // Sync status badge
    syncBadgeContainer: {
        position: 'absolute',
        bottom: 14,
        right: 14,
    },

    // Deleting overlay
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

    // Skeleton Loading
    skeletonCard: {
        flexDirection: 'row',
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 14,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: '#F3F4F6',
    },
    skeletonThumbnail: {
        width: 85,
        height: 85,
        borderRadius: 12,
        backgroundColor: '#F3F4F6',
        marginRight: 14,
    },
    skeletonContent: {
        flex: 1,
        justifyContent: 'center',
    },
    skeletonTitle: {
        height: 18,
        width: '70%',
        backgroundColor: '#F3F4F6',
        borderRadius: 4,
        marginBottom: 8,
    },
    skeletonSubtitle: {
        height: 14,
        width: '50%',
        backgroundColor: '#F3F4F6',
        borderRadius: 4,
        marginBottom: 12,
    },
    skeletonMeta: {
        height: 12,
        width: '40%',
        backgroundColor: '#F3F4F6',
        borderRadius: 4,
    },

    // Empty State
    emptyState: {
        alignItems: 'center',
        paddingVertical: 60,
        paddingHorizontal: 32,
    },
    emptyIcon: {
        fontSize: 56,
        marginBottom: 16,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#111827',
        marginBottom: 8,
    },
    emptyText: {
        fontSize: 14,
        color: '#6B7280',
        textAlign: 'center',
        marginBottom: 20,
    },
    clearFiltersBtn: {
        paddingHorizontal: 20,
        paddingVertical: 12,
        backgroundColor: '#F3F4F6',
        borderRadius: 12,
    },
    clearFiltersText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#059669',
    },
    startJournalBtn: {
        paddingHorizontal: 24,
        paddingVertical: 14,
        backgroundColor: '#059669',
        borderRadius: 12,
    },
    startJournalText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#FFFFFF',
    },

    // Error State
    errorState: {
        alignItems: 'center',
        paddingVertical: 60,
        paddingHorizontal: 32,
    },
    errorIcon: {
        fontSize: 48,
        marginBottom: 16,
    },
    errorTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#111827',
        marginBottom: 8,
    },
    errorText: {
        fontSize: 14,
        color: '#6B7280',
        textAlign: 'center',
        marginBottom: 20,
    },
    retryBtn: {
        paddingHorizontal: 24,
        paddingVertical: 12,
        backgroundColor: '#059669',
        borderRadius: 12,
    },
    retryText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#FFFFFF',
    },

    // FAB
    fab: {
        position: 'absolute',
        bottom: Platform.OS === 'ios' ? 110 : 90,
        right: 20,
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#059669',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#059669',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
        elevation: 8,
        zIndex: 100,
    },
    fabIcon: {
        fontSize: 32,
        color: '#FFFFFF',
        fontWeight: '300',
        marginTop: -2,
    },

    // Date Modal
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    dateModal: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingTop: 24,
        paddingBottom: Platform.OS === 'ios' ? 40 : 24,
        paddingHorizontal: 20,
    },
    dateModalTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#111827',
        marginBottom: 4,
    },
    dateModalSubtitle: {
        fontSize: 14,
        color: '#6B7280',
        marginBottom: 20,
    },
    pickerLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#374151',
        marginBottom: 10,
        marginTop: 8,
    },
    pickerScroll: {
        marginBottom: 12,
    },
    pickerItem: {
        paddingHorizontal: 18,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: '#F3F4F6',
        marginRight: 10,
    },
    pickerItemSmall: {
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 10,
        backgroundColor: '#F3F4F6',
        marginRight: 8,
        minWidth: 44,
        alignItems: 'center',
    },
    pickerItemActive: {
        backgroundColor: '#059669',
    },
    pickerItemText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#374151',
    },
    pickerItemTextActive: {
        color: '#FFFFFF',
    },
    dateModalActions: {
        flexDirection: 'row',
        marginTop: 24,
        gap: 12,
    },
    dateModalCancelBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
    },
    dateModalCancelText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#374151',
    },
    dateModalApplyBtn: {
        flex: 2,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: '#059669',
        alignItems: 'center',
    },
    dateModalApplyBtnDisabled: {
        backgroundColor: '#9CA3AF',
    },
    dateModalApplyText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    dateModalClearBtn: {
        marginTop: 12,
        paddingVertical: 12,
        alignItems: 'center',
    },
    dateModalClearText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#DC2626',
    },
});

export default ArchiveScreen;
