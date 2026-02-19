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
    RefreshControl,
} from 'react-native';
import FontAwesome6 from 'react-native-vector-icons/FontAwesome6';
import BottomTabBar from '../../../shared/components/BottomTabBar';
import useJournalEntries from '../../../features/journal/hooks/useJournalEntries';
import { syncManager } from '../../../services/sync';
import { LocalJournalEntry } from '../../../core/types';
import { useTheme } from '../../../core/theme';
import { useAlert } from '../../../core/alerts';
import useArchiveFilters from '../hooks/useArchiveFilters';
import JournalCard from '../components/JournalCard';
import DateFilterModal from '../components/DateFilterModal';
import { CLASS_FILTERS } from '../constants';

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

const ArchiveScreen: React.FC<ArchiveScreenProps> = ({ onNavigate }) => {
    // ============================================
    // THEME
    // ============================================
    const { isDarkMode, theme } = useTheme();
    const { showAlert } = useAlert();

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
    // FILTER HOOK
    // ============================================
    const {
        searchQuery,
        setSearchQuery,
        activeClassFilter,
        setActiveClassFilter,
        isDateModalOpen,
        setIsDateModalOpen,
        selectedYear,
        setSelectedYear,
        selectedMonth,
        setSelectedMonth,
        selectedDay,
        setSelectedDay,
        activeDateFilter,
        filteredEntries,
        clearDateFilter,
        applyDateFilter,
    } = useArchiveFilters(entries);

    // ============================================
    // STATE
    // ============================================
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

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
                showAlert(
                    'Sync Complete',
                    `Uploaded: ${result.uploaded}, Downloaded: ${result.downloaded}` +
                    (result.conflicts > 0 ? `, Conflicts resolved: ${result.conflicts}` : '')
                );
            } else {
                const errorMsg = result.errors.length > 0
                    ? result.errors[0]
                    : 'Sync could not complete. Will retry later.';
                showAlert('Sync Deferred', errorMsg);
            }
        } catch (error) {
            showAlert('Sync Failed', 'Unable to sync data. Please check your connection.');
        } finally {
            setIsSyncing(false);
        }
    }, [isSyncing, refresh]);

    // Delete entry with confirmation
    const handleDeleteEntry = useCallback((entry: LocalJournalEntry) => {
        showAlert(
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
                            showAlert('Error', 'Failed to delete entry. Please try again.');
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
            image: entry.localImageUri ? { uri: entry.localImageUri.startsWith('file://') ? entry.localImageUri : `file://${entry.localImageUri}` } : require('../../../assets/1.png'),
            notes: entry.notes,
            habitatType: entry.habitatType,
            behavior: entry.behaviorObserved,
            quantity: entry.quantity,
            syncStatus: entry.syncStatus,
        };
        onNavigate('JournalDetail', { entry: formattedEntry });
    }, [onNavigate]);

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
            <FontAwesome6 name={activeClassFilter !== 'All' || activeDateFilter || searchQuery ? 'magnifying-glass' : 'book'} size={56} color={theme.textSecondary} style={styles.emptyIcon} />
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
            <FontAwesome6 name="triangle-exclamation" size={48} color="#F59E0B" style={styles.errorIcon} />
            <Text style={[styles.errorTitle, { color: theme.text }]}>Something went wrong</Text>
            <Text style={[styles.errorText, { color: theme.textSecondary }]}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => { clearError(); refresh(); }}>
                <Text style={styles.retryText}>Try Again</Text>
            </TouchableOpacity>
        </View>
    );

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
                        <FontAwesome6 name="magnifying-glass" size={16} color={theme.textSecondary} style={styles.searchIcon} />
                        <TextInput
                            style={[styles.searchInput, { color: theme.text }]}
                            placeholder="Search species, scientific name, tags..."
                            placeholderTextColor={theme.textSecondary}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                        {searchQuery.length > 0 && (
                            <TouchableOpacity onPress={() => setSearchQuery('')}>
                                <FontAwesome6 name="xmark" size={14} color={theme.textSecondary} style={styles.clearIcon} />
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
                                <FontAwesome6 name="calendar" size={14} color={activeDateFilter ? '#059669' : theme.textSecondary} style={styles.dateFilterIcon} />
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
                                        <FontAwesome6 name="xmark" size={12} color="#059669" />
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
                                <FontAwesome6 name={filter.icon} size={16} color={activeClassFilter === filter.value ? '#FFFFFF' : isDarkMode ? theme.text : '#374151'} style={styles.filterTabIcon} />
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
                        {filteredEntries.map((entry) => (
                            <JournalCard
                                key={entry.localId}
                                entry={entry}
                                isDeleting={deletingId === entry.localId}
                                onPress={() => handleEntryPress(entry)}
                                onLongPress={() => handleDeleteEntry(entry)}
                                theme={theme}
                            />
                        ))}
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
            <DateFilterModal
                isVisible={isDateModalOpen}
                onClose={() => setIsDateModalOpen(false)}
                selectedYear={selectedYear}
                setSelectedYear={setSelectedYear}
                selectedMonth={selectedMonth}
                setSelectedMonth={setSelectedMonth}
                selectedDay={selectedDay}
                setSelectedDay={setSelectedDay}
                activeDateFilter={activeDateFilter}
                onApply={applyDateFilter}
                onClear={clearDateFilter}
                theme={theme}
            />

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
        paddingBottom: 5,
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

    // List
    listContainer: {
        paddingHorizontal: 16,
        paddingTop: 8,
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
});

export default ArchiveScreen;
