import React, { useState, useCallback, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    StatusBar,
    TouchableOpacity,
    Platform,
    PermissionsAndroid,
    Linking,
    Image,
    ScrollView,
    TextInput,
    Modal,
    Pressable,
    ActivityIndicator,
} from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import Geolocation from '@react-native-community/geolocation';
import FontAwesome6 from 'react-native-vector-icons/FontAwesome6';
import useJournalEntries from '../hooks/useJournalEntries';
import { useTheme } from '../../../core/theme';
import { useAlert } from '../../../core/alerts';

// ============================================
// HELPERS
// ============================================
function getCurrentDateString(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getCurrentTimeString(): string {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    return `${h}:${min}`;
}

/**
 * ============================================
 * NEW JOURNAL ENTRY SCREEN
 * ============================================
 *
 * TWO MODES:
 *
 * 1. SCAN FLOW (isManualEntry = false, default)
 *    Triggered from IdentificationResultScreen after AI detection.
 *    Receives pre-filled species data, read-only observation card.
 *
 * 2. MANUAL ENTRY (isManualEntry = true)
 *    Triggered from Archive FAB — no AI involvement.
 *    User manually fills all fields, picks image from camera or gallery,
 *    sets date/time manually. Supports "Save as Draft" to AsyncStorage.
 */

interface LocationData {
    latitude: number;
    longitude: number;
}

interface RouteParams {
    // Scan flow props
    speciesCommonName?: string;
    speciesScientificName?: string;
    confidenceScore?: number;
    photoUri?: string;
    observationDate?: string;
    observationTime?: string;
    gpsLocation?: LocationData | null;
    notes?: string;
    isDraft?: boolean;

    // Manual entry flag
    isManualEntry?: boolean;

    // Detection source from scan flow
    detectionSource?: 'offline' | 'online';
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
    // HOOKS
    // ============================================
    const { isDarkMode, theme } = useTheme();
    const { showAlert } = useAlert();
    const { createEntry } = useJournalEntries();

    // ============================================
    // MODE DETECTION
    // ============================================
    const isManualEntry = routeParams?.isManualEntry === true;

    // ============================================
    // EXTRACT SCAN-FLOW DATA (with defaults)
    // ============================================
    const {
        speciesCommonName = '',
        speciesScientificName = '',
        confidenceScore = 0,
        photoUri: scanPhotoUri = '',
        observationDate: scanDate = '',
        observationTime: scanTime = '',
        gpsLocation = null,
        notes: initialNotes = '',
        isDraft = false,
    } = routeParams || {};

    // ============================================
    // FORM STATE (shared between both modes)
    // ============================================
    const [speciesName, setSpeciesName] = useState(speciesCommonName);
    const [scientificName, setScientificName] = useState(speciesScientificName);
    const [animalClass, setAnimalClass] = useState('');
    const [behavior, setBehavior] = useState('');
    const [quantity, setQuantity] = useState('1');
    const [habitat, setHabitat] = useState('');
    const [fieldNotes, setFieldNotes] = useState(initialNotes);
    const [tags, setTags] = useState('');
    const [notesHeight, setNotesHeight] = useState(100);
    const MIN_NOTES_HEIGHT = 100;
    const MAX_NOTES_HEIGHT = 300;

    // ============================================
    // MANUAL ENTRY STATE
    // ============================================
    const [currentPhotoUri, setCurrentPhotoUri] = useState(scanPhotoUri);
    const [manualDate, setManualDate] = useState(getCurrentDateString);
    const [manualTime, setManualTime] = useState(getCurrentTimeString);
    const [showImageOptions, setShowImageOptions] = useState(false);

    // Manual entry location state
    type LocationStatus = 'idle' | 'fetching' | 'granted' | 'denied';
    const [manualGpsLocation, setManualGpsLocation] = useState<LocationData | null>(null);
    const [locationStatus, setLocationStatus] = useState<LocationStatus>('idle');

    // Auto-fetch location on mount for manual entries
    useEffect(() => {
        if (!isManualEntry) return;
        fetchManualLocation();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchManualLocation = useCallback(async () => {
        setLocationStatus('fetching');

        // Android requires explicit runtime permission
        if (Platform.OS === 'android') {
            const result = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                {
                    title: 'Location Access',
                    message:
                        'Creature Archive uses your location to tag journal entries with GPS coordinates, helping you track where each observation was made.',
                    buttonNeutral: 'Ask Later',
                    buttonNegative: 'Skip',
                    buttonPositive: 'Allow',
                }
            );
            if (result !== PermissionsAndroid.RESULTS.GRANTED) {
                setLocationStatus('denied');
                return;
            }
        }

        Geolocation.getCurrentPosition(
            (pos) => {
                setManualGpsLocation({
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                });
                setLocationStatus('granted');
            },
            (err) => {
                // code 1 = permission denied, code 2 = unavailable, code 3 = timeout
                if (err.code === 1) {
                    setLocationStatus('denied');
                } else {
                    // Service off or timeout — treat as denied so user can retry
                    setLocationStatus('denied');
                }
            },
            { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
        );
    }, [isManualEntry]);
    // ============================================
    // UI STATE
    // ============================================
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const classOptions = [
        { label: 'Mammals', value: 'Mammal', icon: 'paw' },
        { label: 'Birds', value: 'Bird', icon: 'dove' },
        { label: 'Fish', value: 'Fish', icon: 'fish-fins' },
        { label: 'Reptiles', value: 'Reptile', icon: 'worm' },
        { label: 'Amphibians', value: 'Amphibian', icon: 'frog' },
        { label: 'Insects', value: 'Insect', icon: 'bugs' },
        { label: 'Other', value: 'Other', icon: 'microscope' },
    ];

    // ============================================
    // IMAGE PICKER
    // ============================================
    const handleCapturePhoto = useCallback(async () => {
        setShowImageOptions(false);
        try {
            const result = await launchCamera({
                mediaType: 'photo',
                quality: 0.85,
                saveToPhotos: false,
            });
            if (!result.didCancel && result.assets && result.assets[0]?.uri) {
                setCurrentPhotoUri(result.assets[0].uri);
            }
        } catch {
            showAlert('Camera Error', 'Failed to open camera. Please check camera permissions.');
        }
    }, [showAlert]);

    const handlePickFromGallery = useCallback(async () => {
        setShowImageOptions(false);
        try {
            const result = await launchImageLibrary({
                mediaType: 'photo',
                quality: 0.85,
                selectionLimit: 1,
            });
            if (!result.didCancel && result.assets && result.assets[0]?.uri) {
                setCurrentPhotoUri(result.assets[0].uri);
            }
        } catch {
            showAlert('Gallery Error', 'Failed to open gallery. Please check photo permissions.');
        }
    }, [showAlert]);

    // ============================================
    // FORMAT COORDINATES (scan flow only)
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
    // SAVE / SUBMIT HANDLER
    // ============================================
    const handleSave = async () => {
        const photoToCheck = isManualEntry ? currentPhotoUri : scanPhotoUri;
        if (!photoToCheck) {
            showAlert('Photo Required', 'Please add a photo of the animal before saving.');
            return;
        }
        if (!speciesName.trim()) {
            showAlert('Species Name Required', 'Please enter the name of the species.');
            return;
        }
        if (!scientificName.trim()) {
            showAlert('Scientific Name Required', 'Please enter the scientific name of the species.');
            return;
        }
        if (!fieldNotes.trim()) {
            showAlert('Notes Required', 'Please add field notes describing your observation.');
            return;
        }
        const parsedTags = tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
        if (parsedTags.length === 0) {
            showAlert('Tag Required', 'Please add at least one tag (e.g. raptor, nocturnal).');
            return;
        }

        setIsSaving(true);

        try {
            // Determine which date/time to use
            const dateStr = isManualEntry ? manualDate : scanDate;
            const timeStr = isManualEntry ? manualTime : scanTime;

            let capturedAt: Date;
            if (dateStr && timeStr) {
                capturedAt = new Date(`${dateStr}T${timeStr}`);
                if (isNaN(capturedAt.getTime())) capturedAt = new Date();
            } else if (dateStr) {
                capturedAt = new Date(dateStr);
                if (isNaN(capturedAt.getTime())) capturedAt = new Date();
            } else {
                capturedAt = new Date();
            }

            const photoToSave = isManualEntry ? currentPhotoUri : scanPhotoUri;
            const activeLocation = isManualEntry ? manualGpsLocation : gpsLocation;

            await createEntry({
                speciesName: speciesName.trim(),
                scientificName: scientificName.trim(),
                confidenceScore: isManualEntry ? 0 : confidenceScore / 100,
                localImageUri: photoToSave,
                latitude: activeLocation?.latitude,
                longitude: activeLocation?.longitude,
                locationName: activeLocation
                    ? `${activeLocation.latitude.toFixed(4)}°, ${activeLocation.longitude.toFixed(4)}°`
                    : undefined,
                capturedAt,
                notes: fieldNotes.trim(),
                tags: parsedTags,
                behaviorObserved: behavior.trim(),
                quantity: parseInt(quantity, 10) || 1,
                habitatType: habitat.trim(),
                animalClass: animalClass || 'Other',
                detectionSource: isManualEntry ? 'manual' : (routeParams?.detectionSource ?? 'offline'),
            });

            showAlert(
                'Entry Saved',
                `${speciesName} has been added to your journal.`,
                [
                    {
                        text: 'View Archive',
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
            <StatusBar
                barStyle={isDarkMode ? 'light-content' : 'dark-content'}
                backgroundColor={theme.background}
            />

            {/* Header */}
            <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
                <TouchableOpacity
                    style={[styles.backButton, { backgroundColor: theme.border }]}
                    onPress={onBack}
                    activeOpacity={0.7}
                >
                    <Text style={[styles.backArrow, { color: theme.text }]}>‹</Text>
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.text }]}>
                    {isManualEntry ? 'New Journal Entry' : 'New Journal Entry'}
                </Text>
                <View style={styles.headerRight} />
            </View>

            {/* Draft banner — scan flow offline draft */}
            {!isManualEntry && isDraft && (
                <View style={styles.draftBanner}>
                    <FontAwesome6 name="triangle-exclamation" size={14} color="#92400E" style={{ marginRight: 8 }} />
                    <Text style={styles.draftBannerText}>
                        Draft — species identification is pending verification. You can edit the details and save now, or update later once online.
                    </Text>
                </View>
            )}

            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
            >
                {/* ============================================ */}
                {/* IMAGE SECTION */}
                {/* ============================================ */}
                {isManualEntry ? (
                    /* Manual mode — tappable image picker */
                    <View style={styles.previewSection}>
                        <TouchableOpacity
                            style={[styles.imageContainer, { backgroundColor: theme.border }]}
                            onPress={() => setShowImageOptions(true)}
                            activeOpacity={0.8}
                        >
                            {currentPhotoUri ? (
                                <Image
                                    source={{ uri: currentPhotoUri }}
                                    style={styles.previewImage}
                                    resizeMode="cover"
                                />
                            ) : (
                                <View style={[styles.placeholderImage, { backgroundColor: theme.border }]}>
                                    <FontAwesome6 name="camera" size={40} color={theme.textSecondary} />
                                    <Text style={[styles.placeholderText, { color: theme.textSecondary }]}>
                                        Tap to add photo
                                    </Text>
                                </View>
                            )}
                            {/* Edit overlay when photo is set */}
                            {currentPhotoUri ? (
                                <View style={styles.imageEditOverlay}>
                                    <FontAwesome6 name="pen" size={14} color="#FFFFFF" />
                                </View>
                            ) : null}
                        </TouchableOpacity>

                        {/* Pick buttons */}
                        <View style={styles.imageButtonRow}>
                            <TouchableOpacity
                                style={[styles.imageButton, { backgroundColor: theme.card, borderColor: theme.border }]}
                                onPress={handleCapturePhoto}
                                activeOpacity={0.75}
                            >
                                <FontAwesome6 name="camera" size={16} color="#059669" style={{ marginRight: 6 }} />
                                <Text style={[styles.imageButtonText, { color: theme.text }]}>Camera</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.imageButton, { backgroundColor: theme.card, borderColor: theme.border }]}
                                onPress={handlePickFromGallery}
                                activeOpacity={0.75}
                            >
                                <FontAwesome6 name="image" size={16} color="#059669" style={{ marginRight: 6 }} />
                                <Text style={[styles.imageButtonText, { color: theme.text }]}>Gallery</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ) : (
                    /* Scan flow — read-only image preview */
                    <View style={styles.previewSection}>
                        <View style={[styles.imageContainer, { backgroundColor: theme.border }]}>
                            {scanPhotoUri ? (
                                <Image
                                    source={{ uri: scanPhotoUri }}
                                    style={styles.previewImage}
                                    resizeMode="cover"
                                />
                            ) : (
                                <View style={[styles.placeholderImage, { backgroundColor: theme.border }]}>
                                    <FontAwesome6 name="camera" size={48} color={theme.textSecondary} />
                                </View>
                            )}
                            {confidenceScore > 0 && (
                                <View style={styles.confidenceBadge}>
                                    <Text style={styles.confidenceBadgeText}>{confidenceScore}%</Text>
                                </View>
                            )}
                        </View>
                        <Text style={[styles.previewLabel, { color: theme.textSecondary }]}>Species Preview</Text>
                    </View>
                )}

                {/* ============================================ */}
                {/* OBSERVATION DATA */}
                {/* ============================================ */}
                {isManualEntry ? (
                    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <Text style={[styles.cardTitle, { color: theme.text }]}>Observation Date & Time</Text>
                        <Text style={[styles.cardSubtitle, { color: theme.textSecondary }]}>Enter when you observed this animal</Text>

                        <View style={styles.dateTimeRow}>
                            <View style={styles.dateField}>
                                <Text style={[styles.label, { color: theme.text }]}>Date</Text>
                                <TextInput
                                    style={[styles.input, { backgroundColor: theme.border, borderColor: theme.border, color: theme.text }]}
                                    value={manualDate}
                                    onChangeText={setManualDate}
                                    placeholder="YYYY-MM-DD"
                                    placeholderTextColor={theme.textSecondary}
                                    keyboardType="numbers-and-punctuation"
                                    maxLength={10}
                                />
                            </View>
                            <View style={styles.timeField}>
                                <Text style={[styles.label, { color: theme.text }]}>Time</Text>
                                <TextInput
                                    style={[styles.input, { backgroundColor: theme.border, borderColor: theme.border, color: theme.text }]}
                                    value={manualTime}
                                    onChangeText={setManualTime}
                                    placeholder="HH:MM"
                                    placeholderTextColor={theme.textSecondary}
                                    keyboardType="numbers-and-punctuation"
                                    maxLength={5}
                                />
                            </View>
                        </View>
                    </View>
                ) : (
                    /* Scan flow — read-only observation card */
                    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <Text style={[styles.cardTitle, { color: theme.text }]}>Observation Data</Text>
                        <Text style={[styles.cardSubtitle, { color: theme.textSecondary }]}>Auto-captured • Read only</Text>

                        <View style={styles.dataRow}>
                            <View style={[styles.dataIcon, { backgroundColor: theme.accentLight }]}>
                                <FontAwesome6 name="calendar" size={18} color="#059669" />
                            </View>
                            <View style={styles.dataContent}>
                                <Text style={[styles.dataValue, { color: theme.text }]}>{scanDate || 'Not recorded'}</Text>
                                <Text style={[styles.dataLabel, { color: theme.textSecondary }]}>Date observed</Text>
                            </View>
                        </View>

                        <View style={[styles.dataDivider, { backgroundColor: theme.border }]} />

                        <View style={styles.dataRow}>
                            <View style={[styles.dataIcon, { backgroundColor: theme.accentLight }]}>
                                <FontAwesome6 name="clock" size={18} color="#059669" iconStyle="regular" />
                            </View>
                            <View style={styles.dataContent}>
                                <Text style={[styles.dataValue, { color: theme.text }]}>{scanTime || 'Not recorded'}</Text>
                                <Text style={[styles.dataLabel, { color: theme.textSecondary }]}>Time observed</Text>
                            </View>
                        </View>

                        <View style={[styles.dataDivider, { backgroundColor: theme.border }]} />

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
                )}

                {/* Manual entry location card — placed outside ternary */}
                {isManualEntry && (
                    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <View style={styles.locationHeader}>
                            <View style={[styles.locationIconBox, { backgroundColor: theme.accentLight }]}>
                                <FontAwesome6 name="location-dot" size={16} color="#059669" />
                            </View>
                            <View style={styles.locationHeaderText}>
                                <Text style={[styles.cardTitle, styles.locationTitle, { color: theme.text }]}>GPS Location</Text>
                                <Text style={[styles.cardSubtitle, { color: theme.textSecondary }]}>
                                    {locationStatus === 'fetching' && 'Detecting your location…'}
                                    {locationStatus === 'granted' && 'Location captured'}
                                    {locationStatus === 'denied' && 'Location not available'}
                                    {locationStatus === 'idle' && 'Optional'}
                                </Text>
                            </View>
                            {locationStatus === 'denied' && (
                                <TouchableOpacity
                                    style={styles.locationRetryBtn}
                                    onPress={fetchManualLocation}
                                    activeOpacity={0.7}
                                >
                                    <Text style={styles.locationRetryText}>Retry</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        {locationStatus === 'fetching' && (
                            <View style={styles.locationStatusRow}>
                                <ActivityIndicator size="small" color="#059669" style={{ marginRight: 8 }} />
                                <Text style={[styles.locationStatusText, { color: theme.textSecondary }]}>
                                    Fetching coordinates…
                                </Text>
                            </View>
                        )}

                        {locationStatus === 'granted' && manualGpsLocation && (
                            <View style={[styles.locationResult, { backgroundColor: theme.accentLight }]}>
                                <Text style={styles.locationCoords}>
                                    {formatCoordinates(manualGpsLocation)}
                                </Text>
                            </View>
                        )}

                        {locationStatus === 'denied' && (
                            <View style={styles.locationStatusRow}>
                                <FontAwesome6 name="circle-exclamation" size={13} color="#D97706" style={{ marginRight: 6 }} />
                                <Text style={[styles.locationStatusText, { color: theme.textSecondary }]}>
                                    Location unavailable. Entry will be saved without GPS.{' '}
                                    <Text
                                        style={styles.locationSettingsLink}
                                        onPress={() =>
                                            Platform.OS === 'ios'
                                                ? Linking.openURL('app-settings:')
                                                : Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS')
                                        }
                                    >
                                        Open Settings
                                    </Text>
                                </Text>
                            </View>
                        )}
                    </View>
                )}

                {/* ============================================ */}
                {/* SPECIES INFORMATION FORM */}
                {/* ============================================ */}
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Species Information</Text>

                {/* Animal Name (required) */}
                <View style={styles.inputGroup}>
                    <Text style={[styles.label, { color: theme.text }]}>
                        Animal Name <Text style={styles.required}>*</Text>
                    </Text>
                    <TextInput
                        style={[styles.input, { backgroundColor: theme.border, borderColor: theme.border, color: theme.text }]}
                        value={speciesName}
                        onChangeText={setSpeciesName}
                        placeholder="e.g., Red-tailed Hawk"
                        placeholderTextColor={theme.textSecondary}
                    />
                </View>

                {/* Scientific Name */}
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

                {/* Class of Animal */}
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

                {/* Quantity */}
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

                {/* Field Notes */}
                <View style={styles.inputGroup}>
                    <Text style={[styles.label, { color: theme.text }]}>Field Notes</Text>
                    <TextInput
                        style={[
                            styles.input,
                            styles.textArea,
                            {
                                height: Math.max(MIN_NOTES_HEIGHT, Math.min(notesHeight, MAX_NOTES_HEIGHT)),
                                backgroundColor: theme.border,
                                borderColor: theme.border,
                                color: theme.text,
                            },
                        ]}
                        value={fieldNotes}
                        onChangeText={setFieldNotes}
                        placeholder="Additional observations, environmental conditions, weather..."
                        placeholderTextColor={theme.textSecondary}
                        multiline
                        textAlignVertical="top"
                        scrollEnabled={notesHeight >= MAX_NOTES_HEIGHT}
                        onContentSizeChange={(event) => {
                            setNotesHeight(event.nativeEvent.contentSize.height + 28);
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
                {/* BUTTONS */}
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
                                    {isManualEntry ? 'Submit Entry' : 'Save Entry'}
                                </Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>

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
                        <Text style={[styles.dropdownTitle, { color: theme.text, borderBottomColor: theme.border }]}>
                            Select Class of Animal
                        </Text>

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
                                    <FontAwesome6
                                        name={option.icon}
                                        size={22}
                                        color={animalClass === option.value ? '#059669' : theme.textSecondary}
                                        style={styles.dropdownOptionIcon}
                                    />
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

            {/* ============================================ */}
            {/* IMAGE OPTIONS MODAL (manual mode) */}
            {/* ============================================ */}
            <Modal
                visible={showImageOptions}
                transparent
                animationType="fade"
                onRequestClose={() => setShowImageOptions(false)}
            >
                <Pressable style={styles.modalOverlay} onPress={() => setShowImageOptions(false)}>
                    <View style={[styles.dropdownMenu, { backgroundColor: theme.card }]}>
                        <Text style={[styles.dropdownTitle, { color: theme.text, borderBottomColor: theme.border }]}>
                            Add Photo
                        </Text>

                        <TouchableOpacity
                            style={styles.dropdownOption}
                            onPress={handleCapturePhoto}
                            activeOpacity={0.7}
                        >
                            <View style={styles.dropdownOptionLeft}>
                                <FontAwesome6 name="camera" size={22} color="#059669" style={styles.dropdownOptionIcon} />
                                <Text style={[styles.dropdownOptionText, { color: theme.text }]}>Capture Photo</Text>
                            </View>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.dropdownOption}
                            onPress={handlePickFromGallery}
                            activeOpacity={0.7}
                        >
                            <View style={styles.dropdownOptionLeft}>
                                <FontAwesome6 name="image" size={22} color="#059669" style={styles.dropdownOptionIcon} />
                                <Text style={[styles.dropdownOptionText, { color: theme.text }]}>Upload from Gallery</Text>
                            </View>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.dropdownCancel, { borderTopColor: theme.border }]}
                            onPress={() => setShowImageOptions(false)}
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
    },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'ios' ? 56 : 40,
        paddingBottom: 16,
        borderBottomWidth: 1,
    },
    backButton: {
        width: 44,
        height: 44,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    backArrow: {
        fontSize: 28,
        fontWeight: '300',
        marginTop: -2,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
    },
    headerRight: {
        width: 44,
    },

    // Banners
    draftBanner: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: '#FEF3C7',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#FCD34D',
    },
    draftBannerText: {
        flex: 1,
        fontSize: 13,
        color: '#92400E',
        lineHeight: 18,
    },

    // Scroll
    scrollContent: {
        padding: 20,
    },

    // Image Section
    previewSection: {
        alignItems: 'center',
        marginBottom: 24,
    },
    imageContainer: {
        width: 160,
        height: 160,
        borderRadius: 20,
        overflow: 'hidden',
        marginBottom: 12,
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
        gap: 8,
    },
    placeholderText: {
        fontSize: 13,
        fontWeight: '500',
        marginTop: 4,
    },
    imageEditOverlay: {
        position: 'absolute',
        bottom: 8,
        right: 8,
        backgroundColor: 'rgba(0,0,0,0.55)',
        borderRadius: 16,
        width: 28,
        height: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },
    imageButtonRow: {
        flexDirection: 'row',
        gap: 12,
    },
    imageButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1,
    },
    imageButtonText: {
        fontSize: 14,
        fontWeight: '600',
    },
    previewLabel: {
        fontSize: 13,
        fontWeight: '500',
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

    // Cards
    card: {
        borderRadius: 16,
        borderWidth: 1,
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
        marginBottom: 2,
    },
    cardSubtitle: {
        fontSize: 12,
        marginBottom: 16,
    },

    // Date/Time row (manual mode)
    dateTimeRow: {
        flexDirection: 'row',
        gap: 12,
    },
    dateField: {
        flex: 2,
    },
    timeField: {
        flex: 1,
    },

    // Read-only data rows (scan flow)
    dataRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
    },
    dataIcon: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    dataIconInactive: {
        backgroundColor: '#F3F4F6',
    },
    dataContent: {
        flex: 1,
    },
    dataValue: {
        fontSize: 15,
        fontWeight: '600',
        marginBottom: 2,
    },
    dataLabel: {
        fontSize: 12,
    },
    dataDivider: {
        height: 1,
        marginLeft: 54,
    },

    // Section title
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 16,
    },

    // Form inputs
    inputGroup: {
        marginBottom: 20,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 8,
    },
    required: {
        color: '#DC2626',
    },
    input: {
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 16,
        borderWidth: 1,
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
        marginTop: 6,
        marginLeft: 4,
    },

    // Dropdown trigger
    dropdownTrigger: {
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderWidth: 1,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    dropdownText: {
        fontSize: 16,
    },

    // Buttons
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
        elevation: 0,
    },
    // Modals
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    dropdownMenu: {
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
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
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
        marginRight: 14,
    },
    dropdownOptionText: {
        fontSize: 16,
    },
    dropdownOptionTextSelected: {
        color: '#059669',
        fontWeight: '600',
    },
    dropdownCancel: {
        borderTopWidth: 1,
        marginTop: 8,
        paddingVertical: 16,
        alignItems: 'center',
    },
    dropdownCancelText: {
        fontSize: 16,
        fontWeight: '600',
    },

    // Location card
    locationHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    locationIconBox: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    locationHeaderText: {
        flex: 1,
    },
    locationTitle: {
        marginBottom: 0,
        fontSize: 15,
    },
    locationRetryBtn: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        backgroundColor: '#ECFDF5',
    },
    locationRetryText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#059669',
    },
    locationStatusRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingTop: 4,
    },
    locationStatusText: {
        flex: 1,
        fontSize: 13,
        lineHeight: 18,
    },
    locationResult: {
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 10,
        marginTop: 4,
    },
    locationCoords: {
        fontSize: 14,
        fontWeight: '600',
        color: '#059669',
        fontVariant: ['tabular-nums'],
    },
    locationSettingsLink: {
        color: '#059669',
        fontWeight: '600',
        textDecorationLine: 'underline',
    },
});

export default NewJournalEntryScreen;
