import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    StatusBar,
    ScrollView,
    TouchableOpacity,
    Platform,
    Image,
    Modal,
    Pressable,
    Share,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useAlert } from '../context/AlertContext';
import FontAwesome6 from 'react-native-vector-icons/FontAwesome6';

/**
 * ============================================
 * JOURNAL DETAIL SCREEN
 * ============================================
 * 
 * Purpose: Display complete, immutable details of a wildlife sighting
 * Trigger: User selects an item from Archive/Journal list
 * Type: Read View (vs Edit View)
 */

interface LocationData {
    latitude: number;
    longitude: number;
}

interface JournalEntry {
    id: string;
    speciesName: string;
    scientificName: string;
    animalClass: string;
    confidence: number;
    date: string;
    time: string;
    location?: LocationData | null;
    coordinates?: string;
    locationName?: string;
    behavior?: string;
    quantity?: number;
    habitatType?: string;
    tags: string[];
    notes?: string;
    photoUri?: string;
    image?: any;
    createdAt: string;
}

interface JournalDetailScreenProps {
    onNavigate: (route: any, params?: any) => void;
    onBack: () => void;
    routeParams?: {
        entryId?: string;
        entry?: JournalEntry;
    };
}

const JournalDetailScreen: React.FC<JournalDetailScreenProps> = ({
    onNavigate,
    onBack,
    routeParams,
}) => {
    const { isDarkMode, theme } = useTheme();
    const { showAlert } = useAlert();

    // Menu state
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    // Sample entry data (would come from routeParams.entry or fetched by entryId)
    const entry: JournalEntry = routeParams?.entry || {
        id: '1',
        speciesName: 'Red-tailed Hawk',
        scientificName: 'Buteo jamaicensis',
        animalClass: 'Bird',
        confidence: 95,
        date: 'December 29, 2024',
        time: '2:34 PM EST',
        location: { latitude: 40.7128, longitude: -74.0060 },
        locationName: 'Cedar Ridge Trail, NY',
        behavior: 'Perched, Scanning',
        quantity: 1,
        habitatType: 'Deciduous Forest',
        tags: ['Raptor', 'Diurnal', 'Predator'],
        notes: 'Observed single adult Red-tailed Hawk perched on bare oak branch approximately 15 meters above ground. Bird exhibited typical hunting posture with upright stance and alert behavior, head moving methodically to scan surrounding meadow. Distinctive rufous tail visible when bird shifted position. Weather conditions clear, temperature approximately 45°F. Subject remained stationary for duration of 12-minute observation period before departing eastward.',
        photoUri: '',
        createdAt: '2024-12-29T14:34:00Z',
    };

    // ============================================
    // CONFIDENCE HELPERS
    // ============================================
    const getConfidenceInfo = (score: number) => {
        if (score >= 90) return { text: 'High confidence identification', color: '#059669' };
        if (score >= 70) return { text: 'Moderate confidence identification', color: '#D97706' };
        return { text: 'Low confidence - verify manually', color: '#DC2626' };
    };

    const confidenceInfo = getConfidenceInfo(entry.confidence);

    // ============================================
    // FORMAT COORDINATES
    // ============================================
    const formatCoordinates = (location: LocationData | null | undefined): string => {
        if (!location) return 'No GPS data';
        const lat = Math.abs(location.latitude).toFixed(4);
        const lng = Math.abs(location.longitude).toFixed(4);
        const latDir = location.latitude >= 0 ? 'N' : 'S';
        const lngDir = location.longitude >= 0 ? 'E' : 'W';
        return `${lat}° ${latDir}, ${lng}° ${lngDir}`;
    };

    // ============================================
    // HANDLERS
    // ============================================
    const handleShare = async () => {
        setIsMenuOpen(false);
        try {
            await Share.share({
                title: `${entry.speciesName} Observation`,
                message: `I observed a ${entry.speciesName} (${entry.scientificName}) on ${entry.date} at ${entry.time}.\n\nLocation: ${formatCoordinates(entry.location)}\nBehavior: ${entry.behavior}\n\nNotes: ${entry.notes}`,
            });
        } catch (error) {
            console.error('Share error:', error);
        }
    };

    const handleExportPDF = () => {
        setIsMenuOpen(false);
        showAlert(
            'Export to PDF',
            'PDF export functionality will be available in a future update.',
            [{ text: 'OK' }]
        );
    };

    const handleDelete = () => {
        setIsMenuOpen(false);
        showAlert(
            'Delete Entry',
            `Are you sure you want to delete this observation of ${entry.speciesName}? This action cannot be undone.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => {
                        console.log('Deleting entry:', entry.id);
                        onNavigate('Archive');
                    },
                },
            ]
        );
    };

    const handleEdit = () => {
        // Navigate to edit screen with entry data
        onNavigate('EditEntry', { entry });
    };

    // ============================================
    // RENDER
    // ============================================
    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />

            {/* Header */}
            <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
                <TouchableOpacity style={[styles.backButton, { backgroundColor: theme.border }]} onPress={onBack} activeOpacity={0.7}>
                    <Text style={[styles.backArrow, { color: theme.text }]}>‹</Text>
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.text }]}>Journal</Text>
                <TouchableOpacity
                    style={[styles.menuButton, { backgroundColor: theme.border }]}
                    onPress={() => setIsMenuOpen(true)}
                    activeOpacity={0.7}
                >
                    <FontAwesome6 name="ellipsis-vertical" size={20} color={theme.text} />
                </TouchableOpacity>
            </View>

            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Hero Image */}
                <View style={[styles.heroContainer, { backgroundColor: theme.card }]}>
                    {entry.photoUri || entry.image ? (
                        <Image
                            source={entry.image || { uri: entry.photoUri }}
                            style={styles.heroImage}
                            resizeMode="cover"
                        />
                    ) : (
                        <View style={[styles.heroPlaceholder, { backgroundColor: theme.accentLight }]}>
                            <FontAwesome6 name="dove" size={48} color="#059669" />
                            <Text style={[styles.heroPlaceholderText, { color: isDarkMode ? theme.text : '#059669' }]}>{entry.speciesName}</Text>
                        </View>
                    )}
                </View>

                {/* Species Title Block */}
                <View style={styles.titleBlock}>
                    <Text style={[styles.speciesName, { color: theme.text }]}>{entry.speciesName}</Text>
                    <Text style={[styles.scientificName, { color: theme.textSecondary }]}>{entry.scientificName}</Text>
                </View>

                {/* AI Confidence Card */}
                <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <View style={styles.confidenceHeader}>
                        <Text style={[styles.confidenceLabel, { color: theme.text }]}>AI Prediction Confidence</Text>
                        <Text style={[styles.confidenceValue, { color: confidenceInfo.color }]}>
                            {entry.confidence}%
                        </Text>
                    </View>
                    <View style={[styles.progressBarBg, { backgroundColor: theme.border }]}>
                        <View
                            style={[
                                styles.progressBarFill,
                                {
                                    width: `${entry.confidence}%`,
                                    backgroundColor: confidenceInfo.color,
                                },
                            ]}
                        />
                    </View>
                    <Text style={[styles.confidenceFooter, { color: theme.textSecondary }]}>{confidenceInfo.text}</Text>
                </View>

                {/* Observation Metadata Card */}
                <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Text style={[styles.cardTitle, { color: theme.text }]}>Observation Details</Text>

                    {/* Date */}
                    <View style={styles.metaRow}>
                        <View style={[styles.metaIcon, { backgroundColor: theme.border }]}>
                            <FontAwesome6 name="calendar" size={16} color="#059669" />
                        </View>
                        <View style={styles.metaContent}>
                            <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Date of Observation</Text>
                            <Text style={[styles.metaValue, { color: theme.text }]}>{entry.date}</Text>
                        </View>
                    </View>

                    <View style={[styles.metaDivider, { backgroundColor: theme.border }]} />

                    {/* Time */}
                    <View style={styles.metaRow}>
                        <View style={[styles.metaIcon, { backgroundColor: theme.border }]}>
                            <FontAwesome6 name="clock" size={16} color="#059669" iconStyle="regular" />
                        </View>
                        <View style={styles.metaContent}>
                            <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Time of Observation</Text>
                            <Text style={[styles.metaValue, { color: theme.text }]}>{entry.time}</Text>
                        </View>
                    </View>

                    <View style={[styles.metaDivider, { backgroundColor: theme.border }]} />

                    {/* GPS Location */}
                    <View style={styles.metaRow}>
                        <View style={[styles.metaIcon, { backgroundColor: theme.border }]}>
                            <FontAwesome6 name="location-dot" size={16} color="#059669" />
                        </View>
                        <View style={styles.metaContent}>
                            <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>GPS Location</Text>
                            <Text style={[styles.metaValue, { color: theme.text }]}>
                                {entry.coordinates || formatCoordinates(entry.location) || 'No GPS data'}
                            </Text>
                            {entry.locationName && (
                                <Text style={[styles.metaSubvalue, { color: theme.textSecondary }]}>{entry.locationName}</Text>
                            )}
                        </View>
                    </View>

                    <View style={[styles.metaDivider, { backgroundColor: theme.border }]} />

                    {/* Behavior */}
                    <View style={styles.metaRow}>
                        <View style={[styles.metaIcon, { backgroundColor: theme.border }]}>
                            <FontAwesome6 name="eye" size={16} color="#059669" iconStyle="regular" />
                        </View>
                        <View style={styles.metaContent}>
                            <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Behavior Observed</Text>
                            <Text style={[styles.metaValue, { color: theme.text }, !entry.behavior && styles.metaValueMuted]}>
                                {entry.behavior || 'Not recorded'}
                            </Text>
                        </View>
                    </View>

                    <View style={[styles.metaDivider, { backgroundColor: theme.border }]} />

                    {/* Quantity */}
                    <View style={styles.metaRow}>
                        <View style={[styles.metaIcon, { backgroundColor: theme.border }]}>
                            <FontAwesome6 name="hashtag" size={16} color="#059669" />
                        </View>
                        <View style={styles.metaContent}>
                            <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Quantity</Text>
                            <Text style={[styles.metaValue, { color: theme.text }]}>
                                {entry.quantity ? `${entry.quantity} Individual${entry.quantity !== 1 ? 's' : ''}` : 'Not recorded'}
                            </Text>
                        </View>
                    </View>

                    <View style={[styles.metaDivider, { backgroundColor: theme.border }]} />

                    {/* Species Type */}
                    <View style={styles.metaRow}>
                        <View style={[styles.metaIcon, { backgroundColor: theme.border }]}>
                            <FontAwesome6 name="tag" size={16} color="#059669" />
                        </View>
                        <View style={styles.metaContent}>
                            <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Species Type</Text>
                            <Text style={[styles.metaValue, { color: theme.text }]}>{entry.animalClass}</Text>
                        </View>
                    </View>

                    <View style={[styles.metaDivider, { backgroundColor: theme.border }]} />

                    {/* Tags */}
                    <View style={styles.metaRow}>
                        <View style={[styles.metaIcon, { backgroundColor: theme.border }]}>
                            <FontAwesome6 name="bookmark" size={16} color="#059669" iconStyle="regular" />
                        </View>
                        <View style={styles.metaContent}>
                            <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Tags</Text>
                            <View style={styles.tagsContainer}>
                                {entry.tags.length > 0 ? (
                                    entry.tags.map((tag, index) => (
                                        <View key={index} style={[styles.tagPill, { backgroundColor: theme.accentLight, borderColor: isDarkMode ? theme.border : '#D1FAE5' }]}>
                                            <Text style={styles.tagText}>{tag}</Text>
                                        </View>
                                    ))
                                ) : (
                                    <Text style={[styles.metaValueMuted, { color: theme.textSecondary }]}>No tags</Text>
                                )}
                            </View>
                        </View>
                    </View>

                    <View style={[styles.metaDivider, { backgroundColor: theme.border }]} />

                    {/* Habitat Type */}
                    <View style={styles.metaRow}>
                        <View style={[styles.metaIcon, { backgroundColor: theme.border }]}>
                            <FontAwesome6 name="tree" size={16} color="#059669" />
                        </View>
                        <View style={styles.metaContent}>
                            <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Habitat Type</Text>
                            <Text style={[styles.metaValue, { color: theme.text }]}>{entry.habitatType || 'Not recorded'}</Text>
                        </View>
                    </View>
                </View>

                {/* Research Notes Section */}
                <View style={styles.notesSection}>
                    <Text style={[styles.notesSectionTitle, { color: theme.text }]}>Research Notes</Text>
                    <View style={[styles.notesCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <View style={styles.notesAccent} />
                        <Text style={[styles.notesText, { color: theme.text }, !entry.notes && { color: theme.textSecondary, fontStyle: 'italic' }]}>
                            {entry.notes || 'No research notes recorded for this observation.'}
                        </Text>
                    </View>
                </View>

                {/* Spacer for footer */}
                <View style={{ height: 100 }} />
            </ScrollView>

            {/* Footer - Edit Button */}
            <View style={[styles.footer, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
                <TouchableOpacity style={styles.editButton} onPress={handleEdit} activeOpacity={0.85}>
                    <FontAwesome6 name="pen-to-square" size={16} color="#FFFFFF" style={styles.editButtonIcon} />
                    <Text style={styles.editButtonText}>Edit Journal</Text>
                </TouchableOpacity>
            </View>

            {/* More Options Menu Modal */}
            <Modal
                visible={isMenuOpen}
                transparent
                animationType="fade"
                onRequestClose={() => setIsMenuOpen(false)}
            >
                <Pressable style={styles.modalOverlay} onPress={() => setIsMenuOpen(false)}>
                    <View style={[styles.menuContainer, { backgroundColor: theme.card }]}>
                        {/* Share Option */}
                        <TouchableOpacity
                            style={styles.menuItem}
                            onPress={handleShare}
                            activeOpacity={0.7}
                        >
                            <FontAwesome6 name="share-from-square" size={18} color="#374151" style={styles.menuItemIcon} />
                            <Text style={[styles.menuItemText, { color: theme.text }]}>Share</Text>
                        </TouchableOpacity>

                        <View style={[styles.menuDivider, { backgroundColor: theme.border }]} />

                        {/* Export to PDF Option */}
                        <TouchableOpacity
                            style={styles.menuItem}
                            onPress={handleExportPDF}
                            activeOpacity={0.7}
                        >
                            <FontAwesome6 name="file-pdf" size={18} color="#374151" style={styles.menuItemIcon} />
                            <Text style={[styles.menuItemText, { color: theme.text }]}>Export to PDF</Text>
                        </TouchableOpacity>

                        <View style={[styles.menuDivider, { backgroundColor: theme.border }]} />

                        {/* Delete Option */}
                        <TouchableOpacity
                            style={styles.menuItem}
                            onPress={handleDelete}
                            activeOpacity={0.7}
                        >
                            <FontAwesome6 name="trash-can" size={18} color="#E53E3E" style={styles.menuItemIcon} />
                            <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>
                                Delete
                            </Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Modal>
        </View>
    );
};

// ============================================
// STYLES
// ============================================
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8FAFC',
    },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'ios' ? 56 : 40,
        paddingBottom: 16,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    backButton: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
    },
    backArrow: {
        fontSize: 28,
        color: '#111827',
        fontWeight: '300',
        marginTop: -2,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111827',
    },
    menuButton: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
    },
    menuIcon: {
        fontSize: 24,
        color: '#374151',
        fontWeight: '700',
    },

    // Scroll Content
    scrollContent: {
        padding: 16,
    },

    // Hero Image
    heroContainer: {
        width: '100%',
        height: 240,
        borderRadius: 20,
        overflow: 'hidden',
        marginBottom: 20,
        backgroundColor: '#FFFFFF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 4,
    },
    heroImage: {
        width: '100%',
        height: '100%',
    },
    heroPlaceholder: {
        width: '100%',
        height: '100%',
        backgroundColor: '#E8F5E9',
        alignItems: 'center',
        justifyContent: 'center',
    },
    heroPlaceholderIcon: {
        fontSize: 80,
        marginBottom: 12,
    },
    heroPlaceholderText: {
        fontSize: 20,
        fontWeight: '600',
        color: '#059669',
    },

    // Title Block
    titleBlock: {
        marginBottom: 20,
    },
    speciesName: {
        fontSize: 28,
        fontWeight: '700',
        color: '#1A1A1A',
        marginBottom: 4,
        letterSpacing: -0.5,
    },
    scientificName: {
        fontSize: 17,
        fontStyle: 'italic',
        color: '#4A5568',
    },

    // Cards
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 2,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1A1A1A',
        marginBottom: 16,
    },

    // Confidence Card
    confidenceHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    confidenceLabel: {
        fontSize: 15,
        fontWeight: '600',
        color: '#374151',
    },
    confidenceValue: {
        fontSize: 22,
        fontWeight: '700',
    },
    progressBarBg: {
        height: 10,
        backgroundColor: '#E5E7EB',
        borderRadius: 5,
        marginBottom: 12,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 5,
    },
    confidenceFooter: {
        fontSize: 13,
        color: '#6B7280',
    },

    // Metadata Rows
    metaRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingVertical: 12,
    },
    metaIcon: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    metaIconText: {
        fontSize: 18,
    },
    metaContent: {
        flex: 1,
    },
    metaLabel: {
        fontSize: 12,
        fontWeight: '500',
        color: '#4A5568',
        marginBottom: 4,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    metaValue: {
        fontSize: 16,
        fontWeight: '600',
        color: '#1A1A1A',
    },
    metaSubvalue: {
        fontSize: 13,
        color: '#6B7280',
        marginTop: 2,
    },
    metaValueMuted: {
        fontSize: 15,
        color: '#9CA3AF',
        fontStyle: 'italic',
    },
    metaDivider: {
        height: 1,
        backgroundColor: '#F3F4F6',
        marginLeft: 54,
    },

    // Tags
    tagsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginTop: 4,
        gap: 8,
    },
    tagPill: {
        backgroundColor: '#ECFDF5',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#D1FAE5',
    },
    tagText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#059669',
    },

    // Research Notes Section
    notesSection: {
        marginBottom: 16,
    },
    notesSectionTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1A1A1A',
        marginBottom: 12,
    },
    notesCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 20,
        paddingLeft: 24,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        position: 'relative',
        overflow: 'hidden',
    },
    notesAccent: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 4,
        backgroundColor: '#059669',
        borderTopLeftRadius: 16,
        borderBottomLeftRadius: 16,
    },
    notesText: {
        fontSize: 15,
        color: '#374151',
        lineHeight: 24,
    },
    notesTextMuted: {
        color: '#9CA3AF',
        fontStyle: 'italic',
    },

    // Footer
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: Platform.OS === 'ios' ? 40 : 24,
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
        elevation: 10,
    },
    editButton: {
        backgroundColor: '#059669',
        borderRadius: 14,
        height: 56,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#059669',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    editButtonIcon: {
        marginRight: 10,
    },
    editButtonText: {
        color: '#FFFFFF',
        fontSize: 17,
        fontWeight: '600',
    },

    // Menu Modal
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        justifyContent: 'flex-start',
        alignItems: 'flex-end',
        paddingTop: Platform.OS === 'ios' ? 110 : 90,
        paddingRight: 16,
    },
    menuContainer: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        width: 200,
        paddingVertical: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 24,
        elevation: 10,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 18,
    },
    menuItemIcon: {
        marginRight: 14,
    },
    menuItemText: {
        fontSize: 16,
        fontWeight: '500',
        color: '#1A1A1A',
    },
    menuItemTextDanger: {
        color: '#E53E3E',
    },
    menuDivider: {
        height: 1,
        backgroundColor: '#F3F4F6',
        marginHorizontal: 18,
    },
});

export default JournalDetailScreen;