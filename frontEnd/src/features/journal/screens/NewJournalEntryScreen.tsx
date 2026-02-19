import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    StatusBar,
    TouchableOpacity,
    Platform,
    Image,
    ScrollView,
    TextInput,
    Modal,
    Pressable,
    ActivityIndicator,
} from 'react-native';
import FontAwesome6 from 'react-native-vector-icons/FontAwesome6';
import useJournalEntries from '../hooks/useJournalEntries';
import { useTheme } from '../../../core/theme';
import { useAlert } from '../../../core/alerts';

/**
 * ============================================
 * NEW JOURNAL ENTRY SCREEN
 * ============================================
 * 
 * TRIGGER: User taps "Save to Journal" on Identification Result screen
 * 
 * DATA TRANSFER (from IdentificationResultScreen):
 * - Species Image (photoUri)
 * - Common Name (speciesCommonName)
 * - Scientific Name (speciesScientificName)
 * - Confidence Score (confidenceScore)
 * - Observation Date (observationDate)
 * - Observation Time (observationTime)
 * - GPS Coordinates (gpsLocation)
 * 
 * PURPOSE: Review pre-filled data, add details, save final entry
 */

interface LocationData {
    latitude: number;
    longitude: number;
}

interface RouteParams {
    speciesCommonName: string;
    speciesScientificName: string;
    confidenceScore: number;
    photoUri: string;
    observationDate: string;
    observationTime: string;
    gpsLocation: LocationData | null;
}

interface NewJournalEntryScreenProps {
    onNavigate: (route: any, params?: any) => void;
    onBack: () => void;
    routeParams?: RouteParams;
}

const NewJournalEntryScreen: React.FC<NewJournalEntryScreenProps> = ({
    onNavigate,
    onBack,
    routeParams,
}) => {
    // ============================================
    // HOOKS - Offline-first data management
    // ============================================
    const { isDarkMode, theme } = useTheme();
    const { showAlert } = useAlert();
    const {
        createEntry,
    } = useJournalEntries();

    // ============================================
    // EXTRACT PASSED DATA (with defaults)
    // ============================================
    const {
        speciesCommonName = '',
        speciesScientificName = '',
        confidenceScore = 0,
        photoUri = '',
        observationDate = '',
        observationTime = '',
        gpsLocation = null,
    } = routeParams || {};

    // ============================================
    // EDITABLE FORM STATE
    // ============================================
    // Pre-filled & Editable
    const [speciesName, setSpeciesName] = useState(speciesCommonName);
    const [scientificName, setScientificName] = useState(speciesScientificName);
    const [quantity, setQuantity] = useState('1');

    // User Input (Empty state)
    const [animalClass, setAnimalClass] = useState('');
    const [behavior, setBehavior] = useState('');
    const [habitat, setHabitat] = useState('');
    const [fieldNotes, setFieldNotes] = useState('');
    const [tags, setTags] = useState('');

    // Notes field height (auto-resize)
    const [notesHeight, setNotesHeight] = useState(100); // Minimum height (approx 3 lines)
    const MIN_NOTES_HEIGHT = 100;
    const MAX_NOTES_HEIGHT = 300;

    // Dropdown State
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    // Saving state
    const [isSaving, setIsSaving] = useState(false);

    // Class options
    const classOptions = [
        { label: 'Mammals', value: 'Mammal', icon: 'paw' },
        { label: 'Birds', value: 'Bird', icon: 'bird' },
        { label: 'Fish', value: 'Fish', icon: 'fish' },
        { label: 'Reptiles', value: 'Reptile', icon: 'dragon' },
        { label: 'Amphibians', value: 'Amphibian', icon: 'frog' },
        { label: 'Insects', value: 'Insect', icon: 'butterfly' },
        { label: 'Other', value: 'Other', icon: 'microscope' },
    ];

    // ============================================
    // FORMAT COORDINATES
    // ============================================
    const formatCoordinates = (location: LocationData | null): string => {
        if (!location) return 'No GPS data';
        const lat = Math.abs(location.latitude).toFixed(4);
        const lng = Math.abs(location.longitude).toFixed(4);
        const latDir = location.latitude >= 0 ? 'N' : 'S';
        const lngDir = location.longitude >= 0 ? 'E' : 'W';
        return `${lat}° ${latDir}, ${lng}° ${lngDir}`;
    };

    // ============================================
    // SAVE HANDLER (Offline-first)
    // ============================================
    const handleSave = async () => {
        // Validate required fields
        if (!speciesName.trim()) {
            showAlert('Required Field', 'Please enter a species name.');
            return;
        }

        setIsSaving(true);

        try {
            // Parse observation date/time into timestamp
            let capturedAt: Date;
            if (observationDate && observationTime) {
                capturedAt = new Date(`${observationDate} ${observationTime}`);
            } else if (observationDate) {
                capturedAt = new Date(observationDate);
            } else {
                capturedAt = new Date();
            }

            // Create entry using offline-first hook
            await createEntry({
                speciesName: speciesName.trim(),
                scientificName: scientificName.trim(),
                confidenceScore: confidenceScore / 100, // Convert from percentage to decimal
                localImageUri: photoUri,
                latitude: gpsLocation?.latitude,
                longitude: gpsLocation?.longitude,
                locationName: gpsLocation ? `${gpsLocation.latitude.toFixed(4)}°, ${gpsLocation.longitude.toFixed(4)}°` : undefined,
                capturedAt,
                notes: fieldNotes.trim(),
                tags: tags
                    .split(',')
                    .map(tag => tag.trim())
                    .filter(tag => tag.length > 0),
                behaviorObserved: behavior.trim(),
                quantity: parseInt(quantity) || 1,
                habitatType: habitat.trim(),
                animalClass: animalClass || 'Other',
            });

            showAlert(
                'Entry Saved',
                `${speciesName} has been added to your journal.`,
                [
                    {
                        text: 'View Journal',
                        onPress: () => onNavigate('Archive'),
                    },
                    {
                        text: 'Home',
                        onPress: () => onNavigate('Home'),
                        style: 'cancel',
                    },
                ]
            );
        } catch (error: any) {
            console.error('Failed to save entry:', error);
            showAlert(
                'Save Failed',
                error.message || 'Failed to save journal entry. Please try again.'
            );
        } finally {
            setIsSaving(false);
        }
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
                <Text style={[styles.headerTitle, { color: theme.text }]}>New Journal Entry</Text>
                <View style={styles.headerRight} />
            </View>

            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
            >
                    {/* ============================================ */}
                    {/* SPECIES PREVIEW (Top) */}
                    {/* ============================================ */}
                    <View style={styles.previewSection}>
                        <View style={[styles.imageContainer, { backgroundColor: theme.border }]}>
                            {photoUri ? (
                                <Image
                                    source={{ uri: photoUri }}
                                    style={styles.previewImage}
                                    resizeMode="cover"
                                />
                            ) : (
                                <View style={[styles.placeholderImage, { backgroundColor: theme.border }]}>
                                    <FontAwesome6 name="camera" size={48} color={theme.textSecondary} />
                                </View>
                            )}
                            {/* Confidence Badge */}
                            {confidenceScore > 0 && (
                                <View style={styles.confidenceBadge}>
                                    <Text style={styles.confidenceBadgeText}>{confidenceScore}%</Text>
                                </View>
                            )}
                        </View>
                        <Text style={[styles.previewLabel, { color: theme.textSecondary }]}>Species Preview</Text>
                    </View>

                    {/* ============================================ */}
                    {/* OBSERVATION DATA CARD (Read-Only) */}
                    {/* ============================================ */}
                    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <Text style={[styles.cardTitle, { color: theme.text }]}>Observation Data</Text>
                        <Text style={[styles.cardSubtitle, { color: theme.textSecondary }]}>Auto-captured • Read only</Text>

                        {/* Date Row */}
                        <View style={styles.dataRow}>
                            <View style={[styles.dataIcon, { backgroundColor: theme.accentLight }]}>
                                <FontAwesome6 name="calendar" size={18} color="#059669" />
                            </View>
                            <View style={styles.dataContent}>
                                <Text style={[styles.dataValue, { color: theme.text }]}>{observationDate || 'Not recorded'}</Text>
                                <Text style={[styles.dataLabel, { color: theme.textSecondary }]}>Date observed</Text>
                            </View>
                        </View>

                        <View style={[styles.dataDivider, { backgroundColor: theme.border }]} />

                        {/* Time Row */}
                        <View style={styles.dataRow}>
                            <View style={[styles.dataIcon, { backgroundColor: theme.accentLight }]}>
                                <FontAwesome6 name="clock" size={18} color="#059669" iconStyle="regular" />
                            </View>
                            <View style={styles.dataContent}>
                                <Text style={[styles.dataValue, { color: theme.text }]}>{observationTime || 'Not recorded'}</Text>
                                <Text style={[styles.dataLabel, { color: theme.textSecondary }]}>Time observed</Text>
                            </View>
                        </View>

                        <View style={[styles.dataDivider, { backgroundColor: theme.border }]} />

                        {/* GPS Row */}
                        <View style={styles.dataRow}>
                            <View style={[styles.dataIcon, !gpsLocation && styles.dataIconInactive, { backgroundColor: gpsLocation ? theme.accentLight : theme.border }]}>
                                <FontAwesome6 name="location-dot" size={18} color="#059669" />
                            </View>
                            <View style={styles.dataContent}>
                                <Text style={[styles.dataValue, !gpsLocation && { color: theme.textSecondary }, gpsLocation && { color: theme.text }]}>
                                    {formatCoordinates(gpsLocation)}
                                </Text>
                                <Text style={[styles.dataLabel, { color: theme.textSecondary }]}>GPS coordinates</Text>
                            </View>
                        </View>
                    </View>

                    {/* ============================================ */}
                    {/* EDITABLE FORM FIELDS */}
                    {/* ============================================ */}
                    <Text style={[styles.sectionTitle, { color: theme.text }]}>Species Information</Text>

                    {/* Species Name (Pre-filled, Editable) */}
                    <View style={styles.inputGroup}>
                        <Text style={[styles.label, { color: theme.text }]}>
                            Species Name <Text style={styles.required}>*</Text>
                        </Text>
                        <TextInput
                            style={[styles.input, { backgroundColor: theme.border, borderColor: theme.border, color: theme.text }]}
                            value={speciesName}
                            onChangeText={setSpeciesName}
                            placeholder="e.g., Red-tailed Hawk"
                            placeholderTextColor={theme.textSecondary}
                        />
                    </View>

                    {/* Scientific Name (Pre-filled, Editable) */}
                    <View style={styles.inputGroup}>
                        <Text style={[styles.label, { color: theme.text }]}>Scientific Name</Text>
                        <TextInput
                            style={[styles.input, styles.italicInput, { backgroundColor: theme.border, borderColor: theme.border, color: theme.text }]}
                            value={scientificName}
                            onChangeText={setScientificName}
                            placeholder="e.g., Buteo jamaicensis"
                            placeholderTextColor={theme.textSecondary}
                            autoCapitalize="none"
                        />
                    </View>

                    {/* Class of Animal (Dropdown) */}
                    <View style={styles.inputGroup}>
                        <Text style={[styles.label, { color: theme.text }]}>Class of Animal</Text>
                        <TouchableOpacity
                            style={[styles.dropdownTrigger, { backgroundColor: theme.border, borderColor: theme.border }]}
                            onPress={() => setIsDropdownOpen(true)}
                            activeOpacity={0.7}
                        >
                            <Text style={[styles.dropdownText, { color: theme.text }, !animalClass && { color: theme.textSecondary }]}>
                                {animalClass
                                    ? classOptions.find(c => c.value === animalClass)?.label || animalClass
                                    : 'Select class...'}
                            </Text>
                            <FontAwesome6 name="chevron-down" size={16} color={theme.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    {/* Behavior Observed */}
                    <View style={styles.inputGroup}>
                        <Text style={[styles.label, { color: theme.text }]}>Behavior Observed</Text>
                        <TextInput
                            style={[styles.input, { backgroundColor: theme.border, borderColor: theme.border, color: theme.text }]}
                            value={behavior}
                            onChangeText={setBehavior}
                            placeholder="e.g., Perched, Hunting, Flying"
                            placeholderTextColor={theme.textSecondary}
                        />
                    </View>

                    {/* Quantity (Pre-filled, Editable) */}
                    <View style={styles.inputGroup}>
                        <Text style={[styles.label, { color: theme.text }]}>Quantity</Text>
                        <TextInput
                            style={[styles.input, styles.quantityInput, { backgroundColor: theme.border, borderColor: theme.border, color: theme.text }]}
                            value={quantity}
                            onChangeText={(text) => setQuantity(text.replace(/[^0-9]/g, ''))}
                            keyboardType="number-pad"
                            placeholder="1"
                            placeholderTextColor={theme.textSecondary}
                            maxLength={4}
                        />
                    </View>

                    {/* Habitat Type */}
                    <View style={styles.inputGroup}>
                        <Text style={[styles.label, { color: theme.text }]}>Habitat Type</Text>
                        <TextInput
                            style={[styles.input, { backgroundColor: theme.border, borderColor: theme.border, color: theme.text }]}
                            value={habitat}
                            onChangeText={setHabitat}
                            placeholder="e.g., Forest, Grassland, Wetland"
                            placeholderTextColor={theme.textSecondary}
                        />
                    </View>

                    {/* Field Notes (Multi-line, Auto-resize) */}
                    <View style={styles.inputGroup}>
                        <Text style={[styles.label, { color: theme.text }]}>Field Notes</Text>
                        <TextInput
                            style={[
                                styles.input,
                                styles.textArea,
                                { height: Math.max(MIN_NOTES_HEIGHT, Math.min(notesHeight, MAX_NOTES_HEIGHT)), backgroundColor: theme.border, borderColor: theme.border, color: theme.text }
                            ]}
                            value={fieldNotes}
                            onChangeText={setFieldNotes}
                            placeholder="Additional observations, environmental conditions, weather..."
                            placeholderTextColor={theme.textSecondary}
                            multiline
                            textAlignVertical="top"
                            scrollEnabled={notesHeight >= MAX_NOTES_HEIGHT}
                            onContentSizeChange={(event) => {
                                const newHeight = event.nativeEvent.contentSize.height + 28; // Add padding
                                setNotesHeight(newHeight);
                            }}
                        />
                        <Text style={[styles.helperText, { color: theme.textSecondary }]}>
                            {fieldNotes.length > 0 ? `${fieldNotes.length} characters` : 'Describe your observation in detail'}
                        </Text>
                    </View>

                    {/* Tags */}
                    <View style={styles.inputGroup}>
                        <Text style={[styles.label, { color: theme.text }]}>Tags</Text>
                        <TextInput
                            style={[styles.input, { backgroundColor: theme.border, borderColor: theme.border, color: theme.text }]}
                            value={tags}
                            onChangeText={setTags}
                            placeholder="e.g., raptor, bird-of-prey, winter"
                            placeholderTextColor={theme.textSecondary}
                            autoCapitalize="none"
                        />
                        <Text style={[styles.helperText, { color: theme.textSecondary }]}>Separate tags with commas</Text>
                    </View>

                    {/* ============================================ */}
                    {/* SAVE BUTTON (Inside scroll, at bottom) */}
                    {/* ============================================ */}
                    <View style={styles.buttonContainer}>
                        <TouchableOpacity
                            style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
                            onPress={handleSave}
                            activeOpacity={0.85}
                            disabled={isSaving}
                        >
                            {isSaving ? (
                                <ActivityIndicator color="#FFFFFF" size="small" />
                            ) : (
                                <>
                                    <FontAwesome6 name="floppy-disk" size={20} color="#FFFFFF" style={styles.saveIcon} />
                                    <Text style={styles.saveButtonText}>
                                        Save Entry
                                    </Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>

                    {/* Bottom spacing for safe area */}
                    <View style={{ height: Platform.OS === 'ios' ? 40 : 24 }} />
                </ScrollView>

            {/* ============================================ */}
            {/* CLASS DROPDOWN MODAL */}
            {/* ============================================ */}
            <Modal
                visible={isDropdownOpen}
                transparent
                animationType="fade"
                onRequestClose={() => setIsDropdownOpen(false)}
            >
                <Pressable style={styles.modalOverlay} onPress={() => setIsDropdownOpen(false)}>
                    <View style={[styles.dropdownMenu, { backgroundColor: theme.card }]}>
                        <Text style={[styles.dropdownTitle, { color: theme.text, borderBottomColor: theme.border }]}>Select Class of Animal</Text>

                        {classOptions.map((option) => (
                            <TouchableOpacity
                                key={option.value}
                                style={[
                                    styles.dropdownOption,
                                    animalClass === option.value && [styles.dropdownOptionSelected, { backgroundColor: theme.accentLight }],
                                ]}
                                onPress={() => {
                                    setAnimalClass(option.value);
                                    setIsDropdownOpen(false);
                                }}
                                activeOpacity={0.7}
                            >
                                <View style={styles.dropdownOptionLeft}>
                                    <FontAwesome6 name={option.icon} size={22} color={animalClass === option.value ? '#059669' : theme.textSecondary} style={styles.dropdownOptionIcon} />
                                    <Text
                                        style={[
                                            styles.dropdownOptionText,
                                            { color: theme.text },
                                            animalClass === option.value && styles.dropdownOptionTextSelected,
                                        ]}
                                    >
                                        {option.label}
                                    </Text>
                                </View>
                                {animalClass === option.value && (
                                    <FontAwesome6 name="check" size={18} color="#059669" />
                                )}
                            </TouchableOpacity>
                        ))}

                        <TouchableOpacity
                            style={[styles.dropdownCancel, { borderTopColor: theme.border }]}
                            onPress={() => setIsDropdownOpen(false)}
                        >
                            <Text style={[styles.dropdownCancelText, { color: theme.textSecondary }]}>Cancel</Text>
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
        backgroundColor: '#FFFFFF',
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
        color: '#1A1A1A',
    },
    headerRight: {
        width: 44,
    },

    // Scroll Content
    scrollContent: {
        padding: 20,
    },

    // Species Preview Section
    previewSection: {
        alignItems: 'center',
        marginBottom: 24,
    },
    imageContainer: {
        width: 140,
        height: 140,
        borderRadius: 20,
        overflow: 'hidden',
        backgroundColor: '#F3F4F6',
        marginBottom: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
    },
    previewImage: {
        width: '100%',
        height: '100%',
    },
    placeholderImage: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F3F4F6',
    },
    placeholderIcon: {
        fontSize: 48,
    },
    confidenceBadge: {
        position: 'absolute',
        bottom: 8,
        right: 8,
        backgroundColor: '#059669',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    confidenceBadgeText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    previewLabel: {
        fontSize: 13,
        color: '#6B7280',
        fontWeight: '500',
    },

    // Observation Data Card (Read-Only)
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        padding: 20,
        marginBottom: 28,
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
        marginBottom: 2,
    },
    cardSubtitle: {
        fontSize: 12,
        color: '#9CA3AF',
        marginBottom: 16,
    },
    dataRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
    },
    dataIcon: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: '#ECFDF5',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    dataIconInactive: {
        backgroundColor: '#F3F4F6',
    },
    dataIconText: {
        fontSize: 18,
    },
    dataContent: {
        flex: 1,
    },
    dataValue: {
        fontSize: 15,
        fontWeight: '600',
        color: '#1A1A1A',
        marginBottom: 2,
    },
    dataValueInactive: {
        color: '#9CA3AF',
    },
    dataLabel: {
        fontSize: 12,
        color: '#6B7280',
    },
    dataDivider: {
        height: 1,
        backgroundColor: '#F3F4F6',
        marginLeft: 54,
    },

    // Section Title
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1A1A1A',
        marginBottom: 16,
    },

    // Form Inputs
    inputGroup: {
        marginBottom: 20,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        color: '#1A1A1A',
        marginBottom: 8,
    },
    required: {
        color: '#DC2626',
    },
    input: {
        backgroundColor: '#F5F5F5',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 16,
        color: '#1A1A1A',
        borderWidth: 1,
        borderColor: '#F5F5F5',
    },
    italicInput: {
        fontStyle: 'italic',
    },
    quantityInput: {
        width: 100,
    },
    textArea: {
        minHeight: 100,
        paddingTop: 14,
        paddingBottom: 14,
        textAlignVertical: 'top',
    },
    helperText: {
        fontSize: 12,
        color: '#6B7280',
        marginTop: 6,
        marginLeft: 4,
    },
    placeholderText: {
        color: '#9CA3AF',
    },

    // Dropdown Trigger
    dropdownTrigger: {
        backgroundColor: '#F5F5F5',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderWidth: 1,
        borderColor: '#F5F5F5',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    dropdownText: {
        fontSize: 16,
        color: '#1A1A1A',
    },
    dropdownArrow: {
        fontSize: 12,
        color: '#6B7280',
    },

    // Button Container (inside scroll)
    buttonContainer: {
        marginTop: 12,
        marginBottom: 8,
    },
    saveButton: {
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
    saveIcon: {
        fontSize: 20,
        marginRight: 10,
    },
    saveButtonText: {
        color: '#FFFFFF',
        fontSize: 17,
        fontWeight: '700',
    },
    saveButtonDisabled: {
        backgroundColor: '#9CA3AF',
        shadowOpacity: 0,
    },

    // Modal Dropdown
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    dropdownMenu: {
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        width: '100%',
        maxWidth: 360,
        paddingVertical: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 24,
        elevation: 10,
    },
    dropdownTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: '#1A1A1A',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    dropdownOption: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
        paddingHorizontal: 20,
    },
    dropdownOptionSelected: {
        backgroundColor: '#F0FDF4',
    },
    dropdownOptionLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    dropdownOptionIcon: {
        fontSize: 22,
        marginRight: 14,
    },
    dropdownOptionText: {
        fontSize: 16,
        color: '#1A1A1A',
    },
    dropdownOptionTextSelected: {
        color: '#059669',
        fontWeight: '600',
    },
    checkmark: {
        fontSize: 18,
        color: '#059669',
        fontWeight: '700',
    },
    dropdownCancel: {
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6',
        marginTop: 8,
        paddingVertical: 16,
        alignItems: 'center',
    },
    dropdownCancelText: {
        fontSize: 16,
        color: '#6B7280',
        fontWeight: '600',
    },
});

export default NewJournalEntryScreen;