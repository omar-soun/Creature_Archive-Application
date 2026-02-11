import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    StatusBar,
    TouchableOpacity,
    Platform,
    Dimensions,
    Image,
    ScrollView,
    Alert,
    ActivityIndicator,
} from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import useSpeciesDetection, { getStageText } from '../hooks/useSpeciesDetection';
import { useTheme } from '../context/ThemeContext';

/**
 * ============================================
 * OBSERVATION DETAILS SCREEN
 * ============================================
 * 
 * SCREEN LOGIC FLOW:
 * 1. On mount: Auto-capture current date & time (mandatory)
 * 2. On mount: Attempt single GPS fetch (non-blocking, optional)
 * 3. GPS refresh button: Manual re-fetch on user tap
 * 4. Save: Works regardless of GPS availability
 * 
 * UI BEHAVIOR:
 * - Date/Time: Always displayed, auto-filled on screen open
 * - GPS: Shows coordinates if available, "No GPS data" if not
 * - Refresh icon next to GPS field for manual retry
 * - No loading spinners, no blocking, no error popups
 * 
 * PLATFORM AGNOSTIC:
 * - Uses @react-native-community/geolocation (works on iOS & Android)
 * - Graceful fallback when GPS unavailable
 */

interface IdentificationResultScreenProps {
    onNavigate: (route: any, params?: any) => void;
    onBack: () => void;
    photoUri?: string;
    location?: { latitude: number; longitude: number } | null;
    timestamp?: string;
}

interface LocationData {
    latitude: number;
    longitude: number;
}

const { width } = Dimensions.get('window');

const IdentificationResultScreen: React.FC<IdentificationResultScreenProps> = ({
    onNavigate,
    onBack,
    photoUri,
    location: initialLocation,
    timestamp,
}) => {
    // ============================================
    // THEME
    // ============================================
    const { isDarkMode, theme } = useTheme();

    // ============================================
    // SPECIES DETECTION HOOK
    // ============================================
    const { detect, isDetecting, stage, result, error, reset } = useSpeciesDetection();

    // ============================================
    // DATE & TIME STATE (Auto-filled on mount)
    // ============================================
    const [observationDate, setObservationDate] = useState<string>('');
    const [observationTime, setObservationTime] = useState<string>('');

    // ============================================
    // GPS STATE (Optional, with refresh)
    // ============================================
    const [gpsLocation, setGpsLocation] = useState<LocationData | null>(initialLocation || null);
    const [isRefreshingGps, setIsRefreshingGps] = useState(false);

    // Track if initial GPS fetch attempted
    const gpsAttempted = useRef(false);

    // ============================================
    // AUTO-FILL DATE & TIME ON MOUNT
    // ============================================
    useEffect(() => {
        const now = new Date();

        // Format date: "January 15, 2025"
        const dateOptions: Intl.DateTimeFormatOptions = {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        };
        setObservationDate(now.toLocaleDateString('en-US', dateOptions));

        // Format time: "2:34 PM"
        const timeOptions: Intl.DateTimeFormatOptions = {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        };
        setObservationTime(now.toLocaleTimeString('en-US', timeOptions));
    }, []);

    // ============================================
    // RUN SPECIES DETECTION WHEN photoUri CHANGES
    // ============================================
    useEffect(() => {
        if (!photoUri) return;

        // Reset detection state when a new photo is provided
        reset();

        const runDetection = async () => {
            try {
                console.log('[Detection] Starting detection for:', photoUri);
                await detect(photoUri);
            } catch (err) {
                // Error is already stored in the hook state
                console.log('Detection failed:', err);
            }
        };

        runDetection();
    }, [photoUri]); // Only depend on photoUri - run detection whenever it changes

    // ============================================
    // SINGLE GPS FETCH ON MOUNT (Non-blocking)
    // ============================================
    useEffect(() => {
        // Skip if we already have location from props or already attempted
        if (initialLocation || gpsAttempted.current) return;

        gpsAttempted.current = true;
        fetchGpsOnce();
    }, []);

    // ============================================
    // GPS FETCH FUNCTION (Used for initial & refresh)
    // ============================================
    const fetchGpsOnce = () => {
        Geolocation.getCurrentPosition(
            (position) => {
                setGpsLocation({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                });
                setIsRefreshingGps(false);
            },
            (error) => {
                // Silent fail - just set to null, no error popup
                console.log('GPS fetch failed:', error.message);
                setGpsLocation(null);
                setIsRefreshingGps(false);
            },
            {
                enableHighAccuracy: false,
                timeout: 5000, // 5 second timeout, then fail silently
                maximumAge: 30000, // Accept cached location up to 30 seconds old
            }
        );
    };

    // ============================================
    // MANUAL GPS REFRESH (User-triggered)
    // ============================================
    const handleRefreshGps = () => {
        if (isRefreshingGps) return; // Prevent multiple simultaneous requests

        setIsRefreshingGps(true);
        fetchGpsOnce();
    };

    // ============================================
    // FORMAT GPS COORDINATES
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
    // IDENTIFICATION DATA (From AI model or loading state)
    // ============================================
    const identificationData = result
        ? {
            commonName: result.commonName,
            scientificName: result.scientificName,
            confidenceScore: result.confidenceScore,
        }
        : {
            commonName: 'Analyzing...',
            scientificName: 'Please wait',
            confidenceScore: 0,
        };

    const getConfidenceInfo = (score: number) => {
        if (score >= 90) return { text: 'High confidence identification', color: '#059669' };
        if (score >= 70) return { text: 'Moderate confidence identification', color: '#D97706' };
        return { text: 'Low confidence - verify manually', color: '#DC2626' };
    };

    const confidenceInfo = getConfidenceInfo(identificationData.confidenceScore);

    // ============================================
    // RETRY DETECTION
    // ============================================
    const handleRetryDetection = async () => {
        if (!photoUri) return;
        reset();
        try {
            console.log('[Detection] Retrying detection for:', photoUri);
            await detect(photoUri);
        } catch (err) {
            console.log('Retry detection failed:', err);
        }
    };

    // ============================================
    // SAVE HANDLER - Navigate to New Entry Form
    // ============================================
    const handleSave = () => {
        // Prepare data to pass to NewJournalEntryScreen
        const entryData = {
            speciesCommonName: identificationData.commonName,
            speciesScientificName: identificationData.scientificName,
            confidenceScore: identificationData.confidenceScore,
            photoUri: photoUri,
            observationDate: observationDate,
            observationTime: observationTime,
            gpsLocation: gpsLocation,
        };

        console.log('Proceeding to new entry form:', entryData);

        // Navigate to New Journal Entry screen for review & additional details
        onNavigate('NewEntry', entryData);
    };

    const handleRescan = () => onBack();

    // ============================================
    // RENDER
    // ============================================
    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />

            {/* Header */}
            <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
                <TouchableOpacity style={[styles.backButton, { backgroundColor: theme.border }]} onPress={onBack}>
                    <Text style={[styles.backArrow, { color: theme.text }]}>‹</Text>
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.text }]}>Observation Details</Text>
                <View style={styles.headerRight} />
            </View>

            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Hero Image */}
                <View style={[styles.heroContainer, { backgroundColor: theme.card }]}>
                    {photoUri ? (
                        <Image source={{ uri: photoUri }} style={styles.heroImage} resizeMode="cover" />
                    ) : (
                        <View style={[styles.heroPlaceholder, { backgroundColor: theme.accentLight }]}>
                            <Text style={styles.heroPlaceholderIcon}>📷</Text>
                            <Text style={styles.heroPlaceholderText}>No image</Text>
                        </View>
                    )}
                    {/* Show badge only when detection is complete */}
                    {result && (
                        <View style={[styles.imageBadge, { backgroundColor: confidenceInfo.color }]}>
                            <Text style={styles.imageBadgeText}>{identificationData.confidenceScore}% Match</Text>
                        </View>
                    )}
                    {/* Show loading overlay while detecting */}
                    {isDetecting && (
                        <View style={styles.loadingOverlay}>
                            <ActivityIndicator size="large" color="#FFFFFF" />
                            <Text style={styles.loadingText}>{getStageText(stage)}</Text>
                        </View>
                    )}
                </View>

                {/* Error State */}
                {error && !isDetecting && (
                    <View style={styles.errorCard}>
                        <Text style={styles.errorIcon}>⚠️</Text>
                        <Text style={styles.errorTitle}>Detection Failed</Text>
                        <Text style={styles.errorMessage}>{error.message}</Text>
                        <TouchableOpacity
                            style={styles.retryButton}
                            onPress={handleRetryDetection}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.retryButtonText}>Try Again</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Species Title */}
                <View style={styles.titleBlock}>
                    {isDetecting ? (
                        <>
                            <View style={[styles.skeletonTitle, { backgroundColor: theme.border }]} />
                            <View style={[styles.skeletonSubtitle, { backgroundColor: theme.border }]} />
                        </>
                    ) : (
                        <>
                            <Text style={[styles.commonName, { color: theme.text }]}>{identificationData.commonName}</Text>
                            <Text style={[styles.scientificName, { color: theme.textSecondary }]}>{identificationData.scientificName}</Text>
                        </>
                    )}
                </View>

                {/* Confidence Card - Only show when we have results */}
                {result && (
                    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <View style={styles.cardHeader}>
                            <Text style={[styles.cardLabel, { color: theme.text }]}>Confidence Score</Text>
                            <Text style={[styles.confidenceValue, { color: confidenceInfo.color }]}>
                                {identificationData.confidenceScore}%
                            </Text>
                        </View>
                        <View style={[styles.progressBarBg, { backgroundColor: theme.border }]}>
                            <View
                                style={[
                                    styles.progressBarFill,
                                    { width: `${identificationData.confidenceScore}%`, backgroundColor: confidenceInfo.color },
                                ]}
                            />
                        </View>
                        <View style={styles.confidenceHelperRow}>
                            <View style={[styles.confidenceDot, { backgroundColor: confidenceInfo.color }]} />
                            <Text style={[styles.confidenceHelper, { color: theme.textSecondary }]}>{confidenceInfo.text}</Text>
                        </View>
                    </View>
                )}

                {/* Observation Details Card */}
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Observation Details</Text>
                <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    {/* Date Row - Auto-filled, Mandatory */}
                    <View style={styles.detailRow}>
                        <View style={[styles.iconCircle, { backgroundColor: theme.accentLight }]}>
                            <Text style={styles.detailIcon}>📅</Text>
                        </View>
                        <View style={styles.detailContent}>
                            <Text style={[styles.detailPrimary, { color: theme.text }]}>{observationDate || 'Loading...'}</Text>
                            <Text style={[styles.detailSecondary, { color: theme.textSecondary }]}>Date observed</Text>
                        </View>
                        <View style={[styles.autoTag, { backgroundColor: theme.accentLight }]}>
                            <Text style={styles.autoTagText}>Auto</Text>
                        </View>
                    </View>

                    <View style={[styles.divider, { backgroundColor: theme.border }]} />

                    {/* Time Row - Auto-filled, Mandatory */}
                    <View style={styles.detailRow}>
                        <View style={[styles.iconCircle, { backgroundColor: theme.accentLight }]}>
                            <Text style={styles.detailIcon}>🕐</Text>
                        </View>
                        <View style={styles.detailContent}>
                            <Text style={[styles.detailPrimary, { color: theme.text }]}>{observationTime || 'Loading...'}</Text>
                            <Text style={[styles.detailSecondary, { color: theme.textSecondary }]}>Time observed</Text>
                        </View>
                        <View style={[styles.autoTag, { backgroundColor: theme.accentLight }]}>
                            <Text style={styles.autoTagText}>Auto</Text>
                        </View>
                    </View>

                    <View style={[styles.divider, { backgroundColor: theme.border }]} />

                    {/* GPS Row - Optional with Refresh */}
                    <View style={styles.detailRow}>
                        <View style={[styles.iconCircle, { backgroundColor: theme.accentLight }, !gpsLocation && { backgroundColor: theme.border }]}>
                            <Text style={styles.detailIcon}>📍</Text>
                        </View>
                        <View style={styles.detailContent}>
                            <Text style={[styles.detailPrimary, { color: theme.text }, !gpsLocation && { color: theme.textSecondary }]}>
                                {formatCoordinates(gpsLocation)}
                            </Text>
                            <Text style={[styles.detailSecondary, { color: theme.textSecondary }]}>GPS coordinates</Text>
                        </View>
                        {/* Refresh Button */}
                        <TouchableOpacity
                            style={[styles.refreshButton, { backgroundColor: theme.border }]}
                            onPress={handleRefreshGps}
                            disabled={isRefreshingGps}
                            activeOpacity={0.7}
                        >
                            {isRefreshingGps ? (
                                <ActivityIndicator size="small" color="#059669" />
                            ) : (
                                <Text style={styles.refreshIcon}>🔄</Text>
                            )}
                        </TouchableOpacity>
                    </View>

                    {/* GPS Helper Text */}
                    {!gpsLocation && (
                        <Text style={[styles.gpsHelperText, { color: theme.textSecondary }]}>
                            Tap refresh to try getting your location
                        </Text>
                    )}
                </View>

                {/* Info Note */}
                <View style={styles.infoNote}>
                    <Text style={styles.infoNoteIcon}>💡</Text>
                    <Text style={styles.infoNoteText}>
                        Date & time are recorded automatically. GPS is optional and can be added manually.
                    </Text>
                </View>

                {/* Spacer for footer */}
                <View style={{ height: 160 }} />
            </ScrollView>

            {/* Footer Actions */}
            <View style={[styles.footer, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
                <TouchableOpacity
                    style={[styles.primaryButton, (!result || isDetecting) && styles.primaryButtonDisabled]}
                    onPress={handleSave}
                    activeOpacity={0.85}
                    disabled={!result || isDetecting}
                >
                    {isDetecting ? (
                        <>
                            <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 10 }} />
                            <Text style={styles.primaryButtonText}>Analyzing...</Text>
                        </>
                    ) : (
                        <>
                            <Text style={styles.primaryButtonIcon}>📝</Text>
                            <Text style={styles.primaryButtonText}>Write Journal</Text>
                        </>
                    )}
                </TouchableOpacity>

                <TouchableOpacity style={[styles.secondaryButton, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={handleRescan} activeOpacity={0.7}>
                    <Text style={styles.secondaryButtonIcon}>🔄</Text>
                    <Text style={[styles.secondaryButtonText, { color: theme.text }]}>Rescan</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },

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
    backArrow: { fontSize: 28, color: '#111827', fontWeight: '300', marginTop: -2 },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
    headerRight: { width: 44 },

    // Scroll Content
    scrollContent: { padding: 20 },

    // Hero Image
    heroContainer: {
        width: '100%',
        height: 220,
        borderRadius: 20,
        overflow: 'hidden',
        marginBottom: 24,
        backgroundColor: '#FFFFFF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 4,
    },
    heroImage: { width: '100%', height: '100%' },
    heroPlaceholder: {
        width: '100%',
        height: '100%',
        backgroundColor: '#E8F5E9',
        alignItems: 'center',
        justifyContent: 'center',
    },
    heroPlaceholderIcon: { fontSize: 72, marginBottom: 12 },
    heroPlaceholderText: { fontSize: 18, fontWeight: '600', color: '#059669' },

    // Loading Overlay
    loadingOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    loadingText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
        marginTop: 12,
    },

    // Error Card
    errorCard: {
        backgroundColor: '#FEF2F2',
        borderRadius: 16,
        padding: 24,
        marginBottom: 20,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#FECACA',
    },
    errorIcon: { fontSize: 40, marginBottom: 12 },
    errorTitle: { fontSize: 18, fontWeight: '700', color: '#DC2626', marginBottom: 8 },
    errorMessage: { fontSize: 14, color: '#7F1D1D', textAlign: 'center', marginBottom: 16, lineHeight: 20 },
    retryButton: {
        backgroundColor: '#DC2626',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 10,
    },
    retryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },

    // Skeleton Loading
    skeletonTitle: {
        width: '70%',
        height: 28,
        backgroundColor: '#E5E7EB',
        borderRadius: 8,
        marginBottom: 10,
    },
    skeletonSubtitle: {
        width: '50%',
        height: 20,
        backgroundColor: '#E5E7EB',
        borderRadius: 6,
    },

    imageBadge: {
        position: 'absolute',
        top: 16,
        right: 16,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
    },
    imageBadgeText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },

    // Title Block
    titleBlock: { marginBottom: 24 },
    commonName: { fontSize: 28, fontWeight: '700', color: '#111827', marginBottom: 6, letterSpacing: -0.5 },
    scientificName: { fontSize: 17, fontStyle: 'italic', color: '#6B7280' },

    // Cards
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 20,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 2,
    },
    sectionTitle: { fontSize: 18, fontWeight: '600', color: '#111827', marginBottom: 12, marginTop: 4 },

    // Confidence Card
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    cardLabel: { fontSize: 15, fontWeight: '600', color: '#374151' },
    confidenceValue: { fontSize: 20, fontWeight: '700' },
    progressBarBg: { height: 10, backgroundColor: '#E5E7EB', borderRadius: 5, marginBottom: 14, overflow: 'hidden' },
    progressBarFill: { height: '100%', borderRadius: 5 },
    confidenceHelperRow: { flexDirection: 'row', alignItems: 'center' },
    confidenceDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
    confidenceHelper: { fontSize: 14, color: '#6B7280', fontWeight: '500' },

    // Detail Rows
    detailRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
    iconCircle: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#ECFDF5',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },
    iconCircleInactive: { backgroundColor: '#F3F4F6' },
    detailIcon: { fontSize: 20 },
    detailContent: { flex: 1 },
    detailPrimary: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 3 },
    detailPrimaryInactive: { color: '#9CA3AF' },
    detailSecondary: { fontSize: 13, color: '#6B7280' },
    divider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 14, marginLeft: 60 },

    // Auto Tag
    autoTag: {
        backgroundColor: '#ECFDF5',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    autoTagText: { fontSize: 11, fontWeight: '600', color: '#059669' },

    // Refresh Button
    refreshButton: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
    },
    refreshIcon: { fontSize: 20 },

    // GPS Helper Text
    gpsHelperText: {
        fontSize: 12,
        color: '#9CA3AF',
        marginTop: 8,
        marginLeft: 60,
        fontStyle: 'italic',
    },

    // Info Note
    infoNote: {
        flexDirection: 'row',
        backgroundColor: '#FEF3C7',
        borderRadius: 12,
        padding: 14,
        marginBottom: 20,
    },
    infoNoteIcon: { fontSize: 16, marginRight: 10 },
    infoNoteText: { flex: 1, fontSize: 13, color: '#92400E', lineHeight: 18 },

    // Footer
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: Platform.OS === 'ios' ? 40 : 24,
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
        elevation: 10,
    },
    primaryButton: {
        backgroundColor: '#059669',
        borderRadius: 14,
        height: 56,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
        shadowColor: '#059669',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    primaryButtonIcon: { fontSize: 20, marginRight: 10 },
    primaryButtonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
    primaryButtonDisabled: { opacity: 0.6 },
    secondaryButton: {
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        height: 52,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: '#E5E7EB',
    },
    secondaryButtonIcon: { fontSize: 18, marginRight: 10 },
    secondaryButtonText: { color: '#374151', fontSize: 16, fontWeight: '600' },
});

export default IdentificationResultScreen;